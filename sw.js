// Offline support. Network-first: when online you always get the newest files; when offline the cached copy is used.
const CACHE = 'gim-v1.4.9'; // = 'gim-v' + VERSION in js/version.js
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'js/ui.js', 'js/data.js', 'js/analytics.js', 'js/charts.js', 'js/version.js', 'js/config.js',
  'js/gym-library.js', 'js/muscle-focus.js', 'js/drive-schedule.js', 'js/icons.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'images/home-hero.jpg', 'images/chest.jpg', 'images/back.jpg', 'images/shoulder.jpg', 'images/arms.jpg', 'images/legs.jpg', 'images/core.jpg', 'images/cardio.jpg', 'images/mix.jpg'];

self.addEventListener('install', (e) => {
  // add files one by one so a single missing file can never block the update
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))),
  );
});
