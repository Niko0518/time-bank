// sw.js - v4.6.0 Compatible Version

// [v4.6.0] 更新缓存名称 (Feat: 配合悬浮窗功能，强制 Service Worker 重新缓存核心文件)
const CACHE_NAME = 'timebank-v4.6.0'; 

// 核心文件列表：确保所有 PWA 所需文件都在此，特别是 index.html 和 manifest
const urlsToCache = [
  './', // 应用的根路径
  'index.html',
  'manifest.json', 
  'icon-192.png',
  'icon-512.png'
  // 注意：CSS 和 JS 库如果不是本地托管，则不会被 Service Worker 缓存
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
  // 接管所有客户端的控制权
  return self.clients.claim();
});

// 3. 拦截网络请求，实现缓存优先策略
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 缓存优先，如果缓存中没有，则从网络获取
        return response || fetch(event.request);
      })
  );
});

// 4. 处理通知点击事件
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked.');
  
  // 关闭被点击的通知
  event.notification.close();

  // 查找并聚焦到已打开的应用窗口，如果没有则打开一个新窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 如果有已打开的窗口，聚焦到最后一个
      if (clientList.length > 0) {
        return clientList[clientList.length - 1].focus();
      }
      
      // 否则，打开一个新的窗口到应用的起始 URL
      return clients.openWindow(self.registration.scope);
    })
  );
});