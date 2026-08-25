const CACHE_NAME = 'hydroinspect-v4';

// Use relative paths so it works on GitHub Pages subpath
const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/calculations.js',
  './js/forms.js',
  './js/reports.js',
  './js/analytics.js',
  './js/sheets.js',
  './js/relay489.js',
  './js/firebase-sync.js',
  './js/app.js',
  './icons/icon.svg',
  './manifest.json',
];

// CDN resources to cache — includes Firebase SDKs so auth/sync still load offline
// once the app has been opened at least once online.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
];

// Cache one asset, swallowing individual failures so a single broken CDN
// doesn't nuke the whole SW install.
function _cacheOne(cache, url) {
  return fetch(url, { cache: 'no-cache' })
    .then(res => {
      if (res && res.ok) return cache.put(url, res);
      console.warn('[sw] skip caching (bad response):', url, res && res.status);
    })
    .catch(err => console.warn('[sw] skip caching (fetch failed):', url, err && err.message));
}

// Install - cache all assets with per-asset error tolerance
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all([
      ...LOCAL_ASSETS.map(url => _cacheOne(cache, url)),
      ...CDN_ASSETS.map(url => _cacheOne(cache, url)),
    ]))
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok && (event.request.url.startsWith(self.location.origin) || CDN_ASSETS.includes(event.request.url))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
