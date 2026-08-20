/**
 * AI Assistant Service - 统一 AI 服务层
 * [v9.12.0] 支持 Kimi 前端直连，突破 CloudBase HTTP 30 秒限制
 *
 * 调用链：
 * - Kimi：前端 JS → 直接调用 Kimi API（无 30 秒限制）
 * - DeepSeek：前端 JS → CloudBase 云函数 (timebankAI) → DeepSeek
 */

const AI_ASSISTANT_SERVICE = {
    // 云函数名称
    FUNCTION_NAME: 'timebankAI',

    // HTTP 访问服务端点（绕过 callFunction 15s 限制，但受网关 30s 限制）
    // [v9.17.9] 改为从 ConfigManager 读取，消除硬编码；保留默认值兜底
    HTTP_ENDPOINT: (function () {
        try {
            return (window.configManager && window.configManager.get('endpoints.ai'))
                || 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI';
        } catch (e) {
            return 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI';
        }
    })(),

    // [v9.35.0] AI 调用密钥管理重构：
    // - 默认 provider 切换为 cloudbase（走套餐内资源点，无需任何 Key）
    // - 原 Kimi/MiniMax 前端明文 Key 已全部移除（安全整改）
    // - 如需切回自费直连，用户可在设置中自行填 Key（仅存本机 localStorage）
    API_KEYS: {
        get kimi() { return localStorage.getItem('timebankAIKey_kimi') || ''; },
        get minimax() { return localStorage.getItem('timebankAIKey_minimax') || ''; }
    },

    // [v9.35.0] CloudBase AI 配置：个人版套餐内可用模型（资源点通兑）
    CLOUDBASE_AI: {
        defaultModel: 'hy3',            // 混元指令模型：对话/报告/意图解析主力
        gatewayPath: '/v1/ai/cloudbase' // OpenAI 兼容端点路径（备用，Key 在云函数侧）
    },

    // 统一 localStorage 设置键
    STORAGE_KEY: 'timebankAISettings',

    // 状态
    isGenerating: false,
    isSyncing: false,
    isInitializing: false,

    // 默认设置
    // [v9.35.0] 默认 AI 通道切换为 CloudBase 资源点通兑（套餐内边际免费）
    DEFAULT_SETTINGS: {
        model: 'hy3',
        provider: 'cloudbase',
        syncSchedule: {
            enabled: false,
            scheduleTimes: [],
            defaultRole: 'auto'
        },
        initStatus: false,
        lastSyncAt: 0
    },

    /**
     * 获取统一设置（兼容旧独立的 timebankAIModel 一次）
     */
    getSettings() {
        let settings = { ...this.DEFAULT_SETTINGS };
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                settings = { ...settings, ...parsed };
            } else {
                // 一次性迁移旧设置
                const oldModel = localStorage.getItem('timebankAIModel');
                if (oldModel) {
                    try {
                        const m = JSON.parse(oldModel);
                        settings.model = m.model || settings.model;
                        settings.provider = m.provider || settings.provider;
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.warn('[AI_ASSISTANT] 读取设置失败:', e);
        }

        // 确保 provider 字段兼容
        if (!settings.provider) {
            if (settings.model && settings.model.includes('deepseek')) settings.provider = 'deepseek';
            else if (settings.model && (settings.model.includes('kimi') || settings.model.includes('moonshot'))) settings.provider = 'kimi';
            else if (settings.model && (settings.model.toLowerCase().includes('minimax') || settings.model.toLowerCase().includes('MiniMax'))) settings.provider = 'minimax';
            else settings.provider = 'cloudbase';
        }

        // [v9.35.0] 旧默认（minimax/kimi 前端直连）已移除预置 Key：
        // 存量用户若仍指向 minimax/kimi 但本机没有自填 Key，自动回落到 cloudbase，
        // 保证升级后 AI 功能开箱即用（不再要求自费充值）
        if ((settings.provider === 'minimax' && !this.API_KEYS.minimax) ||
            (settings.provider === 'kimi' && !this.API_KEYS.kimi)) {
            console.log('[AI_ASSISTANT] [v9.35.0] 自费 Key 缺失，回落到 cloudbase 资源点通道');
            settings.provider = 'cloudbase';
            settings.model = this.CLOUDBASE_AI.defaultModel;
        }
        // cloudbase 通道模型兜底
        if (settings.provider === 'cloudbase' && !settings.model) {
            settings.model = this.CLOUDBASE_AI.defaultModel;
        }

        return settings;
    },

    /**
     * 保存统一设置
     */
    saveSettings(settings) {
        try {
            const current = this.getSettings();
            const merged = { ...current, ...settings };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
            console.log('[AI_ASSISTANT] 设置已保存');
            return true;
        } catch (e) {
            console.warn('[AI_ASSISTANT] 保存设置失败:', e);
            return false;
        }
    },

    /**
     * 获取模型偏好（便捷方法）
     */
    getModelPreference() {
        const s = this.getSettings();
        return { model: s.model, provider: s.provider };
    },

    /**
     * 通过 HTTP 访问服务调用云函数（绕过 callFunction 15s 超时限制）
     */
    async callViaHTTP(action, data, timeoutMs = 60000) {
        let openid = null;
        try {
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            if (authInstance) {
                let loginState = null;
                if (typeof authInstance.hasLoginState === 'function') {
                    loginState = authInstance.hasLoginState();
                }
                if (!loginState && typeof authInstance.getLoginState === 'function') {
                    loginState = await authInstance.getLoginState();
                }
                if (loginState) {
                    const userObj = loginState.user || loginState;
                    openid = userObj.uid || userObj.openid || userObj.id || userObj.sub || userObj.user_id || null;
                }
            }
        } catch (e) {}
        if (openid && data && typeof data === 'object') {
            data._openid = openid;
        }

        const body = JSON.stringify({ action, data });
        const bodySizeMB = (body.length / 1024 / 1024).toFixed(2);
        console.log(`[AI_ASSISTANT] HTTP 请求: action=${action}, body=${bodySizeMB}MB, timeout=${timeoutMs}ms`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(this.HTTP_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!response.ok) {
                if (response.status === 413) {
                    throw new Error('请求数据过大(413)，请尝试减少数据量后重试');
                }
                throw new Error(`HTTP 错误: ${response.status}`);
            }
            const result = await response.json();
            return { result };
        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                throw new Error(`AI 服务响应超时(${timeoutMs/1000}秒)，请稍后重试`);
            }
            throw error;
        }
    },

    /**
     * 直接调用 Kimi API（突破 CloudBase 30 秒网关限制）
     */
    async callKimiDirectly(prompt, options = {}) {
        const apiKey = this.API_KEYS.kimi;
        if (!apiKey) throw new Error('Kimi API 密钥未配置');

        const model = options.model || 'kimi-k2.6';
        const maxTokens = options.maxTokens || 1500;
        const payload = {
            model,
            messages: [
                { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供温暖建议。' },
                { role: 'user', content: prompt }
            ],
            max_tokens: maxTokens,
            stream: false
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs || 300000); // 默认 5 分钟

        try {
            const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timer);

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Kimi API 错误 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            let text = choice?.message?.content || choice?.message?.reasoning_content || '';
            text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
            return text;
        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                throw new Error('Kimi 响应超时，请稍后重试');
            }
            throw error;
        }
    },

    /**
     * [v9.17.0-fix] LLM 提取：把任务信息转成中文视觉描述
     * 端点：MiniMax M3（文字）
     * 输入：{ name, note, category, colorHex, type }
     * 输出：80-150 字中文视觉描述（用于喂给生图模型）
     */
    async analyzeTaskForVisual(taskInfo) {
        const { name, note, category, colorHex, type } = taskInfo;
        const typeText = {
            'reward': '完成任务赚取时间奖励',
            'instant_redeem': '立即兑换消耗时间',
            'continuous': '持续计时任务',
            'continuous_target': '持续达标任务',
            'continuous_redeem': '持续兑换任务'
        }[type] || '';

        const prompt = `你是时间银行 app 的资深视觉设计师。请根据用户的任务信息，输出一段 80-150 字的中文视觉描述。这段描述将直接作为 AI 生图模型的 prompt，决定最终图片的内容。

【任务信息】
- 名称：${name || '未命名'}
${note ? `- 备注：${note.substring(0, 300)}` : ''}
${category ? `- 分类：${category}` : ''}
${colorHex ? `- 主题色（HEX）：${colorHex}` : ''}
${typeText ? `- 类型：${typeText}` : ''}

【输出要求】
1. 提炼出最能代表该任务的具体视觉意象（如：晨光中的书桌、铺满落叶的林间小径、窗边的咖啡杯与笔记本、雨后的城市远眺等具体场景；或"阅读"对应书架与暖光、"冥想"对应远山与薄雾、"跑步"对应清晨跑道与露珠等）
2. 说明色调（具体的颜色组合，如"暖金 + 墨绿"、"清新蓝白"、"暮色紫红"等）
3. 说明光线（晨光、午后斜阳、夜晚灯光、阴天柔光等）
4. 说明情绪基调（宁静专注、活力充沛、温暖舒适、清爽明快等）
5. 如果有备注，请重点体现备注里的具体内容（如备注里写了"读《三体》"，意象要体现科幻/星空/三体元素）

【重要】只输出视觉描述本身，不要任何解释、标题、Markdown 符号、列表项或前缀。直接输出一段连贯的中文描述。`;

        const text = await this.callMinimaxDirectly(prompt, {
            model: 'MiniMax-M3',
            maxTokens: 500,
            timeoutMs: 30000
        });
        // 清理可能的 <thinking> 残留
        return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    },

    /**
     * [v9.36.0] 生成任务卡片背景图：改用腾讯云 CloudBase 资源点 hunyuan-image（替代 MiniMax image-01）
     * 生图在云函数 timebankAI.generateTaskImage 完成（零边际成本，无需用户自填 Key）。
     * @param {object} taskInfo - { name, note, category, colorHex, type }
     * @param {object} [options] - { aspectRatio, prompt, timeoutMs, onProgress, abortSignal }
     * @returns {Promise<{base64: string, mimeType: string, visualDescription: string}>}
     */
    async generateTaskBackgroundImage(taskInfo, options = {}) {
        // 兼容旧签名：generateTaskBackgroundImage(taskName, category, options)
        if (typeof taskInfo === 'string') {
            taskInfo = { name: arguments[0], category: arguments[1] };
            options = arguments[2] || {};
        }

        const name = (taskInfo && taskInfo.name || '').trim();
        if (!name) throw new Error('任务名不能为空');

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

        onProgress('正在分析任务信息...');
        const payload = {
            taskInfo: {
                name,
                note: (taskInfo.note || '').trim(),
                category: (taskInfo.category || '').trim(),
                colorHex: (taskInfo.colorHex || '').trim(),
                type: (taskInfo.type || '').trim()
            },
            aspectRatio: options.aspectRatio || '3:2'
        };
        // timebot 一句话生图：直接传用户描述作为图片 prompt
        if (options.prompt && String(options.prompt).trim()) {
            payload.prompt = String(options.prompt).trim();
        }

        onProgress('正在生成背景图...');

        let res;
        try {
            const httpRes = await this.callViaHTTP('generateTaskImage', payload, options.timeoutMs || 120000);
            res = httpRes.result;
        } catch (error) {
            console.error('[AI_ASSISTANT] 云端生图调用失败:', error);
            if (error.name === 'AbortError' || (options.abortSignal && options.abortSignal.aborted)) {
                throw new Error('生图已取消');
            }
            throw new Error('生图服务调用失败：' + (error && error.message ? error.message : '未知错误'));
        }

        if (!res || res.code !== 0 || !res.downloadUrl) {
            throw new Error((res && res.message) || '生图失败');
        }
        // 生成完成但用户已取消：不落地
        if (options.abortSignal && options.abortSignal.aborted) {
            throw new Error('生图已取消');
        }

        // [v9.36.0] 云函数已在上游完成生成+上传云存储，直接返回永久 tempFileURL
        return {
            base64: '',
            downloadUrl: res.downloadUrl,
            mimeType: res.mimeType || 'image/jpeg',
            visualDescription: res.visualDescription || ''
        };
    },

    /**
     * [v9.16.0] 直接调用 MiniMax M3 API（突破 CloudBase 30 秒网关限制）
     * 端点：https://api.minimaxi.com/v1/text/chatcompletion_v2
     * 模型：MiniMax-M3（百万上下文，默认开启思考）
     */
    async callMinimaxDirectly(prompt, options = {}) {
        const apiKey = this.API_KEYS.minimax;
        if (!apiKey) throw new Error('MiniMax API 密钥未配置');

        const model = options.model || 'MiniMax-M3';
        const maxTokens = options.maxTokens || 1500;
        // M3 默认开启思考（adaptive），构造时显式禁用以避免输出混乱
        const payload = {
            model,
            messages: [
                { role: 'system', content: '你是时间银行应用的 AI 助手，擅长分析时间管理数据并提供温暖建议。' },
                { role: 'user', content: prompt }
            ],
            max_tokens: maxTokens,
            stream: false,
            temperature: 0.7,
            thinking: { type: 'disabled' }
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs || 300000); // 默认 5 分钟

        try {
            const response = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timer);

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`MiniMax API 错误 (${response.status}): ${errorText.substring(0, 200)}`);
            }

            const data = await response.json();
            if (data.base_resp && data.base_resp.status_code && data.base_resp.status_code !== 0) {
                throw new Error(`MiniMax 返回错误: ${data.base_resp.status_msg || data.base_resp.status_code}`);
            }
            const choice = data.choices?.[0];
            let text = choice?.message?.content || choice?.message?.reasoning_content || '';
            text = String(text).replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
            return text;
        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                throw new Error('MiniMax 响应超时，请稍后重试');
            }
            throw error;
        }
    },

    /**
     * 统一 AI 调用入口
     * - cloudbase [v9.35.0]：默认通道，套餐内资源点通兑（Web SDK 直调优先，云函数兜底）
     * - MiniMax / Kimi：前端直连（需用户自填 Key，仅存本机）
     * - 其他：走 CloudBase 云函数
     */
    async callAI(prompt, options = {}) {
        const { provider = 'cloudbase', model } = options;
        // [v9.35.0] CloudBase 资源点通道（默认）
        if (provider === 'cloudbase') {
            const useModel = model || this.CLOUDBASE_AI.defaultModel;
            // ① Web SDK 直调（浏览器/WebView 直连，用邮箱登录态鉴权，无需 API Key）
            try {
                return await this.callCloudbaseSDK(prompt, { ...options, model: useModel });
            } catch (sdkError) {
                console.warn('[AI_ASSISTANT] Web SDK 直调失败，降级云函数:', sdkError && sdkError.message);
                // ② 云函数兜底（服务端 OpenAI 兼容端点，Key 在云函数环境变量）
                const action = options.action || 'chat';
                const data = {
                    ...(options.data || {}),
                    message: options.message,
                    userData: options.userData,
                    type: options.type,
                    fullData: options.fullData,
                    incrementalData: options.incrementalData,
                    prompt,
                    model: useModel,
                    provider: 'cloudbase'
                };
                const res = await this.callViaHTTP(action, data, options.timeoutMs || 120000);
                return res.result;
            }
        }
        if (provider === 'minimax' && this.API_KEYS.minimax) {
            return await this.callMinimaxDirectly(prompt, { model, maxTokens: options.maxTokens, timeoutMs: options.timeoutMs });
        }
        if (provider === 'kimi' && this.API_KEYS.kimi) {
            return await this.callKimiDirectly(prompt, { model, maxTokens: options.maxTokens, timeoutMs: options.timeoutMs });
        }
        // 其他模型走云函数
        const action = options.action || 'chat';
        const data = {
            ...(options.data || {}),
            message: options.message,
            userData: options.userData,
            type: options.type,
            fullData: options.fullData,
            incrementalData: options.incrementalData,
            model,
            provider
        };
        const res = await this.callViaHTTP(action, data, options.timeoutMs || 60000);
        return res.result;
    },

    /**
     * [v9.35.0-fix4] 语音识别（ASR）：音频走云存储中转，绕开 HTTP 网关 body 大小限制（413）。
     * 流程：base64 WAV → Blob → CloudBase 云存储 uploadFile → fileID →
     * 云函数 getTempFileURL → 腾讯云一句话识别（URL 模式）→ 返回文字（云函数识别后自动删文件）。
     * 云存储不可用时回退 base64 直传（仅短音频可用）。
     */
    async transcribeAudio(audioBase64, format = 'wav') {
        const sizeKB = Math.round(audioBase64.length / 1024);
        let fileID = null;
        const appInstance = typeof app !== 'undefined' ? app : null;

        // 主通道：云存储中转（不受网关 body 限制）
        if (appInstance && typeof appInstance.uploadFile === 'function') {
            try {
                const bin = atob(audioBase64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'audio/' + format });
                // [v9.35.0-fix7] 根因修复：Web js-sdk 的 uploadFile 参数是 filePath（File/Blob），
                // fileContent 是 node-sdk（服务端）参数——此前参数用错导致手机端上传必败，
                // 全部回退 base64 直传，超过网关 body 限制（约 1~3 秒音频）即失败
                const up = await appInstance.uploadFile({
                    cloudPath: `voice-cmd/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format}`,
                    filePath: blob
                });
                fileID = up && up.fileID;
                console.log(`[AI_ASSISTANT] ASR 云存储中转: ${sizeKB}KB → ${fileID}`);
            } catch (e) {
                console.warn('[AI_ASSISTANT] 云存储中转失败，回退 base64 直传:', e && e.message);
                fileID = null;
            }
        }

        if (fileID) {
            try {
                const res = await this.callViaHTTP('asr', { fileID, format }, 30000);
                const r = res && res.result;
                if (r && r.code === 0) return r.text || '';
                throw new Error((r && r.message) || '语音识别失败');
            } catch (e) {
                // [v9.35.0-fix5] 中转失败 → 清理残留文件，短音频自动回退 base64 直传
                console.warn('[AI_ASSISTANT] 云存储中转识别失败，尝试回退直传:', e && e.message);
                try { await appInstance.deleteFile({ fileList: [fileID] }); } catch (ignore) { /* 忽略 */ }
                if (audioBase64.length > 300 * 1024) {
                    throw new Error('语音过长且中转失败，请重试或说得简短一些');
                }
                // 落入下方 base64 直传通道
            }
        }

        // 回退通道：base64 直传（HTTP 网关有 body 限制，仅短音频可用）
        if (audioBase64.length > 300 * 1024) {
            throw new Error('语音过长，请说得简短一些');
        }
        const res = await this.callViaHTTP('asr', { audio: audioBase64, format }, 30000);
        const r = res && res.result;
        if (r && r.code === 0) {
            return r.text || '';
        }
        throw new Error((r && r.message) || '语音识别失败');
    },

    /**
     * [v9.35.0] CloudBase AI：Web SDK 直调（资源点计费）
     * 使用现有邮箱登录态鉴权，无需任何 API Key。
     * 仅当 SDK 初始化完成且包含 AI 模块（app.ai 可用）时走此通道。
     * 支持流式回调：options.onStreamChunk(textDelta) 存在时启用流式。
     */
    async callCloudbaseSDK(prompt, options = {}) {
        const appInstance = typeof app !== 'undefined' ? app : null;
        if (!appInstance) {
            throw new Error('CloudBase 未初始化');
        }
        if (typeof appInstance.ai !== 'function') {
            throw new Error('SDK 无 AI 模块');
        }
        // 登录态检查（AI 调用要求已登录）
        const logged = await this.checkLoginStatus();
        if (!logged) {
            throw new Error('未登录');
        }

        const ai = appInstance.ai();
        const modelId = options.model || this.CLOUDBASE_AI.defaultModel;
        const chatModel = ai.createModel('cloudbase');
        const messages = this._toChatMessages(prompt);

        const reqOptions = {
            model: modelId,
            messages
        };

        // 流式：逐 token 回调
        if (typeof options.onStreamChunk === 'function') {
            const streamRes = await chatModel.streamText(reqOptions);
            let full = '';
            try {
                for await (const chunk of streamRes.textStream) {
                    if (chunk) {
                        full += chunk;
                        options.onStreamChunk(chunk, full);
                    }
                }
            } catch (streamError) {
                // 流中断但已有部分内容：返回已有内容
                if (full) {
                    console.warn('[AI_ASSISTANT] 流式中断，返回已有内容');
                    return full;
                }
                throw streamError;
            }
            if (!full) throw new Error('AI 返回空内容（流式）');
            return full;
        }

        // 非流式
        const result = await chatModel.generateText(reqOptions);
        const text = result && (result.text || (result.messages && result.messages.length));
        if (typeof result.text === 'string' && result.text.trim()) {
            return result.text.trim();
        }
        throw new Error('AI 返回空内容');
    },

    /**
     * [v9.35.0] prompt → chat messages 结构转换
     * 纯文本 prompt 视为 user 消息；已是数组的直接返回
     */
    _toChatMessages(prompt) {
        if (Array.isArray(prompt)) return prompt;
        return [{ role: 'user', content: String(prompt || '') }];
    },

    /**
     * 获取 CloudBase app 实例
     */
    getApp() {
        const appInstance = typeof app !== 'undefined' ? app : null;
        if (!appInstance) {
            throw new Error('CloudBase 尚未初始化，请稍后重试');
        }
        return appInstance;
    },

    /**
     * 检查 CloudBase 登录状态
     */
    async checkLoginStatus() {
        try {
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            if (!authInstance) {
                console.warn('[AI_ASSISTANT] Auth not initialized yet');
                return false;
            }

            let loginState = null;
            if (typeof authInstance.hasLoginState === 'function') {
                loginState = authInstance.hasLoginState();
            }
            if (!loginState && typeof authInstance.getLoginState === 'function') {
                loginState = await authInstance.getLoginState();
            }

            return !!loginState;
        } catch (error) {
            console.error('[AI_ASSISTANT] Check login status error:', error);
            return false;
        }
    },

    /**
     * 获取 AI 服务状态
     */
    async getStatus() {
        try {
            const result = await this.getApp().callFunction({
                name: this.FUNCTION_NAME,
                data: { action: 'getStatus' }
            });

            if (result.result.code === 0) {
                return {
                    available: result.result.available,
                    provider: result.result.provider,
                    providerName: result.result.providerName,
                    message: result.result.message,
                    models: result.result.models || null
                };
            } else {
                return { available: false, provider: 'unknown', message: result.result.message };
            }
        } catch (error) {
            console.error('[AI_ASSISTANT] 获取状态异常:', error);
            return { available: false, provider: 'unknown', message: error.message };
        }
    },

    /**
     * 获取首页状态：问候 + 未读数 + 最新日报
     */
    async getHomeState() {
        try {
            const result = await this.callViaHTTP('getHomeState', {});
            if (result.result.code === 0) {
                return {
                    greeting: result.result.greeting || '',
                    unreadCount: result.result.unreadCount || 0,
                    latestDailyReport: result.result.latestDailyReport || null
                };
            }
            throw new Error(result.result.message || '获取首页状态失败');
        } catch (error) {
            console.error('[AI_ASSISTANT] getHomeState 失败:', error);
            return { greeting: '', unreadCount: 0, latestDailyReport: null, error: error.message };
        }
    },

    /**
     * 获取报告列表
     * @param {'daily'|'weekly'|'monthly'} type
     * @param {number} limit
     */
    async getReports(type = 'daily', limit = 10) {
        try {
            const result = await this.callViaHTTP('getReports', { type, limit });
            if (result.result.code === 0) {
                return result.result.reports || [];
            }
            throw new Error(result.result.message || '获取报告失败');
        } catch (error) {
            console.error('[AI_ASSISTANT] getReports 失败:', error);
            return [];
        }
    },

    /**
     * 获取对话历史
     */
    async getChatHistory(limit = 50) {
        try {
            const result = await this.callViaHTTP('getChatHistory', { limit });
            if (result.result.code === 0) {
                return result.result.messages || [];
            }
            throw new Error(result.result.message || '获取对话历史失败');
        } catch (error) {
            console.error('[AI_ASSISTANT] getChatHistory 失败:', error);
            return [];
        }
    },

    /**
     * [v9.35.0] 语音指令意图解析（AI 通道）
     * 本地正则未命中时调用，返回 { action, taskName } 或 { action: 'unknown' }
     * action ∈ start | complete | stop | cancel | pause | resume | delete | undo | unknown
     * [v9.35.1] 新增 undo（撤回交易记录）：支持"最近/今天/昨天/具体日期 + 第N条"语义
     */
    async parseVoiceIntent(text) {
        const taskNames = (typeof tasks !== 'undefined' && Array.isArray(tasks))
            ? tasks.filter(t => !t.hidden).map(t => t.name)
            : [];

        const today = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const yesterday = new Date(today.getTime() - 86400000);

        const prompt = `你是时间管理应用"时间银行"的语音指令解析器。用户说了一句话，请判断它是否是对任务的某种操作指令。

任务操作类型（action）：
- start：开始/启动某任务的计时
- complete：标记某任务完成（领取奖励）
- stop：结束某任务的计时（正常收尾，时间计入）
- cancel：取消/作废某任务本次计时（时间不计入；“取消”“不要了”“作废”均属此类）
- pause：暂停某任务计时（注意：“停止”“停下”属于暂停而非结束）
- resume：继续/恢复某任务计时
- delete：删除某任务
- undo：撤回/撤销某任务的一条交易记录（注意：是撤回一条记录，不是删除任务本身）
- background：为某任务生成背景图（用户提到"背景图/背景/配图/壁纸/做个封面"等意图时）
- unknown：不是上述操作，或是闲聊/提问

undo 的附加参数（仅 action=undo 时需要，其他 action 省略这些字段）：
- undoScope："last"（最近一次，默认） | "today"（今天） | "yesterday"（昨天） | "date"（具体日期，配合 undoDate）
- undoDate：格式 YYYY-MM-DD，仅 undoScope="date" 时给出。今天是 ${fmt(today)}，昨天是 ${fmt(yesterday)}；相对表述（"前天""上周三"等）请换算成具体日期
- undoOrdinal：正整数，指当天第几条（1=当天最早一条，2=第二条…）；用户未说序号时省略（默认取当天最近一条）

当前用户的任务列表（taskName 必须从这里选，选择语义最接近的；若用户说的名称与列表不完全一致，做合理的模糊对应）：
${JSON.stringify(taskNames)}

用户说的话：「${text}」

请只输出一个 JSON 对象，不要任何其他文字：
{"action":"start|complete|stop|cancel|pause|resume|delete|undo|background|unknown 之一","taskName":"匹配到的任务名，unknown 时为空字符串","undoScope":"仅undo时","undoDate":"仅date时YYYY-MM-DD","undoOrdinal":仅undo且用户说了序号时,"backgroundPrompt":"仅background时，提取用户对画面/风格的描述（去掉动作词和任务名，可为空字符串）"}`;

        try {
            const raw = await this.callAI(prompt, {
                provider: 'cloudbase',
                model: this.CLOUDBASE_AI.defaultModel,
                timeoutMs: 30000,
                action: 'chat'
            });
            const m = String(raw).match(/\{[\s\S]*\}/);
            if (!m) return { action: 'unknown', taskName: '' };
            const parsed = JSON.parse(m[0]);
            const validActions = ['start', 'complete', 'stop', 'cancel', 'pause', 'resume', 'delete', 'undo', 'background'];
            const action = validActions.includes(parsed.action) ? parsed.action : 'unknown';
            const cmd = { action, taskName: String(parsed.taskName || '') };
            if (action === 'background') {
                cmd.backgroundPrompt = String(parsed.backgroundPrompt || '').trim();
            }
            if (action === 'undo') {
                const validScopes = ['last', 'today', 'yesterday', 'date'];
                cmd.undoScope = validScopes.includes(parsed.undoScope) ? parsed.undoScope : 'last';
                if (cmd.undoScope === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.undoDate || ''))) {
                    cmd.undoDate = String(parsed.undoDate);
                } else if (cmd.undoScope === 'date') {
                    cmd.undoScope = 'last'; // 日期非法时兜底
                }
                const ord = parseInt(parsed.undoOrdinal, 10);
                if (Number.isInteger(ord) && ord > 0 && ord <= 50) cmd.undoOrdinal = ord;
            }
            return cmd;
        } catch (error) {
            console.error('[AI_ASSISTANT] parseVoiceIntent 失败:', error);
            throw error;
        }
    },

    /**
     * [v9.35.0] 构建深度分析上下文：从 4000+ 条交易中提取统计特征
     * 用于"迷茫/失衡/效率优化"类深度对话，输出紧凑文本（约 3-5k token）
     * 结果缓存 5 分钟（避免每次聊天都全量重算 4000+ 条）
     */
    buildDeepAnalysisContext() {
        const CACHE_MS = 5 * 60 * 1000;
        const now = Date.now();
        if (this._deepCtxCache && this._deepCtxCacheExpire > now) {
            return this._deepCtxCache;
        }

        const DAY_MS = 24 * 60 * 60 * 1000;
        const txs = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : [];
        const taskList = (typeof tasks !== 'undefined' && Array.isArray(tasks)) ? tasks : [];
        const lines = [];

        try {
            const now2 = new Date();
            const todayStart = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate()).getTime();

            // ---------- 1. 总览 ----------
            if (txs.length > 0) {
                const firstTs = Math.min(...txs.map(t => typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime()).filter(Boolean));
                const totalDays = firstTs ? Math.max(1, Math.round((todayStart - firstTs) / DAY_MS)) : 1;
                let totalEarn = 0, totalSpend = 0;
                txs.forEach(t => {
                    if (t.type === 'earn') totalEarn += t.amount || 0;
                    else totalSpend += t.amount || 0;
                });
                const balance = (typeof state !== 'undefined' && state && typeof state.balance === 'number') ? state.balance : null;
                lines.push('【总览】');
                lines.push(`- 使用时长：约 ${totalDays} 天，累计 ${txs.length} 笔时间交易`);
                lines.push(`- 累计获取：${Math.round(totalEarn / 60)} 小时，累计消费：${Math.round(totalSpend / 60)} 小时` +
                    (balance !== null ? `，当前余额：${(balance / 3600).toFixed(1)} 小时` : ''));
                lines.push('');
            }

            // ---------- 2. 近 30 天 vs 前 30 天趋势 ----------
            if (txs.length > 0) {
                const inRange = (t, from, to) => {
                    const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                    return ts >= from && ts < to;
                };
                const sum = (from, to) => {
                    let e = 0, s = 0;
                    txs.forEach(t => {
                        if (!inRange(t, from, to)) return;
                        if (t.type === 'earn') e += t.amount || 0;
                        else s += t.amount || 0;
                    });
                    return { e, s };
                };
                const cur = sum(todayStart - 30 * DAY_MS, todayStart + DAY_MS);
                const prev = sum(todayStart - 60 * DAY_MS, todayStart - 30 * DAY_MS);
                const pct = (a, b) => b > 0 ? Math.round(((a - b) / b) * 100) : null;
                lines.push('【近30天趋势（对比前30天）】');
                lines.push(`- 获取：${Math.round(cur.e / 3600)} 小时（环比 ${pct(cur.e, prev.e) === null ? '—' : (pct(cur.e, prev.e) > 0 ? '+' : '') + pct(cur.e, prev.e) + '%'}）`);
                lines.push(`- 消费：${Math.round(cur.s / 3600)} 小时（环比 ${pct(cur.s, prev.s) === null ? '—' : (pct(cur.s, prev.s) > 0 ? '+' : '') + pct(cur.s, prev.s) + '%'}）`);
                const curNet = cur.e - cur.s;
                lines.push(`- 净值：${curNet >= 0 ? '+' : ''}${Math.round(curNet / 3600)} 小时（${curNet >= 0 ? '盈余' : '透支'}）`);
                lines.push('');
            }

            // ---------- 3. 近 7 天每日净收支（平衡波动） ----------
            if (txs.length > 0) {
                lines.push('【近7天每日净收支（秒，正=盈余 负=透支）】');
                for (let i = 6; i >= 0; i--) {
                    const from = todayStart - i * DAY_MS;
                    const to = from + DAY_MS;
                    let e = 0, s = 0;
                    txs.forEach(t => {
                        const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                        if (ts < from || ts >= to) return;
                        if (t.type === 'earn') e += t.amount || 0;
                        else s += t.amount || 0;
                    });
                    const d = new Date(from);
                    const label = `${d.getMonth() + 1}/${d.getDate()}`;
                    if (e === 0 && s === 0) { lines.push(`- ${label}：无记录`); continue; }
                    const net = e - s;
                    lines.push(`- ${label}：+${Math.round(e / 60)}分 / -${Math.round(s / 60)}分 → 净 ${net >= 0 ? '+' : ''}${Math.round(net / 60)}分`);
                }
                lines.push('');
            }

            // ---------- 4. 近 30 天分类结构 ----------
            if (txs.length > 0) {
                const catMap = new Map();
                const taskIdMap = new Map(taskList.map(t => [t.id, t]));
                txs.forEach(t => {
                    const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                    if (ts < todayStart - 30 * DAY_MS) return;
                    const cat = t.category || (t.taskId && taskIdMap.get(t.taskId)?.category) || '未分类';
                    if (!catMap.has(cat)) catMap.set(cat, { e: 0, s: 0 });
                    const c = catMap.get(cat);
                    if (t.type === 'earn') c.e += t.amount || 0;
                    else c.s += t.amount || 0;
                });
                const cats = [...catMap.entries()].sort((a, b) => (b[1].e + b[1].s) - (a[1].e + a[1].s)).slice(0, 8);
                if (cats.length > 0) {
                    lines.push('【近30天分类投入（小时）】');
                    cats.forEach(([cat, c]) => {
                        lines.push(`- ${cat}：获取 ${Math.round(c.e / 360) / 10}h / 消费 ${Math.round(c.s / 360) / 10}h`);
                    });
                    lines.push('');
                }
            }

            // ---------- 5. 时段分布（全部历史） ----------
            if (txs.length > 0) {
                const slots = { morning: [6, 12], afternoon: [12, 18], evening: [18, 24], night: [0, 6] };
                const slotStat = {};
                Object.keys(slots).forEach(k => slotStat[k] = { e: 0, s: 0 });
                txs.forEach(t => {
                    const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                    const h = new Date(ts).getHours();
                    for (const [k, [a, b]] of Object.entries(slots)) {
                        if (h >= a && h < b) {
                            if (t.type === 'earn') slotStat[k].e += t.amount || 0;
                            else slotStat[k].s += t.amount || 0;
                            break;
                        }
                    }
                });
                const labels = { morning: '早晨6-12点', afternoon: '下午12-18点', evening: '晚上18-24点', night: '深夜0-6点' };
                lines.push('【时段习惯（历史累计，小时）】');
                Object.keys(slots).forEach(k => {
                    const st = slotStat[k];
                    if (st.e + st.s > 0) {
                        lines.push(`- ${labels[k]}：获取 ${Math.round(st.e / 360) / 10}h / 消费 ${Math.round(st.s / 360) / 10}h`);
                    }
                });
                lines.push('');
            }

            // ---------- 6. 习惯任务坚持情况 ----------
            const habits = taskList.filter(t => t.isHabit && !t.hidden);
            if (habits.length > 0) {
                lines.push('【习惯任务（近30天）】');
                habits.slice(0, 10).forEach(h => {
                    const streak = h.habitDetails?.currentStreak ?? h.currentStreak ?? 0;
                    // 近30天完成次数：从交易里数该 taskId 的 earn 记录
                    let done30 = 0;
                    if (txs.length > 0) {
                        txs.forEach(t => {
                            if (t.taskId !== h.id || t.type !== 'earn') return;
                            const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                            if (ts >= todayStart - 30 * DAY_MS) done30++;
                        });
                    }
                    const habitType = h.habitDetails?.type === 'abstinence' ? '戒除型' : '养成型';
                    lines.push(`- ${h.name}（${habitType}）：当前连胜 ${streak}，近30天完成 ${done30} 次`);
                });
                lines.push('');
            }

            // ---------- 7. 高频任务 Top5（近30天，按次数） ----------
            if (txs.length > 0) {
                const tMap = new Map();
                txs.forEach(t => {
                    const ts = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
                    if (ts < todayStart - 30 * DAY_MS || !t.taskName) return;
                    tMap.set(t.taskName, (tMap.get(t.taskName) || 0) + 1);
                });
                const top = [...tMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                if (top.length > 0) {
                    lines.push('【近30天高频任务】');
                    top.forEach(([name, count]) => lines.push(`- ${name}：${count} 次`));
                    lines.push('');
                }
            }
        } catch (error) {
            console.error('[AI_ASSISTANT] buildDeepAnalysisContext 部分统计失败:', error);
        }

        const context = lines.join('\n').trim() || '（暂无足够数据）';
        this._deepCtxCache = context;
        this._deepCtxCacheExpire = now + CACHE_MS;
        return context;
    },

    /**
     * 发送对话消息
     * [v9.35.0] 注入深度分析上下文：AI 可基于 4000+ 条交易的全量统计特征给建议
     */
    async chat(message, options = {}) {
        try {
            const modelPref = this.getModelPreference();
            const brain = await this.getBrain();
            const history = await this.getChatHistory(10);
            // [v9.35.0] 深度数据上下文（迷茫/失衡/效率优化场景的核心弹药）
            let deepContext = '';
            if (options.deepContext !== false) {
                try {
                    deepContext = this.buildDeepAnalysisContext();
                } catch (ctxErr) {
                    console.warn('[AI_ASSISTANT] 深度上下文构建失败（跳过）:', ctxErr);
                }
            }
            const prompt = this.buildChatPrompt(message, brain, history, deepContext);

            const reply = await this.callAI(prompt, {
                provider: modelPref.provider,
                model: modelPref.model,
                maxTokens: 1000,
                timeoutMs: 120000,
                action: 'chat',
                data: { message },
                onStreamChunk: options.onStreamChunk
            });

            // 本地保存对话记录
            await this.saveChatMessage('user', message);
            await this.saveChatMessage('assistant', reply);

            return reply;
        } catch (error) {
            console.error('[AI_ASSISTANT] chat 失败:', error);
            throw error;
        }
    },

    /**
     * 手动触发生成报告
     * @param {'daily'|'weekly'|'monthly'} type
     */
    async generateReport(type = 'daily') {
        if (this.isGenerating) {
            throw new Error('报告生成中，请稍候...');
        }
        this.isGenerating = true;
        try {
            const periodMap = { daily: '今日', weekly: '本周', monthly: '本月' };
            const period = periodMap[type] || '本周';
            const userData = this.collectUserData(type === 'daily' ? '今日' : type === 'monthly' ? '近30日' : '近7日');
            const modelPref = this.getModelPreference();
            const prompt = this.buildReportPrompt(userData, type);
            const maxTokensMap = { daily: 500, weekly: 800, monthly: 1000 };

            const report = await this.callAI(prompt, {
                provider: modelPref.provider,
                model: modelPref.model,
                maxTokens: maxTokensMap[type] || 800,
                timeoutMs: 300000,
                action: 'generateReport',
                data: { type, userData }
            });

            // 保存到云端
            await this.saveReport(type, report);
            return report;
        } catch (error) {
            console.error('[AI_ASSISTANT] generateReport 失败:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    },

    /**
     * 标记消息已读
     */
    async markRead(messageIds) {
        try {
            if (!Array.isArray(messageIds) || messageIds.length === 0) return false;
            await this.callViaHTTP('markRead', { messageIds });
            return true;
        } catch (error) {
            console.warn('[AI_ASSISTANT] markRead 失败:', error);
            return false;
        }
    },

    /**
     * 全量初始化 brain
     */
    async initBrain(force = false) {
        if (this.isInitializing) {
            throw new Error('初始化进行中，请稍候...');
        }
        const settings = this.getSettings();
        if (settings.initStatus && !force) {
            return { code: 0, message: '已完成初始化' };
        }

        this.isInitializing = true;
        try {
            console.log('[AI_ASSISTANT] 开始全量初始化 brain...');
            if (typeof showToast === 'function') showToast('🧠 正在分析你的全部数据，请稍候（约 1-3 分钟）...', 5000);

            const fullData = this.collectFullData();
            const userPref = this.getModelPreference();
            // [v9.15.4] 初始化大脑优先使用 MiniMax 前端直连，突破 30 秒限制
            // [v9.35.0] brain 初始化默认走 cloudbase 资源点通道（自费直连仅在用户填了 Key 时启用）
            const initProvider = this.API_KEYS.minimax ? 'minimax' : (this.API_KEYS.kimi ? 'kimi' : 'cloudbase');
            const initModel = initProvider === 'minimax' ? 'MiniMax-M3' : (initProvider === 'kimi' ? 'kimi-k2.6' : this.CLOUDBASE_AI.defaultModel);
            const prompt = this.buildFullAnalysisPrompt(fullData);

            if (typeof showToast === 'function') showToast(`🧠 正在用 ${initProvider === 'minimax' ? 'MiniMax M3' : (initProvider === 'kimi' ? 'Kimi' : initModel)} 分析你的全部数据...`, 5000);

            const aiText = await this.callAI(prompt, {
                provider: initProvider,
                model: initModel,
                maxTokens: 2000,
                timeoutMs: 300000,
                action: 'initBrain',
                data: { fullData, force }
            });

            const profile = this.parseProfileFromAIResponse(aiText);
            const summary = await this.generateSummary(profile, { provider: initProvider, model: initModel });

            await this.saveBrain({ profile, summary, cognitionVersion: 1, lastAnalysisMethod: 'internal_full' });
            this.saveSettings({ initStatus: true, lastSyncAt: Date.now() });

            if (typeof showToast === 'function') showToast('✅ AI 大脑初始化成功！', 3000);
            return { code: 0, message: 'AI 记忆初始化成功', summary, profile };
        } catch (error) {
            console.error('[AI_ASSISTANT] initBrain 失败:', error);
            if (typeof showToast === 'function') showToast('❌ 初始化失败: ' + error.message, 3000);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    },

    /**
     * 增量同步 brain
     */
    async syncBrain() {
        if (this.isSyncing) {
            throw new Error('同步进行中，请稍候...');
        }

        this.isSyncing = true;
        try {
            console.log('[AI_ASSISTANT] 开始增量同步 brain...');
            const incrementalData = this.collectIncrementalData();
            if (incrementalData.newTransactions.length === 0 && incrementalData.habitUpdates.length === 0) {
                return { code: 0, message: '没有新数据' };
            }

            const { model, provider, thinking } = this.getModelPreference();
            const result = await this.callViaHTTP('syncBrain', { incrementalData, model, provider, thinking }, 120000);
            if (result.result.code === 0) {
                const now = Date.now();
                this.saveSettings({ lastSyncAt: now });
                return result.result;
            } else {
                throw new Error(result.result.message || '同步失败');
            }
        } catch (error) {
            console.error('[AI_ASSISTANT] syncBrain 失败:', error);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    },

    /**
     * 检查是否需要生成日报/周报/月报
     */
    async checkScheduledReport() {
        try {
            const result = await this.callViaHTTP('checkScheduledReport', {});
            return result.result || { code: 0, needGenerate: false };
        } catch (error) {
            console.warn('[AI_ASSISTANT] checkScheduledReport 失败:', error);
            return { code: -1, needGenerate: false, error: error.message };
        }
    },

    /**
     * 检查定时同步
     */
    async checkScheduledSync() {
        const settings = this.getSettings();
        if (!settings.initStatus) return;
        if (!settings.syncSchedule || !settings.syncSchedule.enabled) return;
        if (!settings.syncSchedule.scheduleTimes || settings.syncSchedule.scheduleTimes.length === 0) return;

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        for (const scheduledTime of settings.syncSchedule.scheduleTimes) {
            if (this._isTimeMatch(currentTime, scheduledTime)) {
                const lastSync = settings.lastSyncAt || 0;
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                if (lastSync < todayStart.getTime()) {
                    console.log(`[AI_ASSISTANT] 到达同步时间 ${scheduledTime}，开始同步...`);
                    try {
                        await this.syncBrain();
                    } catch (e) {
                        console.error('[AI_ASSISTANT] 定时同步失败:', e);
                    }
                }
                break;
            }
        }
    },

    /**
     * 判断当前时间是否匹配 scheduledTime（允许 ±2 分钟误差）
     */
    _isTimeMatch(current, scheduled) {
        const [cH, cM] = current.split(':').map(Number);
        const [sH, sM] = scheduled.split(':').map(Number);
        const cTotal = cH * 60 + cM;
        const sTotal = sH * 60 + sM;
        return Math.abs(cTotal - sTotal) <= 2;
    },

    /**
     * 收集用户数据用于 AI 报告
     */
    collectUserData(period = '近7日') {
        const data = {
            summary: {},
            habits: [],
            sleep: null,
            rawData: null
        };

        try {
            if (typeof currentBalance !== 'undefined') {
                data.summary.currentBalance = currentBalance;
            }

            const periodRange = this._getPeriodRange(period);
            const prevPeriodRange = this._getPrevPeriodRange(periodRange);
            const dataWindowRange = this._getDataWindowRange(period);

            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            const daysInPeriod = Math.max(1, Math.round((periodRange.end - periodRange.start) / MS_PER_DAY));
            const prevDaysInPeriod = Math.max(1, Math.round((prevPeriodRange.end - prevPeriodRange.start) / MS_PER_DAY));

            data.summary.period = period;
            data.summary.periodRange = periodRange.label;
            data.summary.daysInPeriod = daysInPeriod;
            data.summary.prevDaysInPeriod = prevDaysInPeriod;

            let totalEarned = 0, totalSpent = 0;
            let prevEarned = 0, prevSpent = 0;
            const currentTxs = [];

            if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
                transactions.forEach(tx => {
                    if (tx.undone) return;
                    const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();

                    if (txTime >= dataWindowRange.start && txTime <= dataWindowRange.end) {
                        currentTxs.push(tx);
                    }

                    if (txTime >= periodRange.start && txTime <= periodRange.end) {
                        if (tx.type === 'earn') totalEarned += tx.amount || 0;
                        else if (tx.type === 'spend') totalSpent += tx.amount || 0;
                    }

                    if (txTime >= prevPeriodRange.start && txTime <= prevPeriodRange.end) {
                        if (tx.type === 'earn') prevEarned += tx.amount || 0;
                        else if (tx.type === 'spend') prevSpent += tx.amount || 0;
                    }
                });
            }

            data.summary.totalEarned = totalEarned;
            data.summary.totalSpent = totalSpent;
            data.summary.totalNet = totalEarned - totalSpent;
            data.summary.totalEarnedFormatted = formatDuration(totalEarned);
            data.summary.totalSpentFormatted = formatDuration(totalSpent);
            data.summary.totalNetFormatted = formatDuration(totalEarned - totalSpent);

            data.summary.prevEarned = prevEarned;
            data.summary.prevSpent = prevSpent;
            data.summary.prevNet = prevEarned - prevSpent;
            data.summary.prevEarnedFormatted = formatDuration(prevEarned);
            data.summary.prevSpentFormatted = formatDuration(prevSpent);
            data.summary.earnChangePercent = prevEarned > 0
                ? Math.round(((totalEarned - prevEarned) / prevEarned) * 100)
                : (totalEarned > 0 ? 100 : 0);
            data.summary.spendChangePercent = prevSpent > 0
                ? Math.round(((totalSpent - prevSpent) / prevSpent) * 100)
                : (totalSpent > 0 ? 100 : 0);

            if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                data.habits = tasks
                    .filter(task => task.isHabit)
                    .map(task => {
                        const completionRate = calculateHabitCompletionRate(task);
                        let status = 'critical';
                        if (completionRate >= 80) status = 'excellent';
                        else if (completionRate >= 60) status = 'good';
                        else if (completionRate >= 40) status = 'fair';
                        else if (completionRate >= 20) status = 'poor';

                        let weeklyActiveDays = 0;
                        if (task.id && typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id)) {
                            const taskTxs = transactionIndex.get(task.id);
                            const now = Date.now();
                            const sevenDaysAgo = now - 7 * MS_PER_DAY;
                            const activeDates = new Set();
                            taskTxs.forEach(tx => {
                                const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
                                if (t >= sevenDaysAgo && t <= now && !tx.undone) {
                                    activeDates.add(new Date(t).toDateString());
                                }
                            });
                            weeklyActiveDays = activeDates.size;
                        }

                        return {
                            name: task.name,
                            streak: task.habitDetails?.streak || 0,
                            completionRate: completionRate,
                            status: status,
                            weeklyActiveDays: weeklyActiveDays
                        };
                    })
                    .sort((a, b) => b.completionRate - a.completionRate);
            }

            const sleepHistory = typeof getSleepHistory === 'function' ? getSleepHistory() : [];
            if (Array.isArray(sleepHistory) && sleepHistory.length > 0) {
                const maxSleepDays = dataWindowRange?.days || 14;
                const recentRecords = sleepHistory.slice(0, maxSleepDays);
                let totalDuration = 0;
                let totalQuality = 0;
                let validCount = 0;
                const dailyDetails = [];

                recentRecords.forEach(record => {
                    if (record.duration) {
                        totalDuration += record.duration;
                        totalQuality += record.quality || 0;
                        validCount++;
                        dailyDetails.push({
                            date: record.date,
                            duration: (record.duration / 3600).toFixed(1),
                            quality: record.quality || 0
                        });
                    }
                });

                if (validCount > 0) {
                    data.sleep = {
                        recordCount: validCount,
                        avgDuration: (totalDuration / validCount / 3600).toFixed(1),
                        avgQuality: (totalQuality / validCount).toFixed(1),
                        dailyDetails: dailyDetails.reverse()
                    };
                }
            }

            const taskCategoryMap = {};
            if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                tasks.forEach(task => {
                    if (task.id && task.category) {
                        taskCategoryMap[task.id] = task.category;
                    }
                });
            }

            data.rawData = this._aggregateRawData(currentTxs, dataWindowRange, taskCategoryMap);

            if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                data.tasks = tasks
                    .filter(task => !task.hidden)
                    .map(task => ({
                        name: task.name,
                        type: task.type,
                        category: task.category,
                        unit: task.unit,
                        targetTime: task.targetTime,
                        multiplier: task.multiplier,
                        isHabit: task.isHabit,
                        habitType: task.habitDetails?.type,
                        habitPeriod: task.habitDetails?.period,
                        autoDetect: task.autoDetect,
                        appPackage: task.appPackage,
                        enableFloatingTimer: task.enableFloatingTimer,
                        isSystem: task.isSystem
                    }));
            }

        } catch (error) {
            console.error('[AI_ASSISTANT] 收集用户数据失败:', error);
        }

        return data;
    },

    /**
     * 聚合原始交易数据为多维分析素材
     */
    _aggregateRawData(txs, periodRange, taskCategoryMap) {
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const rawData = {
            transactionCount: txs.length,
            dailyBreakdown: [],
            taskBreakdown: [],
            timeDistribution: {
                morning: { label: '早晨(6-12点)', earn: 0, spend: 0 },
                afternoon: { label: '下午(12-18点)', earn: 0, spend: 0 },
                evening: { label: '晚上(18-24点)', earn: 0, spend: 0 },
                night: { label: '深夜(0-6点)', earn: 0, spend: 0 },
                settledEarn: 0,
                settledSpend: 0
            },
            categoryBreakdown: {}
        };

        if (!txs || txs.length === 0) return rawData;

        const dailyMap = new Map();
        const taskMap = new Map();
        const categoryMap = new Map();

        txs.forEach(tx => {
            const txDate = new Date(typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime());
            const dateKey = `${txDate.getMonth() + 1}月${txDate.getDate()}日`;
            const hour = txDate.getHours();

            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, { date: dateKey, earn: 0, spend: 0, tasks: new Set() });
            }
            const day = dailyMap.get(dateKey);
            if (tx.type === 'earn') day.earn += tx.amount || 0;
            else day.spend += tx.amount || 0;
            if (tx.taskName) day.tasks.add(tx.taskName);

            let slot = 'night';
            if (hour >= 6 && hour < 12) slot = 'morning';
            else if (hour >= 12 && hour < 18) slot = 'afternoon';
            else if (hour >= 18 && hour < 24) slot = 'evening';

            const isSystemSettlement = tx.systemType === 'screen-time' || tx.autoDetectData ||
                (tx.description && (tx.description.includes('自动补录') || tx.description.includes('屏幕时间')));

            if (isSystemSettlement) {
                if (tx.type === 'earn') rawData.timeDistribution.settledEarn += tx.amount || 0;
                else rawData.timeDistribution.settledSpend += tx.amount || 0;
            } else {
                if (tx.type === 'earn') rawData.timeDistribution[slot].earn += tx.amount || 0;
                else rawData.timeDistribution[slot].spend += tx.amount || 0;
            }

            const taskName = tx.taskName || tx.taskId || '未知任务';
            const resolvedCategory = tx.category || (taskCategoryMap && taskCategoryMap[tx.taskId]) || '未分类';
            if (!taskMap.has(taskName)) {
                taskMap.set(taskName, { name: taskName, category: resolvedCategory, totalTime: 0, count: 0, type: tx.type });
            }
            const task = taskMap.get(taskName);
            task.totalTime += tx.amount || 0;
            task.count += 1;
            if (resolvedCategory && resolvedCategory !== task.category) task.category = resolvedCategory;

            const cat = resolvedCategory;
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { name: cat, earn: 0, spend: 0, count: 0 });
            }
            const catData = categoryMap.get(cat);
            if (tx.type === 'earn') catData.earn += tx.amount || 0;
            else catData.spend += tx.amount || 0;
            catData.count += 1;
        });

        const maxDailyEntries = periodRange?.days || 14;
        rawData.dailyBreakdown = Array.from(dailyMap.values())
            .sort((a, b) => {
                const da = new Date('2024年' + a.date);
                const db = new Date('2024年' + b.date);
                return da - db;
            })
            .slice(0, maxDailyEntries)
            .map(d => ({ date: d.date, earn: d.earn, spend: d.spend, net: d.earn - d.spend, topTasks: Array.from(d.tasks).slice(0, 5) }));

        rawData.taskBreakdown = Array.from(taskMap.values())
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, 15)
            .map(t => ({
                name: t.name,
                category: t.category,
                totalTime: formatDuration(t.totalTime),
                totalSeconds: t.totalTime,
                count: t.count,
                avgTime: formatDuration(Math.round(t.totalTime / t.count)),
                type: t.type
            }));

        rawData.categoryBreakdown = Array.from(categoryMap.values())
            .sort((a, b) => (b.earn + b.spend) - (a.earn + a.spend))
            .map(c => ({
                name: c.name,
                earn: formatDuration(c.earn),
                spend: formatDuration(c.spend),
                count: c.count
            }));

        return rawData;
    },

    /**
     * 收集全量数据（用于 brain 初始化）
     */
    collectFullData() {
        try {
            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            const now = Date.now();

            let totalDays = 0;
            if (typeof transactions !== 'undefined' && transactions.length > 0) {
                const firstTx = [...transactions].sort((a, b) => a.timestamp - b.timestamp)[0];
                const firstDate = new Date(firstTx?.timestamp || now);
                totalDays = Math.max(1, Math.ceil((now - firstDate.getTime()) / MS_PER_DAY));
            }

            const txList = (typeof transactions !== 'undefined' ? transactions : [])
                .filter(tx => !tx.undone)
                .slice(-2000)
                .map(tx => ({
                    timestamp: typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime(),
                    type: tx.type,
                    taskName: String(tx.taskName || ''),
                    category: String(tx.category || ''),
                    amount: typeof tx.amount === 'number' ? tx.amount : 0,
                    ...(tx.systemType ? { systemType: tx.systemType } : {})
                }));

            const taskList = (typeof tasks !== 'undefined' ? tasks : [])
                .filter(t => !t.hidden)
                .map(t => ({
                    name: String(t.name || ''),
                    type: t.type,
                    category: String(t.category || ''),
                    targetTime: typeof t.targetTime === 'number' ? t.targetTime : 0,
                    multiplier: typeof t.multiplier === 'number' ? t.multiplier : 1,
                    isHabit: !!t.isHabit,
                    habitType: t.habitDetails?.type || null,
                    habitPeriod: t.habitDetails?.period || null,
                    autoDetect: !!t.autoDetect,
                    isSystem: !!t.isSystem
                }));

            const habitHistory = [];
            if (typeof tasks !== 'undefined' && typeof transactionIndex !== 'undefined') {
                const habitTasks = tasks.filter(t => t.isHabit);
                const thirtyDaysAgo = now - 30 * MS_PER_DAY;

                habitTasks.forEach(task => {
                    if (!task.id || !transactionIndex.has(task.id)) return;
                    const taskTxs = transactionIndex.get(task.id).filter(tx => {
                        const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
                        return t >= thirtyDaysAgo && !tx.undone && tx.type === 'earn';
                    });

                    const dateMap = new Map();
                    taskTxs.forEach(tx => {
                        const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
                        // [v9.36.0] 用本地日期而非 UTC(toISOString)，避免跨日习惯归属错位
                        const dd = new Date(t);
                        const dateStr = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
                        if (!dateMap.has(dateStr)) dateMap.set(dateStr, { amount: 0, count: 0 });
                        const entry = dateMap.get(dateStr);
                        entry.amount += typeof tx.amount === 'number' ? tx.amount : 0;
                        entry.count++;
                    });

                    dateMap.forEach((val, date) => {
                        const targetCount = task.habitDetails?.targetCountInPeriod || 1;
                        const isValid = task.type === 'continuous_target'
                            ? val.amount >= (task.targetTime || 0)
                            : val.count >= targetCount;
                        habitHistory.push({
                            date: date,
                            habitId: String(task.name || ''),
                            completed: !!isValid,
                            amount: Math.round(val.amount)
                        });
                    });
                });
            }

            const dailySummaries = [];
            if (typeof dailyChanges !== 'undefined') {
                const dates = Object.keys(dailyChanges).sort().slice(-30);
                dates.forEach(date => {
                    const dc = dailyChanges[date];
                    if (dc && typeof dc === 'object') {
                        const rawTasks = Array.isArray(dc.tasks) ? dc.tasks : [];
                        const cleanTasks = rawTasks.map(t => {
                            if (typeof t === 'string') return t;
                            if (typeof t === 'object' && t !== null) return String(t.name || t.id || JSON.stringify(t)).substring(0, 50);
                            return String(t).substring(0, 50);
                        }).slice(0, 30);

                        dailySummaries.push({
                            date: String(date),
                            totalEarn: typeof dc.earned === 'number' ? dc.earned : 0,
                            totalSpend: typeof dc.spent === 'number' ? dc.spent : 0,
                            taskCompletions: cleanTasks
                        });
                    }
                });
            }

            const allTxCount = (typeof transactions !== 'undefined' ? transactions : []).filter(tx => !tx.undone).length;
            return {
                meta: {
                    exportAt: Date.now(),
                    totalDays: totalDays,
                    transactionCount: allTxCount,
                    analyzedCount: txList.length,
                    // [v9.36.0] 设备本地时区相对 UTC 的偏移（分钟），东八区为 480，供云函数兜底换算
                    timezoneOffset: -new Date().getTimezoneOffset(),
                    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown'
                },
                transactions: txList,
                tasks: taskList,
                habitHistory: habitHistory.slice(-200),
                dailySummaries: dailySummaries
            };
        } catch (error) {
            console.error('[AI_ASSISTANT] collectFullData 失败:', error);
            return {
                meta: { exportAt: Date.now(), totalDays: 0, transactionCount: 0, version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown' },
                transactions: [],
                tasks: [],
                habitHistory: [],
                dailySummaries: []
            };
        }
    },

    /**
     * 收集增量数据（用于 brain 同步）
     */
    collectIncrementalData() {
        const settings = this.getSettings();
        const lastSync = settings.lastSyncAt || 0;
        const now = Date.now();

        const newTransactions = (typeof transactions !== 'undefined' ? transactions : [])
            .filter(tx => !tx.undone && tx.timestamp > lastSync)
            .map(tx => ({
                ts: tx.timestamp,
                t: tx.type === 'earn' ? 'e' : 's',
                n: tx.taskName,
                c: tx.category,
                a: tx.amount
            }));

        const habitUpdates = [];
        if (typeof tasks !== 'undefined') {
            tasks.filter(t => t.isHabit).forEach(task => {
                habitUpdates.push({
                    habitId: task.name,
                    completed: (task.habitDetails?.streak || 0) > 0,
                    streak: task.habitDetails?.streak || 0
                });
            });
        }

        const today = new Date().toISOString().slice(0, 10);
        const todaySummary = typeof dailyChanges !== 'undefined' && dailyChanges[today]
            ? dailyChanges[today]
            : { earned: 0, spent: 0 };

        const todayHabits = {};
        if (typeof tasks !== 'undefined') {
            tasks.filter(t => t.isHabit).forEach(task => {
                todayHabits[task.name] = (task.habitDetails?.streak || 0) > 0;
            });
        }

        return {
            syncId: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: now,
            sinceLastSync: lastSync,
            newTransactions: newTransactions,
            habitUpdates: habitUpdates,
            currentSummary: {
                date: today,
                todayEarn: todaySummary.earned || 0,
                todaySpend: todaySummary.spent || 0,
                todayNet: (todaySummary.earned || 0) - (todaySummary.spent || 0),
                todayHabits: todayHabits
            }
        };
    },

    /**
     * 获取周期时间范围
     */
    _getPeriodRange(period) {
        const now = new Date();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();
        const todayEnd = new Date(year, month, date, 23, 59, 59, 999);

        if (period === '今日' || period === '今天') {
            const start = new Date(year, month, date, 0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 1, label: '今天' };
        } else if (period === '近3日') {
            const start = new Date(now.getTime() - 2 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 3, label: '最近3天' };
        } else if (period === '近7日') {
            const start = new Date(now.getTime() - 6 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 7, label: '最近7天' };
        } else if (period === '近30日') {
            const start = new Date(now.getTime() - 29 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 30, label: '最近30天' };
        }
        const start = new Date(now.getTime() - 6 * MS_PER_DAY);
        start.setHours(0, 0, 0, 0);
        return { start: start.getTime(), end: now.getTime(), days: 7, label: '最近7天' };
    },

    /**
     * 获取上一个周期的时间范围
     */
    _getPrevPeriodRange(currentRange) {
        const periodLength = currentRange.end - currentRange.start;
        const prevEnd = currentRange.start - 1;
        const prevStart = prevEnd - periodLength;
        const prevStartDate = new Date(prevStart);
        const prevEndDate = new Date(prevEnd);
        return {
            start: prevStart,
            end: prevEnd,
            days: currentRange.days,
            label: `${prevStartDate.getMonth() + 1}月${prevStartDate.getDate()}日 - ${prevEndDate.getMonth() + 1}月${prevEndDate.getDate()}日`
        };
    },

    /**
     * 获取数据收集窗口范围
     */
    _getDataWindowRange(period) {
        const now = new Date();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();
        const todayEnd = new Date(year, month, date, 23, 59, 59, 999);

        if (period === '今日' || period === '今天') {
            const start = new Date(year, month, date, 0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 1, label: '今天' };
        } else if (period === '近3日') {
            const start = new Date(now.getTime() - 2 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 3, label: '最近3天' };
        } else if (period === '近7日') {
            const start = new Date(now.getTime() - 6 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 7, label: '最近7天' };
        } else if (period === '近30日') {
            const start = new Date(now.getTime() - 29 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            return { start: start.getTime(), end: todayEnd.getTime(), days: 30, label: '最近30天' };
        }
        const start = new Date(now.getTime() - 6 * MS_PER_DAY);
        start.setHours(0, 0, 0, 0);
        return { start: start.getTime(), end: now.getTime(), days: 7, label: '最近7天' };
    },

    /**
     * 从云端获取 brain 文档
     */
    async getBrain() {
        try {
            const app = this.getApp();
            // [v9.36.0] 依赖云开发「仅创建者可读写」安全规则：查询不带 _openid 过滤、不手动拼 uid，
            // 由服务端限定为当前登录用户，避免前端推断的 uid 与真实 openid 不一致导致画像"保存了却读不到"
            const res = await app.database().collection('tb_ai_brain').limit(1).get();
            return res.data?.[0] || null;
        } catch (e) {
            console.warn('[AI_ASSISTANT] getBrain 失败:', e);
            return null;
        }
    },

    /**
     * 保存 brain 文档到云端
     */
    async saveBrain(data) {
        try {
            const app = this.getApp();
            const db = app.database();
            // [v9.36.0] 不手动传 _openid、查询不带 where：由服务端注入真实登录 openid 并按当前用户限定，
            // 与 getBrain 保持同一用户视角，避免画像"保存了却读不到/重开消失"
            const existing = await db.collection('tb_ai_brain').limit(1).get();
            const now = new Date();
            const doc = {
                ...data,
                updatedAt: now,
                createdAt: existing.data?.[0]?.createdAt || now
            };

            if (existing.data && existing.data.length > 0) {
                await db.collection('tb_ai_brain').doc(existing.data[0]._id).update(doc);
            } else {
                await db.collection('tb_ai_brain').add(doc);
            }
            return true;
        } catch (e) {
            console.error('[AI_ASSISTANT] saveBrain 失败:', e);
            throw e;
        }
    },

    /**
     * 保存对话消息
     */
    async saveChatMessage(role, content) {
        try {
            const app = this.getApp();
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            let uid = null;
            if (authInstance) {
                const loginState = authInstance.hasLoginState ? authInstance.hasLoginState() : null;
                const userObj = loginState?.user || loginState;
                uid = userObj?.uid || userObj?.openid;
            }
            if (!uid) return false;
            await app.database().collection('tb_ai_messages').add({
                _openid: uid,
                type: 'chat',
                role,
                content: String(content || ''),
                isRead: role === 'user',
                createdAt: new Date()
            });
            return true;
        } catch (e) {
            console.warn('[AI_ASSISTANT] saveChatMessage 失败:', e);
            return false;
        }
    },

    /**
     * 保存报告
     */
    async saveReport(type, content) {
        try {
            const app = this.getApp();
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            let uid = null;
            if (authInstance) {
                const loginState = authInstance.hasLoginState ? authInstance.hasLoginState() : null;
                const userObj = loginState?.user || loginState;
                uid = userObj?.uid || userObj?.openid;
            }
            if (!uid) return false;
            const titles = { daily: '日报', weekly: '周报', monthly: '月报' };
            await app.database().collection('tb_ai_messages').add({
                _openid: uid,
                type: `report_${type}`,
                role: 'assistant',
                content: String(content || ''),
                title: titles[type] || 'AI 报告',
                isRead: false,
                createdAt: new Date()
            });
            return true;
        } catch (e) {
            console.warn('[AI_ASSISTANT] saveReport 失败:', e);
            return false;
        }
    },

    /**
     * 构建对话 Prompt，融入 brain 画像
     * [v9.35.0] 新增 deepContext 参数：全量数据统计特征（迷茫/失衡/效率场景的分析依据）
     */
    buildChatPrompt(message, brain, history, deepContext = '') {
        let prompt = '';
        if (brain?.summary) {
            prompt += `【关于用户】${brain.summary}\n\n`;
        }
        if (brain?.profile) {
            const p = brain.profile;
            prompt += `【长期画像】\n`;
            if (p.habits?.strong?.length) prompt += `强项习惯：${p.habits.strong.join('、')}\n`;
            if (p.habits?.weak?.length) prompt += `薄弱习惯：${p.habits.weak.join('、')}\n`;
            if (p.preferences?.praiseStyle) prompt += `鼓励方式：${p.preferences.praiseStyle}\n`;
            if (p.preferences?.disciplineStyle) prompt += `提醒方式：${p.preferences.disciplineStyle}\n`;
            if (p.insights?.length) prompt += `关键洞察：${p.insights.slice(0, 3).join('；')}\n`;
            prompt += `\n`;
        }
        // [v9.35.0] 深度数据上下文：用户感到迷茫/失衡/想优化效率时，AI 据此给数据支撑的建议
        if (deepContext) {
            prompt += `【用户全量数据统计（内部参考，用于给出有依据的建议）】\n${deepContext}\n\n`;
        }
        if (history && history.length > 0) {
            prompt += `【最近对话】\n`;
            history.slice(-10).forEach(h => {
                const role = h.role === 'user' ? '用户' : 'Time Bot';
                prompt += `${role}：${String(h.content || '').substring(0, 120)}\n`;
            });
            prompt += `\n`;
        }
        prompt += `【当前消息】\n用户：${message}\n\n`;
        prompt += `你是用户的 AI 伙伴「Time Bot」。请基于以上用户画像和对话上下文，温暖、自然地回复。不要列出数据，像朋友一样说话。`;
        prompt += `当用户表达迷茫、难以维持平衡、或希望优化效率时，请结合【用户全量数据统计】中的趋势、时段习惯、分类结构、习惯坚持等特征，给出具体的、可执行的下一步建议（可以引用具体数字增强说服力，但以朋友口吻表达，不要像报告一样罗列）。`;
        return prompt;
    },

    /**
     * 构建报告 Prompt
     */
    buildReportPrompt(userData, type) {
        const { summary, habits, sleep, rawData } = userData;
        const periodTextMap = { daily: '今日', weekly: '本周', monthly: '本月' };
        const periodText = periodTextMap[type] || type;

        let prompt = `你是时间银行 AI 助手。时间银行中，earn=产出，spend=消耗，余额=累计earn-spend。\n\n`;
        prompt += `请根据以下${periodText}数据生成${type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报'}。\n\n`;

        if (summary) {
            prompt += `【收支】余额${(summary.currentBalance || 0) >= 0 ? '盈余' : '透支'}${this._formatDuration(Math.abs(summary.currentBalance || 0))}；${periodText}获得${summary.totalEarnedFormatted || '0'}，消费${summary.totalSpentFormatted || '0'}，净${summary.totalNet >= 0 ? '+' : ''}${summary.totalNetFormatted || '0'}`;
            if (summary.prevEarned !== undefined) {
                prompt += `；环比获得${summary.earnChangePercent > 0 ? '+' : ''}${summary.earnChangePercent}%，消费${summary.spendChangePercent > 0 ? '+' : ''}${summary.spendChangePercent}%`;
            }
            prompt += `\n\n`;
        }

        if (type === 'daily') {
            if (habits && habits.length > 0) {
                prompt += `【习惯】${habits.slice(0, 5).map(h => `${h.name}(${h.completionRate}%)`).join('，')}\n\n`;
            }
            if (sleep) {
                prompt += `【睡眠】${sleep.avgDuration}小时/质量${sleep.avgQuality}\n\n`;
            }
            prompt += `【要求】80字左右，温暖像朋友，只说今天亮点、一个提醒、明天一个小建议。`;
        } else {
            if (rawData?.dailyBreakdown && rawData.dailyBreakdown.length > 0) {
                prompt += `【每日】${rawData.dailyBreakdown.map(d => `${d.date}:获${this._formatDuration(d.earn)}消${this._formatDuration(d.spend)}`).join('；')}\n\n`;
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
            if (type === 'weekly') {
                prompt += `250字左右，用###小标题，包含整体表现、习惯进展、下周建议。`;
            } else {
                prompt += `350字左右，用###小标题，包含整体趋势、习惯变化、下月目标。`;
            }
        }
        return prompt;
    },

    /**
     * 构建全量分析 Prompt
     */
    buildFullAnalysisPrompt(fullData) {
        const { meta, transactions, tasks, habitHistory, dailySummaries } = fullData;

        let prompt = `你是一位顶尖的用户行为分析师。请分析以下用户的完整 TimeBank 数据，生成一份深度、精准、结构化的用户画像。\n\n`;
        prompt += `【关于 TimeBank】时间银行是一款时间管理应用。用户通过"earn"记录产出性活动，通过"spend"记录消耗性活动。\n\n`;

        // [v9.36.0] 明确总条数为"累计值"并给出程序算好的日均，避免 AI 把累计当成单日
        const txCount = meta?.transactionCount || (Array.isArray(transactions) ? transactions.length : 0) || 0;
        const totalDays = meta?.totalDays || 0;
        const dailyAvg = (totalDays > 0 && txCount > 0) ? (txCount / totalDays).toFixed(1) : null;
        prompt += `【使用概览】\n`;
        prompt += `- 使用总天数：${totalDays || '未知'}\n`;
        prompt += `- 交易总条数：${txCount} 条（这是近 ${totalDays || '多'} 天的「累计」总条数，不是单日条数）\n`;
        if (dailyAvg) prompt += `- 日均交易数：约 ${dailyAvg} 条/天（由程序计算得出，请直接采用此数值，切勿自行换算或夸大）\n\n`;

        if (tasks && tasks.length > 0) {
            prompt += `【任务配置】（共 ${tasks.length} 个）\n`;
            tasks.slice(0, 30).forEach(t => {
                const habitInfo = t.isHabit ? ` [习惯:${t.habitType || '普通'}]` : '';
                prompt += `- ${t.name}(${t.type}, ${t.category || '未分类'})${habitInfo} 目标:${Math.round((t.targetTime || 0) / 60)}分钟\n`;
            });
            if (tasks.length > 30) prompt += `... 还有 ${tasks.length - 30} 个任务\n`;
            prompt += `\n`;
        }

        if (transactions && transactions.length > 0) {
            const sorted = [...transactions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const recent = sorted.slice(-1000);
            prompt += `【交易记录】（最近 ${recent.length} 条，时间为『本地时间』，已含星期，据此分析工作日/周末差异）\n`;
            const WEEKS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            recent.forEach(tx => {
                const d = new Date(tx.timestamp);
                const date = `${d.getMonth() + 1}-${d.getDate()}(${WEEKS[d.getDay()] || ''})`;
                const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                const type = tx.type === 'earn' ? '收入' : '支出';
                const mins = Math.round((tx.amount || 0) / 60);
                prompt += `${date},${time},${type},${tx.taskName || ''},${mins},${tx.category || '未分类'}\n`;
            });
            if (transactions.length > 1000) prompt += `... 还有 ${transactions.length - 1000} 条更早的记录未显示\n`;
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
    },

    /**
     * 从 AI 响应中解析用户画像 JSON
     */
    parseProfileFromAIResponse(aiText) {
        try {
            const clean = aiText.replace(/```json\s*|\s*```/gi, '').trim();
            const jsonStart = clean.indexOf('{');
            const jsonEnd = clean.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const jsonStr = clean.substring(jsonStart, jsonEnd + 1);
                return JSON.parse(jsonStr);
            }
        } catch (e) {
            console.warn('[AI_ASSISTANT] 解析画像 JSON 失败，使用备用解析:', e);
        }
        return {
            habits: { strong: [], weak: [], trending: {} },
            patterns: { peakHours: [], lowHours: [], weekendDifference: '', consistency: '' },
            preferences: { praiseStyle: '', disciplineStyle: '', sensitiveTopics: [], motivationTriggers: [] },
            history: { bestStreak: null, worstPeriod: null },
            insights: ['用户数据丰富，建议持续观察']
        };
    },

    /**
     * 基于画像生成一句话总结
     */
    async generateSummary(profile, options = {}) {
        try {
            const prompt = `基于以下用户画像，用一句话总结这个用户（50字以内）：\n${JSON.stringify(profile, null, 2)}\n\n只输出总结句，不要任何其他内容。`;
            const summary = await this.callAI(prompt, {
                provider: options.provider,
                model: options.model,
                maxTokens: 100,
                timeoutMs: 120000,
                action: 'chat'
            });
            return summary.trim();
        } catch (e) {
            console.warn('[AI_ASSISTANT] 生成 summary 失败:', e);
            return '';
        }
    },

    /**
     * 格式化时长
     */
    _formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '0分钟';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0 && mins > 0) return `${hours}小时${mins}分钟`;
        if (hours > 0) return `${hours}小时`;
        return `${mins}分钟`;
    }
};

/**
 * 计算习惯完成率
 */
function calculateHabitCompletionRate(task) {
    if (!task.habitDetails) return 0;

    const period = task.habitDetails.period || 'daily';
    const targetCount = task.habitDetails.targetCountInPeriod || 1;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * MS_PER_DAY;

    let taskTxs = [];
    if (task.id && typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id)) {
        taskTxs = transactionIndex.get(task.id).filter(tx => {
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            return t >= thirtyDaysAgo && t <= now && !tx.undone && tx.type === 'earn';
        });
    }

    if (taskTxs.length === 0) return 0;

    const isValidCompletion = (tx) => {
        if (task.type === 'continuous_target') {
            return (tx.amount >= task.targetTime) || (tx.isStreakAdvancement === true);
        }
        return true;
    };

    const getDateStr = (timestamp) => {
        const d = new Date(timestamp);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getWeekStartStr = (timestamp) => {
        const d = new Date(timestamp);
        const day = d.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
        const year = monday.getFullYear();
        const month = (monday.getMonth() + 1).toString().padStart(2, '0');
        const dayStr = monday.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${dayStr}`;
    };

    if (period === 'daily') {
        const dateCount = new Map();
        taskTxs.forEach(tx => {
            if (!isValidCompletion(tx)) return;
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            const dateStr = getDateStr(t);
            dateCount.set(dateStr, (dateCount.get(dateStr) || 0) + 1);
        });

        let completedDays = 0;
        dateCount.forEach(count => {
            if (count >= targetCount) completedDays++;
        });

        return Math.min(100, Math.round((completedDays / 30) * 100));
    } else if (period === 'weekly') {
        const weekCount = new Map();
        taskTxs.forEach(tx => {
            if (!isValidCompletion(tx)) return;
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            const weekStr = getWeekStartStr(t);
            weekCount.set(weekStr, (weekCount.get(weekStr) || 0) + 1);
        });

        let completedWeeks = 0;
        weekCount.forEach(count => {
            if (count >= targetCount) completedWeeks++;
        });

        const totalWeeks = Math.ceil(30 / 7);
        return Math.min(100, Math.round((completedWeeks / totalWeeks) * 100));
    }

    return 0;
}

/**
 * 格式化时长
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

// 导出到全局
window.AI_ASSISTANT_SERVICE = AI_ASSISTANT_SERVICE;
