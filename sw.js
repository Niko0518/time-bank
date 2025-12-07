// sw.js - v4.8.3
// [v4.8.3] 更新缓存名称，强制刷新以应用布局间距修复和文案优化
const CACHE_NAME = 'timebank-v4.8.3'; 

// 核心文件列表
const urlsToCache = [
  './', 
  'index.html',
  'manifest.json', 
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(name => {
        if (name !== CACHE_NAME) return caches.delete(name);
      })
    ))
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[clientList.length - 1].focus();
      return clients.openWindow(self.registration.scope);
    })
  );
});