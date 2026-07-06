/**
 * TimeBank 云端配置管理器
 *
 * 三层配置优先级（从高到低）：
 * 1. 运行时配置（window._nativeConfig，由 Android 原生层注入）
 * 2. 环境配置文件（config/config.{env}.json，按 env 加载）
 * 3. 默认配置（代码内置兜底）
 *
 * 设计目标：
 * - 消除 CloudBase envId / 云函数端点 / AI 端点等硬编码
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
    // 默认配置（兜底）：无论配置文件加载失败多少次，都用这份
    // ====================================================================
    const DEFAULT_CONFIG = {
        env: 'production',
        cloudbase: {
            envId: 'cloud1-8gvjsmyd7860b4a3',
            region: 'ap-shanghai',
            functions: {
                sync: 'timebankSync',
                ai: 'timebankAI'
            }
        },
        endpoints: {
            sync: 'https://cloud1-8gvjsmyd7860b4a3-1304758747.ap-shanghai.app.tcloudbase.com/timebankSync',
            ai: 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI'
        },
        features: {
            enableCloudSync: true,
            enableAI: true,
            enableWatch: true
        }
    };

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
        // 兜底
        return DEFAULT_CONFIG.env;
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
        this.config = DEFAULT_CONFIG;
        this._loaded = false;
        this._loadingPromise = null;
    }

    /**
     * 异步加载完整配置（不阻塞启动）
     * - 先用默认配置
     * - 异步 fetch 环境配置文件合并
     * - 再合并原生层注入的运行时配置
     */
    ConfigManager.prototype.load = function () {
        if (this._loadingPromise) return this._loadingPromise;

        const self = this;
        this._loadingPromise = (async function () {
            // Step 1: 默认配置（已在构造函数中设置）

            // Step 2: 环境配置文件
            try {
                const env = detectEnvironment();
                const safeEnv = String(env).replace(/[^a-zA-Z0-9_-]/g, '');
                const configUrl = './config/config.' + safeEnv + '.json';
                const resp = await fetch(configUrl, { cache: 'no-cache' });
                if (resp && resp.ok) {
                    const envCfg = await resp.json();
                    self.config = deepMerge(self.config, envCfg);
                    self.config.env = safeEnv; // 确保 env 字段与加载文件一致
                    console.log('[ConfigManager] 环境配置已加载:', safeEnv);
                } else {
                    console.warn('[ConfigManager] 环境配置文件 HTTP', resp ? resp.status : 'no-response', '，使用默认配置');
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
        return this.config.env || DEFAULT_CONFIG.env;
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