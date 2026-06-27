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

// 💡 အန်ကယ့် Jersey ID အစီအစဉ်အတိုင်း ကွက်တိ (၁ မှ ၂၀)
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
      throw new Error("scripts/ folder ထဲတွင် FI.json ဖိုင်အား ရှာမတွေ့ပါဗျာ။");
    }

    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const teamFixtures = JSON.parse(rawData);

    console.log("📦 FI.json မှ ၂၀၂၆-၂၇ ပွဲစဉ်များကို တိကျသော Structure အသစ်ဖြင့် စိစစ်နေပါသည်...");

    let allUniqueMatches = new Map();

    // ပွဲစဉ်များကို ထပ်နေသည်များ စစ်ထုတ်ခြင်း
    for (const teamName in teamFixtures) {
      const matches = teamFixtures[teamName];
      
      matches.forEach(m => {
        const homeId = teamIdMap[m.home_team];
        const awayId = teamIdMap[m.away_team];
        
        if (!homeId || !awayId) return;

        // မြန်မာစံတော်ချိန် (MMT) မှ UTC သို့ ISO String တည်ဆောက်ခြင်း
        const localDateTime = new Date(`${m.date}T${m.time}:00`);
        const utcDateTimeStr = localDateTime.toISOString();

        // Unique Key အဖြစ် Home VS Away ပုံစံ သတ်မှတ်ခြင်း
        const matchKey = `${homeId}_vs_${awayId}`;

        if (!allUniqueMatches.has(matchKey)) {
          allUniqueMatches.set(matchKey, {
            team_h: homeId,
            team_a: awayId,
            kickoff_time: utcDateTimeStr
          });
        }
      });
    }

    // ရက်စွဲ/ပွဲချိန်အလိုက် Timeline အစီအစဉ်အတိုင်း တန်းစီခြင်း
    const sortedMatches = Array.from(allUniqueMatches.values()).sort((a, b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));
    
    console.log(`✅ စစ်ထုတ်ပြီး စုစုပေါင်း ပွဲစဉ်အရေအတွက်: (${sortedMatches.length}) ခု ရရှိပါသည်။`);
    console.log("🚀 Firebase Firestore ထဲသို့ Structure အမှန်ဖြင့် အစားထိုး မောင်းထည့်နေပါပြီ...");

    let batch = db.batch();
    let count = 0;

    sortedMatches.forEach((match, index) => {
      const id = index + 1; // 1 မှ 380 အထိ ပွဲစဉ် ID
      
      // ပွဲစဉ် ၁၀ ခုစီကို Week 1 မှ 38 အထိ အုပ်စုခွဲခြင်း
      const calculatedGw = Math.floor((id - 1) / 10) + 1;

      const fixtureDocRef = db.collection("fixtures").doc(String(id));

      // 💡 ✅ FIXED STRUCTURE: ပင်မ Fields များနှင့် Stats နေရာအား သန့်ရှင်းစွာ သီးခြားခွဲထုတ်လိုက်ပါသည်
      const fixtureData = {
        id: Number(id),
        event: Number(calculatedGw), 
        code: 20262700 + id,
        kickoff_time: match.kickoff_time,
        started: false,
        finished: false,
        minutes: 0,
        team_h: Number(match.team_h),       // 🏡 ပင်မ Field အပြင်ဘက်သို့ ထုတ်ထားပါသည်
        team_a: Number(match.team_a),       // 🚀 ပင်မ Field အပြင်ဘက်သို့ ထုတ်ထားပါသည်
        team_h_score: null,                 // 🏡 ပင်မ Field အပြင်ဘက်သို့ ထုတ်ထားပါသည်
        team_a_score: null,                 // 🚀 ပင်မ Field အပြင်ဘက်သို့ ထုတ်ထားပါသည်
        stats: [],                          // ⚽ Stats အား Array သီးသန့် သန့်ရှင်းစွာ ထားရှိပါသည်
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      };

      // set နေရာတွင် merge: false ဖြင့် အစားထိုးခြင်းဖြင့် ပုံစံဟောင်းမှားယွင်းမှုများကို အပြီးတိုင် ခြစ်ဖျက်ပစ်ပါမည်
      batch.set(fixtureDocRef, fixtureData);
      count++;

      if (count % 400 === 0) {
        batch.commit();
        batch = db.batch();
      }
    });

    if (count % 400 !== 0) {
      await batch.commit();
    }

    console.log(`🏆 [SUCCESS] တည်ဆောက်ပုံ Structure အမှန်ဖြင့် Firebase ထဲသို့ ပွဲစဉ် ၃၈၀ လုံး အစားထိုးမောင်းထည့်ပြီးပါပြီ အန်ကယ်ဗျာ!`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Matrix Sync ကျရှုံးရပါသည် အန်ကယ်:", error);
    process.exit(1);
  }
}

buildLocalFixturesReady();
