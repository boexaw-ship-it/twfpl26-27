// ============================================
// TW Fantasy Official League
// League Sync Script
// ============================================
// ဒီ Script က FPL Official Mini League ၂ ခု ရဲ့
// Standings (Weekly + Overall) ကို FPL API ကနေ ဆွဲပြီး
// Firebase ထဲ ရေးသွင်းပေးတယ်
//
// League 1: 184965
// League 2: 561639
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

// === League Config — Firebase collection name ↔ FPL League ID ===
const LEAGUES = [
  { firebaseId: "weekly", fplLeagueId: 184965 },   // League 1 — Weekly GW standings
  { firebaseId: "overall", fplLeagueId: 561639 },  // League 2 — Overall standings
];

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

// === League Standings ဆွဲမယ် (Pagination ပါ — 50 team/page) ===
async function fetchAllStandings(leagueId) {
  let allResults = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await fplFetch(
      `${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`
    );
    const results = data.standings?.results || [];
    allResults = allResults.concat(results);
    hasNext = data.standings?.has_next || false;
    page++;

    // Rate limit ရှောင်ဖို့ delay
    if (hasNext) await new Promise((r) => setTimeout(r, 300));
  }

  return allResults;
}

// === League တစ်ခုချင်းစီ Sync လုပ်မယ် ===
async function syncLeague(leagueConfig) {
  const { firebaseId, fplLeagueId } = leagueConfig;
  console.log(`📥 Fetching League ${fplLeagueId} (${firebaseId})...`);

  try {
    const standings = await fetchAllStandings(fplLeagueId);
    console.log(`   Found ${standings.length} teams`);

    // Firebase batch write (efficient)
    const batch = db.batch();
    let count = 0;

    for (const team of standings) {
      const docRef = db
        .collection("leagues")
        .doc(firebaseId)
        .collection("standings")
        .doc(String(team.entry)); // FPL Team ID ကို document ID အဖြစ်သုံး

      batch.set(docRef, {
        fplTeamId: team.entry,
        teamName: team.entry_name,
        managerName: team.player_name,
        rank: team.rank,
        lastRank: team.last_rank,
        points: team.total, // Overall total points (Weekly league မှာတောင် total ပြပေမယ့် rank order ကို event_total သုံးချင်ရင် ပြင်နိုင်)
        gwPoints: team.event_total || 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;

      // Firestore batch limit က 500 — 400 ကျော်ရင် commit ပြီး batch အသစ်ဆက်
      if (count % 400 === 0) {
        await batch.commit();
        console.log(`   ...${count} teams written`);
      }
    }

    await batch.commit();
    console.log(`✅ League ${fplLeagueId} (${firebaseId}) — ${standings.length} teams synced`);

    return { success: true, count: standings.length };
  } catch (err) {
    console.error(`❌ League ${fplLeagueId} (${firebaseId}) failed: ${err.message}`);
    return { success: false, count: 0, error: err.message };
  }
}

// === Main Function ===
async function main() {
  console.log("🚀 TW Fantasy — League Standings Sync Starting...");
  console.log("Time:", new Date().toISOString());
  console.log("============================================");

  const results = [];

  for (const league of LEAGUES) {
    const result = await syncLeague(league);
    results.push({ ...league, ...result });

    // League ကြား delay
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("============================================");
  console.log("📊 Sync Summary:");
  results.forEach((r) => {
    console.log(
      `   ${r.firebaseId} (League ${r.fplLeagueId}): ${r.success ? "✅" : "❌"} ${r.count} teams`
    );
  });
  console.log("============================================");

  // Sync log Firebase ထဲ ရေးထားမယ်
  await db.collection("syncLogs").add({
    type: "league-sync",
    results: results.map((r) => ({
      league: r.firebaseId,
      fplLeagueId: r.fplLeagueId,
      success: r.success,
      teamCount: r.count,
    })),
    runAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const anyFailed = results.some((r) => !r.success);
  if (anyFailed) {
    console.error("⚠️ Some leagues failed to sync.");
    process.exit(1);
  }
}

main();

