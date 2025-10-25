// sw.js - v3.15.1 Compatible Version

// [v3.15.1] 升级缓存名称以触发 PWA 更新并重新缓存 index.html
const CACHE_NAME = 'timebank-v3.15.1'; 
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
  self.skipWaiting();
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
    })
  );
  return self.clients.claim();
});

// 3. 拦截网络请求，实现缓存优先策略
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// 4. 处理通知点击事件 (v3.13.2 引入, v3.15.1 保持不变)
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked.');
  
  // 关闭被点击的通知
  event.notification.close();

  // 查找并聚焦到已打开的应用窗口，如果没有则打开一个新窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 如果有已打开的窗口，聚焦到最后一个
      if (clientList.length > 0) {
        let client = clientList[clientList.length - 1];
        if (client && 'focus' in client) {
          return client.focus();
        }
      }
      // 如果没有窗口，则打开一个新的
      if (clients.openWindow) {
        // 确保这个路径与你的 GitHub Pages 项目路径一致
        return clients.openWindow('/time-bank/');
      }
    })
  );
});