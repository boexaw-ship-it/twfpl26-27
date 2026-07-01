const CACHE_NAME = 'twfpl-safe-v5';

// 🛠️ [DOMAIN-AGNOSTIC ROUTING] နေရာမရွေး အလုပ်လုပ်ရန် လမ်းကြောင်းများကို တည့်မတ်ခြင်း
// ရှေ့က /twfpl26-27/ ကို ဖြုတ်ပြီး Relative Path အဖြစ် ပြောင်းလဲလိုက်သဖြင့် Vercel တွင်ရော GitHub တွင်ပါ အမှားကင်းစင်သွားပါပြီ
const ASSETS = [
  'index.html',
  'public/manifest.json',
  'public/icons/icon-192x192.png',
  'public/icons/icon-512x512.png'
];

// Install Event - Cache application shell assets securely
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Caching App Shell Assets');
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

  // 🚨 CRITICAL BYPASS: Firebase / Navigation Requests များကို ကြားဖြတ်မဖမ်းဘဲ တိုက်ရိုက် လွှတ်ပေးခြင်း
  // Navigation (page-to-page link, back/forward button, logout redirect) တွေကို SW မဖမ်းအောင် ကာကွယ်ထားခြင်းဖြင့်
  // ERR_FAILED / bfcache conflict ပြသနာများကို ရှောင်ရှားနိုင်ပါသည်
  if (
    requestUrl.includes('firebase') || 
    requestUrl.includes('firestore') || 
    requestUrl.includes('google') ||
    e.request.mode === 'navigate' ||
    e.request.method !== 'GET'
  ) {
    return; // Live Network ဆီ တိုက်ရိုက် လွှတ်ပေးလိုက်ပါသည်
  }

  e.respondWith(
    caches.match(e.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(e.request).then(networkResponse => {
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
        return fetch(e.request);
      })
  );
});
