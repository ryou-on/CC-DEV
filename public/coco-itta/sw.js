// COCO-ITTA Service Worker
// アプリ本体はネットワーク優先（常に最新版を表示、オフライン時のみキャッシュ）
// CDNライブラリ・共有写真はキャッシュ優先＋裏で更新（stale-while-revalidate）
const CACHE = 'coco-itta-v1';
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'firebasestorage.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // アプリ本体: ネットワーク優先
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  } else if (CDN_HOSTS.includes(url.hostname)) {
    // CDN・写真: キャッシュ優先＋裏で更新
    e.respondWith(
      caches.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
  // その他（Firestore / Auth / 地図タイル等）はブラウザ標準処理に任せる
});
