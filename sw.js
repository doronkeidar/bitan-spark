// Network-first for the app shell (updates reach reps immediately), cache as offline fallback.
// Bump CACHE when shipping a new version.
const CACHE = 'bs-field-202609251552';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/mock.js', 'js/app.js', 'js/admin.js',
  'assets/logo.svg', 'assets/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API calls & fonts go straight to network
  // cache:'no-cache' revalidates with the server every time (GitHub Pages sends max-age=600, which would
  // otherwise keep a phone on the previous version for up to 10 minutes).
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
