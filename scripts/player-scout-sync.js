// ============================================
// TW Fantasy Official League
// Player Scout Sync Script (Interval Delay Variant)
// ============================================
// ဒီ Script က Player 800+ ဦးရဲ့ —
//   - Price, Ownership%, Total Points, Form (last GW points)
//   - Position, Team, Jersey code
//   - Next 3 Matches + FDR (Fixture Difficulty Rating)
// ကို FPL API ကနေ ဆွဲပြီး Firebase ထဲ ရေးသွင်းပေးတယ်
//
// 💡 အထူးပြင်ဆင်ချက်: ကစားသမား ၁၀၀ ရောက်တိုင်း ဆာဗာအား သက်သာစေရန် 
//                   ၁ စက္ကန့် (1000ms) ခေတ္တနားပြီးမှ ဒေတာများကို သန့်ရှင်းစွာ ရေးသွင်းပါသည်
// ============================================

const admin = require("firebase-admin");

// === Firebase Admin Init ===
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// === FPL API ===
const FPL_BASE = "https://fantasy.premierleague.com/api";
const BOOTSTRAP_URL = `${FPL_BASE}/bootstrap-static/`;
const FIXTURES_URL = `${FPL_BASE}/fixtures/`;

// === Helper: FPL API fetch (retry ပါ) ===
async function fplFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 TW-Fantasy-Sync/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.log(`⚠️ Fetch failed (${i + 1}/${retries}): ${url}`);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// === Step 1: Current Gameweek ရှာမယ် ===
function getCurrentGameweek(bootstrap) {
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  const next = bootstrap.events.find((e) => e.is_next);
  return next ? next.id : 1;
}

// === Step 2: Team code map (jersey image name) ===
function buildTeamMaps(bootstrap) {
  const teamCodeMap = {};
  const teamNameMap = {};
  bootstrap.teams.forEach((t) => {
    teamCodeMap[t.id] = t.short_name.toLowerCase(); // e.g., "ars", "mci"
    teamNameMap[t.id] = t.name;
  });
  return { teamCodeMap, teamNameMap };
}

// === Step 3: Team တစ်သင်းချင်းစီရဲ့ Next 3 Matches + FDR ရှာမယ် ===
function buildNextFixturesMap(fixtures, currentGw, teamNameMap, teamCodeMap) {
  const upcoming = fixtures
    .filter((f) => !f.finished && f.event && f.event >= currentGw)
    .sort((a, b) => a.event - b.event);

  const teamFixturesMap = {};
  for (let teamId = 1; teamId <= 20; teamId++) {
    const teamFixtures = upcoming.filter(
      (f) => f.team_h === teamId || f.team_a === teamId
    );

    teamFixturesMap[teamId] = teamFixtures.slice(0, 3).map((f) => {
      const isHome = f.team_h === teamId;
      const opponentId = isHome ? f.team_a : f.team_h;
      const fdr = isHome ? f.team_h_difficulty : f.team_a_difficulty;
      return {
        gw: f.event,
        opponent: teamNameMap[opponentId] || "TBC",
        opponentCode: teamCodeMap[opponentId] || "unknown",
        isHome: isHome,
        fdr: fdr || 3,
      };
    });
  }
  return teamFixturesMap;
}

// === Main Function ===
async function main() {
  console.log("🚀 TW Fantasy — Player Scout Sync Starting...");
  console.log("Time:", new Date().toISOString());

  try {
    console.log("📥 Fetching bootstrap data...");
    const bootstrap = await fplFetch(BOOTSTRAP_URL);

    const currentGw = getCurrentGameweek(bootstrap);
    console.log(`📅 Current Gameweek: ${currentGw}`);

    const { teamCodeMap, teamNameMap } = buildTeamMaps(bootstrap);

    console.log("📥 Fetching fixtures...");
    const fixtures = await fplFetch(FIXTURES_URL);
    const nextFixturesMap = buildNextFixturesMap(fixtures, currentGw, teamNameMap, teamCodeMap);

    // Position map (💡 Frontend ဇယားများနှင့် ကိုက်ညီစေရန် စာလုံးအသေး gk, def, mid, fwd သို့ တည့်မတ်ထားပါသည်)
    const posMap = {};
    const positions = ["", "gk", "def", "mid", "fwd"];
    bootstrap.element_types.forEach((et) => {
      posMap[et.id] = positions[et.id] || "mid";
    });

    console.log(`👥 Total Players: ${bootstrap.elements.length}`);

    // Firebase batch write
    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const el of bootstrap.elements) {
      // 💡 မူရင်းအတိုင်း scoutPlayers Collection ထဲသို့ တိကျစွာ ရေးသွင်းခြင်း
      const docRef = db.collection("scoutPlayers").doc(String(el.id));

      // 💡 မူရင်း Logic တစ်ခုတည်းမှ ကျန်မခဲ့စေဘဲ စနစ်တကျ Mapping လုပ်သိမ်းဆည်းခြင်း
      batch.set(docRef, {
        playerId: el.id,
        name: el.web_name,
        fullName: `${el.first_name} ${el.second_name}`,
        position: posMap[el.element_type] || "mid",
        team: teamNameMap[el.team] || "Unknown",
        teamCode: teamCodeMap[el.team] || "unknown",
        price: parseFloat((el.now_cost / 10).toFixed(1)), 
        ownership: parseFloat(el.selected_by_percent) || 0,
        totalPoints: el.total_points || 0,
        form: parseFloat(el.form) || 0, 
        gwPoints: el.event_points || 0, 
        nextMatches: nextFixturesMap[el.team] || [],
        status: el.status, 
        news: el.news || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      batchCount++;

      // 💡 🏆 အန်ကယ့် Logic ကွက်တိ: ကစားသမား ၁၀၀ ရောက်တိုင်း ဒေတာသွင်းပြီး ခေတ္တနားနားသွားမည့် စနစ်
      if (batchCount >= 100) {
        await batch.commit();
        console.log(`   ...[Interval Info] ${count} players recorded successfully.`);
        
        // 💡 CRITICAL BATCH FIX: ဒေတာ ၁၀၀ သွင်းပြီးတိုင်း Batch သေတ္တာအသစ် ပြန်ဖွင့်ပေးရန် တည့်မတ်ပြီးစီးမှု
        batch = db.batch(); 
        batchCount = 0;

        // 💡 API & Firestore Safeguard Rate-Limiter: ကစားသမား ၁၀၀ တိုင်းမှာ ၁ စက္ကန့် (1000ms) အတိအကျ နားသွားစေမည့် စနစ်
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // ၄၀၀/၁၀၀ စီခွဲရင်း ကျန်ရှိနေသော ဒေတာအကြွင်းအကျန်များအား အပြီးသတ် သိမ်းဆည်းခြင်း
    if (batchCount > 0) {
      await batch.commit();
      console.log(`   ...[Interval Info] Final chunk written. Total: ${count} players.`);
    }

    console.log("============================================");
    console.log(`✅ Player Scout Sync Complete — ${count} players synced without errors.`);
    console.log("============================================");

    await db.collection("syncLogs").add({
      type: "player-scout-sync",
      gameweek: currentGw,
      totalPlayers: count,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    process.exit(0);
  } catch (err) {
    console.error("🔥 Fatal Error:", err.message);
    process.exit(1);
  }
}

main();
