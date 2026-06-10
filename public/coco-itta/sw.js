// COCO-ITTA Service Worker
// アプリ本体はネットワーク優先（常に最新版を表示、オフライン時のみキャッシュ）
// CDNライブラリ・共有写真はキャッシュ優先＋裏で更新（stale-while-revalidate）
// Firebase Auth ヘルパー(/__/auth/*, /__/firebase/*) は触らない（認証フローを壊さないため）
const CACHE = 'coco-itta-v2'; // v2: /__/* 除外＋auth関連の旧キャッシュ一掃
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

  // Firebase Auth / Hosting reserved namespace: 一切触らない
  // /__/auth/handler, /__/auth/iframe.js, /__/firebase/init.json など
  if (url.pathname.startsWith('/__/')) return;

  if (url.origin === location.origin) {
    // アプリ本体: ネットワーク優先（成功時のみキャッシュ更新）
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  } else if (CDN_HOSTS.includes(url.hostname)) {
    // CDN・写真: キャッシュ優先＋裏で更新
    e.respondWith(
      caches.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
  // その他（Firestore / Auth ドメイン / 地図タイル等）はブラウザ標準処理に任せる
});
