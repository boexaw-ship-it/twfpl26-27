const CACHE_NAME = 'twfpl-master-v1';

// 🌟 🏆 GITHUB PAGES ရော VERCEL မှာပါ လမ်းကြောင်းမမှားစေရန် Dynamic ပတ်လမ်းဆောက်ခြင်း
const ASSETS = [
  './',
  './index.html',
  './public/manifest.json',
  './public/icons/icon-192x192.png',
  './public/icons/icon-512x512.png'
];

// Install Event — ဖိုင်များကို မှတ်ဉာဏ်ထဲ သိမ်းဆည်းခြင်း
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // ⚠️ ဖိုင်တစ်ခုခုမတွေ့ပါက တစ်ခုလုံး Crash မဖြစ်စေရန် map ဖြင့် အန္တရာယ်ကင်းစွာ သိမ်းဆည်းခြင်း
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => console.log('Asset cache skip:', url));
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — Cache အဟောင်းများကို အလိုအလျောက် ရှင်းလင်းခြင်း
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — အင်တာနက် စာမျက်နှာများကို ကြားဖြတ်မောင်းနှင်ပေးခြင်း
self.addEventListener('fetch', (e) => {
  // Real-time Firebase နှင့် Google APIs ဒေတာများကို Cache ဝင်မရှုပ်စေရန် ကျော်လွှတ်ခြင်း
  if (e.request.url.includes('firebase') || e.request.url.includes('firestore') || e.request.url.includes('google')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // 💡 🎯 မူရင်းကုဒ်မှ cachedResult (Variable မှားယွင်းမှု) ကို cachedResponse အဖြစ် အမှန်ပြင်ဆင်ပြီးစီးခြင်း
      return cachedResponse || fetch(e.request);
    }).catch(() => {
      return fetch(e.request);
    })
  );
});
