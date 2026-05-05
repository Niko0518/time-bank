/**
 * TimeBank AI 云函数 - timebankAI
 * [v8.1.0] 支持多后端 AI 服务代理（DeepSeek/Kimi/Gemini/混元/OpenAI）
 *
 * 支持的 action：
 *   generateInsight  - 生成时间银行洞察报告
 *   chat             - AI 对话（支持记忆上下文）
 *   dailyCompanion   - 生成每日伙伴关怀消息（v8.2.0）
 *   getStatus        - 获取 AI 服务状态（扫描所有已配置 key 的提供商）
 *
 * 环境变量（在 CloudBase 控制台配置）：
 *   AI_PROVIDER        - 默认: deepseek (可选: gemini, hunyuan, openai, kimi)
 *   DEEPSEEK_API_KEY   - DeepSeek API 密钥
 *   KIMI_API_KEY       - Kimi (Moonshot) API 密钥
 *   GEMINI_API_KEY     - Google Gemini API 密钥
 *   OPENAI_API_KEY     - OpenAI API 密钥
 *   HUNYUAN_SECRET_ID  - 腾讯云 SecretId (混元用)
 *   HUNYUAN_SECRET_KEY - 腾讯云 SecretKey (混元用)
 *
 * 部署步骤：
 *   1. 打开 https://tcb.cloud.tencent.com/dev?#/scf
 *   2. 云函数 timebankAI，运行环境 Node.js 18.15
 *   3. 将本文件内容粘贴到 index.js
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
  },

  kimi: {
    name: 'Kimi',
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    models: [
      { id: 'kimi-k2.6', name: '🌙 K2.6', desc: 'Kimi 迄今最智能的模型，上下文 256k' }
    ],
    buildRequest: (prompt, apiKey, options = {}) => {
      const model = options.model || 'kimi-k2.6';
      const thinking = options.thinking || false;

      // K2.6/K2.5 系列 temperature 固定不可手动设置；V1 系列可设置
      const isK2Model = model.startsWith('kimi-k2');

      const payload = {
        model: model,
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500
      };

      // V1 系列支持自定义 temperature；K2 系列使用固定值，不可覆盖
      if (!isK2Model) {
        payload.temperature = 0.7;
      }

      // K2.6/K2.5 支持思考模式
      if (isK2Model && thinking) {
        payload.thinking = { type: 'enabled' };
      }

      return {
        url: 'https://api.moonshot.cn/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000,
        data: payload
      };
    },
    parseResponse: (response) => {
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Kimi 返回格式异常');
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
        const defaultProvider = process.env.AI_PROVIDER || 'gemini';
        const defaultConfig = AI_CONFIG[defaultProvider];

        // [v8.1.0] 扫描所有已配置 API key 的提供商，返回合并模型列表
        const availableProviders = [];
        const allModels = [];

        const providerChecks = [
          { key: 'gemini', keyEnv: 'GEMINI_API_KEY' },
          { key: 'openai', keyEnv: 'OPENAI_API_KEY' },
          { key: 'deepseek', keyEnv: 'DEEPSEEK_API_KEY' },
          { key: 'kimi', keyEnv: 'KIMI_API_KEY' },
          { key: 'hunyuan', keyEnv: 'HUNYUAN_SECRET_ID' }
        ];

        providerChecks.forEach(({ key, keyEnv }) => {
          if (process.env[keyEnv]) {
            const config = AI_CONFIG[key];
            if (config) {
              availableProviders.push({ key, name: config.name });
              if (config.models) {
                config.models.forEach(m => {
                  allModels.push({ ...m, provider: key });
                });
              }
            }
          }
        });

        const available = availableProviders.length > 0;
        const message = available
          ? `已配置 ${availableProviders.map(p => p.name).join('、')}，共 ${allModels.length} 个模型可选`
          : `AI 服务未配置: ${defaultProvider}`;

        const result = {
          code: 0,
          available: available,
          provider: defaultProvider,
          providerName: defaultConfig?.name || defaultProvider,
          message: message,
          providers: availableProviders
        };

        // [v8.1.0] 返回所有可用提供商的模型列表（含 provider 字段）
        if (allModels.length > 0) {
          result.models = allModels;
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
        let provider = reqProvider || process.env.AI_PROVIDER || 'gemini';

        // [v8.1.0] 如果传入了模型参数且未指定提供商，尝试推断
        if (reqModel && !reqProvider) {
          for (const [pKey, pConfig] of Object.entries(AI_CONFIG)) {
            if (pConfig.models?.some(m => m.id === reqModel)) {
              provider = pKey;
              break;
            }
          }
        }

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
        } else if (provider === 'kimi') {
          apiKey = process.env.KIMI_API_KEY;
          if (!apiKey) {
            return { code: 503, message: 'Kimi API 密钥未配置' };
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
        const { message, context = {}, model: reqModel, thinking: reqThinking, provider: reqProvider } = data;
        if (!message) {
          return { code: 400, message: '缺少 message 参数' };
        }

        // [v8.1.0] 支持通过参数指定提供商，或从模型推断
        let provider = reqProvider || process.env.AI_PROVIDER || 'gemini';

        if (reqModel && !reqProvider) {
          for (const [pKey, pConfig] of Object.entries(AI_CONFIG)) {
            if (pConfig.models?.some(m => m.id === reqModel)) {
              provider = pKey;
              break;
            }
          }
        }

        const config = AI_CONFIG[provider];

        if (!config) {
          return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
        }

        // [v8.1.0] 按提供商获取 API 密钥
        let apiKey, secretId, secretKey;
        if (provider === 'gemini') {
          apiKey = process.env.GEMINI_API_KEY;
        } else if (provider === 'openai') {
          apiKey = process.env.OPENAI_API_KEY;
        } else if (provider === 'deepseek') {
          apiKey = process.env.DEEPSEEK_API_KEY;
        } else if (provider === 'kimi') {
          apiKey = process.env.KIMI_API_KEY;
        } else if (provider === 'hunyuan') {
          secretId = process.env.HUNYUAN_SECRET_ID;
          secretKey = process.env.HUNYUAN_SECRET_KEY;
        }

        if (!apiKey && !secretId) {
          return { code: 503, message: 'AI API 密钥未配置' };
        }

        const prompt = buildChatPrompt(message, context, data.memory);

        // [v8.0.0] 模型选择参数
        const modelOptions = {};
        if (reqModel) modelOptions.model = reqModel;
        if (reqThinking) modelOptions.thinking = reqThinking;

        console.log(`[timebankAI] AI 对话 - 用户: ${effectiveUid.substring(0, 8)}..., 提供商: ${provider}, 模型: ${reqModel || 'default'}`);

        // [v8.0.0-fix] 修复参数传递
        const requestConfig = provider === 'hunyuan'
            ? config.buildRequest(prompt, secretId, secretKey)
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

      /**
       * dailyCompanion - AI 每日伙伴关怀消息
       * [v8.2.0] 根据用户当日数据 + 历史记忆生成个性化关怀消息
       * 参数: { userData, memory, model, provider, thinking }
       * 返回: { code, message, usage }
       */
      case 'dailyCompanion': {
        const { userData, memory, model: reqModel, thinking: reqThinking, provider: reqProvider } = data;
        if (!userData) {
          return { code: 400, message: '缺少 userData 参数' };
        }

        let provider = reqProvider || process.env.AI_PROVIDER || 'deepseek';
        if (reqModel && !reqProvider) {
          for (const [pKey, pConfig] of Object.entries(AI_CONFIG)) {
            if (pConfig.models?.some(m => m.id === reqModel)) {
              provider = pKey;
              break;
            }
          }
        }

        const config = AI_CONFIG[provider];
        if (!config) {
          return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
        }

        let apiKey, secretId, secretKey;
        if (provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
        else if (provider === 'openai') apiKey = process.env.OPENAI_API_KEY;
        else if (provider === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY;
        else if (provider === 'kimi') apiKey = process.env.KIMI_API_KEY;
        else if (provider === 'hunyuan') {
          secretId = process.env.HUNYUAN_SECRET_ID;
          secretKey = process.env.HUNYUAN_SECRET_KEY;
        }

        if (!apiKey && !secretId) {
          return { code: 503, message: 'AI API 密钥未配置' };
        }

        const prompt = buildCompanionPrompt(userData, memory);

        const modelOptions = {};
        if (reqModel) modelOptions.model = reqModel;
        if (reqThinking) modelOptions.thinking = reqThinking;

        console.log(`[timebankAI] 每日伙伴 - 用户: ${effectiveUid.substring(0, 8)}..., 提供商: ${provider}`);

        const startTime = Date.now();
        const requestConfig = provider === 'hunyuan'
            ? config.buildRequest(prompt, secretId, secretKey)
            : config.buildRequest(prompt, apiKey, modelOptions);
        const response = await axios(requestConfig);
        const message = config.parseResponse(response);
        const elapsed = Date.now() - startTime;

        console.log(`[timebankAI] 伙伴消息生成成功 - 耗时: ${elapsed}ms, 长度: ${message.length}`);

        return {
          code: 0,
          message: message,
          provider: provider,
          model: reqModel || null,
          usage: {
            promptLength: prompt.length,
            messageLength: message.length,
            elapsedMs: elapsed
          }
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
 * 构建 AI 伙伴每日关怀 Prompt
 * [v8.2.0] 伙伴角色：温暖、真诚、不评判
 */
function buildCompanionPrompt(userData, memory) {
  const { summary, habits, sleep, period = '近7日' } = userData;
  const { recentNotes = [], observations = [], lastConversation = [] } = memory || {};

  let prompt = `【角色设定】\n`;
  prompt += `你是用户的 AI 伙伴，名字叫「时光」。你的语气温暖、真诚、像一位关心朋友的老友。\n`;
  prompt += `你不是冷冰冰的数据分析师，而是一个每天关注用户、为用户提供情绪支持和善意提醒的伙伴。\n\n`;

  prompt += `【语气要求】\n`;
  prompt += `- 温暖、鼓励、不评判\n`;
  prompt += `- 像朋友聊天一样自然，不要像报告\n`;
  prompt += `- 如果用户有进步，真诚祝贺\n`;
  prompt += `- 如果用户有需要关心的事，温柔提醒，不要指责\n`;
  prompt += `- 不要使用 Markdown 表格\n\n`;

  if (recentNotes.length > 0) {
    prompt += `【最近的关怀记录】\n`;
    recentNotes.forEach(n => {
      prompt += `${n.date}：${n.content.substring(0, 120)}\n`;
    });
    prompt += `\n`;
  }

  if (observations.length > 0) {
    prompt += `【持续观察】\n`;
    observations.forEach(o => {
      prompt += `- ${o}\n`;
    });
    prompt += `\n`;
  }

  if (lastConversation.length > 0) {
    prompt += `【最近对话】\n`;
    lastConversation.forEach(c => {
      const role = c.role === 'user' ? '用户' : '时光';
      prompt += `${role}：${c.content.substring(0, 80)}\n`;
    });
    prompt += `\n`;
  }

  // 今日数据
  if (summary) {
    prompt += `【今日概况】\n`;
    prompt += `${period}：获得 ${summary.totalEarnedFormatted || '0'}，消费 ${summary.totalSpentFormatted || '0'}\n`;
    prompt += `当前余额：${(summary.currentBalance || 0) >= 0 ? '盈余' : '透支'} ${formatDuration(Math.abs(summary.currentBalance || 0))}\n`;
    if (summary.earnChangePercent !== undefined) {
      prompt += `环比：获得变化 ${summary.earnChangePercent > 0 ? '+' : ''}${summary.earnChangePercent}%，消费变化 ${summary.spendChangePercent > 0 ? '+' : ''}${summary.spendChangePercent}%\n`;
    }
    prompt += `\n`;
  }

  if (habits && habits.length > 0) {
    const excellent = habits.filter(h => h.status === 'excellent');
    const critical = habits.filter(h => h.status === 'critical');
    if (excellent.length > 0) {
      prompt += `值得庆祝的习惯：${excellent.map(h => `${h.name}（连胜${h.streak}天，完成率${h.completionRate}%）`).join('、')}\n`;
    }
    if (critical.length > 0) {
      prompt += `需要关注的习惯：${critical.map(h => `${h.name}（完成率${h.completionRate}%）`).join('、')}\n`;
    }
    prompt += `\n`;
  }

  if (sleep && sleep.avgDuration) {
    prompt += `睡眠：平均 ${sleep.avgDuration}小时，质量${sleep.avgQuality}/10\n\n`;
  }

  prompt += `【任务】\n`;
  prompt += `根据以上信息，生成今天的个性化关怀消息（2-4段自然文字）。像朋友一样和用户说话。\n`;
  prompt += `如果有值得庆祝的事，真诚祝贺；如果有需要关心的事，温柔提醒。保持温暖自然的语气。\n`;

  return prompt;
}

/**
 * 构建洞察报告 Prompt
 * [v8.1.0] 双模式提示词：近7日（短期聚焦）/ 近30日（长期趋势）
 */
function buildInsightPrompt(userData) {
  const { summary, habits, tasks, sleep, rawData, period = '近7日' } = userData;

  let prompt = `以下是"时间银行"应用用户的近期行为数据。\n\n`;

  // [v8.1.0] 仅提供应用介绍、模式介绍、数据格式说明，不含分析要求
  prompt += `【关于时间银行】\n`;
  prompt += `时间银行是一款时间管理应用，用户通过"earn"记录产出性活动（工作、学习、锻炼等），通过"spend"记录消耗性活动（娱乐、休息等）。当前余额 = 历史累计 earn - spend，正数表示盈余，负数表示透支。\n\n`;

  prompt += `【当前报告模式】\n`;
  if (period === '近3日') {
    prompt += `本报告展示最近3天的时间数据，同时附带前3天的环比数据用于对比。每日明细包含最近6天的完整记录。\n\n`;
  } else if (period === '近7日') {
    prompt += `本报告展示最近7天的时间数据，同时附带前7天的环比数据用于对比。每日明细包含最近14天的完整记录。\n\n`;
  } else {
    prompt += `本报告展示最近30天的时间数据，同时附带前30天的环比数据用于对比。每日明细包含最近30天的完整记录。\n\n`;
  }

  prompt += `【数据格式说明】\n`;
  prompt += `- earn = 产出性活动（工作、学习、锻炼等），spend = 消耗性活动（娱乐、休息等）\n`;
  prompt += `- 当前余额 = 历史累计 earn - spend，正=盈余，负=透支\n`;
  prompt += `- streak = 习惯连续完成天数，completionRate = 近30天完成率\n`;
  prompt += `- 时间段：早晨(6-12点)、下午(12-18点)、晚上(18-24点)、深夜(0-6点)\n`;
  prompt += `- 习惯状态评级：excellent(≥80%) / good(≥60%) / fair(≥40%) / poor(≥20%) / critical(<20%)\n\n`;

  prompt += `【重要概念说明】\n`;
  prompt += `- 补录：用户手动对漏记的任务补记时间。交易时间戳是补录操作时间（非任务实际发生时间），但日期是正确的。\n`;
  prompt += `- 自动检测补录：系统自动检测用户使用某应用的时长，并在当天23:00统一结算为一条交易记录。这条交易的 amount 是全天累计的使用时长，但 timestamp 固定为23:00——它不代表用户在23:00使用了该应用，而是全天使用时长的「记账凭证」。\n`;
  prompt += `- 屏幕时间管理：系统检测用户全天手机使用时长，在23:00统一结算。如果超额则产生 spend（惩罚），如果未超额则产生 earn（奖励）。这条交易的 timestamp 同样是23:00，不代表用户在23:00才开始使用手机，而是全天手机使用时长的「记账凭证」。\n`;
  prompt += `- 关键结论：自动检测补录和屏幕时间管理的交易，其 timestamp 是「系统结算时间」，不是「用户实际使用时间」。在分析用户什么时间做什么事时，这些交易的时间戳没有任何参考意义。它们反映的是全天累计行为，不是23:00这个时间点的行为。\n`;
  prompt += `- 戒除模式（abstinence）：习惯的一种类型，目标是在周期内完全不进行某行为，达标=无交易记录或消费额度未超\n`;
  prompt += `- 均衡模式：根据当前余额动态调整 earn 倍率的系统机制\n`;
  prompt += `- 未分类：部分系统交易或补录交易可能缺少分类标签，已从任务配置中补全；仍显示未分类的属于系统交易\n\n`;

  if (summary) {
    prompt += `=== 时间收支 ===\n`;
    prompt += `当前余额：${formatDuration(Math.abs(summary.currentBalance || 0))}${(summary.currentBalance || 0) >= 0 ? '' : '（透支）'}\n`;
    prompt += `${period}：获得 ${summary.totalEarnedFormatted || '0'}，消费 ${summary.totalSpentFormatted || '0'}，净${summary.totalNet >= 0 ? '+' : ''}${summary.totalNetFormatted || '0'}\n`;
    if (summary.prevEarned !== undefined) {
      prompt += `上周期（${summary.prevDaysInPeriod}天）：获得 ${summary.prevEarnedFormatted || '0'}，消费 ${summary.prevSpentFormatted || '0'}\n`;
      prompt += `环比：获得变化 ${summary.earnChangePercent > 0 ? '+' : ''}${summary.earnChangePercent}%，消费变化 ${summary.spendChangePercent > 0 ? '+' : ''}${summary.spendChangePercent}%\n`;
    }
    prompt += `\n`;
  }

  if (rawData?.dailyBreakdown && rawData.dailyBreakdown.length > 0) {
    prompt += `=== 每日明细（${rawData.dailyBreakdown.length}天）===\n`;
    rawData.dailyBreakdown.forEach(d => {
      const tasks = d.topTasks && d.topTasks.length > 0 ? ` [${d.topTasks.join('、')}]` : '';
      prompt += `${d.date}：获得 ${formatDuration(d.earn)}，消费 ${formatDuration(d.spend)}，净${d.net >= 0 ? '+' : ''}${formatDuration(d.net)}${tasks}\n`;
    });
    prompt += `\n`;
  }

  if (rawData?.timeDistribution) {
    const td = rawData.timeDistribution;
    prompt += `=== 时间段分布 ===\n`;
    prompt += `以下统计已排除系统结算交易（屏幕时间管理、自动检测补录）。这些交易的 timestamp 是结算时间（23:00），不代表实际使用时段，因此不计入时段行为分析。\n`;
    prompt += `${td.morning.label}：获得 ${formatDuration(td.morning.earn)}，消费 ${formatDuration(td.morning.spend)}\n`;
    prompt += `${td.afternoon.label}：获得 ${formatDuration(td.afternoon.earn)}，消费 ${formatDuration(td.afternoon.spend)}\n`;
    prompt += `${td.evening.label}：获得 ${formatDuration(td.evening.earn)}，消费 ${formatDuration(td.evening.spend)}\n`;
    prompt += `${td.night.label}：获得 ${formatDuration(td.night.earn)}，消费 ${formatDuration(td.night.spend)}\n`;
    if ((td.settledEarn || 0) > 0 || (td.settledSpend || 0) > 0) {
      prompt += `【系统结算】（timestamp 为23:00，实际使用发生在全天，已从时段分析中排除）：获得 ${formatDuration(td.settledEarn || 0)}，消费 ${formatDuration(td.settledSpend || 0)}\n`;
    }
    prompt += `\n`;
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

  if (tasks && tasks.length > 0) {
    prompt += `=== 任务配置（全量）===\n`;
    tasks.forEach(t => {
      const tags = [];
      if (t.isHabit) tags.push(`习惯:${t.habitType || '普通'}${t.habitPeriod ? '/' + t.habitPeriod : ''}`);
      if (t.autoDetect) tags.push('自动检测');
      if (t.isSystem) tags.push('系统');
      if (t.enableFloatingTimer) tags.push('悬浮计时');
      const tagStr = tags.length > 0 ? ` [${tags.join(',')}]` : '';
      prompt += `- ${t.name}(${t.type},${t.category || '未分类'}${t.multiplier && t.multiplier !== 1 ? ',×' + t.multiplier : ''}${t.targetTime ? ',目标' + t.targetTime + 's' : ''})${tagStr}\n`;
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

  // [v8.1.0-fix] 输出格式说明：放在数据之后
  prompt += `【输出格式】\n`;
  prompt += `以上为用户原始数据。请输出有层次感的分析报告，可使用 ### 作为段落小标题、使用 - 作为列表项、使用 ** 加粗重点，使阅读清晰。\n`;
  prompt += `唯一限制：不要使用 Markdown 表格语法（| 列1 | 列2 |），表格在前端无法正常渲染。段落之间用空行分隔。\n`;

  return prompt;
}

/**
 * 构建对话 Prompt
 * [v8.2.0] 升级为伙伴角色，支持记忆上下文
 */
function buildChatPrompt(message, context, memory) {
  let prompt = `你是用户的 AI 伙伴「时光」。你的语气温暖、真诚、像一位关心朋友的老友。你不是冷冰冰的数据分析师，而是一个每天关注用户、为用户提供情绪支持和善意提醒的伙伴。\n\n`;

  if (memory && memory.observations && memory.observations.length > 0) {
    prompt += `【关于用户的记忆】\n`;
    memory.observations.forEach(o => {
      prompt += `- ${o}\n`;
    });
    prompt += `\n`;
  }

  if (memory && memory.lastConversation && memory.lastConversation.length > 0) {
    prompt += `【最近对话】\n`;
    memory.lastConversation.forEach(c => {
      const role = c.role === 'user' ? '用户' : '时光';
      prompt += `${role}：${c.content.substring(0, 100)}\n`;
    });
    prompt += `\n`;
  }

  if (context.userName) {
    prompt += `用户: ${context.userName}\n`;
  }

  prompt += `\n用户说: ${message}\n\n`;
  prompt += `请给出温暖、真诚、简洁的回复。像朋友聊天一样自然，不要像报告。不要输出 Markdown 表格。`;

  return prompt;
}
