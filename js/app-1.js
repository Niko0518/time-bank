// ⚠️ 版本更新规则 (必读)：
// 1. APP_VERSION 和版本日志的更新【必须】由用户明确下达命令后才能修改
// 2. 用户会在更新开始前告知本次版本号
// 3. 版本日志应在整个版本更新完成后才添加
// 4. 未经用户授权，禁止自行修改版本号！
const APP_VERSION = 'v9.0.11'; // [v9.0.11] PWA 端 bug 反馈修复：fetchDelta currentUid 自由变量 + Watch 雪崩治理 + completionCount 端到端写回 + 按钮 ID 修复 + SDK 加载时序
// [v5.8.1] Event Sourcing 准备：事件日志静默记录
// 这是迁移到事件驱动架构的第一步，目前只记录不使用
const EVENT_TYPES = {
    // 任务生命周期
    TASK_CREATED: 'TASK_CREATED',
    TASK_UPDATED: 'TASK_UPDATED',
    TASK_DELETED: 'TASK_DELETED',
    // 任务执行
    TASK_STARTED: 'TASK_STARTED',
    TASK_PAUSED: 'TASK_PAUSED',
    TASK_RESUMED: 'TASK_RESUMED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    TASK_STOPPED: 'TASK_STOPPED', // 持续类结束（含消费）
    TASK_CANCELLED: 'TASK_CANCELLED',
    // 补录和撤回
    TASK_BACKDATED: 'TASK_BACKDATED',
    TRANSACTION_UNDONE: 'TRANSACTION_UNDONE',
    // 习惯相关
    HABIT_STREAK_ADVANCED: 'HABIT_STREAK_ADVANCED',
    HABIT_STREAK_BROKEN: 'HABIT_STREAK_BROKEN',
    // 设置
    SETTINGS_CHANGED: 'SETTINGS_CHANGED',
};

// 客户端唯一标识（用于区分多端事件来源）
let clientId = localStorage.getItem('tb_client_id');
if (!clientId) {
    clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('tb_client_id', clientId);
}

// [v7.27.0] logEvent: Event Sourcing 已废弃，保留调用兼容
function logEvent() {}

// [v5.6.0] Toast 通知函数
// [v6.0.0] 支持全局通透模式
function showToast(message, duration = 2000) {
    // 移除已有的 toast
    const existingToast = document.getElementById('toastNotification');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 检查是否是通透模式
    const isGlassMode = document.body.classList.contains('glass-mode');
    
    // 创建 toast 元素
    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.textContent = message;
    
    if (isGlassMode) {
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.12) 100%);
            border: 1px solid rgba(255, 255, 255, 0.3);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            color: white;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 0.9rem;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            max-width: 80%;
            text-align: center;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        `;
    } else {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#2196F3';
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${isDark ? 'rgba(0, 0, 0, 0.85)' : primaryColor};
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 0.9rem;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            max-width: 80%;
            text-align: center;
            box-shadow: 0 4px 16px rgba(0, 0, 0, ${isDark ? '0.4' : '0.2'});
            ${!isDark ? `border: 1px solid ${primaryColor}dd;` : ''}
        `;
    }
    document.body.appendChild(toast);
    
    // 显示动画
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    
    // 自动隐藏
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

const APP_DIRECTORY = {
    // --- 社交/通讯 ---
    "微信": "com.tencent.mm",
    "QQ": "com.tencent.mobileqq",
    "微博": "com.sina.weibo",
    "小红书": "com.xingin.xhs",
    "知乎": "com.zhihu.android",
    "Telegram": "org.telegram.messenger",
    "Twitter": "com.twitter.android",
    "X": "com.twitter.android",
    // --- 视频/娱乐 ---
    "抖音": "com.ss.android.ugc.aweme",
    "快手": "com.smile.gifmaker",
    "B站": "tv.danmaku.bili",
    "哔哩哔哩": "tv.danmaku.bili",
    "YouTube": "com.google.android.youtube",
    "Netflix": "com.netflix.mediaclient",
    "Spotify": "com.spotify.music",
    "网易云音乐": "com.netease.cloudmusic",
    "QQ音乐": "com.tencent.qqmusic",
    // --- 游戏 (最热门) ---
    "王者荣耀": "com.tencent.tmgp.sgame",
    "和平精英": "com.tencent.tmgp.pubgmhd",
    "原神": "com.miHoYo.Yuanshen",
    "崩坏：星穹铁道": "com.miHoYo.hkrpg",
    "金铲铲之战": "com.tencent.jkchess",
    "英雄联盟手游": "com.tencent.lolm",
    "穿越火线": "com.tencent.tmgp.cf",
    "Minecraft": "com.mojang.minecraftpe",
    "第五人格360": "com.netease.dwrg.qihoo",
    "荒野乱斗": "com.tencent.tmgp.supercell.brawlstars",
    "逆水寒": "com.netease.nshm",
    // --- 生活/工具 ---
    "支付宝": "com.eg.android.AlipayGphone",
    "淘宝": "com.taobao.taobao",
    "京东": "com.jingdong.app.mall",
    "拼多多": "com.xunmeng.pinduoduo",
    "美团": "com.sankuai.meituan",
    "饿了么": "me.ele",
    "高德地图": "com.autonavi.minimap",
    "百度地图": "com.baidu.BaiduMap",
    "Chrome": "com.android.chrome",
    "Edge": "com.microsoft.emmx",

    // --- 扩展词典 2025-12 热门应用 ---
    "腾讯视频": "com.tencent.qqlive",
    "爱奇艺": "com.qiyi.video",
    "优酷": "com.youku.phone",
    "芒果TV": "com.hunantv.imgo.activity",
    "抖音极速版": "com.ss.android.ugc.aweme.lite",
    "快手极速版": "com.kuaishou.nebula",
    "今日头条": "com.ss.android.article.news",
    "百度": "com.baidu.searchbox",
    "央视新闻": "cn.cntvnews",
    "网易新闻": "com.netease.newsreader.activity",
    "新浪新闻": "com.sina.news",
    "澎湃新闻": "com.thepaper.news",
    "搜狐新闻": "com.sohu.newsclient",
    "腾讯地图": "com.tencent.map",
    "滴滴出行": "com.sdu.didi.psnger",
    "哈啰出行": "com.hellobike",
    "曹操出行": "com.caocao.gulf",
    "携程": "ctrip.android.view",
    "去哪儿": "com.Qunar",
    "同程旅行": "com.tongcheng.android",
    "12306": "com.MobileTicket",
    "高铁管家": "com.huochebang.station",
    "车来了": "com.ygkj.chelaile.standard",
    "腾讯会议": "com.tencent.wemeet.app",
    "钉钉": "com.alibaba.android.rimet",
    "企业微信": "com.tencent.wework",
    "飞书": "com.ss.android.lark",
    "WPS Office": "cn.wps.moffice_eng",
    "OneNote": "com.microsoft.office.onenote",
    "Word": "com.microsoft.office.word",
    "Excel": "com.microsoft.office.excel",
    "PowerPoint": "com.microsoft.office.powerpoint",
    "Outlook": "com.microsoft.office.outlook",
    "Notion": "com.notion.android",
    "印象笔记": "com.yinxiang",
    "Todoist": "com.todoist",
    "滴答清单": "com.ticktick.task",
    "Forest": "cc.forestapp",
    "Google Keep": "com.google.android.keep",
    "网易有道词典": "com.youdao.dict",
    "喜马拉雅": "com.ximalaya.ting.android",
    "荔枝": "com.lizhi.fm",
    "Kindle": "com.amazon.kindle",
    "掌阅": "com.chaozh.iReaderFree",
    "多看阅读": "com.duokan.reader",
    "微信读书": "com.tencent.weread",
    "得到": "com.luojilab.player",
    "百度网盘": "com.baidu.netdisk",
    "阿里云盘": "com.alicloud.databox",
    "夸克": "com.quark.browser",
    "QQ邮箱": "com.tencent.androidqqmail",
    "网易邮箱大师": "com.netease.mail",
    "Gmail": "com.google.android.gm",
    "Firefox": "org.mozilla.firefox",
    "Brave": "com.brave.browser",
    "Keep健身": "com.gotokeep.keep",
    "咕咚": "com.codoon.gps",
    "Nike Run Club": "com.nike.plusgps",
    "华为运动健康": "com.huawei.health",
    "Zepp Life": "com.huami.watch.hmwatchmanager",
    "Fitbit": "com.fitbit.FitbitMobile",
    "米家": "com.xiaomi.smarthome",
    "华为智能家居": "com.huawei.smarthome",
    "Philips Hue": "com.philips.lighting.hue2",
    "盒马": "com.wudaokou.hippo",
    "大众点评": "com.dianping.v1",
    "美团外卖": "com.sankuai.meituan.takeoutnew",
    "肯德基": "com.yum.android.kfc",
    "麦当劳": "com.mcdonalds.gma.cn",
    "星巴克": "com.starbucks.cn",
    "必胜客": "com.yum.pizzahut",
    "得物": "com.shizhuang.duapp",
    "闲鱼": "com.taobao.idlefish",
    "1688": "com.alibaba.wireless",
    "苏宁易购": "com.suning.mobile.ebuy",
    "京东金融": "com.jd.jrapp",
    "云闪付": "com.unionpay",
    "招商银行": "com.cmbchina.ccd.pluto.cmbActivity",
    "微信国际版": "com.weico.international",
    "Instagram": "com.instagram.android",
    "WhatsApp": "com.whatsapp",
    "LINE": "jp.naver.line.android",
    "Messenger": "com.facebook.orca",
    "Snapchat": "com.snapchat.android",
    "Discord": "com.discord",
    "Slack": "com.Slack",
    "Zoom": "us.zoom.videomeetings",
    "Teams": "com.microsoft.teams",
    "Skype": "com.skype.raider",
    "腾讯课堂": "com.tencent.edu",
    "网易云课堂": "com.netease.edu.study",
    "学习强国": "cn.xuexi.android",
    "Coursera": "org.coursera.android",
    "Khan Academy": "org.khanacademy.android",
    "Duolingo": "com.duolingo",
    "Google Classroom": "com.google.android.apps.classroom",
    "Memrise": "com.memrise.android.memrisecompanion",
    "Speedtest": "com.ookla.speedtest",
    "Airbnb": "com.airbnb.android",
    "Booking": "com.booking"
};

// --- [v6.6.0] 腾讯云 CloudBase 初始化 ---
const TCB_ENV_ID = 'cloud1-8gvjsmyd7860b4a3';

// 全局变量声明（等待 SDK 加载后初始化）
let app = null;
let auth = null;
let db = null;
let _ = null;
let cloudbaseInitialized = false;

// SDK 初始化函数（带重试）
// [v9.0.11-fix] 初始化单例 Promise + 首次失败降噪
let __initCloudBaseLogged = false;
let __cloudBaseReady = null;
let __cloudBaseReadyResolve = null;
let __cloudBaseReadyReject = null;

function initCloudBase() {
    // [v7.31.2-fix] 检查是否在 file:// 协议下运行
    if (window._isFileProtocol) {
        console.error('[CloudBase] Cannot initialize SDK when running from file:// protocol');
        console.error('[CloudBase] Please use a local HTTP server like:');
        console.error('  - npx serve .');
        console.error('  - python -m http.server 8080');
        console.error('  - php -S localhost:8080');
        window.cloudbaseSDKError = 'file_protocol_not_supported';
        if (__cloudBaseReadyReject) __cloudBaseReadyReject(new Error('file_protocol_not_supported'));
        return false;
    }

    // 检查各种可能的全局变量名
    const sdk = window.cloudbase || window.CloudBase || window.tcb;

    if (!sdk) {
        // [v9.0.11-fix] 仅首次失败打日志，避免重复 5 行刷屏
        if (!__initCloudBaseLogged) {
            console.error('[CloudBase] SDK 未加载，等待 SDK 脚本完成（仅首次提示）');
            console.error('[CloudBase] SDK loaded flag:', window.cloudbaseSDKLoaded, 'SDK error:', window.cloudbaseSDKError);
            __initCloudBaseLogged = true;
        }
        return false;
    }

    try {
        // v2 SDK 初始化
        // [v7.9.4] 添加 persistence: 'local' 确保登录状态持久化到 localStorage
        app = sdk.init({
            env: TCB_ENV_ID,
            region: 'ap-shanghai', // 上海地域
            persistence: 'local'   // 持久化到 localStorage（设备重启后保留）
        });

        auth = app.auth();
        db = app.database();
        _ = db.command; // 数据库操作符

        cloudbaseInitialized = true;
        console.log('[CloudBase] SDK initialized successfully');
        // [v9.0.11-fix] 通知所有 await whenCloudBaseReady() 的调用方
        if (__cloudBaseReadyResolve) __cloudBaseReadyResolve();
        return true;
    } catch (e) {
        if (!__initCloudBaseLogged) {
            console.error('[CloudBase] Init error:', e);
            __initCloudBaseLogged = true;
        }
        if (__cloudBaseReadyReject) __cloudBaseReadyReject(e);
        return false;
    }
}

// [v9.0.11-fix] 等待 CloudBase 就绪的 Promise——所有"未就绪"路径静默 await
// 默认 5s 超时，超时静默返回失败，不打 warn（避免刷新后启动期噪音）
function whenCloudBaseReady(timeoutMs = 5000) {
    if (cloudbaseInitialized) return Promise.resolve();
    if (!__cloudBaseReady) {
        __cloudBaseReady = new Promise((res, rej) => {
            __cloudBaseReadyResolve = res;
            __cloudBaseReadyReject  = rej;
        });
    }
    if (timeoutMs <= 0) return __cloudBaseReady;
    return Promise.race([
        __cloudBaseReady,
        new Promise((_, rej) => setTimeout(() => rej(new Error('cloudbase-ready-timeout')), timeoutMs))
    ]);
}

// 等待 SDK 加载后再初始化
// [v9.0.11-fix] 扩时长 20×200ms=4s → 150×200ms=30s，慢网络也能等到
function waitForCloudBase(callback, maxRetries = 150, interval = 200) {
    let retries = 0;

    function tryInit() {
        if (initCloudBase()) {
            if (callback) callback(true);
            return;
        }

        retries++;
        if (retries < maxRetries) {
            // [v9.0.11-fix] 等待过程不刷屏（首次失败已在 initCloudBase 内打）
            setTimeout(tryInit, interval);
        } else {
            console.error('[CloudBase] SDK failed to load after', maxRetries, 'retries (', (maxRetries * interval / 1000), 's)');
            if (callback) callback(false);
        }
    }

    tryInit();
}

// 启动初始化等待
waitForCloudBase(function(success) {
    if (success) {
        console.log('[CloudBase] Ready to use');
        // 尝试恢复登录状态
        refreshLoginState().then(async state => {
            if (state) {
                console.log('[CloudBase] Login state restored');
            } else {
                // [v7.9.4] 登录状态丢失，尝试自动重新登录
                const autoLoginSuccess = await tryAutoReLogin();
                if (!autoLoginSuccess) {
                    // [v7.8.3] 自动登录失败，填充保存的邮箱
                    autoFillSavedEmail();
                }
            }
        });
    } else {
        console.error('[CloudBase] Failed to initialize');
    }
});

// [v7.9.4] 尝试自动重新登录（使用保存的凭据）
async function tryAutoReLogin() {
    console.log('[Auth] Checking for auto-login credentials...');
    
    // 检查是否有保存的凭据
    let savedEmail = '';
    let savedPassword = '';
    let autoLoginEnabled = false;
    
    // 从 Android SharedPreferences 获取
    if (typeof Android !== 'undefined') {
        try {
            if (Android.isAutoLoginEnabled) {
                autoLoginEnabled = Android.isAutoLoginEnabled();
            }
            if (autoLoginEnabled && Android.getSavedLoginEmail && Android.getSavedLoginPassword) {
                savedEmail = Android.getSavedLoginEmail() || '';
                savedPassword = Android.getSavedLoginPassword() || '';
            }
        } catch (e) {
            console.warn('[Auth] Failed to get credentials from Android:', e);
        }
    }
    
    // PWA 备份：从 localStorage 获取
    if (!savedEmail || !savedPassword) {
        try {
            const pwaSavedEmail = localStorage.getItem('timebankLoginEmail') || '';
            const pwaSavedPassword = localStorage.getItem('timebankLoginPasswordEncoded') || '';
            const pwaAutoLogin = localStorage.getItem('timebankAutoLoginEnabled') === 'true';
            
            if (pwaAutoLogin && pwaSavedEmail && pwaSavedPassword) {
                savedEmail = pwaSavedEmail;
                // Base64 解码密码
                savedPassword = atob(pwaSavedPassword);
                autoLoginEnabled = true;
            }
        } catch (e) {
            console.warn('[Auth] Failed to get credentials from localStorage:', e);
        }
    }
    
    // 如果没有保存的凭据或未启用自动登录，返回失败
    if (!autoLoginEnabled || !savedEmail || !savedPassword) {
        console.log('[Auth] Auto-login not available: enabled=', autoLoginEnabled, ', hasEmail=', !!savedEmail, ', hasPassword=', !!savedPassword);
        return false;
    }
    
    console.log('[Auth] 🔄 Attempting auto-login for:', savedEmail);
    
    try {
        // 执行自动登录
        let result;
        if (typeof auth.signInWithPassword === 'function') {
            result = await auth.signInWithPassword({ email: savedEmail, password: savedPassword });
        } else {
            result = await auth.signIn({ username: savedEmail, password: savedPassword });
        }
        
        // 检查是否有错误
        if (result && result.error) {
            throw result.error;
        }
        
        // 获取用户数据
        let userData = result?.data?.user || result?.data?.session?.user;
        if (userData) {
            const userId = userData.id || userData.uid || userData.sub || userData.user_id;
            cachedLoginState = { 
                user: { 
                    ...userData,
                    uid: userId
                }
            };
        } else {
            await refreshLoginState();
        }
        
        updateAuthUI(cachedLoginState);
        console.log('[Auth] ✅ Auto-login successful!');
        // 加载数据
        const hasData = await DAL.init();
        if (hasData) {
            await DAL.loadAll();
            updateAllUI();
        }
        
        return true;
    } catch (error) {
        console.error('[Auth] Auto-login failed:', error);
        
        // 如果密码错误或账户问题，清除保存的密码
        const errMsg = error.message || error.code || '';
        if (errMsg.includes('INVALID_PASSWORD') || errMsg.includes('PASSWORD') || errMsg.includes('password')) {
            console.log('[Auth] Clearing saved password due to invalid password');
            if (typeof Android !== 'undefined' && Android.clearLoginCredentials) {
                try { Android.clearLoginCredentials(); } catch (e) {}
            }
            localStorage.removeItem('timebankLoginPasswordEncoded');
            localStorage.setItem('timebankAutoLoginEnabled', 'false');
        }
        
        return false;
    }
}

// [v7.8.3] 自动填充保存的登录邮箱
function autoFillSavedEmail() {
    let savedEmail = '';
    
    // 优先从 Android SharedPreferences 获取
    if (typeof Android !== 'undefined' && Android.getSavedLoginEmail) {
        try {
            savedEmail = Android.getSavedLoginEmail();
        } catch (e) {
            console.warn('[Auth] Failed to get saved email from Android:', e);
        }
    }
    
    // 如果 Android 没有，尝试 localStorage
    if (!savedEmail) {
        savedEmail = localStorage.getItem('timebankLoginEmail') || '';
    }
    
    if (savedEmail) {
        console.log('[Auth] Auto-filling saved email:', savedEmail);
        const emailInput = document.getElementById('authEmail');
        if (emailInput) {
            emailInput.value = savedEmail;
        }
    }
}

// [v7.9.3] 检测登录状态是否意外丢失（应用恢复时调用）
let isCheckingLoginState = false; // 防止重复检测
async function checkLoginStateOnResume() {
    // 防止重复检测
    if (isCheckingLoginState) return;
    isCheckingLoginState = true;
    
    try {
        // 1. 获取期望登录状态
        let expectedLoggedIn = false;
        if (typeof Android !== 'undefined' && Android.getExpectedLoggedIn) {
            try {
                expectedLoggedIn = Android.getExpectedLoggedIn();
            } catch (e) {
                console.warn('[Auth] Failed to get expected login state from Android:', e);
            }
        }
        // PWA 备份
        if (!expectedLoggedIn && localStorage.getItem('timebankExpectedLoggedIn') === 'true') {
            expectedLoggedIn = true;
        }
        
        // 2. 如果之前未登录，无需检测
        if (!expectedLoggedIn) {
            console.log('[Auth] No expected login, skipping check');
            return;
        }
        
        // 3. 刷新当前登录状态
        const currentState = await refreshLoginState();
        const currentlyLoggedIn = !!(currentState && currentState.user && currentState.user.uid);
        
        console.log('[Auth] Resume check - expected:', expectedLoggedIn, ', current:', currentlyLoggedIn);
        
        // 4. 如果期望登录但实际未登录，检测到意外登出
        if (expectedLoggedIn && !currentlyLoggedIn) {
            console.warn('[Auth] ⚠️ 检测到意外登出，尝试静默恢复...');

            // [v8.2.6] 先尝试用保存的凭据自动恢复，而不是直接提示用户
            const restored = await tryAutoReLogin();
            if (restored) {
                console.log('[Auth] 静默恢复登录成功');
                updateAuthUI(cachedLoginState);
                return;
            }

            console.warn('[Auth] 静默恢复失败，需要用户手动登录');

            // [v7.11.1] 网页端恢复期间禁止本地覆盖云端
            hasCompletedFirstCloudSync = false;
            if (IS_WEB_ONLY) {
                scheduleWebLoginRestore('resume');
            }
            
            // 获取保存的邮箱
            let savedEmail = '';
            if (typeof Android !== 'undefined' && Android.getSavedLoginEmail) {
                try {
                    savedEmail = Android.getSavedLoginEmail();
                } catch (e) {
                    console.warn('[Auth] Failed to get saved email:', e);
                }
            }
            if (!savedEmail) {
                savedEmail = localStorage.getItem('timebankLoginEmail') || '';
            }
            
            // 自动填充邮箱并提示用户
            if (savedEmail) {
                autoFillSavedEmail();
                // 显示提示
                showNotification('🔐 请重新登录', `登录状态已过期，请输入密码重新登录 (${savedEmail})`, 'warning');
                // 跳转到设置页面（登录区域）
                showPage('settings');
                // 滚动到登录区域
                setTimeout(() => {
                    const authSection = document.getElementById('authSectionContainer');
                    if (authSection) {
                        authSection.scrollIntoView({ behavior: 'smooth' });
                    }
                }, 300);
            } else {
                showNotification('🔐 登录已过期', '请重新登录以恢复云端同步', 'warning');
                showPage('settings');
            }
            
            // 更新 UI 为未登录状态
            updateAuthUI(null);
        }
    } catch (e) {
        console.error('[Auth] checkLoginStateOnResume error:', e);
    } finally {
        isCheckingLoginState = false;
    }
}

// [v6.6.0] 缓存登录状态（避免频繁异步调用）
let cachedLoginState = null;

// 获取缓存的 UID（兼容不同字段命名）
function getCachedUid() {
    const user = cachedLoginState?.user;
    return user?.uid || user?.id || user?.sub || user?.user_id || null;
}

// [v8.2.6] 同步检查是否已登录，增加 SDK 兜底恢复
function isLoggedIn() {
    // 优先检查缓存
    if (cachedLoginState && getCachedUid()) return true;
    // 缓存被意外清空时，用 SDK 同步方法兜底（不触发网络请求）
    if (cloudbaseInitialized && auth && typeof auth.hasLoginState === 'function') {
        const syncState = auth.hasLoginState();
        if (syncState) {
            const user = syncState.user || syncState;
            const uid = user?.uid || user?.id || user?.sub || user?.user_id;
            if (uid) {
                cachedLoginState = { user: { ...user, uid } };
                console.log('[Auth] isLoggedIn() 轻量恢复登录态:', uid);
                return true;
            }
        }
    }
    return false;
}

// 异步刷新登录状态缓存
// [v9.0.11-fix] 先 await CloudBase 就绪（5s 超时静默返回），消除启动期 [Auth] refreshLoginState called before SDK init 噪音
async function refreshLoginState() {
    // [v9.0.11-fix] 用 whenCloudBaseReady 替代裸 null 检查 + warn
    try {
        await whenCloudBaseReady(5000);
    } catch (_) {
        // 超时静默返回 null（不再打 warn，避免反复启动期的噪音）
        cachedLoginState = null;
        return null;
    }
    if (!auth) {
        cachedLoginState = null;
        return null;
    }

    try {
        // CloudBase v2: 优先使用异步 getLoginState() 获取完整状态
        // hasLoginState() 是同步的，可能无法获取完整用户信息
        let rawState = null;

        // 先尝试异步方法
        if (typeof auth.getLoginState === 'function') {
            try {
                rawState = await auth.getLoginState();
                console.log('[Auth] getLoginState (async) result:', rawState);
            } catch (asyncErr) {
                console.warn('[Auth] getLoginState async error:', asyncErr);
            }
        }
        
        // 如果异步失败，回退到同步方法
        if (!rawState && typeof auth.hasLoginState === 'function') {
            rawState = auth.hasLoginState();
            console.log('[Auth] hasLoginState (sync) result:', rawState);
        }
        
        console.log('[Auth] rawState:', rawState);
        console.log('[Auth] rawState?.user:', rawState?.user);
        
        if (rawState) {
            // rawState 可能是 LoginState 对象，user 信息在 rawState.user 中
            let userObj = rawState.user;
            
            // 如果 user 对象存在但没有 uid，尝试从 user 对象本身获取
            if (userObj) {
                console.log('[Auth] userObj keys:', Object.keys(userObj));
                const userId = userObj.uid || userObj.id || userObj.sub || userObj.user_id;
                console.log('[Auth] Extracted userId:', userId);
                
                if (userId) {
                    cachedLoginState = {
                        ...rawState,
                        user: {
                            ...userObj,
                            uid: userId
                        }
                    };
                } else {
                    // uid 仍然为空，但 rawState 存在，说明已登录
                    // 尝试从 auth.currentUser 获取
                    if (auth.currentUser) {
                        console.log('[Auth] Trying auth.currentUser:', auth.currentUser);
                        const currentUserUid = auth.currentUser.uid || auth.currentUser.id || auth.currentUser.sub;
                        if (currentUserUid) {
                            cachedLoginState = {
                                ...rawState,
                                user: {
                                    ...userObj,
                                    uid: currentUserUid
                                }
                            };
                        } else {
                            cachedLoginState = rawState;
                        }
                    } else {
                        cachedLoginState = rawState;
                    }
                }
            } else {
                cachedLoginState = rawState;
            }
        } else {
            // [v8.2.6] 修复：仅当确认确实无登录态时才清空
            // 如果之前已有缓存，保留旧缓存而不是清空（防止 SDK 临时波动导致误报）
            if (!cachedLoginState) {
                cachedLoginState = null;
            } else {
                console.warn('[Auth] refreshLoginState() 返回 null，但保留已有缓存以避免误报');
            }
        }
        
        console.log('[Auth] Final cachedLoginState:', cachedLoginState);
        console.log('[Auth] Final user uid:', cachedLoginState?.user?.uid);
    } catch (e) {
        console.warn('[Auth] refreshLoginState error:', e);
        // [v8.2.6] 异常时同样保留已有缓存
        if (!cachedLoginState) cachedLoginState = null;
    }
    return cachedLoginState;
}

// ============================================================================
// [v6.6.0] 多表数据访问层 (DAL - Data Access Layer) - CloudBase 版
// 将单一 JSON 重构为 5 张独立表，实现细粒度同步
// ============================================================================

// --- 架构开关 ---
const MULTI_TABLE_VERSION = 2; // 多表架构版本号 (CloudBase)

// [v7.9.7] 平台检测：网页端纯云端模式，安卓端混合模式
const IS_ANDROID_APP = typeof Android !== 'undefined';
const IS_WEB_ONLY = !IS_ANDROID_APP;
// 网页端：禁用本地业务数据缓存，强制云端优先
const USE_LOCAL_CACHE = IS_ANDROID_APP; // 仅安卓端使用本地缓存

// [v7.9.12] 网页端登录恢复监控：防止登录状态延迟导致本地旧数据覆盖云端
let isWebLoginRestoreActive = false;
let webLoginRestoreTimer = null;
async function forceWebCloudRefresh(reason = 'web-force-refresh') {
    if (!IS_WEB_ONLY) return false;
    try {
        const state = await refreshLoginState();
        const uid = state?.user?.uid;
        if (uid) {
            await handlePostLoginDataInit(reason);
            updateAllUI();
            return true;
        }
    } catch (e) {
        console.warn('[Auth] forceWebCloudRefresh failed:', e);
    }
    return false;
}
function scheduleWebLoginRestore(source = 'initApp') {
    if (!IS_WEB_ONLY || isWebLoginRestoreActive) return;
    isWebLoginRestoreActive = true;
    const start = Date.now();
    const MAX_WAIT_MS = 12000;
    const INTERVAL = 500;

    console.warn('[Auth] Web login state pending, waiting for UID...');
    webLoginRestoreTimer = setInterval(async () => {
        try {
            const uid = await DAL.getCurrentUid();
            if (uid) {
                clearInterval(webLoginRestoreTimer);
                webLoginRestoreTimer = null;
                isWebLoginRestoreActive = false;
                await handlePostLoginDataInit('web-login-restore');
                updateAllUI();
                return;
            }

            const syncState = auth && typeof auth.hasLoginState === 'function' ? auth.hasLoginState() : null;
            if (!syncState || (Date.now() - start) > MAX_WAIT_MS) {
                clearInterval(webLoginRestoreTimer);
                webLoginRestoreTimer = null;
                isWebLoginRestoreActive = false;

                // [v7.18.4] 网页端禁用本地数据兜底，强制使用云端
            if (!syncState) {
                console.warn('[Auth] Web login state not found, skip local data (web-only mode)');
                showNotification('⚠️ 未登录', '网页端仅支持云端模式，请先登录', 'warning');
            } else {
                console.warn('[Auth] Web login restore timeout, force refresh cloud');
                const refreshed = await forceWebCloudRefresh('web-login-restore-timeout');
                if (!refreshed) {
                    showNotification('⚠️ 登录恢复失败', '登录状态未能恢复，请重新登录', 'warning');
                }
            }
            }
        } catch (e) {
            console.warn('[Auth] Web login restore check failed:', e);
        }
    }, INTERVAL);
}

// --- 表定义 (CloudBase 集合名) ---
const TABLES = {
    PROFILE: 'tb_profile',      // 用户配置（1条/用户）
    TASK: 'tb_task',            // 任务表（N条/用户）
    TRANSACTION: 'tb_transaction', // 交易表（只增不改）
    RUNNING: 'tb_running',      // 运行中任务（临时表）
    DAILY: 'tb_daily'           // 每日汇总（缓存表）
};

// --- 实时监听管理 (替代 LeanCloud LiveQuery) ---
// [v7.37.3] 修复：watchers 必须与 watchRegistered/watchConnected 的 key 一致
const watchers = {
    profile: null,
    task: null,
    transaction: null,
    running: null,
    daily: null  // [v7.37.3] 添加 daily，与其他两个状态对象保持一致
};

// [v7.33.2] Watch 两层状态跟踪：
// watchRegistered = .watch() 调用是否成功（同步判定，表示 watcher 已注册）
// watchConnected  = onChange 是否已触发（异步确认，表示连接真正活跃）
const watchRegistered = {
    profile: false,
    task: false,
    transaction: false,
    running: false,
    daily: false
};
const watchConnected = {
    profile: false,
    task: false,
    transaction: false,
    running: false,
    daily: false
};

// [v7.9.3] 重连计数器（用于指数退避）
const watchReconnectAttempts = {
    profile: 0,
    task: 0,
    transaction: 0,
    running: 0,
    daily: 0
};

// [v7.36.4] 重连计数器安全上限：防止无限增长导致退避时间过长
// [v9.0.10 完善] 调整：3 → 8。8 次失败（约 1-2 分钟）后才停止自动重连。
// 配合 A3 自愈探针：即使降到 paused 状态，后台每 60s 自动探活，不等用户操作。
// 用户原话："修复优先于降级"——3 次太激进，违反"修复优先"原则。
const MAX_RECONNECT_ATTEMPTS = 8; // 最大重试次数（8 次约 1-2 分钟到达上限）

// [v7.9.3] 重连定时器
// [v7.37.1] QPS优化：添加lastAttempt用于全局防抖
const watchReconnectTimers = {
    pending: null,
    lastAttempt: 0  // [v7.37.1] 记录上次重连尝试时间戳
};

// [v9.0.10 完善] Watch 状态机（修复优先 + 降级自愈）
// 状态机：'ok' → 'degraded'（偶发断开自动恢复中）→ 'paused'（8 次失败停止自动重连，**自愈探针接管**）
// 关键设计：'paused' 不是终点——A3 自愈探针每 60s 自动探活，**不等用户操作**
let __watchDegradeStatus = 'ok';        // 'ok' | 'degraded' | 'paused'
let __watchFirstFailAt = 0;            // 首次失败时间戳（用于跨刷新持久化）
let __watchFailCount = 0;              // 当前累计失败次数（重连成功后清零）
let __watchLastHeartbeatAt = 0;        // 最近一次心跳成功时间戳
let __watchLastReason = '';            // [v9.0.10 完善] 最后失败原因：'network' | 'sdk_timeout' | 'unknown'
let __watchSelfHealingCountdown = 60;  // [v9.0.10 完善] 自愈倒计时（秒）
let __watchHeartbeatTimer = null;      // 心跳定时器句柄
let __watchSelfHealingTimer = null;    // [v9.0.10 完善] 自愈探针定时器句柄
let __watchSelfHealingProbeCount = 0;  // [v9.0.10 完善] 自愈探针累计次数（用于诊断）
let __watchCountdownTicker = null;     // [v9.0.10 修复] 自愈倒计时定时器句柄（消除隐式全局）
const WATCH_HEARTBEAT_INTERVAL_MS = 20 * 1000; // 20 秒心跳（远低于 SDK 30s 空闲超时）
const WATCH_SELF_HEAL_INTERVAL_MS = 60 * 1000; // [v9.0.10 完善] 自愈探针 60s 一次
const WATCH_DEGRADE_STATE_KEY = 'tb_watchDegradeState';

// [v9.0.10] 启动初始化隔离：单个 setup 失败不影响后续
function __safeSetup(label, fn) {
    try { fn(); return true; }
    catch (e) {
        console.error(`[Init] ${label} failed:`, e?.message || e);
        return false;
    }
}

// [v9.0.10 完善] 加载 Watch 降级状态（启动时从 localStorage 恢复，跨刷新保留）
function __loadWatchDegradeState() {
    try {
        const raw = localStorage.getItem(WATCH_DEGRADE_STATE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s && (s.status === 'ok' || s.status === 'degraded' || s.status === 'paused')) {
            __watchDegradeStatus = s.status;
            __watchFirstFailAt = Number(s.firstFailAt) || 0;
            __watchFailCount = Number(s.failCount) || 0;
            __watchLastReason = String(s.lastReason || '');
            __watchSelfHealingCountdown = Math.max(0, Math.min(60, Number(s.probeCountdown) || 60));
            __watchSelfHealingProbeCount = Number(s.probeCount) || 0;
        }
    } catch (e) {
        console.warn('[Watch] 加载降级状态失败:', e?.message);
    }
}

// [v9.0.10 完善] 持久化 Watch 降级状态（增加 lastReason + probeCountdown 字段）
function __recordWatchDegrade() {
    try {
        localStorage.setItem(WATCH_DEGRADE_STATE_KEY, JSON.stringify({
            status: __watchDegradeStatus,
            firstFailAt: __watchFirstFailAt,
            lastFailAt: Date.now(),
            failCount: __watchFailCount,
            lastReason: __watchLastReason,
            probeCountdown: __watchSelfHealingCountdown,
            probeCount: __watchSelfHealingProbeCount
        }));
    } catch (e) {
        console.warn('[Watch] 持久化降级状态失败:', e?.message);
    }
}

// [v9.0.10] 主动心跳保活：每 20s 调一次极轻量的 profile 查询，让 SDK 内部 WebSocket 保持活跃
// 根因：CloudBase SDK v2 WebSocket 无流量 30s 自动断开，触发 pong timed out 循环
// 修复：每 20s 主动产生一次网络流量，SDK 不会进入空闲超时
function __startWatchHeartbeat() {
    __stopWatchHeartbeat(); // 先清理旧定时器
    if (typeof db === 'undefined' || !db) return;
    const tick = async () => {
        // 仅在已登录且 Watch 已建立时执行
        if (!isLoggedIn()) return;
        if (typeof DAL === 'undefined' || !DAL) return;
        try {
            // 极轻量查询：限制 1 条，仅为产生 WebSocket 流量
            await db.collection('tb_profile').limit(1).get();
            __watchLastHeartbeatAt = Date.now();
        } catch (e) {
            // 心跳失败 → 静默（依赖 onError 统一处理）
        }
    };
    __watchHeartbeatTimer = setInterval(tick, WATCH_HEARTBEAT_INTERVAL_MS);
    // [v9.0.11 修复] 立即触发一次心跳：避免首次 setInterval 20s 内的空闲窗口
    // 不等 20s 后再保护 WebSocket，subscribeAll 完成后立即产生网络流量
    setTimeout(tick, 1000);
    console.log('💓 [Watch] 心跳保活已启动（20s 间隔，1s 后首次触发）');
}

function __stopWatchHeartbeat() {
    if (__watchHeartbeatTimer) {
        clearInterval(__watchHeartbeatTimer);
        __watchHeartbeatTimer = null;
    }
}

// [v9.0.10 完善] 统一的 Watch 失败标记（5 处 onError 复用）
// 增加 reason 参数：失败原因分类（'network' / 'sdk_timeout' / 'unknown'），便于诊断面板显示
// 注意：不修改 console.error 级别（用户原话"控制台必须报错"）
function __markWatchFailure(reason) {
    if (__watchFirstFailAt === 0) __watchFirstFailAt = Date.now();
    __watchFailCount++;
    // 记录失败原因
    if (reason) __watchLastReason = reason;
    // 状态机：'ok' → 'degraded'；'degraded' 持续到 8 次失败后由 scheduleWatchReconnect 升级为 'paused'
    if (__watchDegradeStatus === 'ok') {
        __watchDegradeStatus = 'degraded';
    }
    __recordWatchDegrade();
    // [v9.0.10 完善] 触发 UI 实时更新（状态条 + 倒计时）
    if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
}

// [v9.0.10 完善] Watch 重连成功后清零状态
function __markWatchSuccess() {
    if (__watchDegradeStatus !== 'ok' || __watchFailCount > 0) {
        __watchDegradeStatus = 'ok';
        __watchFailCount = 0;
        __watchFirstFailAt = 0;
        __watchLastReason = '';
        __watchSelfHealingCountdown = 60;
        __watchSelfHealingProbeCount = 0;
        __recordWatchDegrade();
        // [v9.0.10 完善] 状态恢复时停止自愈探针 + 倒计时定时器
        __stopWatchSelfHealingProbe();
        __stopSelfHealingCountdownTicker(); // [v9.0.10 修复] 停止倒计时定时器，避免内存泄漏
        if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
    }
}

// [v9.0.10 完善] 启动自愈探针（降级期间后台自动恢复）
// 用户原话"修复优先"：即使降到 paused 状态，也不等用户操作，每 60s 自动尝试探活
// 探活成功 → 立即 unsubscribeAll + subscribeAll 重建 + 状态恢复 🟢
// 探活失败 → 倒计时减 1，永不放弃
function __startWatchSelfHealingProbe() {
    __stopWatchSelfHealingProbe(); // 先清理旧定时器
    if (typeof db === 'undefined' || !db) return;
    if (typeof DAL === 'undefined' || !DAL) return;
    
    __watchSelfHealingCountdown = 60; // 重置倒计时
    console.log('💚 [Watch] 自愈探针已启动（60s 间隔，自动恢复）');
    
    const tick = async () => {
        // 仅在降级状态 + 已登录时执行
        if (__watchDegradeStatus !== 'paused') {
            __stopWatchSelfHealingProbe();
            return;
        }
        if (!isLoggedIn() || typeof DAL === 'undefined' || !DAL) return;
        
        __watchSelfHealingCountdown = 60; // 重置倒计时
        __watchSelfHealingProbeCount++;
        __recordWatchDegrade();
        if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
        
        try {
            // 极轻量探活：让 SDK 重建 WebSocket
            await db.collection('tb_profile').limit(1).get();
            console.log('💚 [Watch] 自愈探针：网络已恢复，重建 Watch...');
            // 探活成功 → 立即重建 Watch
            try {
                await DAL.unsubscribeAll();
                await DAL.subscribeAll();
                // subscribeAll 成功会自动启动心跳保活
                // 标记成功（在 onChange 中不会经过 scheduleWatchReconnect）
                __markWatchSuccess();
                console.log('✅ [Watch] 自愈成功，状态恢复');
                if (typeof showToast === 'function') showToast('✅ Watch 已自动恢复');
            } catch (rebuildErr) {
                console.warn('[Watch] 自愈重建失败，等待下次探活:', rebuildErr?.message);
            }
        } catch (e) {
            // 探活失败（仍断网），倒计时继续
            console.log(`💚 [Watch] 自愈探针：仍断网（已尝试 ${__watchSelfHealingProbeCount} 次），60s 后重试`);
        }
    };
    __watchSelfHealingTimer = setInterval(tick, WATCH_SELF_HEAL_INTERVAL_MS);
    // 立即触发一次（不等 60s，让用户感知到"系统在努力"）
    // setTimeout(tick, 100); // 暂不立即触发，避免连续失败时连续重连
}

function __stopWatchSelfHealingProbe() {
    if (__watchSelfHealingTimer) {
        clearInterval(__watchSelfHealingTimer);
        __watchSelfHealingTimer = null;
    }
    __watchSelfHealingCountdown = 60;
}

// [v9.0.10 完善] 自愈倒计时 UI 实时刷新（每 1s 一次）
// 用户可见：倒计时在状态条中显示，让用户清楚看到"系统在努力恢复"
function __startSelfHealingCountdownTicker() {
    if (__watchCountdownTicker) {
        clearInterval(__watchCountdownTicker);
        __watchCountdownTicker = null;
    }
    __watchCountdownTicker = setInterval(() => {
        if (__watchDegradeStatus === 'paused' && __watchSelfHealingTimer) {
            if (__watchSelfHealingCountdown > 0) {
                __watchSelfHealingCountdown--;
                if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
            }
        }
    }, 1000);
}

function __stopSelfHealingCountdownTicker() {
    if (__watchCountdownTicker) {
        clearInterval(__watchCountdownTicker);
        __watchCountdownTicker = null;
    }
}

// [v9.0.1] 移除 USER_OPERATION_PROTECTION_MS（v8.2.17 引入但 v9.0.0 后未被任何代码使用）
// [v9.0.10 修复] 修复 SyntaxError：lastWatchReconnectAt 已在下面第 1438 行声明，不要重复声明

// [v8.2.16] Watch 注册确认跟踪：记录 .watch() 调用成功的时间
const watchRegistrationTime = {
    task: 0,
    transaction: 0,
    running: 0,
    profile: 0,
    daily: 0
};

// [v7.30.0] Watch 心跳监控：追踪最后一次连接活跃的时间
// [v8.2.17] 语义变更：从"事件驱动"改为"连接驱动"
// 现在 watchLastEventTime 在 watcher 注册成功后立即设为当前时间，
// 在 onError 时被清零。表示"连接建立后无错误的最长容忍时间"。
// 仅在收到 error 事件时才判定断连，而非"无数据变更超时"。
const watchLastEventTime = {
    task: 0,
    transaction: 0,
    running: 0,
    profile: 0,
    daily: 0
};
const WATCH_HEARTBEAT_TIMEOUT_MS = 60000; // [v8.2.17] 连接建立后无错误的最长容忍时间（60秒）

// [v8.2.16] Watch 注册确认超时：.watch() 调用后，即使未收到数据变更事件，也在 5 秒后确认连接活跃
// 修复：解决 Android 端打开后持续显示"连接中"的问题（因为云端无新数据不会触发 onChange）
const WATCH_REGISTRATION_CONFIRM_MS = 5000;

// [v7.34.0] 全局心跳守护：独立于 activeSync 的 watchdog 定时器
// 核心问题：Android 熄屏/PWA 后台时 setInterval 被冻结，心跳检测永不执行
// 解决方案：使用递归 setTimeout + 可见性恢复检查，确保各端都能检测到"半死" WebSocket
// [v8.2.17] 检测逻辑变更：从"无数据变更超时"改为"连接错误超时"，避免误判
let watchHeartbeatTimer = null;
const WATCH_HEARTBEAT_CHECK_INTERVAL = 15000; // 每15秒检查一次心跳

// 启动全局心跳守护（独立于 activeSync）
// [v9.0.11-fix] 限频：1 小时内最多 6 次触发重建，超过进入自愈探针模式
const MAX_WATCHDOG_ACTIONS_PER_HOUR = 6;
let __watchdogActionTimestamps = [];
let __watchdogProbeTimer = null;
let __watchdogActionsInFlight = 0;

function startWatchHeartbeatWatchdog() {
    if (watchHeartbeatTimer) clearTimeout(watchHeartbeatTimer);

    function check() {
        if (!isLoggedIn()) {
            watchHeartbeatTimer = setTimeout(check, WATCH_HEARTBEAT_CHECK_INTERVAL);
            return;
        }

        const now = Date.now();

        // [v8.2.16] 新增：Watch 注册确认超时检查
        // 修复：.watch() 调用后即使未收到数据变更事件，也在超时后确认连接活跃
        for (const key of Object.keys(watchRegistered)) {
            if (watchRegistered[key] && !watchConnected[key] && watchers[key]) {
                const timeSinceRegistration = now - (watchRegistrationTime[key] || 0);
                if (timeSinceRegistration > WATCH_REGISTRATION_CONFIRM_MS) {
                    console.log(`[Watchdog] ${key} 注册已超时 ${Math.floor(timeSinceRegistration/1000)}s，确认连接活跃`);
                    watchConnected[key] = true;
                    // 更新心跳时间，避免立即触发心跳超时检查
                    watchLastEventTime[key] = now;
                }
            }
        }

        // [v8.2.17] 心跳超时检查：从"无事件超时"改为"连接无错误超时"
        // watchLastEventTime 在注册成功后设为当前时间，onError 时清零
        // > 0 且超过阈值 = 连接异常（收到了 error 事件但未触发重建）
        // = 0 = 尚未建立活跃连接或已发生错误，不纳入超时检查
        const staleWatchers = [];
        for (const [key, lastTime] of Object.entries(watchLastEventTime)) {
            if (lastTime > 0 && now - lastTime > WATCH_HEARTBEAT_TIMEOUT_MS) {
                staleWatchers.push(key);
            }
        }
        if (staleWatchers.length > 0) {
            // [v9.0.11-fix] 限频：清理 1h 窗口外的时间戳，超限进入自愈探针模式
            __watchdogActionTimestamps = __watchdogActionTimestamps.filter(t => now - t < 3600_000);
            if (__watchdogActionTimestamps.length >= MAX_WATCHDOG_ACTIONS_PER_HOUR) {
                console.warn(`🐕 [Watchdog] 1h 内已重建 ${__watchdogActionTimestamps.length} 次，暂停自动重建，进入自愈探针模式`);
                __watchDegradeStatus = 'paused';
                __recordWatchDegrade();
                // [v9.0.11-fix] 启动 60s 一次的轻量探针（独立于既有 __startWatchSelfHealingProbe）
                if (!__watchdogProbeTimer) {
                    __watchdogProbeTimer = setInterval(() => {
                        if (!isLoggedIn()) return;
                        if (watchers.task && typeof watchers.task.get === 'function') {
                            try { watchers.task.get(); } catch (_) { /* ignore */ }
                        }
                    }, 60_000);
                }
                updateWatchStatusUI();
                watchHeartbeatTimer = setTimeout(check, WATCH_HEARTBEAT_CHECK_INTERVAL);
                return;
            }
            __watchdogActionTimestamps.push(now);
            console.warn(`🐕 [Watchdog] Watch 心跳超时: ${staleWatchers.join(', ')} 连接异常超过 ${WATCH_HEARTBEAT_TIMEOUT_MS/1000}秒，触发重建+补偿同步 (#${__watchdogActionTimestamps.length}/${MAX_WATCHDOG_ACTIONS_PER_HOUR})`);
            staleWatchers.forEach(key => { watchConnected[key] = false; });
            // [v9.0.11-fix] 用计数器限并发，避免重建未完成又触发
            __watchdogActionsInFlight++;
            checkAndRebuildWatchers(true)
                .catch(err => console.error('[Watchdog] 重建失败:', err))
                .finally(() => { __watchdogActionsInFlight--; });
            // [v9.0.11-fix] 补偿同步延后到 8s（原 2s 太短，未等重建完成就拉增量，会被新 watch 抢资源）
            setTimeout(() => {
                if (__watchdogActionsInFlight === 0) {
                    reconcileCloudAfterWatch('watchdog-timeout').catch(err => console.error('[Watchdog] 补偿同步失败:', err));
                }
            }, 8000);
        }

        // 更新 UI 状态（如果连接状态有变化）
        updateWatchStatusUI();

        watchHeartbeatTimer = setTimeout(check, WATCH_HEARTBEAT_CHECK_INTERVAL);
    }

    watchHeartbeatTimer = setTimeout(check, WATCH_HEARTBEAT_CHECK_INTERVAL);
    console.log('✅ [Watchdog] 全局心跳守护已启动，间隔 15 秒');
}

function stopWatchHeartbeatWatchdog() {
    if (watchHeartbeatTimer) {
        clearTimeout(watchHeartbeatTimer);
        watchHeartbeatTimer = null;
        console.log('⏹️ [Watchdog] 全局心跳守护已停止');
    }
    // [v9.0.11-fix] 同时清理限频探针
    if (__watchdogProbeTimer) {
        clearInterval(__watchdogProbeTimer);
        __watchdogProbeTimer = null;
    }
    __watchdogActionTimestamps = [];
    __watchdogActionsInFlight = 0;
}

// [v9.0.0] 服务端权威写入架构：callMutation 统一变更入口
// 替代 pendingRegistry 机制——客户端不再直接写 DB，无需回声识别
const MUTATION_QUEUE_KEY = 'tb_mutationQueue';
const FAILED_MUTATIONS_KEY = 'tb_failed_mutations'; // [v9.0.2] 失败队列持久化
let mutationQueue = [];
let isFlushingMutations = false;

// [v9.0.2] 错误码标准化（与云函数 tbMutation 对齐）
const MUTATION_ERROR_CODE = {
    SUCCESS: 0,           // 成功
    IDEMPOTENT: 410,      // 幂等（已存在），视为成功
    AUTH: 401,            // 未登录
    NETWORK: 503,         // 网络异常
    RATE_LIMIT: 429,      // 限流
    BUSINESS_GENERIC: 1001, // 业务错误（余额不足等）
    BUSINESS_CONFLICT: 1002, // 数据冲突
    NOT_FOUND: 1003,      // 资源不存在
    PERMISSION: 1004,     // 权限不足
    INTERNAL: 500         // 内部错误
};

// [v9.0.2] 错误码分类：是否值得重试
function isRetryableError(code) {
    return code === 503 || code === 429 || code === 500 || code === undefined;
}

// [v9.0.2] 错误码分类：是否业务错误（不重试，立即通知用户）
function isBusinessError(code) {
    return code === 1001 || code === 1002 || code === 1003 || code === 1004 || code === 401;
}

// [v9.0.2] MutationFailureHandler：统一失败处理模块
const MutationFailureHandler = {
    // 记录失败到持久化队列
    recordFailure(mutation, error, stage) {
        try {
            const failed = this.getFailedMutations();
            const record = {
                mutationId: mutation.mutationId,
                action: mutation.action,
                data: mutation.data,
                error: { code: error?.code, message: error?.message || String(error) },
                stage, // 'call' | 'flush' | 'discarded'
                retryCount: mutation.retryCount || 0,
                failedAt: Date.now()
            };
            failed.unshift(record);
            // 最多保留 50 条
            if (failed.length > 50) failed.length = 50;
            localStorage.setItem(FAILED_MUTATIONS_KEY, JSON.stringify(failed));
            console.warn(`[MutationFailureHandler] 记录失败: ${mutation.action} (${stage})`, error);
        } catch (e) {
            console.error('[MutationFailureHandler] 持久化失败:', e);
        }
    },

    // 读取失败队列
    getFailedMutations() {
        try {
            const raw = localStorage.getItem(FAILED_MUTATIONS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    // 清空失败队列
    clearFailedMutations() {
        try {
            localStorage.removeItem(FAILED_MUTATIONS_KEY);
        } catch (e) {}
    },

    // 删除单条失败记录
    removeFailure(mutationId) {
        try {
            const failed = this.getFailedMutations().filter(f => f.mutationId !== mutationId);
            localStorage.setItem(FAILED_MUTATIONS_KEY, JSON.stringify(failed));
            // [v9.0.5] 同步清理通知去重 Set，防止长会话内存驻留
            this._notifiedIds.delete(mutationId);
        } catch (e) {}
    },

    // 弹窗通知用户（避免重复弹窗）
    _notifiedIds: new Set(),
    notifyUser(mutation, error, stage) {
        if (!mutation || !mutation.mutationId) return;
        if (this._notifiedIds.has(mutation.mutationId)) return;
        this._notifiedIds.add(mutation.mutationId);

        const code = error?.code;
        let title = '❌ 操作失败';
        let body = '';
        if (code === 1001) {
            title = '⚠️ 业务异常';
            body = error?.message || '余额不足或数据不合法';
        } else if (code === 1002) {
            title = '⚠️ 数据冲突';
            body = error?.message || '数据已被其他设备修改';
        } else if (code === 1003) {
            title = '❌ 数据不存在';
            body = error?.message || '资源不存在';
        } else if (code === 1004) {
            title = '🔒 权限不足';
            body = error?.message || '当前账号无权限';
        } else if (code === 503) {
            title = '📡 网络异常';
            body = '操作已加入重试队列，网络恢复后自动重试';
        } else {
            body = error?.message || '请稍后重试';
        }

        // [v9.0.2] 通过 showNotification 弹窗（如果可用）
        if (typeof showNotification === 'function') {
            showNotification(title, body, 'reminder');
        } else {
            console.warn(`[MutationFailureHandler] ${title}: ${body}`);
        }
    },

    // 触发回滚（业务层传入的 onRollback 优先）
    rollback(onRollback, mutation) {
        try {
            if (typeof onRollback === 'function') {
                onRollback();
                console.log(`[MutationFailureHandler] 触发业务回滚: ${mutation?.action}`);
            } else {
                console.warn(`[MutationFailureHandler] 业务未提供 onRollback，UI 可能不一致: ${mutation?.action}`);
            }
        } catch (e) {
            console.error('[MutationFailureHandler] onRollback 执行失败:', e);
        }
    }
};

function saveMutationQueue() {
    try {
        localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(mutationQueue));
    } catch (e) {
        console.warn('[saveMutationQueue] 保存失败:', e);
    }
}

function loadMutationQueue() {
    try {
        const raw = localStorage.getItem(MUTATION_QUEUE_KEY);
        if (raw) {
            mutationQueue = JSON.parse(raw);
            if (mutationQueue.length > 0) {
                console.log(`[loadMutationQueue] 恢复 ${mutationQueue.length} 条待执行变更`);
            }
        }
    } catch (e) {
        console.warn('[loadMutationQueue] 恢复失败:', e);
        mutationQueue = [];
    }
}

async function callMutation(action, data, { onRollback } = {}) {
    if (!isLoggedIn()) {
        console.warn(`[callMutation] 未登录，跳过: ${action}`);
        // [v9.0.2] 未登录也走 onRollback（业务层可清理 UI）
        MutationFailureHandler.rollback(onRollback, { action, data });
        return { code: MUTATION_ERROR_CODE.AUTH, message: '未登录' };
    }

    // [v9.0.3] P2-2: 移除 clientId 注入（云函数已不读取，注入到 mutation data 是冗余）
    const mutation = {
        action,
        data: { ...data },
        mutationId: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdAt: Date.now(),
        retryCount: 0
    };

    if (navigator.onLine !== false) {
        try {
            if (window.qpsLimiter) {
                await window.qpsLimiter.acquire(action, 7);
            }
            const result = await app.callFunction({
                name: 'tbMutation',
                data: mutation
            });
            const res = result.result;
            console.log(`[callMutation] ${action} 结果:`, res?.code, res?.message);

            // [v9.0.2] 区分成功、幂等、失败
            if (res && (res.code === 0 || res.code === MUTATION_ERROR_CODE.IDEMPOTENT)) {
                return res;
            }
            // 业务错误：立即回滚 + 记录 + 通知，不入重试队列
            if (res && isBusinessError(res.code)) {
                console.warn(`[callMutation] 业务错误: ${action}`, res.message);
                MutationFailureHandler.recordFailure(mutation, res, 'call');
                MutationFailureHandler.notifyUser(mutation, res, 'call');
                MutationFailureHandler.rollback(onRollback, mutation);
                return res;
            }
            // 内部错误：回滚 + 记录 + 通知 + 入重试队列
            console.warn(`[callMutation] 云函数拒绝: ${action}`, res.message);
            MutationFailureHandler.recordFailure(mutation, res, 'call');
            MutationFailureHandler.rollback(onRollback, mutation);
            // 继续往下走，加入重试队列
        } catch (err) {
            console.warn(`[callMutation] 调用失败: ${action}`, err.message);
            if (window.qpsLimiter) window.qpsLimiter.recordError(err);
            // [v9.0.2] 网络异常：回滚 + 记录（最终丢弃时通知） + 入重试队列
            MutationFailureHandler.recordFailure(mutation, { code: MUTATION_ERROR_CODE.NETWORK, message: err.message }, 'call');
            MutationFailureHandler.rollback(onRollback, mutation);
            // 继续往下走，加入重试队列
        }
    }

    mutation.retryCount = 0;
    mutationQueue.push(mutation);
    saveMutationQueue();
    console.log(`[callMutation] 已加入离线队列: ${action} (队列长度: ${mutationQueue.length})`);
    return { code: MUTATION_ERROR_CODE.NETWORK, message: '网络异常，已加入重试队列' };
}

async function flushMutationQueue() {
    if (isFlushingMutations || mutationQueue.length === 0 || !isLoggedIn()) return;
    isFlushingMutations = true;

    console.log(`[flushMutationQueue] 开始刷新 ${mutationQueue.length} 条变更`);
    const processed = [];

    while (mutationQueue.length > 0) {
        const mutation = mutationQueue[0];
        // [v9.0.2] 10 次重试后：记录失败 + 通知用户 + 丢弃
        if (mutation.retryCount > 10) {
            console.warn(`[flushMutationQueue] 变更重试超限，丢弃: ${mutation.action}`);
            const errObj = { code: MUTATION_ERROR_CODE.NETWORK, message: '重试超过 10 次，已放弃' };
            MutationFailureHandler.recordFailure(mutation, errObj, 'discarded');
            MutationFailureHandler.notifyUser(mutation, errObj, 'discarded');
            mutationQueue.shift();
            continue;
        }
        // [v9.0.2] 7 天后过期：记录失败 + 通知用户 + 丢弃
        if (Date.now() - mutation.createdAt > 7 * 24 * 3600 * 1000) {
            console.warn(`[flushMutationQueue] 变更已过期，丢弃: ${mutation.action}`);
            const errObj = { code: MUTATION_ERROR_CODE.NETWORK, message: '已超过 7 天未同步，已过期' };
            MutationFailureHandler.recordFailure(mutation, errObj, 'discarded');
            MutationFailureHandler.notifyUser(mutation, errObj, 'discarded');
            mutationQueue.shift();
            continue;
        }
        try {
            if (window.qpsLimiter) {
                await window.qpsLimiter.acquire(mutation.action, 5);
            }
            const result = await app.callFunction({ name: 'tbMutation', data: mutation });
            const res = result.result;
            if (res && (res.code === 0 || res.code === MUTATION_ERROR_CODE.IDEMPOTENT)) {
                // 成功：从失败队列清除（如有）
                MutationFailureHandler.removeFailure(mutation.mutationId);
                mutationQueue.shift();
                processed.push(mutation.action);
            } else if (res && isBusinessError(res.code)) {
                // [v9.0.2] 业务错误：不重试，记录 + 通知 + 丢弃
                console.warn(`[flushMutationQueue] 业务错误，丢弃: ${mutation.action}`, res.message);
                MutationFailureHandler.recordFailure(mutation, res, 'flush');
                MutationFailureHandler.notifyUser(mutation, res, 'flush');
                mutationQueue.shift();
            } else {
                // 可重试错误
                mutation.retryCount++;
                break;
            }
        } catch (err) {
            mutation.retryCount++;
            console.warn(`[flushMutationQueue] 执行失败: ${mutation.action}`, err.message);
            break;
        }
    }
    saveMutationQueue();
    isFlushingMutations = false;

    if (processed.length > 0) {
        console.log(`[flushMutationQueue] 完成 ${processed.length} 条: ${processed.join(', ')}`);
    }
}

// [v7.24.1] Watch 重连与补偿同步节流参数
const WATCH_RECONNECT_MIN_INTERVAL = 10000; // 最小重连间隔 10s
const WATCH_RECONCILE_COOLDOWN = 15000; // 重连后补偿同步冷却 15s
// [v9.0.1] 移除 USER_OPERATION_PROTECTION_MS（v8.2.17 引入但 v9.0.0 后未被任何代码使用）
let lastWatchReconnectAt = 0;
let lastWatchReconcileAt = 0;
let watchReconcileInFlight = false;

// [v7.24.1] Watch 自愈：重连后主动拉全量，补偿可能丢失的增量事件
async function reconcileCloudAfterWatch(source = 'watch') {
    if (!isLoggedIn()) return false;
    if (watchReconcileInFlight) return false;

    const now = Date.now();
    if (now - lastWatchReconcileAt < WATCH_RECONCILE_COOLDOWN) {
        return false;
    }

    watchReconcileInFlight = true;
    lastWatchReconcileAt = now;
    try {
        // [v7.28.0] 增量同步优先：30 分钟内有同步记录时用 fetchDelta（轻量，无需全表加载）
        const timeSinceSyncMs = now - lastCloudSyncAt;
        let syncSuccessful = false;
        
        if (lastCloudSyncAt > 0 && timeSinceSyncMs < 30 * 60 * 1000) {
            const delta = await DAL.fetchDelta(lastCloudSyncAt);
            if (delta !== null) {
                // 成功（delta 为空数组也表示云函数可用且无新数据）
                mergeTransactionDelta(delta);
                syncSuccessful = true;
                console.log(`✅ [Watch] ${source} 增量同步完成 (${delta.length} 条新记录)`);
            } else {
                // null → 云函数未部署，降级到全量同步
                console.log(`[Watch] ${source} 云函数不可用，降级全量同步`);
            }
        }
        
        if (syncSuccessful) {
            // [v8.2.16] 仅在增量同步成功后更新时间戳
            lastCloudSyncAt = Date.now();
            localStorage.setItem('tb_lastCloudSyncAt', String(lastCloudSyncAt));
        } else {
            // 全量同步（首次启动、超过 30 分钟、或云函数不可用时）
            // [v7.29.2] 修复：原写 DAL?.profileObject（DAL 上不存在该属性，永远 falsy），
            // 导致全量同步时始终调用 loadData(true)（读 localStorage 旧缓存）而非 DAL.loadAll()（读云端）
            // 全量同步（首次启动、超过 30 分钟、或云函数不可用时）
            if (DAL?.profileId) {
                await DAL.loadAll();
            } else {
                await loadData(true);
            }
            console.log(`✅ [Watch] ${source} 全量同步完成`);
            return true;
        }
    } catch (e) {
        console.warn(`⚠️ [Watch] ${source} 补偿同步失败:`, e?.message || e);
        return false;
    } finally {
        watchReconcileInFlight = false;
    }
}

// [v7.36.4] 手动同步功能（增强版：分阶段进度反馈 + 动态等待）
// [v8.2.2] 添加整体超时保护，防止任何环节永久挂死
async function manualSync() {
    const btn = document.querySelector('.btn-manual-sync');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.textContent = '⏳'; // 显示沙漏图标
    }

    // [v8.2.2] 整体超时保护（25秒），防止 close() 挂死等导致函数永不返回
    let syncTimeoutId = null;
    const syncPromise = new Promise((_, reject) => {
        syncTimeoutId = setTimeout(() => reject(new Error('manualSync overall timeout')), 25000);
    });

    console.log('🔄 [手动同步] 开始同步...');
    try {
        await Promise.race([_doManualSync(), syncPromise]);
    } finally {
        clearTimeout(syncTimeoutId);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.textContent = '🔄'; // 恢复刷新图标
        }
    }
}

async function _doManualSync() {
    try {
        // [v8.2.6] 如果缓存态显示未登录，先尝试刷新一次，而不是直接放弃
        if (!isLoggedIn()) {
            console.log('[手动同步] 缓存态未登录，尝试刷新登录态...');
            const refreshed = await refreshLoginState();
            if (!refreshed) {
                showToast('⚠️ 登录状态已过期，请重新登录');
                return;
            }
            console.log('[手动同步] 登录态刷新成功，继续同步');
        }

        // 阶段1: 强制重建 Watch
        showToast('🔄 正在重建连接...');
        console.log('[手动同步] 阶段1/3: 重建Watch连接');
        const rebuildStart = Date.now();
        await checkAndRebuildWatchers(true);
        const rebuildDuration = Date.now() - rebuildStart;
        console.log(`[手动同步] Watch重建耗时: ${rebuildDuration}ms`);

        // [v7.37.3] 等待时间从 3 秒增加到 10 秒，确保 WebSocket 握手完成
        // 阶段2: 智能等待 Watch 激活（最多10秒，每秒检查一次）
        showToast('📡 等待连接就绪...');
        console.log('[手动同步] 阶段2/3: 等待Watch激活');
        let activated = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 检查是否所有watcher都已注册且连接
            const allRegistered = Object.values(watchRegistered).every(Boolean);
            const allConnected = Object.values(watchConnected).every(Boolean);
            
            if (allRegistered && allConnected) {
                activated = true;
                console.log(`[手动同步] Watch在第${attempt + 1}秒激活`);
                break;
            }
            
            const statusText = `连接中 ${Object.values(watchConnected).filter(Boolean).length}/${Object.keys(watchConnected).length}`;
            showToast(statusText);
        }

        if (!activated) {
            console.warn('[手动同步] Watch未在10秒内完全激活，强制执行全量加载');
            // [v7.37.3] Watch 未完全连接时，强制全量加载确保数据完整
            showToast('📥 强制全量加载...');
            try {
                if (DAL?.profileId) {
                    await DAL.loadAll();
                } else {
                    await loadData(true);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                const totalTime = ((Date.now() - rebuildStart) / 1000).toFixed(1);
                showToast(`✅ 全量加载完成 (${totalTime}s)`);
                return;
            } catch (e) {
                console.error('[手动同步] 全量加载失败:', e);
                showToast('⚠️ 全量加载失败，请检查网络');
            }
        }

        // 阶段3: 执行补偿同步
        showToast('📥 正在同步数据...');
        console.log('[手动同步] 阶段3/3: 执行补偿同步');
        const syncStart = Date.now();
        const success = await reconcileCloudAfterWatch('manual-sync');
        const syncDuration = Date.now() - syncStart;
        console.log(`[手动同步] 补偿同步耗时: ${syncDuration}ms, 结果: ${success}`);

        if (success) {
            // 刷新 UI
            if (typeof updateAllUI === 'function') updateAllUI();
            const totalTime = ((Date.now() - rebuildStart) / 1000).toFixed(1);
            showToast(`✅ 同步完成 (${totalTime}s)`);
            console.log(`✅ [手动同步] 总耗时: ${totalTime}秒`);
        } else {
            showToast('⚠️ 同步未返回结果，请稍后重试');
            console.warn('[手动同步] reconcileCloudAfterWatch 返回 false');
        }
    } catch (e) {
        console.error('[手动同步] 异常:', e);
        const errorMsg = e?.message || '未知错误';
        showToast(`❌ 同步失败: ${errorMsg}`);
        
        // 提供更详细的错误分类
        if (errorMsg.includes('network') || errorMsg.includes('timeout')) {
            console.error('[手动同步] 网络相关错误，建议检查网络连接');
        } else if (errorMsg.includes('auth') || errorMsg.includes('login')) {
            console.error('[手动同步] 认证相关错误，建议重新登录');
        }
    }
}

// [v7.34.1] 数据差异检测：定期比对云端与本地交易数量/时间戳
let dataDiffTimer = null;
const DATA_DIFF_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
let lastKnownCloudTxCount = 0;
let lastKnownCloudTxMaxUpdateTime = 0;

function startDataDiffDetection() {
    if (dataDiffTimer) clearInterval(dataDiffTimer);

    async function check() {
        if (!isLoggedIn()) return;

        try {
            const res = await db.collection(TABLES.TRANSACTION)
                .orderBy('_updateTime', 'desc')
                .limit(1)
                .field({ _id: true, _updateTime: true })
                .get();

            if (res?.data) {
                const cloudCount = res.total || res.data.length; // total 是总数
                const latestUpdateTime = res.data[0]?._updateTime || 0;

                // 首次记录基准值
                if (lastKnownCloudTxCount === 0) {
                    lastKnownCloudTxCount = cloudCount;
                    lastKnownCloudTxMaxUpdateTime = latestUpdateTime;
                    return;
                }

                // 检测异常：云端有新数据但本地未收到
                if (latestUpdateTime > lastKnownCloudTxMaxUpdateTime) {
                    console.log(`🔍 [数据差异] 云端有新数据 (更新时间: ${new Date(latestUpdateTime).toLocaleTimeString()}), 本地交易数=${transactions.length}`);
                    // 触发补偿同步
                    reconcileCloudAfterWatch('data-diff').catch(err => console.error('[数据差异] 补偿同步失败:', err));
                    lastKnownCloudTxMaxUpdateTime = latestUpdateTime;
                }

                lastKnownCloudTxCount = cloudCount;
            }
        } catch (e) {
            console.warn('[数据差异] 检测失败:', e?.message || e);
        }
    }

    dataDiffTimer = setInterval(check, DATA_DIFF_CHECK_INTERVAL);
    console.log('✅ [数据差异] 检测已启动，间隔 5 分钟');
}

function stopDataDiffDetection() {
    if (dataDiffTimer) {
        clearInterval(dataDiffTimer);
        dataDiffTimer = null;
        console.log('⏹️ [数据差异] 检测已停止');
    }
}

// [v7.9.3] Watch 断线自动重连调度器（带指数退避 + 安全上限）
// [v7.36.4] 增强：添加计数器上限保护、定期重置机制、详细日志
// [v7.37.1] QPS优化：增加全局防抖，防止多个watcher同时重连导致QPS爆发
// [v9.0.1] 移除 v8.2.17 引入的 isSaving / 用户操作保护窗口检查（v9.0.0 后该检查已无意义）
function scheduleWatchReconnect(reason = 'error') {
    // [v7.37.1] 全局防抖：2秒内只允许一次重连请求
    const now = Date.now();
    if (watchReconnectTimers.lastAttempt && (now - watchReconnectTimers.lastAttempt) < 2000) {
        console.log(`[Watch] 全局防抖生效，忽略重连请求 (${reason})，距上次尝试${now - watchReconnectTimers.lastAttempt}ms`);
        return;
    }
    watchReconnectTimers.lastAttempt = now;
    
    // 防止重复调度
    if (watchReconnectTimers.pending) {
        console.log(`[Watch] 已有重连任务 pending，忽略本次请求 (${reason})`);
        return;
    }

    const maxAttempts = Math.max(...Object.values(watchReconnectAttempts));
    
    // [v7.36.4] 安全检查：如果任何计数器超过上限，强制重置并告警
    const exceededKeys = Object.entries(watchReconnectAttempts)
        .filter(([_, count]) => count > MAX_RECONNECT_ATTEMPTS)
        .map(([key]) => key);
    
    if (exceededKeys.length > 0) {
        console.warn(`⚠️ [Watch] 重连计数器超限 (${exceededKeys.join(',')}), 强制重置`);
        Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
        showToast('⚠️ 检测到连接异常，已重置同步状态');
    }

    const cappedAttempts = Math.min(maxAttempts, MAX_RECONNECT_ATTEMPTS);
    const baseDelay = 3000; // 3秒起步
    const backoffDelay = Math.min(baseDelay * Math.pow(1.5, cappedAttempts), 60000); // 最大60秒
    const reconnectGap = Date.now() - lastWatchReconnectAt;
    const minGapDelay = Math.max(0, WATCH_RECONNECT_MIN_INTERVAL - reconnectGap);
    const delay = Math.max(backoffDelay, minGapDelay);

    console.log(`🔄 [Watch] 计划重连 (原因: ${reason}, 尝试次数: ${cappedAttempts}/${MAX_RECONNECT_ATTEMPTS}, 延迟: ${Math.round(delay/1000)}秒)`);
    updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示

    watchReconnectTimers.pending = setTimeout(async () => {
        watchReconnectTimers.pending = null;

        if (!isLoggedIn()) {
            console.log('[Watch] 未登录，取消重连');
            // 未登录时也要重置计数器，避免登录后立即进入高退避状态
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            return;
        }

        // [v7.33.2] 检查是否真的需要重连：registered 和 connected 都要确认
        const needsReconnect = Object.entries(watchRegistered).some(([key, registered]) => !registered)
            || Object.entries(watchConnected).some(([key, connected]) => !connected);
        
        if (!needsReconnect) {
            console.log('[Watch] 所有连接正常，无需重连，重置计数器');
            // 重置计数器
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            updateWatchStatusUI();
            return;
        }

        // [v7.36.4] 记录断开的具体watcher，便于诊断
        const disconnectedDetails = [];
        Object.entries(watchRegistered).forEach(([key, reg]) => {
            if (!reg) disconnectedDetails.push(`${key}(未注册)`);
        });
        Object.entries(watchConnected).forEach(([key, conn]) => {
            if (!conn && watchRegistered[key]) disconnectedDetails.push(`${key}(未激活)`);
        });
        console.log(`🔄 [Watch] 执行重连... 断开项: ${disconnectedDetails.join(', ')}`);

        try {
            lastWatchReconnectAt = Date.now();
            await DAL.subscribeAll();
            await reconcileCloudAfterWatch('reconnect');
            
            // 重置计数器
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            console.log('✅ [Watch] 重连成功，计数器已重置');
            // [v9.0.10] 重连成功 → 状态恢复绿色
            __markWatchSuccess();
            updateWatchStatusUI();
        } catch (e) {
            console.error('❌ [Watch] 重连失败:', e.message || e);
            
            // [v7.36.4] 增加计数器前先检查上限
            Object.keys(watchReconnectAttempts).forEach(k => {
                watchReconnectAttempts[k] = Math.min(watchReconnectAttempts[k] + 1, MAX_RECONNECT_ATTEMPTS);
            });
            
            const currentMax = Math.max(...Object.values(watchReconnectAttempts));
            console.warn(`⚠️ [Watch] 重连失败，当前重试次数: ${currentMax}/${MAX_RECONNECT_ATTEMPTS}`);
            
            // [v9.0.10 完善] 达到 8 次上限：停止自动重连 + 状态变红 + **自愈探针接管**（不等用户操作）
            // 用户原话："修复优先于降级"——降级后系统自动恢复，不把修复责任推给用户
            if (currentMax >= MAX_RECONNECT_ATTEMPTS) {
                __watchDegradeStatus = 'paused'; // [v9.0.10 完善] 改为 'paused'（不是 'down'），强调"暂停"而非"坏"
                __recordWatchDegrade();
                console.error('❌ [Watch] 自动重连已停止（连续 ' + MAX_RECONNECT_ATTEMPTS + ' 次失败），启动自愈探针每 60s 探活');
                if (typeof showToast === 'function') showToast('⚠️ Watch 已暂停自动重连，自愈探针后台恢复中（设置页可查看）');
                // [v9.0.10 完善] 启动自愈探针（关键改进：不等用户操作）
                __startWatchSelfHealingProbe();
                __startSelfHealingCountdownTicker();
                // [v9.0.10 修复] "重置 Watch"按钮已迁移到监听状态显示器，不再需要单独控制 #resetWatchButton
                if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
                updateWatchStatusUI();
                return; // 停止 schedule（不再递归 scheduleWatchReconnect）
            }
            
            scheduleWatchReconnect('retry');
        }
    }, delay);
}

// [v7.9.3] 检查并重建失效的 watchers（页面恢复可见时调用）
// [v7.13.0] 增强：休眠恢复后强制重建所有 watch 连接
// [v7.35.2] 修复：手动触发时彻底销毁旧连接并强制全量同步
// [v9.0.1] 移除 v8.2.17 引入的 isSaving / 用户操作保护窗口检查
async function checkAndRebuildWatchers(forceRebuild = false) {
    // [v8.2.6] 尝试恢复登录态后再检查
    if (!isLoggedIn()) {
        const refreshed = await refreshLoginState();
        if (!refreshed) {
            console.warn('[checkAndRebuildWatchers] 未登录且刷新失败，跳过重建');
            return;
        }
    }

    // [v7.13.0] 如果是从休眠恢复或手动触发，强制重建所有连接
    if (forceRebuild || isRecoveringFromHibernate) {
        console.log('🔄 [Watch] 强制重建所有监听连接');
        
        // [v7.35.2] 关键修复：先彻底销毁旧连接，防止复用损坏的WebSocket
        if (DAL && DAL.unsubscribeAll) {
            try {
                await DAL.unsubscribeAll();
                // 等待500ms确保TCP连接完全关闭
                await new Promise(r => setTimeout(r, 500));
                console.log('✅ [Watch] 旧连接已彻底销毁');
            } catch (e) {
                console.warn('⚠️ [Watch] unsubscribeAll失败:', e.message);
            }
        }
        
        // [v7.33.2] 重置两层状态 + 心跳时间戳
        Object.keys(watchRegistered).forEach(key => watchRegistered[key] = false);
        Object.keys(watchConnected).forEach(key => watchConnected[key] = false);
        Object.keys(watchLastEventTime).forEach(key => watchLastEventTime[key] = 0);
        Object.keys(watchRegistrationTime).forEach(key => watchRegistrationTime[key] = 0);
        updateWatchStatusUI(); // [v7.33.2] 更新监听状态显示
        
        try {
            // 重新建立全新连接
            await DAL.subscribeAll();
            console.log('✅ [Watch] 新连接已建立');
            
            // [v7.35.2] 关键修复：强制全量同步，避免增量查询的时序陷阱
            await DAL.loadAll();
            console.log('✅ [Watch] 全量同步完成');
        } catch (e) {
            console.error('❌ [Watch] 重建监听失败:', e);
            scheduleWatchReconnect('hibernate-rebuild-failed');
        } finally {
            // [v8.2.2] 无论成败都必须重置休眠标志，否则后续调用永远走强制路径
            isRecoveringFromHibernate = false;
        }
        return;
    }

    // [v7.33.2] 检查任意一个 watcher 是否失效（registered 或 connected 任一为 false）
    const disconnectedWatchers = Object.keys(watchRegistered)
        .filter(key => !watchRegistered[key] || !watchConnected[key]);

    if (disconnectedWatchers.length > 0) {
        console.log(`🔄 [Watch] 检测到 ${disconnectedWatchers.length} 个连接异常:`, disconnectedWatchers.join(', '));
        updateWatchStatusUI(); // [v7.33.2] 更新监听状态显示
        try {
            await DAL.subscribeAll();
            await reconcileCloudAfterWatch('rebuild');
            console.log('✅ [Watch] 重建监听成功');
        } catch (e) {
            console.error('❌ [Watch] 重建监听失败:', e);
            scheduleWatchReconnect('rebuild-failed');
        }
    }
}

// [v7.36.4] 定期健康检查：每5分钟检查一次，如果连接正常则重置计数器
let healthCheckTimer = null;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

function startHealthCheck() {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    
    healthCheckTimer = setInterval(() => {
        if (!isLoggedIn()) return;
        
        // 检查所有watcher是否都正常
        const allHealthy = Object.values(watchRegistered).every(Boolean) 
            && Object.values(watchConnected).every(Boolean);
        
        if (allHealthy) {
            // 如果有非零的计数器，重置它们
            const hasNonZero = Object.values(watchReconnectAttempts).some(count => count > 0);
            if (hasNonZero) {
                console.log('🏥 [健康检查] 连接正常，重置重连计数器');
                Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            }
        } else {
            console.log('🏥 [健康检查] 检测到部分连接异常，但不干预自动重连机制');
        }
    }, HEALTH_CHECK_INTERVAL_MS);
    
    console.log('✅ [健康检查] 已启动，间隔 5 分钟');
}

function stopHealthCheck() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
        console.log('⏹️ [健康检查] 已停止');
    }
}

// [v7.37.0] 习惯连胜一致性健康检查
let habitHealthCheckTimer = null;
const HABIT_HEALTH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24小时
let lastHabitHealthCheck = 0;

/**
 * 异步验证所有习惯任务的连胜一致性
 * 在应用启动时自动执行，带24小时节流
 */
async function performHabitHealthCheck() {
    const now = Date.now();
    // 24小时节流
    if (now - lastHabitHealthCheck < HABIT_HEALTH_CHECK_INTERVAL_MS) {
        console.log(`[HabitHealthCheck] ⏭️ 距离上次检查不足24小时，跳过`);
        return;
    }
    
    console.log('[HabitHealthCheck] 🩺 开始习惯连胜一致性检查...');
    lastHabitHealthCheck = now;
    
    try {
        // 等待数据加载完成
        if (!tasks || tasks.length === 0) {
            console.log('[HabitHealthCheck] ⚠️ 任务列表为空，跳过检查');
            return;
        }
        
        const habitTasks = tasks.filter(t => t.isHabit);
        if (habitTasks.length === 0) {
            console.log('[HabitHealthCheck] ✅ 无习惯任务，跳过检查');
            return;
        }
        
        let repairedCount = 0;
        for (const task of habitTasks) {
            const needsRepair = await checkSingleHabitConsistency(task);
            if (needsRepair) {
                // [v7.39.0] 触发 rebuildHabitStreak 来重算连胜
                console.log(`[HabitHealthCheck] 🔧 重建连胜: ${task.name}`);
                if (typeof rebuildHabitStreak === 'function') {
                    rebuildHabitStreak(task);
                }
                repairedCount++;
            }
        }
        
        if (repairedCount > 0) {
            console.log(`[HabitHealthCheck] ✅ 检查完成，修复${repairedCount}个任务`);
            // 触发UI更新
            if (typeof updateAllUI === 'function') {
                setTimeout(() => updateAllUI(), 500);
            }
        } else {
            console.log('[HabitHealthCheck] ✅ 所有习惯任务一致，无需修复');
        }
    } catch (err) {
        console.error('[HabitHealthCheck] ❌ 检查失败:', err);
    }
}

/**
 * 检查单个习惯任务的一致性
 * @returns {boolean} true=需要修复, false=正常
 */

// [v7.39.1] Habit System 3.0 - 辅助函数：获取周期起始日期
function getPeriodStartDatePureHabit(date, period) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (period === 'daily') return d;
    if (period === 'weekly') {
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        return new Date(d.getTime() - diff * 86400000);
    }
    if (period === 'monthly') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (period === 'yearly') return new Date(d.getFullYear(), 0, 1);
    return d;
}

// [v7.39.1] Habit System 3.0 - 从交易历史推导连胜（纯计算，不修改 task）
function computeHabitStreakFromTransactions(task) {
    if (!task || !task.isHabit || !task.habitDetails) {
        return { streak: 0, lastCompletionDate: null, qualifiedPeriodCount: 0 };
    }

    const taskTxs = (typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id))
        ? transactionIndex.get(task.id)
        : transactions.filter(t => t.taskId === task.id);

    const earnTxs = taskTxs
        .filter(t => t.type === 'earn' && !t.undone)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const { period, targetCountInPeriod } = task.habitDetails;
    const targetCount = targetCountInPeriod || 1;
    const isContinuousTarget = (task.type === 'continuous_target');
    const isDurationBased = (task.type === 'continuous' || task.type === 'continuous_redeem');

    const periods = new Map();
    for (const tx of earnTxs) {
        const txDate = new Date(tx.timestamp);
        const periodStart = getPeriodStartDatePureHabit(txDate, period);
        const periodKey = getLocalDateString(periodStart);
        if (!periods.has(periodKey)) {
            periods.set(periodKey, { count: 0, firstTxDate: txDate, isQualified: false });
        }
        const pd = periods.get(periodKey);
        if (isDurationBased) {
            pd.count += Math.max(1, Math.floor((getRawUsageSecondsFromTransaction ? getRawUsageSecondsFromTransaction(tx) : tx.amount * 60) / 60));
        } else if (isContinuousTarget) {
            if (tx.amount >= task.targetTime) pd.count++;
        } else {
            pd.count++;
        }
        if (!pd.isQualified && pd.count >= targetCount) {
            pd.isQualified = true;
        }
    }

    const sorted = Array.from(periods.keys()).sort();
    let streak = 0;
    let lastDateStr = null;
    for (const periodKey of sorted) {
        const pd = periods.get(periodKey);
        if (!pd.isQualified) {
            streak = 0;
            lastDateStr = null;
            continue;
        }
        const cur = new Date(pd.firstTxDate);
        cur.setHours(0, 0, 0, 0);
        if (lastDateStr === null) {
            streak = 1;
        } else {
            const [y, m, d] = lastDateStr.split('-').map(Number);
            const last = new Date(y, m - 1, d);
            const diff = (cur - last) / 86400000;
            let consecutive = false;
            if (period === 'daily') consecutive = (diff === 1);
            else if (period === 'weekly') consecutive = (diff === 7);
            else if (period === 'monthly') consecutive = (cur.getFullYear() * 12 + cur.getMonth()) === (last.getFullYear() * 12 + last.getMonth() + 1);
            streak = consecutive ? streak + 1 : 1;
        }
        lastDateStr = getLocalDateString(cur);
    }

    return { streak, lastCompletionDate: lastDateStr, qualifiedPeriodCount: sorted.length };
}

async function checkSingleHabitConsistency(task) {
    if (!task.isHabit || !task.habitDetails) return false;

    const stored = task.habitDetails;

    // [v7.39.1] 使用纯计算函数重算 streak，与存储值比较
    const computed = computeHabitStreakFromTransactions(task);

    // 1. streak 不一致 → 需要修复
    if (stored.streak !== computed.streak) {
        console.warn(`[HabitHealthCheck] ⚠️ ${task.name}: streak 不一致 (存储=${stored.streak}, 计算=${computed.streak})`);
        return true;
    }

    // 2. lastCompletionDate 不一致 → 需要修复
    if (stored.lastCompletionDate !== computed.lastCompletionDate) {
        console.warn(`[HabitHealthCheck] ⚠️ ${task.name}: lastCompletionDate 不一致 (存储=${stored.lastCompletionDate}, 计算=${computed.lastCompletionDate})`);
        return true;
    }

    // 3. 有 streak 但无任何达标周期 → 需要修复
    if (stored.streak > 0 && computed.qualifiedPeriodCount === 0) {
        console.warn(`[HabitHealthCheck] ⚠️ ${task.name}: streak=${stored.streak} 但无达标周期`);
        return true;
    }

    // 4. streak=0 但最近有达标周期（rebuild 后可恢复）→ 需要修复
    if (stored.streak === 0 && computed.streak > 0) {
        console.warn(`[HabitHealthCheck] ⚠️ ${task.name}: streak=0 但最近有达标周期(${computed.streak})，可恢复`);
        return true;
    }

    return false; // 一致，无需修复
}


/**
 * 启动习惯健康检查定时器
 */
function startHabitHealthCheck() {
    if (habitHealthCheckTimer) clearInterval(habitHealthCheckTimer);
    
    // 立即执行一次（延迟2秒等待数据加载）
    setTimeout(() => performHabitHealthCheck(), 2000);
    
    // 然后每24小时执行一次
    habitHealthCheckTimer = setInterval(() => {
        performHabitHealthCheck();
    }, HABIT_HEALTH_CHECK_INTERVAL_MS);
    
    console.log('✅ [习惯健康检查] 已启动，间隔 24 小时');
}

/**
 * 停止习惯健康检查定时器
 */
function stopHabitHealthCheck() {
    if (habitHealthCheckTimer) {
        clearInterval(habitHealthCheckTimer);
        habitHealthCheckTimer = null;
        console.log('⏹️ [习惯健康检查] 已停止');
    }
}

// [v7.25.4] 主动同步机制：每 30 秒定期检查 Watch 状态并执行补偿同步
let activeSyncInterval = null;
const ACTIVE_SYNC_INTERVAL_MS = 30000; // 30 秒

function startActiveSync() {
    if (activeSyncInterval) {
        clearInterval(activeSyncInterval);
    }
    // [v7.34.0] 启动独立心跳守护（不依赖 activeSync 的 setInterval）
    startWatchHeartbeatWatchdog();
    // [v7.34.0] 启动数据差异检测
    startDataDiffDetection();
    // [v7.36.4] 启动定期健康检查
    startHealthCheck();
    // [v7.37.0] 启动习惯连胜健康检查
    startHabitHealthCheck();
    
    activeSyncInterval = setInterval(function() {
        if (!isLoggedIn()) return;

        // [v7.30.1] 修复 completionCount 与交易记录不一致
        // [v9.0.11-fix] 修 + 写回云端：原版只改内存，下次 loadAll 又读到旧值循环报警
        const __completionFixPromises = [];
        tasks.forEach(task => {
            const txCount = transactions.filter(t => t.taskId === task.id).length;
            const storedCount = task.completionCount || 0;
            if (txCount !== storedCount) {
                console.log(`[completionCount 修复] taskId=${task.id}, 交易数=${txCount}, 存储=${storedCount} → 修正为${txCount}`);
                task.completionCount = txCount;
                __completionFixPromises.push(
                    DAL.saveTask(task).catch(e => console.error(`[completionCount 修复] 写回云端失败: taskId=${task.id}`, e?.message || e))
                );
            }
        });
        if (__completionFixPromises.length > 0) {
            Promise.all(__completionFixPromises).then(() =>
                console.log(`[completionCount 修复] 本轮写回 ${__completionFixPromises.length} 个任务到云端`)
            );
        }

        // [v9.0.0] 刷新离线变更队列
        flushMutationQueue();

        // [v7.34.1] 心跳检测已移至独立 watchdog 定时器（不受 setInterval 冻结影响）

        // 检查是否有 Watch 断连
        var hasDisconnectedWatcher = false;
        var watchValues = Object.values(watchConnected);
        for (var k = 0; k < watchValues.length; k++) {
            if (!watchValues[k]) {
                hasDisconnectedWatcher = true;
                break;
            }
        }

        if (hasDisconnectedWatcher) {
            console.log('🔄 [主动同步] 检测到 Watch 断连，触发重建');
            
            // [v8.2.2] 防御性清理：如果 pending 定时器已存在但重连计数器长时间未变，
            // 说明 scheduleWatchReconnect 可能陷入死锁，强制清理并直接重建
            const registeredCount = Object.values(watchRegistered).filter(Boolean).length;
            const now = Date.now();
            if (registeredCount === 0 && watchReconnectTimers.pending && 
                (now - watchReconnectTimers.lastAttempt > 30000)) {
                console.warn('[主动同步] 检测到重连调度器可能卡死（pending存在但30秒无进展），强制清理');
                clearTimeout(watchReconnectTimers.pending);
                watchReconnectTimers.pending = null;
                watchReconnectTimers.lastAttempt = 0;
                Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            }
            
            checkAndRebuildWatchers(true);
            return;
        }

        // 即使 Watch 正常，也定期补偿同步
        console.log('🔄 [主动同步] 执行定期补偿同步');
        reconcileCloudAfterWatch('active-sync');
    }, ACTIVE_SYNC_INTERVAL_MS);
    console.log('✅ [主动同步] 已启动，间隔 30 秒');
}

function stopActiveSync() {
    if (activeSyncInterval) {
        clearInterval(activeSyncInterval);
        activeSyncInterval = null;
        console.log('⏹️ [主动同步] 已停止');
    }
    // [v7.34.0] 同时停止独立心跳守护
    stopWatchHeartbeatWatchdog();
    // [v7.36.4] 同时停止数据差异检测
    stopDataDiffDetection();
    // [v7.36.4] 同时停止健康检查
    stopHealthCheck();
    // [v7.37.0] 同时停止习惯健康检查
    stopHabitHealthCheck();
}

// ========== v7.37.0 交易索引系统 ==========
/**
 * 构建任务维度的交易索引 Map<taskId, Transaction[]>
 * 用于O(1)查找替代O(n)过滤，大幅提升rebuildHabitStreak性能
 */
function buildTransactionIndex() {
    transactionIndex.clear();
    for (const tx of transactions) {
        if (!tx.taskId) continue;
        if (!transactionIndex.has(tx.taskId)) {
            transactionIndex.set(tx.taskId, []);
        }
        transactionIndex.get(tx.taskId).push(tx);
    }
    console.log(`[TransactionIndex] Built index for ${transactionIndex.size} tasks with ${transactions.length} total transactions`);
}

/**
 * 向索引中添加单条交易
 */
function addToTransactionIndex(tx) {
    if (!tx.taskId) return;
    if (!transactionIndex.has(tx.taskId)) {
        transactionIndex.set(tx.taskId, []);
    }
    const taskTxs = transactionIndex.get(tx.taskId);
    // 防止重复添加（基于clientId+timestamp）
    const exists = taskTxs.some(t => t.clientId === tx.clientId && t.timestamp === tx.timestamp);
    if (!exists) {
        taskTxs.push(tx);
    }
}

/**
 * 从索引中移除交易
 */
function removeFromTransactionIndex(taskId, clientId, timestamp) {
    if (!taskId || !transactionIndex.has(taskId)) return;
    const taskTxs = transactionIndex.get(taskId);
    const idx = taskTxs.findIndex(t => t.clientId === clientId && t.timestamp === timestamp);
    if (idx !== -1) {
        taskTxs.splice(idx, 1);
        // 清理空数组
        if (taskTxs.length === 0) {
            transactionIndex.delete(taskId);
        }
    }
}

// --- 多表 DAL 核心 ---
const DAL = {
    // ========== 初始化 ==========
    async init() {
        console.log('[DAL.init] Starting...');
        
        // 确保有登录状态
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.init] Current UID:', currentUid);
        
        if (!currentUid) {
            console.log('[DAL.init] No user ID, returning false');
            return false;
        }
        
        // 检查是否需要导入数据（新用户）
        const profileExists = await this.checkProfileExists();
        console.log('[DAL.init] Profile exists:', profileExists);
        
        // [v7.9.1] 紧急修复：如果 Profile 不存在，检查其他表是否有数据
        // 如果有数据说明是 Profile 丢失，需要自动重建
        if (!profileExists) {
            console.log('[DAL.init] Profile 不存在，检查其他表是否有数据...');
            try {
                // 检查是否有任务数据
                const taskCheck = await db.collection(TABLES.TASK).limit(1).get();
                const hasTaskData = taskCheck.data && taskCheck.data.length > 0;
                
                // 检查是否有交易数据
                const txCheck = await db.collection(TABLES.TRANSACTION).limit(1).get();
                const hasTxData = txCheck.data && txCheck.data.length > 0;
                
                console.log('[DAL.init] 数据检查: tasks=', hasTaskData, ', transactions=', hasTxData);
                
                if (hasTaskData || hasTxData) {
                    console.warn('[DAL.init] ⚠️ 检测到数据孤儿：有任务/交易但无 Profile，正在自动重建...');
                    
                    // 自动创建 Profile
                    const newProfileId = await this.createEmptyProfile();
                    console.log('[DAL.init] ✅ Profile 自动重建成功，ID:', newProfileId);
                    // [v7.21.1] 移除通知，使用 console 代替
                    return true; // 现在有 Profile 了
                }
            } catch (repairErr) {
                console.error('[DAL.init] Profile 自动修复失败:', repairErr);
            }
        }
        
        return profileExists;
    },
    
    // ========== 检查 Profile 是否存在 ==========
    // [v7.9.2] tb_profile 使用预置规则"读取和修改本人数据"，不需要手动 where
    async checkProfileExists() {
        try {
            const currentUid = await this.getCurrentUid();
            console.log('[DAL.checkProfileExists] Current UID:', currentUid);
            
            if (!currentUid) {
                console.log('[DAL.checkProfileExists] No UID');
                return false;
            }
            
            // [v7.9.2] 预置规则会自动过滤，只需要直接查询
            const res = await db.collection(TABLES.PROFILE)
                .limit(1)
                .get();
            
            console.log('[DAL.checkProfileExists] Found', res.data?.length, 'profiles');
            return res.data && res.data.length > 0;
        } catch (e) {
            console.error('[DAL.checkProfileExists] Error:', e.message, e.code);
            return false;
        }
    },
    
    // ========== 创建空 Profile ==========
    // [v7.9.2] tb_profile 使用预置规则，CloudBase 会自动添加 _openid
    async createEmptyProfile() {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) throw new Error('未登录');
        
        // 预置规则下不需要手动设置 _openid，CloudBase 会自动添加
        const res = await db.collection(TABLES.PROFILE).add({
            multiTableVersion: MULTI_TABLE_VERSION,
            settings: {},
            reportState: {},
            categoryColors: [],
            collapsedCategories: [],
            cachedBalance: 0,
            createdAt: db.serverDate()
        });
        
        console.log('[DAL.createEmptyProfile] Created profile ID:', res.id);
        return res.id;
    },
    
    // ========== 从备份导入数据 (CloudBase 版) ==========
    async importFromBackup(data) {
        console.log('[DAL.importFromBackup] Starting import...');
        
        // [v7.37.1-fix] 启用导入模式：暂停Watch增量更新，避免余额重复计算
        isImportMode = true;
        console.log('🛡️ [DAL.importFromBackup] 已启用导入模式，Watch增量更新已暂停');
        
        // 获取当前用户 UID
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.importFromBackup] Current UID:', currentUid);
            
            if (!currentUid) {
                throw new Error('无法获取用户ID，请重新登录');
            }

            // [v7.22.0] 兼容旧备份：若备份缺少 balanceMode，保留导入前当前状态，避免被默认关闭
        const preImportBalanceMode = { ...balanceMode };
        const importedBalanceMode = (data && typeof data.balanceMode === 'object')
            ? { ...balanceMode, ...data.balanceMode }
            : preImportBalanceMode;
        // [v7.25.0-fix3] 兼容旧备份：若备份缺少 sleepSettings，保留导入前当前设置
        const preImportSleepSettings = { ...sleepSettings };
        const importedSleepSettings = (data && typeof data.sleepSettings === 'object')
            ? { ...sleepSettings, ...data.sleepSettings }
            : preImportSleepSettings;
        if (!importedSleepSettings.lastUpdated) {
            importedSleepSettings.lastUpdated = new Date().toISOString();
        }
        
        setAuthStatus('准备导入...', 'status-syncing');
        // [v9.0.10 修复] 后台同步场景（__tbImportSilentMode=true）不弹模态框，避免卡住
        // 用户主动点击"导入数据"时仍显示模态框
        const __isSilent = window.__tbImportSilentMode === true;
        if (!__isSilent) {
            showImportProgressModal(); // [v7.25.2]
        } else {
            console.log('[DAL.importFromBackup] 静默模式：不弹模态框');
        }

        // 检查数据库是否初始化
        if (!db) {
            if (!__isSilent) closeImportProgressModal(false, '数据库未初始化，请刷新页面重试');
            throw new Error('数据库未初始化，请刷新页面重试');
        }
        
        // [v7.15.4] 导入前先关闭所有 watch 监听，防止删除/新增时触发 watch handler 干扰余额
        console.log('[DAL.importFromBackup] Step 0: Unsubscribing watchers...');
        try { await this.unsubscribeAll(); } catch (e) { console.warn('[DAL.importFromBackup] unsubscribe warning:', e); }
        
        // 1. 清理现有数据（传递 UID 确保一致性，超时 60 秒）
        console.log('[DAL.importFromBackup] Step 1: Clearing existing data with UID:', currentUid);
        updateImportStep('clear', 'running'); // [v7.25.2]
        
        let deletedCount = 0;
        let clearProgress = 0;
        try {
            // [v7.30.1] 优化：缩短超时到 60 秒，增加进度提示
            const clearPromise = (async () => {
                const result = await this.clearAllData(currentUid);
                return result;
            })();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('清理超时（60 秒）')), 60000) // [v7.30.1] 2 分钟改为 60 秒
            );
            deletedCount = await Promise.race([clearPromise, timeoutPromise]);
            console.log('[DAL.importFromBackup] Step 1: Done, deleted', deletedCount, 'docs');
            updateImportStep('clear', 'done', `已删除 ${deletedCount} 条旧数据`); // [v7.25.2]
        } catch (clearErr) {
            console.warn('[DAL.importFromBackup] Clear data warning:', clearErr.message);
            console.warn('[DAL.importFromBackup] Full clear error:', clearErr);
            // 如果清理失败或超时，提示用户
            if (clearErr.message.includes('超时')) {
                isImportMode = false;
                console.log('🛡️ [DAL.importFromBackup] 清理超时，已清除导入模式');
                updateImportStep('clear', 'error', '清理超时'); // [v7.25.2]
                throw new Error('清理旧数据超时，请先在CloudBase控制台手动清空数据后再导入');
            }
            // [v7.25.0-fix3] 数据完整性优先：清理失败时中止导入，避免新旧数据混合
            isImportMode = false;
            console.log('🛡️ [DAL.importFromBackup] 清理失败，已清除导入模式');
            updateImportStep('clear', 'error', clearErr.message); // [v7.25.2]
            throw new Error(`清理旧数据失败：${clearErr.message || clearErr.code || '未知错误'}，请修复后重试导入`);
        }
        
        // 验证 db 对象
        console.log('[DAL.importFromBackup] db object:', db ? 'exists' : 'null');
        console.log('[DAL.importFromBackup] TABLES.PROFILE:', TABLES.PROFILE);
        
        // 2. 创建 Profile
        // [v7.9.2] tb_profile 使用预置规则，CloudBase 会自动添加 _openid
        console.log('[DAL.importFromBackup] Step 2: Creating profile...');
        updateImportStep('profile', 'running'); // [v7.25.2]
        try {
            const profileData = {
                // 预置规则会自动添加 _openid，不需要手动设置
                multiTableVersion: MULTI_TABLE_VERSION,
                settings: data.notificationSettings || {},
                reportState: data.reportState || {},
                balanceMode: importedBalanceMode,
                sleepSettingsShared: importedSleepSettings, // [v7.25.6] 修复：add() 不需要 _.set()
                categoryColors: data.categoryColors || [],
                collapsedCategories: data.collapsedCategories || [],
                deletedTaskCategoryMap: data.deletedTaskCategoryMap || {},
                cachedBalance: data.currentBalance || 0,
                importedAt: new Date().toISOString()
            };
            
            console.log('[DAL.importFromBackup] Profile data to add:', JSON.stringify(profileData).substring(0, 200));
            const addResult = await db.collection(TABLES.PROFILE).add(profileData);
            console.log('[DAL.importFromBackup] Profile add result:', JSON.stringify(addResult));
            updateImportStep('profile', 'done'); // [v7.25.2]
        } catch (profileErr) {
            isImportMode = false;
            console.log('🛡️ [DAL.importFromBackup] Profile错误，已清除导入模式');
            console.error('[DAL.importFromBackup] Profile error:', profileErr);
            updateImportStep('profile', 'error', profileErr.message); // [v7.25.2]
            throw new Error(`创建用户配置失败: ${profileErr.message || profileErr.code || JSON.stringify(profileErr)}`);
        }
        console.log('✅ [DAL] Profile 导入完成');
        
        // 3. 导入 Tasks（受控并发，50条/批）[v7.25.6]
        const oldTasks = data.tasks || [];
        console.log('[DAL.importFromBackup] Tasks to import:', oldTasks.length);
        updateImportStep('tasks', 'running'); // [v7.25.2]

        let taskSuccessCount = 0;
        let taskErrorCount = 0;
        for (let i = 0; i < oldTasks.length; i += 50) {
            const group = oldTasks.slice(i, i + 50);
            await Promise.all(group.map(t =>
                db.collection(TABLES.TASK).add({
                    taskId: t.id,
                    name: t.name,
                    category: t.category,
                    amount: t.amount,
                    unit: t.unit || 'minutes',
                    type: t.type,
                    multiplier: t.multiplier || 1,
                    isHabit: t.isHabit || false,
                    habitDetails: t.habitDetails || null,
                    enableFloatingTimer: t.enableFloatingTimer || false,
                    lastUsed: t.lastUsed || null,
                    isSystem: t.isSystem || false,
                    data: t
                }).then(() => { taskSuccessCount++; })
                .catch(err => { taskErrorCount++; console.error('Task add error:', err.message || err); })
            ));
            if (i + 50 < oldTasks.length) await new Promise(r => setTimeout(r, 100));
        }
        console.log(`✅ [DAL] 任务导入: ${taskSuccessCount} 成功, ${taskErrorCount} 失败`);
        updateImportStep('tasks', 'done', `${taskSuccessCount} 个任务`); // [v7.25.2]
        
        // 4. 导入 Transactions (并行批量)
        const oldTransactions = data.transactions || [];
        console.log(`[DAL.importFromBackup] Starting transaction import, count: ${oldTransactions.length}`);
        updateImportStep('tx', 'running'); // [v7.25.2]
        setAuthStatus(`导入交易 0/${oldTransactions.length}...`, 'status-syncing');
        const _txImportStartTime = Date.now(); // [v7.25.2] 用于计算预计剩余时间
        
        // [v7.25.6] 提速：50条/批，批间100ms，QPS约400~450（上限500）
        // [v7.37.1] QPS优化：降低并发度至20，增加批次间隔至200ms，配合限流器使用
        const CONCURRENT_WRITES = 20;
        const WRITE_BATCH_DELAY = 200; // ms
        const MAX_TX_RETRIES = 3;
        let txSuccessCount = 0;
        let txErrorCount = 0;

        const writeTxWithRetry = async (txData, retries = 0) => {
            try {
                // [v7.37.1] QPS限流：数据导入时使用中等优先级
                if (window.qpsLimiter) {
                    await window.qpsLimiter.acquire('importTransaction', 5);
                }
                
                await db.collection(TABLES.TRANSACTION).add(txData);
                txSuccessCount++;
            } catch (err) {
                // [v7.37.1] QPS限流：记录错误触发自适应降级
                if (window.qpsLimiter) {
                    window.qpsLimiter.recordError(err);
                }
                
                if (retries < MAX_TX_RETRIES) {
                    await new Promise(r => setTimeout(r, 200 * (retries + 1))); // [v7.25.6] 200/400/600ms
                    return writeTxWithRetry(txData, retries + 1);
                }
                txErrorCount++;
                if (txErrorCount <= 5) {
                    console.error(`[DAL] Transaction write failed (tried ${retries + 1}x):`, err.message);
                }
            }
        };

        for (let i = 0; i < oldTransactions.length; i += CONCURRENT_WRITES) {
            const group = oldTransactions.slice(i, i + CONCURRENT_WRITES);
            await Promise.all(group.map(tx => {
                const txData = {
                    _openid: currentUid,
                    txId: tx.id,
                    taskId: tx.taskId,
                    taskName: tx.taskName,
                    category: tx.category || null,
                    amount: tx.amount,
                    type: tx.type,
                    timestamp: tx.timestamp,
                    description: tx.description || '',
                    isStreakAdvancement: tx.isStreakAdvancement || false,
                    isSystem: tx.isSystem || false,
                    data: tx
                };
                return writeTxWithRetry(txData);
            }));

            const progress = i + CONCURRENT_WRITES;
            const shown = Math.min(progress, oldTransactions.length);
            updateImportTxProgress(shown, oldTransactions.length, txErrorCount, _txImportStartTime); // [v7.25.2]
            if (progress % 100 < CONCURRENT_WRITES || progress >= oldTransactions.length) {
                setAuthStatus(`导入交易 ${shown}/${oldTransactions.length}... (失败 ${txErrorCount})`, 'status-syncing');
                console.log(`✅ [DAL] 交易进度: ${shown}/${oldTransactions.length}, 失败: ${txErrorCount}`);
            }
            // 组间延迟，防止 CloudBase QPS 超限
            if (i + CONCURRENT_WRITES < oldTransactions.length) {
                await new Promise(r => setTimeout(r, WRITE_BATCH_DELAY));
            }
        }

        console.log(`✅ [DAL] 交易导入完成: ${txSuccessCount} 成功, ${txErrorCount} 失败`);

        if (txErrorCount > 0 && txSuccessCount === 0) {
            isImportMode = false;
            console.log('🛡️ [DAL.importFromBackup] 交易全部失败，已清除导入模式');
            updateImportStep('tx', 'error', '交易导入全部失败'); // [v7.25.2]
            throw new Error(`交易导入全部失败，请检查 ${TABLES.TRANSACTION} 集合权限`);
        }
        if (txErrorCount > 0) {
            console.warn(`[DAL] ⚠️ ${txErrorCount} 条交易写入失败（已重试 ${MAX_TX_RETRIES} 次）`);
        }
        updateImportStep('tx', 'done', `${txSuccessCount} 条${txErrorCount > 0 ? `（失败 ${txErrorCount}）` : ''}`); // [v7.25.2]
        
        // 5. 导入 DailyChanges（受控并发，避免 QPS 超限）[v7.25.2]
        const oldDaily = data.dailyChanges || {};
        const dailyEntries = Object.entries(oldDaily);
        updateImportStep('daily', 'running'); // [v7.25.2]
        const DAILY_CONCURRENT = 50; // [v7.25.6] 提速：10→50
        for (let i = 0; i < dailyEntries.length; i += DAILY_CONCURRENT) {
            const group = dailyEntries.slice(i, i + DAILY_CONCURRENT);
            await Promise.all(group.map(([date, d]) =>
                db.collection(TABLES.DAILY).add({
                    _openid: currentUid,
                    date: date,
                    earned: d.earned || 0,
                    spent: d.spent || 0
                }).catch(err => console.error('Daily add error:', err.message))
            ));
            if (i + DAILY_CONCURRENT < dailyEntries.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        console.log(`✅ [DAL] ${dailyEntries.length} 条日汇总导入完成`);
        updateImportStep('daily', 'done', `${dailyEntries.length} 天`); // [v7.25.2]
        
        console.log('🎉 [DAL] 数据导入完成！');
        setAuthStatus('导入完成 ✅', 'status-online');
        
        // 直接应用导入的数据到内存，避免数据库延迟问题
        profileData = {
            multiTableVersion: MULTI_TABLE_VERSION,
            settings: data.notificationSettings || {},
            reportState: data.reportState || {},
            balanceMode: importedBalanceMode,
            sleepSettingsShared: importedSleepSettings,
            categoryColors: data.categoryColors || [],
            collapsedCategories: data.collapsedCategories || [],
            deletedTaskCategoryMap: data.deletedTaskCategoryMap || {},
            cachedBalance: data.currentBalance || 0
        };
        tasks = oldTasks;
        transactions = oldTransactions;
        runningTasks = new Map();
        // [v9.1.0] 导入备份时：用户主动从本地导入，dailyChanges 来自导入数据（合法入口）
        // 导入后云端 tb_daily 通过 importFromBackup 内部 add 完成（line 2613-2620）
        dailyChanges = oldDaily;
        deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(data.deletedTaskCategoryMap);
        currentBalance = data.currentBalance || 0;
        balanceMode = { ...balanceMode, ...importedBalanceMode };
        applySleepSettingsFromCloud(importedSleepSettings, 'import', true);
        // [v7.8.2] notificationSettings 改为纯本地存储（v7.1.7），不从备份恢复
        // notificationSettings 保持当前值，由 loadNotificationSettings() 从 localStorage 加载
        setCategoryColors(data.categoryColors || []);
        setCollapsedCategories(data.collapsedCategories || []);
        hasCompletedFirstCloudSync = true;
        updateBalanceModeUI();
        
        // 启动实时监听
        await this.subscribeAll();
        
        // [v7.37.1-fix] 导入成功，清除导入模式标志
        isImportMode = false;
        console.log('🛡️ [DAL.importFromBackup] 导入完成，已清除导入模式');
        
        return true; // 返回成功标志
    },
    
    // ========== 获取当前用户 UID ==========
    // 注意: CloudBase 预置规则 "读取和修改本人数据" 使用 auth.openid
    // 邮箱登录时 openid 等于 uid，但需要确保一致性
    async getCurrentUid() {
        // 诊断: 打印所有可用的 ID 字段
        const logUserIds = (source, userObj) => {
            console.log(`[getCurrentUid] ${source}:`, {
                uid: userObj?.uid,
                openid: userObj?.openid,
                id: userObj?.id,
                sub: userObj?.sub,
                user_id: userObj?.user_id,
                _id: userObj?._id
            });
        };
        
        // 优先使用缓存
        if (cachedLoginState?.user) {
            const userObj = cachedLoginState.user;
            logUserIds('cachedLoginState', userObj);
            // 优先使用 uid（邮箱登录场景）
            return userObj.uid || userObj.openid || userObj.id || userObj.sub || userObj.user_id;
        }
        
        // 尝试异步获取
        try {
            const state = await auth.getLoginState();
            if (state?.user) {
                const userObj = state.user;
                logUserIds('getLoginState', userObj);
                return userObj.uid || userObj.openid || userObj.id || userObj.sub || userObj.user_id;
            }
        } catch (e) {
            console.warn('[DAL.getCurrentUid] getLoginState error:', e);
        }
        
        // 尝试同步方法
        const syncState = auth.hasLoginState();
        if (syncState?.user) {
            const userObj = syncState.user;
            logUserIds('hasLoginState', userObj);
            return userObj.uid || userObj.openid || userObj.id || userObj.sub || userObj.user_id;
        }
        
        // 尝试 currentUser
        if (auth.currentUser) {
            logUserIds('currentUser', auth.currentUser);
            return auth.currentUser.uid || auth.currentUser.openid || auth.currentUser.id;
        }
        
        return null;
    },
    
    // ========== 清理所有数据 ==========
    // [v7.9.2] 根据安全规则区分查询方式
    // 预置规则的表（tb_profile, tb_task, tb_running）：不需要 where
    // 自定义规则的表（tb_transaction, tb_daily）：需要 where
    async clearAllData(uidOverride = null) {
        console.log('[DAL.clearAllData] Starting...');
        
        // 获取当前用户 UID（用于自定义规则的表）
        const currentUid = uidOverride || await this.getCurrentUid();
        console.log('[DAL.clearAllData] Using UID:', currentUid);
        
        if (!currentUid) {
            console.error('[DAL.clearAllData] No UID, cannot clear data!');
            throw new Error('无法获取用户ID，无法清理数据');
        }
        
        // 预置规则的表（不需要 where 条件，用 get+remove 逐条）
        const presetRuleTables = [TABLES.PROFILE, TABLES.TASK, TABLES.RUNNING];
        // 自定义规则的表（需要 where 条件，可用 where().remove() 批量删除）
        const customRuleTables = [TABLES.TRANSACTION, TABLES.DAILY];
        let totalDeleted = 0;
        
        // [v7.15.2] 优化：自定义规则表使用 where().remove() 批量删除（单次API调用）
        for (const col of customRuleTables) {
            console.log(`[DAL.clearAllData] Batch removing: ${col}`);
            setAuthStatus(`清理 ${col}...`, 'status-syncing');
            try {
                // where().remove() 一次性删除所有匹配文档
                const result = await db.collection(col).where({ _openid: currentUid }).remove();
                const deleted = result?.deleted || result?.stats?.removed || 0;
                console.log(`[DAL.clearAllData] ${col}: batch deleted ${deleted} docs`);
                totalDeleted += deleted;
            } catch (e) {
                console.warn(`[DAL.clearAllData] Batch remove failed for ${col}, falling back to loop:`, e.message);
                // 降级：逐条删除
                let loopCount = 0;
                while (loopCount < 50) {
                    loopCount++;
                    const res = await db.collection(col).where({ _openid: currentUid }).limit(200).get();
                    if (!res.data?.length) break;
                    await Promise.allSettled(res.data.map(doc => db.collection(col).doc(doc._id).remove()));
                    totalDeleted += res.data.length;
                }
            }
        }
        
        // 预置规则表：需要先查询再逐条删除（预置规则不支持 where().remove()）
        for (const col of presetRuleTables) {
            let deletedCount = 0;
            let loopCount = 0;
            
            console.log(`[DAL.clearAllData] Processing: ${col}`);
            setAuthStatus(`清理 ${col}...`, 'status-syncing');
            
            while (loopCount < 50) {
                loopCount++;
                try {
                    const res = await db.collection(col).limit(200).get();
                    if (!res.data?.length) break;
                    console.log(`[DAL.clearAllData] ${col} loop ${loopCount}: deleting ${res.data.length} docs`);
                    // [v7.15.2] 提升并发到 50
                    const CONCURRENT_LIMIT = 50;
                    for (let i = 0; i < res.data.length; i += CONCURRENT_LIMIT) {
                        const batch = res.data.slice(i, i + CONCURRENT_LIMIT);
                        await Promise.allSettled(batch.map(doc => db.collection(col).doc(doc._id).remove()));
                    }
                    deletedCount += res.data.length;
                } catch (e) {
                    console.error(`[DAL.clearAllData] Error on ${col}:`, e.message);
                    break;
                }
            }
            
            console.log(`[DAL.clearAllData] ${col}: deleted ${deletedCount} docs total`);
            totalDeleted += deletedCount;
        }
        
        // 清空缓存
        this.profileId = null;
        this.profileData = null;
        this.taskCache.clear();
        this.transactionCache.clear();
        this.runningCache.clear();
        this.dailyCache.clear();
        
        console.log(`✅ [DAL.clearAllData] Complete! Total deleted: ${totalDeleted}`);
        return totalDeleted;
    },
    
    // ========== Profile 操作 ==========
    profileId: null,
    profileData: null,
    
    async loadProfile() {
        console.log('[DAL.loadProfile] Starting...');
        
        // 获取当前用户 UID
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.loadProfile] Current UID:', currentUid);
        
        if (!currentUid) {
            console.error('[DAL.loadProfile] No UID available!');
            return null;
        }
        
        try {
            // [v7.9.2] tb_profile 使用预置规则，不需要 where 条件
            const res = await db.collection(TABLES.PROFILE)
                .limit(1)
                .get();
            
            console.log('[DAL.loadProfile] Query result:', res.data?.length, 'docs');
            
            if (res.data && res.data.length > 0) {
                const doc = res.data[0];
                this.profileId = doc._id || doc.id;
                this.profileData = doc;
                console.log('[DAL.loadProfile] Found profile, ID:', this.profileId);
                return this.profileData;
            }
            console.log('[DAL.loadProfile] No profile found');
            return null;
        } catch (err) {
            console.error('[DAL.loadProfile] Error:', err.message, err.code);
            throw err;
        }
    },
    
    async saveProfile(data) {
        if (!this.profileId) {
            await this.loadProfile();
        }
        if (!this.profileId) {
            throw new Error('Profile 不存在');
        }

        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        // [v9.0.2] 保存 profile 快照用于回滚
        const profileSnapshot = this.profileData ? JSON.parse(JSON.stringify(this.profileData)) : null;

        callMutation('saveProfile', {
            _openid: currentUid,
            profileId: this.profileId,
            data: data
        }, {
            onRollback: () => {
                // 回滚：恢复 profile 到修改前
                if (profileSnapshot && this.profileData) {
                    this.profileData = profileSnapshot;
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                console.log('[DAL.saveProfile] 已回滚 profile 乐观修改');
            }
        });

        for (const [key, value] of Object.entries(data)) {
            const actualValue = value && typeof value === 'object' && '$set' in value ? value.$set : value;
            if (key.includes('.')) {
                const parts = key.split('.');
                let obj = this.profileData;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
                    obj = obj[parts[i]];
                }
                obj[parts[parts.length - 1]] = actualValue;
            } else {
                this.profileData[key] = actualValue;
            }
        }
        console.log('[DAL.saveProfile] ✅ 已提交云函数');
        return this.profileData;
    },
    
    // ========== Task 操作 ==========
    taskCache: new Map(), // taskId -> _id (CloudBase doc id)
    
    // [v7.9.2] tb_task 使用预置规则"读取和修改本人数据"，不需要手动 where
    async loadAllTasks() {
        const currentUid = await this.getCurrentUid();
        
        if (!currentUid) {
            console.error('[DAL.loadAllTasks] 无法获取 UID!');
            // [v7.9.7] 仅安卓端尝试从本地缓存恢复
            if (USE_LOCAL_CACHE) {
                try {
                    const localData = JSON.parse(localStorage.getItem('timeBankData') || '{}');
                    if (localData.tasks && localData.tasks.length > 0) {
                        console.log(`[DAL.loadAllTasks] 从本地缓存恢复 ${localData.tasks.length} 个任务`);
                        return localData.tasks;
                    }
                } catch (e) {
                    console.warn('[DAL.loadAllTasks] 本地缓存恢复失败:', e);
                }
            }
            return [];
        }
        
        // 分页加载所有任务
        const PAGE_SIZE = 1000;
        const MAX_PAGES = 5;
        let allDocs = [];
        let lastDocId = null;
        
        console.log('[DAL.loadAllTasks] 开始加载...');
        
        try {
        for (let page = 0; page < MAX_PAGES; page++) {
            // [v7.9.2] 预置规则会自动过滤，不需要 where(_openid)
            let query = db.collection(TABLES.TASK);
            
            if (lastDocId) {
                query = query.where({ _id: _.gt(lastDocId) });
            }
            
            const res = await query
                .orderBy('_id', 'asc')
                .limit(PAGE_SIZE)
                .get();
            
            const docs = res.data || [];
            console.log(`[DAL.loadAllTasks] Page ${page + 1}: got ${docs.length} tasks`);
            
            if (docs.length === 0) break;
            
            allDocs = allDocs.concat(docs);
            
            if (docs.length < PAGE_SIZE) break;
            
            lastDocId = docs[docs.length - 1]._id;
        }
        
        console.log('[DAL.loadAllTasks] Total:', allDocs.length, 'tasks');
        
        this.taskCache.clear();
        const taskMap = new Map();
        
        // 去重逻辑
        allDocs.forEach((doc, idx) => {
            // 调试：打印文档结构
            if (idx === 0) {
                console.log('[DAL.loadAllTasks] 文档结构示例:', JSON.stringify(Object.keys(doc)));
                console.log('[DAL.loadAllTasks] doc._id =', doc._id);
                console.log('[DAL.loadAllTasks] doc.id =', doc.id);
                console.log('[DAL.loadAllTasks] doc._openid =', doc._openid);
            }
            
            const task = doc.data || {
                id: doc.taskId,
                name: doc.name,
                category: doc.category,
                amount: doc.amount,
                unit: doc.unit,
                type: doc.type,
                multiplier: doc.multiplier,
                isHabit: doc.isHabit,
                habitDetails: doc.habitDetails,
                enableFloatingTimer: doc.enableFloatingTimer,
                lastUsed: doc.lastUsed,
                isSystem: doc.isSystem
            };
            
            // 获取文档 ID（兼容不同字段名）
            const docId = doc._id || doc.id;
            
            if (taskMap.has(task.id)) {
                // [v9.0.1] 移除 v8.2.x 时代的客户端直接 db.remove()：v9.0.0 服务端权威写入架构下，
                // 重复检测由云函数 addTransaction / saveTask 的幂等检查保证（v9.0.0 已加），客户端
                // 不应再直接删 DB（可能与 v8.2.15 跨设备 running 保护产生竞态，误删有效数据）。
                // 重复数据保留在内存缓存中时，以首次出现的为准。
            } else {
                taskMap.set(task.id, { task, docId: docId });
            }
        });
        
        const tasks = [];
        taskMap.forEach(({ task, docId }) => {
            this.taskCache.set(task.id, docId);
            console.log('[DAL.loadAllTasks] 缓存任务:', task.id, '->', docId);
            tasks.push(task);
        });
        
        return tasks;
        } catch (queryError) {
            // [v7.9.0] 数据库查询失败时，尝试从本地缓存恢复
            console.error('[DAL.loadAllTasks] 数据库查询失败:', queryError.message, queryError.code);
            // [v7.9.7] 仅安卓端尝试从本地缓存恢复
            if (USE_LOCAL_CACHE) {
                try {
                    const localData = JSON.parse(localStorage.getItem('timeBankData') || '{}');
                    if (localData.tasks && localData.tasks.length > 0) {
                        console.log(`[DAL.loadAllTasks] 查询失败，从本地缓存恢复 ${localData.tasks.length} 个任务`);
                        return localData.tasks;
                    }
                } catch (e) {
                    console.warn('[DAL.loadAllTasks] 本地缓存也恢复失败:', e);
                }
            }
            return [];
        }
    },
    
    async saveTask(task) {
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.saveTask] 保存任务:', task.id, task.name);

        if (!currentUid) throw new Error('未登录，无法保存任务');

        const safeHabitDetails = task.habitDetails ? { ...task.habitDetails } : {};
        const finalHabitDetails = task.isHabit ? safeHabitDetails : {};

        // [v9.0.5] 保存快照用于回滚：取修改前的任务
        const prevTaskSnapshot = tasks.find(t => t.id === task.id);
        const prevTask = prevTaskSnapshot ? { ...prevTaskSnapshot } : null;

        const taskData = {
            taskId: task.id,
            name: task.name,
            category: task.category,
            amount: task.amount,
            unit: task.unit || 'minutes',
            type: task.type,
            multiplier: task.multiplier || 1,
            isHabit: task.isHabit || false,
            habitDetails: finalHabitDetails,
            enableFloatingTimer: task.enableFloatingTimer || false,
            lastUsed: task.lastUsed || null,
            isSystem: task.isSystem || false,
            // [v9.0.11-fix] 把 completionCount 提升为顶层字段（与云函数 tbMutation.saveTask 对齐）
            // 原因：v7.30.1 的"修复"循环只改内存，每次 loadAll 又读到旧值，循环报警
            // 现在 saveTask 把 completionCount 写入 taskData 顶层，云端能正确持久化
            completionCount: task.completionCount || 0,
            data: JSON.parse(JSON.stringify(task, (key, value) => {
                if (key === '_openid' || key === '_id') return undefined;
                if (key === 'habitDetails' && value === null) return {};
                return value;
            }))
        };

        callMutation('saveTask', { _openid: currentUid, ...taskData }, {
            onRollback: () => {
                // [v9.0.5] 回滚：恢复旧任务（或删除新建任务）
                const idx = tasks.findIndex(t => t.id === task.id);
                if (idx !== -1) {
                    tasks.splice(idx, 1);
                }
                if (prevTask) {
                    tasks.push(prevTask);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                console.log(`[DAL.saveTask] 已回滚任务 ${task.id}`);
            }
        });
        console.log('[DAL.saveTask] ✅ 已提交云函数');
    },

    async deleteTask(taskId) {
        console.log('[DAL.deleteTask] 删除任务:', taskId);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        // [v9.0.5] 保存快照用于回滚：被删除的任务应可恢复
        const snapshot = tasks.find(t => t.id === taskId);
        const prevTask = snapshot ? { ...snapshot } : null;

        callMutation('deleteTask', { _openid: currentUid, taskId }, {
            onRollback: () => {
                // [v9.0.5] 回滚：恢复被删除的任务
                const idx = tasks.findIndex(t => t.id === taskId);
                if (idx === -1 && prevTask) {
                    tasks.push(prevTask);
                    console.log(`[DAL.deleteTask] 已回滚删除任务 ${taskId}`);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
            }
        });
        console.log('[DAL.deleteTask] ✅ 已提交云函数');
    },
    
    // ========== Transaction 操作 ==========
    transactionCache: new Map(), // txId -> _id
    
    async loadAllTransactions() {
        // [v7.9.0] 添加重试机制，防止因 UID 获取失败导致返回空数组
        let currentUid = null;
        const MAX_UID_RETRIES = 5;
        for (let i = 0; i < MAX_UID_RETRIES; i++) {
            currentUid = await this.getCurrentUid();
            if (currentUid) break;
            console.warn(`[DAL.loadAllTransactions] UID 获取失败，第 ${i + 1} 次重试...`);
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log('[DAL.loadAllTransactions] 使用 UID:', currentUid);
        
        if (!currentUid) {
            console.error('[DAL.loadAllTransactions] 重试后仍无法获取 UID!');
            // [v7.9.7] 仅安卓端尝试从本地缓存恢复
            if (USE_LOCAL_CACHE) {
                try {
                    const localData = JSON.parse(localStorage.getItem('timeBankData') || '{}');
                    if (localData.transactions && localData.transactions.length > 0) {
                        console.log(`[DAL.loadAllTransactions] 从本地缓存恢复 ${localData.transactions.length} 条交易记录`);
                        return localData.transactions;
                    }
                } catch (e) {
                    console.warn('[DAL.loadAllTransactions] 本地缓存恢复失败:', e);
                }
            }
            return [];
        }
        
        // 分页加载所有交易（每次 1000 条，直到没有更多数据）
        const PAGE_SIZE = 1000;
        let allDocs = [];
        let lastTimestamp = null;
        let pageCount = 0;
        const MAX_PAGES = 20; // 最多 20 页，即 20000 条
        
        try {
        while (pageCount < MAX_PAGES) {
            pageCount++;
            let query = db.collection(TABLES.TRANSACTION)
                .where({ _openid: currentUid })
                .orderBy('timestamp', 'desc')
                .limit(PAGE_SIZE);
            
            // 如果有上一页的最后时间戳，使用它来分页
            if (lastTimestamp) {
                query = db.collection(TABLES.TRANSACTION)
                    .where({ _openid: currentUid, timestamp: _.lt(lastTimestamp) })
                    .orderBy('timestamp', 'desc')
                    .limit(PAGE_SIZE);
            }
            
            const res = await query.get();
            const docs = res.data || [];
            
            if (docs.length === 0) break;
            
            allDocs = allDocs.concat(docs);
            lastTimestamp = docs[docs.length - 1].timestamp;
            
            console.log(`[DAL.loadAllTransactions] Page ${pageCount}: ${docs.length} docs, total: ${allDocs.length}`);
            
            if (docs.length < PAGE_SIZE) break; // 最后一页
        }
        
        console.log('[DAL.loadAllTransactions] Total loaded:', allDocs.length, 'transactions');
        
        this.transactionCache.clear();
        const txMap = new Map();
        
        // 去重逻辑
        allDocs.forEach(doc => {
            const tx = doc.data || {
                id: doc.txId,
                taskId: doc.taskId,
                taskName: doc.taskName,
                category: doc.category,
                amount: doc.amount,
                type: doc.type,
                timestamp: doc.timestamp,
                description: doc.description,
                isStreakAdvancement: doc.isStreakAdvancement,
                isSystem: doc.isSystem,
                sleepData: doc.sleepData,
                napData: doc.napData
            };
            
            // [v7.14.0] 修复：确保 sleepData 时间戳是数字（云端可能存储为字符串）
            if (tx.sleepData) {
                if (tx.sleepData.startTime !== undefined) {
                    tx.sleepData.startTime = Number(tx.sleepData.startTime);
                }
                if (tx.sleepData.wakeTime !== undefined) {
                    tx.sleepData.wakeTime = Number(tx.sleepData.wakeTime);
                }
                if (tx.sleepData.durationMinutes !== undefined) {
                    tx.sleepData.durationMinutes = Number(tx.sleepData.durationMinutes);
                }
            }
            if (tx.napData) {
                if (tx.napData.startTime !== undefined) {
                    tx.napData.startTime = Number(tx.napData.startTime);
                }
                if (tx.napData.endTime !== undefined) {
                    tx.napData.endTime = Number(tx.napData.endTime);
                }
            }
            // [v7.16.0] 向后兼容：将旧 napData 记录规范化为 sleepData 格式
            if (tx.napData && !tx.sleepData) {
                tx.sleepData = {
                    startTime: tx.napData.startTime,
                    wakeTime: tx.napData.endTime,
                    durationMinutes: tx.napData.durationMinutes || tx.napData.duration,
                    sleepType: 'nap',
                    _migratedFromNapData: true
                };
            }
            
            if (txMap.has(tx.id)) {
                // [v9.0.1] 移除 v8.2.x 时代的客户端直接 db.remove()：见 loadAllTasks 同款注释
            } else {
                txMap.set(tx.id, { tx, docId: doc._id });
            }
        });
        
        const transactions = [];
        txMap.forEach(({ tx, docId }) => {
            this.transactionCache.set(tx.id, docId);
            transactions.push(tx);
        });
        
        transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return transactions;
        } catch (queryError) {
            // [v7.9.0] 数据库查询失败时，尝试从本地缓存恢复
            console.error('[DAL.loadAllTransactions] 数据库查询失败:', queryError.message, queryError.code);
            // [v7.9.7] 仅安卓端尝试从本地缓存恢复
            if (USE_LOCAL_CACHE) {
                try {
                    const localData = JSON.parse(localStorage.getItem('timeBankData') || '{}');
                    if (localData.transactions && localData.transactions.length > 0) {
                        console.log(`[DAL.loadAllTransactions] 查询失败，从本地缓存恢复 ${localData.transactions.length} 条交易记录`);
                        return localData.transactions;
                    }
                } catch (e) {
                    console.warn('[DAL.loadAllTransactions] 本地缓存也恢复失败:', e);
                }
            }
            return [];
        }
    },
    
    async addTransaction(tx) {
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.addTransaction] 开始写入交易:', tx.id, tx.taskName, tx.amount, 'UID:', currentUid);

        if (!currentUid) {
            throw new Error('未登录，无法保存交易');
        }

        // [v9.0.2] 保存交易快照用于回滚（仅在失败时移除）
        const txId = tx.id;
        const txAmount = tx.amount;
        const txType = tx.type;

        // [v9.0.0] 服务端权威写入：通过云函数写入，不再直接操作 DB
        // [v9.0.2] 注入 onRollback：失败时回滚乐观 UI（移除交易 + 修正余额）
        callMutation('addTransaction', {
            _openid: currentUid,
            txId: tx.id,
            taskId: tx.taskId,
            taskName: tx.taskName,
            category: tx.category || null,
            amount: tx.amount,
            type: tx.type,
            timestamp: tx.timestamp,
            description: tx.description || '',
            isStreakAdvancement: tx.isStreakAdvancement || false,
            isSystem: tx.isSystem || false,
            rawSeconds: tx.rawSeconds,
            data: tx
        }, {
            onRollback: () => {
                // 移除乐观添加的交易
                const idx = transactions.findIndex(t => t.id === txId);
                if (idx !== -1) {
                    transactions.splice(idx, 1);
                }
                // [v9.0.7] 同步清理交易索引，防止 addToTransactionIndex 残留
                // 之前 onRollback 仅删 transactions 数组，索引残留导致后续 rebuildHabitStreak
                // 用 transactionIndex 路径时仍读到已"删除"的交易，数据漂移
                if (typeof removeFromTransactionIndex === 'function' && tx.taskId) {
                    removeFromTransactionIndex(tx.taskId, tx.clientId, tx.timestamp);
                }
                // 修正余额
                const delta = txType === 'earn' ? -txAmount : txAmount;
                if (typeof currentBalance === 'number') {
                    currentBalance += delta;
                }
                // 刷新 UI
                if (typeof updateAllUI === 'function') {
                    updateAllUI();
                }
                console.log(`[DAL.addTransaction] 已回滚交易 ${txId}，余额修正 ${delta}`);
            }
        });

        console.log('[DAL.addTransaction] ✅ 已提交云函数，乐观UI已更新:', tx.id);
        return tx.id;
    },

    async updateTransaction(tx, prevTx = null) {
        console.log('[DAL.updateTransaction] 开始更新交易:', tx.id);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) throw new Error('未登录，无法更新交易');

        // [v9.0.5] 保存快照用于回滚：使用传入的 prevTx 或从本地索引读取
        const snapshot = prevTx || transactions.find(t => t.id === tx.id) || null;

        callMutation('updateTransaction', {
            _openid: currentUid,
            txId: tx.id,
            taskId: tx.taskId,
            taskName: tx.taskName,
            category: tx.category || null,
            amount: tx.amount,
            type: tx.type,
            timestamp: tx.timestamp,
            description: tx.description || '',
            isStreakAdvancement: tx.isStreakAdvancement || false,
            isSystem: tx.isSystem || false,
            rawSeconds: tx.rawSeconds,
            balanceAdjust: tx.balanceAdjust || null,
            data: tx,
            prevTx: prevTx
        }, {
            onRollback: () => {
                // [v9.0.5] 回滚：恢复旧值（或删除新建值），修正余额差量
                const idx = transactions.findIndex(t => t.id === tx.id);
                if (idx !== -1) {
                    transactions.splice(idx, 1);
                }
                if (snapshot) {
                    transactions.push({ ...snapshot });
                    // [v9.0.7] 同步恢复交易索引：用快照的 taskId/clientId/timestamp
                    // 如果快照的 taskId 与当前 tx.taskId 不一致（跨任务修改），需要先删旧再恢复
                    if (typeof removeFromTransactionIndex === 'function') {
                        removeFromTransactionIndex(tx.taskId, tx.clientId, tx.timestamp);
                    }
                    if (typeof addToTransactionIndex === 'function' && snapshot.taskId) {
                        addToTransactionIndex(snapshot);
                    }
                }
                // 余额差量：new 产生的效果 - old 产生的效果，取反实现回滚
                const newEffect = tx.type === 'earn' ? tx.amount : -tx.amount;
                const oldEffect = snapshot
                    ? (snapshot.type === 'earn' ? snapshot.amount : -snapshot.amount)
                    : 0;
                const delta = -(newEffect - oldEffect);
                if (typeof currentBalance === 'number') {
                    currentBalance += delta;
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                console.log(`[DAL.updateTransaction] 已回滚交易 ${tx.id}，余额修正 ${delta}`);
            }
        });
        console.log('[DAL.updateTransaction] ✅ 已提交云函数');
    },

    // [v7.26.2] 批量更新同一任务下所有交易的 taskName（改名同步到云端）
    async renameTransactionTaskName(taskId, newTaskName) {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        callMutation('renameTransactionTaskName', {
            _openid: currentUid,
            taskId,
            newTaskName
        });
        console.log('[DAL.renameTransactionTaskName] ✅ 已提交云函数');
    },
    
    async deleteTransaction(txId) {
        console.log('[DAL.deleteTransaction] 开始删除交易:', txId);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) throw new Error('未登录，无法删除交易');

        // [v9.0.5] 保存快照用于回滚：删除失败的交易应恢复
        const snapshot = transactions.find(t => t.id === txId) || null;

        callMutation('deleteTransaction', {
            _openid: currentUid,
            txId: txId
        }, {
            onRollback: () => {
                // [v9.0.5] 回滚：恢复被删除的交易，修正余额
                const idx = transactions.findIndex(t => t.id === txId);
                if (idx === -1 && snapshot) {
                    transactions.push({ ...snapshot });
                    // [v9.0.7] 同步恢复交易索引
                    if (typeof addToTransactionIndex === 'function' && snapshot.taskId) {
                        addToTransactionIndex(snapshot);
                    }
                    // 余额差量：earn 加 amount，spend 减 amount
                    const delta = snapshot.type === 'earn' ? snapshot.amount : -snapshot.amount;
                    if (typeof currentBalance === 'number') {
                        currentBalance += delta;
                    }
                    console.log(`[DAL.deleteTransaction] 已回滚交易 ${txId}，余额恢复 ${delta}`);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
            }
        });
        console.log('[DAL.deleteTransaction] ✅ 已提交云函数');
    },
    
    // ========== RunningTask 操作 ==========
    runningCache: new Map(), // taskId -> _id
    
    // [v7.9.2] tb_running 使用预置规则，不需要手动 where
    async loadRunningTasks() {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) {
            console.error('[DAL.loadRunningTasks] No UID!');
            return new Map();
        }
        
        // 预置规则会自动过滤
        const res = await db.collection(TABLES.RUNNING).get();
        
        console.log('[DAL.loadRunningTasks] Found', res.data?.length, 'running tasks');
        
        this.runningCache.clear();
        const running = new Map();
        
        (res.data || []).forEach(doc => {
            const taskId = doc.taskId;
            // [v7.1.8] 优先使用顶层 isPaused 字段（updateRunningTask 更新的位置）
            // 如果 doc.data 存在，用它作为基础，但用顶层 isPaused 覆盖
            let data;
            if (doc.data) {
                data = { ...doc.data };
                // 顶层字段优先（这是 updateRunningTask 更新的位置）
                if (typeof doc.isPaused === 'boolean') {
                    data.isPaused = doc.isPaused;
                }
                if (typeof doc.accumulatedTime === 'number') {
                    data.accumulatedTime = doc.accumulatedTime;
                }
            } else {
                data = {
                    startTime: doc.startTime,
                    accumulatedTime: doc.accumulatedTime,
                    isPaused: doc.isPaused
                };
            }
            this.runningCache.set(taskId, doc._id);
            running.set(taskId, data);
        });
        
        return running;
    },
    
    async startTask(taskId, data) {
        console.log('[DAL.startTask] 开始任务:', taskId);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        // [v9.0.2] 保存快照用于回滚
        const cachedRunning = this.runningCache.get(taskId);
        callMutation('startTask', {
            _openid: currentUid,
            taskId,
            startTime: data.startTime,
            accumulatedTime: data.accumulatedTime || 0,
            isPaused: data.isPaused || false,
            data
        }, {
            onRollback: () => {
                // 回滚：恢复之前的状态或清除
                if (cachedRunning) {
                    this.runningCache.set(taskId, cachedRunning);
                } else {
                    this.runningCache.delete(taskId);
                }
                if (typeof runningTasks !== 'undefined' && runningTasks && runningTasks.delete) {
                    runningTasks.delete(taskId);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                console.log(`[DAL.startTask] 已回滚 ${taskId} 的乐观启动`);
            }
        });
        console.log('[DAL.startTask] ✅ 已提交云函数');
    },

    async stopTask(taskId, taskDataSnapshot = null) {
        console.log('[DAL.stopTask] 停止任务:', taskId);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        // [v9.0.5] 修复 onRollback 快照：使用 taskData 而非 _id
        // - runningCache 存的是 _id 字符串（taskId -> _id），不能作为 runningTasks 的快照
        // - runningTasks 存的是 taskData（包含 startTime/accumulatedTime 等）
        // - 业务层（app-2.js:4804）已在 delete 之前取出 taskData，应作为参数传入
        const cachedTaskData = taskDataSnapshot || runningTasks.get(taskId);
        const cachedCacheId = this.runningCache.get(taskId);

        callMutation('stopTask', { _openid: currentUid, taskId }, {
            onRollback: () => {
                // [v9.0.5] 回滚：恢复 taskData 和 _id（保证 runningTasks 数据完整）
                if (cachedTaskData) {
                    if (typeof runningTasks !== 'undefined' && runningTasks && runningTasks.set) {
                        runningTasks.set(taskId, cachedTaskData);
                    }
                    if (cachedCacheId) {
                        this.runningCache.set(taskId, cachedCacheId);
                    }
                } else {
                    if (typeof runningTasks !== 'undefined' && runningTasks && runningTasks.delete) {
                        runningTasks.delete(taskId);
                    }
                    this.runningCache.delete(taskId);
                }
                if (typeof updateAllUI === 'function') updateAllUI();
                console.log(`[DAL.stopTask] 已回滚 ${taskId} 的乐观停止`);
            }
        });
        this.runningCache.delete(taskId);
        console.log('[DAL.stopTask] ✅ 已提交云函数');
    },

    // [v7.30.0] 服务端任务锁 - 跨设备互斥操作
    async lockTask(taskId) {
        try {
            const res = await app.callFunction({
                name: 'timebankTaskLock',
                data: {
                    action: 'lockTask',
                    data: { taskId, clientId, deviceId: clientId, _openid: currentUid }
                }
            });
            return res.result || { code: -1 };
        } catch (e) {
            console.error('[DAL.lockTask] 异常:', e);
            return { code: -1, message: e.message };
        }
    },

    async unlockTask(taskId) {
        try {
            const res = await app.callFunction({
                name: 'timebankTaskLock',
                data: {
                    action: 'unlockTask',
                    data: { taskId, clientId, _openid: currentUid }
                }
            });
            return res.result || { code: -1 };
        } catch (e) {
            console.error('[DAL.unlockTask] 异常:', e);
            return { code: -1, message: e.message };
        }
    },

    async checkTaskLock(taskId) {
        try {
            const res = await app.callFunction({
                name: 'timebankTaskLock',
                data: {
                    action: 'checkLock',
                    data: { taskId, _openid: currentUid }
                }
            });
            return res.result || { code: -1, locked: false };
        } catch (e) {
            console.error('[DAL.checkTaskLock] 异常:', e);
            return { code: -1, locked: false };
        }
    },

    async updateRunningTask(taskId, data) {
        console.log('[DAL.updateRunningTask] 更新运行中任务:', taskId);
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        callMutation('updateRunningTask', {
            _openid: currentUid,
            taskId,
            startTime: data.startTime,
            accumulatedTime: data.accumulatedTime || 0,
            isPaused: data.isPaused === true,
            data
        });
        console.log('[DAL.updateRunningTask] ✅ 已提交云函数');
    },
    
    // ========== DailyChange 操作 ==========
    dailyCache: new Map(), // date -> _id
    
    async loadDailyChanges() {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) {
            console.error('[DAL.loadDailyChanges] No UID!');
            return {};
        }
        
        // 分页加载所有 daily 记录，按 date 降序
        const PAGE_SIZE = 1000;
        const MAX_PAGES = 10; // 最多支持 10000 天记录
        let allDocs = [];
        let lastDate = null;
        
        for (let page = 0; page < MAX_PAGES; page++) {
            let query = db.collection(TABLES.DAILY)
                .where({ _openid: currentUid });
            
            if (lastDate) {
                query = query.where({ date: _.lt(lastDate) });
            }
            
            const res = await query
                .orderBy('date', 'desc')
                .limit(PAGE_SIZE)
                .get();
            
            const docs = res.data || [];
            console.log(`[DAL.loadDailyChanges] Page ${page + 1}: got ${docs.length} records`);
            
            if (docs.length === 0) break;
            
            allDocs = allDocs.concat(docs);
            
            if (docs.length < PAGE_SIZE) break;
            
            lastDate = docs[docs.length - 1].date;
        }
        
        console.log('[DAL.loadDailyChanges] Total:', allDocs.length, 'daily records');
        
        this.dailyCache.clear();
        const daily = {};
        
        allDocs.forEach((doc, idx) => {
            // 调试：打印文档结构
            if (idx === 0) {
                console.log('[DAL.loadDailyChanges] 文档结构:', JSON.stringify(Object.keys(doc)));
                console.log('[DAL.loadDailyChanges] doc._id =', doc._id, ', doc.id =', doc.id);
            }
            
            const date = doc.date;
            const docId = doc._id || doc.id;
            this.dailyCache.set(date, docId);
            daily[date] = {
                earned: doc.earned || 0,
                spent: doc.spent || 0
            };
        });
        
        return daily;
    },
    
    async updateDailyChange(tx, reverse = false) {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        callMutation('updateDailyChange', {
            _openid: currentUid,
            type: tx.type,
            amount: tx.amount,
            timestamp: tx.timestamp,
            reverse
        });
    },
    
    // ========== 余额操作 ==========
    async updateCachedBalance(delta, absoluteValue = null) {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;

        callMutation('updateCachedBalance', {
            _openid: currentUid,
            delta,
            absoluteValue
        });
        if (this.profileData) {
            if (absoluteValue !== null) {
                this.profileData.cachedBalance = absoluteValue;
            } else {
                this.profileData.cachedBalance = (this.profileData.cachedBalance || 0) + delta;
            }
        }
    },
    
    // [v9.0.1] 服务端权威重算：通过 tbMutation 云函数 recalculateBalance action
    // v9.0.0 前直接 db.collection().update() 会绕过云端原子性保证，与服务端权威写入架构冲突。
    async recalculateBalance() {
        try {
            const currentUid = await this.getCurrentUid();
            if (!currentUid) {
                console.warn('[DAL.recalculateBalance] 未登录，跳过');
                return 0;
            }
            const res = await app.callFunction({
                name: 'tbMutation',
                data: {
                    action: 'recalculateBalance',
                    data: { _openid: currentUid }
                    // [v9.0.5] 移除 clientId 冗余注入（v9.0.3 P2-2 遗漏：云函数不读取 clientId）
                }
            });
            const result = res.result || {};
            if (result.code === 0 && typeof result.balance === 'number') {
                if (this.profileData) {
                    this.profileData.cachedBalance = result.balance;
                }
                return result.balance;
            }
            console.warn('[DAL.recalculateBalance] 云函数返回异常:', result.code, result.message);
            return this.profileData?.cachedBalance || 0;
        } catch (e) {
            console.error('[DAL.recalculateBalance] 失败:', e.message);
            return this.profileData?.cachedBalance || 0;
        }
    },
    
    // ========== CloudBase 实时监听 ==========
    async subscribeAll() {
        // [v8.2.2] 统一登录态检查：isLoggedIn() 与 subscribeAll() 使用同一套判断逻辑
        if (!isLoggedIn()) {
            console.warn('[DAL.subscribeAll] 未登录，跳过实时监听');
            return;
        }

        // [v8.2.2] 如果 hasLoginState() 返回 null 但 isLoggedIn 认为已登录，说明登录态分裂，主动刷新
        let loginState = auth.hasLoginState();
        if (!loginState) {
            console.warn('[DAL.subscribeAll] hasLoginState() 返回 null，尝试刷新登录态');
            loginState = await refreshLoginState();
            if (!loginState) {
                console.error('[DAL.subscribeAll] 刷新登录态后仍无效，无法建立 Watch');
                return;
            }
        }

        // [v9.0.11 修复] 预热 WebSocket：在建立 5 个 watch 之前，先做一次轻量查询
        // 强制 SDK 完成 WebSocket 握手、避免 5 个 watch 抢同一未就绪的 WebSocket
        // 根因：日志显示 5 个 watch 几乎同时（<100ms）建立并同时失败（wsclient.send timedout）
        // 解决方案：在 watch 之前先发一次查询，强制 SDK 准备 WebSocket
        try {
            console.log('[DAL.subscribeAll] 预热 WebSocket...');
            await db.collection('tb_profile').limit(1).get();
            // 额外延迟 200ms，确保 WebSocket 完全就绪
            await new Promise(r => setTimeout(r, 200));
            console.log('[DAL.subscribeAll] 预热完成，开始建 watch');
        } catch (warmupErr) {
            console.warn('[DAL.subscribeAll] 预热查询失败（继续尝试建 watch）:', warmupErr?.message);
        }

        // [v9.0.11 修复] 错峰建 watch：5 个 watch 间加 200ms 间隔
        // 避免 5 个 watch 同时抢同一 WebSocket 资源
        const __watchStaggerMs = 200;
        // [v6.6.0] 防止重复订阅：先取消现有订阅
        await this.unsubscribeAll();
        
        // [v6.6.1] 获取当前用户 UID，Watch 必须指定明确的查询条件
        const currentUid = await this.getCurrentUid();
        if (!currentUid) {
            console.error('[DAL.subscribeAll] 无法获取 UID，跳过实时监听');
            return;
        }
        
        console.log('[DAL.subscribeAll] 开始建立实时监听, UID:', currentUid);
        
        try {
            // 监听 Task 表
            watchers.task = db.collection(TABLES.TASK)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.task = true;
                        // [v9.0.11-fix] 恢复心跳刷新：v8.2.17 移除后导致 watchdog 误判（连接活着但无事件）
                        // 业务事件本身就是"连接还活着"的最真实信号
                        watchLastEventTime.task = Date.now();
                        console.log('📡 [DAL] Task 变更:', snapshot.type);
                        for (const change of snapshot.docChanges) {
                            const doc = change.doc;
                            if (change.dataType === 'add') {
                                const task = doc.data;
                                if (task && !this.taskCache.has(task.id) && !tasks.some(t => t.id === task.id)) {
                                    this.taskCache.set(task.id, doc._id || doc.id);
                                    tasks.push(task);
                                }
                            } else if (change.dataType === 'update') {
                                const task = doc.data;
                                if (task) {
                                    this.taskCache.set(task.id, doc._id || doc.id);
                                    const idx = tasks.findIndex(t => t.id === task.id);
                                    if (idx >= 0) {
                                        const existing = tasks[idx];
                                        if (task.lastUsed !== undefined) {
                                            task.lastUsed = Math.max(existing.lastUsed || 0, task.lastUsed || 0);
                                        }
                                        tasks[idx] = task;
                                    } else {
                                        tasks.push(task);
                                    }
                                }
                            } else if (change.dataType === 'remove') {
                                const taskId = doc.taskId || doc.data?.id || doc.id;
                                if (!taskId) continue;
                                console.log('📡 [DAL] 任务删除:', taskId);
                                this.taskCache.delete(taskId);
                                tasks = tasks.filter(t => t.id !== taskId);
                            }
                        }
                        updateAllUI();
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Task watch error:', err);
                        // [v7.37.3] 连接异常时需要重置 registered，因为 Watch 已失效需要重建
                        watchRegistered.task = false;
                        watchConnected.task = false;
                        watchLastEventTime.task = 0; // [v8.2.17] 连接驱动：错误时清零心跳
                        __markWatchFailure('sdk_timeout'); // [v9.0.10 完善] 标记降级状态（控制台仍输出 error，UI 状态指示器变黄/红）
                        scheduleWatchReconnect('task-error');
                    }
                });
            watchRegistered.task = true;
            watchRegistrationTime.task = Date.now();
            watchLastEventTime.task = Date.now(); // [v8.2.17] 连接驱动：注册成功后立即设心跳
            console.log('📡 [DAL] Task watch 已注册');
        } catch (e) {
            console.warn('[DAL.subscribeAll] Task watch 建立失败:', e.message);
            watchRegistered.task = false;
        }

        // [v9.0.11 修复] 错峰建 watch：Task 完成后等 200ms 再建 Transaction
        await new Promise(r => setTimeout(r, __watchStaggerMs));

        try {
            // 监听 Transaction 表
            watchers.transaction = db.collection(TABLES.TRANSACTION)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.transaction = true;
                        console.log('📡 [DAL] Transaction 变更:', snapshot.type);
                        for (const change of snapshot.docChanges) {
                            const doc = change.doc;
                            const tx = doc.data || {
                                id: doc.txId,
                                taskId: doc.taskId,
                                taskName: doc.taskName,
                                category: doc.category,
                                amount: doc.amount,
                                type: doc.type,
                                timestamp: doc.timestamp,
                                description: doc.description,
                                rawSeconds: doc.rawSeconds,
                                isStreakAdvancement: doc.isStreakAdvancement,
                                isSystem: doc.isSystem,
                                sleepData: doc.sleepData,
                                napData: doc.napData
                            };
                            const txId = tx?.id || doc.txId;
                            if (!txId) continue;

                            if (change.dataType === 'add') {
                                this.transactionCache.set(txId, doc._id || doc.id);
                                if (isImportMode) continue;
                                if (transactions.some(t => t.id === txId)) continue;
                                transactions.unshift(tx);
                                const balanceDelta = tx.type === 'earn' ? tx.amount : -tx.amount;
                                currentBalance += balanceDelta;
                                // [v9.1.0] dailyChanges 完全由云端 tb_daily 推送，客户端禁止本地写入
                                // 否则会与 Daily watch 的 add 事件竞态覆盖云端权威值
                                if (tx.taskId && typeof rebuildHabitStreak === 'function') {
                                    const habitTask = tasks.find(t => t.id === tx.taskId && t.isHabit);
                                    if (habitTask) rebuildHabitStreak(habitTask);
                                }
                            } else if (change.dataType === 'update') {
                                this.transactionCache.set(txId, doc._id || doc.id);
                                const idx = transactions.findIndex(t => t.id === txId);
                                if (idx >= 0) {
                                    transactions[idx] = tx;
                                } else if (tx) {
                                    transactions.unshift(tx);
                                    const balanceDelta = tx.type === 'earn' ? tx.amount : -tx.amount;
                                    currentBalance += balanceDelta;
                                }
                                if (tx.taskId && typeof rebuildHabitStreak === 'function') {
                                    const habitTask = tasks.find(t => t.id === tx.taskId && t.isHabit);
                                    if (habitTask) rebuildHabitStreak(habitTask);
                                }
                            } else if (change.dataType === 'remove') {
                                const existingTx = transactions.find(t => t.id === txId);
                                if (existingTx) {
                                    const balanceDelta = existingTx.type === 'earn' ? -existingTx.amount : existingTx.amount;
                                    currentBalance += balanceDelta;
                                    transactions = transactions.filter(t => t.id !== txId);
                                    if (existingTx.taskId && typeof rebuildHabitStreak === 'function') {
                                        const habitTask = tasks.find(t => t.id === existingTx.taskId && t.isHabit);
                                        if (habitTask) rebuildHabitStreak(habitTask);
                                    }
                                }
                                this.transactionCache.delete(txId);
                            }
                        }
                        updateAllUI();
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Transaction watch error:', err);
                        watchRegistered.transaction = false; // [v7.33.2] 连接异常时重置注册状态
                        watchConnected.transaction = false;
                        watchLastEventTime.transaction = 0; // [v8.2.17] 连接驱动：错误时清零心跳
                        __markWatchFailure('sdk_timeout'); // [v9.0.10 完善] 补全 5 处 onError 调用
                        scheduleWatchReconnect('transaction-error');
                    }
                });
            watchRegistered.transaction = true;
            watchRegistrationTime.transaction = Date.now();
            watchLastEventTime.transaction = Date.now(); // [v8.2.17] 连接驱动：注册成功后立即设心跳
            console.log('📡 [DAL] Transaction watch 已注册');
        } catch (e) {
            console.warn('[DAL.subscribeAll] Transaction watch 建立失败:', e.message);
            watchRegistered.transaction = false;
        }

        // [v9.0.11 修复] 错峰建 watch
        await new Promise(r => setTimeout(r, __watchStaggerMs));

        try {
            // 监听 RunningTask 表
            watchers.running = db.collection(TABLES.RUNNING)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.running = true;
                        // [v9.0.11-fix] 恢复心跳刷新：v8.2.17 移除后导致 watchdog 误判
                        watchLastEventTime.running = Date.now();
                        console.log('📡 [DAL] Running 变更:', snapshot.type, '变更数:', snapshot.docChanges?.length);
                        for (const change of snapshot.docChanges) {
                            const doc = change.doc;
                            const taskId = doc.taskId || doc.data?.taskId;
                            const remoteClientId = doc.clientId || doc.data?.clientId;
                            const data = doc.data || {
                                startTime: doc.startTime,
                                accumulatedTime: doc.accumulatedTime || 0,
                                isPaused: doc.isPaused === true
                            };
                            if (!taskId) continue;
                            console.log(`📡 [DAL] Running ${change.dataType}:`, taskId, 'remoteClientId:', remoteClientId, 'localClientId:', clientId);

                            if (change.dataType === 'add') {
                                if (remoteClientId === clientId) {
                                    console.log(`🛡️ [DAL] 忽略 add 事件: 本机触发 (taskId=${taskId})`);
                                    continue;
                                }
                                console.log('📡 [DAL] 任务开始:', taskId, '(来自其他设备)');
                                if (!runningTasks.has(taskId)) {
                                    this.runningCache.set(taskId, doc._id || doc.id);
                                    runningTasks.set(taskId, data);
                                }
                            } else if (change.dataType === 'update') {
                                if (remoteClientId === clientId) {
                                    console.log(`🛡️ [DAL] 忽略 update 事件: 本机触发 (taskId=${taskId})`);
                                    continue;
                                }
                                console.log('📡 [DAL] 任务状态更新:', taskId, data?.isPaused ? '(已暂停)' : '(运行中)', `(来自其他设备)`);
                                this.runningCache.set(taskId, doc._id || doc.id);
                                if (data) {
                                    runningTasks.set(taskId, data);
                                }
                            } else if (change.dataType === 'remove') {
                                if (remoteClientId === clientId) {
                                    if (!runningTasks.has(taskId)) {
                                        console.log(`🛡️ [DAL] 忽略 delete 事件: 本机已处理 (taskId=${taskId})`);
                                        continue;
                                    }
                                }
                                console.log('📡 [DAL] 任务停止:', taskId, `(来自 ${remoteClientId === clientId ? '本机' : '其他设备'})`);
                                this.runningCache.delete(taskId);
                                runningTasks.delete(taskId);
                            }
                        }
                        updateAllUI();
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Running watch error:', err);
                        watchRegistered.running = false; // [v7.33.2] 连接异常时重置注册状态
                        watchConnected.running = false;
                        watchLastEventTime.running = 0; // [v8.2.17] 连接驱动：错误时清零心跳
                        __markWatchFailure('sdk_timeout'); // [v9.0.10 完善] 标记降级状态
                        scheduleWatchReconnect('running-error');
                    }
                });
            watchRegistered.running = true;
            watchRegistrationTime.running = Date.now();
            watchLastEventTime.running = Date.now(); // [v8.2.17] 连接驱动：注册成功后立即设心跳
            console.log('📡 [DAL] Running watch 已注册');
        } catch (e) {
            console.warn('[DAL.subscribeAll] Running watch 建立失败:', e.message);
            watchRegistered.running = false;
        }

        // [v9.0.11 修复] 错峰建 watch
        await new Promise(r => setTimeout(r, __watchStaggerMs));

        try {
            // 监听 Profile 表
            watchers.profile = db.collection(TABLES.PROFILE)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.profile = true;
                        // [v8.2.17] 移除心跳更新：心跳由连接驱动，不再由事件驱动
                        console.log('📡 [DAL] Profile 变更');
                        for (const change of snapshot.docChanges) {
                            if (change.dataType === 'update') {
                                const doc = change.doc;
                                profileData = doc;
                                // [v7.1.7] 通知设置已改为本地存储，不再从云端同步
                                setCategoryColors(doc.categoryColors || []);
                                setCollapsedCategories(doc.collapsedCategories || []);
                                deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(doc.deletedTaskCategoryMap);
                                // [v7.11.3] 监听睡眠配置/状态（跨设备实时同步）
                                // [v7.33.8] 修复：优先使用新格式 deviceSleepSettings.${deviceId}，旧格式不再 force 覆盖
                                let sleepUpdated = false;
                                const mySleepSettings = doc.deviceSleepSettings?.[currentDeviceId] || doc.sleepSettingsShared;
                                if (mySleepSettings) {
                                    // 新格式或本地有效设置才 force，旧格式 sleepSettingsShared 不强制覆盖
                                    const isDeviceSpecific = !!doc.deviceSleepSettings?.[currentDeviceId];
                                    sleepUpdated = applySleepSettingsFromCloud(mySleepSettings, 'watch', isDeviceSpecific) || sleepUpdated;
                                }
                                const mySleepState = doc.deviceSleepState?.[currentDeviceId] || doc.sleepStateShared;
                                if (mySleepState) {
                                    sleepUpdated = applySleepStateFromCloud(mySleepState, 'watch') || sleepUpdated;
                                }
                                if (sleepUpdated) {
                                    updateSleepCardVisibility();
                                    updateSleepSettingsSummary();
                                    updateSleepCard();
                                }
                                // [v7.15.2] 金融系统跨设备同步（settings + ledger，统一监听）
                                if (doc.financeSettings || doc.interestLedger) {
                                    applyFinanceDataFromCloud(doc);
                                }
                                // [v7.15.3] 均衡模式跨设备实时同步
                                if (doc.balanceMode) {
                                    loadBalanceModeFromCloud(doc);
                                }
                                updateAllUI();
                            }
                        }
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Profile watch error:', err);
                        watchRegistered.profile = false; // [v7.33.2] 连接异常时重置注册状态
                        watchConnected.profile = false;
                        watchLastEventTime.profile = 0; // [v8.2.17] 连接驱动：错误时清零心跳
                        __markWatchFailure('sdk_timeout'); // [v9.0.10 完善] 补全 5 处 onError 调用
                        scheduleWatchReconnect('profile-error');
                    }
                });
            watchRegistered.profile = true;
            watchRegistrationTime.profile = Date.now();
            watchLastEventTime.profile = Date.now(); // [v8.2.17] 连接驱动：注册成功后立即设心跳
            console.log('📡 [DAL] Profile watch 已注册');
        } catch (e) {
            console.warn('[DAL.subscribeAll] Profile watch 建立失败:', e.message);
            watchRegistered.profile = false;
        }

        // [v9.0.11 修复] 错峰建 watch
        await new Promise(r => setTimeout(r, __watchStaggerMs));

        try {
            // [v7.1.8] 监听 Daily 表
            watchers.daily = db.collection(TABLES.DAILY)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        // [v7.37.3] onChange 首次触发时才确认连接活跃
                        watchConnected.daily = true;
                        // [v9.0.11-fix] 恢复心跳刷新：v8.2.17 移除后导致 watchdog 误判
                        watchLastEventTime.daily = Date.now();
                        console.log('📡 [DAL] Daily 变更:', snapshot.type);
                        for (const change of snapshot.docChanges) {
                            const doc = change.doc;
                            const date = doc.date;
                            if (change.dataType === 'add' || change.dataType === 'update') {
                                this.dailyCache.set(date, doc._id || doc.id);
                                dailyChanges[date] = { earned: doc.earned || 0, spent: doc.spent || 0 };
                            } else if (change.dataType === 'remove') {
                                this.dailyCache.delete(date);
                                delete dailyChanges[date];
                            }
                        }
                        updateAllUI();
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Daily watch error:', err);
                        watchRegistered.daily = false; // [v7.33.2] 连接异常时重置注册状态
                        watchConnected.daily = false;
                        watchLastEventTime.daily = 0; // [v8.2.17] 连接驱动：错误时清零心跳
                        __markWatchFailure('sdk_timeout'); // [v9.0.10 完善] 标记降级状态
                        scheduleWatchReconnect('daily-error');
                    }
                });
            // [v8.2.16] .watch() 调用成功（同步返回），立即标记已注册并记录时间
            watchRegistered.daily = true;
            watchRegistrationTime.daily = Date.now();
            watchLastEventTime.daily = Date.now(); // [v8.2.17] 连接驱动：注册成功后立即设心跳
            console.log('📡 [DAL] Daily watch 已注册');
        } catch (e) {
            console.warn('[DAL.subscribeAll] Daily watch 建立失败:', e.message);
            watchRegistered.daily = false; // [v7.33.2] 确保失败时重置
        }
        
        console.log('✅ [DAL] 所有表实时监听已启动');
        setAuthStatus('已同步 ✅', 'status-online');
        updateWatchStatusUI(); // [v7.33.2] 更新监听状态显示（基于 watchRegistered 即时反馈）
        // [v9.0.10] 启动主动心跳保活：每 20s 一次极轻量查询，让 SDK WebSocket 保持活跃
        // 根因修复：CloudBase SDK v2 WebSocket 无流量 30s 自动断开，触发 pong timed out 循环
        __startWatchHeartbeat();
    },

    async unsubscribeAll() {
        // [v9.0.10] 停止主动心跳保活
        __stopWatchHeartbeat();

        // [v9.0.11-fix] 批量收集 close() Promise + 800ms 等待服务器 ACK
        // 根因：旧版只调 close()，没等服务器确认就清空 watcher，
        // 服务器继续推数据 → SDK 内部报 "no realtime listener found responsible for watchId"
        const closePromises = [];
        for (const key of Object.keys(watchers)) {
            if (watchers[key]) {
                // [v8.2.2] 致命修复：close() 在 WebSocket 损坏时可能永久挂起，添加超时保护
                try {
                    closePromises.push(
                        Promise.race([
                            Promise.resolve(watchers[key].close()).catch(() => {}),
                            new Promise((resolve) => setTimeout(resolve, 3000))
                        ])
                    );
                } catch (closeErr) {
                    console.warn(`[DAL.unsubscribeAll] ${key} close() 异常:`, closeErr.message);
                }
                watchers[key] = null;
            }
        }
        // [v9.0.11-fix] 等所有 close 完成 + 服务器 ACK + ws 资源释放
        await Promise.all(closePromises);
        await new Promise((r) => setTimeout(r, 800));

        // [v7.33.2] 重置两层状态：registered + connected
        for (const key of Object.keys(watchers)) {
            if (watchRegistered.hasOwnProperty(key)) {
                watchRegistered[key] = false;
            }
            if (watchConnected.hasOwnProperty(key)) {
                watchConnected[key] = false;
            }
            // [v7.30.0] 重置心跳时间
            if (watchLastEventTime.hasOwnProperty(key)) {
                watchLastEventTime[key] = 0;
            }
            // [v8.2.16] 重置注册时间
            if (watchRegistrationTime.hasOwnProperty(key)) {
                watchRegistrationTime[key] = 0;
            }
        }
    },

    // [v7.28.0] 增量同步：从云函数获取 lastSyncAt 之后有更新的交易记录
    // 依赖云函数 timebankSync（action: getDelta）
    // 返回值语义：Array = 成功（可为空数组）；null = 云函数不可用，调用方应降级到全量同步
    // [v7.30.1] 增加云函数可用性缓存，避免每次 Watch 重建都尝试调用不存在的云函数
    // [v9.0.11-fix] 修复 currentUid is not defined：在函数顶部显式 await 获取
    _cloudFunctionAvailable: null,  // null=未知，true=可用，false=不可用
    async fetchDelta(lastSyncAt) {
        if (!isLoggedIn()) return null;

        // [v9.0.11-fix] 修复：原代码在 catch 块前引用了未声明的 currentUid（自由变量）
        // 统一使用 await this.getCurrentUid() 获取，缺失则降级到全量同步
        const currentUid = await this.getCurrentUid();
        if (!currentUid) {
            console.warn('[DAL.fetchDelta] 未登录或 UID 缺失，跳过增量同步');
            return null;
        }

        // [v7.30.1] 快速路径：已知云函数不可用时直接返回 null
        if (this._cloudFunctionAvailable === false) {
            console.log('[DAL.fetchDelta] 云函数已知不可用，跳过调用');
            return null;
        }

        try {
            const result = await app.callFunction({
                name: 'timebankSync',
                data: {
                    action: 'getDelta',
                    data: { lastSyncAt: lastSyncAt || 0, _openid: currentUid }
                }
            });
            const res = result?.result;
            if (res?.code === 0 && Array.isArray(res.delta)) {
                if (res.count > 0) {
                    console.log(`[DAL.fetchDelta] 获取到 ${res.count} 条增量记录 (since ${new Date(lastSyncAt).toLocaleTimeString()})`);
                }
                // [v7.30.1] 标记云函数可用
                this._cloudFunctionAvailable = true;
                return res.delta; // 成功：[] 表示无新记录，[...] 表示有新记录
            }
            console.warn('[DAL.fetchDelta] 云函数返回异常:', res?.code, res?.message);
            return null; // 失败
        } catch (e) {
            // 云函数未部署（函数不存在）时会抛异常，静默处理
            if (!e.message?.includes('not found') && !e.message?.includes('ResourceNotFound')) {
                console.warn('[DAL.fetchDelta] 增量同步失败:', e.message);
            } else {
                // [v7.30.1] 明确标记云函数不可用
                console.log('[DAL.fetchDelta] 云函数未部署，标记为不可用');
                this._cloudFunctionAvailable = false;
            }
            return null; // 失败：调用方应降级到全量同步
        }
    },

    // [v8.2.16] 新增：获取云端最新交易更新时间戳，用于新鲜度检测
    async getLatestTransactionUpdateTime() {
        if (!isLoggedIn()) return 0;
        
        try {
            const res = await db.collection(TABLES.TRANSACTION)
                .where({ _openid: await this.getCurrentUid() })
                .orderBy('_updateTime', 'desc')
                .limit(1)
                .field({ _updateTime: true })
                .get();
            
            if (res?.data?.length > 0 && res.data[0]._updateTime) {
                const updateTime = new Date(res.data[0]._updateTime).getTime();
                console.log(`[DAL.getLatestTransactionUpdateTime] 云端最新交易时间: ${new Date(updateTime).toLocaleTimeString()}`);
                return updateTime;
            }
            return 0;
        } catch (e) {
            console.warn('[DAL.getLatestTransactionUpdateTime] 查询失败:', e.message);
            return 0;
        }
    },

    // [v7.31.3-removed] writeTransactionSafe 已移除
    // 客户端改为直接写入数据库，不再通过云函数幂等写入
    // 防重复依赖：1) 唯一交易ID 2) Watch监听去重 3) 本地写入追踪
    
    // ========== 完整加载 ==========
    async loadAll() {
        console.log('🔄 [DAL] 开始加载所有数据...');
        setAuthStatus('加载中...', 'status-syncing');
        
        // [v7.9.0] 获取当前 UID 用于诊断
        const currentUid = await this.getCurrentUid();
        console.log('🔄 [DAL.loadAll] 当前 UID:', currentUid);
        
        const [profile, loadedTasks, loadedTransactions, loadedRunning, loadedDaily] = await Promise.all([
            this.loadProfile(),
            this.loadAllTasks(),
            this.loadAllTransactions(),
            this.loadRunningTasks(),
            this.loadDailyChanges()
        ]);
        
        // [v7.9.0] 详细诊断日志
        console.log('🔄 [DAL.loadAll] 加载结果:', {
            profileExists: !!profile,
            tasksCount: loadedTasks?.length || 0,
            transactionsCount: loadedTransactions?.length || 0,
            runningCount: loadedRunning?.size || 0
        });
        
        if (!profile) {
            throw new Error('Profile 不存在，请先导入数据');
        }
        
        // [v7.32.0-fix] 关键修复：当云端数据为空时，尝试从本地缓存恢复
        // 这解决了离线场景或网络问题导致的数据丢失
        let finalTasks = loadedTasks;
        let finalTransactions = loadedTransactions;
        
        // [v7.32.0-fix] 检查是否需要从本地缓存恢复
        const isCloudDataEmpty = loadedTasks.length === 0 && loadedTransactions.length === 0;
        const hasLocalCache = USE_LOCAL_CACHE && localStorage.getItem('timeBankData');
        
        if (isCloudDataEmpty && hasLocalCache) {
            console.warn('⚠️ [DAL.loadAll] 云端数据为空，尝试从本地缓存恢复...');
            try {
                const localData = JSON.parse(localStorage.getItem('timeBankData'));
                if (localData) {
                    const localTxCount = localData.transactions?.length || 0;
                    const localTaskCount = localData.tasks?.length || 0;
                    
                    if (localTxCount > 0 || localTaskCount > 0) {
                        console.log(`✅ [DAL.loadAll] 从本地缓存恢复: ${localTaskCount}个任务, ${localTxCount}条交易`);
                        finalTasks = localData.tasks || [];
                        finalTransactions = localData.transactions || [];
                        
                        // 显示恢复提示
                        setTimeout(() => {
                            showNotification('📦 数据恢复', '已从本地缓存恢复数据，将自动同步到云端', 'info');
                        }, 1000);
                    }
                }
            } catch (e) {
                console.error('❌ [DAL.loadAll] 本地缓存恢复失败:', e);
            }
        }
        
        // [v7.9.6] 详细诊断：如果数据为空，输出诊断信息
        if (loadedTransactions.length === 0 && finalTransactions.length === 0) {
            console.warn('⚠️ [DAL.loadAll] 云端交易记录为空');
            console.warn('⚠️ [DAL.loadAll] 这可能是新用户或网络问题，UID:', await this.getCurrentUid());
        }
        
        if (loadedTasks.length === 0 && finalTasks.length === 0) {
            console.warn('⚠️ [DAL.loadAll] 云端任务列表为空');
        }
        
        // [v7.9.0] 关键检查：如果所有数据都为空，这是异常情况
        if (finalTasks.length === 0 && finalTransactions.length === 0) {
            console.error('❌ [DAL.loadAll] 严重：云端和本地都没有数据！');
            console.error('❌ [DAL.loadAll] UID:', await this.getCurrentUid());
            // 显示错误提示
            setTimeout(() => {
                showNotification('❌ 数据加载失败', '无法从云端或本地加载数据，请检查网络连接后刷新页面', 'error');
            }, 1000);
        }

        const localRunningSize = runningTasks.size;
        console.log(`[DAL.loadAll] runningTasks 检查: localSize=${localRunningSize}, cloudSize=${loadedRunning?.size || 0}`);

        // [v8.2.16] 新鲜度保护：如果本地已有数据，执行智能合并而非直接覆盖
        // 修复：防止全量同步时用旧云端数据覆盖本地新数据
        const localTxCount = transactions.length;
        const localTaskCount = tasks.length;
        const hasLocalData = localTxCount > 0 || localTaskCount > 0;
        
        // profile 始终应用（配置数据通常以云端为准）
        profileData = profile;
        
        if (hasLocalData && !isCloudDataEmpty) {
            console.log(`[v8.2.16][DAL.loadAll] 本地已有数据，执行智能合并 (本地: ${localTaskCount}任务/${localTxCount}交易, 云端: ${loadedTasks.length}任务/${loadedTransactions.length}交易)`);
            
            // 计算本地和云端最新时间戳，判断哪个更新
            const localMaxTxTime = transactions.length > 0 
                ? Math.max(...transactions.map(t => t._updateTime || t.timestamp || 0)) 
                : 0;
            const cloudMaxTxTime = loadedTransactions.length > 0 
                ? Math.max(...loadedTransactions.map(t => {
                    if (t._updateTime) return new Date(t._updateTime).getTime();
                    return t.timestamp || 0;
                })) 
                : 0;
            
            console.log(`[v8.2.16][DAL.loadAll] 时间戳比较: 本地最新=${localMaxTxTime > 0 ? new Date(localMaxTxTime).toLocaleTimeString() : '无'}, 云端最新=${cloudMaxTxTime > 0 ? new Date(cloudMaxTxTime).toLocaleTimeString() : '无'}`);
            
            // 使用 mergeTransactionDelta 执行智能合并（时间戳获胜）
            // 需要将云端交易包装成 getDelta 返回的格式
            const cloudTxAsDelta = loadedTransactions.map(t => ({
                data: t,
                _updateTime: t._updateTime,
                txId: t.id,
                taskId: t.taskId,
                taskName: t.taskName,
                category: t.category,
                amount: t.amount,
                type: t.type,
                timestamp: t.timestamp,
                description: t.description
            }));
            mergeTransactionDelta(cloudTxAsDelta);
            
            // 使用 mergeTasksSmart 执行任务智能合并
            mergeTasksSmart(loadedTasks);
            
            console.log(`[v8.2.16][DAL.loadAll] 智能合并完成: ${tasks.length}任务, ${transactions.length}交易`);
        } else {
            // 本地无数据或云端数据为空，直接应用（原有逻辑）
            console.log(`[DAL.loadAll] 本地无数据或云端为空，直接应用云端数据`);
            tasks = finalTasks;
            transactions = finalTransactions;
        }

        // [v9.0.9] runningTasks 由云端作为唯一权威源
        // 本地内存中的 runningTasks 在 applyDataState 后可能为空或残留旧状态
        // DAL.loadAll 时直接用云端数据覆盖，不再与本地合并
        console.log(`[DAL.loadAll] [v9.0.9] 应用云端 runningTasks: ${loadedRunning?.size || 0} 个`);
        runningTasks = loadedRunning || new Map();

        dailyChanges = loadedDaily;

        // [v9.1.0] dailyChanges 首次自动迁移：云端 tb_daily 为空但本地有 dailyChanges 时
        // 把本地 dailyChanges 一次性推到云端（仅执行一次）
        // 失败必须用户感知：弹错误通知，禁止降级
        await this._migrateDailyChangesIfNeeded(loadedDaily);

        // [v7.32.0-fix] 如果从本地缓存恢复了数据，触发同步到云端
        if (isCloudDataEmpty && hasLocalCache && (finalTransactions.length > 0 || finalTasks.length > 0)) {
            console.log('[DAL.loadAll] 从本地缓存恢复数据，将在后台同步到云端...');
            setTimeout(async () => {
                try {
                    // [v9.0.10 修复] 后台同步：使用静默模式，不弹"数据导入中"模态框
                    // 原因：用户没有主动触发导入，看到模态框会困惑；如果云端 hang 住模态框会卡住
                    const snapshot = getAppState();
                    const __prevSilentMode = window.__tbImportSilentMode;
                    window.__tbImportSilentMode = true;
                    try {
                        await this.importFromBackup(snapshot);
                    } finally {
                        window.__tbImportSilentMode = __prevSilentMode;
                    }
                    console.log('✅ [DAL.loadAll] 本地数据已成功同步到云端');
                    showNotification('✅ 同步完成', '本地数据已同步到云端', 'success');
                } catch (e) {
                    console.error('❌ [DAL.loadAll] 同步到云端失败:', e);
                    showNotification('⚠️ 同步延迟', '将在网络恢复后自动同步', 'info');
                }
            }, 2000); // 延迟2秒，确保UI已更新
        }
        
        // [v9.0.0] 刷新离线变更队列
        flushMutationQueue().catch(err => {
            console.error('[DAL.loadAll] 离线变更刷新异常:', err);
        });
        
        // [v9.0.0] 余额从 profile.cachedBalance 读取，不再全量重算
        currentBalance = profile.cachedBalance || 0;
        console.log(`💰 [DAL.loadAll] 余额从缓存恢复: ${currentBalance} (${Math.round(currentBalance/60)}分钟)`);

        // [v7.30.1] 修复 completionCount 与交易记录不一致
        // [v9.0.11-fix] 修 + 写回云端：原版只改内存，loadAll 周期内会反复出现
        const __loadAllCompletionFixPromises = [];
        tasks.forEach(task => {
            const txCount = transactions.filter(t => t.taskId === task.id).length;
            const storedCount = task.completionCount || 0;
            if (txCount !== storedCount) {
                console.warn(`[completionCount 修复] taskId=${task.id}, 交易数=${txCount}, 存储=${storedCount} → 修正为${txCount}`);
                task.completionCount = txCount;
                __loadAllCompletionFixPromises.push(
                    this.saveTask(task).catch(e => console.error(`[completionCount 修复] 写回云端失败: taskId=${task.id}`, e?.message || e))
                );
            }
        });
        if (__loadAllCompletionFixPromises.length > 0) {
            Promise.all(__loadAllCompletionFixPromises).then(() =>
                console.log(`[completionCount 修复] loadAll 写回 ${__loadAllCompletionFixPromises.length} 个任务到云端`)
            );
        }

        // [v7.1.7] 通知设置已改为本地存储，不再从云端加载
        setCategoryColors(profile.categoryColors || []);
        setCollapsedCategories(profile.collapsedCategories || []);
        deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(profile.deletedTaskCategoryMap);
        
        // [v7.2.0] categoryOrder 使用本地存储，不受云端影响
        try {
            const savedOrder = localStorage.getItem('categoryOrder');
            profileData.categoryOrder = savedOrder ? JSON.parse(savedOrder) : { earn: [], spend: [] };
        } catch (e) {
            profileData.categoryOrder = { earn: [], spend: [] };
        }
        
        // [v7.9.6] 云端分设备同步方案：
        // 设置加载逻辑移至 initScreenTimeSettings() 和 initSleepSettings()
        // DAL.loadAll 只负责将 profile 数据准备好，供后续 init 函数使用
        // 这里只做分类设置的恢复（所有设备共享）
        
        // [v7.2.4] 从云端统一位置恢复屏幕时间分类设置（所有设备共享）
        // [v7.11.2] 修复：只有当 localStorage 中已有完整设置时才更新分类
        // 避免在 localStorage 为空时写入不完整的对象导致 enabled 丢失
        if (profile.screenTimeCategories) {
            const existingSTS = localStorage.getItem('screenTimeSettings');
            if (existingSTS && existingSTS !== '{}') {
                try {
                    const localSTS = JSON.parse(existingSTS);
                    if (profile.screenTimeCategories.earnCategory !== undefined) {
                        localSTS.earnCategory = profile.screenTimeCategories.earnCategory;
                    }
                    if (profile.screenTimeCategories.spendCategory !== undefined) {
                        localSTS.spendCategory = profile.screenTimeCategories.spendCategory;
                    }
                    localStorage.setItem('screenTimeSettings', JSON.stringify(localSTS));
                } catch (e) {
                    console.warn('[DAL.loadAll] screenTimeSettings 解析失败，跳过分类恢复');
                }
            }
        }
        
        // [v7.9.3] 从云端统一位置恢复睡眠时间分类设置（所有设备共享）
        // [v7.11.2] 修复：同上
        if (profile.sleepTimeCategories) {
            const existingSleep = localStorage.getItem('sleepSettings');
            if (existingSleep && existingSleep !== '{}') {
                try {
                    const localSleep = JSON.parse(existingSleep);
                    if (profile.sleepTimeCategories.earnCategory !== undefined) {
                        localSleep.earnCategory = profile.sleepTimeCategories.earnCategory;
                    }
                    if (profile.sleepTimeCategories.spendCategory !== undefined) {
                        localSleep.spendCategory = profile.sleepTimeCategories.spendCategory;
                    }
                    localStorage.setItem('sleepSettings', JSON.stringify(localSleep));
                } catch (e) {
                    console.warn('[DAL.loadAll] sleepSettings 解析失败，跳过分类恢复');
                }
            }
        }
        
        // [v7.2.4] 从云端恢复设备特定数据（分类排序、屏幕时间历史、自动检测处理日期）
        if (profile.deviceSpecificData && currentDeviceId) {
            const deviceData = profile.deviceSpecificData[currentDeviceId];
            if (deviceData) {
                // 分类排序顺序：本地为空时从云端恢复
                const localCatOrder = localStorage.getItem('categoryOrder');
                if ((!localCatOrder || localCatOrder === '{"earn":[],"spend":[]}') && deviceData.categoryOrder) {
                    const cloudOrder = deviceData.categoryOrder;
                    if ((cloudOrder.earn && cloudOrder.earn.length > 0) || 
                        (cloudOrder.spend && cloudOrder.spend.length > 0)) {
                        console.log('[DAL.loadAll] 从云端恢复分类排序顺序');
                        localStorage.setItem('categoryOrder', JSON.stringify(cloudOrder));
                        if (typeof profileData !== 'undefined') {
                            profileData.categoryOrder = cloudOrder;
                        }
                    }
                }
                
                // 屏幕时间历史记录：本地为空时从云端恢复
                const localHistory = localStorage.getItem('screenTimeHistory');
                if ((!localHistory || localHistory === '[]') && 
                    deviceData.screenTimeHistory && deviceData.screenTimeHistory.length > 0) {
                    console.log('[DAL.loadAll] 从云端恢复屏幕时间历史:', deviceData.screenTimeHistory.length, '条');
                    localStorage.setItem('screenTimeHistory', JSON.stringify(deviceData.screenTimeHistory));
                }

                // 自动检测原始记录：本地为空时从云端恢复
                const localRaw = localStorage.getItem('autoDetectRawRecords');
                if ((!localRaw || localRaw === '{}' || localRaw === 'null') &&
                    deviceData.autoDetectRawRecords && Object.keys(deviceData.autoDetectRawRecords).length > 0) {
                    console.log('[DAL.loadAll] 从云端恢复自动检测原始记录');
                    localStorage.setItem('autoDetectRawRecords', JSON.stringify(deviceData.autoDetectRawRecords));
                }
                
                // 自动检测处理日期：优先使用云端全局记录
                const localProcessed = localStorage.getItem('autoDetectProcessedDates');
                if (profile.autoDetectProcessedDates && Object.keys(profile.autoDetectProcessedDates).length > 0) {
                    console.log('[DAL.loadAll] 从云端恢复自动检测处理日期（全局）');
                    localStorage.setItem('autoDetectProcessedDates', JSON.stringify(profile.autoDetectProcessedDates));
                } else if ((!localProcessed || localProcessed === '{}') && 
                    deviceData.autoDetectProcessedDates && Object.keys(deviceData.autoDetectProcessedDates).length > 0) {
                    console.log('[DAL.loadAll] 从云端恢复自动检测处理日期（旧版设备数据）');
                    localStorage.setItem('autoDetectProcessedDates', JSON.stringify(deviceData.autoDetectProcessedDates));
                }
                
                // [v7.2.4] 主题色：本地为默认值时从云端恢复
                // [v7.20.0] 添加旧主题迁移处理
                const localAccent = localStorage.getItem('accentTheme');
                const themeMigration = {
                    'blue-purple': 'sky-blue',
                    'pink-white': 'warm-earth'
                };
                let cloudAccent = deviceData.accentTheme;
                // 迁移云端旧主题
                if (cloudAccent && themeMigration[cloudAccent]) {
                    console.log(`[v7.20.0] 云端主题迁移: ${cloudAccent} -> ${themeMigration[cloudAccent]}`);
                    cloudAccent = themeMigration[cloudAccent];
                }
                if ((!localAccent || localAccent === 'sky-blue') && 
                    cloudAccent && cloudAccent !== 'sky-blue') {
                    console.log('[DAL.loadAll] 从云端恢复主题色:', cloudAccent);
                    localStorage.setItem('accentTheme', cloudAccent);
                }
            }
        }

        // [v7.11.1] 全局自动检测处理日期（不依赖设备数据）
        if (profile.autoDetectProcessedDates && Object.keys(profile.autoDetectProcessedDates).length > 0) {
            localStorage.setItem('autoDetectProcessedDates', JSON.stringify(profile.autoDetectProcessedDates));
        }
        
        // [v7.11.1] 从云端恢复均衡模式设置（云端唯一真相）
        loadBalanceModeFromCloud(profile);
        
        // [v7.15.2] 从云端恢复金融系统全部数据（settings + ledger，统一同步）
        if (typeof applyFinanceDataFromCloud === 'function' && (profile.financeSettings || profile.interestLedger)) {
            applyFinanceDataFromCloud(profile);
        }
        
        // [v7.9.1] 更严格的同步标志控制：
        // 只有当确实加载到有效数据时才设置 hasCompletedFirstCloudSync = true
        // 这可以防止空数据覆盖云端
        if (finalTransactions.length > 0 || finalTasks.length > 0) {
            hasCompletedFirstCloudSync = true;
            console.log('✅ [DAL.loadAll] 数据有效，已启用云端同步');
        } else {
            hasCompletedFirstCloudSync = false;
            console.warn('⚠️ [DAL.loadAll] 数据为空，云端同步已禁用（防止覆盖）');
        }
        // [v7.28.0] 云端同步完成：更新时间戳
        lastCloudSyncAt = Date.now();
        localStorage.setItem('tb_lastCloudSyncAt', String(lastCloudSyncAt));
        
        // [v9.0.0] dailyChanges 已从云端加载，不再全量重算
        
        console.log(`✅ [DAL] 加载完成: ${tasks.length}任务, ${transactions.length}交易, ${runningTasks.size}运行中`);
        
        // [v7.37.0] 构建交易索引
        buildTransactionIndex();
        
        // 订阅实时更新
        await this.subscribeAll();
        
        return true;
    },

    // [v9.1.0] dailyChanges 首次自动迁移
    // 触发条件：云端 tb_daily 为空（loadedDaily 为 {}）但本地 localStorage.timeBankData.dailyChanges 有数据
    // 执行一次：成功后写 localStorage 标志位 tb_daily_migrated_v910 = '1'
    // 失败必须用户感知：弹错误通知
    async _migrateDailyChangesIfNeeded(loadedDaily) {
        // 1. 检查是否已迁移过
        if (localStorage.getItem('tb_daily_migrated_v910') === '1') {
            console.log('[v9.1.0] dailyChanges 已迁移过，跳过');
            return;
        }

        // 2. 检查云端是否已有数据（如果有，说明已经在云端，跳过迁移）
        const cloudHasData = loadedDaily && Object.keys(loadedDaily).length > 0;
        if (cloudHasData) {
            console.log('[v9.1.0] 云端 tb_daily 已有数据，无需迁移');
            localStorage.setItem('tb_daily_migrated_v910', '1');
            return;
        }

        // 3. 检查本地是否有数据
        if (!USE_LOCAL_CACHE) {
            console.log('[v9.1.0] USE_LOCAL_CACHE=false，跳过迁移');
            return;
        }
        const localDataStr = localStorage.getItem('timeBankData');
        if (!localDataStr) {
            console.log('[v9.1.0] 本地无缓存，无需迁移');
            return;
        }

        let localData;
        try {
            localData = JSON.parse(localDataStr);
        } catch (e) {
            console.warn('[v9.1.0] 本地缓存解析失败，跳过迁移:', e.message);
            return;
        }

        const localDaily = localData.dailyChanges || {};
        const localEntries = Object.entries(localDaily);
        if (localEntries.length === 0) {
            console.log('[v9.1.0] 本地 dailyChanges 为空，无需迁移');
            localStorage.setItem('tb_daily_migrated_v910', '1');
            return;
        }

        // 4. 执行迁移
        console.log(`[v9.1.0] 开始迁移 dailyChanges: ${localEntries.length} 天`);
        try {
            const res = await callMutation('migrateDailyChanges', {
                _openid: await this.getCurrentUid(),
                entries: localEntries
            });

            if (res.code === 0) {
                console.log(`[v9.1.0] dailyChanges 迁移成功: ${res.migrated} 条`);
                localStorage.setItem('tb_daily_migrated_v910', '1');
                showNotification(
                    '📅 日数据已迁移',
                    `已迁移 ${res.migrated} 天日数据到云端，多设备将自动同步`,
                    'success'
                );
            } else if (res.code === 1007) {
                // [v9.1.0] 部分失败：不设标志位，下次刷新会重试（云端已有日期会被自动跳过）
                // 强制用户感知：弹错误通知，禁止本地降级路径
                console.error('[v9.1.0] dailyChanges 部分迁移失败:', res.message);
                showNotification(
                    '⚠️ 日数据部分迁移失败',
                    `成功 ${res.migrated} 条，失败 ${res.failed} 条。请在网络恢复后刷新页面重试。`,
                    'error',
                    8000
                );
            } else {
                throw new Error(res.message || '迁移失败');
            }
        } catch (e) {
            console.error('[v9.1.0] dailyChanges 迁移失败:', e);
            showNotification(
                '❌ 日数据迁移失败',
                '云端同步失败，请检查网络后刷新页面重试。已迁移的数据可能不完整。',
                'error',
                8000
            );
        }
    }
};

// ============================================================================
// [v6.0.0] 多表架构 END
// ============================================================================

/**
 * [v7.28.0] mergeTransactionDelta
 * 将 fetchDelta 或 Watch 返回的增量记录安全合并到本地 transactions 数组。
 *
 * [v8.2.16] 修复：新增时间戳获胜策略，解决多端数据更新被忽略的问题
 *
 * 合并规则：
 *   - 本端不存在该记录 → 追加（新记录）
 *   - 本端存在 + 云端 undone=true + 本端 undone=false → 应用撤回（优先级最高）
 *   - 本端存在 + 云端 _updateTime > 本地 _updateTime → 应用云端更新（v8.2.16 新增）
 *   - 其他情况 → 跳过（保持本地数据）
 *
 * @param {Array} deltaRecords - 来自云函数 getDelta 的记录数组
 * @returns {boolean} 是否有数据变化
 */
function mergeTransactionDelta(deltaRecords) {
    if (!Array.isArray(deltaRecords) || deltaRecords.length === 0) return false;

    // [v7.28.0] 将 DB 文档解包为 tx 对象，与 loadAllTransactions 保持同一读取口径
    // getDelta 返回的是原始 DB 文档，格式为 { _id, txId, taskId, ..., data: {完整tx} }
    // writeTransactionSafe 写入的文档也遵循这一格式（已修正）
    const remoteTxs = deltaRecords.map(doc => {
        const tx = doc.data ? { ...doc.data } : {
            id: doc.txId || doc._id,
            taskId: doc.taskId,
            taskName: doc.taskName,
            category: doc.category,
            amount: doc.amount,
            type: doc.type,
            timestamp: doc.timestamp,
            description: doc.description,
            isStreakAdvancement: doc.isStreakAdvancement,
            isSystem: doc.isSystem,
        };
        // 规范化时间戳（CloudBase 可能返回 Date 对象）
        if (tx.timestamp instanceof Date) tx.timestamp = tx.timestamp.getTime();
        // 将外层 undone 状态同步到 tx（撤回状态存在 doc 顶层）
        if (doc.undone === true && !tx.undone) tx.undone = true;
        if (doc.undoneAt && !tx.undoneAt) tx.undoneAt = doc.undoneAt;
        // [v8.2.16] 新增：记录云端 _updateTime 用于冲突解决
        if (doc._updateTime) {
            tx._cloudUpdateTime = new Date(doc._updateTime).getTime();
        } else {
            tx._cloudUpdateTime = tx.timestamp || 0;
        }
        return tx;
    }).filter(t => t.id);

    // 用 tx.id（客户端生成的业务 ID）作为去重 key
    const localById = new Map(transactions.map(t => [t.id, t]));
    let changed = false;

    for (const remoteTx of remoteTxs) {
        const local = localById.get(remoteTx.id);

        if (!local) {
            // 情况1：本端缺失，追加新记录（使用 unshift 保持与 addTransaction 一致的顺序）
            transactions.unshift(remoteTx);
            localById.set(remoteTx.id, remoteTx);
            changed = true;
            console.log(`[mergeDelta] 追加新记录: ${remoteTx.id} (${remoteTx.taskName})`);
        } else if (remoteTx.undone === true && !local.undone) {
            // 情况2：云端已撤回但本端未撤回，应用撤回（优先级最高）
            local.undone = true;
            if (remoteTx.undoneAt) local.undoneAt = remoteTx.undoneAt;
            changed = true;
            console.log(`[mergeDelta] 应用撤回: ${remoteTx.id}`);
        } else {
            // [v8.2.16] 新增情况3：时间戳获胜策略
            // 比较云端和本地的更新时间，使用最新版本
            const localUpdateTime = local._updateTime || local.timestamp || 0;
            const remoteUpdateTime = remoteTx._cloudUpdateTime || remoteTx.timestamp || 0;
            
            if (remoteUpdateTime > localUpdateTime + 1000) {  // 1秒容差，避免时钟微小差异
                // 云端版本更新，应用更新
                console.log(`[mergeDelta] 应用云端更新: ${remoteTx.id} (云端: ${new Date(remoteUpdateTime).toLocaleTimeString()} > 本地: ${new Date(localUpdateTime).toLocaleTimeString()})`);
                
                // 保留本地特有的字段（如 pending 状态等）
                const preservedFields = ['_pending', '_localOnly'];
                const preservedValues = {};
                preservedFields.forEach(f => {
                    if (local[f] !== undefined) preservedValues[f] = local[f];
                });
                
                // 合并云端数据
                Object.assign(local, remoteTx);
                
                // 恢复本地特有字段
                Object.assign(local, preservedValues);
                
                // 确保本地 _updateTime 取最大值
                local._updateTime = Math.max(localUpdateTime, remoteUpdateTime);
                
                changed = true;
            }
            // 其他情况：跳过（本地数据已是最新或更新）
        }
    }

    if (changed) {
        // [v9.1.0] dailyChanges 由云端权威管理，不再本地重算
        // [v9.1.0] 余额云端权威化：不再本地重算
        // 原因：profile 字段变化不应影响余额
        if (typeof updateAllUI === 'function') updateAllUI();
    }

    return changed;
}

/**
 * [v8.2.7] mergeTasksSmart
 * 将云端任务列表与本地任务列表智能合并。
 * 复用 Watch 更新事件中的字段级合并逻辑，保护本机运行态。
 *
 * 合并规则：
 *   - 云端有本地无 → 追加
 *   - 同一 clientId（本机回声）→ 直接替换，保护 lastUsed 取最大值
 *   - 不同 clientId（他机修改）→ 字段级合并，保护 runningTasks 等运行态
 */
function mergeTasksSmart(cloudTasks) {
    if (!Array.isArray(cloudTasks) || cloudTasks.length === 0) return false;

    const localById = new Map(tasks.map(t => [t.id, t]));
    let changed = false;

    for (const task of cloudTasks) {
        if (!task || !task.id) continue;
        const existing = localById.get(task.id);

        if (!existing) {
            // 云端有本地无：追加
            tasks.push(task);
            localById.set(task.id, task);
            changed = true;
        } else {
            // [v8.2.7] 本机回声识别：同一 clientId 直接替换
            if (task.clientId === clientId) {
                if (existing.lastUsed) {
                    task.lastUsed = Math.max(existing.lastUsed, task.lastUsed || 0);
                }
                const idx = tasks.findIndex(t => t.id === task.id);
                if (idx >= 0) {
                    tasks[idx] = task;
                    changed = true;
                }
            } else {
                // [v8.2.7] 他机修改：字段级合并，保护本机运行态
                const merged = { ...existing };
                ['name', 'category', 'color', 'limit', 'rate', 'cycle', 'maxTime', 'earnType'].forEach(k => {
                    if (task[k] !== undefined) merged[k] = task[k];
                });
                if (task.completionCount !== undefined) merged.completionCount = task.completionCount;
                if (task.lastUsed !== undefined) {
                    merged.lastUsed = Math.max(existing.lastUsed || 0, task.lastUsed || 0);
                }
                if (task.habitDetails) merged.habitDetails = task.habitDetails;
                // 保护本机运行态：runningTasks 保留本地状态，除非云端明确清零
                if (task.runningTasks !== undefined && task.runningTasks === null) {
                    merged.runningTasks = null;
                }
                merged.updatedAt = task.updatedAt || existing.updatedAt;
                merged.editTimestamp = task.editTimestamp || existing.editTimestamp;
                merged.clientId = task.clientId || existing.clientId;

                const idx = tasks.findIndex(t => t.id === task.id);
                if (idx >= 0) {
                    tasks[idx] = merged;
                    changed = true;
                }
            }
        }
    }

    return changed;
}

/**
 * [v8.2.7] handleIncrementalSync
 * 增量同步路径：只获取差异数据，避免重复加载全量交易。
 * 适用于本地已有有效缓存的场景（大数据量启动优化）。
 */
async function handleIncrementalSync() {
    console.log('[handleIncrementalSync] 开始增量同步...');
    setAuthStatus('同步中...', 'status-syncing');

    // 1. 建立 Watch（增量事件开始监听）
    await DAL.subscribeAll();

    // 2. 增量获取交易（fetchDelta 日常仅返回 0~100 条）
    const lastSyncAt = parseInt(localStorage.getItem('tb_lastCloudSyncAt') || '0');
    let delta = [];
    let deltaFetchSuccessful = false;
    
    if (lastSyncAt > 0) {
        const result = await DAL.fetchDelta(lastSyncAt);
        if (result !== null) {
            delta = result;
            deltaFetchSuccessful = true;
            console.log(`[handleIncrementalSync] fetchDelta 成功，获取到 ${delta.length} 条记录`);
        } else {
            console.warn('[handleIncrementalSync] fetchDelta 不可用，降级到全量');
            throw new Error('fetchDelta unavailable');
        }
    } else {
        // [v8.2.7] 无 lastSyncAt 时无法安全增量，抛出降级
        console.warn('[handleIncrementalSync] 无 lastSyncAt，无法确定增量范围，降级到全量');
        throw new Error('Missing lastSyncAt');
    }

    let syncSuccessful = deltaFetchSuccessful;

    if (delta.length > 0) {
        mergeTransactionDelta(delta);
        console.log(`[handleIncrementalSync] 已合并 ${delta.length} 条增量交易`);
    }

    // 3. 加载并智能合并任务（任务量通常不大，全量加载安全）
    const cloudTasks = await DAL.loadAllTasks();
    const tasksChanged = mergeTasksSmart(cloudTasks);
    if (tasksChanged) {
        console.log(`[handleIncrementalSync] 任务已更新: ${tasks.length}个`);
    }

    // 4. 加载 Profile 并恢复设置
    const profile = await DAL.loadProfile();
    if (profile) {
        profileData = profile;
        setCategoryColors(profile.categoryColors || []);
        setCollapsedCategories(profile.collapsedCategories || []);
        deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(profile.deletedTaskCategoryMap);

        // 恢复设备特定数据（分类排序等）
        const currentDeviceId = localStorage.getItem('tb_device_id');
        if (profile.deviceSpecificData && currentDeviceId) {
            const deviceData = profile.deviceSpecificData[currentDeviceId];
            if (deviceData && deviceData.categoryOrder) {
                const localCatOrder = localStorage.getItem('categoryOrder');
                if ((!localCatOrder || localCatOrder === '{\"earn\":[],\"spend\":[]}') && deviceData.categoryOrder) {
                    localStorage.setItem('categoryOrder', JSON.stringify(deviceData.categoryOrder));
                    if (typeof profileData !== 'undefined') {
                        profileData.categoryOrder = deviceData.categoryOrder;
                    }
                }
            }
        }

        // 恢复 screenTime 分类设置
        if (profile.screenTimeCategories) {
            const existingSTS = localStorage.getItem('screenTimeSettings');
            if (existingSTS && existingSTS !== '{}') {
                try {
                    const localSTS = JSON.parse(existingSTS);
                    if (profile.screenTimeCategories.earnCategory !== undefined) {
                        localSTS.earnCategory = profile.screenTimeCategories.earnCategory;
                    }
                    if (profile.screenTimeCategories.spendCategory !== undefined) {
                        localSTS.spendCategory = profile.screenTimeCategories.spendCategory;
                    }
                    localStorage.setItem('screenTimeSettings', JSON.stringify(localSTS));
                } catch (e) { /* ignore */ }
            }
        }
        // 恢复 sleep 分类设置
        if (profile.sleepTimeCategories) {
            const existingSleep = localStorage.getItem('sleepSettings');
            if (existingSleep && existingSleep !== '{}') {
                try {
                    const localSleep = JSON.parse(existingSleep);
                    if (profile.sleepTimeCategories.earnCategory !== undefined) {
                        localSleep.earnCategory = profile.sleepTimeCategories.earnCategory;
                    }
                    if (profile.sleepTimeCategories.spendCategory !== undefined) {
                        localSleep.spendCategory = profile.sleepTimeCategories.spendCategory;
                    }
                    localStorage.setItem('sleepSettings', JSON.stringify(localSleep));
                } catch (e) { /* ignore */ }
            }
        }

        // 恢复均衡模式和金融系统
        loadBalanceModeFromCloud(profile);
        if (typeof applyFinanceDataFromCloud === 'function' && (profile.financeSettings || profile.interestLedger)) {
            applyFinanceDataFromCloud(profile);
        }
    }

    // 5. 加载 runningTasks
    const loadedRunning = await DAL.loadRunningTasks();
    runningTasks = loadedRunning;
    console.log(`🔄 [handleIncrementalSync] 应用云端 runningTasks: ${loadedRunning?.size || 0}个`);

    // 6. 加载 Daily（云端权威）
    dailyChanges = await DAL.loadDailyChanges();

    // 7. 修复 completionCount、重建索引
    // [v9.1.0] 余额云端权威化：不再本地重算
    // 原因：handleIncrementalSync 路径下的 transactions 是云端推送的子集（不是全量），本地重算会得到不同结果
    // 余额的权威值在 profile.cachedBalance（DAL.loadAll 时已设置），此处不再覆盖
    // 如果余额与交易流不一致，用户可在设置页点击"重算余额"触发云端原子重算
    // [v9.0.11-fix] 修 + 写回云端：与 activeSync / loadAll 保持一致
    // 注意：handleIncrementalSync 路径下 transactions 是子集（云端推送的），所以严格来说
    // 这里的"修复"是临时性的，真正准确的值要等下次 loadAll
    // 为了不浪费云端写，我们只在明确差异时（stored>0 且与txCount不同）写回
    const __incrementalFixPromises = [];
    tasks.forEach(task => {
        const txCount = transactions.filter(t => t.taskId === task.id).length;
        const stored = task.completionCount || 0;
        if (txCount !== stored && stored > 0) {
            // 只有云端真有值（stored>0）且与子集不一致时才写回
            // 避免 transactions 缺失某些交易导致误判并写错
            console.log(`[completionCount 修复-incremental] taskId=${task.id}, 交易数=${txCount}, 存储=${stored} → 修正为${txCount}`);
            task.completionCount = txCount;
            __incrementalFixPromises.push(
                DAL.saveTask(task).catch(e => console.error(`[completionCount 修复-incremental] 写回云端失败: taskId=${task.id}`, e?.message || e))
            );
        }
    });
    if (__incrementalFixPromises.length > 0) {
        Promise.all(__incrementalFixPromises).then(() =>
            console.log(`[completionCount 修复-incremental] 写回 ${__incrementalFixPromises.length} 个任务到云端`)
        );
    }
    buildTransactionIndex();

    // 8. 启动主动同步
    startActiveSync();

    // [v8.2.16] 9. 仅在同步成功后才更新时间戳，防止时间基准漂移
    // 关键修复：如果 fetchDelta 失败，不能推进 lastSyncAt，否则会导致数据丢失
    if (syncSuccessful) {
        hasCompletedFirstCloudSync = true;
        lastCloudSyncAt = Date.now();
        localStorage.setItem('tb_lastCloudSyncAt', String(lastCloudSyncAt));
        console.log(`[handleIncrementalSync] 同步成功，更新时间戳: ${new Date(lastCloudSyncAt).toLocaleTimeString()}`);
    } else {
        console.warn(`[handleIncrementalSync] 同步失败，保持原时间戳: ${new Date(lastSyncAt).toLocaleTimeString()}`);
    }

    setAuthStatus('已同步 ✅', 'status-online');
    console.log(`[handleIncrementalSync] 完成: ${tasks.length}任务, ${transactions.length}交易, ${runningTasks.size}运行中`);
}

// --- App State ---
let currentBalance = 0; 
let tasks = []; 
let transactions = []; 

// [v7.37.0] 交易索引系统：Map<taskId, Transaction[]>，加速任务相关查询
let transactionIndex = new Map();

// [v9.0.4] P2-1: Proxy 自动云端同步机制
// 替代 v9.0.0 前 saveData 内部批量 saveProfile 的隐式云端同步
// 触发条件：3 个 profile 字段的 set/add/delete 操作
// 去抖窗口：300ms 避免短时间内多次同步
const _profileFieldSyncDebounce = {};

function _syncProfileFieldToCloud(fieldName, currentValue) {
    if (typeof isLoggedIn === 'undefined' || !isLoggedIn()) return;
    if (typeof hasCompletedFirstCloudSync === 'undefined' || !hasCompletedFirstCloudSync) return;
    if (!transactions || transactions.length === 0) return;
    if (typeof _ === 'undefined' || !DAL || typeof DAL.saveProfile !== 'function') return;

    if (_profileFieldSyncDebounce[fieldName]) {
        clearTimeout(_profileFieldSyncDebounce[fieldName]);
    }
    _profileFieldSyncDebounce[fieldName] = setTimeout(() => {
        let serializedValue;
        if (currentValue instanceof Map) {
            serializedValue = [...currentValue];
        } else if (currentValue instanceof Set) {
            serializedValue = [...currentValue];
        } else {
            serializedValue = currentValue;
        }
        DAL.saveProfile({ [fieldName]: serializedValue }).catch(e => {
            console.warn(`[v9.0.8] ${fieldName} 自动同步失败:`, e.message);
        });
    }, 300);
}

function _createSyncMapProxy(initial, fieldName) {
    const target = new Map(initial);
    return new Proxy(target, {
        get(t, prop, receiver) {
            const val = Reflect.get(t, prop, receiver);
            if (typeof val === 'function') {
                if (prop === 'set' || prop === 'delete' || prop === 'clear') {
                    return function(...args) {
                        const result = val.apply(t, args);
                        _syncProfileFieldToCloud(fieldName, t);
                        return result;
                    };
                }
                return val.bind(t);
            }
            return val;
        }
    });
}

function _createSyncSetProxy(initial, fieldName) {
    const target = new Set(initial);
    return new Proxy(target, {
        get(t, prop, receiver) {
            const val = Reflect.get(t, prop, receiver);
            if (typeof val === 'function') {
                if (prop === 'add' || prop === 'delete' || prop === 'clear') {
                    return function(...args) {
                        const result = val.apply(t, args);
                        _syncProfileFieldToCloud(fieldName, t);
                        return result;
                    };
                }
                return val.bind(t);
            }
            return val;
        }
    });
}

function _createSyncObjectProxy(initial, fieldName) {
    return new Proxy({...initial}, {
        set(t, prop, value, receiver) {
            const result = Reflect.set(t, prop, value, receiver);
            _syncProfileFieldToCloud(fieldName, t);
            return result;
        },
        // [v9.0.5] 补 deleteProperty 拦截：业务层 `delete reportState.xxx` 也会触发云端同步
        deleteProperty(t, prop) {
            const result = Reflect.deleteProperty(t, prop);
            _syncProfileFieldToCloud(fieldName, t);
            return result;
        },
        get(t, prop, receiver) {
            return Reflect.get(t, prop, receiver);
        }
    });
}

// [v9.0.4] P2-1 修复: Proxy 重赋值包装函数 - 防止业务层 "let xxx = new Map()" 破坏 Proxy 自动同步
// 场景: 加载本地缓存、加载云端 profile、数据导入、重置等场景下重新赋值, 必须重新包装为 Proxy
const _DEFAULT_REPORT_STATE = {
    heatmapDate: new Date(),
    analysisPeriod: '7d',
    analysisView: 'category',
    trendPeriod: '30d',
    trendView: 'category',
    tablePeriod: 'all',
    tableView: 'category',
    tableSortKey: 'amount_abs_desc',
    tableVisibleRows: 10,
    insightView: 'chart',
    insightSubViewIndex: 0
};

// [v9.0.8] 修复：_.set() 包装对象导致分类颜色丢失
// 根因：v9.0.4 _syncProfileFieldToCloud 错误地用 _.set() 包装数据，云端存储了 {fieldName, operands, operator}
// 修复：1) _syncProfileFieldToCloud 不再用 _.set() 包装；2) 加载时正确识别 _.set() 包装对象并提取原始值
function setCategoryColors(arr) {
    if (Array.isArray(arr)) {
        // 正常路径
    } else if (arr && typeof arr === 'object' && arr.operator === 'set' && Array.isArray(arr.operands)) {
        // [v9.0.8] _.set() 包装对象（如 {fieldName: {...}, operands: [["cat1","#fff"]], operator: "set"}）
        console.warn(`[v9.0.8] setCategoryColors 接收到 _.set() 包装对象，提取 operands 修复:`, arr);
        arr = arr.operands[0] || [];
    } else if (arr && typeof arr === 'object' && !(arr instanceof Date) && !(arr instanceof Map) && Object.keys(arr).length > 0) {
        // plain object 形如 {cat1: '#fff', cat2: '#000'} —— 尝试修复
        console.warn(`[v9.0.8] setCategoryColors 接收到 plain object，尝试用 Object.entries 修复:`, arr);
        arr = Object.entries(arr);
    } else {
        // null / undefined / 空 plain object / 其他无法修复
        console.warn(`[v9.0.8] setCategoryColors 接收到无法修复的类型 (${typeof arr}, keys=${arr && typeof arr === 'object' ? Object.keys(arr).length : 'n/a'})，降级为空 Map。原始值:`, arr);
        arr = [];
    }
    categoryColors = _createSyncMapProxy(arr, 'categoryColors');
}

// [v9.0.8] 修复：同 setCategoryColors
function setCollapsedCategories(arr) {
    if (Array.isArray(arr)) {
        // 正常路径
    } else if (arr && typeof arr === 'object' && arr.operator === 'set' && Array.isArray(arr.operands)) {
        // [v9.0.8] _.set() 包装对象
        console.warn(`[v9.0.8] setCollapsedCategories 接收到 _.set() 包装对象，提取 operands 修复:`, arr);
        arr = arr.operands[0] || [];
    } else if (arr && typeof arr === 'object' && !(arr instanceof Date) && !(arr instanceof Set) && Object.keys(arr).length > 0) {
        // plain object 形如 {cat1: true, cat2: true} —— 尝试提取 keys 修复
        console.warn(`[v9.0.8] setCollapsedCategories 接收到 plain object，尝试提取 keys 修复:`, arr);
        arr = Object.keys(arr);
    } else {
        console.warn(`[v9.0.8] setCollapsedCategories 接收到无法修复的类型，降级为空 Set。原始值:`, arr);
        arr = [];
    }
    collapsedCategories = _createSyncSetProxy(arr, 'collapsedCategories');
}

function setReportState(obj) {
    // 合并当前状态与新值, 重新包装为 Proxy 以保持自动同步
    const current = (reportState && typeof reportState === 'object') ? {...reportState} : {};
    const merged = { ..._DEFAULT_REPORT_STATE, ...current, ...(obj || {}) };
    reportState = _createSyncObjectProxy(merged, 'reportState');
}

let categoryColors = _createSyncMapProxy([], 'categoryColors');
let collapsedCategories = _createSyncSetProxy([], 'collapsedCategories');
let deletedTaskCategoryMap = {};
let profileData = null; 
let expandedTaskCategories = new Set(); // [v5.0.0] 记录已展开全部任务的分类
let runningTasks = new Map();
let currentEditingTask = null; 
let timerInterval = null; 
let dailyChanges = {}; 
let currentHistoryTask = null; 
let currentSelectedColor = null;
let activeMenuTaskId = null; // 用于在重绘时保持菜单打开状态
let currentBackdateTaskId = null; // [v3.11.0] For backdate modal
let currentBackdateMode = 'duration'; // [v3.11.0] 'duration' or 'range'
let isProcessingNudge = false; // [v4.3.8] 异步锁，防止 Habit Nudge 循环
        // [v4.5.0] 任务历史日历视图的状态
let currentHistoryView = 'list'; // 'list' or 'calendar'
let currentHistoryCalendarDate = new Date(); // 用于日历的月份导航

// [v4.5.2] Pie chart render optimization
let pendingPieRender = null;

// [v4.8.0] 本地保护机制：记录用户最后一次操作时间戳
let lastLocalActionTime = 0;

// [v6.0.0] 休眠恢复保护：记录页面进入休眠的时间
let lastHibernateTime = 0;
let isRecoveringFromHibernate = false; // 标记正在从休眠恢复


// [v9.0.4] P2-1: reportState 改为 Proxy 包装对象，set trap 自动触发云端同步
let reportState = _createSyncObjectProxy({
    heatmapDate: new Date(),
    analysisPeriod: '7d', // [v5.1.0] Default to 7 days
    analysisView: 'category',
    trendPeriod: '30d',
    trendView: 'category',
    tablePeriod: 'all',
    tableView: 'category',
    tableSortKey: 'amount_abs_desc',
    tableVisibleRows: 10,
    insightView: 'chart',
    insightSubViewIndex: 0
}, 'reportState');
const REPORT_STATE_KEY = 'reportState';
// [v3.15.0] Added habitNudge settings
	// [v4.6.1] Added floatingTimer setting
// [v7.1.7] 通知设置改为纯本地存储，不再同步到云端
let notificationSettings = { 
    achievement: true, 
    habitNudgeEnabled: false,
    habitNudgeTime: '21:00',
    lastNudgeDate: null,
	floatingTimerPermissionPrompted: false,
	floatingTimer: true // [New] 默认开启悬浮窗
};

// [v7.20.3] 启动与后台设置
let startupBackgroundSettings = {
    bootAutoStartEnabled: true
};
const STARTUP_BACKGROUND_SETTINGS_KEY = 'startupBackgroundSettings';

// [v7.3.0] 均衡模式设置
let balanceMode = {
    enabled: false,
    enabledAt: null  // 开启时间戳
};
const BALANCE_MODE_KEY = 'balanceMode'; // [v7.3.3] 本地存储 key

function formatMultiplierValue(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '1';
    return num.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

// [v7.11.1] 保存均衡模式到云端（云端唯一真相）
function saveBalanceModeLocal() {
    // 异步同步到云端
    if (isLoggedIn()) {
        const _ = cloudbase.database().command;
        DAL.saveProfile({ balanceMode: _.set(balanceMode) }).catch(e => {
            console.warn('[saveBalanceModeLocal] 云端同步失败:', e.message);
        });
    }
}

// [v7.11.1] 本地不再加载均衡模式（云端唯一真相）
function loadBalanceModeLocal() {
    return;
}

// [v7.1.7] 通知设置本地存储 key
const NOTIFICATION_SETTINGS_KEY = 'notificationSettings';

// [v7.1.7] 保存通知设置到本地
function saveNotificationSettings() {
    try {
        localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(notificationSettings));
    } catch (e) {
        console.error('[saveNotificationSettings] 保存失败:', e);
    }
}

// [v7.1.7] 从本地加载通知设置
function loadNotificationSettings() {
    try {
        const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            notificationSettings = { ...notificationSettings, ...parsed };
        }
    } catch (e) {
        console.error('[loadNotificationSettings] 加载失败:', e);
    }
}

function saveStartupBackgroundSettings() {
    try {
        localStorage.setItem(STARTUP_BACKGROUND_SETTINGS_KEY, JSON.stringify(startupBackgroundSettings));
    } catch (e) {
        console.error('[saveStartupBackgroundSettings] 本地保存失败:', e);
    }

    if (window.Android?.setBootAutoStartEnabled) {
        try {
            Android.setBootAutoStartEnabled(!!startupBackgroundSettings.bootAutoStartEnabled);
        } catch (e) {
            console.warn('[saveStartupBackgroundSettings] 原生同步失败:', e.message || e);
        }
    }
}

function loadStartupBackgroundSettings() {
    try {
        const saved = localStorage.getItem(STARTUP_BACKGROUND_SETTINGS_KEY);
        if (saved) {
            startupBackgroundSettings = { ...startupBackgroundSettings, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('[loadStartupBackgroundSettings] 本地加载失败:', e);
    }

    if (window.Android?.isBootAutoStartEnabled) {
        try {
            startupBackgroundSettings.bootAutoStartEnabled = !!Android.isBootAutoStartEnabled();
        } catch (e) {
            console.warn('[loadStartupBackgroundSettings] 原生读取失败:', e.message || e);
        }
    }
}

// [v7.9.9] Android 三键导航栏适配
function setAndroidNavBarInset(px) {
    const value = Math.max(0, parseInt(px, 10) || 0);
    document.documentElement.style.setProperty('--android-nav-bottom', value + 'px');
}
window.__setAndroidNavBarHeight = setAndroidNavBarInset;

// [v5.2.0] 动态应用列表缓存
let dynamicAppList = null;
let dynamicAppListFetched = false; // 避免每次打开编辑都重新拉取应用列表
let appDropdownVisible = false;

function populateAppSuggestions() {
    if (dynamicAppListFetched) return; // 已经尝试加载过，避免重复耗时调用
    dynamicAppListFetched = true;

    // [v5.2.0] 预加载已安装应用列表
    if (typeof Android !== 'undefined' && Android.getInstalledApps) {
        try {
            const appsJson = Android.getInstalledApps();
            dynamicAppList = JSON.parse(appsJson);
            dynamicAppList.sort((a, b) => a.appName.localeCompare(b.appName, 'zh'));
            console.log(`[AppList] Loaded ${dynamicAppList.length} installed apps`);
        } catch (e) {
            console.error('[AppList] Failed to load:', e);
            dynamicAppList = null;
        }
    }
}

function showAppDropdown() {
    const dropdown = document.getElementById('appDropdownList');
    if (!dropdown) return;
    
    // 如果有动态列表，显示下拉
    if (dynamicAppList && dynamicAppList.length > 0) {
        filterAppList();
        dropdown.classList.remove('hidden');
        appDropdownVisible = true;
    }
}

function hideAppDropdown() {
    const dropdown = document.getElementById('appDropdownList');
    if (dropdown) {
        dropdown.classList.add('hidden');
        appDropdownVisible = false;
    }
}

function filterAppList() {
    const dropdown = document.getElementById('appDropdownList');
    const input = document.getElementById('taskAppPackage');
    if (!dropdown || !input) return;
    
    const filter = input.value.toLowerCase().trim();
    // [v7.11.1] 手动修改输入时清除旧的选中包名，避免保存回退
    if (input.dataset.selectedPackage) {
        const selectedName = resolveAppInputValue(input.dataset.selectedPackage);
        if (input.value.trim() !== selectedName && input.value.trim() !== input.dataset.selectedPackage) {
            delete input.dataset.selectedPackage;
        }
    }
    
    // 优先使用动态列表，降级使用内置词典
    let apps = [];
    if (dynamicAppList && dynamicAppList.length > 0) {
        apps = dynamicAppList;
    } else {
        // 降级：使用内置 APP_DIRECTORY
        apps = Object.entries(APP_DIRECTORY).map(([name, pkg]) => ({
            appName: name,
            packageName: pkg
        }));
    }
    
    // 过滤匹配
    const filtered = apps.filter(app => 
        app.appName.toLowerCase().includes(filter) || 
        app.packageName.toLowerCase().includes(filter)
    ).slice(0, 20); // 最多显示 20 个
    
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="app-dropdown-item" style="color: var(--text-color-light); cursor: default;">无匹配应用，可直接输入包名</div>';
    } else {
        dropdown.innerHTML = filtered.map(app => `
            <div class="app-dropdown-item" onclick="selectApp('${app.packageName}', '${app.appName.replace(/'/g, "\\'")}')">
                <div class="app-dropdown-item-name">${app.appName}</div>
                <div class="app-dropdown-item-pkg">${app.packageName}</div>
            </div>
        `).join('');
    }
    
    dropdown.classList.remove('hidden');
    appDropdownVisible = true;
}

function selectApp(packageName, appName) {
    const input = document.getElementById('taskAppPackage');
    if (input) {
        // 显示应用名，实际值存储包名
        input.value = appName;
        input.dataset.selectedPackage = packageName;
    }
    hideAppDropdown();
}

// 点击外部关闭下拉列表
document.addEventListener('click', function(e) {
    if (appDropdownVisible) {
        const dropdown = document.getElementById('appDropdownList');
        const input = document.getElementById('taskAppPackage');
        if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
            hideAppDropdown();
        }
    }
});

function resolveAppInputValue(appPackage) {
    if (!appPackage) return '';
    // 先从动态列表查找
    if (dynamicAppList) {
        const found = dynamicAppList.find(app => app.packageName === appPackage);
        if (found) return found.appName;
    }
    // 降级：从内置词典查找
    const entry = Object.entries(APP_DIRECTORY).find(([, pkg]) => pkg === appPackage);
    return entry ? entry[0] : appPackage;
}

// [v5.2.0] 获取实际包名（处理用户输入应用名的情况）
function resolveAppPackage(inputValue) {
    if (!inputValue) return '';
    
    // 1. 检查是否有选中的包名
    const input = document.getElementById('taskAppPackage');
    if (input && input.dataset.selectedPackage) {
        const selectedPkg = input.dataset.selectedPackage;
        const selectedName = resolveAppInputValue(selectedPkg);
        if (inputValue === selectedName || inputValue === selectedPkg) {
            return selectedPkg;
        }
    }
    
    // 2. 从动态列表查找
    if (dynamicAppList) {
        const found = dynamicAppList.find(app => 
            app.appName === inputValue || app.packageName === inputValue
        );
        if (found) return found.packageName;
    }
    
    // 3. 从内置词典查找
    if (APP_DIRECTORY.hasOwnProperty(inputValue)) {
        return APP_DIRECTORY[inputValue];
    }
    
    // 4. 直接作为包名使用
    return inputValue;
}

// --- [v4.0.0] Sync State ---
// [v7.1.4] 已移除 LeanCloud 专用变量: cloudDataObject, liveQuery, lastCloudUpdateTime, localDataVersion
// [v9.0.1] 已移除 isSaving / isSyncing / saveQueue：
//   v9.0.0 服务端权威写入架构下，客户端不再直接写 DB，isSaving "防并发保存"已无意义；
//   isSyncing 在 v4.3.2 已从 UI 路径移除，saveQueue 也从未被使用。
// CloudBase 用户使用 DAL 的 watch 实时监听功能

// [v4.8.7] 启动同步锁：防止App启动时旧数据自动保存覆盖云端新数据
let hasCompletedFirstCloudSync = false;

// [v7.28.0] 陈旧端写入门禁：防止长期不活跃的端用陈旧本地数据覆盖云端
let lastCloudSyncAt = parseInt(localStorage.getItem('tb_lastCloudSyncAt') || '0');

const earnColors = [ '#007f5f', '#2b9348', '#55a630', '#80b918', '#aacc00', '#bfd200', '#d4d700', '#dddf00', '#eeef20', '#ffff3f', '#ade8f4', '#48cae4', '#00b4d8', '#0096c7', '#0077b6', '#023e8a' ];
const spendColors = [ '#ffd166', '#ffbe0b', '#fca311', '#fb5607', '#e85d04', '#dc2f02', '#9d0208', '#c9184a', '#ff006e', '#ef476f', '#ff4d6d', '#ff8fa3', '#ffb3c1', '#f78c6b', '#a4133c', '#8338ec' ];
// [v3.10.3] Standardized colors for task view
const TASK_VIEW_EARN_COLORS = ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9'];
const TASK_VIEW_SPEND_COLORS = ['#f44336', '#FF5722', '#FF9800', '#FFC107', '#F8BBD0'];
const OTHER_COLOR = '#BDBDBD'; // [v3.10.4] Lighter Gray (was #9E9E9E)
// [v6.0.0] “其他”分类专用颜色 - 融入各自色系
const OTHER_EARN_COLOR = '#78909C';  // 蓝灰色，融入绿/蓝色系
const OTHER_SPEND_COLOR = '#F48FB1'; // 粉红色，融入红/橙色系

// [v5.2.0] 系统任务常量（用于屏幕时间管理等系统级奖惩）
const SYSTEM_CATEGORY = '系统';
const SYSTEM_CATEGORY_COLOR = '#607D8B'; // 蓝灰色
// [v7.16.1] 系统子分类常量
const INTEREST_CATEGORY = '利息';
const INTEREST_CATEGORY_COLOR = '#D4AF37'; // [v7.20.3-fix] 黄金色
const SCREEN_TIME_CATEGORY = '屏幕';
// [v7.16.1] 屏幕→蓝绿系、睡眠→红色系备选（避开用户已选颜色）
const SCREEN_TIME_COLORS = ['#26A69A', '#009688', '#00897B', '#00796B', '#00ACC1', '#0097A7'];
const SLEEP_CATEGORY = '睡眠';
const SLEEP_CATEGORY_COLOR = '#3949AB'; // [v7.20.3-fix] 睡眠默认色改为夜色蓝（单一默认色）
const SYSTEM_TASKS = {
    SCREEN_TIME: {
        id: 'system-screen-time',
        name: '屏幕时间管理',
        category: SYSTEM_CATEGORY,
        isSystem: true
    }
};

// [v4.12.0] Bootstrapper: 检查并初始化示例数据
async function checkAndBootstrap() {
    // 直接读取原始字符串，不解析 JSON，速度最快且不报错
    const rawData = localStorage.getItem('timeBankData');
    const hasVisited = localStorage.getItem('tb_has_visited');

    // 判定标准：既没有数据主文件，也没有"已访问"标记，才是纯粹的新用户
    if (!rawData && !hasVisited) {
        localStorage.setItem('tb_has_visited', 'true');
        showFirstLaunchDemoModal();
        return true;
    }
    return false; // 老用户
}

// [v7.10.0] 首次启动示例数据引导弹窗
function showFirstLaunchDemoModal() {
    if (localStorage.getItem('tb_first_launch_demo_shown') === 'true') return;
    localStorage.setItem('tb_first_launch_demo_shown', 'true');

    const content = `
        <div style="text-align: left; font-size: 0.95rem; line-height: 1.7;">
            <p style="margin-bottom: 8px;"><strong>👋 欢迎使用 Time Bank</strong></p>
            <p style="margin-bottom: 12px; color: var(--text-color-light);">导入示例数据，可快速体验“获得时间”和“消费时间”的完整流程。</p>
            <div class="demo-intro-preview">
                <div class="demo-task-card">
                    <div class="demo-task-icon">🏃</div>
                    <div class="demo-task-info">
                        <div class="demo-task-name">晨跑 5 公里</div>
                        <div class="demo-task-meta">获得 · 健康</div>
                    </div>
                    <span class="demo-task-tag">获得</span>
                </div>
                <div class="demo-task-card">
                    <div class="demo-task-icon">🎮</div>
                    <div class="demo-task-info">
                        <div class="demo-task-name">王者荣耀</div>
                        <div class="demo-task-meta">消费 · 娱乐</div>
                    </div>
                    <span class="demo-task-tag">消费</span>
                </div>
            </div>
            <div style="display:flex; gap:12px; margin-top: 16px;">
                <button class="btn btn-secondary" style="flex:1;" onclick="hideInfoModal()">稍后再说</button>
                <button class="btn btn-primary" style="flex:1;" onclick="importDemoFromFirstLaunch()">导入示例数据</button>
            </div>
        </div>
    `;
    showInfoModal('新手引导', content);
}

// [v7.10.0] 首次启动导入示例数据
async function importDemoFromFirstLaunch() {
    localStorage.setItem('tb_onboarding_pending', 'true');
    hideInfoModal();
    await initDemoData();
}

// --- App Initialization and Core UI ---

// [v4.0.0] Modified initApp
// [v6.6.0] CloudBase 版本
async function initApp() {
    console.log("App v9.0.10 Starting (Watch 完善版: 主动心跳+8次上限+自愈探针+4状态指示器+诊断面板)...");

    // [v9.0.10 完善] 启动早期恢复 Watch 降级状态（跨刷新保留 + 自愈探针接管）
    __safeSetup('initWatchDegradeState', __initWatchDegradeState);

    // 1. 检查 CloudBase 登录状态并刷新缓存
    // 重要：SDK 初始化后，登录状态恢复是异步的，需要轮询等待
    let loginState = null;
    const MAX_RETRIES = 10;
    const RETRY_INTERVAL = 300; // 每 300ms 重试一次

    for (let i = 0; i < MAX_RETRIES; i++) {
        loginState = await refreshLoginState();

        // 检查是否获取到了有效的用户 UID
        const uid = loginState?.user?.uid;
        if (uid) {
            console.log(`[initApp] 第 ${i + 1} 次尝试成功，获取到 UID:`, uid);
            break;
        }

        console.log(`[initApp] 第 ${i + 1} 次尝试获取登录状态失败，${RETRY_INTERVAL}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }

    console.log('[initApp] 最终登录状态:', loginState ? 'logged in' : 'not logged in');
    console.log('[initApp] 最终 UID:', loginState?.user?.uid);
    updateAuthUI(loginState);

    // 1.5 引导程序：如需首次初始化示例数据
    await checkAndBootstrap();

    // [v7.2.3] 尽早初始化设备ID（DAL.loadAll 需要用到）
    initDeviceId();

    // [v7.11.4] 加载报告视图本地偏好（分类/任务/周期等）
    loadReportStateLocal();

    // [v9.0.6 hotfix-2] 防御性自愈：检测并修复 localStorage 中损坏的字段（plain object 误存为 Map/Set 字段）
    // 触发场景：v9.0.5 修复任务复活期间的 race condition 可能让 runningTasks/categoryColors/collapsedCategories
    // 字段被错误地存为 plain object（如 "{}"），导致后续 new Map(plainObject) 抛 "object is not iterable"
    // 自愈策略：
    //   - 正常数组 → 通过
    //   - plain object {k1: v1, k2: v2} → 尝试用 Object.entries/Object.keys 修复
    //   - 空 plain object {} / null / 其他无法修复 → 备份到 *Corrupted 键后重置为空
    if (USE_LOCAL_CACHE) {
        try {
            const raw = localStorage.getItem('timeBankData');
            if (raw) {
                const parsed = JSON.parse(raw);
                let needsRepair = false;
                // [v9.0.9] 彻底移除本地缓存中的 runningTasks
                // 根因：runningTasks 是瞬时状态，由云端 tb_running 表作为唯一权威源。
                // 本地缓存中的 runningTasks（即使是正常数组）会导致幽灵任务复活。
                if (parsed.runningTasks !== undefined) {
                    if (!Array.isArray(parsed.runningTasks)) {
                        console.warn('[v9.0.9] initApp 自愈: runningTasks 非数组，备份后删除');
                        localStorage.setItem('timeBankData_runningTasksCorrupted', JSON.stringify(parsed.runningTasks));
                    } else if (parsed.runningTasks.length > 0) {
                        console.warn(`[v9.0.9] initApp 自愈: 删除本地缓存中的 ${parsed.runningTasks.length} 个 runningTasks，由云端权威管理`);
                    }
                    delete parsed.runningTasks;
                    needsRepair = true;
                }
                if (parsed.categoryColors !== undefined && !Array.isArray(parsed.categoryColors)) {
                    if (parsed.categoryColors && typeof parsed.categoryColors === 'object' && !(parsed.categoryColors instanceof Date) && Object.keys(parsed.categoryColors).length > 0) {
                        console.warn('[v9.0.6 hotfix-2] initApp 自愈: categoryColors 是 plain object，尝试用 Object.entries 修复');
                        parsed.categoryColors = Object.entries(parsed.categoryColors);
                    } else {
                        console.warn('[v9.0.6 hotfix-2] initApp 自愈: categoryColors 无法修复，重置为空');
                        localStorage.setItem('timeBankData_categoryColorsCorrupted', JSON.stringify(parsed.categoryColors));
                        parsed.categoryColors = [];
                    }
                    needsRepair = true;
                }
                if (parsed.collapsedCategories !== undefined && !Array.isArray(parsed.collapsedCategories)) {
                    if (parsed.collapsedCategories && typeof parsed.collapsedCategories === 'object' && !(parsed.collapsedCategories instanceof Date) && Object.keys(parsed.collapsedCategories).length > 0) {
                        console.warn('[v9.0.6 hotfix-2] initApp 自愈: collapsedCategories 是 plain object，尝试用 Object.keys 修复');
                        parsed.collapsedCategories = Object.keys(parsed.collapsedCategories);
                    } else {
                        console.warn('[v9.0.6 hotfix-2] initApp 自愈: collapsedCategories 无法修复，重置为空');
                        localStorage.setItem('timeBankData_collapsedCategoriesCorrupted', JSON.stringify(parsed.collapsedCategories));
                        parsed.collapsedCategories = [];
                    }
                    needsRepair = true;
                }
                if (needsRepair) {
                    localStorage.setItem('timeBankData', JSON.stringify(parsed));
                    console.log('[v9.0.6 hotfix-2] localStorage 自愈完成');
                }
            }
        } catch (e) {
            console.warn('[v9.0.6 hotfix-2] localStorage 自愈检测失败:', e.message);
        }
    }

    // 2. Load Data
    const currentUid = await DAL.getCurrentUid();
    const hasSyncState = auth && typeof auth.hasLoginState === 'function' ? auth.hasLoginState() : null;
    if (currentUid) {
        try {
            // [v9.1.0] 改造 A: 删除本地缓存秒开路径，强制走云端唯一入口
            // 根因：applyDataState 秒开 + 后台增量同步存在 4 类 drift 风险
            //   (1) 启动瞬间 5 个 watch 抢 WebSocket 失败
            //   (2) Watch onChange `update` 分支不修正 balance/dailyChanges
            //   (3) Watch 漏推时无全量重算兜底
            //   (4) silent bootstrap 用本地覆盖云端
            // 方案 3（纯云端）第一步：业务数据完全由云端权威管理，本地仅作 UI 偏好渲染
            await handlePostLoginDataInit('initApp');
        } catch (e) {
            console.error('[initApp] 数据加载失败:', e);
            // [v9.0.6 hotfix-1] 增加详细错误堆栈，方便定位具体的失败位置
            console.error('[initApp] 错误堆栈:', e?.stack);
            console.error('[initApp] localStorage.timeBankData 前 200 字符:', (localStorage.getItem('timeBankData') || '').substring(0, 200));
            // [v7.9.0] 数据加载失败时，确保 hasCompletedFirstCloudSync 保持 false
            // 这会阻止任何云端保存操作，防止空数据覆盖云端
            hasCompletedFirstCloudSync = false;
            showAlert('数据加载失败: ' + e.message + '\n\n为防止数据丢失，云端同步已暂停。请刷新页面重试。', '错误');
        }
    } else if (IS_WEB_ONLY && hasSyncState) {
        // 网页端登录状态可能尚未恢复，先等待云端 UID 可用
        console.warn('[initApp] Web login state pending, delay local load');
        hasCompletedFirstCloudSync = false;
        scheduleWebLoginRestore('initApp');
    } else {
        // [v9.1.0] 改造 A: 未登录用户不再使用本地业务数据
        // 仅恢复 UI 偏好（主题/分类颜色/折叠等），业务数据保持为空
        // 引导用户登录后由 handlePostLoginDataInit 加载云端数据
        console.warn('[initApp] 未登录：仅恢复 UI 偏好，业务数据由登录后云端加载');
        try {
            if (USE_LOCAL_CACHE) {
                applyUIPrefs(getLocalData());
            }
        } catch (uiErr) {
            console.warn('[initApp] UI 偏好恢复失败:', uiErr);
        }
        showNotification('⚠️ 请先登录', '未登录状态下不会显示业务数据', 'warning');
    }

    populateAppSuggestions();

    // 3. Init UI components
    renderColorSelectors();
    // [v7.1.7] 先加载本地通知设置，再更新 UI
    loadNotificationSettings();
    loadStartupBackgroundSettings();
    try { updateNotificationSettingsUI(); } catch (e) { console.error('[initApp] updateNotificationSettingsUI failed:', e); }
    try { updateStartupBackgroundSettingsUI(); } catch (e) { console.error('[initApp] updateStartupBackgroundSettingsUI failed:', e); }
    // [v7.11.2] 添加 try-catch 保护，确保设置初始化互不阻断
    try { initScreenTimeSettings(); } catch (e) { console.error('[initApp] initScreenTimeSettings failed:', e); }
    try { initSleepSettings(); } catch (e) { console.error('[initApp] initSleepSettings failed:', e); }
    // [v7.16.2] 冷启动恢复：如果上次有未完成的倒计时且已过期，立即开始睡眠记录
    try {
        const persistedCountdown = localStorage.getItem('sleepCountdownState');
        if (persistedCountdown && !sleepState.isSleeping) {
            const cd = JSON.parse(persistedCountdown);
            if (cd.active && cd.endTime > 0 && Date.now() >= cd.endTime) {
                console.log('[Sleep] 冷启动恢复：检测到过期的倒计时，开始睡眠记录, endTime:', new Date(cd.endTime).toLocaleString());
                sleepCountdownState.endTime = cd.endTime;
                sleepCountdownState.active = true;
                startSleepRecording();
            }
        }
    } catch (e) { console.error('[initApp] 倒计时恢复失败:', e); }
    // [v8.2.10] 初始化金融系统（在数据加载完成后执行，确保云端数据已恢复）
    try { initFinanceSystem(); } catch (e) { console.error('[initApp] initFinanceSystem failed:', e); }
    // [v7.15.0] 初始化余额卡片展开状态
    try { initBalanceCardFinanceState(); } catch (e) { console.error('[initApp] initBalanceCardFinanceState failed:', e); }
    // [v7.16.2] 初始化任务显示数量设置
    try { initTaskDisplaySettings(); } catch (e) { console.error('[initApp] initTaskDisplaySettings failed:', e); }
    // [v7.1.3] 初始化主题设置（从 localStorage 加载，不同步云端）
    const savedTheme = localStorage.getItem('themePreference') || 'system';
    applyTheme(savedTheme);
    initAccentTheme(); // [v6.0.0] 初始化主题色
    initCardVisualMode(); // [v7.20.2] 初始化三态卡片风格
    initBackground(); // [v6.0.0] 初始化背景
    startGlobalTimer(); 
    
    // [v7.9.6] 执行所有自动结算（静默执行，无报告弹窗）
    setTimeout(() => {
        try {
            console.log('[AutoSettlement] === 自动结算触发 ===');
            
            // [v7.15.4] 0. 启动时自动清理重复利息交易
            try {
                autoDeduplicateInterest();
            } catch (e) {
                console.error('[AutoSettlement] 利息去重失败:', e);
            }
            
            // 2. 自动结算屏幕时间
            try {
                autoSettleScreenTime();
            } catch (e) {
                console.error('[AutoSettlement] 屏幕时间结算失败:', e);
            }
            
            // 3. 戒除习惯完成检查
            try {
                checkAbstinenceHabits();
            } catch (e) {
                console.error('[AutoSettlement] 戒除习惯检查失败:', e);
            }
            
            // [v7.15.0] 4. 每日利息结算
            try {
                checkAndSettleInterest();
            } catch (e) {
                console.error('[AutoSettlement] 利息结算失败:', e);
            }
            
            console.log('[AutoSettlement] 所有自动结算已完成');
        } catch (e) {
            console.error('[AutoSettlement] 自动结算错误:', e);
        }
    }, 1500); // 延迟1.5秒，确保所有初始化完成
    
    // [v4.8.1] Immediately check reminders on init
    try { checkReminders(); } catch (e) { console.error('checkReminders failed on init', e); }
    // [v7.1.0] Check for expired abstinence plans
    try { checkAbstinencePlanExpiry(); } catch (e) { console.error('checkAbstinencePlanExpiry failed on init', e); }
    
    if ('Notification' in window && notificationSettings.achievement && Notification.permission === 'default') { 
        requestNotificationPermission(); 
    } 
    __safeSetup('setupReportEventListeners', setupReportEventListeners);
    __safeSetup('setupTaskModalEventListeners', setupTaskModalEventListeners);
    applyCardLayout(); // [v4.6.0] 应用卡片布局
    initCardStack(); // [v5.10.0] 初始化卡片堆叠
    
    // [v6.6.0] 更新云端状态 UI
    updateCloudStatusUI();
    
    // [v7.14.1] 初始化 Tab 指示器位置
    initTabIndicator();

    // [v8.2.0] 初始化 AI 伙伴卡片（延迟执行，避免阻塞启动）
    setTimeout(() => {
        if (typeof initCompanionCard === 'function') {
            initCompanionCard().catch(e => console.error('[initApp] initCompanionCard failed:', e));
        }
    }, 2000);

    // [v8.2.0] 初始化 AI 认知 UI 和定时同步检查
    setTimeout(() => {
        if (typeof initAICognitionUI === 'function') {
            initAICognitionUI();
        }
    }, 3500);

    // [v8.2.0] 启动定时同步检查（每 60 秒检查一次）
    setInterval(() => {
        if (typeof COGNITION_SERVICE !== 'undefined' && COGNITION_SERVICE.checkScheduledSync) {
            COGNITION_SERVICE.checkScheduledSync();
        }
    }, 60000);
}

// [v9.0.10 修复] updateCloudStatusUI 已迁移到 updateWatchStatusUI（消除重复声明 SyntaxError）
// 保留 updateCloudStatusUI 作为薄包装，调用 updateWatchStatusUI（见文件下方）

// [v9.0.10 完善] 启动时恢复 Watch 降级状态 + 自愈探针（跨刷新持续）
// 必须在 initApp 早期调用
function __initWatchDegradeState() {
    try {
        __loadWatchDegradeState();
        // 如果上次是 paused 状态且已登录，启动自愈探针接管（不等用户）
        if (__watchDegradeStatus === 'paused' && typeof isLoggedIn === 'function' && isLoggedIn()) {
            console.log('💚 [Watch] 检测到上次降级状态，启动自愈探针接管');
            __startWatchSelfHealingProbe();
            __startSelfHealingCountdownTicker();
        }
        if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
    } catch (e) {
        console.warn('[Watch] 初始化降级状态失败:', e?.message);
    }
}

// [v9.0.10 完善] 显示 Watch 诊断面板（点击状态条触发）
function showWatchDiagnostics() {
    try {
        const modal = document.getElementById('watchDiagnosticsModal');
        if (!modal) {
            // 诊断面板未在 index.html 中实现 → fallback 到 console 输出
            console.log('[Watch] === 诊断信息 ===');
            console.log('状态：', __watchDegradeStatus);
            console.log('失败次数：', __watchFailCount, '/', typeof MAX_RECONNECT_ATTEMPTS !== 'undefined' ? MAX_RECONNECT_ATTEMPTS : 8);
            console.log('失败原因：', __watchLastReason);
            console.log('自愈探针：', __watchSelfHealingTimer ? '运行中' : '未启动', `(${__watchSelfHealingProbeCount} 次)`);
            console.log('自愈倒计时：', __watchSelfHealingCountdown, 's');
            console.log('最后心跳：', __watchLastHeartbeatAt ? new Date(__watchLastHeartbeatAt).toLocaleString('zh-CN') : '无');
            console.log('首次失败：', __watchFirstFailAt ? new Date(__watchFirstFailAt).toLocaleString('zh-CN') : '无');
            if (typeof showToast === 'function') showToast('诊断信息已输出到控制台（F12）');
            return;
        }
        // 填充弹窗字段
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setText('diagStatus', __watchDegradeStatus);
        setText('diagFailCount', `${__watchFailCount} / ${typeof MAX_RECONNECT_ATTEMPTS !== 'undefined' ? MAX_RECONNECT_ATTEMPTS : 8}`);
        setText('diagLastReason', __watchLastReason || '无');
        setText('diagProbeCount', __watchSelfHealingProbeCount);
        setText('diagCountdown', __watchSelfHealingTimer ? `${__watchSelfHealingCountdown}s` : '未运行');
        setText('diagLastHeartbeat', __watchLastHeartbeatAt ? new Date(__watchLastHeartbeatAt).toLocaleString('zh-CN') : '无');
        setText('diagFirstFailAt', __watchFirstFailAt ? new Date(__watchFirstFailAt).toLocaleString('zh-CN') : '无');
        modal.classList.add('show');
    } catch (e) {
        console.error('[Watch] 显示诊断面板失败:', e?.message);
    }
}

function closeWatchDiagnostics() {
    const modal = document.getElementById('watchDiagnosticsModal');
    if (modal) modal.classList.remove('show');
}

// [v9.0.10 完善] 用户主动重置 Watch（设置页按钮触发）
async function handleResetWatch() {
    if (!confirm('确认重置 Watch 连接？\n\n将清零重试计数器、停止自愈探针、立即重建监听。')) return;
    try {
        // 1. 重置所有状态
        if (typeof watchReconnectAttempts !== 'undefined') {
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
        }
        __watchDegradeStatus = 'ok';
        __watchFailCount = 0;
        __watchFirstFailAt = 0;
        __watchLastReason = '';
        __watchSelfHealingCountdown = 60;
        __watchSelfHealingProbeCount = 0;
        __recordWatchDegrade();
        // 2. 停止自愈探针 + 心跳
        __stopWatchSelfHealingProbe();
        __stopWatchHeartbeat();
        // 3. 触发 UI 更新
        if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
        // [v9.0.10 修复] "重置 Watch"按钮已迁移到监听状态显示器，不再需要单独控制 #resetWatchButton
        // 4. 立即重新订阅
        if (typeof DAL !== 'undefined' && DAL.unsubscribeAll && DAL.subscribeAll) {
            await DAL.unsubscribeAll();
            await DAL.subscribeAll();
            // subscribeAll 成功会自动启动心跳保活
            if (typeof showToast === 'function') showToast('✅ Watch 连接已重置');
        } else {
            if (typeof showToast === 'function') showToast('⚠️ DAL 不可用，请刷新页面');
        }
    } catch (e) {
        console.error('[Watch] 重置失败:', e?.message);
        if (typeof showToast === 'function') showToast('❌ 重置失败：' + (e?.message || e));
        // 重置失败 → 回到 paused 状态，启动自愈探针
        __watchDegradeStatus = 'paused';
        __startWatchSelfHealingProbe();
        __startSelfHealingCountdownTicker();
        if (typeof updateCloudStatusUI === 'function') updateCloudStatusUI();
    }
}

function startGlobalTimer() { 
    if (timerInterval) clearInterval(timerInterval); 
    timerInterval = setInterval(() => { 
        updateRunningTimers(); 
        checkReminders(); 
        // [v7.4.0] 睡眠中时更新时长显示
        if (sleepState && sleepState.isSleeping) {
            updateSleepDurationDisplay();
        }
    }, 1000); 
}

// [v7.39.6] checkHabitStreak 已移除：isBroken 状态已删除，streak=0 直接表示断签
function refreshHabitStatuses() {
    // 无需额外状态同步，streak 值由 rebuildHabitStreak 维护
}

function updateAllUI() {
    // [v9.0.1] isSyncing / isSaving 已被移除，UI 刷新无任何同步锁拦截
    refreshHabitStatuses();
    updateRecentTasks();
    updateCategoryTasks();
    updateBalance();
    updateWidgets(); // [v5.10.0] 同步更新桌面小组件
    updateBalanceModeUI(); // [v7.3.0] 更新均衡模式UI
    updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示
    if(document.getElementById('reportTab').classList.contains('active')) {
        updateAllReports();
    }
    updateDemoCTAVisibility();
}


// --- Swipe Navigation ---
function setupSwipeNavigation() {
    // [v5.0.0] 使用新的滚动容器
    const container = document.getElementById('appScrollContainer') || document.querySelector('.main-container');
    if (!container) return;
    let startX = 0, startY = 0, isTracking = false;

    const shouldIgnore = (target) => {
        // 如果任务卡片拖动激活中，忽略滑动
        if (typeof isTaskDragging !== 'undefined' && isTaskDragging) return true;
        // 如果日历长按激活中，忽略滑动
        if (typeof heatmapTooltipLongPressActive !== 'undefined' && heatmapTooltipLongPressActive) return true;
        // [v5.1.1] 如果时间流图长按激活中，忽略滑动
        if (typeof flowTooltipLongPressActive !== 'undefined' && flowTooltipLongPressActive) return true;
        // 移除 .heatmap-grid 的无条件屏蔽，允许在日历上左右滑动切换页签
        return !!(target.closest('.modal') || target.closest('input, textarea, select') || target.closest('.task-card-menu'));
    };

    container.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        if (shouldIgnore(e.target)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isTracking = true;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        if (!isTracking || !e.changedTouches || e.changedTouches.length !== 1) { isTracking = false; return; }
        // 再次检查拖动状态
        if (typeof isTaskDragging !== 'undefined' && isTaskDragging) { isTracking = false; return; }
        // 再次检查长按状态
        if (typeof heatmapTooltipLongPressActive !== 'undefined' && heatmapTooltipLongPressActive) { isTracking = false; return; }
        // [v5.1.1] 检查时间流图长按状态
        if (typeof flowTooltipLongPressActive !== 'undefined' && (flowTooltipLongPressActive || flowTooltipLongPressCooldown)) { isTracking = false; return; }
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        isTracking = false;

        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const HORIZONTAL_FACTOR = 1.5;
        const MIN_SWIPE = 70;
        if (absX < MIN_SWIPE || absX < absY * HORIZONTAL_FACTOR) return; // 垂直滑动或幅度太小

        const active = getActiveTab();
        const target = e.changedTouches[0].target;
        // 仅在报告页的互动区域屏蔽：互动分析图表、趋势图区域、时间流图区域
        if (active === 'report' && target && target.closest && (target.closest('#interactiveAnalysisWrapper') || target.closest('#pieChartContainerWrapper') || target.closest('#trendChartContainerWrapper') || target.closest('#trendChartWrapper'))) {
            return;
        }
        const currentIndex = TAB_ORDER.indexOf(active);
        if (currentIndex === -1) return;
        const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
        switchTab(TAB_ORDER[nextIndex]);
    }, { passive: true });
}

// [v9.1.0] dailyChanges 由云端 tb_daily 权威管理，删除客户端全量重算
// 旧函数 recomputeBalanceAndDailyChanges 已废弃，禁止使用
// 如果需要"重算"，请调云端 recalculateBalance action

// 显示/隐藏示例数据导入 CTA，仅在完全无数据时出现
function updateDemoCTAVisibility() {
    const cta = document.getElementById('demoCTA');
    if (!cta) return;
    const hasAnyData = (tasks && tasks.length > 0) || (transactions && transactions.length > 0);
    cta.classList.toggle('hidden', hasAnyData);
}

function handleDemoCTAImport() {
    if (typeof initDemoData === 'function') {
        initDemoData();
    }
}

function hasDemoData() {
    const hasDemoTasks = tasks.some(t => t.id && t.id.startsWith('demo_'));
    const hasDemoTx = transactions.some(tx => tx.taskId && tx.taskId.startsWith('demo_'));
    return { hasDemoTasks, hasDemoTx };
}

function cleanupDemoDataLocal({ markDone = true } = {}) {
    const { hasDemoTasks, hasDemoTx } = hasDemoData();
    if (!hasDemoTasks && !hasDemoTx) return false;

    if (hasDemoTx) {
        transactions = transactions.filter(tx => !(tx.taskId && tx.taskId.startsWith('demo_')));
    }
    if (hasDemoTasks) {
        tasks = tasks.filter(t => !(t.id && t.id.startsWith('demo_')));
    }

    // 清理运行中任务
    if (runningTasks && runningTasks.size > 0) {
        runningTasks = new Map([...runningTasks.entries()].filter(([taskId]) => !(taskId && taskId.startsWith('demo_'))));
    }

    // 清理无效分类颜色与折叠状态
    const activeCategories = new Set(tasks.map(t => t.category));
    categoryColors.forEach((_, cat) => {
        if (!activeCategories.has(cat)) categoryColors.delete(cat);
    });
    collapsedCategories = _createSyncSetProxy([...collapsedCategories].filter(cat => activeCategories.has(cat)));
    expandedTaskCategories = new Set([...expandedTaskCategories].filter(cat => activeCategories.has(cat)));

    // 重新计算余额（日汇总由云端 tb_daily 推送，禁止本地重算）
    currentBalance = transactions.reduce((sum, tx) => {
        if (tx.undone) return sum;
        return sum + (tx.type === 'earn' ? (tx.amount || 0) : -(tx.amount || 0));
    }, 0);
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (markDone) {
        localStorage.setItem('tb_demo_cleanup_done', 'true');
    }
    return true;
}

async function cleanupDemoDataOnLogin() {
    if (localStorage.getItem('tb_demo_cleanup_done') === 'true') return false;

    const demoTaskIds = tasks.filter(t => t.id && t.id.startsWith('demo_')).map(t => t.id);
    const demoTxIds = transactions.filter(tx => tx.taskId && tx.taskId.startsWith('demo_')).map(tx => tx.id);
    const changed = cleanupDemoDataLocal({ markDone: true });

    if (!changed) return false;

    // 同步删除云端示例数据（登录状态下）
    if (isLoggedIn()) {
        demoTaskIds.forEach(taskId => {
            DAL.deleteTask(taskId).catch(err => console.error('[cleanupDemoDataOnLogin] 删除示例任务失败:', taskId, err.message));
        });
        demoTxIds.forEach(txId => {
            DAL.deleteTransaction(txId).catch(err => console.error('[cleanupDemoDataOnLogin] 删除示例交易失败:', txId, err.message));
        });
    }

    updateAllUI();
    saveLocalCache();
    return true;
}

async function ensureEmptyProfileForNewUser() {
    try {
        await DAL.createEmptyProfile();
        await DAL.loadProfile();
        hasCompletedFirstCloudSync = true;
        return true;
    } catch (e) {
        console.error('[ensureEmptyProfileForNewUser] 创建 Profile 失败:', e.message);
        return false;
    }
}

async function handlePostLoginDataInit(source = 'login', useIncremental = false) {
    // [v9.0.0] 启动时恢复离线变更队列
    loadMutationQueue();

    const hasData = await DAL.init();
    if (hasData) {
        // [v9.1.0] 改造 A: useIncremental 路径已废弃
        // 根因：transactions.length 永远为 0（业务数据不再从 localStorage 加载）
        //       handleIncrementalSync 依赖本地缓存作为对比基准，无基准则失效
        // 新行为：始终走全量 loadAll + subscribe
        if (useIncremental) {
            console.warn('[handlePostLoginDataInit] [v9.1.0] useIncremental=true 已废弃，强制走全量 loadAll');
        }

        await DAL.loadAll();
        await DAL.subscribeAll();
        await cleanupDemoDataOnLogin();
        updateAllUI();
        // [v7.25.4] 启动主动同步机制
        startActiveSync();
        return;
    }

    // [v7.18.4] 网页端禁用本地数据引导，强制使用云端唯一真相
    if (IS_WEB_ONLY) {
        console.log('[handlePostLoginDataInit] 网页端：云端无数据，创建空 Profile');
        const created = await ensureEmptyProfileForNewUser();
        if (created) {
            await DAL.subscribeAll();
            // [v7.25.4] 启动主动同步机制
            startActiveSync();
            updateAllUI();
            showNotification('📦 欢迎使用', '您可以导入之前的备份数据，或开始全新体验', 'achievement');
        }
        return;
    }

    // [v9.1.0] 改造 A: 删除 bootstrapCloudFromLocalData（silent sync 用本地覆盖云端）
    // 根因：本地缓存可能比云端旧/损坏，静默同步会污染云端数据
    // 新行为：云端无数据 → 创建空 Profile；如需导入本地数据，使用设置页"导入数据"手动操作
    console.log('[handlePostLoginDataInit] [v9.1.0] 安卓端：云端无数据，创建空 Profile');
    const created = await ensureEmptyProfileForNewUser();
    if (created) {
        await DAL.subscribeAll();
        // [v7.25.4] 启动主动同步机制
        startActiveSync();
        // [v9.1.0] 改造 A: 提示用户本地若有旧数据需手动导入（不再静默同步）
        const localData = USE_LOCAL_CACHE ? getLocalData() : null;
        if (localData && (localData.transactions?.length > 0 || localData.tasks?.length > 0)) {
            showNotification(
                '📦 检测到本地旧数据',
                '如需导入到云端，请使用设置页"导入数据"功能',
                'info'
            );
        } else {
            showNotification('📦 欢迎使用', '您可以导入之前的备份数据，或开始全新体验', 'achievement');
        }
    }
}

// 用户开始创建自有任务时的示例数据清理引导（已移除提示）
async function maybeCleanupDemoDataOnFirstUse() {
    return;
}

// ============================================
// [v4.6.0] 报告卡片管理器
// ============================================
const DEFAULT_CARD_ORDER = ['activityHeatmap', 'analysisDashboard', 'dataTable', 'trendChart'];
let cardLayoutConfig = null;

function getCardLayoutConfig() {
    if (cardLayoutConfig) return cardLayoutConfig;
    try {
        const saved = localStorage.getItem('tb_card_layout');
        if (saved) {
            cardLayoutConfig = JSON.parse(saved);
            // 确保所有卡片都在配置中
            DEFAULT_CARD_ORDER.forEach(id => {
                if (!cardLayoutConfig.find(c => c.id === id)) {
                    cardLayoutConfig.push({ id, visible: true });
                }
            });
        } else {
            cardLayoutConfig = DEFAULT_CARD_ORDER.map(id => ({ id, visible: true }));
        }
    } catch (e) {
        cardLayoutConfig = DEFAULT_CARD_ORDER.map(id => ({ id, visible: true }));
    }
    return cardLayoutConfig;
}

function saveCardLayoutConfig() {
    try {
        localStorage.setItem('tb_card_layout', JSON.stringify(cardLayoutConfig));
    } catch (e) {}
}

function applyCardLayout() {
    const config = getCardLayoutConfig();
    const reportTab = document.getElementById('reportTab');
    const cards = reportTab.querySelectorAll('.report-section[data-card-id]');
    const cardMap = {};
    cards.forEach(card => { cardMap[card.dataset.cardId] = card; });

    // 按配置顺序重新排列
    const managerEntry = reportTab.querySelector('.card-manager-entry');
    config.forEach(item => {
        const card = cardMap[item.id];
        if (card) {
            card.style.display = item.visible ? '' : 'none';
            reportTab.insertBefore(card, managerEntry);
        }
    });
}

function openCardManager() {
    const modal = document.getElementById('cardManagerModal');
    modal.classList.remove('hidden');
    renderCardManagerList();
}

function closeCardManager() {
    const modal = document.getElementById('cardManagerModal');
    modal.classList.add('hidden');
    applyCardLayout();
}

// [v7.14.0] 桌面小组件选择器
function openWidgetSelector() {
    // [v7.14.1] 检查是否支持添加桌面小组件
    if (window.Android && Android.canAddWidget) {
        if (!Android.canAddWidget()) {
            showWidgetPermissionModal();
            return;
        }
    }
    const modal = document.getElementById('widgetSelectorModal');
    modal.classList.remove('hidden');
}

function closeWidgetSelector() {
    const modal = document.getElementById('widgetSelectorModal');
    modal.classList.add('hidden');
}

function addWidgetToHomeScreen(widgetType) {
    // 调用安卓原生方法添加小组件到桌面
    if (window.Android && Android.addWidgetToHomeScreen) {
        Android.addWidgetToHomeScreen(widgetType);
    } else {
        showWidgetGuide();
    }
}

function showWidgetGuide() {
    showAlert(`📱 如何添加桌面小组件

方法1：长按桌面空白处 → 点击"小组件"/"Widget" → 找到"时间银行" → 选择喜欢的小组件样式

方法2：双指捏合桌面 → 进入桌面编辑模式 → 点击"小组件" → 找到"时间银行"

方法3：部分手机可在桌面空白处下滑 → 搜索"小组件"

💡 提示：不同品牌手机操作可能略有不同，小组件添加后数据会自动同步`);
}

// [v7.14.1] 桌面小组件权限弹窗
function showWidgetPermissionModal() {
    document.getElementById('widgetPermissionModal').classList.add('show');
}

function hideWidgetPermissionModal() {
    document.getElementById('widgetPermissionModal').classList.remove('show');
}

// [v7.30.8] 更新监听状态显示
// [v9.0.10 修复] 增强：合并 updateCloudStatusUI 逻辑，支持 4 状态（🟢/🟡/🔴/⚫）+ 暂停时显示🔧重置按钮
function updateWatchStatusUI() {
    const earnStatusEl = document.getElementById('watchStatusEarn');
    const spendStatusEl = document.getElementById('watchStatusSpend');
    const resetBtnEarn = document.getElementById('resetWatchInlineBtnEarn');
    const resetBtnSpend = document.getElementById('resetWatchInlineBtnSpend');

    if (!earnStatusEl && !spendStatusEl) return;

    // [v7.33.2] 两层状态判定：registered（已注册）+ connected（已确认活跃）
    const userLoggedIn = typeof isLoggedIn === 'function' ? isLoggedIn() : false;
    const registeredCount = Object.values(watchRegistered).filter(Boolean).length;
    const connectedCount = Object.values(watchConnected).filter(Boolean).length;
    const totalWatchers = Object.keys(watchConnected).length;

    let statusClass = '';
    let statusText = '';
    let tooltip = '';
    let showReset = false;

    // [v9.0.10 修复] 优先级：降级状态（paused/degraded）> 原始 4 状态（已登录/未连接/连接中/已同步）
    // 用户原话："修复优先 + 降级感知"——降级状态必须让用户清楚看到

    if (!userLoggedIn) {
        // ⚫ 未登录
        statusClass = 'watch-inactive';
        if (!cachedLoginState && cloudbaseInitialized && auth?.hasLoginState?.()) {
            statusText = '未登录';
            tooltip = '登录态恢复中...';
        } else {
            statusText = '未登录';
            tooltip = '请登录后启用云端同步';
        }
    } else if (typeof __watchDegradeStatus !== 'undefined' && __watchDegradeStatus === 'paused') {
        // 🔴 Watch 已暂停（自愈探针接管中）—— 最高优先级，让用户清楚看到
        statusClass = 'watch-inactive';
        const cd = (typeof __watchSelfHealingCountdown !== 'undefined') ? __watchSelfHealingCountdown : 60;
        const reason = (typeof __watchLastReason !== 'undefined' && __watchLastReason) ? __watchLastReason : '未知';
        const probeCount = (typeof __watchSelfHealingProbeCount !== 'undefined') ? __watchSelfHealingProbeCount : 0;
        statusText = `已暂停 ${cd}s`;
        tooltip = `Watch 已暂停（自愈中：${cd}s）\n失败原因：${reason}\n自愈探针已尝试 ${probeCount} 次\n点击查看详情`;
        showReset = true;
    } else if (typeof __watchDegradeStatus !== 'undefined' && __watchDegradeStatus === 'degraded') {
        // 🟡 心跳保活中（偶发断开，自动恢复中）
        statusClass = 'watch-connecting';
        const failCount = (typeof __watchFailCount !== 'undefined') ? __watchFailCount : 0;
        const max = typeof MAX_RECONNECT_ATTEMPTS !== 'undefined' ? MAX_RECONNECT_ATTEMPTS : 8;
        statusText = `保活中 ${failCount}/${max}`;
        tooltip = `云端连接偶发断开，正在自动重试（${failCount}/${max}）\n点击查看详情`;
    } else if (registeredCount === 0) {
        // 没有任何 watcher 注册成功
        statusClass = 'watch-inactive';
        statusText = '未连接';
        tooltip = '云端连接未建立';
    } else if (connectedCount === 0) {
        // watcher 已注册但尚未收到首次 onChange 确认
        statusClass = 'watch-connecting';
        statusText = `连接中 ${registeredCount}/${totalWatchers}`;
        tooltip = '正在连接云端...';
    } else if (connectedCount < totalWatchers) {
        // 部分已确认活跃
        statusClass = 'watch-connecting';
        statusText = `同步中 ${connectedCount}/${totalWatchers}`;
        tooltip = '部分监听已建立，正在同步...';
    } else {
        // 🟢 正常
        statusClass = 'watch-active';
        statusText = '已同步';
        const lastHb = (typeof __watchLastHeartbeatAt !== 'undefined' && __watchLastHeartbeatAt)
            ? new Date(__watchLastHeartbeatAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : null;
        tooltip = lastHb ? `云端同步正常运行\n最近心跳：${lastHb}\n点击查看详情` : '云端同步正常运行';
    }

    // 更新两个标签页的状态显示
    [earnStatusEl, spendStatusEl].forEach(el => {
        if (el) {
            el.className = `watch-status ${statusClass}`;
            el.title = tooltip;
            const textEl = el.querySelector('.watch-status-text');
            if (textEl) textEl.textContent = statusText;
        }
    });

    // [v9.0.10 修复] 暂停时显示🔧重置按钮，正常时显示🔄手动同步按钮
    if (resetBtnEarn) resetBtnEarn.style.display = showReset ? '' : 'none';
    if (resetBtnSpend) resetBtnSpend.style.display = showReset ? '' : 'none';
}

// [v9.0.10 修复] updateCloudStatusUI 改为薄包装，调用 updateWatchStatusUI
// 保留此函数名仅为向后兼容（多个调用点），所有 UI 逻辑统一在 updateWatchStatusUI
function updateCloudStatusUI() {
    if (typeof updateWatchStatusUI === 'function') {
        try { updateWatchStatusUI(); } catch (e) { console.warn('[Watch] updateWatchStatusUI 失败:', e?.message); }
    }
}

function renderCardManagerList() {
    const list = document.getElementById('cardManagerList');
    const config = getCardLayoutConfig();
    const reportTab = document.getElementById('reportTab');

    list.innerHTML = config.map((item, index) => {
        const card = reportTab.querySelector(`.report-section[data-card-id="${item.id}"]`);
        const name = card ? card.dataset.cardName : item.id;
        return `
            <div class="card-manager-item" draggable="true" data-index="${index}" data-card-id="${item.id}">
                <span class="card-manager-drag-handle">☰</span>
                <span class="card-manager-name">${name}</span>
                <label class="card-manager-toggle">
                    <input type="checkbox" ${item.visible ? 'checked' : ''} onchange="toggleCardVisibility('${item.id}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        `;
    }).join('');

    // 添加拖拽事件
    const items = list.querySelectorAll('.card-manager-item');
    items.forEach(item => {
        item.addEventListener('dragstart', handleCardDragStart);
        item.addEventListener('dragend', handleCardDragEnd);
        item.addEventListener('dragover', handleCardDragOver);
        item.addEventListener('drop', handleCardDrop);
        item.addEventListener('dragleave', handleCardDragLeave);
        // 触摸支持
        item.addEventListener('touchstart', handleCardTouchStart, { passive: false });
    });
    // 全局触摸事件绑定到list上
    list.addEventListener('touchmove', handleCardTouchMove, { passive: false });
    list.addEventListener('touchend', handleCardTouchEnd);
    list.addEventListener('touchcancel', handleCardTouchEnd);
}

let cardDragSrcIndex = null;
let cardTouchDragItem = null;
let cardTouchStartY = 0;
let cardTouchStartX = 0;
let cardTouchLongPressTimer = null;
let cardTouchIsActive = false;
let cardTouchHoverIndex = null; // 当前悬停的目标位置
let cardTouchItemStartTop = 0; // 元素初始位置
let cardTouchOffsetY = 0; // 当前偏移量

function handleCardDragStart(e) {
    cardDragSrcIndex = parseInt(e.target.closest('.card-manager-item').dataset.index);
    e.target.closest('.card-manager-item').classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleCardDragEnd(e) {
    e.target.closest('.card-manager-item').classList.remove('dragging');
    document.querySelectorAll('.card-manager-item').forEach(item => item.classList.remove('drag-over'));
}

function handleCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.card-manager-item');
    if (item && parseInt(item.dataset.index) !== cardDragSrcIndex) {
        item.classList.add('drag-over');
    }
}

function handleCardDragLeave(e) {
    e.target.closest('.card-manager-item')?.classList.remove('drag-over');
}

function handleCardDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.card-manager-item');
    if (!targetItem) return;
    const targetIndex = parseInt(targetItem.dataset.index);
    if (targetIndex === cardDragSrcIndex) return;

    const config = getCardLayoutConfig();
    const [moved] = config.splice(cardDragSrcIndex, 1);
    config.splice(targetIndex, 0, moved);
    cardLayoutConfig = config;
    saveCardLayoutConfig();
    renderCardManagerList();
}

function handleCardTouchStart(e) {
    const item = e.target.closest('.card-manager-item');
    if (!item) return;
    
    // 阻止系统长按菜单
    e.preventDefault();
    
    const touch = e.touches[0];
    cardTouchStartY = touch.clientY;
    cardTouchStartX = touch.clientX;
    cardTouchDragItem = item;
    cardDragSrcIndex = parseInt(item.dataset.index);
    cardTouchIsActive = false;
    cardTouchHoverIndex = null;
    cardTouchOffsetY = 0;
    cardTouchItemStartTop = item.getBoundingClientRect().top;
    
    // 长按200ms后激活拖拽
    cardTouchLongPressTimer = setTimeout(() => {
        cardTouchIsActive = true;
        cardTouchHoverIndex = cardDragSrcIndex;
        // 记录激活时的位置
        cardTouchStartY = touch.clientY;
        item.classList.add('dragging');
        // 触觉反馈
        if (navigator.vibrate) navigator.vibrate(15);
    }, 200);
}

function handleCardTouchMove(e) {
    if (!cardTouchDragItem) return;
    
    const touch = e.touches[0];
    const deltaY = touch.clientY - cardTouchStartY;
    const deltaX = Math.abs(touch.clientX - cardTouchStartX);
    
    // 如果还没激活拖拽，且移动超过阈值，取消长按
    if (!cardTouchIsActive && (Math.abs(deltaY) > 8 || deltaX > 8)) {
        clearTimeout(cardTouchLongPressTimer);
        cardTouchDragItem = null;
        return;
    }
    
    if (!cardTouchIsActive) return;
    e.preventDefault();
    
    // 跟手移动
    cardTouchOffsetY = deltaY;
    cardTouchDragItem.style.transform = `translateY(${cardTouchOffsetY}px) scale(1.02)`;
    
    const list = document.getElementById('cardManagerList');
    const items = Array.from(list.querySelectorAll('.card-manager-item'));
    const touchY = touch.clientY;
    
    // 找出当前手指悬停的位置索引
    let hoverIdx = cardDragSrcIndex;
    for (let i = 0; i < items.length; i++) {
        if (i === cardDragSrcIndex) continue;
        const rect = items[i].getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (touchY < center && i < cardDragSrcIndex) {
            hoverIdx = i;
            break;
        } else if (touchY > center && i > cardDragSrcIndex) {
            hoverIdx = i;
        }
    }
    
    // 如果悬停位置变化，更新挤压动效
    if (hoverIdx !== cardTouchHoverIndex) {
        cardTouchHoverIndex = hoverIdx;
        updateCardShiftEffect(items, cardDragSrcIndex, hoverIdx);
    }
}

function updateCardShiftEffect(items, srcIdx, hoverIdx) {
    items.forEach((item, i) => {
        item.classList.remove('shift-up', 'shift-down');
        if (i === srcIdx) return; // 源元素不需要shift
        
        if (hoverIdx < srcIdx) {
            // 向上拖 - 中间的元素向下移
            if (i >= hoverIdx && i < srcIdx) {
                item.classList.add('shift-down');
            }
        } else if (hoverIdx > srcIdx) {
            // 向下拖 - 中间的元素向上移
            if (i > srcIdx && i <= hoverIdx) {
                item.classList.add('shift-up');
            }
        }
    });
}

function handleCardTouchEnd(e) {
    clearTimeout(cardTouchLongPressTimer);
    
    if (!cardTouchDragItem) return;
    
    const list = document.getElementById('cardManagerList');
    const items = Array.from(list.querySelectorAll('.card-manager-item'));
    const dragItem = cardTouchDragItem;
    const srcIdx = cardDragSrcIndex;
    const hoverIdx = cardTouchHoverIndex;
    const wasActive = cardTouchIsActive;
    const currentOffset = cardTouchOffsetY; // 当前跟手偏移量
    
    // 如果激活了拖拽且位置变化，先动画移动到目标位置
    if (wasActive && hoverIdx !== null && hoverIdx !== srcIdx) {
        // 计算目标位置的偏移量
        const itemHeight = 54; // 卡片高度 + gap
        const targetOffset = (hoverIdx - srcIdx) * itemHeight;
        
        // 先确保当前位置被应用（无动画）
        dragItem.style.transition = 'none';
        dragItem.style.transform = `translateY(${currentOffset}px) scale(1.02)`;
        
        // 强制重排，然后添加过渡动画
        dragItem.offsetHeight; // 触发reflow
        
        requestAnimationFrame(() => {
            // 移动到目标位置，同时scale保持1.02（保持高亮状态的样式一致）
            dragItem.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)';
            dragItem.style.transform = `translateY(${targetOffset}px) scale(1.02)`;
            
            // 位移动画完成后，开始淡出高亮
            setTimeout(() => {
                // 先把scale改为1，有一个微妙的收缩效果
                dragItem.style.transition = 'transform 0.15s ease-out, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease';
                dragItem.style.transform = `translateY(${targetOffset}px) scale(1)`;
                dragItem.classList.remove('dragging');
            }, 280);
            
            // 动画全部结束后重新渲染
            setTimeout(() => {
                // 先保存新顺序
                const config = getCardLayoutConfig();
                const [moved] = config.splice(srcIdx, 1);
                config.splice(hoverIdx, 0, moved);
                cardLayoutConfig = config;
                saveCardLayoutConfig();
                
                // 清除所有状态并重新渲染
                items.forEach(it => {
                    it.classList.remove('shift-up', 'shift-down', 'dragging');
                    it.style.transform = '';
                    it.style.transition = '';
                });
                renderCardManagerList();
            }, 480);
        });
    } else {
        // 没有位置变化，清除shift并恢复
        items.forEach(it => {
            if (it !== dragItem) {
                it.classList.remove('shift-up', 'shift-down');
            }
        });
        
        // 平滑回弹到原位
        dragItem.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1), background 0.2s ease 0.1s, color 0.2s ease 0.1s';
        dragItem.style.transform = 'translateY(0) scale(1)';
        
        // 延迟移除高亮效果
        setTimeout(() => {
            dragItem.classList.remove('dragging');
        }, 150);
        
        setTimeout(() => {
            dragItem.style.transform = '';
            dragItem.style.transition = '';
        }, 250);
    }
    
    cardTouchDragItem = null;
    cardTouchHoverIndex = null;
    cardTouchIsActive = false;
    cardTouchOffsetY = 0;
}

function toggleCardVisibility(cardId, visible) {
    const config = getCardLayoutConfig();
    const item = config.find(c => c.id === cardId);
    if (item) {
        item.visible = visible;
        saveCardLayoutConfig();
    }
}

function resetCardLayout() {
    cardLayoutConfig = DEFAULT_CARD_ORDER.map(id => ({ id, visible: true }));
    saveCardLayoutConfig();
    renderCardManagerList();
    applyCardLayout();
}

// ========== [v5.0.0] 任务卡片长按拖动排序（支持全方向自由移动） ==========
let isTaskDragging = false; // 全局拖动锁，防止同步更新UI
let taskDragState = {
    item: null,
    grid: null,
    category: null,
    srcIndex: null,      // 被拖动卡片的原始DOM索引
    currentOrder: [],    // 当前视觉顺序，例如 [0,1,2,3] 变成 [0,2,1,3] 表示卡片2和1交换了位置
    startX: 0,
    startY: 0,
    isActive: false,
    longPressTimer: null,
    cardRects: [],       // 缓存各卡片槽位的原始位置
    cols: 2
};

function bindTaskCardDragEvents() {
    document.querySelectorAll('.category-tasks-grid').forEach(grid => {
        // 移除旧事件防止重复绑定
        grid.removeEventListener('touchmove', handleTaskDragMove);
        grid.removeEventListener('touchend', handleTaskDragEnd);
        grid.removeEventListener('touchcancel', handleTaskDragEnd);
        
        grid.querySelectorAll('.task-card').forEach(card => {
            card.removeEventListener('touchstart', handleTaskDragStart);
            card.addEventListener('touchstart', handleTaskDragStart, { passive: false });
            // [v7.13.0] 桌面端鼠标/触控板拖拽支持（点击-拖动-释放模式）
            card.removeEventListener('mousedown', handleDesktopTaskDragStart);
            card.addEventListener('mousedown', handleDesktopTaskDragStart);
        });
        grid.addEventListener('touchmove', handleTaskDragMove, { passive: false });
        grid.addEventListener('touchend', handleTaskDragEnd);
        grid.addEventListener('touchcancel', handleTaskDragEnd);
    });
}

// [v7.13.0] 桌面端鼠标/触控板拖拽支持（点击-拖动-释放模式）
let desktopDragState = {
    item: null,
    grid: null,
    category: null,
    srcIndex: null,
    currentOrder: [],
    cardRects: [],
    isDragging: false,
    hasMoved: false
};

function handleDesktopTaskDragStart(e) {
    // 只在鼠标左键按下时触发
    if (e.button !== 0) return;
    
    const card = e.target.closest('.task-card');
    if (!card) return;
    
    // 如果点击的是按钮、菜单或链接，不触发拖动
    if (e.target.closest('button') || e.target.closest('.task-card-menu') || e.target.closest('a')) return;
    
    const grid = card.closest('.category-tasks-grid');
    const categoryDiv = card.closest('.category-tasks');
    const category = categoryDiv?.dataset.category;
    if (!grid || !category) return;
    
    const cards = Array.from(grid.querySelectorAll('.task-card'));
    const srcIndex = cards.indexOf(card);
    
    // 缓存卡片位置
    const cardRects = cards.map(c => {
        const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    
    desktopDragState = {
        item: card,
        grid: grid,
        category: category,
        srcIndex: srcIndex,
        currentOrder: cards.map((_, i) => i),
        cardRects: cardRects,
        isDragging: false,
        hasMoved: false
    };
    
    // 添加全局鼠标事件
    document.addEventListener('mousemove', handleDesktopTaskDragMove);
    document.addEventListener('mouseup', handleDesktopTaskDragEnd);
    
    // 阻止默认行为（防止文本选择）
    e.preventDefault();
}

function handleDesktopTaskDragMove(e) {
    if (!desktopDragState.item) return;
    
    const { item, grid, cardRects, srcIndex } = desktopDragState;
    
    // 鼠标移动超过阈值才真正开始拖动
    const startRect = cardRects[srcIndex];
    const deltaX = e.clientX - (startRect.left + startRect.width / 2);
    const deltaY = e.clientY - (startRect.top + startRect.height / 2);
    
    if (!desktopDragState.isDragging) {
        // 移动超过 10px 才开始拖动
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            desktopDragState.isDragging = true;
            isTaskDragging = true;
            item.classList.add('task-dragging');
            if (navigator.vibrate) navigator.vibrate(15);
        } else {
            return;
        }
    }
    
    desktopDragState.hasMoved = true;
    
    // 移动被拖动的卡片
    item.style.transform = `translate3d(${Math.round(deltaX)}px, ${Math.round(deltaY)}px, 0) scale(1.02)`;
    
    // 检测鼠标当前在哪个槽位
    let targetSlot = -1;
    for (let i = 0; i < cardRects.length; i++) {
        const rect = cardRects[i];
        if (e.clientX >= rect.left && e.clientX <= rect.left + rect.width &&
            e.clientY >= rect.top && e.clientY <= rect.top + rect.height) {
            targetSlot = i;
            break;
        }
    }
    
    // 如果鼠标移到了新槽位，更新顺序
    if (targetSlot !== -1 && targetSlot !== srcIndex) {
        const draggedPosInOrder = desktopDragState.currentOrder.indexOf(srcIndex);
        if (draggedPosInOrder !== targetSlot) {
            desktopDragState.currentOrder.splice(draggedPosInOrder, 1);
            desktopDragState.currentOrder.splice(targetSlot, 0, srcIndex);
            updateDesktopCardPositions();
        }
    }
}

function updateDesktopCardPositions() {
    const { grid, currentOrder, srcIndex, cardRects } = desktopDragState;
    const cards = Array.from(grid.querySelectorAll('.task-card'));
    
    cards.forEach((card, domIdx) => {
        if (domIdx === srcIndex) return; // 被拖动的卡片跟随鼠标，不处理
        
        const slotIndex = currentOrder.indexOf(domIdx);
        if (slotIndex !== domIdx) {
            const fromRect = cardRects[domIdx];
            const toRect = cardRects[slotIndex];
            const shiftX = toRect.left - fromRect.left;
            const shiftY = toRect.top - fromRect.top;
            
            card.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1)';
            card.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
            card.classList.add('task-shifting');
        } else {
            card.style.transition = 'transform 0.2s ease';
            card.style.transform = '';
            card.classList.remove('task-shifting');
        }
    });
}

function handleDesktopTaskDragEnd(e) {
    document.removeEventListener('mousemove', handleDesktopTaskDragMove);
    document.removeEventListener('mouseup', handleDesktopTaskDragEnd);
    
    const { item, grid, category, srcIndex, currentOrder, isDragging, hasMoved } = desktopDragState;
    
    if (!item) return;
    
    if (isDragging) {
        const finalSlot = currentOrder.indexOf(srcIndex);
        const cards = Array.from(grid.querySelectorAll('.task-card'));
        
        if (finalSlot !== srcIndex && hasMoved) {
            // 有实际位置变化，保存排序
            const categoryTasks = tasks.filter(t => t.category === category);
            categoryTasks.sort((a, b) => {
                const aIdx = a.sortIndex ?? 9999;
                const bIdx = b.sortIndex ?? 9999;
                if (aIdx !== bIdx) return aIdx - bIdx;
                return (b.isHabit ? 1 : 0) - (a.isHabit ? 1 : 0);
            });
            
            // 根据 currentOrder 重新排序
            const reorderedTasks = currentOrder.map(orderIdx => categoryTasks[orderIdx]).filter(Boolean);
            reorderedTasks.forEach((t, idx) => { if (t) t.sortIndex = idx; });
            
            saveLocalCache();
            // [v7.5.1] 同步 sortIndex 到云端
            if (isLoggedIn()) {
                const updatePromises = reorderedTasks
                    .filter(t => t && t.id)
                    .map(t => DAL.saveTask(t).catch(e => console.error('同步排序失败:', e)));
                Promise.all(updatePromises).catch(() => {});
            }
        }
        
        // 清理动画
        item.style.transition = 'transform 0.2s ease-out';
        item.style.transform = '';
        item.classList.remove('task-dragging');
        
        cards.forEach(c => {
            c.style.transition = '';
            c.style.transform = '';
            c.classList.remove('task-shifting');
        });
        
        setTimeout(() => {
            isTaskDragging = false;
            updateCategoryTasks();
        }, 50);
    }
    
    desktopDragState = {
        item: null, grid: null, category: null, srcIndex: null,
        currentOrder: [], cardRects: [], isDragging: false, hasMoved: false
    };
}

// 全局 touchmove 监听，在拖动激活时阻止页面滚动
document.addEventListener('touchmove', function(e) {
    if (isTaskDragging && taskDragState.isActive) {
        e.preventDefault();
    }
}, { passive: false });

function handleTaskDragStart(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    
    // 如果点击的是按钮或菜单，不触发拖动
    if (e.target.closest('button') || e.target.closest('.task-card-menu')) return;
    
    const grid = card.closest('.category-tasks-grid');
    const categoryDiv = card.closest('.category-tasks');
    const category = categoryDiv?.dataset.category;
    if (!grid || !category) return;
    
    const cards = Array.from(grid.querySelectorAll('.task-card'));
    const srcIndex = cards.indexOf(card);
    const touch = e.touches[0];
    
    // 缓存所有卡片的原始位置
    const cardRects = cards.map(c => {
        const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, centerX: r.left + r.width/2, centerY: r.top + r.height/2 };
    });
    
    taskDragState = {
        item: card,
        grid: grid,
        category: category,
        srcIndex: srcIndex,
        currentOrder: cards.map((_, i) => i), // 初始顺序 [0,1,2,...]
        startX: touch.clientX,
        startY: touch.clientY,
        isActive: false,
        longPressTimer: null,
        cardRects: cardRects,
        cols: 2
    };
    
    // 长按250ms激活拖动
    taskDragState.longPressTimer = setTimeout(() => {
        // [v7.16.2] 拖动前自动展开分类内所有任务（若已折叠）
        const taskId = card.dataset.taskId;
        if (category && !expandedTaskCategories.has(category)) {
            const catTasks = tasks.filter(t => t.category === category);
            const catLimit = categoryTaskLimits[category] || CATEGORY_TASK_LIMIT;
            if (catTasks.length > catLimit) {
                expandedTaskCategories.add(category);
                updateCategoryTasks();
                // 重新查找卡片和网格
                const newCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
                const newGrid = newCard?.closest('.category-tasks-grid');
                if (newCard && newGrid) {
                    const newCards = Array.from(newGrid.querySelectorAll('.task-card'));
                    const newSrcIndex = newCards.indexOf(newCard);
                    const newCardRects = newCards.map(c => {
                        const r = c.getBoundingClientRect();
                        return { left: r.left, top: r.top, width: r.width, height: r.height, centerX: r.left + r.width/2, centerY: r.top + r.height/2 };
                    });
                    taskDragState.item = newCard;
                    taskDragState.grid = newGrid;
                    taskDragState.srcIndex = newSrcIndex;
                    taskDragState.currentOrder = newCards.map((_, i) => i);
                    taskDragState.cardRects = newCardRects;
                    newCard.classList.add('task-dragging');
                }
            } else {
                card.classList.add('task-dragging');
            }
        } else {
            card.classList.add('task-dragging');
        }
        taskDragState.isActive = true;
        isTaskDragging = true;
        taskDragState.startX = touch.clientX;
        taskDragState.startY = touch.clientY;
        if (navigator.vibrate) navigator.vibrate(15);
    }, 250);
}

function handleTaskDragMove(e) {
    if (!taskDragState.item) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - taskDragState.startX;
    const deltaY = touch.clientY - taskDragState.startY;
    
    // 如果未激活且移动超过阈值，取消长按并允许页面滚动
    if (!taskDragState.isActive) {
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            clearTimeout(taskDragState.longPressTimer);
            taskDragState.item = null;
            isTaskDragging = false;
        }
        return; // 未激活时不阻止默认行为，允许滚动
    }
    
    // 已激活，阻止滚动
    e.preventDefault();
    e.stopPropagation();
    
    // 计算相对于起始点的位移
    const moveX = Math.round(deltaX);
    const moveY = Math.round(deltaY);
    
    taskDragState.item.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) scale(1.02)`;
    
    // 检测手指当前在哪个槽位（使用手指位置判断）
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    const cardRects = taskDragState.cardRects;
    
    // 找到手指当前所在的槽位
    let targetSlot = -1;
    for (let i = 0; i < cardRects.length; i++) {
        const rect = cardRects[i];
        if (touchX >= rect.left && touchX <= rect.left + rect.width &&
            touchY >= rect.top && touchY <= rect.top + rect.height) {
            targetSlot = i;
            break;
        }
    }
    
    // 如果手指移到了新槽位，更新顺序
    if (targetSlot !== -1) {
        const srcIdx = taskDragState.srcIndex;
        const currentOrder = taskDragState.currentOrder;
        
        // 找到被拖动卡片当前在顺序中的位置
        const draggedPosInOrder = currentOrder.indexOf(srcIdx);
        
        // 如果目标槽位不是当前位置，重新排列
        if (draggedPosInOrder !== targetSlot) {
            // 从当前位置移除
            currentOrder.splice(draggedPosInOrder, 1);
            // 插入到目标位置
            currentOrder.splice(targetSlot, 0, srcIdx);
            
            // 更新所有卡片的视觉位置
            updateCardPositions();
        }
    }
}

function updateCardPositions() {
    const cards = Array.from(taskDragState.grid.querySelectorAll('.task-card'));
    const cardRects = taskDragState.cardRects;
    const currentOrder = taskDragState.currentOrder;
    const srcIdx = taskDragState.srcIndex;
    
    cards.forEach((card, domIdx) => {
        if (domIdx === srcIdx) return; // 被拖动的卡片跟随手指，不处理
        
        // 找到这张卡片在当前顺序中的位置（即它应该显示在哪个槽位）
        const slotIndex = currentOrder.indexOf(domIdx);
        
        let targetTransform = '';
        if (slotIndex !== domIdx) {
            // 需要移动到新槽位
            const fromRect = cardRects[domIdx];
            const toRect = cardRects[slotIndex];
            const shiftX = Math.round(toRect.left - fromRect.left);
            const shiftY = Math.round(toRect.top - fromRect.top);
            targetTransform = `translate3d(${shiftX}px, ${shiftY}px, 0)`;
        }
        
        // 只有 transform 变化才更新 DOM
        if (card.style.transform !== targetTransform) {
            card.classList.add('task-shifting');
            card.style.transform = targetTransform;
        }
    });
}

function handleTaskDragEnd(e) {
    clearTimeout(taskDragState.longPressTimer);
    
    if (!taskDragState.item) return;
    
    const { item, grid, category, srcIndex, currentOrder, isActive, cardRects } = taskDragState;
    const cards = Array.from(grid.querySelectorAll('.task-card'));
    
    // 找到被拖动卡片最终所在的槽位
    const finalSlot = currentOrder.indexOf(srcIndex);
    const hasChanged = isActive && finalSlot !== srcIndex;
    
    if (hasChanged) {
        // 计算目标位置的偏移
        const fromRect = cardRects[srcIndex];
        const toRect = cardRects[finalSlot];
        const targetDeltaX = Math.round(toRect.left - fromRect.left);
        const targetDeltaY = Math.round(toRect.top - fromRect.top);
        
        // 动画移动到目标位置
        item.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1)';
        item.style.transform = `translate3d(${targetDeltaX}px, ${targetDeltaY}px, 0) scale(1)`;
        
        // 动画结束后更新数据并重渲染
        setTimeout(() => {
            // 找到该分类的任务并按当前 sortIndex 排序
            const categoryTasks = tasks.filter(t => t.category === category);
            categoryTasks.sort((a, b) => {
                const aIdx = a.sortIndex ?? 9999;
                const bIdx = b.sortIndex ?? 9999;
                if (aIdx !== bIdx) return aIdx - bIdx;
                return (b.isHabit ? 1 : 0) - (a.isHabit ? 1 : 0);
            });
            
            // 按照 currentOrder 重新排列任务
            const reorderedTasks = currentOrder.map(idx => categoryTasks[idx]);
            
            // 更新所有任务的 sortIndex
            reorderedTasks.forEach((t, idx) => {
                if (t) t.sortIndex = idx;
            });
            
            saveLocalCache();

            // [v7.5.1] 同步 sortIndex 到云端（多表模式下 saveData 不保存任务）
            if (isLoggedIn()) {
                reorderedTasks.forEach(t => {
                    if (t) DAL.saveTask(t).catch(err => console.error('[TaskSort] 同步失败:', t.id, err.message));
                });
            }
            
            // 清除所有状态并重渲染
            cards.forEach(c => {
                c.classList.remove('task-dragging', 'task-shifting');
                c.style.transform = '';
            });
            isTaskDragging = false;
            updateCategoryTasks();
        }, 280);
    } else {
        // 没有位置变化，回弹
        cards.forEach(c => {
            c.classList.remove('task-shifting');
            c.style.transform = '';
        });
        
        if (isActive) {
            item.style.transition = 'transform 0.2s ease-out';
            item.style.transform = 'translate3d(0, 0, 0) scale(1)';
            setTimeout(() => {
                item.classList.remove('task-dragging');
                item.style.transform = '';
                item.style.transition = '';
                isTaskDragging = false;
            }, 200);
        } else {
            item.classList.remove('task-dragging');
            isTaskDragging = false;
        }
    }
    
    // 重置状态
    taskDragState = {
        item: null, grid: null, category: null, srcIndex: null, currentOrder: [],
        startX: 0, startY: 0, isActive: false, longPressTimer: null, cardRects: [], cols: 2
    };
}

const TAB_ORDER = ['earn', 'spend', 'report', 'settings'];
function switchTab(tabName, evt = null) {
    const tabId = `${tabName}Tab`;
    const tabOrder = ['earn', 'spend', 'report', 'settings'];
    const tabIndex = tabOrder.indexOf(tabName);
    
    // [v7.14.1] 更新 Tab 指示器位置 - 仅移动指示条，不影响卡片
    const indicator = document.getElementById('tabIndicator');
    if (indicator && tabIndex !== -1) {
        indicator.style.transform = `translateX(${tabIndex * 100}%)`;
    }
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add('active');

    const sourceBtn = evt ? (evt.currentTarget || evt.target.closest('.tab-button')) : document.querySelector(`.tab-button[data-tab="${tabName}"]`);
    if (sourceBtn) sourceBtn.classList.add('active');

    const fab = document.getElementById('fabButton');
    if (fab) fab.style.display = (tabName === 'report' || tabName === 'settings') ? 'none' : 'block';
    if (tabName === 'report') { reportState.heatmapDate = new Date(); updateAllReports(); }
}

// [v7.14.1] 初始化 Tab 指示器位置
function initTabIndicator() {
    const indicator = document.getElementById('tabIndicator');
    const activeTab = document.querySelector('.tab-button.active');
    if (indicator && activeTab) {
        const tabOrder = ['earn', 'spend', 'report', 'settings'];
        const tabName = activeTab.dataset.tab;
        const tabIndex = tabOrder.indexOf(tabName);
        if (tabIndex !== -1) {
            indicator.style.transform = `translateX(${tabIndex * 100}%)`;
        }
    }
}

function getActiveTab() {
    const activeContent = document.querySelector('.tab-content.active');
    if (activeContent && activeContent.id.endsWith('Tab')) {
        return activeContent.id.replace('Tab', '');
    }
    return TAB_ORDER[0];
}

// --- Task Rendering ---
// [v7.33.5] 最近任务排序：运行中任务优先 + lastUsed 排序
function updateRecentTasks() {
    if (isTaskDragging) return; // 拖动中不更新
    const earnTasks = tasks.filter(t => ['reward', 'continuous', 'continuous_target'].includes(t.type));
    const spendTasks = tasks.filter(t => ['instant_redeem', 'continuous_redeem'].includes(t.type));

    const sortByLastUsed = (taskList) => {
        // [v7.33.5] 正在运行的任务始终排在最前面
        const running = taskList.filter(t => runningTasks.has(t.id));
        const notRunning = taskList.filter(t => !runningTasks.has(t.id));

        // 运行中任务按 startTime 排序（最早开始的在前）
        running.sort((a, b) => {
            const aStart = runningTasks.get(a.id)?.startTime || 0;
            const bStart = runningTasks.get(b.id)?.startTime || 0;
            return aStart - bStart;
        });

        // 未运行任务按 lastUsed 排序
        const sorted = [...notRunning].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

        // 合并：运行中任务 + 未运行任务，截取 LIMIT
        return [...running, ...sorted].slice(0, RECENT_TASK_LIMIT);
    };

    renderTaskList('recentEarnTasks', sortByLastUsed(earnTasks));
    renderTaskList('recentSpendTasks', sortByLastUsed(spendTasks));
}
function updateCategoryTasks() { 
    if (isTaskDragging) return; // 拖动中不更新
    const earnTasks = tasks.filter(t => ['reward', 'continuous', 'continuous_target'].includes(t.type)); 
    const spendTasks = tasks.filter(t => ['instant_redeem', 'continuous_redeem'].includes(t.type)); 
    renderCategoryTasks('categoryEarnTasks', groupTasksByCategory(earnTasks)); 
    renderCategoryTasks('categorySpendTasks', groupTasksByCategory(spendTasks));
    // 绑定任务卡片拖动事件
    setTimeout(bindTaskCardDragEvents, 0);
}
function groupTasksByCategory(taskList) { return taskList.reduce((acc, task) => { (acc[task.category] = acc[task.category] || []).push(task); return acc; }, {}); }
// [v5.0.0] 分类内任务最大显示数量 [v7.16.2] 默认改为4，可在设置中调整
let CATEGORY_TASK_LIMIT = parseInt(localStorage.getItem('categoryTaskLimit')) || 4;
let RECENT_TASK_LIMIT = parseInt(localStorage.getItem('recentTaskLimit')) || 4;
// [v8.2.0] 各分类独立任务显示数量限制（键：分类名，值：2/4/6/8，未设置则使用全局 CATEGORY_TASK_LIMIT）
let categoryTaskLimits = {};
try {
    const raw = localStorage.getItem('tb_category_task_limits');
    if (raw) categoryTaskLimits = JSON.parse(raw);
} catch (e) {
    categoryTaskLimits = {};
}

// [v7.2.0] 分类排序功能
let categorySortCurrentType = null; // 'earn' 或 'spend'
let categorySortDragState = {
    item: null,
    srcIndex: -1,
    hoverIndex: -1,
    touchStartY: 0,
    touchStartX: 0,
    offsetY: 0,
    longPressTimer: null,
    isActive: false
};

function showCategorySortModal(type) {
    categorySortCurrentType = type;
    const modal = document.getElementById('categorySortModal');
    const title = document.getElementById('categorySortModalTitle');
    const list = document.getElementById('categorySortList');
    const content = modal?.querySelector('.bottom-sheet-content');
    
    // 重置上次关闭留下的样式
    if (content) {
        content.classList.remove('slide-close', 'dragging');
        content.style.transform = '';
        content.style.transition = '';
    }
    
    initBottomSheetDrag('categorySortModal', hideCategorySortModal);
    
    title.textContent = type === 'earn' ? '调整获得类分类顺序' : '调整消费类分类顺序';
    
    // 获取当前类型的所有分类
    const taskList = tasks.filter(t => {
        const isEarn = ['reward', 'continuous', 'continuous_target'].includes(t.type);
        return type === 'earn' ? isEarn : !isEarn;
    });
    const tasksByCategory = groupTasksByCategory(taskList);
    const categories = Object.keys(tasksByCategory);
    
    // 从 localStorage 加载 categoryOrder
    if (!profileData) profileData = {};
    try {
        const savedOrder = localStorage.getItem('categoryOrder');
        profileData.categoryOrder = savedOrder ? JSON.parse(savedOrder) : { earn: [], spend: [] };
    } catch (e) {
        profileData.categoryOrder = { earn: [], spend: [] };
    }
    if (!profileData.categoryOrder[type]) {
        profileData.categoryOrder[type] = [];
    }
    
    // 按现有顺序排序，未在列表中的分类追加到末尾
    const currentOrder = profileData.categoryOrder[type];
    const sortedCategories = [];
    currentOrder.forEach(cat => {
        if (categories.includes(cat)) sortedCategories.push(cat);
    });
    categories.forEach(cat => {
        if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
    });
    
    // 渲染分类列表
    let html = '';
    sortedCategories.forEach((category, index) => {
        const color = categoryColors.get(category) || '#888';
        const count = tasksByCategory[category].length;
        html += `
            <div class="card-manager-item" draggable="true" data-index="${index}" data-category="${escapeHtml(category)}">
                <div class="card-manager-drag-handle">⠿</div>
                <div class="category-select-color" style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;"></div>
                <div class="card-manager-name">${escapeHtml(category)} (${count})</div>
            </div>
        `;
    });
    
    list.innerHTML = html;
    modal.classList.add('show');
    
    // 绑定拖动事件
    setTimeout(() => bindCategorySortDragEvents(), 0);
}

function hideCategorySortModal() {
    const modal = document.getElementById('categorySortModal');
    const content = modal?.querySelector('.bottom-sheet-content');
    modal?.classList.remove('show');
    if (content) {
        content.classList.remove('dragging');
    }
}

function bindCategorySortDragEvents() {
    const list = document.getElementById('categorySortList');
    if (!list) return;
    
    const items = list.querySelectorAll('.card-manager-item');
    items.forEach(item => {
        // HTML5 拖拽 API（网页端）
        item.addEventListener('dragstart', handleCategorySortDragStart);
        item.addEventListener('dragend', handleCategorySortDragEnd);
        item.addEventListener('dragover', handleCategorySortDragOver);
        item.addEventListener('drop', handleCategorySortDrop);
        item.addEventListener('dragleave', handleCategorySortDragLeave);
        // Touch 事件（移动端）
        item.addEventListener('touchstart', handleCategorySortTouchStart, { passive: false });
        item.addEventListener('touchmove', handleCategorySortTouchMove, { passive: false });
        item.addEventListener('touchend', handleCategorySortTouchEnd, { passive: true });
    });
}

// [v7.2.3] HTML5 拖拽 API 支持（网页端）
let categorySortDragSrcIndex = null;

function handleCategorySortDragStart(e) {
    const item = e.target.closest('.card-manager-item');
    if (!item) return;
    categorySortDragSrcIndex = parseInt(item.dataset.index);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleCategorySortDragEnd(e) {
    const item = e.target.closest('.card-manager-item');
    if (item) item.classList.remove('dragging');
    document.querySelectorAll('#categorySortList .card-manager-item').forEach(it => {
        it.classList.remove('drag-over', 'shift-up', 'shift-down');
    });
}

function handleCategorySortDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.card-manager-item');
    if (item && parseInt(item.dataset.index) !== categorySortDragSrcIndex) {
        item.classList.add('drag-over');
    }
}

function handleCategorySortDragLeave(e) {
    const item = e.target.closest('.card-manager-item');
    if (item) item.classList.remove('drag-over');
}

function handleCategorySortDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.card-manager-item');
    if (!targetItem) return;
    const targetIndex = parseInt(targetItem.dataset.index);
    if (targetIndex === categorySortDragSrcIndex || categorySortDragSrcIndex === null) return;
    
    const list = document.getElementById('categorySortList');
    const items = Array.from(list.querySelectorAll('.card-manager-item'));
    const categories = items.map(it => it.dataset.category);
    
    // 移动分类
    const [movedCategory] = categories.splice(categorySortDragSrcIndex, 1);
    categories.splice(targetIndex, 0, movedCategory);
    
    // 保存新顺序
    if (!profileData) profileData = {};
    if (!profileData.categoryOrder) {
        profileData.categoryOrder = { earn: [], spend: [] };
    }
    profileData.categoryOrder[categorySortCurrentType] = categories;
    localStorage.setItem('categoryOrder', JSON.stringify(profileData.categoryOrder));
    saveDeviceSpecificDataDebounced(); // [v7.2.4] 同步到云端
    
    // 重新渲染
    showCategorySortModal(categorySortCurrentType);
    updateCategoryTasks();
}

function handleCategorySortTouchStart(e) {
    const item = e.currentTarget;
    if (!item) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    categorySortDragState.touchStartY = touch.clientY;
    categorySortDragState.touchStartX = touch.clientX;
    categorySortDragState.item = item;
    categorySortDragState.srcIndex = parseInt(item.dataset.index);
    categorySortDragState.isActive = false;
    categorySortDragState.hoverIndex = categorySortDragState.srcIndex;
    categorySortDragState.offsetY = 0;
    
    // 长按 200ms 激活拖拽
    categorySortDragState.longPressTimer = setTimeout(() => {
        categorySortDragState.isActive = true;
        item.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(15);
    }, 200);
}

function handleCategorySortTouchMove(e) {
    if (!categorySortDragState.item) return;
    
    const touch = e.touches[0];
    const deltaY = touch.clientY - categorySortDragState.touchStartY;
    const deltaX = Math.abs(touch.clientX - categorySortDragState.touchStartX);
    
    // 如果还没激活拖拽，且移动超过阈值，取消长按
    if (!categorySortDragState.isActive && (Math.abs(deltaY) > 8 || deltaX > 8)) {
        clearTimeout(categorySortDragState.longPressTimer);
        categorySortDragState.item = null;
        return;
    }
    
    if (!categorySortDragState.isActive) return;
    e.preventDefault();
    
    // 跟手移动
    categorySortDragState.offsetY = deltaY;
    categorySortDragState.item.style.transform = `translateY(${deltaY}px) scale(1.02)`;
    
    const list = document.getElementById('categorySortList');
    const items = Array.from(list.querySelectorAll('.card-manager-item'));
    const touchY = touch.clientY;
    
    // 找出当前悬停位置
    let hoverIdx = categorySortDragState.srcIndex;
    for (let i = 0; i < items.length; i++) {
        if (i === categorySortDragState.srcIndex) continue;
        const rect = items[i].getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        if (touchY < center && i < categorySortDragState.srcIndex) {
            hoverIdx = i;
            break;
        } else if (touchY > center && i > categorySortDragState.srcIndex) {
            hoverIdx = i;
        }
    }
    
    // 更新挤压动效
    if (hoverIdx !== categorySortDragState.hoverIndex) {
        categorySortDragState.hoverIndex = hoverIdx;
        updateCategorySortShiftEffect(items, categorySortDragState.srcIndex, hoverIdx);
    }
}

function updateCategorySortShiftEffect(items, srcIdx, hoverIdx) {
    items.forEach((item, i) => {
        item.classList.remove('shift-up', 'shift-down');
        if (i === srcIdx) return;
        
        if (hoverIdx < srcIdx) {
            if (i >= hoverIdx && i < srcIdx) {
                item.classList.add('shift-down');
            }
        } else if (hoverIdx > srcIdx) {
            if (i > srcIdx && i <= hoverIdx) {
                item.classList.add('shift-up');
            }
        }
    });
}

function handleCategorySortTouchEnd(e) {
    clearTimeout(categorySortDragState.longPressTimer);
    
    if (!categorySortDragState.item) return;
    
    const list = document.getElementById('categorySortList');
    const items = Array.from(list.querySelectorAll('.card-manager-item'));
    const item = categorySortDragState.item;
    const srcIdx = categorySortDragState.srcIndex;
    const hoverIdx = categorySortDragState.hoverIndex;
    const wasActive = categorySortDragState.isActive;
    const currentOffset = categorySortDragState.offsetY;
    
    if (wasActive && hoverIdx !== null && hoverIdx !== srcIdx) {
        // 执行排序 - 有位置变化
        const itemHeight = 54;
        const targetOffset = (hoverIdx - srcIdx) * itemHeight;
        
        // 先确保当前位置被应用（无动画）
        item.style.transition = 'none';
        item.style.transform = `translateY(${currentOffset}px) scale(1.02)`;
        item.offsetHeight; // 触发reflow
        
        requestAnimationFrame(() => {
            // 移动到目标位置
            item.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)';
            item.style.transform = `translateY(${targetOffset}px) scale(1.02)`;
            
            // 位移动画完成后，开始淡出高亮
            setTimeout(() => {
                item.style.transition = 'transform 0.15s ease-out, background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease';
                item.style.transform = `translateY(${targetOffset}px) scale(1)`;
                item.classList.remove('dragging');
            }, 280);
            
            // 动画全部结束后重新渲染
            setTimeout(() => {
                // 保存新顺序到 localStorage
                const categories = items.map(it => it.dataset.category);
                const [movedCategory] = categories.splice(srcIdx, 1);
                categories.splice(hoverIdx, 0, movedCategory);
                
                if (!profileData) profileData = {};
                if (!profileData.categoryOrder) {
                    profileData.categoryOrder = { earn: [], spend: [] };
                }
                profileData.categoryOrder[categorySortCurrentType] = categories;
                localStorage.setItem('categoryOrder', JSON.stringify(profileData.categoryOrder));
                saveDeviceSpecificDataDebounced(); // [v7.2.4] 同步到云端
                
                // 清除所有状态并重新渲染
                items.forEach(it => {
                    it.classList.remove('shift-up', 'shift-down', 'dragging');
                    it.style.transform = '';
                    it.style.transition = '';
                });
                showCategorySortModal(categorySortCurrentType);
                updateCategoryTasks();
            }, 480);
        });
    } else {
        // 没有位置变化，清除shift并恢复
        items.forEach(it => {
            if (it !== item) {
                it.classList.remove('shift-up', 'shift-down');
            }
        });
        
        // 平滑回弹到原位
        item.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1), background 0.2s ease 0.1s, color 0.2s ease 0.1s';
        item.style.transform = 'translateY(0) scale(1)';
        
        // 延迟移除高亮效果
        setTimeout(() => {
            item.classList.remove('dragging');
        }, 150);
        
        setTimeout(() => {
            item.style.transform = '';
            item.style.transition = '';
        }, 250);
    }
    
    // 重置状态
    categorySortDragState = {
        item: null,
        srcIndex: -1,
        hoverIndex: -1,
        touchStartY: 0,
        touchStartX: 0,
        offsetYF: 0,
        longPressTimer: null,
        isActive: false
    };
}

// 点击背景关闭
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('categorySortModal')?.addEventListener('click', function(e) {
        if (e.target === this) hideCategorySortModal();
    });
});

function renderCategoryTasks(containerId, tasksByCategory) { 
    const container = document.getElementById(containerId); 
    if (Object.keys(tasksByCategory).length === 0) { 
        container.innerHTML = `<div class="empty-message" style="color:var(--text-color-light)">暂无任务</div>`; 
        return; 
    }
    
    // [v7.2.0] 按 categoryOrder 排序 (从 localStorage 加载)
    const isEarn = containerId === 'categoryEarnTasks';
    const type = isEarn ? 'earn' : 'spend';
    
    // 从 localStorage 加载 categoryOrder
    if (!profileData) profileData = {};
    try {
        const savedOrder = localStorage.getItem('categoryOrder');
        profileData.categoryOrder = savedOrder ? JSON.parse(savedOrder) : { earn: [], spend: [] };
    } catch (e) {
        profileData.categoryOrder = { earn: [], spend: [] };
    }
    if (!profileData.categoryOrder[type]) {
        profileData.categoryOrder[type] = [];
    }
    
    const categories = Object.keys(tasksByCategory);
    const currentOrder = profileData.categoryOrder[type];
    
    // 按现有顺序排序，未在列表中的分类追加到末尾
    const sortedCategories = [];
    currentOrder.forEach(cat => {
        if (categories.includes(cat)) sortedCategories.push(cat);
    });
    categories.forEach(cat => {
        if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
    });
    
    container.innerHTML = sortedCategories.map(category => { 
        const categoryTasks = tasksByCategory[category]; 
        const isCollapsed = collapsedCategories.has(category); 
        const color = categoryColors.get(category) || '#666'; 
        // [v4.12.0] 按 sortIndex 排序，如无则按习惯优先
        categoryTasks.sort((a, b) => {
            const aIdx = a.sortIndex ?? 9999;
            const bIdx = b.sortIndex ?? 9999;
            if (aIdx !== bIdx) return aIdx - bIdx;
            return (b.isHabit ? 1 : 0) - (a.isHabit ? 1 : 0);
        });
        
        // [v5.0.0] 分类内任务折叠逻辑：超过限制时折叠 [v7.17.0] 改为卡片内标签
        // [v8.2.0] 支持分类独立任务显示数量
        const isTaskExpanded = expandedTaskCategories.has(category);
        const totalCount = categoryTasks.length;
        const catLimit = categoryTaskLimits[category] || CATEGORY_TASK_LIMIT;
        const shouldFold = totalCount > catLimit && !isTaskExpanded;
        const visibleTasks = shouldFold ? categoryTasks.slice(0, catLimit) : categoryTasks;
        const hiddenCount = totalCount - catLimit;
        
        // [v7.17.0] 传递展开/收起参数给 renderTaskCards
        const renderOptions = {
            isLastVisible: shouldFold,
            hiddenCount: hiddenCount,
            isExpanded: isTaskExpanded,
            category: category
        };
        
        // [v7.29.0] 分类栏加入编辑图标，紧跟分类名右侧
        // [v8.2.0] 增加第四个图标：分类独立任务数量切换（2/4/6/8）
        const limitEmoji = ['2','4','6','8'];
        const limitLabels = ['2','4','6','8'];
        const currentLimitIdx = limitEmoji.indexOf(String(catLimit));
        const limitDisplay = limitLabels[currentLimitIdx] || String(catLimit);
        
        return `<div class="category-tasks" data-category="${escapeHtml(category)}"><div class="category-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleCategory('${category}')"><div class="category-info"><div class="category-color" style="background-color: ${color}"></div><div class="category-name">${category}</div><div class="category-count">(${categoryTasks.length})</div><button class="category-edit-btn" onclick="startCategoryRename('${escapeHtml(category)}',this,event)" title="重命名分类">✏️</button><button class="category-edit-btn category-stats-btn" onclick="showCategoryStats('${escapeHtml(category)}',event)" title="查看分类统计">📊</button><button class="category-edit-btn category-sort-btn" onclick="sortCategoryByTime('${escapeHtml(category)}',this,event)" title="按近7天时长排序" style="font-size: 1.15rem; transform: scale(1.1); transform-origin: center;"><span style="position: relative; top: -1.5px;">⇅</span></button><button class="category-edit-btn category-limit-btn" onclick="toggleCategoryTaskLimit('${escapeHtml(category)}',event)" title="切换显示数量 (${limitDisplay})" style="font-weight:700;min-width:18px;">${limitDisplay}</button></div><div class="category-toggle">▼</div></div><div class="category-tasks-list ${isCollapsed ? 'collapsed' : ''}"><div class="category-tasks-grid">${renderTaskCards(visibleTasks, renderOptions)}</div></div></div>`; 
    }).join(''); 
}
function renderTaskList(containerId, taskList) { const container = document.getElementById(containerId); if (taskList.length === 0) { container.innerHTML = `<div class="empty-message" style="color:var(--text-color-light)">暂无最近任务</div>`; return; } container.innerHTML = renderTaskCards(taskList); }

// [v7.29.0] 分类统计弹窗（复用报告-分类视图detail弹窗）
function showCategoryStats(category, event) {
    event.stopPropagation();
    // 根据实际 transactions 判断 typeKey（避免任务类型字段缺失或混合场景误判）
    const catTx = (typeof transactions !== 'undefined' ? transactions : []).filter(tx => !tx.undone && (typeof getTransactionCategory === 'function' ? getTransactionCategory(tx) : (tx.category || '')) === category);
    const spendAmt = catTx.filter(tx => tx.type === 'spend' || (!tx.type && tx.amount < 0)).reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
    const earnAmt  = catTx.filter(tx => tx.type === 'earn'  || (!tx.type && tx.amount > 0)).reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
    const typeKey  = spendAmt > earnAmt ? 'spend' : 'earn';
    if (typeof showCategoryDetail === 'function') {
        showCategoryDetail(category, typeKey);
    }
}

// [v7.29.0] 按总时长对分类内任务一键排序，附 translate3d 动画
async function sortCategoryByTime(category, btnEl, event) {
    event.stopPropagation();
    const grid = btnEl.closest('.category-tasks')?.querySelector('.category-tasks-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.task-card'));
    if (cards.length < 2) { showToast('该分类任务不足两个，无需排序'); return; }

    // 统计近7天内每个 taskId 的时长（与统计弹窗保持一致）
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const timeMap = new Map();
    const allTx = (typeof transactions !== 'undefined' ? transactions : []).filter(tx => !tx.undone && (new Date(tx.timestamp).getTime() || 0) >= sevenDaysAgo);
    allTx.forEach(tx => {
        const key = tx.taskId || tx.id;
        if (key) timeMap.set(key, (timeMap.get(key) || 0) + Math.abs(tx.amount || 0));
    });

    // 找到该分类任务，按时长降序重排
    const catTasks = tasks.filter(t => t.category === category);
    catTasks.sort((a, b) => {
        const aIdx = a.sortIndex ?? 9999;
        const bIdx = b.sortIndex ?? 9999;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (b.isHabit ? 1 : 0) - (a.isHabit ? 1 : 0);
    });
    const sorted = [...catTasks].sort((a, b) => (timeMap.get(b.id) || 0) - (timeMap.get(a.id) || 0));
    const alreadySorted = catTasks.every((t, i) => t.id === sorted[i].id);
    if (alreadySorted) { showToast('已按近7天时长排序'); return; }

    // 获取每张卡片当前可视状态和位置
    const cardRects = cards.map(c => c.getBoundingClientRect());
    const oldIdOrder = cards.map(c => c.dataset.taskId);
    const newIdOrder = sorted.map(t => t.id);
    // 闪烁效果
    cards.forEach(c => c.classList.add('task-dragging'));
    await new Promise(r => setTimeout(r, 80));
    cards.forEach(c => c.classList.remove('task-dragging'));

    // 更新 sortIndex
    sorted.forEach((t, idx) => { t.sortIndex = idx; });
    saveLocalCache();
    if (isLoggedIn()) sorted.forEach(t => DAL.saveTask(t).catch(() => {}));

    // 重新渲染，然后对每张卡片补播位移动画
    updateCategoryTasks();
    requestAnimationFrame(() => {
        const newGrid = btnEl.closest('.category-tasks')?.querySelector('.category-tasks-grid');
        if (!newGrid) return;
        const newCards = Array.from(newGrid.querySelectorAll('.task-card'));
        newCards.forEach((newCard) => {
            const taskId = newCard.dataset.taskId;
            const oldIdx = oldIdOrder.indexOf(taskId);
            if (oldIdx < 0) return;
            const fromRect = cardRects[oldIdx];
            const toRect   = newCard.getBoundingClientRect();
            const dx = fromRect.left - toRect.left;
            const dy = fromRect.top  - toRect.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            newCard.style.transition = 'none';
            newCard.style.transform = `translate3d(${dx}px,${dy}px,0)`;
            requestAnimationFrame(() => {
                newCard.style.transition = 'transform 0.28s cubic-bezier(0.34,1.2,0.64,1)';
                newCard.style.transform = 'translate3d(0,0,0)';
            });
        });
    });
}

// [v7.29.0] 分类内联重命名
function startCategoryRename(category, btnEl, event) {
    event.stopPropagation();
    const header = btnEl.closest('.category-header');
    if (!header || header.classList.contains('editing')) return;
    header.classList.add('editing');
    const origOnclick = header.getAttribute('onclick');
    header.removeAttribute('onclick');
    const info = header.querySelector('.category-info');
    const colorStyle = header.querySelector('.category-color')?.style.backgroundColor || '#888';
    const toggle = header.querySelector('.category-toggle');
    if (toggle) toggle.style.visibility = 'hidden';
    info.innerHTML = `<div class="category-color" style="background-color:${colorStyle};flex-shrink:0"></div><input class="category-name-input" value="${escapeHtml(category)}" maxlength="30" autocomplete="off">`;
    const input = info.querySelector('.category-name-input');
    input.focus();
    input.select();
    // [v7.29.0] 安卓软键盘弹起时将输入框滚动进可视区
    // 用 focus + 400ms 延迟：键盘展开完毕后再测量并滚动，兼容 adjustResize/adjustPan 两种模式
    input.addEventListener('focus', () => {
        setTimeout(() => {
            try {
                const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                const rect = input.getBoundingClientRect();
                if (rect.bottom > vpHeight - 16) {
                    const scroller = document.getElementById('appScrollContainer');
                    const delta = rect.bottom - vpHeight + 60;
                    if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
                    else window.scrollBy({ top: delta, behavior: 'smooth' });
                }
            } catch (e) {}
        }, 400);
    }, { once: true });
    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        header.classList.remove('editing');
        header.setAttribute('onclick', origOnclick);
        if (toggle) toggle.style.visibility = '';
        if (save) {
            const newName = input.value.trim();
            if (newName && newName !== category) { confirmCategoryRename(category, newName); return; }
        }
        updateCategoryTasks();
    };
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
}

async function confirmCategoryRename(oldName, newName) {
    if (!newName || newName === oldName) { updateCategoryTasks(); return; }
    const allCats = new Set(tasks.map(t => t.category).filter(Boolean));
    if (allCats.has(newName)) { showToast('分类名称已存在'); updateCategoryTasks(); return; }
    const affected = tasks.filter(t => t.category === oldName);
    affected.forEach(t => { t.category = newName; });
    if (categoryColors.has(oldName)) {
        categoryColors.set(newName, categoryColors.get(oldName));
        categoryColors.delete(oldName);
    }
    if (collapsedCategories.has(oldName)) {
        collapsedCategories.delete(oldName);
        collapsedCategories.add(newName);
    }
    try {
        const savedOrder = localStorage.getItem('categoryOrder');
        const order = savedOrder ? JSON.parse(savedOrder) : { earn: [], spend: [] };
        ['earn', 'spend'].forEach(type => {
            if (order[type]) {
                const idx = order[type].indexOf(oldName);
                if (idx !== -1) order[type][idx] = newName;
            }
        });
        localStorage.setItem('categoryOrder', JSON.stringify(order));
        if (profileData) profileData.categoryOrder = order;
    } catch (e) {}
    if (isLoggedIn()) {
        for (const task of affected) {
            await DAL.saveTask(task).catch(e => console.error('[confirmCategoryRename] saveTask failed:', e));
        }
    }
    saveLocalCache();
    updateCategoryTasks();
    showToast(`已重命名为"${newName}"`);
}
