const CACHE_NAME = 'eml-post-v1.1.0';
const APP_SHELL = [
  './', './index.html', './app.js', './manifest.json', './icon.svg',
  './vendor/address-parser.js', './vendor/base64-decoder.js', './vendor/base64-encoder.js',
  './vendor/chunk-writer.js', './vendor/decode-strings.js', './vendor/errors.js',
  './vendor/html-entities.js', './vendor/mime-node.js', './vendor/pass-through-decoder.js',
  './vendor/postal-mime.js', './vendor/qp-decoder.js', './vendor/text-format.js', './vendor/types.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
