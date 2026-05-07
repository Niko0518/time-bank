/**
 * AI Service - 云端 AI 服务层
 * [v8.0.0-cloud] 通过 CloudBase 云函数调用 AI 服务
 *
 * 调用链：前端 JS → CloudBase 云函数 (timebankAI) → Gemini/混元/OpenAI
 */

const AI_SERVICE = {
    // 云函数名称
    FUNCTION_NAME: 'timebankAI',

    // [v8.0.0-fix] HTTP 访问服务端点（绕过 callFunction 15s 限制）
    HTTP_ENDPOINT: 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI',

    // [v8.0.0-fix] 按模型分别缓存报告，避免切换模型时命中旧缓存
    reportCache: {},
    reportCacheTime: {},
    CACHE_TTL: 3600000, // 1小时

    // 状态
    isGenerating: false,

    // [v8.0.0] 可用模型列表（从云函数 getStatus 获取后缓存）
    availableModels: null,

    // [v8.1.0] 用户周期偏好（localStorage 持久化）
    getPeriodPreference() {
        try {
            const saved = localStorage.getItem('timebankAIPeriod');
            if (saved) return saved;
        } catch (e) {
            console.warn('[AI_SERVICE] 读取周期偏好失败:', e);
        }
        return '近7日';
    },

    setPeriodPreference(period) {
        try {
            localStorage.setItem('timebankAIPeriod', period);
            console.log('[AI_SERVICE] 周期偏好已保存:', period);
        } catch (e) {
            console.warn('[AI_SERVICE] 保存周期偏好失败:', e);
        }
    },

    // [v8.0.0] 用户模型偏好（localStorage 持久化）
    getModelPreference() {
        try {
            const saved = localStorage.getItem('timebankAIModel');
            if (saved) {
                const parsed = JSON.parse(saved);
                // [v8.1.0] 兼容旧格式：补充 provider 字段
                if (!parsed.provider) {
                    if (parsed.model && parsed.model.includes('deepseek')) parsed.provider = 'deepseek';
                    else if (parsed.model && (parsed.model.includes('kimi') || parsed.model.includes('moonshot'))) parsed.provider = 'kimi';
                    else parsed.provider = 'deepseek';
                }
                return parsed;
            }
        } catch (e) {
            console.warn('[AI_SERVICE] 读取模型偏好失败:', e);
        }
        return { model: 'deepseek-v4-flash', provider: 'deepseek', thinking: false };
    },

    setModelPreference(preference) {
        try {
            localStorage.setItem('timebankAIModel', JSON.stringify(preference));
            console.log('[AI_SERVICE] 模型偏好已保存:', preference);
        } catch (e) {
            console.warn('[AI_SERVICE] 保存模型偏好失败:', e);
        }
    },

    /**
     * [v8.0.0-fix] 通过 HTTP 访问服务调用云函数（绕过 callFunction 15s 超时限制）
     * 适用于 generateInsight / chat 等耗时较长的操作
     */
    async callViaHTTP(action, data) {
        // [v8.2.0-fix] HTTP 访问服务不会自动传递 OPENID，需手动注入
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
        console.log(`[AI_SERVICE] HTTP 请求: action=${action}, body=${bodySizeMB}MB, openid=${openid ? openid.substring(0,8)+'...' : 'null'}`);

        const response = await fetch(this.HTTP_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        if (!response.ok) {
            if (response.status === 413) {
                throw new Error('请求数据过大(413)，请尝试减少数据量后重试');
            }
            throw new Error(`HTTP 错误: ${response.status}`);
        }
        const result = await response.json();
        return { result };
    },

    /**
     * 获取 CloudBase app 实例（确保使用正确的初始化实例）
     * [v8.0.0-fix] 必须使用全局 app 变量，cloudbase.callFunction 会创建新实例导致登录态丢失
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
     * @returns {Promise<boolean>}
     */
    async checkLoginStatus() {
        try {
            const authInstance = typeof auth !== 'undefined' ? auth : null;
            if (!authInstance) {
                console.warn('[AI_SERVICE] Auth not initialized yet');
                return false;
            }

            let loginState = null;
            if (typeof authInstance.hasLoginState === 'function') {
                loginState = authInstance.hasLoginState();
            }
            if (!loginState && typeof authInstance.getLoginState === 'function') {
                loginState = await authInstance.getLoginState();
            }

            console.log('[AI_SERVICE] Login state:', loginState);
            return !!loginState;
        } catch (error) {
            console.error('[AI_SERVICE] Check login status error:', error);
            return false;
        }
    },

    /**
     * 获取 AI 服务状态
     * @returns {Promise<{available: boolean, provider: string, message: string}>}
     */
    async getStatus() {
        try {
            const isLoggedIn = await this.checkLoginStatus();
            console.log('[AI_SERVICE] User logged in:', isLoggedIn);

            const result = await this.getApp().callFunction({
                name: this.FUNCTION_NAME,
                data: {
                    action: 'getStatus'
                }
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
                console.error('[AI_SERVICE] 获取状态失败:', result.result.message);
                return { available: false, provider: 'unknown', message: result.result.message };
            }
        } catch (error) {
            console.error('[AI_SERVICE] 获取状态异常:', error);
            return { available: false, provider: 'unknown', message: error.message };
        }
    },

    /**
     * [兼容旧代码] 获取 AI 服务状态（别名）
     * @returns {Promise<{available: boolean, provider: string, message: string}>}
     */
    async getLLMStatus() {
        return this.getStatus();
    },

    /**
     * 生成洞察报告
     * @param {Object} userData - 用户数据
     * @param {string} period - 周期（'近7日'|'近30日'）
     * @returns {Promise<string>} 报告文本
     */
    async generateInsightReport(userData, period = '近7日') {
        // [v8.1.0] 按模型+周期分别缓存
        const modelPref = this.getModelPreference();
        const cacheKey = `${modelPref.model}:${period}`;
        const now = Date.now();

        // 检查该模型+周期的缓存
        if (this.reportCache[cacheKey] && (now - (this.reportCacheTime[cacheKey] || 0)) < this.CACHE_TTL) {
            console.log(`[AI_SERVICE] 使用 ${cacheKey} 缓存的报告`);
            return this.reportCache[cacheKey];
        }

        // 防止重复调用
        if (this.isGenerating) {
            throw new Error('报告生成中，请稍候...');
        }

        this.isGenerating = true;

        try {
            console.log(`[AI_SERVICE] 开始生成洞察报告 (${cacheKey})...`);

            // [DEBUG] 检查登录状态，但暂时不阻止调用
            const isLoggedIn = await this.checkLoginStatus();
            console.log('[AI_SERVICE] User logged in:', isLoggedIn);

            // 构建请求数据，避免传递不必要的字段
            const requestData = {
                userData: {
                    summary: userData.summary,
                    habits: userData.habits,
                    tasks: userData.tasks,
                    sleep: userData.sleep,
                    rawData: userData.rawData,
                    period: period
                },
                model: modelPref.model,
                provider: modelPref.provider
            };
            if (modelPref.thinking) {
                requestData.thinking = true;
            }

            console.log('[AI_SERVICE] HTTP payload:', JSON.stringify(requestData).substring(0, 500));

            // [v8.0.0-fix] 耗时长，改用 HTTP 访问服务绕过 callFunction 15s 限制
            const result = await this.callViaHTTP('generateInsight', requestData);

            console.log('[AI_SERVICE] HTTP result:', result);

            if (result.result.code === 0) {
                const report = result.result.report;
                const usage = result.result.usage;

                console.log(`[AI_SERVICE] 报告生成成功 - 模型: ${cacheKey}, 耗时: ${usage?.elapsedMs}ms, 长度: ${usage?.reportLength}`);

                // [v8.1.0] 按模型+周期缓存报告
                this.reportCache[cacheKey] = report;
                this.reportCacheTime[cacheKey] = now;

                return report;
            } else {
                console.error('[AI_SERVICE] 生成报告失败:', result.result.message);
                throw new Error(result.result.message || '生成报告失败');
            }
        } catch (error) {
            console.error('[AI_SERVICE] 生成报告异常:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    },

    /**
     * AI 对话
     * @param {string} message - 用户消息
     * @param {Object} context - 上下文
     * @returns {Promise<string>} AI 回复
     */
    async chat(message, context = {}) {
        try {
            console.log('[AI_SERVICE] AI 对话:', message.substring(0, 50) + '...');

            // 检查登录状态
            const isLoggedIn = await this.checkLoginStatus();
            if (!isLoggedIn) {
                throw new Error('请先登录 CloudBase 账号');
            }

            // [v8.0.0] 获取用户模型偏好
            const modelPref = this.getModelPreference();

            const chatData = {
                message: message,
                context: context,
                model: modelPref.model,
                provider: modelPref.provider
            };
            if (modelPref.thinking) {
                chatData.thinking = true;
            }

            // [v8.0.0-fix] 耗时长，改用 HTTP 访问服务
            const result = await this.callViaHTTP('chat', chatData);

            if (result.result.code === 0) {
                return result.result.reply;
            } else {
                console.error('[AI_SERVICE] 对话失败:', result.result.message);
                throw new Error(result.result.message || '对话失败');
            }
        } catch (error) {
            console.error('[AI_SERVICE] 对话异常:', error);
            throw error;
        }
    },

    /**
     * 清除报告缓存
     */
    clearCache() {
        this.reportCache = {};
        this.reportCacheTime = {};
        console.log('[AI_SERVICE] 报告缓存已清除');
    },

    /**
     * 收集用户数据用于 AI 报告
     * [v8.0.0] 全面重构：修复周期可比性、全量习惯、原始交易聚合、睡眠明细
     */
    collectUserData(period = '近7日') {
        const data = {
            summary: {},
            habits: [],
            sleep: null,
            rawData: null
        };

        try {
            // 收集总体统计
            if (typeof currentBalance !== 'undefined') {
                data.summary.currentBalance = currentBalance;
            }

            // [v8.1.0] 获取报告周期、环比周期和数据收集窗口
            const periodRange = this._getPeriodRange(period);
            const prevPeriodRange = this._getPrevPeriodRange(periodRange);
            const dataWindowRange = this._getDataWindowRange(period);

            // 计算周期实际天数
            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            const daysInPeriod = Math.max(1, Math.round((periodRange.end - periodRange.start) / MS_PER_DAY));
            const prevDaysInPeriod = Math.max(1, Math.round((prevPeriodRange.end - prevPeriodRange.start) / MS_PER_DAY));

            data.summary.period = period;
            data.summary.periodRange = periodRange.label;
            data.summary.daysInPeriod = daysInPeriod;
            data.summary.prevDaysInPeriod = prevDaysInPeriod;

            // 按周期过滤交易
            let totalEarned = 0, totalSpent = 0;
            let prevEarned = 0, prevSpent = 0;
            const currentTxs = []; // 数据窗口内的交易（用于聚合）

            if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
                transactions.forEach(tx => {
                    if (tx.undone) return; // 跳过已撤回
                    const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();

                    // 数据窗口内的交易（用于 _aggregateRawData 全量导入）
                    if (txTime >= dataWindowRange.start && txTime <= dataWindowRange.end) {
                        currentTxs.push(tx);
                    }

                    // 当前报告周期（用于 summary 统计）
                    if (txTime >= periodRange.start && txTime <= periodRange.end) {
                        if (tx.type === 'earn') totalEarned += tx.amount || 0;
                        else if (tx.type === 'spend') totalSpent += tx.amount || 0;
                    }

                    // 环比周期（用于 summary 统计）
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

            // 环比数据
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

            // [v8.0.0] 全量习惯数据，增加状态评级和活跃度
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

                        // 计算近7天活跃度（有交易的天数 / 7）
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

            // [v8.1.0] 睡眠数据：按数据窗口天数截取
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
                        dailyDetails: dailyDetails.reverse() // 按日期升序
                    };
                }
            }

            // [v8.1.0] 构建任务分类映射表（用于补充交易缺失的 category）
            const taskCategoryMap = {};
            if (typeof tasks !== 'undefined' && Array.isArray(tasks)) {
                tasks.forEach(task => {
                    if (task.id && task.category) {
                        taskCategoryMap[task.id] = task.category;
                    }
                });
            }

            // [v8.1.0] 原始交易聚合数据（使用数据窗口范围，带分类补全）
            data.rawData = this._aggregateRawData(currentTxs, dataWindowRange, taskCategoryMap);

            // [v8.1.0] 全量任务信息（含类型、模式等配置，帮助 AI 理解系统任务）
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
            console.error('[AI_SERVICE] 收集用户数据失败:', error);
        }

        return data;
    },

    /**
     * [v8.0.0] 聚合原始交易数据为多维分析素材
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

        // 1. 按日期聚合 Daily Breakdown（只保留有数据的天，最多14条，控制prompt长度）
        const dailyMap = new Map();

        // 2. 按任务聚合 Task Breakdown
        const taskMap = new Map();

        // 3. 按分类聚合 Category Breakdown
        const categoryMap = new Map();

        txs.forEach(tx => {
            const txDate = new Date(typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime());
            const dateKey = `${txDate.getMonth() + 1}月${txDate.getDate()}日`;
            const hour = txDate.getHours();

            // Daily（只保留有数据的天）
            if (!dailyMap.has(dateKey)) {
                dailyMap.set(dateKey, { date: dateKey, earn: 0, spend: 0, tasks: new Set() });
            }
            const day = dailyMap.get(dateKey);
            if (tx.type === 'earn') day.earn += tx.amount || 0;
            else day.spend += tx.amount || 0;
            if (tx.taskName) day.tasks.add(tx.taskName);

            // Time Distribution
            let slot = 'night';
            if (hour >= 6 && hour < 12) slot = 'morning';
            else if (hour >= 12 && hour < 18) slot = 'afternoon';
            else if (hour >= 18 && hour < 24) slot = 'evening';

            // [v8.1.0-fix] 系统结算交易（屏幕时间、自动检测补录）的 timestamp 是固定结算时间（23:00），
            // 不代表用户实际使用时段。将其从时段行为分析中排除，单独统计。
            const isSystemSettlement = tx.systemType === 'screen-time' || tx.autoDetectData ||
                (tx.description && (tx.description.includes('自动补录') || tx.description.includes('屏幕时间')));

            if (isSystemSettlement) {
                if (tx.type === 'earn') rawData.timeDistribution.settledEarn += tx.amount || 0;
                else rawData.timeDistribution.settledSpend += tx.amount || 0;
            } else {
                if (tx.type === 'earn') rawData.timeDistribution[slot].earn += tx.amount || 0;
                else rawData.timeDistribution[slot].spend += tx.amount || 0;
            }

            // Task Breakdown
            const taskName = tx.taskName || tx.taskId || '未知任务';
            const resolvedCategory = tx.category || (taskCategoryMap && taskCategoryMap[tx.taskId]) || '未分类';
            if (!taskMap.has(taskName)) {
                taskMap.set(taskName, { name: taskName, category: resolvedCategory, totalTime: 0, count: 0, type: tx.type });
            }
            const task = taskMap.get(taskName);
            task.totalTime += tx.amount || 0;
            task.count += 1;
            if (resolvedCategory && resolvedCategory !== task.category) task.category = resolvedCategory;

            // Category Breakdown
            const cat = resolvedCategory;
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { name: cat, earn: 0, spend: 0, count: 0 });
            }
            const catData = categoryMap.get(cat);
            if (tx.type === 'earn') catData.earn += tx.amount || 0;
            else catData.spend += tx.amount || 0;
            catData.count += 1;
        });

        // [v8.1.0] 格式化 Daily Breakdown（按日期排序，按数据窗口天数全量导入）
        const maxDailyEntries = periodRange?.days || 14;
        rawData.dailyBreakdown = Array.from(dailyMap.values())
            .sort((a, b) => {
                const da = new Date('2024年' + a.date); // 辅助排序
                const db = new Date('2024年' + b.date);
                return da - db;
            })
            .slice(0, maxDailyEntries)
            .map(d => ({ date: d.date, earn: d.earn, spend: d.spend, net: d.earn - d.spend, topTasks: Array.from(d.tasks).slice(0, 5) }));

        // 格式化 Task Breakdown（按总时长排序，取 top 15）
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

        // 格式化 Category Breakdown
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
     * 获取周期时间范围（时间戳）
     * [v8.0.0] 增加 days 字段
     */
    _getPeriodRange(period) {
        const now = new Date();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();

        if (period === '近3日') {
            const start = new Date(now.getTime() - 2 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 3, label: '最近3天' };
        } else if (period === '近7日') {
            const start = new Date(now.getTime() - 6 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 7, label: '最近7天' };
        } else if (period === '近30日') {
            const start = new Date(now.getTime() - 29 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 30, label: '最近30天' };
        }
        // 默认返回最近7天
        const start = new Date(now.getTime() - 6 * MS_PER_DAY);
        start.setHours(0, 0, 0, 0);
        return { start: start.getTime(), end: now.getTime(), days: 7, label: '最近7天' };
    },

    /**
     * 获取上一个周期的时间范围（等长周期，确保可比性）
     * [v8.0.0] 修复：返回与当前周期等长的上一周期，而非固定 7 天
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
     * [v8.1.0] 获取数据收集窗口范围（用于全量数据导入）
     * 3日报告→收集6天, 7日报告→收集14天, 30日报告→收集30天
     */
    _getDataWindowRange(period) {
        const now = new Date();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();

        if (period === '近3日') {
            const start = new Date(now.getTime() - 5 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 6, label: '最近6天' };
        } else if (period === '近7日') {
            const start = new Date(now.getTime() - 13 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 14, label: '最近14天' };
        } else if (period === '近30日') {
            const start = new Date(now.getTime() - 29 * MS_PER_DAY);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            return { start: start.getTime(), end: end.getTime(), days: 30, label: '最近30天' };
        }
        // 默认
        const start = new Date(now.getTime() - 13 * MS_PER_DAY);
        start.setHours(0, 0, 0, 0);
        return { start: start.getTime(), end: now.getTime(), days: 14, label: '最近14天' };
    }
};

/**
 * [v8.1.0] 计算习惯完成率（基于交易记录精确计算）
 * 完成率 = 最近30天内实际达标的周期数 / 应完成的周期数
 * @param {Object} task - 任务对象
 * @returns {number} 完成率百分比
 */
function calculateHabitCompletionRate(task) {
    if (!task.habitDetails) return 0;

    const period = task.habitDetails.period || 'daily';
    const targetCount = task.habitDetails.targetCountInPeriod || 1;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * MS_PER_DAY;

    // 获取该任务最近30天的 earn 交易
    let taskTxs = [];
    if (task.id && typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id)) {
        taskTxs = transactionIndex.get(task.id).filter(tx => {
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            return t >= thirtyDaysAgo && t <= now && !tx.undone && tx.type === 'earn';
        });
    }

    if (taskTxs.length === 0) return 0;

    // 判断单笔交易是否达标（continuous_target 需验证 amount >= targetTime）
    const isValidCompletion = (tx) => {
        if (task.type === 'continuous_target') {
            return (tx.amount >= task.targetTime) || (tx.isStreakAdvancement === true);
        }
        return true;
    };

    // 辅助：日期字符串 YYYY-MM-DD
    const getDateStr = (timestamp) => {
        const d = new Date(timestamp);
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 辅助：周起始（周一）字符串 YYYY-MM-DD
    const getWeekStartStr = (timestamp) => {
        const d = new Date(timestamp);
        const day = d.getDay(); // 0=周日
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
        const year = monday.getFullYear();
        const month = (monday.getMonth() + 1).toString().padStart(2, '0');
        const dayStr = monday.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${dayStr}`;
    };

    if (period === 'daily') {
        // 按日期统计达标次数
        const dateCount = new Map();
        taskTxs.forEach(tx => {
            if (!isValidCompletion(tx)) return;
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            const dateStr = getDateStr(t);
            dateCount.set(dateStr, (dateCount.get(dateStr) || 0) + 1);
        });

        // 统计达标天数（达标次数 >= targetCount）
        let completedDays = 0;
        dateCount.forEach(count => {
            if (count >= targetCount) completedDays++;
        });

        return Math.min(100, Math.round((completedDays / 30) * 100));
    } else if (period === 'weekly') {
        // 按周统计达标次数
        const weekCount = new Map();
        taskTxs.forEach(tx => {
            if (!isValidCompletion(tx)) return;
            const t = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();
            const weekStr = getWeekStartStr(t);
            weekCount.set(weekStr, (weekCount.get(weekStr) || 0) + 1);
        });

        // 统计达标周数
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
 * 格式化时长（辅助函数）
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
 * [v8.2.0] AI Companion Service - AI 伙伴服务层
 * 每日关怀卡片 + 聊天浮层 + 长期记忆管理
 */
const COMPANION_SERVICE = {
    TABLE_NAME: 'tb_ai_memory',
    STORAGE_KEY: 'timebankAICompanion',
    memoryCache: null,
    todayMessage: null,
    isGenerating: false,

    getLocalData() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn('[Companion] 读取本地数据失败:', e);
        }
        return { lastCheckInDate: null, todayMessage: null, unread: false };
    },

    setLocalData(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[Companion] 保存本地数据失败:', e);
        }
    },

    getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    async fetchMemory() {
        if (this.memoryCache) return this.memoryCache;
        try {
            if (typeof isLoggedIn !== 'function' || !isLoggedIn() || typeof db === 'undefined' || !db) {
                return { recentNotes: [], observations: [], lastConversation: [] };
            }
            const today = this.getTodayString();
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const notesRes = await db.collection(this.TABLE_NAME)
                .where({ type: 'daily_note', date: db.command.gte(sevenDaysAgo.toISOString().slice(0, 10)) })
                .orderBy('date', 'desc')
                .limit(7)
                .get();
            const recentNotes = (notesRes.data || []).map(d => ({ date: d.date, content: d.content }));
            const obsRes = await db.collection(this.TABLE_NAME)
                .where({ type: 'observation' })
                .orderBy('updatedAt', 'desc')
                .limit(10)
                .get();
            const observations = (obsRes.data || []).map(d => d.content);
            const convRes = await db.collection(this.TABLE_NAME)
                .where({ type: 'conversation', date: today })
                .orderBy('createdAt', 'desc')
                .limit(10)
                .get();
            const lastConversation = (convRes.data || []).reverse().map(d => ({ role: d.role, content: d.content }));
            this.memoryCache = { recentNotes, observations, lastConversation };
            return this.memoryCache;
        } catch (error) {
            console.error('[Companion] 拉取记忆失败:', error);
            return { recentNotes: [], observations: [], lastConversation: [] };
        }
    },

    async saveMemory(type, content, role = null) {
        try {
            if (typeof isLoggedIn !== 'function' || !isLoggedIn() || typeof db === 'undefined' || !db) return;
            const today = this.getTodayString();
            const doc = { type, date: today, content, createdAt: new Date(), updatedAt: new Date() };
            if (role) doc.role = role;
            await db.collection(this.TABLE_NAME).add(doc);
        } catch (error) {
            console.error('[Companion] 保存记忆失败:', error);
        }
    },

    async getDailyMessage(forceRefresh = false) {
        const localData = this.getLocalData();
        const today = this.getTodayString();
        if (!forceRefresh && localData.lastCheckInDate === today && localData.todayMessage) {
            this.todayMessage = localData.todayMessage;
            return localData.todayMessage;
        }
        if (this.isGenerating) return null;
        this.isGenerating = true;
        try {
            const period = AI_SERVICE.getPeriodPreference();
            const userData = AI_SERVICE.collectUserData(period);
            const memory = await this.fetchMemory();
            const modelPref = AI_SERVICE.getModelPreference();
            const requestData = {
                userData: { summary: userData.summary, habits: userData.habits, sleep: userData.sleep, period },
                memory,
                model: modelPref.model,
                provider: modelPref.provider
            };
            const result = await AI_SERVICE.callViaHTTP('dailyCompanion', requestData);
            if (result.result.code === 0) {
                const message = result.result.message;
                this.todayMessage = message;
                this.setLocalData({ lastCheckInDate: today, todayMessage: message, unread: true });
                this.saveMemory('daily_note', message);
                return message;
            }
            return null;
        } catch (error) {
            console.error('[Companion] 获取消息异常:', error);
            return null;
        } finally {
            this.isGenerating = false;
        }
    },

    markAsRead() {
        const localData = this.getLocalData();
        localData.unread = false;
        this.setLocalData(localData);
    },

    async chat(message) {
        const modelPref = AI_SERVICE.getModelPreference();
        const memory = await this.fetchMemory();
        const chatData = {
            message,
            context: {},
            memory: { observations: memory.observations, lastConversation: memory.lastConversation.slice(-5) },
            model: modelPref.model,
            provider: modelPref.provider
        };
        const result = await AI_SERVICE.callViaHTTP('chat', chatData);
        if (result.result.code === 0) {
            const reply = result.result.reply;
            this.saveMemory('conversation', message, 'user');
            this.saveMemory('conversation', reply, 'assistant');
            return reply;
        }
        throw new Error(result.result.message || '对话失败');
    }
};

// 导出到全局
window.AI_SERVICE = AI_SERVICE;
window.COMPANION_SERVICE = COMPANION_SERVICE;

/**
 * [v8.2.0] AI Cognition Service - AI 统一认知服务层
 * 全量初始化、增量同步、用户画像、反馈消息
 */
const COGNITION_SERVICE = {
    // 状态
    isInitializing: false,
    isSyncing: false,
    lastSyncAt: 0,
    pendingFeedback: [],

    // localStorage 键
    STORAGE_KEYS: {
        lastSyncAt: 'timebankAILastSync',
        syncSchedule: 'timebankAISyncSchedule',
        initStatus: 'timebankAIInitStatus'
    },

    /**
     * 检查是否已完成全量初始化
     */
    isInitialized() {
        try {
            return localStorage.getItem(this.STORAGE_KEYS.initStatus) === 'true';
        } catch (e) {
            return false;
        }
    },

    /**
     * 设置初始化状态
     */
    setInitialized(status) {
        try {
            localStorage.setItem(this.STORAGE_KEYS.initStatus, status ? 'true' : 'false');
        } catch (e) {}
    },

    /**
     * 收集全量数据（用于初始化）
     * [v8.2.0-fix] 数据净化：排除复杂对象、限制数据量、确保可序列化
     */
    collectFullData() {
        try {
            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            const now = Date.now();

            // 计算使用总天数
            let totalDays = 0;
            if (typeof transactions !== 'undefined' && transactions.length > 0) {
                const firstTx = [...transactions].sort((a, b) => a.timestamp - b.timestamp)[0];
                const firstDate = new Date(firstTx?.timestamp || now);
                totalDays = Math.max(1, Math.ceil((now - firstDate.getTime()) / MS_PER_DAY));
            }

            // 收集交易记录（只保留可序列化的简单字段，排除 autoDetectData）
            // [v8.2.0-fix2] 限制 500 条（与云函数端 buildFullAnalysisPrompt 一致），去掉云函数不用的 description 字段
            const txList = (typeof transactions !== 'undefined' ? transactions : [])
                .filter(tx => !tx.undone)
                .slice(-500)
                .map(tx => ({
                    timestamp: typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime(),
                    type: tx.type,
                    taskName: String(tx.taskName || ''),
                    category: String(tx.category || ''),
                    amount: typeof tx.amount === 'number' ? tx.amount : 0,
                    ...(tx.systemType ? { systemType: tx.systemType } : {})
                }));

            // 收集任务配置
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

            // 收集习惯历史（近30天，精简格式）
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

                    // 按天聚合
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

            // 收集每日汇总（近30天，净化 taskCompletions）
            const dailySummaries = [];
            if (typeof dailyChanges !== 'undefined') {
                const dates = Object.keys(dailyChanges).sort().slice(-30);
                dates.forEach(date => {
                    const dc = dailyChanges[date];
                    if (dc && typeof dc === 'object') {
                        // [v8.2.0-fix] 净化 taskCompletions：只保留字符串，限制数量
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

            const result = {
                meta: {
                    exportAt: Date.now(),
                    totalDays: totalDays,
                    transactionCount: txList.length,
                    version: APP_VERSION
                },
                transactions: txList,
                tasks: taskList,
                habitHistory: habitHistory.slice(-200),
                dailySummaries: dailySummaries
            };

            console.log(`[COGNITION] 数据收集完成: ${txList.length} 交易, ${taskList.length} 任务, ${habitHistory.length} 习惯记录, ${dailySummaries.length} 日汇总`);
            return result;
        } catch (error) {
            console.error('[COGNITION] collectFullData 失败:', error);
            // 返回最小化数据，避免完全失败
            return {
                meta: { exportAt: Date.now(), totalDays: 0, transactionCount: 0, version: APP_VERSION },
                transactions: [],
                tasks: [],
                habitHistory: [],
                dailySummaries: []
            };
        }
    },

    /**
     * 收集增量数据（自上次同步以来）
     */
    collectIncrementalData() {
        const lastSync = this.lastSyncAt || parseInt(localStorage.getItem(this.STORAGE_KEYS.lastSyncAt) || '0');
        const now = Date.now();

        // 新增交易
        const newTransactions = (typeof transactions !== 'undefined' ? transactions : [])
            .filter(tx => !tx.undone && tx.timestamp > lastSync)
            .map(tx => ({
                ts: tx.timestamp,
                t: tx.type === 'earn' ? 'e' : 's',
                n: tx.taskName,
                c: tx.category,
                a: tx.amount
            }));

        // 习惯状态变化
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

        // 今日汇总
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
            },
            requestedRole: 'auto'
        };
    },

    /**
     * 全量初始化（通道A：应用内部）
     */
    async initMemoryInternal() {
        if (this.isInitializing) {
            throw new Error('初始化进行中，请稍候...');
        }

        this.isInitializing = true;
        try {
            console.log('[COGNITION] 开始全量初始化...');
            showToast('🧠 正在分析你的全部数据，请稍候...', 5000);

            const fullData = this.collectFullData();
            console.log(`[COGNITION] 数据收集完成: ${fullData.transactions?.length || 0} 条交易`);

            const result = await AI_SERVICE.callViaHTTP('initMemoryInternal', { fullData });

            if (result.result.code === 0) {
                this.setInitialized(true);
                showToast('✅ AI 记忆初始化成功！', 3000);
                console.log('[COGNITION] 初始化成功:', result.result.summary);
                return result.result;
            } else {
                throw new Error(result.result.message || '初始化失败');
            }
        } catch (error) {
            console.error('[COGNITION] 初始化失败:', error);
            showToast('❌ 初始化失败: ' + error.message, 3000);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    },

    /**
     * 导入外部画像（通道B）
     */
    async importExternalProfile(externalProfile, mergeStrategy = 'override') {
        try {
            showToast('📥 正在导入外部画像...', 3000);
            const result = await AI_SERVICE.callViaHTTP('importExternalProfile', {
                externalProfile,
                mergeStrategy
            });

            if (result.result.code === 0) {
                this.setInitialized(true);
                showToast('✅ 外部画像导入成功！', 3000);
                return result.result;
            } else {
                throw new Error(result.result.message || '导入失败');
            }
        } catch (error) {
            console.error('[COGNITION] 导入失败:', error);
            showToast('❌ 导入失败: ' + error.message, 3000);
            throw error;
        }
    },

    /**
     * 增量同步
     */
    async syncIncremental(requestedRole = 'auto') {
        if (this.isSyncing) {
            throw new Error('同步进行中，请稍候...');
        }

        this.isSyncing = true;
        try {
            console.log('[COGNITION] 开始增量同步...');
            showToast('🔄 正在同步最新数据...', 3000);

            const incrementalData = this.collectIncrementalData();
            incrementalData.requestedRole = requestedRole;

            if (incrementalData.newTransactions.length === 0 && incrementalData.habitUpdates.length === 0) {
                showToast('ℹ️ 没有新数据需要同步', 2000);
                return { code: 0, message: '没有新数据', feedbackCount: 0 };
            }

            const result = await AI_SERVICE.callViaHTTP('syncIncremental', { incrementalData });

            if (result.result.code === 0) {
                this.lastSyncAt = Date.now();
                localStorage.setItem(this.STORAGE_KEYS.lastSyncAt, String(this.lastSyncAt));
                showToast(`✅ 同步完成！收到 ${result.result.feedbackCount || 0} 条反馈`, 3000);

                // 如果有反馈，刷新红点
                if (result.result.feedbackCount > 0) {
                    setTimeout(() => this.checkUnreadFeedback(), 1000);
                }

                return result.result;
            } else {
                throw new Error(result.result.message || '同步失败');
            }
        } catch (error) {
            console.error('[COGNITION] 同步失败:', error);
            showToast('❌ 同步失败: ' + error.message, 3000);
            throw error;
        } finally {
            this.isSyncing = false;
        }
    },

    /**
     * 获取同步配置
     */
    async getSyncSchedule() {
        try {
            const result = await AI_SERVICE.callViaHTTP('getSyncSchedule', {});
            if (result.result.code === 0) {
                return result.result.schedule;
            }
        } catch (error) {
            console.warn('[COGNITION] 获取同步配置失败:', error);
        }
        return null;
    },

    /**
     * 设置同步配置
     */
    async setSyncSchedule(schedule) {
        try {
            const result = await AI_SERVICE.callViaHTTP('setSyncSchedule', { schedule });
            if (result.result.code === 0) {
                localStorage.setItem(this.STORAGE_KEYS.syncSchedule, JSON.stringify(schedule));
                return true;
            }
        } catch (error) {
            console.error('[COGNITION] 保存同步配置失败:', error);
        }
        return false;
    },

    /**
     * 获取 AI 反馈消息
     */
    async getFeedback(unreadOnly = false, limit = 20) {
        try {
            const result = await AI_SERVICE.callViaHTTP('getAIFeedback', { unreadOnly, limit });
            if (result.result.code === 0) {
                return result.result.messages || [];
            }
        } catch (error) {
            console.warn('[COGNITION] 获取反馈失败:', error);
        }
        return [];
    },

    /**
     * 标记反馈已读
     */
    async markFeedbackRead(messageIds) {
        try {
            await AI_SERVICE.callViaHTTP('markFeedbackRead', { messageIds });
            return true;
        } catch (error) {
            console.warn('[COGNITION] 标记已读失败:', error);
            return false;
        }
    },

    /**
     * 检查未读反馈（用于红点）
     */
    async checkUnreadFeedback() {
        try {
            const messages = await this.getFeedback(true, 50);
            const unreadCount = messages.filter(m => !m.isRead).length;

            // 更新时光卡片红点
            updateCompanionBadge(unreadCount);

            // 高优先级消息立即弹出 Toast
            const urgent = messages.filter(m => m.priority >= 4 && !m.isShown);
            for (const msg of urgent.slice(0, 2)) {
                showAIToast(msg);
                // 标记为已展示
                if (msg._id) {
                    await db.collection('tb_ai_feedback').doc(msg._id).update({ isShown: true });
                }
            }

            return unreadCount;
        } catch (error) {
            console.warn('[COGNITION] 检查未读反馈失败:', error);
            return 0;
        }
    },

    /**
     * 定时检查同步（由前端定时器调用）
     */
    async checkScheduledSync() {
        if (!this.isInitialized()) return;

        const schedule = await this.getSyncSchedule();
        if (!schedule || !schedule.enabled || !schedule.scheduleTimes || schedule.scheduleTimes.length === 0) {
            return;
        }

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // 检查是否到达同步时间点（允许前后2分钟误差）
        for (const scheduledTime of schedule.scheduleTimes) {
            if (this._isTimeMatch(currentTime, scheduledTime)) {
                // 检查今天是否已经同步过
                const lastSync = parseInt(localStorage.getItem(this.STORAGE_KEYS.lastSyncAt) || '0');
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                if (lastSync < todayStart.getTime()) {
                    console.log(`[COGNITION] 到达同步时间 ${scheduledTime}，开始同步...`);
                    try {
                        await this.syncIncremental(schedule.defaultRole || 'auto');
                    } catch (e) {
                        console.error('[COGNITION] 定时同步失败:', e);
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
     * 导出全量数据 JSON（用于外部 AI 分析）
     */
    exportFullDataJSON() {
        const fullData = this.collectFullData();
        const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `timebank_full_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('📤 数据已导出', 2000);
    }
};

/**
 * 显示 AI 反馈 Toast（带角色头像）
 * @param {Object} message - 反馈消息对象
 */
function showAIToast(message) {
    const existing = document.getElementById('aiFeedbackToast');
    if (existing) existing.remove();

    const roleIcons = {
        companion: '🌟',
        instructor: '💪',
        analyst: '📊',
        auto: '🤖'
    };
    const roleNames = {
        companion: '时光',
        instructor: '教官',
        analyst: '分析师',
        auto: 'AI'
    };

    const icon = roleIcons[message.role] || '🤖';
    const name = roleNames[message.role] || 'AI';

    const toast = document.createElement('div');
    toast.id = 'aiFeedbackToast';
    toast.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        right: 16px;
        background: linear-gradient(135deg, rgba(33,150,243,0.95) 0%, rgba(25,118,210,0.95) 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 16px;
        z-index: 10001;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        animation: aiToastSlideIn 0.4s ease;
        max-width: 100%;
    `;

    toast.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 2rem; flex-shrink: 0;">${icon}</div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; opacity: 0.9;">${name}</div>
                <div style="font-size: 0.95rem; line-height: 1.5;">${message.content}</div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; flex-shrink: 0; font-size: 1rem;">×</button>
        </div>
    `;

    // 添加动画样式
    if (!document.getElementById('aiToastStyle')) {
        const style = document.createElement('style');
        style.id = 'aiToastStyle';
        style.textContent = `
            @keyframes aiToastSlideIn {
                from { transform: translateY(-100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // 8秒后自动消失
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'aiToastSlideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

/**
 * 更新时光卡片未读红点
 * @param {number} count - 未读数量
 */
function updateCompanionBadge(count) {
    const card = document.getElementById('companionCard');
    if (!card) return;

    let badge = card.querySelector('.companion-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'companion-badge';
            badge.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background: #ff4757;
                color: white;
                font-size: 0.7rem;
                font-weight: 700;
                min-width: 20px;
                height: 20px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
                box-shadow: 0 2px 8px rgba(255,71,87,0.4);
                animation: badgePulse 2s infinite;
            `;
            card.style.position = 'relative';
            card.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
        badge.remove();
    }
}

// 导出到全局
window.COGNITION_SERVICE = COGNITION_SERVICE;
