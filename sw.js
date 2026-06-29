const CACHE_NAME = 'twfpl-v1';
const ASSETS = [
  '/',
  '/twfpl26-27/index.html',
  '/twfpl26-27/public/manifest.json',
  '/twfpl26-27/public/icons/icon-192x192.png',
  '/twfpl26-27/public/icons/icon-512x512.png'
];

// Install Event
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Event
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Fetch Event (အလုပ်လုပ်စေရန် ကြားဖြတ်နားထောင်ပေးခြင်း)
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      return cachedResult || fetch(e.request);
    }).catch(() => fetch(e.request))
  );
});
