const admin = require("firebase-admin");
const axios = require("axios");

// 💡 GitHub Actions Secrets ထဲက Firebase Service Account Key အား ဖတ်ယူခြင်း
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Error: FIREBASE_SERVICE_ACCOUNT Environment Variable မတွေ့ရှိပါဗျာ။");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Firebase Admin SDK အား ချိတ်ဆက်မောင်းနှင်ခြင်း
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// FPL Endpoints
const FPL_FIXTURES_API = "https://fantasy.premierleague.com/api/fixtures/";

async function syncAllFixturesToFirebase() {
  try {
    console.log("🌐 Official FPL API ဆီမှ ပွဲစဉ် ၃၈၀ လုံး၏ ဒေတာများ ဆွဲယူနေပါသည်...");
    const response = await axios.get(FPL_FIXTURES_API, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const fixtures = response.data;
    if (!fixtures || !Array.isArray(fixtures)) {
      throw new Error("FPL API ထံမှ တရားဝင် Fixtures Array မရရှိပါဗျာ။");
    }

    console.log(`📦 ပွဲစဉ်စုစုပေါင်း (${fixtures.length}) ခုအား စတင် စိစစ်နေပါပြီ...`);

    // 🔥 Batch System သုံးပြီး ဒေတာများကို Firebase ထဲသို့ အလုံးအရင်းဖြင့် သိမ်းဆည်းခြင်း
    let batch = db.batch();
    let count = 0;
    const totalFixtures = fixtures.length;

    for (const f of fixtures) {
      // ပွဲစဉ်တစ်ခုချင်းစီ၏ ပင်မ Match ID အား Document ID အဖြစ် အသေသတ်မှတ်မည်
      const fixtureDocRef = db.collection("fixtures").doc(String(f.id));

      // 💡 🟨 🟥 ⚽ Double / Blank GW ဗျူဟာနှင့် Live Stats အပြည့်အစုံ ပါဝင်သော Data Object
      const fixtureData = {
        id: Number(f.id),
        event: f.event ? Number(f.event) : null, // Gameweek နံပါတ် (Blank GW အတွက် null ဖြစ်နိုင်ပါသည်)
        code: Number(f.code),
        kickoff_time: f.kickoff_time || null,    // 📅 UTC အချိန်ဇယား (Frontend မှ မြန်မာအချိန်ပြောင်းပါမည်)
        started: Boolean(f.started),
        finished: Boolean(f.finished),
        minutes: Number(f.minutes || 0),
        team_h: Number(f.team_h),
        team_a: Number(f.team_a),
        team_h_score: f.team_h_score !== undefined && f.team_h_score !== null ? Number(f.team_h_score) : null,
        team_a_score: f.team_a_score !== undefined && f.team_a_score !== null ? Number(f.team_a_score) : null,
        team_h_difficulty: Number(f.team_h_difficulty || 2),
        team_a_difficulty: Number(f.team_a_difficulty || 2),
        // 💡 🟨 🟥 ⚽ အန်ကယ် မှာကြားထားသည့် stats array (ဂိုး၊ အကူ၊ အဝါ၊ အနီ စာရင်းများ) အား တစ်စက်မကျန် သိမ်းဆည်းခြင်း
        stats: f.stats || [],
        last_updated: admin.firestore.FieldValue.serverTimestamp()
      };

      batch.set(fixtureDocRef, fixtureData, { merge: true });
      count++;

      // Firebase Firestore Limit အား ကာကွယ်ရန် Request ၄၅၀ ပြည့်တိုင်း Commit တစ်ကြိမ် နှိပ်ပေးခြင်း
      if (count % 450 === 0) {
        await batch.commit();
        console.log(`✅ ဒေတာပြား (${count}) ခုအား Firestore ထဲသို့ ရွှေ့ပြောင်းပြီးပါပြီ။`);
        batch = db.batch();
      }
    }

    // ကျန်ရှိနေသော ဒေတာများကို အပြီးသတ် Commit လုပ်ခြင်း
    if (count % 450 !== 0) {
      await batch.commit();
    }

    console.log(`🚀 [SUCCESS] ပြီးပြည့်စုံသွားပါပြီ။ ပွဲစဉ် ၃၈၀ လုံးစာ ဒေတာ + Live Stats (ဂိုး/အကူ/အဝါ/အနီ) များကို Firebase 'fixtures' collection ထဲသို့ မောင်းထည့်ပြီးစီးပါပြီဗျာ အန်ကယ်!`);
    process.exit(0);

  } catch (error) {
    console.error("❌ [SYNC ERROR] Backend Fixture Sync မောင်းနှင်မှု ကျရှုံးရပါသည် အန်ကယ်ရယ်:", error);
    process.exit(1);
  }
}

// စတင်မောင်းနှင်ရန် ခေါ်ယူခြင်း
syncAllFixturesToFirebase();
