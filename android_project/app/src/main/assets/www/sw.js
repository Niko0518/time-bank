// Time Bank Service Worker - v7.20.2
// [v7.9.6] 改为“网络优先”策略，解决数据无法更新的问题
const CACHE_NAME = 'timebank-cache-v7.20.2';
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
    /tcb-api\.tencentcloudapi\.com/,
    /cloud\.tencent/,
    /cloudbase/,
    /\.tcb\./,
    /api\./,
    /socket/,
    /wss?:/
];

self.addEventListener('install', event => {
    console.log('[SW] Installing v7.9.6...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting()) // 强制激活新版本
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activating v7.9.6...');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME && k.startsWith('timebank-cache'))
                    .map(k => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim()) // 立即控制所有页面
    );
});

self.addEventListener('fetch', event => {
    const url = event.request.url;
    
    // 跳过非GET请求
    if (event.request.method !== 'GET') return;
    
    // 跳过API请求和WebSocket（不缓存）
    if (SKIP_CACHE_PATTERNS.some(pattern => pattern.test(url))) {
        return; // 让浏览器正常处理
    }

    // 导航请求：网络优先，失败时回退到离线页面
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(OFFLINE_FALLBACK))
        );
        return;
    }

    // [v7.9.6] 其他GET请求：网络优先，网络失败时回退到缓存
    // 这确保用户始终获取最新数据，只在离线时使用缓存
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // 网络请求成功，更新缓存
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // 网络失败，尝试从缓存获取
                return caches.match(event.request);
            })
    );
});

// 监听消息，支持手动更新
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data === 'clearCache') {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }
});
