/**
 * 冥想智能体云函数主入口
 * 统一接收请求并分发到对应功能模块
 */
console.log('[DEBUG] HunyuanKey Len=', (process.env.HUNYUAN_API_KEY || '').length);

// —— 路由表更新 ——
// 统一从 router/meditation.js 引入所有处理器
const {
  handleMeditation,          // 对应 type='generate'
  handleBatchGeneration,     // 对应 type='batch'
  handleTopicRecommendation, // 对应 type='recommend'
  handleMeditationPreview    // 对应 type='preview'
} = require('./router/meditation');

/**
 * 云函数主入口
 * @param {Object} event   - 请求事件对象
 * @param {string} event.type - 请求类型（generate/batch/recommend/preview/ping）
 * @param {Object} context - 云函数上下文
 * @returns {Promise<Object>} 返回处理结果
 */
async function main(event = {}, context = {}) {
  const startTime = Date.now();
  const { type = 'ping' } = event;
  const userId = context.getUserID?.() || 'anonymous';
  const requestId = context.requestId || `req_${Date.now()}`;

  console.log('[MeditationAgent] 请求开始:', {
    type,
    userId,
    requestId,
    timestamp: new Date().toISOString()
  });

  try {
    let result;

    switch (type) {
      case 'generate':
        // 生成单个冥想内容（含语音）
        result = await handleMeditation(event);
        break;

      case 'preview':
        // 预览模式：仅生成文本，不生成语音
        result = await handleMeditationPreview(event);
        break;

      case 'batch':
        // 批量生成冥想内容
        result = await handleBatchGeneration(event);
        break;

      case 'recommend':
        // 推荐冥想主题
        result = await handleTopicRecommendation(event);
        break;

      case 'ping':
        // 健康检查
        result = {
          success: true,
          data: { pong: true, timestamp: new Date().toISOString() },
          message: 'MeditationAgent is running'
        };
        break;

      default:
        return errorResponse(
          'INVALID_TYPE',
          `不支持的操作类型: ${type}，支持的类型为: generate, preview, batch, recommend, ping`
        );
    }

    // 记录成功日志
    const duration = Date.now() - startTime;
    console.log('[MeditationAgent] 请求成功:', {
      type,
      userId,
      success: result.success,
      requestId,
      duration: `${duration}ms`,
      metrics: {
        hasAudio: !!result.data?.audio,
        textLength: result.data?.text?.length || 0,
        itemCount: result.data?.results?.length || 1
      }
    });

    // 附加元信息
    result.metadata = {
      ...result.metadata,
      requestId,
      duration,
      timestamp: new Date().toISOString()
    };

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[MeditationAgent] 请求失败:', {
      type,
      userId,
      error: error.message,
      code: error.code,
      requestId,
      duration: `${duration}ms`,
      stack: error.stack?.split('\n').slice(0, 3)
    });

    return errorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message || '处理请求时发生内部错误',
      {
        requestId,
        duration,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development'
          ? { stack: error.stack, params: event }
          : {})
      }
    );
  }
}

/**
 * 统一错误响应格式
 * @param {string} code     - 错误代码
 * @param {string} message  - 错误消息
 * @param {object} metadata - 元数据
 * @returns {object} 错误响应对象
 */
function errorResponse(code, message, metadata = {}) {
  return {
    success: false,
    error: { code, message },
    metadata
  };
}

// ==================== 导出 ====================
module.exports = {
  main_handler: main,   // 可在控制台配置为 index.main_handler
  main,                 // 可配置为 index.main
  handler: main         // 兼容其他框架习惯
};
