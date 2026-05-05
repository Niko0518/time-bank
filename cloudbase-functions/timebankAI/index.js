/**
 * TimeBank AI 云函数 - timebankAI
 * [v8.0.0] 支持多后端 AI 服务代理（Gemini/混元/OpenAI）
 *
 * 支持的 action：
 *   generateInsight - 生成时间银行洞察报告
 *   chat            - AI 对话
 *   getStatus       - 获取 AI 服务状态
 *
 * 环境变量（在 CloudBase 控制台配置）：
 *   AI_PROVIDER        - 默认: gemini (可选: hunyuan, openai)
 *   GEMINI_API_KEY     - Google Gemini API 密钥
 *   HUNYUAN_SECRET_ID  - 腾讯云 SecretId (混元用)
 *   HUNYUAN_SECRET_KEY - 腾讯云 SecretKey (混元用)
 *   OPENAI_API_KEY     - OpenAI API 密钥
 *
 * 部署步骤：
 *   1. 打开 https://tcb.cloud.tencent.com/dev?#/scf
 *   2. 新建云函数：名称 timebankAI，运行环境 Node.js 18.15
 *   3. 将本文件和 package.json 内容粘贴
 *   4. 点击「保存并安装依赖」
 *   5. 在「环境变量」标签页添加 API 密钥
 */

const cloud = require('@cloudbase/node-sdk');
const axios = require('axios');

// 初始化 CloudBase
const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// AI 服务配置
const AI_CONFIG = {
  gemini: {
    name: 'Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    // gemini-2.0-flash 免费版: 15 RPM, 100万 TPM, 1500 RPD
    buildRequest: (prompt, apiKey) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000, // [v8.0.0] 20秒超时，避免网络问题导致云函数挂起
      data: {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topK: 40,
          topP: 0.95
        }
      }
    }),
    parseResponse: (response) => {
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini 返回格式异常');
      return text;
    }
  },

  hunyuan: {
    name: '混元',
    // 腾讯云混元使用 tencentcloud-sdk，这里用 REST API 简化
    apiUrl: 'https://hunyuan.tencentcloudapi.com',
    buildRequest: (prompt, secretId, secretKey) => {
      // 混元需要签名，简化版使用标准版 API
      // 实际部署时需要实现 TC3-HMAC-SHA256 签名
      throw new Error('混元支持需要额外实现签名逻辑，建议使用 Gemini');
    },
    parseResponse: (response) => response.data.Response.Choices[0].Message.Content
  },

  openai: {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    buildRequest: (prompt, apiKey) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 20000,
      data: {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024
      }
    }),
    parseResponse: (response) => {
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenAI 返回格式异常');
      return text;
    }
  },

  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-v4-flash', name: 'V4 Flash', desc: '快速响应，适合日常分析' },
      { id: 'deepseek-v4-pro', name: 'V4 Pro', desc: '高质量深度分析' }
    ],
    buildRequest: (prompt, apiKey, options = {}) => {
      const model = options.model || 'deepseek-v4-flash';
      const thinking = options.thinking || false;
      const reasoningEffort = options.reasoningEffort || 'medium';

      const payload = {
        model: model,
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500  // [v8.0.0] 长prompt需要更多completion空间
      };

      // [v8.0.0] 支持思考模式（仅 Pro 模型有效）
      if (thinking && model.includes('pro')) {
        payload.thinking = { type: 'enabled' };
        payload.reasoning_effort = reasoningEffort;
      }

      // [v8.0.0] 按模型设置超时：flash 25s，pro 45s
      const axiosTimeout = model.includes('pro') ? 45000 : 25000;

      return {
        url: 'https://api.deepseek.com/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: axiosTimeout,
        data: payload
      };
    },
    parseResponse: (response) => {
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('DeepSeek 返回格式异常');
      return text;
    }
  }
};

exports.main = async (event, context) => {
  // [v8.0.0] 兼容 HTTP 访问服务和 callFunction 两种调用方式
  let action, data = {};
  
  if (event.httpMethod) {
    // HTTP 访问服务触发（event.body 是 JSON 字符串）
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    action = body.action;
    data = body.data || {};
    console.log(`[timebankAI] HTTP trigger, action: ${action}`);
  } else {
    // callFunction 触发
    action = event.action;
    data = event.data || {};
  }

  const uid = context.OPENID;
  console.log(`[timebankAI] Action: ${action}, UID: ${uid ? uid.substring(0, 8) + '...' : 'null'}`);

  // [v8.0.0-cloud] getStatus 不需要登录，其他操作需要
  // [DEBUG] 临时放宽：如果 UID 为空，使用测试 UID
  let effectiveUid = uid;
  if (!uid && action !== 'getStatus') {
    console.log(`[timebankAI] Warning: No UID for action ${action}, using test uid`);
    // 临时使用测试 UID，生产环境应该返回 401
    // return { code: 401, message: '未授权：请先登录' };
    effectiveUid = 'test_user_' + Date.now();
  }

  try {
    switch (action) {

      /**
       * getStatus - 获取 AI 服务状态（无需登录）
       * 返回: { code, available, provider, message }
       */
      case 'getStatus': {
        const provider = process.env.AI_PROVIDER || 'gemini';
        const config = AI_CONFIG[provider];

        let available = false;
        let message = '';

        if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
          available = true;
          message = `Gemini 2.0 Flash 已配置`;
        } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
          available = true;
          message = `OpenAI GPT-3.5 已配置`;
        } else if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
          available = true;
          message = `DeepSeek-V4 已配置`;
        } else if (provider === 'hunyuan' && process.env.HUNYUAN_SECRET_ID) {
          available = true;
          message = `混元大模型已配置`;
        } else {
          message = `AI 服务未配置: ${provider}`;
        }

        const result = {
          code: 0,
          available: available,
          provider: provider,
          providerName: config?.name || provider,
          message: message
        };

        // [v8.0.0] 返回该提供商支持的模型列表
        if (config?.models) {
          result.models = config.models;
        }

        return result;
      }

      /**
       * generateInsight - 生成洞察报告
       * 参数: {
       *   userData: {
       *     summary: { totalEarned, totalSpent, ... },
       *     habits: [...],
       *     sleep: { avgDuration, avgQuality },
       *     period: '本周' | '本月'
       *   },
       *   provider: 'gemini' | 'hunyuan' | 'openai' (可选，默认读取环境变量)
       * }
       * 返回: { code, report, provider, usage }
       */
      case 'generateInsight': {
        const { userData, provider: reqProvider, model: reqModel, thinking: reqThinking } = data;
        if (!userData) {
          return { code: 400, message: '缺少 userData 参数' };
        }

        // 确定使用哪个 AI 提供商
        const provider = reqProvider || process.env.AI_PROVIDER || 'gemini';
        const config = AI_CONFIG[provider];

        if (!config) {
          return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
        }

        // 获取 API 密钥
        let apiKey, secretId, secretKey;
        if (provider === 'gemini') {
          apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return { code: 503, message: 'Gemini API 密钥未配置' };
          }
        } else if (provider === 'openai') {
          apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            return { code: 503, message: 'OpenAI API 密钥未配置' };
          }
        } else if (provider === 'deepseek') {
          apiKey = process.env.DEEPSEEK_API_KEY;
          if (!apiKey) {
            return { code: 503, message: 'DeepSeek API 密钥未配置' };
          }
        } else if (provider === 'hunyuan') {
          secretId = process.env.HUNYUAN_SECRET_ID;
          secretKey = process.env.HUNYUAN_SECRET_KEY;
          if (!secretId || !secretKey) {
            return { code: 503, message: '混元 API 密钥未配置' };
          }
        }

        // 构建 Prompt
        const prompt = buildInsightPrompt(userData);

        // [v8.0.0] 模型选择参数
        const modelOptions = {};
        if (reqModel) modelOptions.model = reqModel;
        if (reqThinking) modelOptions.thinking = reqThinking;

        // 记录请求日志
        console.log(`[timebankAI] 生成洞察报告 - 用户: ${effectiveUid.substring(0, 8)}..., 提供商: ${provider}, 模型: ${reqModel || 'default'}`);

        // 调用 AI API
        const startTime = Date.now();
        // [v8.0.0-fix] 修复参数传递：非混元提供商直接传 apiKey + modelOptions
        const requestConfig = provider === 'hunyuan'
            ? config.buildRequest(prompt, secretId, secretKey)
            : config.buildRequest(prompt, apiKey, modelOptions);
        const response = await axios(requestConfig);
        const report = config.parseResponse(response);
        const elapsed = Date.now() - startTime;

        console.log(`[timebankAI] 报告生成成功 - 耗时: ${elapsed}ms, 长度: ${report.length} 字符`);

        return {
          code: 0,
          report: report,
          provider: provider,
          model: reqModel || null,
          usage: {
            promptLength: prompt.length,
            reportLength: report.length,
            elapsedMs: elapsed
          }
        };
      }

      /**
       * chat - AI 对话
       * 参数: { message: string, context: object }
       * 返回: { code, reply, provider }
       */
      case 'chat': {
        const { message, context = {}, model: reqModel, thinking: reqThinking } = data;
        if (!message) {
          return { code: 400, message: '缺少 message 参数' };
        }

        const provider = process.env.AI_PROVIDER || 'gemini';
        const config = AI_CONFIG[provider];

        if (!config) {
          return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          return { code: 503, message: 'AI API 密钥未配置' };
        }

        const prompt = buildChatPrompt(message, context);

        // [v8.0.0] 模型选择参数
        const modelOptions = {};
        if (reqModel) modelOptions.model = reqModel;
        if (reqThinking) modelOptions.thinking = reqThinking;

        console.log(`[timebankAI] AI 对话 - 用户: ${effectiveUid.substring(0, 8)}..., 模型: ${reqModel || 'default'}`);

        // [v8.0.0-fix] 修复参数传递
        const requestConfig = provider === 'hunyuan'
            ? config.buildRequest(prompt, apiKey, null)
            : config.buildRequest(prompt, apiKey, modelOptions);
        const response = await axios(requestConfig);
        const reply = config.parseResponse(response);

        return {
          code: 0,
          reply: reply,
          provider: provider,
          model: reqModel || null
        };
      }

      default:
        return { code: 400, message: `未知操作: ${action}` };
    }

  } catch (error) {
    console.error(`[timebankAI] action=${action} 失败:`, error.message);

    // 处理特定错误
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error('[timebankAI] AI API 请求超时');
      return { code: 504, message: 'AI 服务响应超时，请检查网络连接或稍后重试' };
    }

    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      if (status === 429) {
        return { code: 429, message: 'AI 服务请求过于频繁，请稍后再试' };
      }
      if (status === 401 || status === 403) {
        return { code: 503, message: 'AI 服务认证失败，请检查 API 密钥配置' };
      }

      return {
        code: 502,
        message: `AI 服务错误: ${errorData?.error?.message || error.message}`
      };
    }

    return { code: 500, message: error.message || '服务端错误' };
  }
};

/**
 * 格式化时长（云函数端辅助函数）
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的字符串
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0分钟';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }
    return `${minutes}分钟`;
}

/**
 * 构建洞察报告 Prompt
 * [v8.0.0] 自由分析模式：说明数据含义，让 AI 自主判断分析角度
 */
function buildInsightPrompt(userData) {
  const { summary, habits, sleep, rawData, period = '本周' } = userData;

  let prompt = `你是一位时间管理顾问。以下是一位"时间银行"用户的近期行为数据。\n\n`;

  prompt += `【数据说明】\n`;
  prompt += `- earn = 产出性活动（工作、学习、锻炼等），spend = 消耗性活动（娱乐、休息等）\n`;
  prompt += `- 当前余额 = 历史累计 earn - spend，正=盈余，负=透支\n`;
  prompt += `- streak = 习惯连续完成天数，completionRate = 近30天完成率\n`;
  prompt += `- 时间段：早晨(6-12点)、下午(12-18点)、晚上(18-24点)、深夜(0-6点)\n\n`;

  // === 数据呈现 ===
  if (summary) {
    prompt += `=== 时间收支 ===\n`;
    prompt += `当前余额：${formatDuration(Math.abs(summary.currentBalance || 0))}${(summary.currentBalance || 0) >= 0 ? '' : '（透支）'}\n`;
    prompt += `本周期：获得 ${summary.totalEarnedFormatted || '0'}，消费 ${summary.totalSpentFormatted || '0'}，净${summary.totalNet >= 0 ? '+' : ''}${summary.totalNetFormatted || '0'}\n`;
    if (summary.prevEarned !== undefined) {
      prompt += `上周期（${summary.prevDaysInPeriod}天）：获得 ${summary.prevEarnedFormatted || '0'}，消费 ${summary.prevSpentFormatted || '0'}\n`;
      prompt += `环比：获得变化 ${summary.earnChangePercent > 0 ? '+' : ''}${summary.earnChangePercent}%，消费变化 ${summary.spendChangePercent > 0 ? '+' : ''}${summary.spendChangePercent}%\n`;
    }
    prompt += `\n`;
  }

  if (rawData?.dailyBreakdown && rawData.dailyBreakdown.length > 0) {
    prompt += `=== 每日明细 ===\n`;
    rawData.dailyBreakdown.forEach(d => {
      const tasks = d.topTasks && d.topTasks.length > 0 ? ` [${d.topTasks.join('、')}]` : '';
      prompt += `${d.date}：获得 ${formatDuration(d.earn)}，消费 ${formatDuration(d.spend)}，净${d.net >= 0 ? '+' : ''}${formatDuration(d.net)}${tasks}\n`;
    });
    prompt += `\n`;
  }

  if (rawData?.timeDistribution) {
    const td = rawData.timeDistribution;
    prompt += `=== 时间段分布 ===\n`;
    prompt += `${td.morning.label}：获得 ${formatDuration(td.morning.earn)}，消费 ${formatDuration(td.morning.spend)}\n`;
    prompt += `${td.afternoon.label}：获得 ${formatDuration(td.afternoon.earn)}，消费 ${formatDuration(td.afternoon.spend)}\n`;
    prompt += `${td.evening.label}：获得 ${formatDuration(td.evening.earn)}，消费 ${formatDuration(td.evening.spend)}\n`;
    prompt += `${td.night.label}：获得 ${formatDuration(td.night.earn)}，消费 ${formatDuration(td.night.spend)}\n\n`;
  }

  if (rawData?.taskBreakdown && rawData.taskBreakdown.length > 0) {
    prompt += `=== 主要任务 ===\n`;
    rawData.taskBreakdown.forEach(t => {
      const arrow = t.type === 'earn' ? '↑' : '↓';
      prompt += `${arrow} ${t.name}（${t.category}）：累计 ${t.totalTime}，${t.count}次，平均 ${t.avgTime}\n`;
    });
    prompt += `\n`;
  }

  if (rawData?.categoryBreakdown && rawData.categoryBreakdown.length > 0) {
    prompt += `=== 分类占比 ===\n`;
    rawData.categoryBreakdown.forEach(c => {
      prompt += `${c.name}：产出 ${c.earn}，消耗 ${c.spend}，${c.count}次\n`;
    });
    prompt += `\n`;
  }

  if (habits && habits.length > 0) {
    prompt += `=== 习惯追踪 ===\n`;
    habits.forEach(h => {
      prompt += `${h.name}：连胜${h.streak}天，完成率${h.completionRate}%，近7天活跃${h.weeklyActiveDays}天\n`;
    });
    prompt += `\n`;
  }

  if (sleep?.dailyDetails && sleep.dailyDetails.length > 0) {
    prompt += `=== 睡眠记录 ===\n`;
    sleep.dailyDetails.forEach(d => {
      prompt += `${d.date}：${d.duration}小时，质量${d.quality}/10\n`;
    });
    prompt += `平均：${sleep.avgDuration}小时，质量${sleep.avgQuality}/10\n\n`;
  } else if (sleep) {
    prompt += `=== 睡眠概况 ===\n`;
    prompt += `平均：${sleep.avgDuration}小时，质量${sleep.avgQuality}/10\n\n`;
  }

  prompt += `请分析这些数据，生成一份对用户有帮助的报告。分析角度由你决定，给出具体建议。使用 Markdown 格式。\n`;

  return prompt;
}

/**
 * 构建对话 Prompt
 */
function buildChatPrompt(message, context) {
  let prompt = `你是时间银行应用的 AI 助手，帮助用户管理时间和养成良好习惯。\n\n`;

  if (context.userName) {
    prompt += `用户: ${context.userName}\n`;
  }

  prompt += `\n用户问题: ${message}\n\n`;
  prompt += `请给出友好、专业、简洁的回答。如果涉及具体数据操作，请引导用户使用应用内功能。`;

  return prompt;
}
