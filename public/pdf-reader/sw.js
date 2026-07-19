// PDF Reader Service Worker — オフライン対応（アプリシェル + pdf.js CDN をキャッシュ）
const CACHE_NAME = 'pdfreader-v0.2.0';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // HTML本体はネットワーク優先（更新をすぐ反映）、それ以外はキャッシュ優先
  const isNavigation = e.request.mode === 'navigate';
  if (isNavigation) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return cached || fetch(e.request).then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, copy); });
          return res;
        });
      })
    );
  }
});
