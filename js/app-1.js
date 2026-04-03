// ⚠️ 版本更新规则 (必读)：
// 1. APP_VERSION 和版本日志的更新【必须】由用户明确下达命令后才能修改
// 2. 用户会在更新开始前告知本次版本号
// 3. 版本日志应在整个版本更新完成后才添加
// 4. 未经用户授权，禁止自行修改版本号！
const APP_VERSION = 'v7.30.7'; // [v7.30.7] 补录时序修复 + 习惯连胜同步优化

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
function initCloudBase() {
    // 检查各种可能的全局变量名
    const sdk = window.cloudbase || window.CloudBase || window.tcb;
    
    if (!sdk) {
        console.error('[CloudBase] SDK not available. cloudbase:', typeof cloudbase, 
            ', CloudBase:', typeof CloudBase, ', tcb:', typeof tcb);
        console.error('[CloudBase] SDK loaded flag:', window.cloudbaseSDKLoaded);
        console.error('[CloudBase] SDK error:', window.cloudbaseSDKError);
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
        return true;
    } catch (e) {
        console.error('[CloudBase] Init error:', e);
        return false;
    }
}

// 等待 SDK 加载后再初始化
function waitForCloudBase(callback, maxRetries = 20, interval = 200) {
    let retries = 0;
    
    function tryInit() {
        if (initCloudBase()) {
            if (callback) callback(true);
            return;
        }
        
        retries++;
        if (retries < maxRetries) {
            console.log(`[CloudBase] Waiting for SDK... (${retries}/${maxRetries})`);
            setTimeout(tryInit, interval);
        } else {
            console.error('[CloudBase] SDK failed to load after', maxRetries, 'retries');
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
            console.warn('[Auth] ⚠️ 检测到意外登出！尝试恢复...');

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

// 同步检查是否已登录（使用缓存）
function isLoggedIn() {
    return !!getCachedUid();
}

// 异步刷新登录状态缓存
async function refreshLoginState() {
    // 确保 auth 已初始化
    if (!cloudbaseInitialized || !auth) {
        console.warn('[Auth] refreshLoginState called before SDK init');
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
            cachedLoginState = null;
        }
        
        console.log('[Auth] Final cachedLoginState:', cachedLoginState);
        console.log('[Auth] Final user uid:', cachedLoginState?.user?.uid);
    } catch (e) {
        console.warn('[Auth] refreshLoginState error:', e);
        cachedLoginState = null;
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
const watchers = {
    profile: null,
    task: null,
    transaction: null,
    running: null
};

// [v7.9.3] Watch 连接状态跟踪
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

// [v7.9.3] 重连定时器
const watchReconnectTimers = {};

// [v7.30.0] Watch 心跳监控：追踪最后一次收到事件的时间
const watchLastEventTime = {
    task: 0,
    transaction: 0,
    running: 0,
    profile: 0,
    daily: 0
};
const WATCH_HEARTBEAT_TIMEOUT_MS = 60000; // 60秒无事件则认为断连

// [v7.30.0] 追踪本地刚写入的交易，防止 Watch add 事件重复累加余额
// key: txId, value: timestamp (用于过期清理)
const recentLocalTransactions = new Map();
const RECENT_TX_EXPIRY_MS = 30000; // 30秒内认为是本地写入的

// [v7.24.1] Watch 重连与补偿同步节流参数
const WATCH_RECONNECT_MIN_INTERVAL = 10000; // 最小重连间隔 10s
const WATCH_RECONCILE_COOLDOWN = 15000; // 重连后补偿同步冷却 15s
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
    if (typeof isSaving !== 'undefined' && isSaving) {
        return false;
    }

    watchReconcileInFlight = true;
    lastWatchReconcileAt = now;
    try {
        // [v7.28.0] 增量同步优先：30 分钟内有同步记录时用 fetchDelta（轻量，无需全表加载）
        const timeSinceSyncMs = now - lastCloudSyncAt;
        if (lastCloudSyncAt > 0 && timeSinceSyncMs < 30 * 60 * 1000) {
            const delta = await DAL.fetchDelta(lastCloudSyncAt);
            if (delta !== null) {
                // 成功（delta 为空数组也表示云函数可用且无新数据）
                mergeTransactionDelta(delta);
                lastCloudSyncAt = Date.now();
                localStorage.setItem('tb_lastCloudSyncAt', String(lastCloudSyncAt));
                console.log(`✅ [Watch] ${source} 增量同步完成 (${delta.length} 条新记录)`);
                return true;
            }
            // null → 云函数未部署，降级到全量同步
            console.log(`[Watch] ${source} 云函数不可用，降级全量同步`);
        }
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
    } catch (e) {
        console.warn(`⚠️ [Watch] ${source} 补偿同步失败:`, e?.message || e);
        return false;
    } finally {
        watchReconcileInFlight = false;
    }
}

// [v7.9.3] Watch 断线自动重连调度器（带指数退避）
function scheduleWatchReconnect(reason = 'error') {
    // 防止重复调度
    if (watchReconnectTimers.pending) return;

    const maxAttempts = Math.max(...Object.values(watchReconnectAttempts));
    const baseDelay = 3000; // 3秒起步
    const backoffDelay = Math.min(baseDelay * Math.pow(1.5, maxAttempts), 60000); // 最大60秒
    const reconnectGap = Date.now() - lastWatchReconnectAt;
    const minGapDelay = Math.max(0, WATCH_RECONNECT_MIN_INTERVAL - reconnectGap);
    const delay = Math.max(backoffDelay, minGapDelay);

    console.log(`🔄 [Watch] 计划重连 (原因: ${reason}, 延迟: ${Math.round(delay/1000)}秒)`);
    updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示

    watchReconnectTimers.pending = setTimeout(async () => {
        watchReconnectTimers.pending = null;

        if (!isLoggedIn()) {
            console.log('[Watch] 未登录，取消重连');
            return;
        }

        // 检查是否真的需要重连
        const needsReconnect = Object.entries(watchConnected).some(([key, connected]) => !connected);
        if (!needsReconnect) {
            console.log('[Watch] 所有连接正常，无需重连');
            // 重置计数器
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            return;
        }

        console.log('🔄 [Watch] 执行重连...');
        try {
            lastWatchReconnectAt = Date.now();
            await DAL.subscribeAll();
            await reconcileCloudAfterWatch('reconnect');
            // 重置计数器
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
            console.log('✅ [Watch] 重连成功');
        } catch (e) {
            console.error('❌ [Watch] 重连失败:', e);
            // 增加计数器并再次调度
            Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k]++);
            scheduleWatchReconnect('retry');
        }
    }, delay);
}

// [v7.9.3] 检查并重建失效的 watchers（页面恢复可见时调用）
// [v7.13.0] 增强：休眠恢复后强制重建所有 watch 连接
async function checkAndRebuildWatchers(forceRebuild = false) {
    if (!isLoggedIn()) return;

    // [v7.13.0] 如果是从休眠恢复，强制重建所有连接
    if (forceRebuild || isRecoveringFromHibernate) {
        console.log('🔄 [Watch] 休眠恢复：强制重建所有监听连接');
        // 重置所有连接状态
        Object.keys(watchConnected).forEach(key => watchConnected[key] = false);
        updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示
        try {
            await DAL.subscribeAll();
            await reconcileCloudAfterWatch('force-rebuild');
            console.log('✅ [Watch] 休眠恢复：重建监听成功');
            // 重建成功后重置休眠恢复标志
            isRecoveringFromHibernate = false;
        } catch (e) {
            console.error('❌ [Watch] 休眠恢复：重建监听失败:', e);
            scheduleWatchReconnect('hibernate-rebuild-failed');
        }
        return;
    }

    // 检查任意一个 watcher 是否失效
    const disconnectedWatchers = Object.entries(watchConnected)
        .filter(([key, connected]) => !connected)
        .map(([key]) => key);

    if (disconnectedWatchers.length > 0) {
        console.log(`🔄 [Watch] 检测到 ${disconnectedWatchers.length} 个连接断开:`, disconnectedWatchers.join(', '));
        updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示
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

// [v7.25.4] 主动同步机制：每 30 秒定期检查 Watch 状态并执行补偿同步
let activeSyncInterval = null;
const ACTIVE_SYNC_INTERVAL_MS = 30000; // 30 秒

function startActiveSync() {
    if (activeSyncInterval) {
        clearInterval(activeSyncInterval);
    }
    activeSyncInterval = setInterval(function() {
        if (!isLoggedIn()) return;

        // [v7.30.1] 修复 completionCount 与交易记录不一致
        tasks.forEach(task => {
            const txCount = transactions.filter(t => t.taskId === task.id).length;
            const storedCount = task.completionCount || 0;
            if (txCount !== storedCount) {
                console.log(`[completionCount 修复] taskId=${task.id}, 交易数=${txCount}, 存储=${storedCount} → 修正为${txCount}`);
                task.completionCount = txCount;
            }
        });

        // [v7.30.0] 清理过期的本地交易追踪记录
        const now = Date.now();
        for (const [txId, timestamp] of recentLocalTransactions) {
            if (now - timestamp > RECENT_TX_EXPIRY_MS) {
                recentLocalTransactions.delete(txId);
            }
        }

        // [v7.30.0] Watch 心跳检测：检查是否长时间未收到事件
        const staleWatchers = [];
        for (const [key, lastTime] of Object.entries(watchLastEventTime)) {
            if (lastTime > 0 && now - lastTime > WATCH_HEARTBEAT_TIMEOUT_MS) {
                staleWatchers.push(key);
            }
        }
        if (staleWatchers.length > 0) {
            console.warn(`🔄 [主动同步] Watch 心跳超时: ${staleWatchers.join(', ')} 无事件超过 ${WATCH_HEARTBEAT_TIMEOUT_MS/1000}秒，触发重建`);
            staleWatchers.forEach(key => { watchConnected[key] = false; });
            // [v7.30.1] 修复：心跳超时后不仅重建 Watch，还要立即执行补偿同步
            // 确保心跳超时期间错过的数据变更能够被同步
            checkAndRebuildWatchers(true);
            reconcileCloudAfterWatch('heartbeat-timeout');
            return;
        }

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
        showImportProgressModal(); // [v7.25.2]
        
        // 检查数据库是否初始化
        if (!db) {
            closeImportProgressModal(false, '数据库未初始化，请刷新页面重试');
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
                updateImportStep('clear', 'error', '清理超时'); // [v7.25.2]
                throw new Error('清理旧数据超时，请先在CloudBase控制台手动清空数据后再导入');
            }
            // [v7.25.0-fix3] 数据完整性优先：清理失败时中止导入，避免新旧数据混合
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
        const CONCURRENT_WRITES = 50;
        const WRITE_BATCH_DELAY = 100; // ms
        const MAX_TX_RETRIES = 3;
        let txSuccessCount = 0;
        let txErrorCount = 0;

        const writeTxWithRetry = async (txData, retries = 0) => {
            try {
                await db.collection(TABLES.TRANSACTION).add(txData);
                txSuccessCount++;
            } catch (err) {
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
        dailyChanges = oldDaily;
        deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(data.deletedTaskCategoryMap);
        currentBalance = data.currentBalance || 0;
        balanceMode = { ...balanceMode, ...importedBalanceMode };
        applySleepSettingsFromCloud(importedSleepSettings, 'import', true);
        // [v7.8.2] notificationSettings 改为纯本地存储（v7.1.7），不从备份恢复
        // notificationSettings 保持当前值，由 loadNotificationSettings() 从 localStorage 加载
        categoryColors = new Map(data.categoryColors || []);
        collapsedCategories = new Set(data.collapsedCategories || []);
        hasCompletedFirstCloudSync = true;
        updateBalanceModeUI();
        
        // 启动实时监听
        await this.subscribeAll();
        
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
        
        // [v7.1.1] 对嵌套对象使用 _.set() 强制替换，避免 null 合并问题
        const updateData = { ...data };
        if ('settings' in data) updateData.settings = _.set(data.settings);
        if ('reportState' in data) updateData.reportState = _.set(data.reportState);
        if ('categoryColors' in data) updateData.categoryColors = _.set(data.categoryColors);
        if ('collapsedCategories' in data) updateData.collapsedCategories = _.set(data.collapsedCategories);
        if ('deletedTaskCategoryMap' in data) updateData.deletedTaskCategoryMap = _.set(data.deletedTaskCategoryMap);
        
        // [v7.8.1] 改用 update（兼容内置权限"读取和修改本人数据"）
        await db.collection(TABLES.PROFILE).doc(this.profileId).update(updateData);
        
        // [v7.30.1] 修复：使用 _.set 处理 dot-notation key，确保内存与云端一致
        // 原代码 Object.assign 无法正确处理 "deviceSpecificData.deviceId123" 这样的嵌套 key
        for (const [key, value] of Object.entries(data)) {
            if (key.includes('.')) {
                _.set(this.profileData, key, value);
            } else {
                this.profileData[key] = value;
            }
        }
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
                // 保留较新的，删除旧的
                db.collection(TABLES.TASK).doc(docId).remove();
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
        const existingDocId = this.taskCache.get(task.id);
        const currentUid = await this.getCurrentUid();
        
        console.log('[DAL.saveTask] 保存任务:', task.id, task.name, 'existingDocId:', existingDocId);
        
        if (!currentUid) {
            throw new Error('未登录，无法保存任务');
        }
        
        // [v7.1.1] 修复: 当 habitDetails 从 null 变为对象时，MongoDB 无法在 null 上创建嵌套字段
        // 解决方案: 确保 habitDetails 始终是对象(空对象{})或有效值，永不为 null
        const safeHabitDetails = task.habitDetails ? { ...task.habitDetails } : {};
        // 如果 isHabit 为 false，则 habitDetails 设为空对象而非 null
        const finalHabitDetails = task.isHabit ? safeHabitDetails : {};
        
        const taskData = {
            taskId: task.id,
            name: task.name,
            category: task.category,
            amount: task.amount,
            unit: task.unit || 'minutes',
            type: task.type,
            multiplier: task.multiplier || 1,
            isHabit: task.isHabit || false,
            habitDetails: finalHabitDetails,  // 永不为 null
            enableFloatingTimer: task.enableFloatingTimer || false,
            lastUsed: task.lastUsed || null,
            isSystem: task.isSystem || false,
            // [v7.1.1] 深度清理：1) 移除 _openid/_id  2) 将 habitDetails null 转为空对象
            data: JSON.parse(JSON.stringify(task, (key, value) => {
                if (key === '_openid' || key === '_id') return undefined;
                if (key === 'habitDetails' && value === null) return {};
                return value;
            }))
        };
        
        try {
            if (existingDocId) {
                // [v7.1.1] 修复: MongoDB 无法在 null 上创建嵌套字段
                // 解决方案: 使用 _.set() 强制替换 habitDetails 和 data 字段
                console.log('[DAL.saveTask] 更新文档, docId:', existingDocId, 'collection:', TABLES.TASK);
                
                // 对可能为 null 的嵌套对象字段使用 _.set() 强制替换
                const updateData = {
                    ...taskData,
                    habitDetails: _.set(taskData.habitDetails),  // 强制替换，不合并
                    data: _.set(taskData.data)  // 强制替换，不合并
                };
                
                const updateRes = await db.collection(TABLES.TASK).doc(existingDocId).update(updateData);
                // 检查返回结果中是否有错误码
                if (updateRes && updateRes.code) {
                    console.error('[DAL.saveTask] ❌ 更新失败:', updateRes.code, updateRes.message);
                    throw new Error(updateRes.message || updateRes.code);
                }
                console.log('[DAL.saveTask] ✅ 更新成功, updated:', updateRes?.updated);
            } else {
                // [v7.1.8] tb_task 使用预置规则，CloudBase 自动添加 _openid
                const res = await db.collection(TABLES.TASK).add(taskData);
                // 检查返回结果中是否有错误码
                if (res && res.code) {
                    console.error('[DAL.saveTask] ❌ 新增失败:', res.code, res.message);
                    throw new Error(res.message || res.code);
                }
                this.taskCache.set(task.id, res.id || res._id);
                console.log('[DAL.saveTask] ✅ 新增成功, docId:', res.id || res._id);
            }
        } catch (err) {
            console.error('[DAL.saveTask] ❌ 保存失败:', err.code, err.message, JSON.stringify(err));
            throw err;
        }
    },
    
    async deleteTask(taskId) {
        const docId = this.taskCache.get(taskId);
        if (docId) {
            await db.collection(TABLES.TASK).doc(docId).remove();
            this.taskCache.delete(taskId);
        }
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
                // 删除重复
                db.collection(TABLES.TRANSACTION).doc(doc._id).remove();
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
    
    // [v7.30.6] 事务包装：确保内存更新和云端同步的原子性
    // [v7.30.6-fix] 修复：检查交易是否已在内存中，避免重复添加
    async addTransaction(tx) {
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.addTransaction] 开始写入交易:', tx.id, tx.taskName, tx.amount, 'UID:', currentUid);

        if (!currentUid) {
            throw new Error('未登录，无法保存交易');
        }

        // [v7.30.6-fix] 检查交易是否已在内存中（如通过 app-reports.js 的 addTransaction 调用）
        const existingTx = transactions.find(t => t.id === tx.id);
        if (existingTx) {
            console.log(`[DAL.addTransaction] 交易已在内存中，跳过内存更新: ${tx.id}`);
            // 标记为待同步状态
            tx._syncState = existingTx._syncState || 'pending';
            tx._localTimestamp = existingTx._localTimestamp || Date.now();
        } else {
            // [v7.30.6] 步骤1：标记为待同步状态，立即更新内存
            tx._syncState = 'pending';
            tx._localTimestamp = Date.now();
            
            // [v7.30.6] 步骤2：立即更新内存和 UI（乐观更新）
            transactions.push(tx);
            recalculateBalance();
            updateDailyChanges(tx.type, tx.amount, new Date(tx.timestamp));
            updateAllUI();
        }
        
        // [v7.30.0] 标记为本地写入，防止 Watch add 事件重复累加
        recentLocalTransactions.set(tx.id, Date.now());
        
        // [v7.30.1] 优化：每写入 10 条清理一次过期记录
        if (recentLocalTransactions.size % 10 === 0) {
            const now = Date.now();
            let expiredCount = 0;
            for (const [id, ts] of recentLocalTransactions) {
                if (now - ts > RECENT_TX_EXPIRY_MS) {
                    recentLocalTransactions.delete(id);
                    expiredCount++;
                }
            }
            if (expiredCount > 0) {
                console.log(`[DAL.addTransaction] 清理 ${expiredCount} 条过期本地交易记录`);
            }
        }

        try {
            let docId;
            // [v7.28.0] 优先通过云函数幂等写入
            const safeResult = await this.writeTransactionSafe(tx);
            if (safeResult !== null) {
                if (safeResult.action === 'skipped') {
                    console.log('[DAL.addTransaction] ⏭️ 云函数跳过（记录已存在）:', tx.id);
                    recentLocalTransactions.delete(tx.id);
                } else {
                    console.log(`[DAL.addTransaction] ✅ 云函数写入成功 (${safeResult.action}): ${safeResult.id}`);
                }
                docId = safeResult.id || tx.id;
            } else {
                // [v7.28.0] 云函数未部署，降级到直接写入
                const res = await db.collection(TABLES.TRANSACTION).add({
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
                });
                docId = res.id;
                console.log('[DAL.addTransaction] ✅ 直接写入成功, docId:', docId);
            }
            this.transactionCache.set(tx.id, docId);
            
            // [v7.30.6] 步骤3：标记为已同步
            tx._syncState = 'synced';
            tx._syncedAt = Date.now();
            
            return docId;
        } catch (err) {
            // [v7.30.6] 步骤4：同步失败，标记为失败并调度重试
            console.error('[DAL.addTransaction] ❌ 写入失败:', err.code, err.message);
            tx._syncState = 'failed';
            tx._syncError = err.message;
            this.scheduleSyncRetry(tx);
            throw err;
        }
    },
    
    // [v7.30.6] 调度同步重试
    scheduleSyncRetry(tx) {
        console.log(`[DAL.scheduleSyncRetry] 调度交易 ${tx.id} 的重试`);
        setTimeout(async () => {
            try {
                tx._syncState = 'retrying';
                await this.addTransaction(tx);
                console.log(`[DAL.scheduleSyncRetry] ✅ 重试成功: ${tx.id}`);
            } catch (e) {
                console.error(`[DAL.scheduleSyncRetry] ❌ 重试失败: ${tx.id}`, e);
                tx._syncState = 'failed';
            }
        }, 5000); // 5秒后重试
    },

    async updateTransaction(tx, prevTx = null) {
        const currentUid = await this.getCurrentUid();
        console.log('[DAL.updateTransaction] 开始更新交易:', tx.id, tx.taskName, tx.amount, 'UID:', currentUid);
        
        if (!currentUid) {
            throw new Error('未登录，无法更新交易');
        }
        
        let docId = this.transactionCache.get(tx.id);
        let existingTx = prevTx;
        
        try {
            if (!docId || !existingTx) {
                const res = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: currentUid, txId: tx.id })
                    .limit(1)
                    .get();
                
                if (res.data && res.data.length > 0) {
                    const doc = res.data[0];
                    docId = doc._id || doc.id;
                    this.transactionCache.set(tx.id, docId);
                    if (!existingTx) {
                        existingTx = doc.data || doc;
                    }
                }
            }
            
            if (!docId) {
                throw new Error('云端未找到该交易记录');
            }
            
            const updateData = {
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
            };
            
            await db.collection(TABLES.TRANSACTION).doc(docId).update(updateData);
            console.log('[DAL.updateTransaction] ✅ 更新成功, docId:', docId);
            
            if (existingTx) {
                const oldType = existingTx.type || (existingTx.amount >= 0 ? 'earn' : 'spend');
                const newType = tx.type || oldType;
                const oldAmount = existingTx.amount || 0;
                const newAmount = tx.amount || 0;
                const oldEffect = oldType === 'earn' ? oldAmount : -oldAmount;
                const newEffect = newType === 'earn' ? newAmount : -newAmount;
                const balanceDelta = newEffect - oldEffect;
                
                const oldDate = getLocalDateString(new Date(existingTx.timestamp));
                const newDate = getLocalDateString(new Date(tx.timestamp));
                const shouldUpdateDaily = oldType !== newType || oldAmount !== newAmount || oldDate !== newDate;
                
                if (shouldUpdateDaily) {
                    await this.updateDailyChange({
                        type: oldType,
                        amount: oldAmount,
                        timestamp: existingTx.timestamp
                    }, true);
                    await this.updateDailyChange({
                        type: newType,
                        amount: newAmount,
                        timestamp: tx.timestamp
                    }, false);
                }
                
                if (balanceDelta !== 0) {
                    await this.updateCachedBalance(balanceDelta);
                }
            }
        } catch (err) {
            console.error('[DAL.updateTransaction] ❌ 更新失败:', err.code, err.message);
            throw err;
        }
    },

    // [v7.26.2] 批量更新同一任务下所有交易的 taskName（改名同步到云端）
    async renameTransactionTaskName(taskId, newTaskName) {
        const currentUid = await this.getCurrentUid();
        if (!currentUid) return;
        try {
            await db.collection(TABLES.TRANSACTION)
                .where({ _openid: currentUid, taskId: taskId })
                .update({ taskName: newTaskName, 'data.taskName': newTaskName });
            console.log('[DAL.renameTransactionTaskName] ✅ 批量更新 taskName 完成:', taskId, '->', newTaskName);
        } catch (err) {
            console.error('[DAL.renameTransactionTaskName] ❌ 失败:', err.code, err.message);
        }
    },
    
    async deleteTransaction(txId) {
        console.log('[DAL.deleteTransaction] 开始删除交易:', txId);
        const docId = this.transactionCache.get(txId);
        console.log('[DAL.deleteTransaction] 缓存中的 docId:', docId);
        
        if (!docId) {
            console.warn('[DAL.deleteTransaction] ⚠️ 未找到缓存的 docId，尝试查询...');
            // 尝试从数据库查找
            const currentUid = await this.getCurrentUid();
            const res = await db.collection(TABLES.TRANSACTION)
                .where({ _openid: currentUid, txId: txId })
                .limit(1)
                .get();
            
            if (res.data && res.data.length > 0) {
                const doc = res.data[0];
                const foundDocId = doc._id || doc.id;
                console.log('[DAL.deleteTransaction] 查询到 docId:', foundDocId);
                
                await db.collection(TABLES.TRANSACTION).doc(foundDocId).remove();
                console.log('[DAL.deleteTransaction] ✅ 删除成功');
                
                const tx = doc.data || doc;
                if (tx) {
                    await this.updateCachedBalance(tx.type === 'earn' ? -tx.amount : tx.amount);
                    await this.updateDailyChange(tx, true);
                }
            } else {
                console.warn('[DAL.deleteTransaction] ⚠️ 云端未找到该交易');
            }
            return;
        }
        
        try {
            // 获取交易数据用于反向更新
            const res = await db.collection(TABLES.TRANSACTION).doc(docId).get();
            const tx = res.data?.data || res.data;
            
            await db.collection(TABLES.TRANSACTION).doc(docId).remove();
            this.transactionCache.delete(txId);
            console.log('[DAL.deleteTransaction] ✅ 删除成功');
            
            if (tx) {
                await this.updateCachedBalance(tx.type === 'earn' ? -tx.amount : tx.amount);
                await this.updateDailyChange(tx, true);
            }
        } catch (err) {
            console.error('[DAL.deleteTransaction] ❌ 删除失败:', err.code, err.message);
            throw err;
        }
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
        const existingDocId = this.runningCache.get(taskId);
        
        // [v7.1.8] 预置安全规则会自动设置 _openid，不需要手动添加
        const runningData = {
            taskId: taskId,
            startTime: data.startTime,
            accumulatedTime: data.accumulatedTime || 0,
            isPaused: data.isPaused || false,
            clientId: clientId,
            data: data
        };
        
        try {
            if (existingDocId) {
                await db.collection(TABLES.RUNNING).doc(existingDocId).update({
                    ...runningData,
                    data: _.set(runningData.data)
                });
            } else {
                // 预置规则自动添加 _openid，客户端不能手动设置
                const res = await db.collection(TABLES.RUNNING).add(runningData);
                if (res.code) {
                    console.error('[DAL.startTask] ❌ 添加失败:', res.code, res.message);
                } else {
                    this.runningCache.set(taskId, res.id);
                    console.log('[DAL.startTask] ✅ 添加成功, docId:', res.id);
                }
            }
        } catch (e) {
            console.error('[DAL.startTask] ❌ 异常:', e.code, e.message);
        }
    },
    
    async stopTask(taskId) {
        const docId = this.runningCache.get(taskId);
        if (docId) {
            await db.collection(TABLES.RUNNING).doc(docId).remove();
            this.runningCache.delete(taskId);
        }
    },

    // [v7.30.0] 服务端任务锁 - 跨设备互斥操作
    async lockTask(taskId) {
        try {
            const res = await app.callFunction({
                name: 'timebankTaskLock',
                data: {
                    action: 'lockTask',
                    data: { taskId, clientId, deviceId: clientId }
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
                    data: { taskId, clientId }
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
                    data: { taskId }
                }
            });
            return res.result || { code: -1, locked: false };
        } catch (e) {
            console.error('[DAL.checkTaskLock] 异常:', e);
            return { code: -1, locked: false };
        }
    },

    async updateRunningTask(taskId, data) {
        const docId = this.runningCache.get(taskId);
        if (docId) {
            // [v7.1.8] 更新顶层字段 + data 字段，确保状态正确同步
            try {
                await db.collection(TABLES.RUNNING).doc(docId).update({
                    startTime: data.startTime,
                    accumulatedTime: data.accumulatedTime || 0,
                    isPaused: data.isPaused === true,
                    clientId: clientId,
                    data: _.set(data)
                });
            } catch (e) {
                console.error('[DAL.updateRunningTask] 更新失败:', e);
            }
        }
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
        const date = getLocalDateString(new Date(tx.timestamp));
        const existingDocId = this.dailyCache.get(date);
        const multiplier = reverse ? -1 : 1;
        const earnDelta = tx.type === 'earn' ? tx.amount * multiplier : 0;
        const spendDelta = tx.type === 'spend' ? tx.amount * multiplier : 0;
        
        if (existingDocId) {
            // [v7.1.1] CloudBase SDK v2 不需要 data 包装
            await db.collection(TABLES.DAILY).doc(existingDocId).update({
                earned: _.inc(earnDelta),
                spent: _.inc(spendDelta)
            });
        } else {
            const currentUid = await this.getCurrentUid();
            const res = await db.collection(TABLES.DAILY).add({
                _openid: currentUid,
                date: date,
                earned: earnDelta > 0 ? earnDelta : 0,
                spent: spendDelta > 0 ? spendDelta : 0
            });
            this.dailyCache.set(date, res.id);
        }
    },
    
    // ========== 余额操作 ==========
    async updateCachedBalance(delta, absoluteValue = null) {
        if (!this.profileId) {
            await this.loadProfile();
        }
        if (this.profileId) {
            if (absoluteValue !== null) {
                // 直接设置绝对值
                // [v7.1.1] CloudBase SDK v2 不需要 data 包装
                await db.collection(TABLES.PROFILE).doc(this.profileId).update({
                    cachedBalance: absoluteValue
                });
                if (this.profileData) {
                    this.profileData.cachedBalance = absoluteValue;
                }
                console.log('[DAL.updateCachedBalance] 设置绝对值:', absoluteValue);
            } else {
                // 增量更新
                // [v7.1.1] CloudBase SDK v2 不需要 data 包装
                await db.collection(TABLES.PROFILE).doc(this.profileId).update({
                    cachedBalance: _.inc(delta)
                });
                if (this.profileData) {
                    this.profileData.cachedBalance = (this.profileData.cachedBalance || 0) + delta;
                }
            }
        }
    },
    
    async recalculateBalance() {
        const transactions = await this.loadAllTransactions();
        let balance = 0;
        transactions.forEach(tx => {
            balance += tx.type === 'earn' ? tx.amount : -tx.amount;
        });
        
        if (this.profileId) {
            // [v7.1.1] CloudBase SDK v2 不需要 data 包装
            await db.collection(TABLES.PROFILE).doc(this.profileId).update({
                cachedBalance: balance
            });
            if (this.profileData) {
                this.profileData.cachedBalance = balance;
            }
        }
        
        return balance;
    },
    
    // ========== CloudBase 实时监听 ==========
    async subscribeAll() {
        const loginState = auth.hasLoginState();
        if (!loginState) return;
        
        // [v6.6.0] 防止重复订阅：先取消现有订阅
        await this.unsubscribeAll();
        
        // [v6.6.1] 获取当前用户 UID，Watch 必须指定明确的查询条件
        const currentUid = await this.getCurrentUid();
        if (!currentUid) {
            console.warn('[DAL.subscribeAll] 无法获取 UID，跳过实时监听');
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
                        watchLastEventTime.task = Date.now(); // [v7.30.0] 心跳
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
                        watchConnected.task = false;
                        scheduleWatchReconnect('task-error');
                    }
                });
            watchConnected.task = true; // [v7.9.3] 标记连接成功
        } catch (e) {
            console.warn('[DAL.subscribeAll] Task watch 建立失败:', e.message);
        }
        
        try {
            // 监听 Transaction 表
            watchers.transaction = db.collection(TABLES.TRANSACTION)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.transaction = true;
                        watchLastEventTime.transaction = Date.now(); // [v7.30.0] 心跳
                        console.log('📡 [DAL] Transaction 变更:', snapshot.type);
                        let shouldRecomputeFromLedger = false;
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

                            // [v7.30.0] 清理过期的本地追踪记录
                            if (recentLocalTransactions.has(txId) && Date.now() - recentLocalTransactions.get(txId) > RECENT_TX_EXPIRY_MS) {
                                recentLocalTransactions.delete(txId);
                            }

                            if (change.dataType === 'add') {
                                // [v7.30.6] 事务包装：检查本地待同步状态
                                const localPendingTx = transactions.find(t => t.id === txId && t._syncState === 'pending');
                                if (localPendingTx) {
                                    console.log(`🛡️ [Watch] 忽略云端数据，本地待同步中: ${txId}`);
                                    this.transactionCache.set(txId, doc._id || doc.id);
                                    localPendingTx._syncState = 'synced';
                                    localPendingTx._syncedAt = Date.now();
                                    recentLocalTransactions.delete(txId);
                                    continue;
                                }
                                
                                // [v7.30.0] 如果是本机刚写入的，忽略（避免重复累加）
                                if (recentLocalTransactions.has(txId)) {
                                    console.log(`🛡️ [Watch] 忽略本地写入的交易: ${txId}`);
                                    this.transactionCache.set(txId, doc._id || doc.id);
                                    recentLocalTransactions.delete(txId);
                                    continue;
                                }
                                if (tx && !this.transactionCache.has(txId) && !transactions.some(t => t.id === txId)) {
                                    this.transactionCache.set(txId, doc._id || doc.id);
                                    transactions.unshift(tx);
                                    const balanceDelta = tx.type === 'earn' ? tx.amount : -tx.amount;
                                    const oldBalance = currentBalance;
                                    currentBalance += balanceDelta;
                                    // [v7.9.8] 方案 D: Watch 余额变更日志
                                    console.log(`💰 [Watch] 余额变更: ${oldBalance} -> ${currentBalance} (${balanceDelta > 0 ? '+' : ''}${balanceDelta}秒, 来源: ${tx.taskName})`);
                                    const date = getLocalDateString(new Date(tx.timestamp));
                                    if (!dailyChanges[date]) dailyChanges[date] = { earned: 0, spent: 0 };
                                    if (tx.type === 'earn') {
                                        dailyChanges[date].earned += tx.amount;
                                    } else {
                                        dailyChanges[date].spent += tx.amount;
                                    }
                                }
                            } else if (change.dataType === 'update') {
                                this.transactionCache.set(txId, doc._id || doc.id);
                                const idx = transactions.findIndex(t => t.id === txId);
                                if (idx >= 0) {
                                    transactions[idx] = tx;
                                } else {
                                    transactions.unshift(tx);
                                }
                                shouldRecomputeFromLedger = true;
                            } else if (change.dataType === 'remove') {
                                console.log('📡 [DAL] 交易删除:', txId);
                                const existingTx = transactions.find(t => t.id === txId);
                                if (existingTx) {
                                    const balanceDelta = existingTx.type === 'earn' ? -existingTx.amount : existingTx.amount;
                                    const oldBalance = currentBalance;
                                    currentBalance += balanceDelta;
                                    // [v7.9.8] 方案 D: Watch 删除余额变更日志
                                    console.log(`💰 [Watch] 删除余额变更: ${oldBalance} -> ${currentBalance} (${balanceDelta > 0 ? '+' : ''}${balanceDelta}秒, 删除: ${existingTx.taskName})`);
                                }
                                this.transactionCache.delete(txId);
                                transactions = transactions.filter(t => t.id !== txId);
                                shouldRecomputeFromLedger = true;
                            }
                        }
                        if (shouldRecomputeFromLedger) {
                            recomputeBalanceAndDailyChanges();
                        }
                        updateAllUI();
                    },
                    onError: (err) => {
                        console.error('❌ [DAL] Transaction watch error:', err);
                        watchConnected.transaction = false;
                        scheduleWatchReconnect('transaction-error');
                    }
                });
            watchConnected.transaction = true; // [v7.9.3] 标记连接成功
        } catch (e) {
            console.warn('[DAL.subscribeAll] Transaction watch 建立失败:', e.message);
        }
        
        try {
            // 监听 RunningTask 表
            watchers.running = db.collection(TABLES.RUNNING)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.running = true;
                        watchLastEventTime.running = Date.now(); // [v7.30.0] 心跳
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
                                // [v7.24.1] 仅对本机回写删除启用保护，避免误拦截其他设备的停止事件
                                if (remoteClientId === clientId) {
                                    const timeSinceLastSave = Date.now() - lastSaveTimestamp;
                                    if (timeSinceLastSave < WATCH_GRACE_PERIOD) {
                                        console.log(`🛡️ [DAL] 忽略 delete 事件: 本机保护期内 (${Math.round(timeSinceLastSave/1000)}s < ${WATCH_GRACE_PERIOD/1000}s)`);
                                        continue;
                                    }
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
                        watchConnected.running = false;
                        scheduleWatchReconnect('running-error');
                    }
                });
            watchConnected.running = true; // [v7.9.3] 标记连接成功
        } catch (e) {
            console.warn('[DAL.subscribeAll] Running watch 建立失败:', e.message);
        }
        
        try {
            // 监听 Profile 表
            watchers.profile = db.collection(TABLES.PROFILE)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.profile = true;
                        watchLastEventTime.profile = Date.now(); // [v7.30.0] 心跳
                        console.log('📡 [DAL] Profile 变更');
                        for (const change of snapshot.docChanges) {
                            if (change.dataType === 'update') {
                                const doc = change.doc;
                                profileData = doc;
                                // [v7.1.7] 通知设置已改为本地存储，不再从云端同步
                                categoryColors = new Map(doc.categoryColors || []);
                                collapsedCategories = new Set(doc.collapsedCategories || []);
                                deletedTaskCategoryMap = normalizeDeletedTaskCategoryMap(doc.deletedTaskCategoryMap);
                                // [v7.11.3] 监听睡眠配置/状态（跨设备实时同步）
                                let sleepUpdated = false;
                                if (doc.sleepSettingsShared) {
                                    sleepUpdated = applySleepSettingsFromCloud(doc.sleepSettingsShared, 'watch', true) || sleepUpdated;
                                }
                                if (doc.sleepStateShared) {
                                    sleepUpdated = applySleepStateFromCloud(doc.sleepStateShared, 'watch') || sleepUpdated;
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
                        watchConnected.profile = false;
                        scheduleWatchReconnect('profile-error');
                    }
                });
            watchConnected.profile = true; // [v7.9.3] 标记连接成功
        } catch (e) {
            console.warn('[DAL.subscribeAll] Profile watch 建立失败:', e.message);
        }
        
        try {
            // [v7.1.8] 监听 Daily 表
            watchers.daily = db.collection(TABLES.DAILY)
                .where({ _openid: currentUid })
                .watch({
                    onChange: (snapshot) => {
                        watchConnected.daily = true;
                        watchLastEventTime.daily = Date.now(); // [v7.30.0] 心跳
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
                        watchConnected.daily = false;
                        scheduleWatchReconnect('daily-error');
                    }
                });
            watchConnected.daily = true; // [v7.9.3] 标记连接成功
        } catch (e) {
            console.warn('[DAL.subscribeAll] Daily watch 建立失败:', e.message);
        }
        
        console.log('✅ [DAL] 所有表实时监听已启动');
        setAuthStatus('已同步 ✅', 'status-online');
        updateWatchStatusUI(); // [v7.30.8] 更新监听状态显示
    },

    async unsubscribeAll() {
        for (const key of Object.keys(watchers)) {
            if (watchers[key]) {
                await watchers[key].close();
                watchers[key] = null;
            }
            // [v7.9.3] 重置连接状态
            if (watchConnected.hasOwnProperty(key)) {
                watchConnected[key] = false;
            }
            // [v7.30.0] 重置心跳时间
            if (watchLastEventTime.hasOwnProperty(key)) {
                watchLastEventTime[key] = 0;
            }
        }
    },

    // [v7.28.0] 增量同步：从云函数获取 lastSyncAt 之后有更新的交易记录
    // 依赖云函数 timebankSync（action: getDelta）
    // 返回值语义：Array = 成功（可为空数组）；null = 云函数不可用，调用方应降级到全量同步
    // [v7.30.1] 增加云函数可用性缓存，避免每次 Watch 重建都尝试调用不存在的云函数
    _cloudFunctionAvailable: null,  // null=未知，true=可用，false=不可用
    async fetchDelta(lastSyncAt) {
        if (!isLoggedIn()) return null;
        
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
                    data: { lastSyncAt: lastSyncAt || 0 }
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

    // [v7.28.0] 幂等安全写入：通过云函数校验后写入，防止重复/旧覆新
    // 依赖云函数 timebankSync（action: writeTransaction）
    // 云函数未部署时返回 null（调用方应降级到直接写入）
    async writeTransactionSafe(tx) {
        if (!isLoggedIn()) return null;
        try {
            const result = await app.callFunction({
                name: 'timebankSync',
                data: {
                    action: 'writeTransaction',
                    data: { transaction: tx }
                }
            });
            const res = result?.result;
            if (res?.code === 0) {
                if (res.action !== 'skipped') {
                    console.log(`[DAL.writeTransactionSafe] ${res.action}: ${res.id}`);
                }
                return res;
            }
            return null;
        } catch (e) {
            if (!e.message?.includes('not found') && !e.message?.includes('ResourceNotFound')) {
                console.warn('[DAL.writeTransactionSafe] 写入失败:', e.message);
            }
            return null;
        }
    },
    
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
        
        // [v7.9.6] 改进：移除本地缓存恢复逻辑
        // 原因：本地缓存可能是旧数据，会导致覆盖云端新数据
        // 现在完全信任云端数据，如果云端为空则说明确实没有数据
        let finalTasks = loadedTasks;
        let finalTransactions = loadedTransactions;
        
        // [v7.9.6] 详细诊断：如果数据为空，输出诊断信息但不尝试恢复
        if (loadedTransactions.length === 0) {
            console.warn('⚠️ [DAL.loadAll] 云端交易记录为空');
            console.warn('⚠️ [DAL.loadAll] 这可能是新用户或网络问题，UID:', await this.getCurrentUid());
        }
        
        if (loadedTasks.length === 0) {
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

        // [v7.30.4] 保存保护期检查：防止云端同步覆盖本地刚停止的任务
        const timeSinceLastSave = Date.now() - lastSaveTimestamp;
        const isInSaveProtection = lastSaveTimestamp > 0 && timeSinceLastSave < WATCH_GRACE_PERIOD;
        const localRunningSize = runningTasks.size;
        console.log(`[DAL.loadAll] runningTasks 保护检查: localSize=${localRunningSize}, cloudSize=${loadedRunning?.size || 0}, timeSinceLastSave=${Math.floor(timeSinceLastSave/1000)}s, isInSaveProtection=${isInSaveProtection}`);

        // 应用到全局状态 (CloudBase 直接访问属性)
        profileData = profile;
        tasks = finalTasks;
        transactions = finalTransactions;

        // [v7.30.4] 只有不在保护期内才信任云端的 runningTasks
        if (isInSaveProtection) {
            console.log(`🛡️ [DAL.loadAll] 保存保护期内，保持本地 runningTasks: ${localRunningSize}个`);
            // 不替换 runningTasks，保持本地状态
        } else {
            console.log(`🔄 [DAL.loadAll] 应用云端 runningTasks: ${loadedRunning?.size || 0}个`);
            runningTasks = loadedRunning;
        }

        dailyChanges = loadedDaily;
        
        // [v7.9.8] 方案 A: 强制从交易记录重新计算余额（不依赖任何缓存）
        // 这是确保余额正确的唯一可靠方法
        const calculatedBalance = finalTransactions.reduce((sum, tx) => {
            if (tx.undone) return sum; // [v7.15.4] 跳过已撤回的交易
            return sum + (tx.type === 'earn' ? tx.amount : -tx.amount);
        }, 0);
        
        // [v7.9.8] 方案 C: 启动时校验余额一致性
        const oldBalance = currentBalance;
        const cachedBalance = profile.cachedBalance || 0;
        currentBalance = calculatedBalance; // 强制使用计算值
        
        // [v7.9.8] 方案 D: 详细的余额同步日志
        console.log(`💰 [DAL.loadAll] 余额同步报告:`);
        console.log(`   - 内存中旧余额: ${oldBalance} (${Math.round(oldBalance/60)}分钟)`);
        console.log(`   - 云端缓存余额: ${cachedBalance} (${Math.round(cachedBalance/60)}分钟)`);
        console.log(`   - 交易记录计算: ${calculatedBalance} (${Math.round(calculatedBalance/60)}分钟)`);
        console.log(`   - 最终使用余额: ${currentBalance} (${Math.round(currentBalance/60)}分钟)`);
        
        // 检测并报告不一致情况
        if (oldBalance !== 0 && oldBalance !== calculatedBalance) {
            console.warn(`⚠️ [DAL.loadAll] 内存余额与计算值不一致! 差异=${calculatedBalance - oldBalance}秒 (${Math.round((calculatedBalance - oldBalance)/60)}分钟)`);
        }
        if (cachedBalance !== calculatedBalance) {
            console.warn(`⚠️ [DAL.loadAll] 云端缓存与计算值不一致! 差异=${calculatedBalance - cachedBalance}秒 (${Math.round((calculatedBalance - cachedBalance)/60)}分钟)`);
        }
        
        // [v7.9.8] 只有当云端数据正常加载时才更新缓存余额
        if (loadedTransactions.length > 0 && cachedBalance !== calculatedBalance) {
            console.log(`🔄 [DAL.loadAll] 同步云端缓存余额: ${cachedBalance} -> ${calculatedBalance}`);
            this.updateCachedBalance(0, calculatedBalance).catch(err => {
                console.error('[DAL.loadAll] 更新缓存余额失败:', err.message);
            });
        }

        // [v7.30.1] 修复 completionCount 与交易记录不一致
        tasks.forEach(task => {
            const txCount = transactions.filter(t => t.taskId === task.id).length;
            const storedCount = task.completionCount || 0;
            if (txCount !== storedCount) {
                console.warn(`[completionCount 修复] taskId=${task.id}, 交易数=${txCount}, 存储=${storedCount} → 修正为${txCount}`);
                task.completionCount = txCount;
            }
        });

        // [v7.1.7] 通知设置已改为本地存储，不再从云端加载
        categoryColors = new Map(profile.categoryColors || []);
        collapsedCategories = new Set(profile.collapsedCategories || []);
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
        // [v7.28.0] 云端同步完成：解除写入门禁，更新时间戳
        releaseCloudSyncWriteLock();
        lastCloudSyncAt = Date.now();
        localStorage.setItem('tb_lastCloudSyncAt', String(lastCloudSyncAt));
        
        console.log(`✅ [DAL] 加载完成: ${tasks.length}任务, ${transactions.length}交易, ${runningTasks.size}运行中`);
        
        // 订阅实时更新
        await this.subscribeAll();
        
        return true;
    }
};

// ============================================================================
// [v6.0.0] 多表架构 END
// ============================================================================

/**
 * [v7.28.0] mergeTransactionDelta
 * 将 fetchDelta 或 Watch 返回的增量记录安全合并到本地 transactions 数组。
 *
 * 合并规则（云端为最终真相）：
 *   - 本端不存在该记录 → 追加（新记录）
 *   - 本端存在 + 云端 undone=true + 本端 undone=false → 应用撤回
 *   - 其他情况（本端写入门禁已防止陈旧写入，无需用云端覆盖本端）→ 跳过
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
        return tx;
    }).filter(t => t.id); // 丢弃无法提取业务 ID 的记录

    // 用 tx.id（客户端生成的业务 ID）作为去重 key
    const localById = new Map(transactions.map(t => [t.id, t]));
    let changed = false;

    for (const remoteTx of remoteTxs) {
        const local = localById.get(remoteTx.id);

        if (!local) {
            // 本端缺失，追加新记录
            transactions.push(remoteTx);
            localById.set(remoteTx.id, remoteTx);
            changed = true;
        } else if (remoteTx.undone === true && !local.undone) {
            // 云端已撤回但本端未撤回，应用撤回
            local.undone = true;
            if (remoteTx.undoneAt) local.undoneAt = remoteTx.undoneAt;
            changed = true;
        }
        // 其他情况：跳过（cloudSyncWriteLock 已防止陈旧写入）
    }

    if (changed) {
        recomputeBalanceAndDailyChanges();
        if (typeof updateAllUI === 'function') updateAllUI();
    }

    return changed;
}

// --- App State ---
let currentBalance = 0; 
let tasks = []; 
let transactions = []; 
let categoryColors = new Map(); 
let collapsedCategories = new Set(); 
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


let reportState = { 
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
};
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
// CloudBase 用户使用 DAL 的 watch 实时监听功能
let isSyncing = false;      // Flag to prevent save loops
let isSaving = false;       // Flag to prevent concurrent saves
let saveQueue = null;       // Queue for pending saves

// [v4.8.7] 启动同步锁：防止App启动时旧数据自动保存覆盖云端新数据
let hasCompletedFirstCloudSync = false;

// [v7.28.0] 陈旧端写入门禁：防止长期不活跃的端用陈旧本地数据覆盖云端
let lastCloudSyncAt = parseInt(localStorage.getItem('tb_lastCloudSyncAt') || '0');
const STALE_SYNC_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6小时视为陈旧
let cloudSyncWriteLock = false;
let _cloudSyncWriteLockTimer = null;

// 激活写入门禁（reason 用于日志）
function activateCloudSyncWriteLock(reason) {
    if (cloudSyncWriteLock) return;
    cloudSyncWriteLock = true;
    console.warn(`🔒 [v7.28.0] 写入门禁激活 (${reason})，已登录端却陈旧，等待云端同步完成`);
    if (_cloudSyncWriteLockTimer) clearTimeout(_cloudSyncWriteLockTimer);
    // [v7.30.1] 修复：延长到 60 秒，并增加条件判断
    // 只有在 hasCompletedFirstCloudSync 已变为 true（说明 loadAll 已经开始执行）
    // 或者确实检测到离线状态时才自动解锁
    _cloudSyncWriteLockTimer = setTimeout(() => {
        if (cloudSyncWriteLock) {
            // 检查是否真的处于离线状态或有其他保护机制
            if (!hasCompletedFirstCloudSync && !navigator.onLine) {
                console.warn('[v7.30.1] 写入门禁：60s超时，检测到离线状态，强制解锁');
                cloudSyncWriteLock = false;
                _cloudSyncWriteLockTimer = null;
            } else if (hasCompletedFirstCloudSync) {
                // 数据已加载完成，可以安全解锁
                console.warn('[v7.30.1] 写入门禁：60s超时但数据已加载完成，解除锁定');
                cloudSyncWriteLock = false;
                _cloudSyncWriteLockTimer = null;
            } else {
                // 数据未加载完成且在线，延长等待（不再自动解锁，由 loadAll 成功后释放）
                console.warn('[v7.30.1] 写入门禁：60s超时但数据未加载完成，继续保持锁定');
                // 不再自动解锁，必须等待 loadAll() 成功后调用 releaseCloudSyncWriteLock()
            }
        }
    }, 60000);
}

// 解除写入门禁
function releaseCloudSyncWriteLock() {
    if (!cloudSyncWriteLock && _cloudSyncWriteLockTimer === null) return;
    cloudSyncWriteLock = false;
    if (_cloudSyncWriteLockTimer) {
        clearTimeout(_cloudSyncWriteLockTimer);
        _cloudSyncWriteLockTimer = null;
    }
    console.log('🔓 [v7.28.0] 写入门禁已解除');
}

// [v7.1.4] 保存后静默期：防止 watch 收到自己的推送后覆盖本地状态
// [v7.30.4] 增加保护期到 8 秒，防止任务"复活"问题
let lastSaveTimestamp = 0;
const WATCH_GRACE_PERIOD = 8000; // [v7.1.8] 保存后 8 秒内忽略云端推送

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
    console.log("App v7.30.7 Starting (CloudBase)...");
    
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

    // 2. Load Data
    const currentUid = await DAL.getCurrentUid();
    const hasSyncState = auth && typeof auth.hasLoginState === 'function' ? auth.hasLoginState() : null;
    if (currentUid) {
        try {
            await handlePostLoginDataInit('initApp');
        } catch (e) {
            console.error('[initApp] 数据加载失败:', e);
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
        // 未登录，使用本地数据
        await loadData();
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
    // [v7.15.0] 初始化金融系统
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
    setupReportEventListeners(); 
    setupTaskModalEventListeners();
    applyCardLayout(); // [v4.6.0] 应用卡片布局
    initCardStack(); // [v5.10.0] 初始化卡片堆叠
    
    // [v6.6.0] 更新云端状态 UI
    updateCloudStatusUI();
    
    // [v7.14.1] 初始化 Tab 指示器位置
    initTabIndicator();
}

// [v6.6.0] 更新云端状态 UI
async function updateCloudStatusUI() {
    const statusContainer = document.getElementById('multiTableStatusContainer');
    
    if (!statusContainer) return;
    
    const loginState = auth.hasLoginState();
    if (!loginState || !loginState.user) {
        statusContainer.style.display = 'none';
        return;
    }
    
    try {
        // 检查是否有数据
        const hasData = await DAL.checkProfileExists();
        if (hasData) {
            statusContainer.style.display = 'block';
        } else {
            statusContainer.style.display = 'none';
        }
    } catch (e) {
        statusContainer.style.display = 'none';
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

// [v4.8.5] 实时刷新所有习惯的状态（检查是否断签）
function refreshHabitStatuses() {
    const now = new Date();
    tasks.forEach(task => {
        if (task.isHabit) {
            checkHabitStreak(task, now);
        }
    });
}

function updateAllUI() {
    // [v4.3.2] FIX 1: Removed "if (isSyncing) return;" to allow UI to refresh even during sync.
    // isSyncing flag is now only checked in saveData() to prevent save loops.
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

function recomputeBalanceAndDailyChanges() {
    currentBalance = 0;
    dailyChanges = {};
    transactions.forEach(tx => {
        if (tx.undone) return; // [v7.28.0] 过滤已撤回交易，与 DAL.loadAll() 口径保持一致
        const amt = tx.amount || 0;
        if (tx.type === 'earn') {
            currentBalance += amt;
            updateDailyChanges('earned', amt, tx.timestamp);
        } else {
            currentBalance -= amt;
            updateDailyChanges('spent', amt, tx.timestamp);
        }
    });
}

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
    collapsedCategories = new Set([...collapsedCategories].filter(cat => activeCategories.has(cat)));
    expandedTaskCategories = new Set([...expandedTaskCategories].filter(cat => activeCategories.has(cat)));

    // 重新计算余额与日汇总
    recomputeBalanceAndDailyChanges();
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
    saveData();
    return true;
}

async function bootstrapCloudFromLocalData(source = 'unknown') {
    const localData = getLocalData();
    if (!localData) return false;

    applyDataState(localData);
    cleanupDemoDataLocal({ markDone: true });

    const hasContent = (tasks && tasks.length > 0) || (transactions && transactions.length > 0);
    if (!hasContent) return false;

    try {
        console.log(`[bootstrapCloudFromLocalData] Using local data as source (${source})`);
        const snapshot = getAppState();
        await DAL.importFromBackup(snapshot);
        updateAllUI();
        return true;
    } catch (e) {
        console.error('[bootstrapCloudFromLocalData] 导入失败:', e);
        return false;
    }
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

async function handlePostLoginDataInit(source = 'login') {
    const hasData = await DAL.init();
    if (hasData) {
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

    const bootstrapped = await bootstrapCloudFromLocalData(source);
    if (bootstrapped) {
        await DAL.subscribeAll();
        // [v7.25.4] 启动主动同步机制
        startActiveSync();
        showNotification('✅ 已同步本地数据', '示例数据已自动清理并同步到云端', 'achievement');
        return;
    }

    const created = await ensureEmptyProfileForNewUser();
    if (created) {
        await DAL.subscribeAll();
        // [v7.25.4] 启动主动同步机制
        startActiveSync();
        updateAllUI();
        showNotification('📦 欢迎使用', '您可以导入之前的备份数据，或开始全新体验', 'achievement');
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
function updateWatchStatusUI() {
    const earnStatusEl = document.getElementById('watchStatusEarn');
    const spendStatusEl = document.getElementById('watchStatusSpend');

    if (!earnStatusEl && !spendStatusEl) return;

    // 计算监听状态
    const userLoggedIn = typeof isLoggedIn === 'function' ? isLoggedIn() : false;
    const connectedCount = Object.values(watchConnected).filter(Boolean).length;
    const totalWatchers = Object.keys(watchConnected).length;

    let statusClass = '';
    let statusText = '';

    if (!userLoggedIn) {
        statusClass = 'watch-inactive';
        statusText = '未登录';
    } else if (connectedCount === 0) {
        statusClass = 'watch-inactive';
        statusText = '未连接';
    } else if (connectedCount < totalWatchers) {
        statusClass = 'watch-connecting';
        statusText = `连接中 ${connectedCount}/${totalWatchers}`;
    } else {
        statusClass = 'watch-active';
        statusText = '已同步';
    }

    // 更新两个标签页的状态显示
    [earnStatusEl, spendStatusEl].forEach(el => {
        if (el) {
            el.className = `watch-status ${statusClass}`;
            const textEl = el.querySelector('.watch-status-text');
            if (textEl) textEl.textContent = statusText;
        }
    });
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
            
            saveData();
            
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
            if (catTasks.length > CATEGORY_TASK_LIMIT) {
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
            
            saveData();
            
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
// [v7.11.3] "最近任务" 数量调整为 4 个
function updateRecentTasks() { 
    if (isTaskDragging) return; // 拖动中不更新
    const earnTasks = tasks.filter(t => ['reward', 'continuous', 'continuous_target'].includes(t.type)); const spendTasks = tasks.filter(t => ['instant_redeem', 'continuous_redeem'].includes(t.type)); const sortByLastUsed = (taskList) => [...taskList].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).slice(0, RECENT_TASK_LIMIT); renderTaskList('recentEarnTasks', sortByLastUsed(earnTasks)); renderTaskList('recentSpendTasks', sortByLastUsed(spendTasks)); 
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
        const isTaskExpanded = expandedTaskCategories.has(category);
        const totalCount = categoryTasks.length;
        const shouldFold = totalCount > CATEGORY_TASK_LIMIT && !isTaskExpanded;
        const visibleTasks = shouldFold ? categoryTasks.slice(0, CATEGORY_TASK_LIMIT) : categoryTasks;
        const hiddenCount = totalCount - CATEGORY_TASK_LIMIT;
        
        // [v7.17.0] 传递展开/收起参数给 renderTaskCards
        const renderOptions = {
            isLastVisible: shouldFold,
            hiddenCount: hiddenCount,
            isExpanded: isTaskExpanded,
            category: category
        };
        
        // [v7.29.0] 分类栏加入编辑图标，紧跟分类名右侧
        // [v7.29.0] 顺序：颜色 / 名称 / 数量 / 编辑图标 / 图表图标 / 排序图标
        return `<div class="category-tasks" data-category="${escapeHtml(category)}"><div class="category-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleCategory('${category}')"><div class="category-info"><div class="category-color" style="background-color: ${color}"></div><div class="category-name">${category}</div><div class="category-count">(${categoryTasks.length})</div><button class="category-edit-btn" onclick="startCategoryRename('${escapeHtml(category)}',this,event)" title="重命名分类">✏️</button><button class="category-edit-btn category-stats-btn" onclick="showCategoryStats('${escapeHtml(category)}',event)" title="查看分类统计">📊</button><button class="category-edit-btn category-sort-btn" onclick="sortCategoryByTime('${escapeHtml(category)}',this,event)" title="按近7天时长排序" style="font-size: 1.15rem; transform: scale(1.1); transform-origin: center;"><span style="position: relative; top: -1.5px;">⇅</span></button></div><div class="category-toggle">▼</div></div><div class="category-tasks-list ${isCollapsed ? 'collapsed' : ''}"><div class="category-tasks-grid">${renderTaskCards(visibleTasks, renderOptions)}</div></div></div>`; 
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
    saveData();
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
    saveData();
    updateCategoryTasks();
    showToast(`已重命名为"${newName}"`);
}
