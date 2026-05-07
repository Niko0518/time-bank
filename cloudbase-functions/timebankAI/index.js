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
        max_tokens: 1024,
        stream: false      // [v8.1.0-fix] 显式禁用流式响应
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
        max_tokens: 1500,  // [v8.0.0] 长prompt需要更多completion空间
        stream: false      // [v8.1.0-fix] 显式禁用流式响应，避免 Pro 模型出现 stream aborted 错误
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
        max_tokens: 1500,
        stream: false      // [v8.1.0-fix] 显式禁用流式响应
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
  const db = app.database();
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

  // [v8.2.0-fix] HTTP 访问服务不会自动注入 OPENID，优先从请求体获取
  const uid = context.OPENID || data?._openid || null;
  console.log(`[timebankAI] Action: ${action}, UID: ${uid ? uid.substring(0, 8) + '...' : 'null'}`);

  // [v8.0.0-cloud] getStatus 不需要登录，其他操作需要
  let effectiveUid = uid;
  if (!uid && action !== 'getStatus') {
    console.log(`[timebankAI] Warning: No UID for action ${action}`);
    return { code: 401, message: '未授权：请先登录' };
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

      /**
       * initMemoryInternal - 全量初始化（通道A：应用内部）
       * [v8.2.0] 接收用户全量数据，调用 AI 生成结构化画像，存入数据库
       * 参数: { fullData: { meta, transactions, tasks, habitHistory, dailySummaries } }
       * 返回: { code, message, cognitionVersion }
       */
      case 'initMemoryInternal': {
        const { fullData } = data;
        if (!fullData || !fullData.transactions) {
          return { code: 400, message: '缺少 fullData 参数' };
        }

        // 确保数据库集合存在
        await ensureCollections(db);

        // 1. 存储全量数据镜像（按月分片）
        await storeDataMirror(db, effectiveUid, fullData);

        // 2. 构建全量分析 Prompt
        const prompt = buildFullAnalysisPrompt(fullData);

        // 3. 调用 AI（使用 v4-pro 进行深度分析）
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          return { code: 503, message: 'DeepSeek API 密钥未配置' };
        }

        const deepseekConfig = AI_CONFIG.deepseek;
        const modelOptions = { model: 'deepseek-v4-pro', thinking: false };

        console.log(`[timebankAI] 全量初始化 - 用户: ${effectiveUid.substring(0, 8)}..., 交易数: ${fullData.transactions?.length || 0}`);

        const startTime = Date.now();
        const requestConfig = deepseekConfig.buildRequest(prompt, apiKey, modelOptions);
        const response = await axios(requestConfig);
        const aiText = deepseekConfig.parseResponse(response);
        const elapsed = Date.now() - startTime;

        // 4. 解析 AI 返回的画像
        const profile = parseProfileFromAIResponse(aiText);

        // 5. 生成自然语言摘要
        const summaryPrompt = `基于以下用户画像，用一句话总结这个用户（50字以内）：\n${JSON.stringify(profile, null, 2)}\n\n只输出总结句，不要任何其他内容。`;
        const summaryRequest = deepseekConfig.buildRequest(summaryPrompt, apiKey, { model: 'deepseek-v4-flash' });
        const summaryResponse = await axios(summaryRequest);
        const summary = deepseekConfig.parseResponse(summaryResponse).trim();

        // 6. 写入 tb_ai_user_brain
        const now = new Date();
        await db.collection('tb_ai_user_brain').add({
          _openid: effectiveUid,
          cognitionVersion: 1,
          lastAnalyzedAt: now,
          lastAnalysisMethod: 'internal_full',
          profile: profile,
          summary: summary,
          incrementalInsights: [],
          profileHistory: [{
            version: 1,
            profile: profile,
            createdAt: now
          }],
          externalProfile: null,
          externalProfileActive: false,
          createdAt: now,
          updatedAt: now
        });

        // 7. 初始化同步配置（默认关闭，等用户设置）
        const existingSchedule = await db.collection('tb_ai_sync_schedule').where({ _openid: effectiveUid }).limit(1).get();
        if (!existingSchedule.data || existingSchedule.data.length === 0) {
          await db.collection('tb_ai_sync_schedule').add({
            _openid: effectiveUid,
            scheduleTimes: [],
            timezone: 'Asia/Shanghai',
            enabled: false,
            defaultRole: 'auto',
            maxDailyFeedback: 5,
            display: {
              allowToast: true,
              allowBadge: true,
              quietHours: { enabled: true, start: '23:00', end: '07:00' }
            },
            createdAt: now,
            updatedAt: now
          });
        }

        console.log(`[timebankAI] 全量初始化成功 - 耗时: ${elapsed}ms, 画像字段数: ${Object.keys(profile).length}`);

        return {
          code: 0,
          message: 'AI 记忆初始化成功',
          cognitionVersion: 1,
          summary: summary,
          usage: { elapsedMs: elapsed }
        };
      }

      /**
       * importExternalProfile - 外部导入（通道B）
       * [v8.2.0] 接收外部 AI 分析生成的画像，合并/覆盖到 brain
       * 参数: { externalProfile: Object, mergeStrategy: 'override'|'merge'|'parallel' }
       * 返回: { code, message, cognitionVersion, mergeResult }
       */
      case 'importExternalProfile': {
        const { externalProfile, mergeStrategy = 'override' } = data;
        if (!externalProfile) {
          return { code: 400, message: '缺少 externalProfile 参数' };
        }

        await ensureCollections(db);

        // 1. 读取当前 brain（如果存在）
        const brainRes = await db.collection('tb_ai_user_brain').where({ _openid: effectiveUid }).limit(1).get();
        const existingBrain = brainRes.data && brainRes.data.length > 0 ? brainRes.data[0] : null;
        const preVersion = existingBrain ? existingBrain.cognitionVersion : 0;
        const newVersion = preVersion + 1;

        // 2. 记录导入历史
        const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.collection('tb_ai_external_import').add({
          _openid: effectiveUid,
          importId: importId,
          source: 'external',
          sourceDetail: data.sourceDetail || '用户外部导入',
          originalData: {
            format: 'json',
            content: JSON.stringify(externalProfile).substring(0, 10000),
            fileName: data.fileName || 'external_profile.json',
            uploadedAt: new Date()
          },
          externalProfile: externalProfile,
          mergeStrategy: mergeStrategy,
          status: 'merging',
          mergeResult: {
            appliedAt: new Date(),
            preVersion: preVersion,
            postVersion: newVersion,
            conflicts: [],
            mergedFields: [],
            overriddenFields: []
          },
          createdAt: new Date()
        });

        // 3. 按策略处理
        let finalProfile;
        const mergeResult = {
          appliedAt: new Date(),
          preVersion: preVersion,
          postVersion: newVersion,
          conflicts: [],
          mergedFields: [],
          overriddenFields: []
        };

        if (!existingBrain) {
          // 没有现有画像，直接写入
          finalProfile = externalProfile;
          mergeResult.overriddenFields = Object.keys(externalProfile);
        } else if (mergeStrategy === 'override') {
          finalProfile = externalProfile;
          mergeResult.overriddenFields = Object.keys(externalProfile);
        } else if (mergeStrategy === 'merge') {
          finalProfile = mergeProfiles(existingBrain.profile, externalProfile, mergeResult);
        } else {
          // parallel: 保留外部画像但不覆盖主画像
          finalProfile = existingBrain.profile;
        }

        // 4. 更新或创建 brain
        const now = new Date();
        if (existingBrain) {
          const updateData = {
            cognitionVersion: newVersion,
            lastAnalyzedAt: now,
            lastAnalysisMethod: 'external_import',
            profile: finalProfile,
            updatedAt: now,
            _openid: effectiveUid
          };
          if (mergeStrategy === 'parallel') {
            updateData.externalProfile = externalProfile;
            updateData.externalProfileActive = true;
          }
          // 添加版本历史
          const history = existingBrain.profileHistory || [];
          history.push({ version: preVersion, profile: existingBrain.profile, createdAt: now });
          if (history.length > 5) history.shift();
          updateData.profileHistory = history;

          await db.collection('tb_ai_user_brain').doc(existingBrain._id).update(updateData);
        } else {
          await db.collection('tb_ai_user_brain').add({
            _openid: effectiveUid,
            cognitionVersion: newVersion,
            lastAnalyzedAt: now,
            lastAnalysisMethod: 'external_import',
            profile: finalProfile,
            summary: '',
            incrementalInsights: [],
            profileHistory: [],
            externalProfile: mergeStrategy === 'parallel' ? externalProfile : null,
            externalProfileActive: mergeStrategy === 'parallel',
            createdAt: now,
            updatedAt: now
          });
        }

        // 5. 更新导入记录状态
        await db.collection('tb_ai_external_import').where({ importId: importId }).update({
          status: 'completed',
          'mergeResult': mergeResult,
          processedAt: new Date()
        });

        return {
          code: 0,
          message: '外部画像导入成功',
          cognitionVersion: newVersion,
          mergeStrategy: mergeStrategy,
          mergeResult: mergeResult
        };
      }

      /**
       * syncIncremental - 增量同步
       * [v8.2.0] 接收增量数据，结合全量画像分析，更新 brain 并生成反馈
       * 参数: { incrementalData: { newTransactions, habitUpdates, taskChanges, currentSummary, requestedRole } }
       * 返回: { code, message, feedbackIds, cognitionVersion }
       */
      case 'syncIncremental': {
        const { incrementalData } = data;
        if (!incrementalData) {
          return { code: 400, message: '缺少 incrementalData 参数' };
        }

        await ensureCollections(db);

        // 1. 读取当前 brain
        const brainRes = await db.collection('tb_ai_user_brain').where({ _openid: effectiveUid }).limit(1).get();
        if (!brainRes.data || brainRes.data.length === 0) {
          return { code: 404, message: '未找到用户画像，请先执行全量初始化' };
        }
        const brain = brainRes.data[0];

        // 2. 读取同步配置
        const scheduleRes = await db.collection('tb_ai_sync_schedule').where({ _openid: effectiveUid }).limit(1).get();
        const schedule = scheduleRes.data && scheduleRes.data.length > 0 ? scheduleRes.data[0] : null;

        // 3. 更新数据镜像（追加增量）
        await appendIncrementalToMirror(db, effectiveUid, incrementalData);

        // 4. 记录同步日志
        const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const syncLog = {
          _openid: effectiveUid,
          syncId: syncId,
          scheduledAt: incrementalData.scheduledAt ? new Date(incrementalData.scheduledAt) : new Date(),
          executedAt: new Date(),
          incrementalData: incrementalData,
          status: 'processing',
          preCognitionVersion: brain.cognitionVersion,
          analysisResult: null,
          aiCallMeta: null,
          createdAt: new Date()
        };
        await db.collection('tb_ai_incremental_log').add(syncLog);

        // 5. 构建增量分析 Prompt
        const prompt = buildIncrementalPrompt(brain, incrementalData);

        // 6. 调用 AI（使用 v4-flash，增量不需要太深）
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          await db.collection('tb_ai_incremental_log').where({ syncId: syncId }).update({
            status: 'failed',
            errorMessage: 'DeepSeek API 密钥未配置'
          });
          return { code: 503, message: 'DeepSeek API 密钥未配置' };
        }

        const deepseekConfig = AI_CONFIG.deepseek;
        const modelOptions = { model: 'deepseek-v4-flash', thinking: false };

        console.log(`[timebankAI] 增量同步 - 用户: ${effectiveUid.substring(0, 8)}..., syncId: ${syncId}`);

        const startTime = Date.now();
        let aiText;
        try {
          const requestConfig = deepseekConfig.buildRequest(prompt, apiKey, modelOptions);
          const response = await axios(requestConfig);
          aiText = deepseekConfig.parseResponse(response);
        } catch (aiError) {
          await db.collection('tb_ai_incremental_log').where({ syncId: syncId }).update({
            status: 'failed',
            errorMessage: aiError.message
          });
          throw aiError;
        }
        const elapsed = Date.now() - startTime;

        // 7. 解析 AI 返回
        let analysisResult;
        try {
          analysisResult = parseIncrementalResponse(aiText);
        } catch (parseError) {
          console.error('[timebankAI] 解析 AI 响应失败:', parseError);
          analysisResult = {
            profileUpdates: {},
            newInsights: [],
            feedbackMessages: [{
              type: 'care',
              role: 'companion',
              content: '我在分析你的最新数据时遇到了一点小问题，但这不影响我们之前的交流。',
              reason: 'AI 响应解析失败',
              priority: 1
            }]
          };
        }

        // 8. 更新画像
        const newVersion = (brain.cognitionVersion || 0) + 1;
        const updatedProfile = applyProfileUpdates(brain.profile, analysisResult.profileUpdates);
        const newInsights = (analysisResult.newInsights || []).map(insight => ({
          addedAt: new Date(),
          insight: insight,
          source: 'incremental_sync',
          cognitionVersion: newVersion
        }));
        const allInsights = [...(brain.incrementalInsights || []), ...newInsights].slice(-20); // 保留最近20条

        await db.collection('tb_ai_user_brain').doc(brain._id).update({
          cognitionVersion: newVersion,
          lastAnalyzedAt: new Date(),
          lastAnalysisMethod: 'internal_incremental',
          profile: updatedProfile,
          incrementalInsights: allInsights,
          updatedAt: new Date()
        });

        // 9. 生成反馈消息
        const feedbackIds = [];
        const requestedRole = incrementalData.requestedRole || (schedule ? schedule.defaultRole : 'auto');
        const messages = analysisResult.feedbackMessages || [];

        for (const msg of messages) {
          // 检查每日上限
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayCountRes = await db.collection('tb_ai_feedback').where({
            _openid: effectiveUid,
            createdAt: db.command.gte(todayStart)
          }).count();
          const todayCount = todayCountRes.total || 0;
          const maxDaily = schedule ? schedule.maxDailyFeedback : 5;

          if (todayCount >= maxDaily && msg.priority < 5) {
            console.log(`[timebankAI] 今日反馈已达上限 (${todayCount}/${maxDaily})，跳过低优先级消息`);
            continue;
          }

          const feedbackDoc = {
            _openid: effectiveUid,
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: msg.type || 'care',
            role: msg.role || requestedRole || 'auto',
            content: msg.content,
            source: 'incremental_sync',
            triggerReason: msg.reason || '增量同步分析',
            relatedSyncId: syncId,
            relatedCognitionVersion: newVersion,
            priority: msg.priority || 2,
            isRead: false,
            isShown: false,
            expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
            createdAt: new Date()
          };
          const addRes = await db.collection('tb_ai_feedback').add(feedbackDoc);
          feedbackIds.push(addRes.id);
        }

        // 10. 更新同步日志
        await db.collection('tb_ai_incremental_log').where({ syncId: syncId }).update({
          status: 'completed',
          'analysisResult': {
            profileUpdates: analysisResult.profileUpdates,
            newInsights: analysisResult.newInsights,
            generatedFeedbackIds: feedbackIds,
            postCognitionVersion: newVersion,
            rawAIResponse: aiText.substring(0, 5000)
          },
          aiCallMeta: {
            model: 'deepseek-v4-flash',
            promptTokens: Math.round(prompt.length / 4),
            completionTokens: Math.round(aiText.length / 4),
            responseTime: elapsed
          },
          completedAt: new Date()
        });

        console.log(`[timebankAI] 增量同步完成 - 新版本: ${newVersion}, 反馈数: ${feedbackIds.length}, 耗时: ${elapsed}ms`);

        return {
          code: 0,
          message: '增量同步完成',
          feedbackIds: feedbackIds,
          cognitionVersion: newVersion,
          feedbackCount: feedbackIds.length,
          usage: { elapsedMs: elapsed }
        };
      }

      /**
       * getSyncSchedule - 获取同步配置
       * 返回: { code, schedule }
       */
      case 'getSyncSchedule': {
        await ensureCollections(db);
        const res = await db.collection('tb_ai_sync_schedule').where({ _openid: effectiveUid }).limit(1).get();
        if (res.data && res.data.length > 0) {
          return { code: 0, schedule: res.data[0] };
        }
        return { code: 0, schedule: null };
      }

      /**
       * setSyncSchedule - 设置同步配置
       * 参数: { schedule: { scheduleTimes, enabled, defaultRole, maxDailyFeedback, display } }
       * 返回: { code, message }
       */
      case 'setSyncSchedule': {
        const { schedule } = data;
        if (!schedule) {
          return { code: 400, message: '缺少 schedule 参数' };
        }

        await ensureCollections(db);
        const res = await db.collection('tb_ai_sync_schedule').where({ _openid: effectiveUid }).limit(1).get();
        const now = new Date();

        if (res.data && res.data.length > 0) {
          await db.collection('tb_ai_sync_schedule').doc(res.data[0]._id).update({
            ...schedule,
            updatedAt: now,
            _openid: effectiveUid
          });
        } else {
          await db.collection('tb_ai_sync_schedule').add({
            _openid: effectiveUid,
            scheduleTimes: schedule.scheduleTimes || [],
            timezone: schedule.timezone || 'Asia/Shanghai',
            enabled: schedule.enabled !== undefined ? schedule.enabled : false,
            defaultRole: schedule.defaultRole || 'auto',
            maxDailyFeedback: schedule.maxDailyFeedback || 5,
            display: schedule.display || {
              allowToast: true,
              allowBadge: true,
              quietHours: { enabled: true, start: '23:00', end: '07:00' }
            },
            createdAt: now,
            updatedAt: now
          });
        }

        return { code: 0, message: '同步配置已保存' };
      }

      /**
       * getAIFeedback - 获取 AI 反馈消息
       * 参数: { unreadOnly: boolean, limit: number }
       * 返回: { code, messages }
       */
      case 'getAIFeedback': {
        const { unreadOnly = false, limit = 20 } = data;
        await ensureCollections(db);

        let query = db.collection('tb_ai_feedback').where({ _openid: effectiveUid });
        if (unreadOnly) {
          query = query.where({ isRead: false });
        }
        const res = await query.orderBy('createdAt', 'desc').limit(limit).get();

        return {
          code: 0,
          messages: res.data || [],
          count: res.data ? res.data.length : 0
        };
      }

      /**
       * markFeedbackRead - 标记反馈消息已读
       * 参数: { messageIds: string[] }
       * 返回: { code, message }
       */
      case 'markFeedbackRead': {
        const { messageIds } = data;
        if (!messageIds || !Array.isArray(messageIds)) {
          return { code: 400, message: '缺少 messageIds 参数' };
        }

        await ensureCollections(db);
        for (const id of messageIds) {
          await db.collection('tb_ai_feedback').doc(id).update({
            isRead: true,
            _openid: effectiveUid
          });
        }

        return { code: 0, message: `已标记 ${messageIds.length} 条消息已读` };
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

// ============================================================
// [v8.2.0] AI 统一认知体系辅助函数
// ============================================================

/**
 * [v8.2.0-fix] 确保数据库集合存在
 * CloudBase 不会自动创建集合，必须通过 createCollection 显式创建。
 * createCollection 是幂等的：集合已存在时返回成功，不会报错。
 */
async function ensureCollections(db) {
  const collections = [
    'tb_ai_user_brain',
    'tb_ai_data_mirror',
    'tb_ai_incremental_log',
    'tb_ai_feedback',
    'tb_ai_sync_schedule',
    'tb_ai_external_import',
    'tb_ai_memory'
  ];

  for (const name of collections) {
    try {
      await db.createCollection(name);
      console.log(`[ensureCollections] 创建/确认集合: ${name}`);
    } catch (e) {
      // 集合已存在或其他错误，忽略
      console.log(`[ensureCollections] ${name}: ${e.message || '已存在'}`);
    }
  }
}

/**
 * 存储全量数据镜像（按月分片）
 */
async function storeDataMirror(db, openid, fullData) {
  const { transactions, tasks, habitHistory, dailySummaries } = fullData;

  // 按月份分组交易
  const monthlyTransactions = {};
  if (transactions && Array.isArray(transactions)) {
    transactions.forEach(tx => {
      const d = new Date(tx.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTransactions[key]) monthlyTransactions[key] = [];
      monthlyTransactions[key].push({
        ts: tx.timestamp,
        t: tx.type === 'earn' ? 'e' : 's',
        n: tx.taskName || '',
        c: tx.category || '',
        a: tx.amount || 0,
        d: (tx.description || '').substring(0, 50)
      });
    });
  }

  // 按月份分组每日汇总
  const monthlyDaily = {};
  if (dailySummaries && Array.isArray(dailySummaries)) {
    dailySummaries.forEach(ds => {
      const d = new Date(ds.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyDaily[key]) monthlyDaily[key] = [];
      monthlyDaily[key].push({
        date: ds.date,
        e: ds.totalEarn || 0,
        s: ds.totalSpend || 0,
        n: (ds.totalEarn || 0) - (ds.totalSpend || 0),
        tasks: ds.taskCompletions || []
      });
    });
  }

  // 获取所有月份键
  const allMonths = new Set([...Object.keys(monthlyTransactions), ...Object.keys(monthlyDaily)]);

  // 写入或更新每个月的文档
  for (const month of allMonths) {
    const txs = monthlyTransactions[month] || [];
    const dailies = monthlyDaily[month] || [];
    const startDate = `${month}-01`;
    const endDateParts = month.split('-');
    const endDay = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]), 0).getDate();
    const endDate = `${month}-${String(endDay).padStart(2, '0')}`;

    // 检查是否已存在
    const existing = await db.collection('tb_ai_data_mirror').where({
      _openid: openid,
      yearMonth: month
    }).limit(1).get();

    const docData = {
      _openid: openid,
      yearMonth: month,
      transactions: txs,
      dailySummaries: dailies,
      recordCount: txs.length,
      dataRange: { start: new Date(startDate), end: new Date(endDate) },
      updatedAt: new Date()
    };

    if (existing.data && existing.data.length > 0) {
      await db.collection('tb_ai_data_mirror').doc(existing.data[0]._id).update(docData);
    } else {
      docData.createdAt = new Date();
      await db.collection('tb_ai_data_mirror').add(docData);
    }
  }

  console.log(`[timebankAI] 数据镜像存储完成: ${allMonths.size} 个月份`);
}

/**
 * 追加增量数据到镜像
 */
async function appendIncrementalToMirror(db, openid, incrementalData) {
  const { newTransactions } = incrementalData;
  if (!newTransactions || !Array.isArray(newTransactions) || newTransactions.length === 0) {
    return;
  }

  // 按月份分组
  const monthly = {};
  newTransactions.forEach(tx => {
    const d = new Date(tx.ts || tx.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[key]) monthly[key] = [];
    monthly[key].push({
      ts: tx.ts || tx.timestamp,
      t: tx.type === 'earn' ? 'e' : (tx.t === 'e' ? 'e' : 's'),
      n: tx.taskName || tx.n || '',
      c: tx.category || tx.c || '',
      a: tx.amount || tx.a || 0,
      d: (tx.description || '').substring(0, 50)
    });
  });

  for (const [month, txs] of Object.entries(monthly)) {
    const existing = await db.collection('tb_ai_data_mirror').where({
      _openid: openid,
      yearMonth: month
    }).limit(1).get();

    if (existing.data && existing.data.length > 0) {
      const doc = existing.data[0];
      const currentTxs = doc.transactions || [];
      // 去重：避免重复追加
      const existingIds = new Set(currentTxs.map(t => t.ts + '_' + t.n + '_' + t.a));
      const newTxs = txs.filter(t => !existingIds.has(t.ts + '_' + t.n + '_' + t.a));

      if (newTxs.length > 0) {
        await db.collection('tb_ai_data_mirror').doc(doc._id).update({
          transactions: [...currentTxs, ...newTxs],
          recordCount: currentTxs.length + newTxs.length,
          updatedAt: new Date(),
          _openid: openid
        });
      }
    } else {
      // 新增月份文档
      const startDate = `${month}-01`;
      const endDateParts = month.split('-');
      const endDay = new Date(parseInt(endDateParts[0]), parseInt(endDateParts[1]), 0).getDate();
      await db.collection('tb_ai_data_mirror').add({
        _openid: openid,
        yearMonth: month,
        transactions: txs,
        dailySummaries: [],
        recordCount: txs.length,
        dataRange: { start: new Date(startDate), end: new Date(`${month}-${String(endDay).padStart(2, '0')}`) },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }
}

/**
 * 构建全量分析 Prompt
 */
function buildFullAnalysisPrompt(fullData) {
  const { meta, transactions, tasks, habitHistory, dailySummaries } = fullData;

  let prompt = `你是一位顶尖的用户行为分析师。请分析以下用户的完整 TimeBank 数据，生成一份深度、精准、结构化的用户画像。\n\n`;
  prompt += `【关于 TimeBank】\n`;
  prompt += `时间银行是一款时间管理应用。用户通过"earn"记录产出性活动，通过"spend"记录消耗性活动。\n\n`;

  // 元数据
  prompt += `【使用概览】\n`;
  prompt += `- 使用总天数：${meta?.totalDays || '未知'}\n`;
  prompt += `- 交易总条数：${meta?.transactionCount || transactions?.length || 0}\n`;
  prompt += `- 应用版本：${meta?.version || '未知'}\n\n`;

  // 任务配置
  if (tasks && tasks.length > 0) {
    prompt += `【任务配置】（共 ${tasks.length} 个）\n`;
    tasks.slice(0, 50).forEach(t => {
      const habitInfo = t.isHabit ? ` [习惯:${t.habitType || '普通'}]` : '';
      prompt += `- ${t.name}(${t.type}, ${t.category || '未分类'})${habitInfo} 目标:${Math.round((t.targetTime || 0) / 60)}分钟\n`;
    });
    if (tasks.length > 50) prompt += `... 还有 ${tasks.length - 50} 个任务\n`;
    prompt += `\n`;
  }

  // 交易记录（按时间排序，取最近 500 条）
  if (transactions && transactions.length > 0) {
    const sorted = [...transactions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const recent = sorted.slice(-500);
    prompt += `【交易记录】（最近 ${recent.length} 条，按时间排序）\n`;
    prompt += `日期,时间,类型,任务,金额(分钟),分类\n`;
    recent.forEach(tx => {
      const d = new Date(tx.timestamp);
      const date = `${d.getMonth() + 1}-${d.getDate()}`;
      const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      const type = tx.type === 'earn' ? '收入' : '支出';
      const mins = Math.round((tx.amount || 0) / 60);
      prompt += `${date},${time},${type},${tx.taskName || ''},${mins},${tx.category || '未分类'}\n`;
    });
    if (transactions.length > 500) {
      prompt += `... 还有 ${transactions.length - 500} 条更早的记录未显示\n`;
    }
    prompt += `\n`;
  }

  // 习惯历史
  if (habitHistory && habitHistory.length > 0) {
    prompt += `【习惯完成历史】（最近 30 天）\n`;
    const recentHabits = habitHistory.slice(-30);
    recentHabits.forEach(h => {
      prompt += `${h.date}: ${h.habitId} ${h.completed ? '✓' : '✗'}${h.amount ? ` (${Math.round(h.amount / 60)}分钟)` : ''}\n`;
    });
    prompt += `\n`;
  }

  // 每日汇总
  if (dailySummaries && dailySummaries.length > 0) {
    prompt += `【每日汇总】（最近 30 天）\n`;
    const recentDaily = dailySummaries.slice(-30);
    recentDaily.forEach(ds => {
      const earn = Math.round((ds.totalEarn || 0) / 60);
      const spend = Math.round((ds.totalSpend || 0) / 60);
      const net = earn - spend;
      prompt += `${ds.date}: 收入${earn}分钟 支出${spend}分钟 净值${net >= 0 ? '+' : ''}${net}分钟\n`;
    });
    prompt += `\n`;
  }

  prompt += `【输出要求】\n`;
  prompt += `请输出严格的 JSON 格式，不要有任何解释文字。JSON 结构如下：\n`;
  prompt += `{\n`;
  prompt += `  "habits": {\n`;
  prompt += `    "strong": ["习惯名1", "习惯名2"],\n`;
  prompt += `    "weak": ["习惯名3"],\n`;
  prompt += `    "trending": {"习惯名": "上升|下降|稳定"}\n`;
  prompt += `  },\n`;
  prompt += `  "patterns": {\n`;
  prompt += `    "peakHours": ["09:00-11:00"],\n`;
  prompt += `    "lowHours": ["22:00-24:00"],\n`;
  prompt += `    "weekendDifference": "描述",\n`;
  prompt += `    "consistency": "描述"\n`;
  prompt += `  },\n`;
  prompt += `  "preferences": {\n`;
  prompt += `    "praiseStyle": "描述",\n`;
  prompt += `    "disciplineStyle": "描述",\n`;
  prompt += `    "sensitiveTopics": ["话题1"],\n`;
  prompt += `    "motivationTriggers": ["触发点1"]\n`;
  prompt += `  },\n`;
  prompt += `  "history": {\n`;
  prompt += `    "bestStreak": {"habit": "", "days": 0, "period": ""},\n`;
  prompt += `    "worstPeriod": {"period": "", "reason": ""}\n`;
  prompt += `  },\n`;
  prompt += `  "insights": ["洞察1", "洞察2"]\n`;
  prompt += `}\n`;
  prompt += `\n要求：\n`;
  prompt += `1. 只输出 JSON，不要任何其他文字\n`;
  prompt += `2. 基于数据事实分析，不要臆测\n`;
  prompt += `3. 如果某字段数据不足，填 null 或空数组\n`;
  prompt += `4. insights 要包含对用户的独特观察，至少 3 条\n`;

  return prompt;
}

/**
 * 构建增量分析 Prompt
 */
function buildIncrementalPrompt(brain, incrementalData) {
  const profile = brain.profile || {};
  const { newTransactions, habitUpdates, currentSummary, requestedRole } = incrementalData;

  let prompt = `你是用户的 AI 伙伴。请基于用户的长期画像和最新数据变化，生成反馈。\n\n`;

  // 用户画像
  prompt += `【用户长期画像】\n`;
  prompt += `强项习惯：${(profile.habits?.strong || []).join('、') || '无'}\n`;
  prompt += `薄弱习惯：${(profile.habits?.weak || []).join('、') || '无'}\n`;
  prompt += `高效时段：${(profile.patterns?.peakHours || []).join('、') || '未知'}\n`;
  prompt += `行为模式：${profile.patterns?.consistency || '未知'}\n`;
  prompt += `敏感话题：${(profile.preferences?.sensitiveTopics || []).join('、') || '无'}\n`;
  prompt += `激励点：${(profile.preferences?.motivationTriggers || []).join('、') || '无'}\n`;
  if (profile.insights && profile.insights.length > 0) {
    prompt += `已知洞察：\n`;
    profile.insights.slice(0, 5).forEach(i => prompt += `- ${i}\n`);
  }
  prompt += `\n`;

  // 增量数据
  prompt += `【新增数据】\n`;
  if (newTransactions && newTransactions.length > 0) {
    prompt += `新增交易（${newTransactions.length}条）：\n`;
    newTransactions.forEach(tx => {
      const d = new Date(tx.ts || tx.timestamp);
      const time = `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      const type = (tx.type === 'earn' || tx.t === 'e') ? '收入' : '支出';
      const mins = Math.round((tx.amount || tx.a || 0) / 60);
      prompt += `- ${time} ${type} ${tx.taskName || tx.n || ''} ${mins}分钟\n`;
    });
  }

  if (habitUpdates && habitUpdates.length > 0) {
    prompt += `\n习惯状态变化：\n`;
    habitUpdates.forEach(h => {
      prompt += `- ${h.habitId}: ${h.completed ? '完成' : '未完成'}, 连续${h.streak || 0}天\n`;
    });
  }

  if (currentSummary) {
    prompt += `\n今日汇总：\n`;
    prompt += `- 收入：${Math.round((currentSummary.todayEarn || 0) / 60)}分钟\n`;
    prompt += `- 支出：${Math.round((currentSummary.todaySpend || 0) / 60)}分钟\n`;
    prompt += `- 净值：${Math.round((currentSummary.todayNet || 0) / 60)}分钟\n`;
    if (currentSummary.todayHabits) {
      prompt += `- 习惯：${Object.entries(currentSummary.todayHabits).map(([k, v]) => `${k}${v ? '✓' : '✗'}`).join(' ')}\n`;
    }
  }
  prompt += `\n`;

  // 角色偏好
  const role = requestedRole || 'auto';
  if (role === 'companion') {
    prompt += `【当前角色：温暖陪伴者】\n用温暖、鼓励的语气，像关心朋友一样说话。\n`;
  } else if (role === 'instructor') {
    prompt += `【当前角色：严格教官】\n用严格但关心的语气，指出问题并鞭策改进。\n`;
  } else if (role === 'analyst') {
    prompt += `【当前角色：冷静分析师】\n用客观、分析的语气，提供数据洞察。\n`;
  } else {
    prompt += `【当前角色：自动判断】\n根据事件类型自动选择最合适的角色语气。表扬用温暖语气，问题用严格语气，异常用分析语气。\n`;
  }

  prompt += `\n【输出要求】\n`;
  prompt += `请输出严格的 JSON 格式：\n`;
  prompt += `{\n`;
  prompt += `  "profileUpdates": {"字段路径": "新值"},\n`;
  prompt += `  "newInsights": ["新洞察1"],\n`;
  prompt += `  "feedbackMessages": [\n`;
  prompt += `    {\n`;
  prompt += `      "type": "care|discipline|praise|analysis|alert",\n`;
  prompt += `      "role": "companion|analyst|instructor",\n`;
  prompt += `      "content": "消息内容（自然、口语化，像人对人说话）",\n`;
  prompt += `      "reason": "触发原因",\n`;
  prompt += `      "priority": 1-5\n`;
  prompt += `    }\n`;
  prompt += `  ]\n`;
  prompt += `}\n`;
  prompt += `\n要求：\n`;
  prompt += `1. 只输出 JSON，不要任何其他文字\n`;
  prompt += `2. feedbackMessages 最多 3 条，每条 100 字以内\n`;
  prompt += `3. content 必须自然口语化，禁止书面报告语气\n`;
  prompt += `4. priority: 5=紧急警告（如通宵刷视频），4=重要提醒，3=一般反馈，2=日常关怀，1=随口一提\n`;
  prompt += `5. 如果今天没有特别值得说的事，feedbackMessages 可以为空数组\n`;

  return prompt;
}

/**
 * 从 AI 响应中解析画像 JSON
 */
function parseProfileFromAIResponse(text) {
  try {
    // 尝试直接解析
    const cleaned = text.trim();
    if (cleaned.startsWith('{')) {
      return JSON.parse(cleaned);
    }
    // 尝试提取 JSON 块
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    console.error('[timebankAI] 解析画像 JSON 失败:', e.message);
  }

  // 兜底：返回基础结构
  return {
    habits: { strong: [], weak: [], trending: {} },
    patterns: { peakHours: [], lowHours: [], weekendDifference: '', consistency: '' },
    preferences: { praiseStyle: '', disciplineStyle: '', sensitiveTopics: [], motivationTriggers: [] },
    history: { bestStreak: null, worstPeriod: null },
    insights: []
  };
}

/**
 * 解析增量分析响应
 */
function parseIncrementalResponse(text) {
  try {
    const cleaned = text.trim();
    if (cleaned.startsWith('{')) {
      return JSON.parse(cleaned);
    }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    console.error('[timebankAI] 解析增量响应失败:', e.message);
  }

  return {
    profileUpdates: {},
    newInsights: [],
    feedbackMessages: []
  };
}

/**
 * 应用画像更新
 */
function applyProfileUpdates(profile, updates) {
  if (!updates || Object.keys(updates).length === 0) return profile;

  const result = JSON.parse(JSON.stringify(profile)); // 深拷贝

  for (const [path, value] of Object.entries(updates)) {
    const keys = path.split('.');
    let current = result;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  return result;
}

/**
 * 合并两个画像（智能合并）
 */
function mergeProfiles(existing, external, mergeResult) {
  const result = JSON.parse(JSON.stringify(existing));

  // 合并 habits
  if (external.habits) {
    if (external.habits.strong) {
      const newStrong = external.habits.strong.filter(h => !result.habits?.strong?.includes(h));
      if (!result.habits) result.habits = {};
      if (!result.habits.strong) result.habits.strong = [];
      result.habits.strong = [...result.habits.strong, ...newStrong];
      mergeResult.mergedFields.push('habits.strong');
    }
    if (external.habits.weak) {
      const newWeak = external.habits.weak.filter(h => !result.habits?.weak?.includes(h));
      if (!result.habits.weak) result.habits.weak = [];
      result.habits.weak = [...result.habits.weak, ...newWeak];
      mergeResult.mergedFields.push('habits.weak');
    }
    if (external.habits.trending) {
      if (!result.habits.trending) result.habits.trending = {};
      Object.assign(result.habits.trending, external.habits.trending);
      mergeResult.mergedFields.push('habits.trending');
    }
  }

  // 合并 patterns
  if (external.patterns) {
    if (!result.patterns) result.patterns = {};
    Object.assign(result.patterns, external.patterns);
    mergeResult.mergedFields.push('patterns');
  }

  // 合并 preferences（外部优先）
  if (external.preferences) {
    if (!result.preferences) result.preferences = {};
    for (const [key, val] of Object.entries(external.preferences)) {
      if (JSON.stringify(result.preferences[key]) !== JSON.stringify(val)) {
        mergeResult.conflicts.push({ field: `preferences.${key}`, internalValue: result.preferences[key], externalValue: val, resolution: 'external' });
      }
      result.preferences[key] = val;
    }
    mergeResult.overriddenFields.push('preferences');
  }

  // 合并 history（取最佳）
  if (external.history) {
    if (!result.history) result.history = {};
    if (external.history.bestStreak && (external.history.bestStreak.days || 0) > (result.history.bestStreak?.days || 0)) {
      result.history.bestStreak = external.history.bestStreak;
      mergeResult.overriddenFields.push('history.bestStreak');
    }
    mergeResult.mergedFields.push('history');
  }

  // 合并 insights（取并集）
  if (external.insights && Array.isArray(external.insights)) {
    if (!result.insights) result.insights = [];
    const newInsights = external.insights.filter(i => !result.insights.includes(i));
    result.insights = [...result.insights, ...newInsights];
    mergeResult.mergedFields.push('insights');
  }

  return result;
}
