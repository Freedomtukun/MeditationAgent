const axios = require('axios');

/**
 * 调用混元大模型 API
 * @param {Object} params - 请求参数
 * @param {Array} params.messages - 消息数组
 * @param {string} params.model - 模型名称
 * @param {number} params.temperature - 温度参数
 * @param {number} params.maxTokens - 最大token数
 * @returns {Promise<Object>} 统一格式的响应
 */
async function callLLM(params) {
  const apiKey = process.env.HUNYUAN_API_KEY;
  const endpoint = process.env.HUNYUAN_ENDPOINT || 'https://hunyuan.tencentapi.com/v1/chat/completions';

  if (!apiKey) {
    console.error('❌ HUNYUAN_API_KEY 未设置');
    return { 
      success: false, 
      error: { 
        code: 'NO_API_KEY', 
        message: 'HUNYUAN_API_KEY 未配置' 
      } 
    };
  }

  try {
    // 处理不同的输入格式
    let messages, model, temperature, maxTokens;
    
    if (typeof params === 'string') {
      // 兼容旧版本直接传字符串的调用
      messages = [{ role: 'user', content: params }];
      model = 'hunyuan-lite';
      temperature = 0.7;
      maxTokens = 1000;
    } else {
      // 新版本对象参数
      messages = params.messages || [{ role: 'user', content: params.prompt || '' }];
      model = params.model || 'hunyuan-lite';
      temperature = params.temperature || 0.7;
      maxTokens = params.maxTokens || 1000;
    }

    console.log('[CallLLM] 发送请求:', { 
      model, 
      messageCount: messages.length, 
      temperature 
    });

    const response = await axios.post(
      endpoint,
      {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // ✅ 设置超时防卡死
      }
    );

    // 兼容不同API响应格式
    const content = response?.data?.choices?.[0]?.message?.content ||
                   response?.data?.result?.content ||
                   response?.data?.content;

    if (!content) {
      console.warn('⚠️ 混元返回内容为空或结构不符:', response.data);
      return {
        success: false,
        error: {
          code: 'EMPTY_RESPONSE',
          message: '大模型返回内容为空'
        }
      };
    }

    console.log('✅ 混元大模型调用成功，内容长度:', content.length);
    
    // ✅ 统一成功格式
    return {
      success: true,
      data: {
        text: content, // 统一字段名
        content,       // 保持兼容性
        model,
        usage: response.data?.usage || {}
      }
    };

  } catch (err) {
    console.error('❌ 混元 API 请求失败:', err.response?.data || err.message);
    
    // ✅ 统一错误格式
    return {
      success: false,
      error: {
        code: err.response?.status || 'HTTP_ERROR',
        message: err.response?.data?.error?.message || err.message,
        detail: err.response?.data || err.message
      }
    };
  }
}

// ✅ 默认导出，解决 "not a function" 问题
module.exports = callLLM;