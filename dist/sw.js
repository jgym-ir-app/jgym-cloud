const CACHE_NAME = 'j-gym-pwa-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  '/icon.jpg'
];

// Install Service Worker and cache core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and core assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate Service Worker and clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch listener - Stale-While-Revalidate for local assets, network-first for APIs
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests or API requests (always let API requests go to network)
  if (event.request.method !== 'GET' || requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Handle caching strategy: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            // Save the fresh response to cache if it's a valid local request
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback
            return cachedResponse;
          });

        // Return cached response immediately if available, else wait for the network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
