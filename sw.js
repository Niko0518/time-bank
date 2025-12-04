// sw.js - Time Bank v4.6.2
// [Update] 强制更新缓存名称，确保用户获取最新的悬浮窗修复代码
const CACHE_NAME = 'timebank-v4.6.2'; 

// 核心文件列表
const urlsToCache = [
  './',             // 根路径
  'index.html',     // 核心逻辑
  'manifest.json',  // PWA 配置
  'icon-192.png',   // 图标
  'icon-512.png'
];

// 1. 安装事件：缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell (v4.7.0)');
        return cache.addAll(urlsToCache);
      })
  );
  // 跳过等待，立即激活新 SW
  self.skipWaiting();
});

// 2. 激活事件：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 立即接管所有页面
  return self.clients.claim();
});

// 3. 请求拦截：缓存优先策略 (Cache First)
// 这样可以保证离线可用，且通过版本号更新强制刷新
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// 4. 通知的点击处理 (保持不变)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[clientList.length - 1].focus();
      }
      return clients.openWindow('./');
    })
  );
});