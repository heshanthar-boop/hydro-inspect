const CACHE_NAME = 'hydroinspect-v2';

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
  './js/app.js',
  './icons/icon.svg',
  './manifest.json',
];

// CDN resources to cache
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
];

// Install - cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache local assets
      cache.addAll(LOCAL_ASSETS).catch(() => {});
      // Cache CDN assets separately
      CDN_ASSETS.forEach(url => {
        fetch(url).then(response => {
          if (response.ok) cache.put(url, response);
        }).catch(() => {});
      });
    })
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
