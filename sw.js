const CACHE_NAME = 'twfpl-safe-v1';

// 🛠️ မူရင်း Assets စာရင်းအား အန်ကယ့် Repo (twfpl26-27) လမ်းကြောင်းအတိုင်း အတိအကျ ထိန်းသိမ်းထားပါသည်
// 💡 PWA လမ်းကြောင်းလွဲတတ်သဖြင့် '/' (Root Cache) အစား 'index.html' ကိုသာ အဓိက ထားထားပါသည်
const ASSETS = [
  '/twfpl26-27/index.html',
  '/twfpl26-27/public/manifest.json',
  '/twfpl26-27/public/icons/icon-192x192.png',
  '/twfpl26-27/public/icons/icon-512x512.png'
];

// Install Event
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // ဖိုင်တစ်ခုခု Error တက်လျှင်လည်း တစ်ခုလုံး Fail မဖြစ်စေရန် စိတ်ချရသော Promise.all ဖြင့် သိမ်းဆည်းခြင်း
      return Promise.all(
        ASSETS.map(url => {
          return cache.add(url).catch(err => console.log('PWA Asset cache skip:', url));
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (🛑 Firebase Limit မစားရန်နှင့် Loop အပြီးတိုင် ကာကွယ်ရန် တည့်မတ်ထားသော စနစ်)
self.addEventListener('fetch', e => {
  
  // 💡 [CRITICAL CACHE LOCK] Firebase, Firestore သို့မဟုတ် Google Auth နှင့် ပတ်သက်သော API တောင်းဆိုမှုများ ဖြစ်ပါက
  // ကြားဖြတ်မဖမ်းဘဲ Network (Server) ဆီ တိုက်ရိုက် လွှတ်ပေးလိုက်ခြင်းဖြင့် Loop ပတ်ခြင်းမှ ရာနှုန်းပြည့် ကာကွယ်ပါသည်
  if (
    e.request.url.includes('firebase') || 
    e.request.url.includes('firestore') || 
    e.request.url.includes('google')
  ) {
    return; // Service Worker ကို ဒီနေရာတင် ချက်ချင်း ရပ်တန့်ပြီး Cache မလုပ်စေရန် Bypass လုပ်လိုက်ပါသည်
  }
  
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // 🛠️ မူရင်းကုဒ်မှ စာလုံးပေါင်းအမှား (cachedResult) ကို (cachedResponse) အဖြစ် အမှန်ကန်ဆုံး ပြင်ဆင်ထားပါသည်
      return cachedResponse || fetch(e.request);
    }).catch(() => {
      return fetch(e.request);
    })
  );
});
