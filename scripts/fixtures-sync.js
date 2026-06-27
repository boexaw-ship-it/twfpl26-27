const admin = require("firebase-admin");
const axios = require("axios");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Error: FIREBASE_SERVICE_ACCOUNT Environment Variable မတွေ့ရှိပါဗျာ။");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// === FPL API URLs ===
const FPL_BASE = "https://fantasy.premierleague.com/api";
const FIXTURES_URL = `${FPL_BASE}/fixtures/`;
const BOOTSTRAP_URL = `${FPL_BASE}/bootstrap-static/`;

// === Helper: FPL API Fetch Tool ===
async function fplFetch(url) {
  try {
    const res = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 TW-Fantasy-Sync/1.0" }
    });
    return res.data;
  } catch (err) {
    console.error(`⚠️ Fetch Failed: ${url} - ${err.message}`);
    throw err;
  }
}

// 💡 🏆 FIXED TEAM NAME MAPPER ENGINE
// Official API က လာမည့် အသင်းအတိုကောက် (short_name) များကို အန်ကယ့်ရဲ့ ၂၀၂၆-၂၇ Jersey ID (၁ မှ ၂၀) အစီအစဉ်အတိုင်း ကွက်တိ ပြန်ဆိုပေးခြင်း
const officialTeamTranslateMap = {
  "ars": 1,  // Arsenal
  "avl": 2,  // Aston Villa
  "bou": 3,  // AFC Bournemouth
  "bre": 4,  // Brentford
  "bha": 5,  // Brighton & Hove Albion
  "che": 6,  // Chelsea
  "cov": 7,  // Coventry City
  "cry": 8,  // Crystal Palace
  "eve": 9,  // Everton
  "ful": 10, // Fulham
  "hul": 11, // Hull City
  "ips": 12, // Ipswich Town
  "lee": 13, // Leeds United
  "liv": 14, // Liverpool
  "mci": 15, // Manchester City
  "mun": 16, // Manchester United
  "new": 17, // Newcastle United
  "nfo": 18, // Nottingham Forest
  "sun": 19, // Sunderland
  "tot": 20  // Tottenham Hotspur
};

async function syncOfficialFplApiToFirebase() {
  try {
    console.log("📥 Fetching bootstrap data for player mapping...");
    const bootstrap = await fplFetch(BOOTSTRAP_URL);

    // FPL API ကပေးသော Player ID (element) တစ်ခုချင်းစီ၏ Web Name (ကစားသမားအမည်အစစ်) အား Map ဆောက်ခြင်း
    const playerWebNameMap = {};
    bootstrap.elements.forEach(el => {
      playerWebNameMap[el.id] = el.web_name;
    });

    // FPL API ကပေးသော Team ID တစ်ခုချင်းစီအား အတိုကောက်စာသား (ars, mun) အဖြစ် Map ဆောက်ခြင်း
    const teamShortNameMap = {};
    bootstrap.teams.forEach(t => {
      teamShortNameMap[t.id] = t.short_name.toLowerCase();
    });

    console.log("📡 Fetching live fixtures from Official FPL Server...");
    const apiFixtures = await fplFetch(FIXTURES_URL);

    console.log(`📦 API မှ ပွဲစဉ်အရေအတွက် (${apiFixtures.length}) ခု ရရှိပါသည်။`);
    console.log("🔥 Firebase Firestore ရှိ ပွဲစဉ်ဟောင်းများပေါ်သို့ Live ဒေတာများ စတင် Overwrite ပေါင်းစပ်နေပါပြီ...");

    let batch = db.batch();
    let count = 0;

    apiFixtures.forEach((apiMatch) => {
      const idStr = String(apiMatch.id);
      const fixtureDocRef = db.collection("fixtures").doc(idStr);

      // 💡 ⚽ Stats Array ပြုပြင်ခြင်း Logic: API ထံမှ လာမည့် Player ID (element) နေရာတွင် 
      // UI ဘက်၌ တိုက်ရိုက်အလွယ်တကူ ကစားသမားနာမည် ဖတ်ပြနိုင်ရန် 'element_name' field အား ကြားညှပ်ထည့်ပေးခြင်း
      const formattedStats = (apiMatch.stats || []).map(statType => {
        return {
          identifier: statType.identifier, // goals_scored, assists, yellow_cards, red_cards
          h: (statType.h || []).map(p => ({ element: p.element, value: p.value, element_name: playerWebNameMap[p.element] || "Player" })),
          a: (statType.a || []).map(p => ({ element: p.element, value: p.value, element_name: playerWebNameMap[p.element] || "Player" }))
        };
      });

      // 🎯 API က ဒေတာမတူဘဲ လာခဲ့လျှင်ပင် ပင်မ Matrix အချိန်များ မပျက်စီးစေရန် သီးသန့်စိစစ်၍ Update လုပ်ခြင်း
      const liveUpdateData = {
        started: apiMatch.started,         // Live ကန်နေပြီလား
        finished: apiMatch.finished,       // ပွဲပြီးသွားပြီလား
        minutes: Number(apiMatch.minutes), // လက်ရှိပွဲချိန် မိနစ်
        team_h_score: apiMatch.team_h_score !== undefined ? apiMatch.team_h_score : null, // အိမ်ကွင်းဂိုး
        team_a_score: apiMatch.team_a_score !== undefined ? apiMatch.team_a_score : null, // အဝေးကွင်းဂိုး
        stats: formattedStats,             // ⚽ ဂိုးသွင်းသူ နာမည်များပါဝင်သော Stats Array
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      };

      // { merge: true } စနစ်ကြောင့် ကျွန်တော်တို့ ကြိုတင် Manual သွင်းထားသော ပွဲစဉ်များထဲက 
      // နေ့ရက်၊ အချိန်နှင့် ဂျာစီ ID များကို လုံးဝမထိခိုက်ဘဲ Live ရလဒ်များသာ ကွက်တိ သွားရောက်ပေါင်းစပ်ပါမည်
      batch.set(fixtureDocRef, liveUpdateData, { merge: true });
      count++;

      if (count % 400 === 0) {
        batch.commit();
        batch = db.batch();
      }
    });

    if (count % 400 !== 0) {
      await batch.commit();
    }

    console.log(`🚀 [API SYNC SUCCESS] ပြီးပြည့်စုံပါပြီ အန်ကယ်ဗျာ! API မှ Live ရမှတ်များနှင့် ကစားသမားနာမည်ပါဝင်သော Stats စာရင်းအားလုံး Firebase ပေါ်သို့ အောင်မြင်စွာ Overwrite Merge ပြီးစီးပါပြီ။`);
    process.exit(0);

  } catch (error) {
    console.error("❌ FPL Official API ချိတ်ဆက်မှု ကျရှုံးပါသည် (ရာသီမစသေး၍ API ပိတ်ထားနိုင်ပါသည်):", error.message);
    process.exit(1);
  }
}

syncOfficialFplApiToFirebase();
