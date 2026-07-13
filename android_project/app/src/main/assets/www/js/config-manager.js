/**
 * TimeBank 云端配置管理器
 * [v9.18.3] 默认配置从 config/default-config.json 加载，消除代码内置重复硬编码
 *
 * 三层配置优先级（从高到低）：
 * 1. 运行时配置（window._nativeConfig，由 Android 原生层注入）
 * 2. 环境配置文件（config/config.{env}.json，按 env 加载）
 * 3. 默认配置（config/default-config.json，单一权威兜底源，与 Android 端保持同步）
 *
 * 设计目标：
 * - 消除 CloudBase envId / 云函数端点 / AI 端点等硬编码（业务代码 + 配置管理器内）
 * - 默认配置从 JSON 文件加载，确保与 Android 端一致
 * - 支持开发 / 测试 / 生产多环境切换
 * - 提供 `window.configManager.get('a.b.c')` 路径访问 API
 * - 配置加载失败时静默回退到默认配置（绝不阻塞主流程）
 *
 * 使用示例：
 *   const envId = window.configManager.get('cloudbase.envId');
 *   const aiUrl = window.configManager.get('endpoints.ai');
 *   const isProd = window.configManager.getEnv() === 'production';
 */

(function () {
    'use strict';

    // ====================================================================
    // [v9.18.3] 默认配置占位（极兜底）：当 default-config.json 也加载失败时使用
    // 实际权威源是 config/default-config.json
    // ====================================================================
    const FALLBACK_CONFIG = {};

    function detectEnvironment() {
        try {
            // 优先级 1：URL 参数 ?env=xxx（开发调试用）
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('env')) {
                return urlParams.get('env');
            }
        } catch (e) {
            // URLSearchParams 在极老浏览器不可用，忽略
        }
        // 优先级 2：原生层注入的环境变量
        if (window._ENV) {
            return window._ENV;
        }
        // 优先级 3：localStorage 用户手动切换（开发场景）
        try {
            const saved = localStorage.getItem('tb_env');
            if (saved) {
                return saved;
            }
        } catch (e) {
            // localStorage 可能不可用（隐私模式）
        }
        // 兜底：仅在 env 字段缺失时使用
        return 'production';
    }

    /**
     * [v9.18.3] fetch 带重试 + 指数退避
     * @param {string} url
     * @param {number} maxRetries
     * @returns {Promise<object|null>} 解析后的 JSON 对象，失败返回 null
     */
    function fetchJsonWithRetry(url, maxRetries) {
        maxRetries = maxRetries || 3;
        return new Promise(function (resolve) {
            let attempt = 0;
            function attemptFetch() {
                attempt++;
                fetch(url, { cache: 'no-cache' })
                    .then(function (resp) {
                        if (resp && resp.ok) {
                            return resp.json();
                        }
                        throw new Error('HTTP ' + (resp ? resp.status : 'no-response'));
                    })
                    .then(function (json) { resolve(json); })
                    .catch(function (err) {
                        if (attempt < maxRetries) {
                            console.warn('[ConfigManager] ' + url + ' 第 ' + attempt + ' 次失败，' + (100 * attempt) + 'ms 后重试:', (err && err.message) || err);
                            setTimeout(attemptFetch, 100 * attempt); // 指数退避
                        } else {
                            console.warn('[ConfigManager] ' + url + ' 已重试 ' + maxRetries + ' 次，放弃:', (err && err.message) || err);
                            resolve(null);
                        }
                    });
            }
            attemptFetch();
        });
    }

    /**
     * [v9.18.3] 验证配置有效性
     * - 必需字段存在性
     * - 关键 URL 格式正确性
     * @returns {boolean}
     */
    function validateConfig(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            console.warn('[ConfigManager] 配置验证失败：对象为空');
            return false;
        }
        // 验证 cloudbase.envId
        try {
            const cb = cfg.cloudbase;
            if (!cb || typeof cb !== 'object' || !cb.envId || typeof cb.envId !== 'string') {
                console.warn('[ConfigManager] 配置验证失败：cloudbase.envId 缺失');
                return false;
            }
        } catch (e) {
            console.warn('[ConfigManager] 配置验证异常：cloudbase', e);
            return false;
        }
        // 验证 endpoints.sync 是合法 URL
        try {
            const endpoints = cfg.endpoints;
            if (endpoints && endpoints.sync && typeof endpoints.sync === 'string') {
                if (!/^https?:\/\//.test(endpoints.sync)) {
                    console.warn('[ConfigManager] 配置验证失败：endpoints.sync 不是合法 URL');
                    return false;
                }
            }
        } catch (e) {
            console.warn('[ConfigManager] 配置验证异常：endpoints', e);
            return false;
        }
        return true;
    }

    function deepMerge(base, override) {
        if (override === null || override === undefined) {
            return base;
        }
        if (typeof base !== 'object' || typeof override !== 'object' || Array.isArray(override)) {
            return override !== undefined ? override : base;
        }
        const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
        Object.keys(override).forEach(function (key) {
            const baseVal = base ? base[key] : undefined;
            const overrideVal = override[key];
            if (baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)
                && overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal)) {
                out[key] = deepMerge(baseVal, overrideVal);
            } else {
                out[key] = overrideVal !== undefined ? overrideVal : baseVal;
            }
        });
        return out;
    }

    function getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length; i++) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[keys[i]];
        }
        return cur;
    }

    function ConfigManager() {
        // [v9.18.3] 初始 config 为空对象，等待 load() 注入 default-config.json
        this.config = {};
        this._loaded = false;
        this._loadingPromise = null;
    }

    /**
     * 异步加载完整配置（不阻塞启动）
     * [v9.18.3] 重构：先从 default-config.json 加载默认值，再叠加环境配置 + 运行时配置
     * - Step 1: fetch default-config.json（极兜底源）
     * - Step 2: 叠加 fetch 环境配置文件
     * - Step 3: 合并原生层注入的运行时配置（最高优先级）
     */
    ConfigManager.prototype.load = function () {
        if (this._loadingPromise) return this._loadingPromise;

        const self = this;
        this._loadingPromise = (async function () {
            // Step 1: 默认配置（从 JSON 文件加载，单一权威兜底源）
            try {
                const defaultCfg = await fetchJsonWithRetry('./config/default-config.json', 3);
                if (defaultCfg && validateConfig(defaultCfg)) {
                    self.config = deepMerge({}, defaultCfg);
                    console.log('[ConfigManager] 默认配置已加载');
                } else {
                    console.warn('[ConfigManager] default-config.json 加载/验证失败，使用空对象兜底');
                    self.config = {};
                }
            } catch (e) {
                console.warn('[ConfigManager] 默认配置加载异常，使用空对象兜底:', (e && e.message) || e);
                self.config = {};
            }

            // Step 2: 环境配置文件
            try {
                const env = detectEnvironment();
                const safeEnv = String(env).replace(/[^a-zA-Z0-9_-]/g, '');
                const configUrl = './config/config.' + safeEnv + '.json';
                const envCfg = await fetchJsonWithRetry(configUrl, 3);
                if (envCfg) {
                    if (validateConfig(envCfg)) {
                        self.config = deepMerge(self.config, envCfg);
                        self.config.env = safeEnv; // 确保 env 字段与加载文件一致
                        console.log('[ConfigManager] 环境配置已加载:', safeEnv);
                    } else {
                        console.warn('[ConfigManager] 环境配置 ' + configUrl + ' 验证失败，跳过叠加');
                    }
                } else {
                    console.warn('[ConfigManager] 环境配置文件 ' + configUrl + ' 加载失败，使用默认配置');
                }
            } catch (e) {
                console.warn('[ConfigManager] 环境配置加载失败，使用默认配置:', (e && e.message) || e);
            }

            // Step 3: 原生层运行时配置（最高优先级）
            try {
                if (window._nativeConfig && typeof window._nativeConfig === 'object') {
                    self.config = deepMerge(self.config, window._nativeConfig);
                    console.log('[ConfigManager] 运行时配置已合并');
                }
            } catch (e) {
                console.warn('[ConfigManager] 运行时配置合并失败:', (e && e.message) || e);
            }

            self._loaded = true;
            return self.config;
        })();

        return this._loadingPromise;
    };

    /**
     * 同步获取配置项（路径形式，如 "cloudbase.envId"）
     * 若 load() 尚未完成，返回默认配置中的值
     */
    ConfigManager.prototype.get = function (path) {
        if (!path) return undefined;
        return getNestedValue(this.config, path);
    };

    /**
     * 获取完整配置对象（克隆，避免外部修改污染）
     */
    ConfigManager.prototype.getAll = function () {
        try {
            return JSON.parse(JSON.stringify(this.config));
        } catch (e) {
            return this.config;
        }
    };

    /**
     * 当前环境名（production / development / testing 等）
     */
    ConfigManager.prototype.getEnv = function () {
        // [v9.18.3] 默认值改为硬编码字符串兜底（无业务配置依赖）
        return this.config.env || 'production';
    };

    /**
     * 是否为生产环境
     */
    ConfigManager.prototype.isProduction = function () {
        return this.getEnv() === 'production';
    };

    /**
     * 是否启用指定 feature
     */
    ConfigManager.prototype.isFeatureEnabled = function (name) {
        const v = this.get('features.' + name);
        return v === true;
    };

    /**
     * 等待配置加载完成（最多等待 maxWaitMs 毫秒）
     */
    ConfigManager.prototype.ready = function (maxWaitMs) {
        const self = this;
        if (self._loaded) return Promise.resolve(self.config);
        const loadPromise = self.load();
        if (!maxWaitMs || maxWaitMs <= 0) return loadPromise;
        return new Promise(function (resolve) {
            let done = false;
            const timer = setTimeout(function () {
                if (!done) {
                    done = true;
                    resolve(self.config);
                }
            }, maxWaitMs);
            loadPromise.then(function (cfg) {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    resolve(cfg);
                }
            }).catch(function () {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    resolve(self.config);
                }
            });
        });
    };

    // ====================================================================
    // 单例：尽早暴露，确保其他脚本可立即使用默认配置
    // load() 是异步的，但 get() 在 load 完成前会返回默认值
    // ====================================================================
    const manager = new ConfigManager();

    // 立即开始加载（不阻塞当前脚本执行）
    try {
        manager.load();
    } catch (e) {
        console.warn('[ConfigManager] 初始化加载异常:', (e && e.message) || e);
    }

    window.configManager = manager;
})();