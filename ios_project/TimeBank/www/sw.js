// Time Bank Service Worker - v7.33.5
// [v7.9.6] 改为"网络优先"策略，解决数据无法更新的问题
const CACHE_NAME = 'timebank-cache-v7.33.5';
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
            return cache.addAll(ASSETS);
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

    event.respondWith(
        fetch(request)
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