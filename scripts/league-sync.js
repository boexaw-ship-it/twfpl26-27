// ============================================
// TW Fantasy Official League
// League Sync Script
// ============================================
// FPL Official Mini League 2 ခု ရဲ့ Standings ကို
// FPL API ကနေ ဆွဲပြီး Firebase ထဲ ရေးသွင်းပေးတယ်
//
// League 1: 184965  → "league1" (Weekly League)
// League 2: 561639  → "league2" (All Friends)
//
// Data ပါဝင်ချက်:
//   - Rank, Team Name, Manager Name
//   - GW Points, Overall (Total) Points
//   - Chip used (TC, BB, WC, FH) — Team name ဘေးက marking အတွက်
//   - Transfer hit cost (-4, -8...) — Team name ဘေးက marking အတွက်
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
  { firebaseId: "league1", fplLeagueId: 151552 }, // Weekly League
  { firebaseId: "league2", fplLeagueId: 184965 }, // All Friends
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

// === Current Gameweek ရှာမယ် ===
async function getCurrentGameweek() {
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  const next = bootstrap.events.find((e) => e.is_next);
  return next ? Math.max(next.id - 1, 1) : 1;
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
    if (hasNext) await new Promise((r) => setTimeout(r, 300));
  }

  return allResults;
}

// === Team တစ်ခုချင်းစီရဲ့ Chip + Hit data ယူမယ် (event/picks endpoint ကနေ) ===
async function getTeamGwDetail(fplTeamId, gw) {
  try {
    const data = await fplFetch(`${FPL_BASE}/entry/${fplTeamId}/event/${gw}/picks/`);
    return {
      chip: data.active_chip || null, // "3xc", "bboost", "wildcard", "freehit", null
      hitCost: data.entry_history?.event_transfers_cost || 0,
      gwPoints: data.entry_history?.points || 0,
    };
  } catch (err) {
    console.log(`   ⚠️ Could not fetch detail for team ${fplTeamId}: ${err.message}`);
    return { chip: null, hitCost: 0, gwPoints: 0 };
  }
}

// === League တစ်ခုချင်းစီ Sync လုပ်မယ် ===
async function syncLeague(leagueConfig, gw) {
  const { firebaseId, fplLeagueId } = leagueConfig;
  console.log(`📥 Fetching League ${fplLeagueId} (${firebaseId})...`);

  try {
    const standings = await fetchAllStandings(fplLeagueId);
    console.log(`   Found ${standings.length} teams — fetching chip/hit details...`);

    const batch = db.batch();
    let count = 0;

    for (const team of standings) {
      // Team တစ်ခုချင်းစီအတွက် chip + hit detail ထပ်ဆွဲ
      const detail = await getTeamGwDetail(team.entry, gw);

      const docRef = db
        .collection("leagues")
        .doc(firebaseId)
        .collection("standings")
        .doc(String(team.entry));

      batch.set(docRef, {
        fplTeamId: team.entry,
        teamName: team.entry_name,
        managerName: team.player_name,
        rank: team.rank,
        lastRank: team.last_rank,
        points: team.total,           // Overall total points
        gwPoints: detail.gwPoints,    // This gameweek points (hits already deducted by FPL)
        chip: detail.chip,            // Active chip this GW (marking အတွက်)
        hitCost: detail.hitCost,      // Transfer hit cost this GW (marking အတွက်)
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;

      // Rate limit ရှောင်ဖို့ delay (team တစ်ယောက်ချင်း API ထပ်ခေါ်နေလို့)
      await new Promise((r) => setTimeout(r, 250));

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

  try {
    const gw = await getCurrentGameweek();
    console.log(`📅 Current Gameweek: ${gw}`);
    console.log("============================================");

    const results = [];

    for (const league of LEAGUES) {
      const result = await syncLeague(league, gw);
      results.push({ ...league, ...result });
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
      gameweek: gw,
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
  } catch (err) {
    console.error("🔥 Fatal Error:", err.message);
    process.exit(1);
  }
}

main();


