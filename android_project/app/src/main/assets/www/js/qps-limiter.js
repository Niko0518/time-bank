/**
 * QPS限流器 - 防止CloudBase API超限
 * [v7.37.1] 新增：智能令牌桶算法，自适应降级
 * 
 * 工作原理：
 * 1. 令牌桶算法：每秒生成450个令牌（预留10%余量）
 * 2. 自适应降级：检测到限流错误时自动降低速率至30%-60%
 * 3. 优先级队列：关键操作优先执行
 */

class QPSLimiter {
    constructor(maxQPS = 450) {
        this.maxQPS = maxQPS;
        this.tokens = maxQPS;
        this.lastRefill = Date.now();
        this.pendingRequests = [];
        this.errorCount = 0;
        this.lastErrorTime = 0;
        this.adaptiveMode = false;
        
        // 启动令牌补充定时器（每100ms补充一次）
        this.refillInterval = setInterval(() => this._refillTokens(), 100);
        
        console.log(`[QPS Limiter] 已初始化，最大QPS: ${maxQPS}`);
    }
    
    /**
     * 获取执行许可（异步等待）
     * @param {string} operation - 操作类型标识（用于日志）
     * @param {number} priority - 优先级(1-10, 10最高)，默认5
     * @returns {Promise<void>}
     */
    async acquire(operation = 'unknown', priority = 5) {
        return new Promise((resolve) => {
            const request = {
                resolve,
                priority,
                operation,
                timestamp: Date.now()
            };
            
            this.pendingRequests.push(request);
            this._processQueue();
        });
    }
    
    /**
     * 处理请求队列
     * @private
     */
    _processQueue() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        
        // 补充令牌
        this.tokens = Math.min(this.maxQPS, this.tokens + elapsed * this._getCurrentRate());
        this.lastRefill = now;
        
        // 按优先级排序（高优先级在前）
        this.pendingRequests.sort((a, b) => b.priority - a.priority);
        
        // 执行有足够令牌的请求
        const executed = [];
        for (const req of this.pendingRequests) {
            if (this.tokens >= 1) {
                this.tokens -= 1;
                executed.push(req);
                req.resolve();
            } else {
                break; // 令牌不足，等待下一轮
            }
        }
        
        // 移除已执行的请求
        this.pendingRequests = this.pendingRequests.filter(req => !executed.includes(req));
    }
    
    /**
     * 获取当前允许的速率（自适应降级）
     * @private
     * @returns {number} 当前每秒允许的请求数
     */
    _getCurrentRate() {
        if (!this.adaptiveMode) return this.maxQPS;
        
        // 检测到限流后，逐步恢复
        const timeSinceLastError = Date.now() - this.lastErrorTime;
        
        if (timeSinceLastError < 5000) {
            // 刚出错5秒内，降至30%
            return this.maxQPS * 0.3;
        } else if (timeSinceLastError < 15000) {
            // 5-15秒内，恢复至60%
            return this.maxQPS * 0.6;
        } else {
            // 15秒后恢复正常
            this.adaptiveMode = false;
            this.errorCount = 0;
            console.log('[QPS Limiter] 自适应模式结束，恢复正常速率');
            return this.maxQPS;
        }
    }
    
    /**
     * 记录API错误（触发自适应降级）
     * @param {Error} error - 捕获的错误对象
     */
    recordError(error) {
        // 检测是否为QPS限流错误
        const isQPSError = error.code === 'RESOURCE_EXHAUSTED' 
            || error.message?.includes('QPS')
            || error.message?.includes('rate limit')
            || error.message?.includes('too many requests');
        
        if (isQPSError) {
            this.errorCount++;
            this.lastErrorTime = Date.now();
            this.adaptiveMode = true;
            
            console.warn(`[QPS Limiter] ⚠️ 检测到限流错误，进入自适应模式 (错误次数: ${this.errorCount})`);
            console.warn(`[QPS Limiter] 当前速率已降至: ${Math.round(this._getCurrentRate())} QPS`);
        }
    }
    
    /**
     * 手动补充令牌（用于紧急情况）
     * @param {number} count - 补充数量
     */
    refill(count = 10) {
        this.tokens = Math.min(this.maxQPS, this.tokens + count);
        this._processQueue();
    }
    
    /**
     * 获取当前状态信息
     * @returns {Object} 状态对象
     */
    getStatus() {
        return {
            tokens: Math.floor(this.tokens),
            pendingRequests: this.pendingRequests.length,
            adaptiveMode: this.adaptiveMode,
            errorCount: this.errorCount,
            currentRate: Math.floor(this._getCurrentRate())
        };
    }
    
    /**
     * 销毁限流器（清理定时器）
     */
    destroy() {
        clearInterval(this.refillInterval);
        this.pendingRequests.forEach(req => req.resolve());
        this.pendingRequests = [];
        console.log('[QPS Limiter] 已销毁');
    }
}

// 导出全局单例
window.qpsLimiter = new QPSLimiter(450);

// [v7.37.1] 调试接口：Console输入 window.qpsLimiter.getStatus() 查看当前状态
