/**
 * 冥想智能体云函数核心路由
 * 处理冥想引导内容的生成请求
 * 支持标准模式和快速模式（Quick-Mode）
 */

const promptBuilder = require('../utils/meditation_prompt');
const callLLM = require('../utils/call_llm');
// ⚠️ 修复：utils/tts.js 导出的是 { synthesizeSpeech } 对象，需要按对象解构
const { synthesizeSpeech } = require('../utils/tts');
const config = require('../config');

// 日志工具
const log = {
  debug: (...args) => config.LOG_LEVEL === 'debug' && console.log('[DEBUG][MeditationGuide]', ...args),
  info: (...args) => ['debug', 'info'].includes(config.LOG_LEVEL) && console.log('[INFO][MeditationGuide]', ...args),
  warn: (...args) => console.warn('[WARN][MeditationGuide]', ...args),
  error: (...args) => console.error('[ERROR][MeditationGuide]', ...args)
};

/**
 * 主处理函数 - 生成冥想引导内容
 * @param {Object} event - 云函数事件对象
 * @param {string} event.topic - 冥想主题
 * @param {string} event.style - 引导风格
 * @param {number} event.duration - 时长（分钟）
 * @param {string} event.language - 语言（zh/en）
 * @param {boolean} event.voice - 是否生成语音
 * @param {Object} event.options - 高级选项
 * @returns {Promise<Object>} 返回生成的内容
 */
async function handleMeditationGuide(event) {
  log.info('收到请求:', JSON.stringify(event));
  
  try {
    // 1. 参数解析与默认值设置
    const {
      topic = '基础放松',
      style,
      duration: rawDuration,
      language = 'zh',
      voice = false,
      options = {}
    } = event;

    // 统一 duration 处理
    const duration = rawDuration || config.DEFAULT_DURATION;
    
    // 判断是否为快速模式
    const isQuickMode = duration < 3;
    log.info(`运行模式: ${isQuickMode ? 'Quick-Mode' : 'Standard'}, 时长: ${duration}分钟`);

    // 2. 参数验证
    const validation = validateInputs({ topic, language, duration });
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    // 3. 构建 Prompt - 支持快速模式
    const prompt = isQuickMode
      ? (promptBuilder?.buildQuickPrompt 
          ? promptBuilder.buildQuickPrompt({ topic, style, language })
          : `请生成一段简短的${duration}分钟冥想引导。主题：${topic}。要求：语言温柔，节奏紧凑，直接进入主题，避免冗长开场。`)
      : (promptBuilder?.buildPrompt 
          ? promptBuilder.buildPrompt({
              topic,
              style,
              duration,
              language,
              customization: options.customization
            })
          : `请为我生成一个关于"${topic}"的冥想引导内容，时长约${duration}分钟，语言为${language}。`);
    
    log.info('Prompt 构建完成，长度:', prompt.length, '模式:', isQuickMode ? 'quick' : 'standard');

    // 4. 调用大模型生成文本
    const llmResp = await callLLM({
      messages: [
        {
          role: 'system',
          content: isQuickMode 
            ? '你是一个专业的冥想引导师，擅长创作简短有力的快速冥想引导。请确保内容紧凑、直接、有效。'
            : '你是一个专业的冥想引导师，擅长创作温和、平静的冥想引导词。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: options.model || config.DEFAULT_MODEL,
      temperature: isQuickMode ? 0.6 : (options.temperature || 0.7), // 快速模式降低随机性
      maxTokens: calculateMaxTokens(duration, isQuickMode)
    });

    // 检查 LLM 响应
    if (!llmResp?.success) {
      log.warn('LLM 调用失败:', llmResp?.error);
      return {
        success: false,
        error: llmResp?.error || { 
          code: config.ERROR_CODES.LLM_FAILED, 
          message: '调用大模型失败' 
        }
      };
    }

    // 兼容多种响应格式
    const meditationText = llmResp.data?.text ||
                          llmResp.data?.choices?.[0]?.message?.content ||
                          llmResp.data?.content ||
                          '';
    
    if (!meditationText) {
      log.warn('大模型返回内容为空');
      return {
        success: false,
        error: {
          code: config.ERROR_CODES.EMPTY_CONTENT,
          message: '大模型生成的内容为空'
        }
      };
    }

    log.info('文本生成成功，字数:', meditationText.length);

    // 5. 生成语音（可选）
    let audioData = null;
    if (voice && language === 'zh') {
      try {
        log.info('开始生成语音...');
        
        // 快速模式可能需要调整语速
        const speechRate = isQuickMode 
          ? (options.speed || 1.1)  // 快速模式默认稍快
          : (options.speed || config.DEFAULT_SPEED);
        
        // 修复：调用正确解构的 synthesizeSpeech 函数
        const ttsResponse = await synthesizeSpeech({
          text: meditationText,
          voiceType: options.voiceType || getVoiceByStyleAndTopic(style, topic),
          speed: speechRate,
          volume: options.volume || config.DEFAULT_VOLUME,
          format: options.format || config.DEFAULT_FORMAT
        });

        if (ttsResponse?.success || ttsResponse?.audioUrl) {
          audioData = {
            url: ttsResponse.audioUrl || ttsResponse.url,
            duration: ttsResponse.duration,
            format: ttsResponse.format || config.DEFAULT_FORMAT
          };
          log.info('语音生成成功');
        } else {
          log.warn('语音生成失败:', ttsResponse?.error);
        }
      } catch (ttsError) {
        log.error('TTS 异常:', ttsError);
        // 语音生成失败不影响文本返回
      }
    }

    // 6. 获取主题详情
    const topicDetails = promptBuilder?.getTopicDetails ? 
      promptBuilder.getTopicDetails(topic, language) : null;

    // 7. 构建返回结果
    const result = {
      success: true,
      data: {
        text: meditationText,
        audio: audioData,
        metadata: {
          topic: topicDetails ? topicDetails.name : topic,
          topicId: topicDetails ? topicDetails.id : null,
          style: style || (topicDetails ? topicDetails.recommendedStyles?.[0] : 'gentle'),
          duration,
          mode: isQuickMode ? 'quick' : 'standard', // 标注运行模式
          language,
          benefits: topicDetails ? topicDetails.benefits : [],
          targetAudience: topicDetails ? topicDetails.targetAudience : [],
          generatedAt: new Date().toISOString(),
          textLength: meditationText.length,
          wordCount: countWords(meditationText, language),
          estimatedReadTime: estimateReadTime(meditationText, language) // 新增：预估朗读时间
        }
      }
    };

    // 8. 记录使用统计
    if (config.ENABLE_ANALYTICS) {
      await recordUsage({
        topic: result.data.metadata.topicId,
        style: result.data.metadata.style,
        duration: result.data.metadata.duration,
        mode: result.data.metadata.mode,
        language,
        hasAudio: !!audioData,
        timestamp: result.data.metadata.generatedAt
      });
    }

    return result;

  } catch (error) {
    log.error('处理失败:', error);
    
    return {
      success: false,
      error: {
        message: error.message || '生成冥想内容时发生错误',
        code: error.code || config.ERROR_CODES.MEDITATION_GENERATION_ERROR || 'MEDITATION_GENERATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
}

/**
 * 输入参数验证
 */
function validateInputs({ topic, language, duration }) {
  // 验证语言
  if (language && !config.SUPPORTED_LANGUAGES.includes(language)) {
    return {
      valid: false,
      error: {
        message: `不支持的语言，目前仅支持 ${config.SUPPORTED_LANGUAGES.join('、')}`,
        code: config.ERROR_CODES.INVALID_LANGUAGE
      }
    };
  }

  // 验证时长 - 支持 1-60 分钟
  if (duration && (duration < 1 || duration > 60)) {
    return {
      valid: false,
      error: {
        message: '时长必须在 1-60 分钟之间',
        code: config.ERROR_CODES.INVALID_DURATION
      }
    };
  }

  // 验证主题（可选）
  if (config.STRICT_TOPIC_VALIDATION && promptBuilder?.getSupportedTopics) {
    const supportedTopics = promptBuilder.getSupportedTopics(language || 'zh');
    const topicDetails = promptBuilder.getTopicDetails?.(topic, language || 'zh');
    
    if (!topicDetails && !supportedTopics.includes(topic)) {
      return {
        valid: false,
        error: {
          message: `不支持的主题: ${topic}`,
          code: config.ERROR_CODES.INVALID_TOPIC,
          supportedTopics
        }
      };
    }
  }

  return { valid: true };
}

/**
 * 根据时长计算最大 token 数
 * @param {number} duration - 时长（分钟）
 * @param {boolean} isQuickMode - 是否为快速模式
 */
function calculateMaxTokens(duration, isQuickMode = false) {
  // 快速模式使用更少的 token
  const tokenMultiplier = isQuickMode ? 0.8 : 1.0;
  return Math.floor(duration * config.WORDS_PER_MINUTE * config.TOKENS_PER_WORD * config.TOKEN_BUFFER * tokenMultiplier);
}

/**
 * 根据风格和主题选择合适的语音
 */
function getVoiceByStyleAndTopic(style, topic) {
  // 优先使用主题特定语音，其次使用风格语音
  return config.TOPIC_VOICE_MAP[topic] || 
         config.STYLE_VOICE_MAP[style] || 
         config.DEFAULT_VOICE_TYPE;
}

/**
 * 统计字数
 */
function countWords(text, language) {
  if (language === 'zh') {
    // 中文按字符计算（排除标点符号）
    return text.replace(/[^\u4e00-\u9fa5]/g, '').length;
  } else {
    // 英文按单词计算
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
}

/**
 * 预估朗读时间（秒）
 */
function estimateReadTime(text, language) {
  const wordCount = countWords(text, language);
  const wordsPerMinute = language === 'zh' ? 180 : 150; // 中文每分钟180字，英文150词
  return Math.ceil((wordCount / wordsPerMinute) * 60);
}

/**
 * 记录使用统计
 */
async function recordUsage(data) {
  try {
    // TODO: 实际项目中可以写入数据库或分析服务
    console.log('[Analytics] 记录使用:', data);
  } catch (error) {
    console.warn('[Analytics] 记录失败:', error.message);
  }
}

/**
 * 批量生成接口
 */
async function handleBatchGeneration(event) {
  const { topics, baseOptions = {} } = event;
  
  if (!Array.isArray(topics) || topics.length === 0) {
    return {
      success: false,
      error: {
        message: '请提供要生成的主题列表',
        code: 'INVALID_TOPICS'
      }
    };
  }

  const results = [];
  const startTime = Date.now();
  
  for (const topicConfig of topics) {
    const options = typeof topicConfig === 'string' 
      ? { topic: topicConfig, ...baseOptions }
      : { ...baseOptions, ...topicConfig };
    
    try {
      const result = await handleMeditationGuide(options);
      results.push({
        topic: options.topic,
        success: result.success,
        data: result.success ? result.data : null,
        error: result.error
      });
    } catch (error) {
      results.push({
        topic: options.topic,
        success: false,
        data: null,
        error: { code: 'BATCH_ITEM_ERROR', message: error.message }
      });
    }
  }

  return {
    success: true,
    data: {
      total: topics.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      processingTime: Date.now() - startTime,
      results
    }
  };
}

/**
 * 预览模式 - 仅生成文本，不生成语音
 */
async function handleMeditationPreview(event) {
  log.info('[MeditationPreview] 开始预览生成');
  
  // 强制设置 voice 为 false
  const previewEvent = {
    ...event,
    voice: false,
    options: {
      ...event.options,
      skipAudio: true
    }
  };
  
  // 调用主生成函数
  const result = await handleMeditationGuide(previewEvent);
  
  // 添加预览标识
  if (result.success) {
    result.data.metadata = {
      ...result.data.metadata,
      isPreview: true
    };
  }
  
  return result;
}

/**
 * 主题推荐接口
 */
async function handleTopicRecommendation(event) {
  const { keywords = [], language = 'zh' } = event;
  
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return {
      success: false,
      error: {
        message: '请提供关键词以获取推荐',
        code: 'INVALID_KEYWORDS'
      }
    };
  }

  // 安全调用 promptBuilder
  let recommendations = [];
  if (promptBuilder?.recommendTopics) {
    try {
      recommendations = promptBuilder.recommendTopics(keywords, language);
    } catch (error) {
      console.warn('[TopicRecommendation] promptBuilder 调用失败:', error.message);
      // 提供默认推荐
      recommendations = getDefaultRecommendations(language);
    }
  } else {
    recommendations = getDefaultRecommendations(language);
  }
  
  return {
    success: true,
    data: {
      keywords,
      recommendations: recommendations.slice(0, 5), // 返回前5个推荐
      total: recommendations.length
    }
  };
}

/**
 * 获取默认推荐主题
 */
function getDefaultRecommendations(language) {
  const recommendations = {
    zh: [
      { id: 'quick-relax', name: '快速放松', description: '1-2分钟快速缓解压力', duration: 2, mode: 'quick' },
      { id: 'basic-relaxation', name: '基础放松', description: '适合初学者的放松练习', duration: 10 },
      { id: 'breathing', name: '呼吸冥想', description: '专注于呼吸的冥想练习', duration: 15 },
      { id: 'body-scan', name: '身体扫描', description: '逐步放松身体各部分', duration: 20 },
      { id: 'mindfulness', name: '正念冥想', description: '保持当下觉知的练习', duration: 15 },
      { id: 'sleep', name: '助眠冥想', description: '帮助入睡的冥想引导', duration: 30 }
    ],
    en: [
      { id: 'quick-relax', name: 'Quick Relaxation', description: '1-2 minute stress relief', duration: 2, mode: 'quick' },
      { id: 'basic-relaxation', name: 'Basic Relaxation', description: 'Beginner-friendly relaxation', duration: 10 },
      { id: 'breathing', name: 'Breathing Meditation', description: 'Focus on breath practice', duration: 15 },
      { id: 'body-scan', name: 'Body Scan', description: 'Progressive body relaxation', duration: 20 },
      { id: 'mindfulness', name: 'Mindfulness', description: 'Present moment awareness', duration: 15 },
      { id: 'sleep', name: 'Sleep Meditation', description: 'Guided sleep assistance', duration: 30 }
    ]
  };
  
  return recommendations[language] || recommendations.zh;
}

// 导出函数
module.exports = {
  handleMeditationGuide,
  handleMeditationPreview,
  handleBatchGeneration,
  handleTopicRecommendation,
  // 工具函数导出（用于测试）
  validateInputs,
  calculateMaxTokens,
  getVoiceByStyleAndTopic,
  countWords,
  estimateReadTime
};