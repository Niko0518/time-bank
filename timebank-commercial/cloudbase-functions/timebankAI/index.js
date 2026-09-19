/**
 * TimeBank AI 云函数 - timebankAI
 * [v9.5.x] 重构版：仅保留 tb_ai_brain + tb_ai_messages 两个集合
 * [v9.15.4] 新增 MiniMax M3 支持，作为默认 AI 提供商
 * 支持：多模型代理、自动报告、AI 对话、brain 全量初始化/增量同步
 *
 * 环境变量（在 CloudBase 控制台配置）：
 *   AI_PROVIDER          - 默认: cloudbase (可选: minimax, deepseek, kimi, gemini, openai)
 *   CLOUDBASE_AI_API_KEY - CloudBase AI 服务端 API Key（未配置时使用内置 Key）
 *   MINIMAX_API_KEY      - MiniMax (MiniMax) API 密钥
 *   DEEPSEEK_API_KEY     - DeepSeek API 密钥
 *   KIMI_API_KEY         - Kimi (Moonshot) API 密钥
 *   GEMINI_API_KEY       - Google Gemini API 密钥
 *   OPENAI_API_KEY       - OpenAI API 密钥
 */

const cloud = require('@cloudbase/node-sdk');
const axios = require('axios');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLLECTIONS = {
  BRAIN: 'tb_ai_brain',
  MESSAGES: 'tb_ai_messages'
};

const DEFAULT_SETTINGS = {
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
  reportSchedule: { daily: true, weekly: true, monthly: true, time: '21:00' }
};

const AI_CONFIG = {
  gemini: {
    name: 'Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    buildRequest: (prompt, apiKey, options = {}) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${options.model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 55000,
      data: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500,
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

  openai: {
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    buildRequest: (prompt, apiKey, options = {}) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 55000,
      data: {
        model: options.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false
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
      const payload = {
        model: model,
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        stream: false
      };
      if (options.thinking && model.includes('pro')) {
        payload.thinking = { type: 'enabled' };
        payload.reasoning_effort = options.reasoningEffort || 'medium';
      }
      return {
        url: 'https://api.deepseek.com/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 55000,
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
      { id: 'kimi-k2.6', name: 'K2.6', desc: 'Kimi 迄今最智能的模型，上下文 256k' }
    ],
    buildRequest: (prompt, apiKey, options = {}) => {
      const model = options.model || 'kimi-k2.6';
      const isK2Model = model.startsWith('kimi-k2');
      const payload = {
        model: model,
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxTokens || 1500,
        stream: false
      };
      if (!isK2Model) payload.temperature = 0.7;
      if (isK2Model) payload.thinking = options.thinking ? { type: 'enabled' } : { type: 'disabled' };
      return {
        url: 'https://api.moonshot.cn/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 55000,
        data: payload
      };
    },
    parseResponse: (response) => {
      if (response.data?.error) {
        console.error('[timebankAI] Kimi API 错误:', JSON.stringify(response.data.error).substring(0, 500));
        throw new Error(`Kimi API 错误: ${response.data.error.message || '未知错误'}`);
      }
      const choice = response.data?.choices?.[0];
      const text = choice?.message?.content || choice?.message?.reasoning_content || choice?.text;
      if (!text) {
        console.error('[timebankAI] Kimi 响应异常:', JSON.stringify(response.data).substring(0, 500));
        throw new Error('Kimi 返回格式异常');
      }
      return text;
    }
  },

  // [v9.15.4] MiniMax（MiniMax）M3 接入 - 默认 provider
  // 端点：https://api.minimaxi.com/v1/text/chatcompletion_v2
  // 模型：MiniMax-M3（百万上下文，默认开启思考）
  minimax: {
    name: 'MiniMax',
    apiUrl: 'https://api.minimaxi.com/v1/text/chatcompletion_v2',
    models: [
      { id: 'MiniMax-M3', name: 'M3', desc: 'MiniMax 旗舰 M3，百万上下文，前沿 Coding & Agentic 能力' }
    ],
    buildRequest: (prompt, apiKey, options = {}) => {
      const model = options.model || 'MiniMax-M3';
      const payload = {
        model,
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxTokens || 1500,
        stream: false,
        temperature: 0.7
      };
      // M3 默认开启思考（adaptive），云端走默认即可；可通过 options.thinking 显式控制
      payload.thinking = options.thinking ? { type: 'enabled' } : { type: 'disabled' };
      return {
        url: 'https://api.minimaxi.com/v1/text/chatcompletion_v2',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 55000,
        data: payload
      };
    },
    parseResponse: (response) => {
      // MiniMax 错误结构：base_resp.status_code !== 0
      if (response.data?.base_resp && response.data.base_resp.status_code && response.data.base_resp.status_code !== 0) {
        console.error('[timebankAI] MiniMax API 错误:', JSON.stringify(response.data.base_resp).substring(0, 500));
        throw new Error(`MiniMax API 错误: ${response.data.base_resp.status_msg || response.data.base_resp.status_code}`);
      }
      const choice = response.data?.choices?.[0];
      const text = choice?.message?.content || choice?.message?.reasoning_content || choice?.text;
      if (!text) {
        console.error('[timebankAI] MiniMax 响应异常:', JSON.stringify(response.data).substring(0, 500));
        throw new Error('MiniMax 返回格式异常');
      }
      return text;
    }
  },

  // [v9.35.0] CloudBase AI 资源点通道 - 默认 provider
  // 端点：OpenAI 兼容网关（走 19.9 个人版套餐内资源点，无需另购 Token）
  // 模型：控制台 → AI → 生文模型 中个人版可开启的 4 个模型
  // Key：服务端 API Key（控制台 → 环境配置 → API Key 创建，client_type=server）
  cloudbase: {
    name: 'CloudBase',
    apiUrl: 'https://cloud1-8gvjsmyd7860b4a3.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions',
    models: [
      { id: 'hy3', name: '混元 hy3', desc: '指令主力：对话/报告/意图解析（默认）' },
      { id: 'hunyuan-role-latest', name: '混元角色扮演', desc: '角色扮演场景（伙伴关怀）' },
      { id: 'hy-role', name: 'hy-role', desc: '角色扮演（轻量）' },
      { id: 'hy-mt2-pro', name: '混元翻译 Pro', desc: '翻译场景' }
    ],
    buildRequest: (prompt, apiKey, options = {}) => ({
      url: 'https://cloud1-8gvjsmyd7860b4a3.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 55000,
      data: {
        model: options.model || 'hy3',
        messages: [
          { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供建议。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: options.maxTokens || 1500,
        stream: false
      }
    }),
    parseResponse: (response) => {
      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) {
        console.error('[timebankAI] CloudBase AI 响应异常:', JSON.stringify(response.data).substring(0, 500));
        throw new Error('CloudBase AI 返回格式异常');
      }
      return text;
    }
  }
};

// ============================================================
// [v9.36.0] 任务卡片背景图生成：CloudBase 资源点 hunyuan-image（替代 MiniMax image-01）
// 背景：文生图原走 MiniMax 需用户自填 Key；改用环境套餐内资源点，零边际成本。
// 仅 Node SDK 支持生图（ai.createImageModel），故把生图逻辑收编云函数。
// 大数据量经 HTTP 网关有体积/耗时限制（见 ASR 的 413 教训），因此在云函数内直接上传云存储，
// 只回传 downloadUrl，避免 base64 在网关往返。
async function handleGenerateTaskImage(uid, data) {
  const taskInfo = (data && data.taskInfo) || {};
  const name = (taskInfo.name || '').trim();
  if (!name) return { code: 400, message: '缺少任务名 name' };

  // 用户一句话描述（timebot 指令）优先；否则以任务信息构造意象
  let subject = '';
  const userPrompt = (data && data.prompt ? String(data.prompt) : '').trim();
  if (userPrompt) {
    subject = userPrompt;
  } else {
    const category = (taskInfo.category || '').trim();
    const note = (taskInfo.note || '').trim();
    subject = `任务「${name}」${category ? `，分类：${category}` : ''}${note ? `，备注：${note}` : ''}`;
  }

  const imagePrompt = `${subject}

【风格与构图要求】
- 抽象水彩/印象派艺术风格
- 主体居中或符合黄金分割，主体偏虚避免抢眼
- 色调温暖柔和，适合作为 UI 卡片背景
- 无任何文字、无人物特写、无可识别人物
- 背景简洁干净，边缘不要有过多细节`;

  console.log(`[timebankAI] 生成任务背景图 - 用户: ${uid.substring(0, 8)}..., 任务: ${name}, prompt长度: ${imagePrompt.length}`);

  // 生图（仅 Node SDK；revise=false 提速，单图通常在网关限制内完成）
  const ai = app.ai();
  const imageModel = ai.createImageModel('hunyuan-image');
  const genRes = await imageModel.generateImage({
    model: 'HY-Image-3.0-Plus-4090-Tob-v1.0',
    prompt: imagePrompt,
    size: '1024x1024',
    revise: false
  });

  // 生成 URL（仅 24h 有效）→ 下载字节 → 上传云存储持久化 → 回传永久 tempFileURL
  const url = genRes && genRes.data && genRes.data[0] && genRes.data[0].url;
  if (!url) {
    console.error('[timebankAI] 生图接口未返回图片地址:', JSON.stringify(genRes).substring(0, 500));
    return { code: 500, message: '生图服务未返回图片地址' };
  }
  const imgResp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const mimeType = (imgResp.headers && imgResp.headers['content-type']) || 'image/jpeg';
  const extMime = mimeType.toLowerCase();
  const ext = extMime.includes('webp') ? 'webp' : (extMime.includes('png') ? 'png' : 'jpg');
  const safeBase = String(name).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
  const cloudPath = `task-bg/${uid}/${safeBase}_${Date.now()}.${ext}`;

  const uploadRes = await app.uploadFile({ cloudPath, fileContent: Buffer.from(imgResp.data) });
  const fileID = uploadRes && uploadRes.fileID;
  if (!fileID) {
    return { code: 500, message: '背景图上传云存储失败' };
  }
  const urlRes = await app.getTempFileURL({ fileList: [fileID] });
  const downloadUrl = urlRes && urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
  if (!downloadUrl) {
    return { code: 500, message: '背景图链接获取失败' };
  }

  console.log(`[timebankAI] 生图完成并上传 - 任务: ${name}, mime: ${mimeType}, cloudPath: ${cloudPath}`);

  return {
    code: 0,
    downloadUrl,
    mimeType,
    visualDescription: imagePrompt
  };
}

// [v9.35.0] CloudBase AI 服务端 API Key（内置，优先读环境变量 CLOUDBASE_AI_API_KEY）
const CLOUDBASE_AI_API_KEY_BUILTIN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJhdWQiOiJjbG91ZDEtOGd2anNteWQ3ODYwYjRhMyIsImV4cCI6MjUzNDAyMzAwNzk5LCJpYXQiOjE3ODY4NzI0MTgsImF0X2hhc2giOiJBcVh5M1pjbVFTZVFpalJwRVlkVGFRIiwicHJvamVjdF9pZCI6ImNsb3VkMS04Z3Zqc215ZDc4NjBiNGEzIiwibWV0YSI6eyJwbGF0Zm9ybSI6IkFwaUtleSJ9LCJhZG1pbmlzdHJhdG9yX2lkIjoiMjAxMDY1OTY2NDIxNjIzNjAzNCIsInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3NlcnZlciIsImlzX3N5c3RlbV9hZG1pbiI6dHJ1ZX0.f2340SaD4Yh50p__1rr0ZSE8kl1wMSC6tIlbxhMTIq7GF9D1-1eK85xtAvQbwLEOgwWekFcfWOkhgC4vkEMWAcjSChdSRvWvj7G99KSECfzydkUkolO7zMiXrkI3HgxRi14kIxcne4kdTMfQqospByzVGbSjeWqfmNXe7OEcZ8WuGxxDwAR2dVxdLwzQvJ-JBgOMtlNnuOWdouwn1Lt0__Po9t1eofN1j-lZb8V1LNIFsYZImSWlbOUtcUjbqgAhtDTmSGaxhl7iEkm9eBURL9cf_lDfz-Z6VgutYnk47QwoEpL-udlhDvJ8hj6UhLSvIV6L8O_wLa-_2lmTFofM6g';

exports.main = async (event, context) => {
  const db = app.database();
  let action, data = {};

  if (event.httpMethod) {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    action = body.action;
    data = body.data || {};
    console.log(`[timebankAI] HTTP trigger, action: ${action}`);
  } else {
    action = event.action;
    data = event.data || {};
  }

  const uid = context.OPENID || data?._openid || null;
  console.log(`[timebankAI] Action: ${action}, UID: ${uid ? uid.substring(0, 8) + '...' : 'null'}`);

  if (!uid && action !== 'getStatus') {
    return { code: 401, message: '未授权：请先登录' };
  }

  // 为兼容旧接口保留原始 action 标识
  data.__action = action;

  try {
    await ensureCollections(db);

    switch (action) {
      case 'getStatus':
        return await handleGetStatus();

      case 'asr':
        // [v9.35.0-fix3] 语音识别：base64 WAV → 腾讯云一句话识别
        return await handleASR(uid, data);

      case 'generateTaskImage':
        // [v9.36.0] 任务卡片背景图生成：CloudBase 资源点 hunyuan-image（零边际成本，替代 MiniMax）
        return await handleGenerateTaskImage(uid, data);

      case 'generateReport':
      case 'generateInsight':
        return await handleGenerateReport(db, uid, data);

      case 'generateCompanion':
      case 'dailyCompanion':
        return await handleGenerateCompanion(db, uid, data);

      case 'chat':
        return await handleChat(db, uid, data);

      case 'initBrain':
      case 'initMemoryInternal':
        return await handleInitBrain(db, uid, data);

      case 'syncBrain':
      case 'syncIncremental':
        return await handleSyncBrain(db, uid, data);

      case 'getBrain':
        return await handleGetBrain(db, uid);

      case 'getHomeState':
        return await handleGetHomeState(db, uid);

      case 'getReports':
        return await handleGetReports(db, uid, data);

      case 'getChatHistory':
        return await handleGetChatHistory(db, uid, data);

      case 'getMessages':
      case 'getAIFeedback':
        return await handleGetMessages(db, uid, data);

      case 'markRead':
      case 'markMessagesRead':
      case 'markFeedbackRead':
        return await handleMarkMessagesRead(db, uid, data);

      case 'checkScheduledReport':
        return await handleCheckScheduledReport(db, uid, data);

      case 'getSyncSchedule':
        return await handleGetSyncSchedule(db, uid);

      case 'setSyncSchedule':
        return await handleSetSyncSchedule(db, uid, data);

      case 'updateBrainSettings':
        return await handleUpdateBrainSettings(db, uid, data);

      default:
        return { code: 400, message: `未知操作: ${action}` };
    }
  } catch (error) {
    console.error(`[timebankAI] action=${action} 失败:`, error.message);
    // 打印更详细的生图失败信息（404 时 body 常含"模型未启用/未开通"等精确原因）
    if (error && error.response) {
      try {
        const detail = typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data)
          : String(error.response.data || '');
        console.error(`[timebankAI] action=${action} 失败详情(status=${error.response.status}):`, detail.substring(0, 800));
      } catch (_) { /* ignore */ }
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return { code: 504, message: 'AI 服务响应超时，请检查网络连接或稍后重试' };
    }
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      if (status === 429) return { code: 429, message: 'AI 服务请求过于频繁，请稍后再试' };
      if (status === 401 || status === 403) return { code: 503, message: 'AI 服务认证失败，请检查 API 密钥配置' };
      return { code: 502, message: `AI 服务错误: ${errorData?.error?.message || error.message}` };
    }
    return { code: 500, message: error.message || '服务端错误' };
  }
};

// ============================================================
// Action handlers
// ============================================================

// [v9.35.0-fix3] 语音识别（ASR）：腾讯云一句话识别（SentenceRecognition）
// 背景：荣耀等设备的原生识别服务第三方不可绑定，Google 服务国内不可达，
// 改为应用自录 16k mono WAV → base64 上传本云函数 → 转发腾讯云一句话识别。
// [v9.35.0-security] 密钥不再硬编码（曾因 push 被 GitHub Push Protection 拦截，密钥已泄漏需在腾讯云控制台禁用）
// 强制走环境变量：部署后在 CloudBase 控制台为 timebankAI 配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY
const ASR_SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const ASR_SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';

async function handleASR(uid, data) {
  const audio = data && data.audio;
  const format = (data && data.format) || 'wav';
  const fileID = data && data.fileID;
  if (!audio && !fileID) {
    return { code: 400, message: '缺少音频数据' };
  }
  if (!ASR_SECRET_ID || !ASR_SECRET_KEY) {
    return { code: 503, message: '语音识别密钥未配置：请部署后在云函数环境变量配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY' };
  }
  try {
    const asrSdk = require('tencentcloud-sdk-nodejs-asr');
    const AsrClient = asrSdk.asr.v20190614.Client;
    const client = new AsrClient({
      credential: { secretId: ASR_SECRET_ID, secretKey: ASR_SECRET_KEY },
      region: 'ap-shanghai',
      profile: { httpProfile: { timeout: 15000 } }
    });
    // [v9.35.0-fix4] fileID 模式：云存储中转，取临时 URL 交给 ASR 服务端拉取（绕开 HTTP body 限制）
    // [v9.35.0-fix6] 根因修复：node-sdk getTempFileURL 返回字段为 download_url（实测），
    // 非 tempFileUrl——此前字段名不匹配导致所有中转识别误报"临时链接失败"
    let url = '';
    if (fileID) {
      const tmp = await app.getTempFileURL({ fileList: [fileID] });
      const f = tmp && tmp.fileList && tmp.fileList[0];
      url = f && (f.download_url || f.tempFileUrl || f.tempFileURL || '');
      if (!url) {
        console.error('[timebankAI] getTempFileURL 无链接:', JSON.stringify(tmp).substring(0, 300));
        return { code: 500, message: '获取音频临时链接失败' };
      }
    }
    const resp = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: '16k_zh',
      SourceType: fileID ? 0 : 1,
      VoiceFormat: format,
      Url: url,
      Data: fileID ? '' : audio,
      DataLen: fileID ? 0 : Buffer.byteLength(audio, 'base64')
    });
    console.log(`[timebankAI] ASR 成功 (uid=${uid ? uid.substring(0, 8) : 'null'}, mode=${fileID ? 'url' : 'data'}): ${resp && resp.Result}`);
    return { code: 0, text: (resp && resp.Result) || '' };
  } catch (e) {
    console.error('[timebankAI] ASR 失败:', e && e.message);
    return { code: 502, message: '语音识别失败：' + (e && e.message ? e.message : '未知错误') };
  } finally {
    // 识别结束（无论成败）删除中转音频文件，避免存储残留
    if (fileID) {
      try { await app.deleteFile({ fileList: [fileID] }); } catch (e) { /* 忽略 */ }
    }
  }
}

async function handleGetStatus() {
  const defaultProvider = process.env.AI_PROVIDER || 'cloudbase';
  const availableProviders = [];
  const allModels = [];

  // [v9.35.0] cloudbase 通道（资源点 + 内置 Key）恒可用，始终置顶
  availableProviders.push({ key: 'cloudbase', name: AI_CONFIG.cloudbase.name });
  AI_CONFIG.cloudbase.models.forEach(m => allModels.push({ ...m, provider: 'cloudbase' }));

  const checks = [
    { key: 'gemini', keyEnv: 'GEMINI_API_KEY' },
    { key: 'openai', keyEnv: 'OPENAI_API_KEY' },
    { key: 'deepseek', keyEnv: 'DEEPSEEK_API_KEY' },
    { key: 'kimi', keyEnv: 'KIMI_API_KEY' },
    { key: 'minimax', keyEnv: 'MINIMAX_API_KEY' }
  ];

  checks.forEach(({ key, keyEnv }) => {
    if (process.env[keyEnv]) {
      const config = AI_CONFIG[key];
      if (config) {
        availableProviders.push({ key, name: config.name });
        if (config.models) {
          config.models.forEach(m => allModels.push({ ...m, provider: key }));
        }
      }
    }
  });

  const available = availableProviders.length > 0;
  const result = {
    code: 0,
    available,
    provider: defaultProvider,
    providerName: AI_CONFIG[defaultProvider]?.name || defaultProvider,
    message: available
      ? `已配置 ${availableProviders.map(p => p.name).join('、')}，共 ${allModels.length} 个模型可选`
      : `AI 服务未配置: ${defaultProvider}`,
    providers: availableProviders
  };
  if (allModels.length > 0) result.models = allModels;
  return result;
}

async function handleGenerateReport(db, uid, data) {
  const { userData, type, provider: reqProvider, model: reqModel, thinking: reqThinking } = data;
  if (!userData) return { code: 400, message: '缺少 userData 参数' };

  const period = normalizeReportPeriod(type || userData.period || data.period || 'weekly');
  const { provider, config, apiKey } = resolveProviderAndKey(reqProvider, reqModel);
  if (!config) return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
  if (!apiKey) return { code: 503, message: `${config.name} API 密钥未配置` };

  const prompt = buildReportPrompt(userData, period);
  const maxTokensMap = { daily: 500, weekly: 800, monthly: 1000 };
  const options = { model: reqModel, thinking: reqThinking, maxTokens: maxTokensMap[period] || 800 };

  console.log(`[timebankAI] 生成报告 - 用户: ${uid.substring(0, 8)}..., 类型: ${period}, 提供商: ${provider}, 模型: ${reqModel || 'default'}, prompt长度: ${prompt.length}`);

  const startTime = Date.now();
  const report = await callAI(provider, prompt, apiKey, options);
  const elapsed = Date.now() - startTime;
  console.log(`[timebankAI] 报告生成完成 - 耗时: ${elapsed}ms, 报告长度: ${report.length}`);

  const messageId = await addMessage(db, uid, {
    type: `report_${period}`,
    role: 'assistant',
    content: report,
    meta: { period, provider, model: reqModel || null, usage: { elapsedMs: elapsed, promptLength: prompt.length, reportLength: report.length } },
    isRead: false
  });

  return {
    code: 0,
    report,
    messageId,
    provider,
    model: reqModel || null,
    usage: { promptLength: prompt.length, reportLength: report.length, elapsedMs: elapsed }
  };
}

async function handleGenerateCompanion(db, uid, data) {
  const { userData, memory, provider: reqProvider, model: reqModel, thinking: reqThinking } = data;
  if (!userData) return { code: 400, message: '缺少 userData 参数' };

  const { provider, config, apiKey } = resolveProviderAndKey(reqProvider, reqModel);
  if (!config) return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
  if (!apiKey) return { code: 503, message: `${config.name} API 密钥未配置` };

  const prompt = buildCompanionPrompt(userData, memory);
  const options = { model: reqModel, thinking: reqThinking };

  console.log(`[timebankAI] 生成伙伴关怀 - 用户: ${uid.substring(0, 8)}..., 提供商: ${provider}`);

  const startTime = Date.now();
  const message = await callAI(provider, prompt, apiKey, options);
  const elapsed = Date.now() - startTime;

  const messageId = await addMessage(db, uid, {
    type: 'companion',
    role: 'companion',
    content: message,
    meta: { provider, model: reqModel || null, usage: { elapsedMs: elapsed, promptLength: prompt.length, messageLength: message.length } },
    isRead: false
  });

  return {
    code: 0,
    message,
    messageId,
    provider,
    model: reqModel || null,
    usage: { promptLength: prompt.length, messageLength: message.length, elapsedMs: elapsed }
  };
}

async function handleChat(db, uid, data) {
  const { message, context = {}, provider: reqProvider, model: reqModel, thinking: reqThinking } = data;
  if (!message) return { code: 400, message: '缺少 message 参数' };

  const { provider, config, apiKey } = resolveProviderAndKey(reqProvider, reqModel);
  if (!config) return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
  if (!apiKey) return { code: 503, message: `${config.name} API 密钥未配置` };

  // 拉取近期对话上下文
  const historyRes = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: 'chat' })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  const history = (historyRes.data || []).slice().reverse();

  const prompt = buildChatPrompt(message, context, history);
  const options = { model: reqModel, thinking: reqThinking };

  console.log(`[timebankAI] AI 对话 - 用户: ${uid.substring(0, 8)}..., 提供商: ${provider}, 模型: ${reqModel || 'default'}`);

  const userMsgId = await addMessage(db, uid, {
    type: 'chat',
    role: 'user',
    content: message,
    meta: { provider, model: reqModel || null },
    isRead: true
  });

  const reply = await callAI(provider, prompt, apiKey, options);

  const assistantMsgId = await addMessage(db, uid, {
    type: 'chat',
    role: 'assistant',
    content: reply,
    meta: { provider, model: reqModel || null, replyTo: userMsgId },
    isRead: false
  });

  return { code: 0, reply, messageId: assistantMsgId, provider, model: reqModel || null };
}

async function handleInitBrain(db, uid, data) {
  const { fullData, provider: reqProvider, model: reqModel, thinking: reqThinking, force } = data;
  // [v9.36.0] 时区修复：优先采用前端按设备本地时区构建好的 prompt（data.prompt），
  // 避免云服务器（UTC）重建时把中国用户的白天操作换算到凌晨
  const clientPrompt = (typeof data.prompt === 'string' && data.prompt.trim().length > 10)
    ? data.prompt.trim()
    : '';

  const existing = await getBrainDoc(db, uid);
  const isPlaceholder = !existing || (existing.cognitionVersion || 0) === 0 || existing.lastAnalysisMethod === 'empty_placeholder';

  // 已存在有效 brain 时直接返回（幂等）。仅当用户显式要求"重新初始化"（force=true）时强制重算。
  if (existing && !isPlaceholder && !force) {
    return {
      code: 0,
      message: 'AI 记忆已存在',
      cognitionVersion: existing.cognitionVersion || 1,
      summary: existing.summary || '',
      existed: true
    };
  }

  // 无可用的全量数据时，创建一个空 brain 占位
  if (!fullData || !Array.isArray(fullData.transactions)) {
    const brain = existing || await createEmptyBrain(db, uid);
    return {
      code: 0,
      message: '已创建基础 brain（数据不足，待增量同步后完善）',
      cognitionVersion: 1,
      summary: brain.summary,
      existed: false
    };
  }

  const { provider, config, apiKey } = resolveProviderAndKey(reqProvider, reqModel);
  if (!config) return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
  if (!apiKey) return { code: 503, message: `${config.name} API 密钥未配置` };

  const prompt = clientPrompt || buildFullAnalysisPrompt(fullData);
  const options = { model: reqModel, thinking: reqThinking, maxTokens: 1500 };

  console.log(`[timebankAI] 全量初始化 brain - 用户: ${uid.substring(0, 8)}..., 交易数: ${fullData.transactions.length}, 提供商: ${provider}, 模型: ${reqModel || 'default'}`);

  const startTime = Date.now();
  const aiText = await callAI(provider, prompt, apiKey, options);
  const profile = parseProfileFromAIResponse(aiText);
  const elapsed = Date.now() - startTime;

  const summary = await generateSummary(provider, apiKey, profile, options);

  const now = new Date();
  const brainDoc = {
    _openid: uid,
    cognitionVersion: 1,
    lastAnalyzedAt: now,
    lastAnalysisMethod: 'internal_full',
    profile,
    summary,
    incrementalInsights: [],
    profileHistory: [{ version: 1, profile, createdAt: now }],
    settings: existing?.settings || { ...DEFAULT_SETTINGS },
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  let brainId;
  if (existing) {
    await db.collection(COLLECTIONS.BRAIN).doc(existing._id).update(brainDoc);
    brainId = existing._id;
  } else {
    const addRes = await db.collection(COLLECTIONS.BRAIN).add(brainDoc);
    brainId = addRes.id;
  }

  await addMessage(db, uid, {
    type: 'feedback',
    role: 'analyst',
    content: `已为你建立 AI 认知档案：${summary}`,
    meta: { source: 'initBrain', provider: 'deepseek', model: 'deepseek-v4-pro', usage: { elapsedMs: elapsed } },
    isRead: false
  });

  return {
    code: 0,
    message: 'AI 记忆初始化成功',
    cognitionVersion: 1,
    summary,
    brainId,
    usage: { elapsedMs: elapsed }
  };
}

async function handleSyncBrain(db, uid, data) {
  const { incrementalData, provider: reqProvider, model: reqModel, thinking: reqThinking } = data;
  if (!incrementalData) return { code: 400, message: '缺少 incrementalData 参数' };

  let brain = await getBrainDoc(db, uid);

  // 若 brain 不存在，自动用增量数据兜底创建
  if (!brain) {
    await createEmptyBrain(db, uid);
    brain = await getBrainDoc(db, uid);
  }

  const { provider, config, apiKey } = resolveProviderAndKey(reqProvider, reqModel);
  if (!config) return { code: 400, message: `不支持的 AI 提供商: ${provider}` };
  if (!apiKey) return { code: 503, message: `${config.name} API 密钥未配置` };

  // 构建增量分析 Prompt
  const prompt = buildIncrementalPrompt(brain, incrementalData);
  const options = { model: reqModel, thinking: reqThinking };

  console.log(`[timebankAI] 增量同步 brain - 用户: ${uid.substring(0, 8)}..., 提供商: ${provider}, 模型: ${reqModel || 'default'}`);

  const startTime = Date.now();
  const aiText = await callAI(provider, prompt, apiKey, options);
  const elapsed = Date.now() - startTime;

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

  // 更新画像
  const newVersion = (brain.cognitionVersion || 0) + 1;
  const updatedProfile = applyProfileUpdates(brain.profile, analysisResult.profileUpdates);
  const newInsights = (analysisResult.newInsights || []).map(insight => ({
    addedAt: new Date(),
    insight,
    source: 'incremental_sync',
    cognitionVersion: newVersion
  }));
  const allInsights = [...(brain.incrementalInsights || []), ...newInsights].slice(-20);

  await db.collection(COLLECTIONS.BRAIN).doc(brain._id).update({
    cognitionVersion: newVersion,
    lastAnalyzedAt: new Date(),
    lastAnalysisMethod: 'internal_incremental',
    profile: updatedProfile,
    incrementalInsights: allInsights,
    updatedAt: new Date()
  });

  // 生成反馈消息（受每日上限控制）
  const settings = brain.settings || DEFAULT_SETTINGS;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCountRes = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: 'feedback', createdAt: db.command.gte(todayStart) })
    .count();
  const todayCount = todayCountRes.total || 0;
  const maxDaily = settings.maxDailyFeedback || DEFAULT_SETTINGS.maxDailyFeedback;

  const feedbackIds = [];
  const messages = analysisResult.feedbackMessages || [];
  for (const msg of messages) {
    if (todayCount >= maxDaily && (msg.priority || 2) < 5) {
      console.log(`[timebankAI] 今日反馈已达上限 (${todayCount}/${maxDaily})，跳过低优先级消息`);
      continue;
    }
    const id = await addMessage(db, uid, {
      type: 'feedback',
      role: msg.role || 'companion',
      content: msg.content,
      meta: {
        source: 'incremental_sync',
        triggerReason: msg.reason || '增量同步分析',
        priority: msg.priority || 2,
        relatedCognitionVersion: newVersion
      },
      isRead: false
    });
    feedbackIds.push(id);
  }

  console.log(`[timebankAI] 增量同步完成 - 新版本: ${newVersion}, 反馈数: ${feedbackIds.length}, 耗时: ${elapsed}ms`);

  return {
    code: 0,
    message: '增量同步完成',
    feedbackCount: feedbackIds.length,
    cognitionVersion: newVersion,
    usage: { elapsedMs: elapsed }
  };
}

async function handleGetBrain(db, uid) {
  const brain = await getBrainDoc(db, uid);
  if (!brain) return { code: 404, message: '未找到用户画像，请先执行全量初始化' };
  return { code: 0, brain: sanitizeBrain(brain) };
}

async function handleGetMessages(db, uid, data) {
  const { type, unreadOnly = false, limit = 20, offset = 0 } = data;
  let query = db.collection(COLLECTIONS.MESSAGES).where({ _openid: uid });

  // 兼容旧接口 getAIFeedback：默认只看 companion/feedback
  if (actionIsLegacyFeedback(data.__action)) {
    query = query.where({ type: db.command.in(['companion', 'feedback']) });
  } else if (type) {
    query = query.where({ type });
  }

  if (unreadOnly) query = query.where({ isRead: false });

  const res = await query.orderBy('createdAt', 'desc').limit(limit).get();
  const messages = (res.data || []).slice(offset);
  return { code: 0, messages, count: messages.length };
}

async function handleMarkMessagesRead(db, uid, data) {
  const { messageIds } = data;
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return { code: 400, message: '缺少 messageIds 参数' };
  }
  for (const id of messageIds) {
    await db.collection(COLLECTIONS.MESSAGES).doc(id).update({ isRead: true, _openid: uid });
  }
  return { code: 0, message: `已标记 ${messageIds.length} 条消息已读` };
}

async function handleGetHomeState(db, uid) {
  const brain = await getBrainDoc(db, uid);
  const summary = brain?.summary || 'AI 正在了解你，稍后将基于你的数据生成画像。';

  const unreadRes = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, isRead: false })
    .count();
  const unreadCount = unreadRes.total || 0;

  const dailyRes = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: 'report_daily' })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  const latestDailyReport = dailyRes.data && dailyRes.data.length > 0 ? dailyRes.data[0] : null;

  return {
    code: 0,
    greeting: summary,
    unreadCount,
    latestDailyReport
  };
}

async function handleGetReports(db, uid, data) {
  const { type = 'daily', limit = 20 } = data;
  const reportType = `report_${type}`;
  const res = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: reportType })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return { code: 0, reports: res.data || [] };
}

async function handleGetChatHistory(db, uid, data) {
  const { limit = 50 } = data;
  const res = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: 'chat' })
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return { code: 0, messages: (res.data || []).slice().reverse() };
}

async function handleCheckScheduledReport(db, uid, data) {
  const now = new Date();
  const settings = (await getBrainDoc(db, uid))?.settings || DEFAULT_SETTINGS;
  const schedule = settings.reportSchedule || DEFAULT_SETTINGS.reportSchedule;
  if (!schedule || !schedule.enabled) return { code: 0, needGenerate: false };

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const scheduledTime = schedule.time || '08:00';
  if (Math.abs(timeToMinutes(currentTime) - timeToMinutes(scheduledTime)) > 5) {
    return { code: 0, needGenerate: false };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const res = await db.collection(COLLECTIONS.MESSAGES)
    .where({ _openid: uid, type: 'report_daily', createdAt: db.command.gte(today) })
    .count();
  if (res.total > 0) return { code: 0, needGenerate: false };

  return { code: 0, needGenerate: true, scheduledType: 'daily' };
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

async function handleGetSyncSchedule(db, uid) {
  const brain = await getBrainDoc(db, uid);
  const schedule = brain?.settings || DEFAULT_SETTINGS;
  return { code: 0, schedule };
}

async function handleSetSyncSchedule(db, uid, data) {
  const { schedule } = data;
  if (!schedule) return { code: 400, message: '缺少 schedule 参数' };
  await updateBrainSettings(db, uid, schedule);
  return { code: 0, message: '同步配置已保存' };
}

async function handleUpdateBrainSettings(db, uid, data) {
  const { settings } = data;
  if (!settings) return { code: 400, message: '缺少 settings 参数' };
  await updateBrainSettings(db, uid, settings);
  return { code: 0, message: 'brain 设置已更新' };
}

// ============================================================
// Database helpers
// ============================================================

async function ensureCollections(db) {
  for (const name of Object.values(COLLECTIONS)) {
    try {
      await db.createCollection(name);
      console.log(`[ensureCollections] 创建/确认集合: ${name}`);
    } catch (e) {
      console.log(`[ensureCollections] ${name}: ${e.message || '已存在'}`);
    }
  }
}

async function getBrainDoc(db, uid) {
  const res = await db.collection(COLLECTIONS.BRAIN).where({ _openid: uid }).limit(1).get();
  return res.data && res.data.length > 0 ? res.data[0] : null;
}

async function createEmptyBrain(db, uid) {
  const now = new Date();
  const doc = {
    _openid: uid,
    cognitionVersion: 0,
    lastAnalyzedAt: now,
    lastAnalysisMethod: 'empty_placeholder',
    profile: emptyProfile(),
    summary: 'AI 正在了解你，稍后将基于你的数据生成画像。',
    incrementalInsights: [],
    profileHistory: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now
  };
  const addRes = await db.collection(COLLECTIONS.BRAIN).add(doc);
  doc._id = addRes.id;
  return doc;
}

async function updateBrainSettings(db, uid, patch) {
  const brain = await getBrainDoc(db, uid);
  const now = new Date();
  if (brain) {
    await db.collection(COLLECTIONS.BRAIN).doc(brain._id).update({
      settings: { ...(brain.settings || DEFAULT_SETTINGS), ...patch },
      updatedAt: now
    });
  } else {
    await db.collection(COLLECTIONS.BRAIN).add({
      _openid: uid,
      cognitionVersion: 0,
      profile: emptyProfile(),
      summary: '',
      incrementalInsights: [],
      profileHistory: [],
      settings: { ...DEFAULT_SETTINGS, ...patch },
      createdAt: now,
      updatedAt: now
    });
  }
}

async function addMessage(db, uid, msg) {
  const doc = {
    _openid: uid,
    ...msg,
    createdAt: new Date()
  };
  const res = await db.collection(COLLECTIONS.MESSAGES).add(doc);
  return res.id;
}

function sanitizeBrain(brain) {
  const clone = JSON.parse(JSON.stringify(brain));
  // 移除可能的内部字段，保持输出简洁
  delete clone._openid;
  return clone;
}

function emptyProfile() {
  return {
    habits: { strong: [], weak: [], trending: {} },
    patterns: { peakHours: [], lowHours: [], weekendDifference: '', consistency: '' },
    preferences: { praiseStyle: '', disciplineStyle: '', sensitiveTopics: [], motivationTriggers: [] },
    history: { bestStreak: null, worstPeriod: null },
    insights: []
  };
}

function actionIsLegacyFeedback(action) {
  return action === 'getAIFeedback';
}

// ============================================================
// AI provider helpers
// ============================================================

function resolveProviderAndKey(reqProvider, reqModel) {
  let provider = reqProvider || process.env.AI_PROVIDER || 'cloudbase';

  if (reqModel && !reqProvider) {
    for (const [pKey, pConfig] of Object.entries(AI_CONFIG)) {
      if (pConfig.models?.some(m => m.id === reqModel)) {
        provider = pKey;
        break;
      }
    }
  }

  const config = AI_CONFIG[provider];
  if (!config) return { provider, config: null, apiKey: null };

  const keyMap = {
    cloudbase: process.env.CLOUDBASE_AI_API_KEY || CLOUDBASE_AI_API_KEY_BUILTIN,
    gemini: process.env.GEMINI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    kimi: process.env.KIMI_API_KEY,
    minimax: process.env.MINIMAX_API_KEY
  };

  return { provider, config, apiKey: keyMap[provider] || null };
}

async function callAI(provider, prompt, apiKey, options = {}) {
  const config = AI_CONFIG[provider];
  if (!config) throw new Error(`不支持的 AI 提供商: ${provider}`);
  if (!apiKey) throw new Error(`${config.name} API 密钥未配置`);

  const requestConfig = config.buildRequest(prompt, apiKey, options);
  const response = await axios(requestConfig);
  let text = config.parseResponse(response);

  // 过滤思考过程（当 thinking 未启用时）
  if (!options.thinking && text) {
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }
  return text;
}

async function generateSummary(provider, apiKey, profile, options = {}) {
  try {
    const prompt = `基于以下用户画像，用一句话总结这个用户（50字以内）：\n${JSON.stringify(profile, null, 2)}\n\n只输出总结句，不要任何其他内容。`;
    const summary = await callAI(provider, prompt, apiKey, options);
    return summary.trim();
  } catch (e) {
    console.warn('[timebankAI] 生成 summary 失败:', e.message);
    return '';
  }
}

// ============================================================
// Period helpers
// ============================================================

function normalizeReportPeriod(period) {
  const p = String(period).trim();
  if (p === '近3日' || p === 'daily' || p === '今日' || p === '今天') return 'daily';
  if (p === '近7日' || p === 'weekly' || p === '本周' || p === '周') return 'weekly';
  if (p === '近30日' || p === 'monthly' || p === '本月' || p === '月') return 'monthly';
  return 'weekly';
}

// ============================================================
// Prompt builders
// ============================================================

function buildReportPrompt(userData, period) {
  const { summary, habits, sleep, rawData } = userData;

  const periodTextMap = {
    daily: '今日',
    weekly: '本周',
    monthly: '本月'
  };
  const periodText = periodTextMap[period] || period;

  let prompt = `你是时间银行 AI 助手。时间银行中，earn=产出，spend=消耗，余额=累计earn-spend。\n\n`;
  prompt += `请根据以下${periodText}数据生成${period === 'daily' ? '日报' : period === 'weekly' ? '周报' : '月报'}。\n\n`;

  if (summary) {
    prompt += `【收支】余额${(summary.currentBalance || 0) >= 0 ? '盈余' : '透支'}${formatDuration(Math.abs(summary.currentBalance || 0))}；${periodText}获得${summary.totalEarnedFormatted || '0'}，消费${summary.totalSpentFormatted || '0'}，净${summary.totalNet >= 0 ? '+' : ''}${summary.totalNetFormatted || '0'}`;
    if (summary.prevEarned !== undefined) {
      prompt += `；环比获得${summary.earnChangePercent > 0 ? '+' : ''}${summary.earnChangePercent}%，消费${summary.spendChangePercent > 0 ? '+' : ''}${summary.spendChangePercent}%`;
    }
    prompt += `\n\n`;
  }

  if (period === 'daily') {
    if (habits && habits.length > 0) {
      prompt += `【习惯】${habits.slice(0, 5).map(h => `${h.name}(${h.completionRate}%)`).join('，')}\n\n`;
    }
    if (sleep) {
      prompt += `【睡眠】${sleep.avgDuration}小时/质量${sleep.avgQuality}\n\n`;
    }
    prompt += `【要求】80字左右，温暖像朋友，只说今天亮点、一个提醒、明天一个小建议。`;
  } else {
    if (rawData?.dailyBreakdown && rawData.dailyBreakdown.length > 0) {
      prompt += `【每日】${rawData.dailyBreakdown.map(d => `${d.date}:获${formatDuration(d.earn)}消${formatDuration(d.spend)}`).join('；')}\n\n`;
    }
    if (rawData?.taskBreakdown && rawData.taskBreakdown.length > 0) {
      prompt += `【主要任务】${rawData.taskBreakdown.slice(0, 8).map(t => `${t.name}(${t.category})${t.totalTime}`).join('，')}\n\n`;
    }
    if (habits && habits.length > 0) {
      prompt += `【习惯】${habits.slice(0, 8).map(h => `${h.name}(${h.completionRate}%)`).join('，')}\n\n`;
    }
    if (sleep) {
      prompt += `【睡眠】${sleep.avgDuration}小时/质量${sleep.avgQuality}\n\n`;
    }
    prompt += `【要求】语气温暖像朋友，`;
    if (period === 'weekly') {
      prompt += `250字左右，用###小标题，包含整体表现、习惯进展、下周建议。`;
    } else {
      prompt += `350字左右，用###小标题，包含整体趋势、习惯变化、下月目标。`;
    }
  }

  return prompt;
}

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
    recentNotes.forEach(n => { prompt += `${n.date}：${String(n.content || '').substring(0, 120)}\n`; });
    prompt += `\n`;
  }

  if (observations.length > 0) {
    prompt += `【持续观察】\n`;
    observations.forEach(o => { prompt += `- ${o}\n`; });
    prompt += `\n`;
  }

  if (lastConversation.length > 0) {
    prompt += `【最近对话】\n`;
    lastConversation.forEach(c => {
      const role = c.role === 'user' ? '用户' : '时光';
      prompt += `${role}：${String(c.content || '').substring(0, 80)}\n`;
    });
    prompt += `\n`;
  }

  if (summary) {
    prompt += `【今日概况】\n`;
    prompt += `${period}：获得 ${summary.totalEarnedFormatted || '0'}，消费 ${summary.totalSpentFormatted || '0'}\n`;
    prompt += `当前余额：${(summary.currentBalance || 0) >= 0 ? '盈余' : '透支'} ${formatDuration(Math.abs(summary.currentBalance || 0))}\n\n`;
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

  return prompt;
}

function buildChatPrompt(message, context, history) {
  let prompt = `你是用户的 AI 伙伴「时光」。你的语气温暖、真诚、像一位关心朋友的老友。你不是冷冰冰的数据分析师，而是一个每天关注用户、为用户提供情绪支持和善意提醒的伙伴。\n\n`;

  if (context.userName) {
    prompt += `用户: ${context.userName}\n`;
  }

  if (history && history.length > 0) {
    prompt += `【最近对话】\n`;
    history.forEach(m => {
      const role = m.role === 'user' ? '用户' : '时光';
      prompt += `${role}：${String(m.content || '').substring(0, 120)}\n`;
    });
    prompt += `\n`;
  }

  prompt += `用户说: ${message}\n\n`;
  prompt += `请给出温暖、真诚、简洁的回复。像朋友聊天一样自然，不要像报告。不要输出 Markdown 表格。`;

  return prompt;
}

function buildFullAnalysisPrompt(fullData) {
  const { meta, transactions, tasks, habitHistory, dailySummaries } = fullData;

  let prompt = `你是一位顶尖的用户行为分析师。请分析以下用户的完整 TimeBank 数据，生成一份深度、精准、结构化的用户画像。\n\n`;
  prompt += `【关于 TimeBank】\n`;
  prompt += `时间银行是一款时间管理应用。用户通过"earn"记录产出性活动，通过"spend"记录消耗性活动。\n\n`;

  // [v9.36.0] 明确总条数为"累计值"并给出程序算好的日均，避免 AI 把累计当成单日
  const txCount = meta?.transactionCount || (Array.isArray(transactions) ? transactions.length : 0) || 0;
  const totalDays = meta?.totalDays || 0;
  const dailyAvg = (totalDays > 0 && txCount > 0) ? (txCount / totalDays).toFixed(1) : null;
  prompt += `【使用概览】\n`;
  prompt += `- 使用总天数：${totalDays || '未知'}\n`;
  prompt += `- 交易总条数：${txCount} 条（这是近 ${totalDays || '多'} 天的「累计」总条数，不是单日条数）\n`;
  if (dailyAvg) prompt += `- 日均交易数：约 ${dailyAvg} 条/天（由程序计算得出，请直接采用此数值，切勿自行换算或夸大）\n`;
  prompt += `- 应用版本：${meta?.version || '未知'}\n\n`;

  if (tasks && tasks.length > 0) {
    prompt += `【任务配置】（共 ${tasks.length} 个）\n`;
    tasks.slice(0, 20).forEach(t => {
      const habitInfo = t.isHabit ? ` [习惯:${t.habitType || '普通'}]` : '';
      prompt += `- ${t.name}(${t.type}, ${t.category || '未分类'})${habitInfo} 目标:${Math.round((t.targetTime || 0) / 60)}分钟\n`;
    });
    if (tasks.length > 20) prompt += `... 还有 ${tasks.length - 20} 个任务\n`;
    prompt += `\n`;
  }

  if (transactions && transactions.length > 0) {
    const sorted = [...transactions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const recent = sorted.slice(-100);
    prompt += `【交易记录】（最近 ${recent.length} 条，时间为『本地时间』，已含星期即可据此分析工作日/周末差异）\n`;
    const WEEKS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    recent.forEach(tx => {
      const d = new Date(tx.timestamp);
      const date = `${d.getMonth() + 1}-${d.getDate()}(${WEEKS[d.getDay()] || ''})`;
      const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      const type = tx.type === 'earn' ? '收入' : '支出';
      const mins = Math.round((tx.amount || 0) / 60);
      prompt += `${date},${time},${type},${tx.taskName || ''},${mins},${tx.category || '未分类'}\n`;
    });
    if (transactions.length > 100) prompt += `... 还有 ${transactions.length - 100} 条更早的记录未显示\n`;
    prompt += `\n`;
  }

  if (habitHistory && habitHistory.length > 0) {
    prompt += `【习惯完成历史】（最近 30 天）\n`;
    habitHistory.slice(-30).forEach(h => {
      prompt += `${h.date}: ${h.habitId} ${h.completed ? '✓' : '✗'}${h.amount ? ` (${Math.round(h.amount / 60)}分钟)` : ''}\n`;
    });
    prompt += `\n`;
  }

  if (dailySummaries && dailySummaries.length > 0) {
    prompt += `【每日汇总】（最近 30 天）\n`;
    dailySummaries.slice(-30).forEach(ds => {
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
  prompt += `  "habits": { "strong": [], "weak": [], "trending": {} },\n`;
  prompt += `  "patterns": { "peakHours": [], "lowHours": [], "weekendDifference": "", "consistency": "" },\n`;
  prompt += `  "preferences": { "praiseStyle": "", "disciplineStyle": "", "sensitiveTopics": [], "motivationTriggers": [] },\n`;
  prompt += `  "history": { "bestStreak": null, "worstPeriod": null },\n`;
  prompt += `  "insights": []\n`;
  prompt += `}\n`;
  prompt += `要求：\n`;
  prompt += `1.只输出 JSON\n`;
  prompt += `2.基于数据事实，peakHours/lowHours 必须使用交易记录中的『本地时间』时段分析，不得偏移时区\n`;
  prompt += `3.数据不足填 null 或空数组\n`;
  prompt += `4.insights 至少 3 条\n`;
  prompt += `5.weekendDifference 请依据交易记录中的星期标记，对比工作日与周末的真实行为差异；若无明显差异则写"无明显差异"\n`;
  prompt += `6.【禁止】：所有数字必须严格来自给定数据，严禁夸大或编造（尤其严禁把"总条数"当成"单日条数"而输出数百上千条/天之类的数字）。`;

  return prompt;
}

function buildIncrementalPrompt(brain, incrementalData) {
  const profile = brain.profile || emptyProfile();
  const { newTransactions, habitUpdates, currentSummary, requestedRole } = incrementalData;

  let prompt = `你是用户的 AI 伙伴。请基于用户的长期画像和最新数据变化，生成反馈。\n\n`;

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
    habitUpdates.forEach(h => { prompt += `- ${h.habitId}: ${h.completed ? '完成' : '未完成'}, 连续${h.streak || 0}天\n`; });
  }

  if (currentSummary) {
    prompt += `\n今日汇总：\n`;
    prompt += `- 收入：${Math.round((currentSummary.todayEarn || 0) / 60)}分钟\n`;
    prompt += `- 支出：${Math.round((currentSummary.todaySpend || 0) / 60)}分钟\n`;
    prompt += `- 净值：${Math.round((currentSummary.todayNet || 0) / 60)}分钟\n`;
  }
  prompt += `\n`;

  const role = requestedRole || 'auto';
  if (role === 'companion') {
    prompt += `【当前角色：温暖陪伴者】\n用温暖、鼓励的语气，像关心朋友一样说话。\n`;
  } else if (role === 'instructor') {
    prompt += `【当前角色：严格教官】\n用严格但关心的语气，指出问题并鞭策改进。\n`;
  } else if (role === 'analyst') {
    prompt += `【当前角色：冷静分析师】\n用客观、分析的语气，提供数据洞察。\n`;
  } else {
    prompt += `【当前角色：自动判断】\n根据事件类型自动选择最合适的角色语气。\n`;
  }

  prompt += `\n【输出要求】\n`;
  prompt += `请输出严格的 JSON 格式：\n`;
  prompt += `{\n`;
  prompt += `  "profileUpdates": {"字段路径": "新值"},\n`;
  prompt += `  "newInsights": ["新洞察1"],\n`;
  prompt += `  "feedbackMessages": [{\n`;
  prompt += `    "type": "care|discipline|praise|analysis|alert",\n`;
  prompt += `    "role": "companion|analyst|instructor",\n`;
  prompt += `    "content": "消息内容（自然、口语化）",\n`;
  prompt += `    "reason": "触发原因",\n`;
  prompt += `    "priority": 1-5\n`;
  prompt += `  }]\n`;
  prompt += `}\n`;
  prompt += `要求：1.只输出 JSON 2.feedbackMessages 最多 3 条，每条 100 字以内 3.无特别值得说的事可为空数组 4.priority: 5=紧急，1=随口一提。`;

  return prompt;
}

// ============================================================
// Parsers & utilities
// ============================================================

function parseProfileFromAIResponse(text) {
  try {
    const cleaned = text.trim();
    if (cleaned.startsWith('{')) return JSON.parse(cleaned);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error('[timebankAI] 解析画像 JSON 失败:', e.message);
  }
  return emptyProfile();
}

function parseIncrementalResponse(text) {
  try {
    const cleaned = text.trim();
    if (cleaned.startsWith('{')) return JSON.parse(cleaned);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error('[timebankAI] 解析增量响应失败:', e.message);
  }
  return { profileUpdates: {}, newInsights: [], feedbackMessages: [] };
}

function applyProfileUpdates(profile, updates) {
  if (!updates || Object.keys(updates).length === 0) return profile;
  const result = JSON.parse(JSON.stringify(profile || emptyProfile()));
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

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0分钟';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  }
  return `${minutes}分钟`;
}
