const CACHE_NAME = 'hydroinspect-v5';
const APP_VERSION = '2.1.0';

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

// Let the page ask which build is running, and let it skip the waiting phase
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION, cache: CACHE_NAME });
  }
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Put a fresh copy in the cache, ignoring failures (offline, bad response)
function _store(request, response) {
  if (!response || !response.ok) return response;
  const clone = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
  return response;
}

// Network first, falling back to cache. Used for our own HTML/JS/CSS so a deploy
// actually reaches the app; the timeout keeps a flaky link from stalling the load.
function _networkFirst(request, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };

    const timer = setTimeout(() => {
      caches.match(request).then(cached => { if (cached) done(cached); });
    }, timeoutMs);

    fetch(request)
      .then(response => { clearTimeout(timer); done(_store(request, response)); })
      .catch(() => {
        clearTimeout(timer);
        caches.match(request).then(cached => {
          if (cached) return done(cached);
          if (request.mode === 'navigate') {
            return caches.match('./index.html').then(html => done(html || Response.error()));
          }
          done(Response.error());
        });
      });
  });
}

// Cache first. Used for the versioned CDN libraries, whose URLs never change content.
function _cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => _store(request, response));
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('googleapis.com')) return;
  if (event.request.url.includes('gstatic.com/firebasejs')) {
    return event.respondWith(_cacheFirst(event.request));
  }

  if (event.request.url.startsWith(self.location.origin)) {
    // Our own files change on every deploy, so always look for a newer copy first
    event.respondWith(_networkFirst(event.request, 3000));
    return;
  }

  if (CDN_ASSETS.includes(event.request.url)) {
    event.respondWith(_cacheFirst(event.request));
  }
});
