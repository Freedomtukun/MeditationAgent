/**
 * config.js
 * =========================================
 * 冥想智能体全局配置
 * - 统一读取环境变量
 * - 定义默认值、常量、错误码
 * - 供所有模块单点依赖
 * -----------------------------------------
 * 更新日期：2025-07-25
 */

const cfg = {
  /* ---------- 混元大模型 ---------- */
  // 建议在函数环境变量里填写：HUNYUAN_API_KEY=<Server-Token>
  HUNYUAN_API_KEY : process.env.HUNYUAN_API_KEY || '',

  // 如果以后官方再次迭代域名，仅需改一处
  DEFAULT_ENDPOINT: 'https://api.hunyuan.cloud.tencent.com/v1',   // ✅ 新公网域名
  HUNYUAN_ENDPOINT: process.env.HUNYUAN_ENDPOINT,                 // 可覆盖
  DEFAULT_MODEL   : process.env.HUNYUAN_MODEL   || 'hunyuan-lite',

  /* ---------- 腾讯云通用密钥（若使用 SDK） ---------- */
  TC_SECRET_ID  : process.env.TC_SECRET_ID  || '',
  TC_SECRET_KEY : process.env.TC_SECRET_KEY || '',

  /* ---------- 日志 & 环境 ---------- */
  NODE_ENV  : process.env.NODE_ENV  || 'production',
  LOG_LEVEL : process.env.LOG_LEVEL || 'info',          // debug | info | warn | error

  /* ---------- 功能开关 ---------- */
  ENABLE_ANALYTICS        : process.env.ENABLE_ANALYTICS        === 'true', // 使用量上报
  STRICT_TOPIC_VALIDATION : process.env.STRICT_TOPIC_VALIDATION === 'true', // 主题白名单

  /* ---------- 调用配额 ---------- */
  MAX_DAILY_CALLS : Number(process.env.MAX_DAILY_CALLS || 500),  // 单函数每日额度

  /* ---------- TTS 默认 ---------- */
  DEFAULT_VOICE_TYPE : 'zh-CN-XiaoyouNeural',
  DEFAULT_SPEED      : 0.85,
  DEFAULT_VOLUME     : 0,
  DEFAULT_FORMAT     : 'mp3',

  /* ---------- 冥想文案参数 ---------- */
  MIN_DURATION     : 3,
  MAX_DURATION     : 60,
  DEFAULT_DURATION : 10,
  WORDS_PER_MINUTE : 175,
  TOKENS_PER_WORD  : 1.5,
  TOKEN_BUFFER     : 1.2,

  /* ---------- 语音映射 ---------- */
  TOPIC_VOICE_MAP : {
    '助眠':     'zh-CN-XiaoyouNeural',
    '晨间唤醒': 'zh-CN-YunyangNeural',
    '儿童冥想': 'zh-CN-XiaoxiaoNeural'
  },
  STYLE_VOICE_MAP : {
    gentle : 'zh-CN-XiaoyouNeural',
    healing: 'zh-CN-YunxiNeural',
    mindful: 'zh-CN-XiaoxiaoNeural',
    zen    : 'zh-CN-YunzeNeural',
    nature : 'zh-CN-XiaoyouNeural',
    modern : 'zh-CN-YunyangNeural'
  },

  /* ---------- 语言 & 错误码 ---------- */
  SUPPORTED_LANGUAGES: ['zh', 'en'],

  ERROR_CODES: {
    NO_API_KEY          : 'LLM_CONFIG_NO_KEY',
    EMPTY_RESPONSE      : 'LLM_RESPONSE_EMPTY',
    HTTP_ERROR          : 'LLM_HTTP_ERROR',
    INVALID_LANGUAGE    : 'PARAM_INVALID_LANGUAGE',
    INVALID_DURATION    : 'PARAM_INVALID_DURATION',
    INVALID_TOPIC       : 'PARAM_INVALID_TOPIC',
    LLM_FAILED          : 'LLM_CALL_FAILED',
    TTS_FAILED          : 'TTS_SYNTHESIS_FAILED',
    EMPTY_CONTENT       : 'LLM_CONTENT_EMPTY',
    MEDITATION_GENERATION_ERROR: 'MEDITATION_GENERATION_ERROR'
  }
};

/* -------- 工具：安全获取最终 Endpoint -------- */
cfg.getEndpoint = () => cfg.HUNYUAN_ENDPOINT || cfg.DEFAULT_ENDPOINT;

/* 冻结对象，防止运行时被意外修改 */
module.exports = Object.freeze(cfg);
