const CACHE_VERSION = 'v3.2.3';
const CACHE_NAME = `trails-coffee-${CACHE_VERSION}`;
const BASE_PATH = '/Coffeeshop-checklist';

// Files to cache
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/event-cache.js`,
  `${BASE_PATH}/nav.js`,
  `${BASE_PATH}/procedures.html`,
  `${BASE_PATH}/status.html`,
  `${BASE_PATH}/status.js`,
  `${BASE_PATH}/storage.html`,
  `${BASE_PATH}/dashboard.html`,
  `${BASE_PATH}/dashboard.js`,
  `${BASE_PATH}/prep.html`,
  `${BASE_PATH}/prep.js`,
  `${BASE_PATH}/detail.html`,
  `${BASE_PATH}/detail.js`,
  `${BASE_PATH}/reports.html`,
  `${BASE_PATH}/reports.js`,
  `${BASE_PATH}/waste.html`,
  `${BASE_PATH}/waste.js`,
  // Procedure pages
  `${BASE_PATH}/procedure-baking.html`,
  `${BASE_PATH}/procedure-cinnamon-buns.html`,
  `${BASE_PATH}/procedure-drink-recipes.html`,
  `${BASE_PATH}/procedure-drip-coffee.html`,
  `${BASE_PATH}/procedure-espresso.html`,
  `${BASE_PATH}/procedure-grinder.html`,
  `${BASE_PATH}/procedure-kds-printer.html`,
  `${BASE_PATH}/espresso-standard.html`,
  `${BASE_PATH}/plates-standard.html`,
  `${BASE_PATH}/check-jp.html`,
  // Images
  `${BASE_PATH}/espresso-station-clean.jpg`,
  `${BASE_PATH}/plates-organized.jpg`,
  `${BASE_PATH}/nostr-avatar.png`,
  // Icons
  `${BASE_PATH}/icon-192x192.png`,
  `${BASE_PATH}/icon-512x512.png`,
  // Manifest
  `${BASE_PATH}/manifest.json`
];

// Install event - cache all files
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching all files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first strategy for HTML pages (to get updates)
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response and update cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(request);
        })
    );
    return;
  }

  // Cache-first strategy for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // If not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone and cache the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });

            return response;
          })
          .catch(() => {
            // Return offline page or placeholder if needed
            console.log('[Service Worker] Fetch failed for:', request.url);
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
