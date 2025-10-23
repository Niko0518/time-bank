const CACHE_NAME = 'timebank-v3.13.0';
const urlsToCache = [
  '/time-bank/',
  '/time-bank/index.html',
  '/time-bank/manifest.json',
  '/time-bank/icon-192.png',
  '/time-bank/icon-512.png'
];

// 安装 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存文件');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截请求
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 缓存优先
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
```

保存文件。

---

## 📝 **现在桌面上应该有这些文件：**
```
✅ icon-192.png
✅ icon-512.png
✅ manifest.json
✅ sw.js