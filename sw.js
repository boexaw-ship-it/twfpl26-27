const CACHE_NAME = 'twfpl-safe-v2';

// Clean assets list targeting explicitly scoped project files
const ASSETS = [
  '/twfpl26-27/index.html',
  '/twfpl26-27/public/manifest.json',
  '/twfpl26-27/public/icons/icon-192x192.png',
  '/twfpl26-27/public/icons/icon-512x512.png'
];

// Install Event - Cache application shell assets securely
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Caching App Shell Assets');
      // Safely catch individual asset failures so one missing asset doesn't break the entire install step
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`SW: Failed to cache core asset: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up deprecated legacy caches immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('SW: Removing Outdated Cache Pool:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle resource requests with robust route bypassing & error handling
self.addEventListener('fetch', e => {
  const requestUrl = e.request.url;

  // 🚨 CRITICAL BYPASS: Do NOT intercept or cache dynamic Firebase/Google backend API traffic.
  // This blocks infinitely compounding request loops that rapidly drain your Firebase Quota Limits.
  if (
    requestUrl.includes('firebase') || 
    requestUrl.includes('firestore') || 
    requestUrl.includes('google') ||
    e.request.method !== 'GET' // Only cache standard GET requests
  ) {
    return; // Pass control straight through to the real live network connection
  }

  e.respondWith(
    caches.match(e.request)
      .then(cachedResponse => {
        // Fixes the 'cachedResult is not defined' crash bug. 
        // Falls back seamlessly to a clean network fetch if the resource is uncached.
        return cachedResponse || fetch(e.request).then(networkResponse => {
          // Optional: Dynamically cache static non-firebase assets as they are requested
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
      .catch(err => {
        console.error('SW: Fetch intercepted an unhandled routing error:', err);
        // Fallback execution to live server network if the cache parsing pipeline errors out
        return fetch(e.request);
      })
  );
});
