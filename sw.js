// sw.js - v4.8.1
// [v4.8.1] 更新缓存名称，强制刷新以应用 UI 重构和深色模式适配
const CACHE_NAME = 'timebank-v4.8.1'; 

// 核心文件列表
const urlsToCache = [
  './', 
  'index.html',
  'manifest.json', 
  'icon-192.png',
  'icon-512.png'
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
  self.skipWaiting(); // 跳过等待，立即激活
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
  return self.clients.claim(); // 立即接管控制权
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

// 4. 处理通知点击事件
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[clientList.length - 1].focus();
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});