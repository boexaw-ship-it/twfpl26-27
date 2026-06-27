const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

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

// 💡 🏆 ✅ ၂၀၂၆-၂၇ TEAM ID MAP: အန်ကယ့်ရဲ့ ဂျာစီဖိုင်အမည် (၁ မှ ၂၀ အစီအစဉ်) အတိုင်း ကွက်တိ ပြင်ဆင်ပြီးစီးမှု
const teamIdMap = {
  "Arsenal": 1,
  "Aston Villa": 2,
  "AFC Bournemouth": 3, "Bournemouth": 3,
  "Brentford": 4,
  "Brighton & Hove Albion": 5, "Brighton and Hove Albion": 5,
  "Chelsea": 6,
  "Coventry City": 7,
  "Crystal Palace": 8,
  "Everton": 9,
  "Fulham": 10,
  "Hull City": 11,
  "Ipswich Town": 12,
  "Leeds United": 13,
  "Liverpool": 14,
  "Manchester City": 15,
  "Manchester United": 16,
  "Newcastle United": 17,
  "Nottingham Forest": 18,
  "Sunderland": 19,
  "Tottenham Hotspur": 20
};

async function buildLocalFixturesReady() {
  try {
    const jsonPath = path.join(__dirname, "FI.json");
    if (!fs.existsSync(jsonPath)) {
      throw new Error("scripts/ folder ထဲတွင် FI.json ဖိုင်အား ရှာမတွေ့ပါဗျာ။ အရင်ထည့်ပေးပါဦး။");
    }

    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const teamFixtures = JSON.parse(rawData);

    console.log("📦 FI.json မှ ၂၀၂၆-၂၇ ပွဲစဉ်များကို အန်ကယ့် Jersey ID အသစ်များဖြင့် စုစည်းနေပါသည်...");

    let allUniqueMatches = new Map();

    for (const teamName in teamFixtures) {
      const matches = teamFixtures[teamName];
      
      matches.forEach(m => {
        const homeId = teamIdMap[m.home_team];
        const awayId = teamIdMap[m.away_team];
        
        if (!homeId || !awayId) return;

        // မြန်မာစံတော်ချိန် (MMT) မှ UTC သို့ အချိုးကျ ပြောင်းလဲ၍ ISO String တည်ဆောက်ခြင်း
        const localDateTime = new Date(`${m.date}T${m.time}:00`);
        const utcDateTimeStr = localDateTime.toISOString();

        const matchKey = `${homeId}_vs_${awayId}`;

        if (!allUniqueMatches.has(matchKey)) {
          allUniqueMatches.set(matchKey, {
            homeId: homeId,
            awayId: awayId,
            kickoff_time: utcDateTimeStr
          });
        }
      });
    }

    // ပွဲချိန်အလိုက် Timeline အစီအစဉ်တကျ စီခြင်း
    const sortedMatches = Array.from(allUniqueMatches.values()).sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    
    console.log(`✅ ၂၀၂၆-၂၇ အသင်းစစ်စစ် စစ်ထုတ်ပြီး ပွဲစဉ်အရေအတွက်: (${sortedMatches.length}) ခု ရရှိပါသည်။`);
    console.log("🚀 Firebase Firestore ထဲသို့ တစ်ရာသီလုံးစာ နေရာလွတ် (Ready Matrix) မောင်းထည့်နေပါပြီ...");

    let batch = db.batch();
    let count = 0;

    sortedMatches.forEach((match, index) => {
      const id = index + 1; // 1 မှ 380 အထိ ပွဲစဉ် ID
      
      // ပွဲစဉ် ၁၀ ခုစီကို အုပ်စုဖွဲ့၍ Week 1 မှ 38 အထိ အချိုးကျ ခွဲဝေခြင်း
      const calculatedGw = Math.floor((id - 1) / 10) + 1;

      const fixtureDocRef = db.collection("fixtures").doc(String(id));

      const fixtureData = {
        id: Number(id),
        event: Number(calculatedGw), // Dynamic Week 1 to 38
        code: 20262700 + id,
        kickoff_time: match.kickoff_time,
        started: false,
        finished: false,
        minutes: 0,
        team_h: Number(match.homeId),
        team_a: Number(match.awayId),
        team_h_score: null,
        team_a_score: null,
        stats: [], // API မချိတ်ခင် စာရင်းအားလုံးအား အလွတ် (Ready အဖြစ်) ထားရှိခြင်း
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      };

      batch.set(fixtureDocRef, fixtureData, { merge: true });
      count++;

      if (count % 400 === 0) {
        batch.commit();
        batch = db.batch();
      }
    });

    if (count % 400 !== 0) {
      await batch.commit();
    }

    console.log(`🏆 [SUCCESS READY] ၂၀၂၆-၂၇ အသင်း ID အမှန်များဖြင့် Week 1 မှ 38 အလိုက် Firebase ထဲသို့ မောင်းထည့်ပြီးစီးပါပြီ အန်ကယ်ဗျာ!`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Local Matrix Sync ကျရှုံးရပါသည် အန်ကယ်:", error);
    process.exit(1);
  }
}

buildLocalFixturesReady();
