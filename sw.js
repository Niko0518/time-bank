const CACHE_NAME = 'time-bank-v4.10.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png'
    // 注意：如果有 icon-512.png 或其他静态资源，请在此添加
];

// 1. 安装事件：缓存核心文件
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing version:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // 强制立即激活，跳过等待
    self.skipWaiting();
});

// 2. 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activated');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    // 立即接管所有页面
    return self.clients.claim();
});

// 3. 请求拦截：网络优先，失败则读取缓存 (Network First, falling back to Cache)
// 这种策略适合数据经常变动的应用
self.addEventListener('fetch', (event) => {
    // 忽略非 GET 请求或非本域请求
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 如果网络请求成功，克隆一份存入缓存（保持缓存最新）
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // 如果网络失败（离线），尝试从缓存读取
                console.log('[Service Worker] Network failed, serving offline cache');
                return caches.match(event.request);
            })
    );
});

// 4. 通知的点击事件处理
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 如果已有窗口打开，则聚焦
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // 否则打开新窗口 (修正为相对路径，适配 GitHub Pages)
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});