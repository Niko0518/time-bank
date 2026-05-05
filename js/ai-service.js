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

    // [v8.0.0] 用户模型偏好（localStorage 持久化）
    getModelPreference() {
        try {
            const saved = localStorage.getItem('timebankAIModel');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn('[AI_SERVICE] 读取模型偏好失败:', e);
        }
        return { model: 'deepseek-v4-flash', thinking: false };
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
        const response = await fetch(this.HTTP_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data })
        });
        if (!response.ok) {
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
     * @param {string} period - 周期（'本周'|'本月'）
     * @returns {Promise<string>} 报告文本
     */
    async generateInsightReport(userData, period = '本周') {
        // [v8.0.0-fix] 获取当前模型，按模型分别缓存
        const modelPref = this.getModelPreference();
        const cacheKey = modelPref.model;
        const now = Date.now();

        // 检查该模型的缓存
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
                    sleep: userData.sleep,
                    rawData: userData.rawData,
                    period: period
                },
                model: modelPref.model
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

                // [v8.0.0-fix] 按模型缓存报告
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
                model: modelPref.model
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
    collectUserData(period = '本周') {
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

            // [v8.0.0-fix] 获取当前周期和等长环比周期
            const periodRange = this._getPeriodRange(period);
            const prevPeriodRange = this._getPrevPeriodRange(periodRange);

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
            const currentTxs = [];

            if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
                transactions.forEach(tx => {
                    if (tx.undone) return; // 跳过已撤回
                    const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime();

                    if (txTime >= periodRange.start && txTime <= periodRange.end) {
                        if (tx.type === 'earn') totalEarned += tx.amount || 0;
                        else if (tx.type === 'spend') totalSpent += tx.amount || 0;
                        currentTxs.push(tx);
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

            // [v8.0.0] 睡眠数据：传入每日明细
            const sleepHistory = typeof getSleepHistory === 'function' ? getSleepHistory() : [];
            if (Array.isArray(sleepHistory) && sleepHistory.length > 0) {
                const recentRecords = sleepHistory.slice(0, 14); // 最近14天
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

            // [v8.0.0] 原始交易聚合数据
            data.rawData = this._aggregateRawData(currentTxs, periodRange);

        } catch (error) {
            console.error('[AI_SERVICE] 收集用户数据失败:', error);
        }

        return data;
    },

    /**
     * [v8.0.0] 聚合原始交易数据为多维分析素材
     */
    _aggregateRawData(txs, periodRange) {
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const rawData = {
            transactionCount: txs.length,
            dailyBreakdown: [],
            taskBreakdown: [],
            timeDistribution: {
                morning: { label: '早晨(6-12点)', earn: 0, spend: 0 },
                afternoon: { label: '下午(12-18点)', earn: 0, spend: 0 },
                evening: { label: '晚上(18-24点)', earn: 0, spend: 0 },
                night: { label: '深夜(0-6点)', earn: 0, spend: 0 }
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

            if (tx.type === 'earn') rawData.timeDistribution[slot].earn += tx.amount || 0;
            else rawData.timeDistribution[slot].spend += tx.amount || 0;

            // Task Breakdown
            const taskName = tx.taskName || tx.taskId || '未知任务';
            if (!taskMap.has(taskName)) {
                taskMap.set(taskName, { name: taskName, category: tx.category || '未分类', totalTime: 0, count: 0, type: tx.type });
            }
            const task = taskMap.get(taskName);
            task.totalTime += tx.amount || 0;
            task.count += 1;
            if (tx.category && tx.category !== task.category) task.category = tx.category;

            // Category Breakdown
            const cat = tx.category || '未分类';
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { name: cat, earn: 0, spend: 0, count: 0 });
            }
            const catData = categoryMap.get(cat);
            if (tx.type === 'earn') catData.earn += tx.amount || 0;
            else catData.spend += tx.amount || 0;
            catData.count += 1;
        });

        // 格式化 Daily Breakdown（按日期排序，最多14条控制prompt长度）
        rawData.dailyBreakdown = Array.from(dailyMap.values())
            .sort((a, b) => {
                const da = new Date('2024年' + a.date); // 辅助排序
                const db = new Date('2024年' + b.date);
                return da - db;
            })
            .slice(0, 14)
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
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();
        const day = now.getDay(); // 0=周日

        if (period === '本周') {
            const mondayOffset = day === 0 ? -6 : 1 - day;
            const start = new Date(year, month, date + mondayOffset);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            const days = Math.max(1, date - (date + mondayOffset) + 1);
            return { start: start.getTime(), end: end.getTime(), days, label: `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日` };
        } else if (period === '本月') {
            const start = new Date(year, month, 1);
            start.setHours(0, 0, 0, 0);
            const end = new Date(year, month, date, 23, 59, 59, 999);
            const days = date;
            return { start: start.getTime(), end: end.getTime(), days, label: `${month + 1}月1日 - ${month + 1}月${date}日` };
        }
        // 默认返回最近7天
        const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
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
    }
};

/**
 * 计算习惯完成率
 * @param {Object} task - 任务对象
 * @returns {number} 完成率百分比
 */
function calculateHabitCompletionRate(task) {
    if (!task.habitDetails) return 0;

    const streak = task.habitDetails.streak || 0;
    const period = task.habitDetails.period || 'daily';

    const periodDays = period === 'weekly' ? 7 : 1;
    const totalPeriods = Math.floor(30 / periodDays);

    return Math.min(100, Math.round((streak / totalPeriods) * 100));
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

// 导出到全局
window.AI_SERVICE = AI_SERVICE;
