/**
 * 冥想内容生成路由
 * 整合 prompt 生成、LLM 调用、语音合成的完整流程
 */

const meditationPrompt = require('../utils/meditation_prompt');
const callLLM = require('../utils/call_llm');
const tts = require('../utils/tts');
const config = require('../config');

/**
 * 生成冥想引导内容（文字 + 语音）
 * @param {Object} params - 请求参数
 * @param {string} params.topic - 冥想主题（如：助眠、缓解焦虑、身体扫描等）
 * @param {string} params.style - 引导风格（如：gentle、healing、mindful等）
 * @param {number} params.duration - 时长（分钟，默认10）
 * @param {string} params.language - 语言（zh/en，默认zh）
 * @param {Object} params.options - 可选配置参数
 * @returns {Promise<Object>} 返回 { success, data: { text, audioUrl }, error }
 */
async function generateMeditation({
  topic = '基础放松',
  style = 'gentle',
  duration = 10,
  language = 'zh',
  options = {}
} = {}) {
  try {
    // 1. 参数验证
    const validation = validateParams({ topic, style, duration, language });
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // 2. 构建 Prompt
    console.log(`[GenerateMeditation] 开始生成 - 主题: ${topic}, 风格: ${style}, 时长: ${duration}分钟`);
    
    const prompt = meditationPrompt.buildPrompt({
      topic,
      style,
      duration,
      language,
      customization: options.customization || {}
    });

    // 3. 调用 LLM 生成文本
    console.log('[GenerateMeditation] 调用 LLM 生成冥想引导词...');
    
    const llmResponse = await callLLM({
      prompt,
      model: options.model || config.DEFAULT_LLM_MODEL || 'claude-3-sonnet',
      temperature: options.temperature || 0.7,
      maxTokens: calculateMaxTokens(duration)
    });

    if (!llmResponse.success) {
      throw new Error(`LLM 调用失败: ${llmResponse.error}`);
    }

    const meditationText = llmResponse.data.content;
    console.log('[GenerateMeditation] LLM 生成完成，文本长度:', meditationText.length);

    // 4. 生成语音（仅中文支持 TTS）
    let audioUrl = null;
    if (language === 'zh' && !options.skipAudio) {
      console.log('[GenerateMeditation] 开始生成语音...');
      
      const ttsResponse = await tts({
        text: meditationText,
        voiceType: options.voiceType || getVoiceTypeByStyle(style),
        speed: options.speed || 0.9, // 冥想语速稍慢
        volume: options.volume || 0
      });

      if (ttsResponse.success) {
        audioUrl = ttsResponse.data.audioUrl;
        console.log('[GenerateMeditation] 语音生成成功');
      } else {
        console.warn('[GenerateMeditation] 语音生成失败:', ttsResponse.error);
        // 语音生成失败不影响文本返回
      }
    }

    // 5. 返回结果
    const result = {
      success: true,
      data: {
        text: meditationText,
        audioUrl,
        metadata: {
          topic,
          style,
          duration,
          language,
          generatedAt: new Date().toISOString(),
          textLength: meditationText.length,
          estimatedReadTime: `${duration}分钟`
        }
      }
    };

    // 6. 可选：缓存结果（如果启用）
    if (options.enableCache && config.CACHE_ENABLED) {
      await cacheResult(result, { topic, style, duration, language });
    }

    return result;

  } catch (error) {
    console.error('[GenerateMeditation] 生成失败:', error);
    
    return {
      success: false,
      error: {
        message: error.message || '生成冥想内容时发生错误',
        code: error.code || 'GENERATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
}

/**
 * 参数验证
 */
function validateParams({ topic, style, duration, language }) {
  // 验证主题
  const supportedTopics = meditationPrompt.getSupportedTopics(language);
  if (!topic || (config.STRICT_TOPIC_VALIDATION && !supportedTopics.includes(topic))) {
    return {
      valid: false,
      error: {
        message: `不支持的冥想主题: ${topic}`,
        code: 'INVALID_TOPIC',
        supportedTopics
      }
    };
  }

  // 验证风格
  const supportedStyles = meditationPrompt.getSupportedStyles();
  if (!style || !supportedStyles.includes(style)) {
    return {
      valid: false,
      error: {
        message: `不支持的引导风格: ${style}`,
        code: 'INVALID_STYLE',
        supportedStyles
      }
    };
  }

  // 验证时长
  if (!duration || duration < 3 || duration > 60) {
    return {
      valid: false,
      error: {
        message: '时长必须在 3-60 分钟之间',
        code: 'INVALID_DURATION'
      }
    };
  }

  // 验证语言
  if (!['zh', 'en'].includes(language)) {
    return {
      valid: false,
      error: {
        message: '目前仅支持中文(zh)和英文(en)',
        code: 'INVALID_LANGUAGE'
      }
    };
  }

  return { valid: true };
}

/**
 * 根据时长计算最大 token 数
 */
function calculateMaxTokens(duration) {
  // 假设每分钟约 150-200 字，每个汉字约 1.5 tokens
  const wordsPerMinute = 175;
  const tokensPerWord = 1.5;
  const buffer = 1.2; // 20% 缓冲
  
  return Math.floor(duration * wordsPerMinute * tokensPerWord * buffer);
}

/**
 * 根据风格选择语音类型
 */
function getVoiceTypeByStyle(style) {
  const voiceMap = {
    gentle: 'zh-CN-XiaoyouNeural',      // 温柔女声
    healing: 'zh-CN-YunxiNeural',       // 治愈男声
    mindful: 'zh-CN-XiaoxiaoNeural',    // 正念女声
    zen: 'zh-CN-YunzeNeural',           // 禅意男声
    nature: 'zh-CN-XiaoyouNeural',      // 自然女声
    modern: 'zh-CN-YunyangNeural'       // 现代男声
  };
  
  return voiceMap[style] || 'zh-CN-XiaoyouNeural';
}

/**
 * 缓存结果（简化版，实际可接入 Redis）
 */
async function cacheResult(result, params) {
  try {
    const cacheKey = `meditation:${params.topic}:${params.style}:${params.duration}:${params.language}`;
    // TODO: 实际项目中接入 Redis 或其他缓存服务
    console.log(`[Cache] 缓存结果 - key: ${cacheKey}`);
  } catch (error) {
    console.warn('[Cache] 缓存失败:', error.message);
  }
}

/**
 * 从缓存获取结果
 */
async function getCachedResult(params) {
  try {
    const cacheKey = `meditation:${params.topic}:${params.style}:${params.duration}:${params.language}`;
    // TODO: 实际项目中从 Redis 获取
    return null;
  } catch (error) {
    console.warn('[Cache] 读取缓存失败:', error.message);
    return null;
  }
}

/**
 * 导出主函数和工具函数
 */
module.exports = {
  generateMeditation,
  validateParams,
  calculateMaxTokens,
  getVoiceTypeByStyle
};