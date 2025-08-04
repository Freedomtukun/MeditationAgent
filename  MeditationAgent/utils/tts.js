/**
 * utils/tts.js
 * ---------------------------------------------
 * Unified helper for Tencent Cloud Text‑to‑Speech (TTS) + COS caching.
 * 
 * Usage:
 *   const { synthesizeSpeech } = require("../utils/tts");
 *   const result = await synthesizeSpeech("你好，欢迎来到冥想时间。");
 *   // → { url: "https://cdn.example.com/meditation/audio/<hash>.mp3", base64: "data:audio/mpeg;base64,..." }
 * 
 * Environment variables (CloudBase → 环境变量):
 *   # --- TTS ---
 *   TTS_SECRET_ID       腾讯云语音合成 SecretId
 *   TTS_SECRET_KEY      腾讯云语音合成 SecretKey
 *   TTS_REGION          默认 ap-shanghai
 *   
 *   # --- COS ---
 *   COS_SECRET_ID       腾讯云 COS SecretId
 *   COS_SECRET_KEY      腾讯云 COS SecretKey
 *   COS_BUCKET          形如 mybucket-125xxxxxxx
 *   COS_REGION          ap-shanghai / ap-guangzhou ...
 *   COS_CDN             可选，配置自定义加速域名则返回该域名
 * ---------------------------------------------
 */

const tencentcloud = require('tencentcloud-sdk-nodejs-tts');
const COS = require('cos-nodejs-sdk-v5');
const crypto = require('crypto');

// ---------- Configuration ----------
const cfg = {
  tts: {
    secretId: process.env.TTS_SECRET_ID,
    secretKey: process.env.TTS_SECRET_KEY,
    region: process.env.TTS_REGION || 'ap-shanghai',
    defaultLang: process.env.TTS_DEFAULT_LANG || 'zh',
  },
  cos: {
    secretId: process.env.COS_SECRET_ID,
    secretKey: process.env.COS_SECRET_KEY,
    bucket: process.env.COS_BUCKET,
    region: process.env.COS_REGION,
    cdn: process.env.COS_CDN,
  },
};

// 环境变量完整性检查
if (!cfg.tts.secretId || !cfg.tts.secretKey) {
  console.error('[TTS] Missing TTS_SECRET_ID or TTS_SECRET_KEY');
}

// ---------- Init clients ----------
const ttsClient = new tencentcloud.tts.v20190823.Client({
  credential: { secretId: cfg.tts.secretId, secretKey: cfg.tts.secretKey },
  region: cfg.tts.region,
  profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } },
});

const cos = new COS({ SecretId: cfg.cos.secretId, SecretKey: cfg.cos.secretKey });

// ---------- Helpers ----------
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const buildUrl = (k) =>
  cfg.cos.cdn
    ? `${cfg.cos.cdn}/${k}`
    : `https://${cfg.cos.bucket}.cos.${cfg.cos.region}.myqcloud.com/${k}`;

// 语言映射
const langMap = { zh: 1, en: 2, ja: 3 };

// 并发去抖 Map
const pending = new Map();

// 超时工具
const timeout = (ms) => new Promise((_, reject) => 
  setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
);

// ---------- Internal synthesis ----------
async function _innerSynthesize(text, opts = {}) {
  // 参数提取与安全处理
  const voiceType = +opts.voiceType || 1001;
  const speed = clamp(+opts.speed ?? 0, -2, 2);
  const volume = clamp(+opts.volume ?? 5, 0, 10);
  const sampleRate = +opts.sampleRate || 16000;
  const primaryLanguage = langMap[opts.lang] ?? langMap[cfg.tts.defaultLang] ?? 1;

  // 缓存键包含所有参数
  const cacheKey = `meditation/audio/${md5(
    `${voiceType}_${speed}_${volume}_${sampleRate}_${primaryLanguage}_${text}`,
  )}.mp3`;

  // ---- 1. 检查 COS 缓存 ----
  if (cfg.cos.bucket && cfg.cos.region) {
    try {
      await cos.headObject({ Bucket: cfg.cos.bucket, Region: cfg.cos.region, Key: cacheKey });
      const url = buildUrl(cacheKey);
      console.info('[TTS] Cache hit', { key: cacheKey });
      return { url };
    } catch (e) {
      // 处理各种 NoSuchKey 错误格式
      if (!['NoSuchKey', 'NotFound', 404].includes(e.code || e.statusCode)) {
        console.error('[TTS] headObject error', e);
      }
      // 继续合成，不中断流程
    }
  }

  // ---- 2. TTS 合成（带重试） ----
  console.info('[TTS] Synthesizing', { 
    textLen: text.length, 
    voiceType, 
    speed, 
    volume,
    lang: primaryLanguage 
  });
  
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ttsPromise = ttsClient.TextToVoice({
        Text: text,
        VoiceType: voiceType,
        Codec: 'mp3',
        ModelType: 1,
        PrimaryLanguage: primaryLanguage,
        SampleRate: sampleRate,
        Speed: speed,
        Volume: volume,
        SessionId: md5(text).slice(0, 32), // 安全的 SessionId
      });
      
      // 15秒超时保护
      const { Audio } = await Promise.race([ttsPromise, timeout(15000)]);
      
      const buffer = Buffer.from(Audio, 'base64');
      const base64 = `data:audio/mpeg;base64,${buffer.toString('base64')}`;

      // ---- 3. 尝试上传 COS（带重试） ----
      if (cfg.cos.bucket && cfg.cos.region) {
        for (let cosAttempt = 0; cosAttempt < 2; cosAttempt++) {
          try {
            await cos.putObject({
              Bucket: cfg.cos.bucket,
              Region: cfg.cos.region,
              Key: cacheKey,
              Body: buffer,
              ContentType: 'audio/mpeg',
              ACL: 'public-read',
            });
            console.info('[TTS] Uploaded to COS', { key: cacheKey });
            return {
              url: buildUrl(cacheKey),
              base64,
            };
          } catch (e) {
            lastError = e;
            if (cosAttempt === 0) {
              console.warn('[TTS] COS upload retry', e.message);
              continue;
            }
            console.error('[TTS] putObject failed after retry', e);
            // COS 失败也不中断，返回 base64
          }
        }
      }

      // 无 COS 或上传失败时，仅返回 base64
      console.info('[TTS] Returning base64 only (no COS)');
      return { base64 };
      
    } catch (e) {
      lastError = e;
      if (attempt === 0) {
        console.warn('[TTS] TTS retry', e.message);
        continue;
      }
    }
  }
  
  console.error('[TTS] Synthesis failed after retry', lastError);
  throw new Error(`[TTS] 合成失败: ${lastError.message}`);
}

// ---------- Main Export ----------
/**
 * @param {string} text  文本，≤ 1000 汉字/4000 英文字符
 * @param {object} opts  可选参数 { voiceType, speed, volume, sampleRate, lang, hq }
 * @returns {Promise<{url?: string, base64?: string}>} 返回 URL 和/或 Base64
 */
async function synthesizeSpeech(text, opts = {}) {
  // 参数校验
  if (!text || typeof text !== 'string') {
    throw new Error('[TTS] text 不能为空');
  }
  
  // 严谨的字节长度检查
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > 2000) {
    throw new Error(`[TTS] text 超长（${byteLength} 字节，限制 2000 字节）`);
  }

  // 字符合法性警告（宽松匹配）
  if (!/^[\u0000-\u007f\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\s]+$/.test(text)) {
    console.warn('[TTS] 文本可能包含特殊字符或 emoji');
  }

  // HQ 模式自动选择采样率
  if (opts.hq && !opts.sampleRate) {
    opts.sampleRate = 16000;
  }

  // 构建完整缓存键用于去重
  const fullOpts = {
    voiceType: +opts.voiceType || 1001,
    speed: clamp(+opts.speed ?? 0, -2, 2),
    volume: clamp(+opts.volume ?? 5, 0, 10),
    sampleRate: +opts.sampleRate || 16000,
    lang: opts.lang || 'zh',
  };
  
  const cacheKey = md5(
    `${fullOpts.voiceType}_${fullOpts.speed}_${fullOpts.volume}_${fullOpts.sampleRate}_${fullOpts.lang}_${text}`
  );

  // 并发去重
  if (pending.has(cacheKey)) {
    console.info('[TTS] Reusing pending request', { cacheKey });
    return pending.get(cacheKey);
  }

  const task = _innerSynthesize(text, fullOpts).finally(() => {
    pending.delete(cacheKey);
  });
  
  pending.set(cacheKey, task);
  return task;
}

module.exports = { synthesizeSpeech };