// Service Worker: Handles offline caching and PWA functionality
const CACHE_NAME = 'cycling-dashcam-v1.17.30';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json?v=59',
];

// Install Event: Cache essential assets for offline use
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches when a new version is installed
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete ALL caches that are not the current one
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Force immediate control of all clients
  return self.clients.claim();
});

// Fetch Event: Serve assets from cache first, then network (Offline Support)
self.addEventListener('fetch', (event) => {
  // Don't cache the service worker itself
  if (event.request.url.includes('sw.js')) {
    return;
  }
  
  // Network-first for index.html to ensure we always get the latest version
  if (event.request.mode === 'navigate' || event.request.url.endsWith('index.html') || event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
