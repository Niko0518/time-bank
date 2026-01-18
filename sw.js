// Time Bank Service Worker - v7.3.1
const CACHE_NAME = 'timebank-cache-v7.3.1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './sw.js',
    './icon-192.png',
    './icon-512.png'
];
const OFFLINE_FALLBACK = './index.html';

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // 对导航请求使用网络优先并回退到离线首页
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // 缓存成功的导航响应
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

    // 其他 GET 请求：缓存优先，后台更新
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request)
                .then(response => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
