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
    HTTP_ENDPOINT: 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI',

    // 前端直连的模型 API 密钥（已接受暴露风险）
    API_KEYS: {
        kimi: 'sk-gD0drk8yIuCm83qsCRGdkk1WciG9ApRQildoNogzqupwmObF',
        minimax: 'sk-cp-VaksQTFz8wu_ahcZGJEsDBYeNkq1sN5-qa9X3t2McvHHBdmI5wYD0KfBQ3CzFd_pipfmwLLtUM2uUdPUxlf3Pd7rG3GKV5rIbFLzxh7KpvkdVsZejbFRt10'
    },

    // 统一 localStorage 设置键
    STORAGE_KEY: 'timebankAISettings',

    // 状态
    isGenerating: false,
    isSyncing: false,
    isInitializing: false,

    // 默认设置
    DEFAULT_SETTINGS: {
        model: 'MiniMax-M3',
        provider: 'minimax',
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
            else settings.provider = 'minimax';
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
     * [v9.17.0] [v9.17.0-fix 优化 prompt] 调用 MiniMax 图像生成 API 生成任务卡片背景图
     * 端点：https://api.minimaxi.com/v1/image_generation
     * 模型：image-01
     * 流程：先调 LLM (MiniMax M3) 提取视觉描述 → 再调 image-01 生图
     * @param {object} taskInfo - { name, note, category, colorHex, type }
     * @param {object} [options] - { aspectRatio, abortSignal, timeoutMs, onProgress }
     * @returns {Promise<{base64: string, mimeType: string, visualDescription: string}>}
     */
    async generateTaskBackgroundImage(taskInfo, options = {}) {
        // 兼容旧签名：generateTaskBackgroundImage(taskName, category, options)
        if (typeof taskInfo === 'string') {
            taskInfo = { name: arguments[0], category: arguments[1] };
            options = arguments[2] || {};
        }

        const apiKey = this.API_KEYS.minimax;
        if (!apiKey) throw new Error('MiniMax API 密钥未配置');
        const name = (taskInfo && taskInfo.name || '').trim();
        if (!name) throw new Error('任务名不能为空');

        const aspectRatio = options.aspectRatio || '3:2';
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

        // 1. LLM 提取视觉描述
        onProgress('正在分析任务信息...');
        let visualDescription = '';
        try {
            visualDescription = await this.analyzeTaskForVisual({
                name,
                note: (taskInfo.note || '').trim(),
                category: (taskInfo.category || '').trim(),
                colorHex: (taskInfo.colorHex || '').trim(),
                type: (taskInfo.type || '').trim()
            });
            console.log('[AI_ASSISTANT] 视觉描述:', visualDescription.substring(0, 200));
        } catch (llmErr) {
            console.warn('[AI_ASSISTANT] LLM 提取失败，fallback 到简单 prompt:', llmErr.message);
            // fallback：直接用任务名作为意象
            visualDescription = `时间管理应用的任务卡片背景图，主题灵感：${name}。抽象水彩/印象派艺术风格，色调温暖柔和，主体居中偏虚，无任何文字，无人物特写，无可识别人物，3:2 横向比例。`;
        }

        // 2. 构造生图 prompt（在视觉描述基础上加风格/构图要求）
        const imagePrompt = `${visualDescription}

【风格与构图要求】
- 抽象水彩/印象派艺术风格
- 3:2 横向比例
- 主体居中或符合黄金分割，主体偏虚避免抢眼
- 色调温暖柔和，适合作为 UI 卡片背景
- 无任何文字、无人物特写、无可识别人物
- 背景简洁干净，边缘不要有过多细节`;

        // 3. 调用生图 API
        onProgress('正在生成背景图...');

        const controller = new AbortController();
        if (options.abortSignal) {
            if (options.abortSignal.aborted) {
                controller.abort();
            } else {
                options.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
            }
        }
        // 生图单独 90 秒超时（不与 LLM 共用总超时）
        const timer = setTimeout(() => controller.abort(), 90000);

        const payload = {
            prompt: imagePrompt,
            model: 'image-01',
            aspect_ratio: aspectRatio,
            response_format: 'base64',
            n: 1
        };

        try {
            console.log('[AI_ASSISTANT] 任务卡片背景生图 prompt=', imagePrompt.substring(0, 200).replace(/\s+/g, ' '));
            const response = await fetch('https://api.minimaxi.com/v1/image_generation', {
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
                const errText = await response.text().catch(() => '');
                throw new Error(`MiniMax 图像生成 API 错误 (${response.status}): ${errText.substring(0, 200)}`);
            }

            const data = await response.json();
            if (data.base_resp && data.base_resp.status_code !== undefined && data.base_resp.status_code !== 0) {
                throw new Error(`MiniMax 图像生成失败: ${data.base_resp.status_msg || data.base_resp.status_code}`);
            }

            let base64Data = null;
            const candidates = [
                data.data && data.data.image_base64,
                data.data && data.data.image,
                data.image_base64,
                data.image
            ];
            for (const c of candidates) {
                if (!c) continue;
                if (Array.isArray(c) && c.length > 0) { base64Data = c[0]; break; }
                if (typeof c === 'string' && c.length > 100) { base64Data = c; break; }
            }
            if (!base64Data) {
                throw new Error('MiniMax 图像生成返回数据格式异常');
            }

            return {
                base64: base64Data,
                mimeType: 'image/jpeg',
                visualDescription // 一并返回，方便调试/日志
            };
        } catch (error) {
            clearTimeout(timer);
            if (error.name === 'AbortError') {
                throw new Error('生图已取消');
            }
            throw error;
        }
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
     * - MiniMax：前端直连（[v9.16.0] 优先）
     * - Kimi：前端直连
     * - 其他：走 CloudBase 云函数
     */
    async callAI(prompt, options = {}) {
        const { provider = 'minimax', model } = options;
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
     * 发送对话消息
     */
    async chat(message) {
        try {
            const modelPref = this.getModelPreference();
            const brain = await this.getBrain();
            const history = await this.getChatHistory(10);
            const prompt = this.buildChatPrompt(message, brain, history);

            const reply = await this.callAI(prompt, {
                provider: modelPref.provider,
                model: modelPref.model,
                maxTokens: 1000,
                timeoutMs: 120000,
                action: 'chat',
                data: { message }
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
            const initProvider = this.API_KEYS.minimax ? 'minimax' : (this.API_KEYS.kimi ? 'kimi' : userPref.provider);
            const initModel = initProvider === 'minimax' ? 'MiniMax-M3' : (initProvider === 'kimi' ? 'kimi-k2.6' : userPref.model);
            const prompt = this.buildFullAnalysisPrompt(fullData);

            if (typeof showToast === 'function') showToast(`🧠 正在用 ${initProvider === 'minimax' ? 'MiniMax M3' : (initProvider === 'kimi' ? 'Kimi' : initModel)} 分析你的全部数据...`, 5000);

            const aiText = await this.callAI(prompt, {
                provider: initProvider,
                model: initModel,
                maxTokens: 2000,
                timeoutMs: 300000,
                action: 'initBrain',
                data: { fullData }
            });

            const profile = this.parseProfileFromAIResponse(aiText);
            const summary = await this.generateSummary(profile, { provider: initProvider, model: initModel });

            await this.saveBrain({ profile, summary, cognitionVersion: 1, lastAnalysisMethod: 'internal_full' });
            this.saveSettings({ initStatus: true, lastSyncAt: Date.now() });

            if (typeof showToast === 'function') showToast('✅ AI 大脑初始化成功！', 3000);
            return { code: 0, message: 'AI 记忆初始化成功', summary };
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
                        const dateStr = new Date(t).toISOString().slice(0, 10);
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
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            let uid = null;
            if (authInstance) {
                const loginState = authInstance.hasLoginState ? authInstance.hasLoginState() : null;
                const userObj = loginState?.user || loginState;
                uid = userObj?.uid || userObj?.openid;
            }
            if (!uid) return null;
            const res = await app.database().collection('tb_ai_brain').where({ _openid: uid }).limit(1).get();
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
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            let uid = null;
            if (authInstance) {
                const loginState = authInstance.hasLoginState ? authInstance.hasLoginState() : null;
                const userObj = loginState?.user || loginState;
                uid = userObj?.uid || userObj?.openid;
            }
            if (!uid) throw new Error('未登录');

            const db = app.database();
            const existing = await db.collection('tb_ai_brain').where({ _openid: uid }).limit(1).get();
            const now = new Date();
            const doc = {
                _openid: uid,
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
     */
    buildChatPrompt(message, brain, history) {
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
        if (history && history.length > 0) {
            prompt += `【最近对话】\n`;
            history.slice(-10).forEach(h => {
                const role = h.role === 'user' ? '用户' : '时光';
                prompt += `${role}：${String(h.content || '').substring(0, 120)}\n`;
            });
            prompt += `\n`;
        }
        prompt += `【当前消息】\n用户：${message}\n\n`;
        prompt += `你是用户的 AI 伙伴「时光」。请基于以上用户画像和对话上下文，温暖、自然地回复。不要列出数据，像朋友一样说话。`;
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
        prompt += `【使用概览】\n`;
        prompt += `- 使用总天数：${meta?.totalDays || '未知'}\n`;
        prompt += `- 交易总条数：${meta?.transactionCount || transactions?.length || 0}\n\n`;

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
            prompt += `【交易记录】（最近 ${recent.length} 条）\n`;
            recent.forEach(tx => {
                const d = new Date(tx.timestamp);
                const date = `${d.getMonth() + 1}-${d.getDate()}`;
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
        prompt += `要求：1.只输出 JSON 2.基于数据事实 3.数据不足填 null 或空数组 4.insights 至少 3 条。`;

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
