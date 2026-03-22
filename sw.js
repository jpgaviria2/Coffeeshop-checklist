const CACHE_VERSION = 'v20';
const CACHE_NAME = `trails-coffee-${CACHE_VERSION}`;
const FILES = ['/', '/index.html', '/app.js', '/nostr.bundle.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
));
