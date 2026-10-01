// Offline support: cache the app shell, serve cache first, refresh in the background.
const CACHE = 'gim-v1.1.1'; // = 'gim-v' + VERSION in js/version.js
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'js/ui.js', 'js/data.js', 'js/analytics.js', 'js/charts.js', 'js/version.js', 'js/config.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});










