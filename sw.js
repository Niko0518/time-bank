// sw.js - v4.0.1 Compatible Version

// [v4.0.1] 升级缓存名称以触发 PWA 更新 (功能: 修复 v4.0.0 启动 Bug)
const CACHE_NAME = 'timebank-v4.0.1'; 
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

// 4. 处理通知点击事件
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked.');
  
  // 关闭被点击的通知
  event.notification.close();

  // 查找并聚焦到已打开的应用窗口，如果没有则打开一个新窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {