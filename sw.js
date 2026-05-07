const CACHE_NAME = "trap-cat-v1.0.3";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.json",
  "./assets/trap-the-cat-logo.png",
  "./assets/bgm.mp3",
  "./assets/block.mp3",
  "./assets/jump.mp3",
  "./assets/lose.mp3",
  "./assets/win.mp3"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Caching new assets");
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.error("Service Worker: Failed to cache assets during install:", err);
      });
    })
  );
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // This event fires when the new service worker becomes active.
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all open clients.
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});