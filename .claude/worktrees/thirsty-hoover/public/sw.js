// Sift Service Worker — minimal for PWA installability + share target
const CACHE_NAME = 'sift-v1';

// Install: cache shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful same-origin navigations and static assets
        if (response.ok && event.request.url.startsWith(self.location.origin)) {
          const url = new URL(event.request.url);
          if (
            url.pathname.startsWith('/_next/static/') ||
            url.pathname.startsWith('/icons/')
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
