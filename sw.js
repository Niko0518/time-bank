// Time Bank Service Worker - v9.9.0
// [v7.9.6] 改为"网络优先"策略，解决数据无法更新的问题
// [v9.0.10] 主动心跳保活 + 8次失败上限 + 自愈探针 + 顶部4状态指示器 + 诊断面板
// [v9.0.11] PWA 端 bug 反馈修复：fetchDelta currentUid + Watch 雪崩治理 + completionCount 写回 + 按钮 ID + SDK 加载时序
// [v9.2.0] 使用偏好独立化（collapsedCategories）+ 报告页 AI 伙伴（时光）+ AI 洞察报告 合并卡片 + 推送自动化
// [v9.2.1] v9.0.12 续作：isImportMode 声明 + Tx/Profile 心跳 + startTask clientId + null-safe + 动态退避 + completionCount 工具
// [v9.2.2] Watch 生命周期修复：beforeunload 清理 Watch + Watchdog 补偿同步时序 + 重建后心跳重置
// [v9.2.3] 冷启动不加载数据修复：DAL.init 重试 + 移除 handlePostLoginDataInit 的 if(hasData) gate + ensureEmptyProfileForNewUser 防御
// [v9.3.0] 同步链路幂等修复：云函数 1003→410 幂等 + 1003 静默化 + recordFailure 错误序列化
// [v9.3.1] 悬浮窗架构重构：原生 Service 为定时器唯一事实来源
// [v9.3.2] Bug 1 修复：stopTask 静默期 + 云端权威源（修复 v9.3.1 任务复活回归）
// [v9.3.3] 原生层云端同步保活：CloudSyncScheduler WorkManager 周期任务（消除 JS 端后台冻结导致的同步丢失）
const CACHE_NAME = 'timebank-cache-v9.9.0';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './sw.js',
    './icon-192.png',
    './icon-512.png'
];
const OFFLINE_FALLBACK = './index.html';

// 需要跳过缓存的URL模式（API请求、CloudBase等）
const SKIP_CACHE_PATTERNS = [
    /\/api\//,
    /cloudbase/,
    /tcb-/,
    /\.cloudbase/,
    /auth\//,
    /\/login/,
    /\/logout/
];

// [v7.9.6] 检查是否是需要跳过缓存的请求
function shouldSkipCache(url) {
    const urlStr = url.toString();
    return SKIP_CACHE_PATTERNS.some(pattern => pattern.test(urlStr));
}

// 安装时缓存核心资源
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                ASSETS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('SW: 缓存失败', url, err);
                    })
                )
            );
        })
    );
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// [v7.9.6] 网络优先策略：先尝试网络，失败时使用缓存
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 跳过非GET请求和需要跳过缓存的请求
    if (request.method !== 'GET' || shouldSkipCache(url)) {
        return;
    }

    // [v8.2.4] 对 HTML/JS/CSS 请求强制绕过浏览器 HTTP 缓存，确保 PWA 更新即时生效
    const isCriticalAsset = /\.(html?|js|css)$/.test(url.pathname) || url.pathname === '/';
    const fetchRequest = isCriticalAsset ? new Request(request, { cache: 'no-cache' }) : request;

    event.respondWith(
        fetch(fetchRequest)
            .then((networkResponse) => {
                // 网络请求成功，更新缓存
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // 网络失败，尝试缓存
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // 如果是导航请求，返回离线页面
                    if (request.mode === 'navigate') {
                        return caches.match(OFFLINE_FALLBACK);
                    }
                    return new Response('Network error', { status: 408 });
                });
            })
    );
});

// 处理消息
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});