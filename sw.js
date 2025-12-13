// sw.js - v4.9.8
// [v4.9. 0] 更新缓存名称，应用同步死锁修复和智能状态融合逻辑
const CACHE_NAME = 'timebank-v4.9.0'; 

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