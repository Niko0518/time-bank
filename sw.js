// sw.js - v3.15.2 Compatible Version

// [v3.15.2] 升级缓存名称以触发 PWA 更新并重新缓存 index.html
const CACHE_NAME = 'timebank-v3.15.2'; 
const urlsToCache = [
  '/time-bank/',
  '/time-bank/index.html',
  '/time-bank/manifest.json',
  '/time-bank/icon-192.png',
  '/time-bank/icon-512.png'
];

// 1. 安装 Service Worker 并缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
});

// 2. 激活 Service Worker 并清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Claim clients immediately after cleaning cache
  );
});

// 3. 拦截网络请求，实现缓存优先策略 (Cache First)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Optional: Cache the new resource if needed, but be careful
            // Caching everything might lead to large cache sizes
            // Consider only caching specific file types or paths if necessary
            /*
            if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            */
            return networkResponse;
          }
        ).catch(error => {
          // Network request failed, handle error (e.g., show offline page)
          console.error('Service Worker: Fetch failed:', error);
          // Optional: Return a custom offline response
          // return new Response('<h1>You are offline</h1>', { headers: { 'Content-Type': 'text/html' }});
        });
      })
  );
});

// 4. 处理通知点击事件 (v3.13.2 引入, v3.15.2 保持不变)
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked.');

  // 关闭被点击的通知
  event.notification.close();

  // 查找并聚焦到已打开的应用窗口，如果没有则打开一个新窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Check if there's a window/tab already open with the target URL
      const targetUrl = new URL('/time-bank/', self.location.origin).href;
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window found, open a new one
      if (clients.openWindow) {
        // Ensure this path matches your GitHub Pages project path
        return clients.openWindow('/time-bank/');
      }
    })
  );
});