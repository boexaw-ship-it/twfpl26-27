// ============================================
// TW Fantasy Official League
// League Sync Script (Standalone Variant)
// ============================================
// FPL API မှ League Standings ကို ဆွဲယူပြီး 
// leagues -> leagueX -> standings -> fplID Document ထဲသို့ 
// Chip, Hit နှင့် ကစားသမား ၁၅ ယောက်စာရင်း (Picks) ကို တစ်ခါတည်း ပူးတွဲသိမ်းဆည်းပေးသည်
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

// === League Config ===
const LEAGUES = [
  { firebaseId: "league1", fplLeagueId: 151552 }, // Weekly League
  { firebaseId: "league2", fplLeagueId: 184965 }, // All Friends
];

// === Helper: FPL API Fetch with retry logic ===
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

// === Get Current Gameweek ===
async function getCurrentGameweek() {
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  const next = bootstrap.events.find((e) => e.is_next);
  return next ? Math.max(next.id - 1, 1) : 1;
}

// 📊 ကစားသမား Master Lookup ပုံဖော်ခြင်း
async function getPlayerMasterMap() {
  console.log("📊 Fetching FPL Bootstrap-Static Master Data...");
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  
  const teamsMap = {};
  bootstrap.teams.forEach(t => {
    teamsMap[t.id] = t.short_name.toLowerCase(); // e.g., "ars", "mci"
  });

  const playersMap = {};
  const positions = ["", "gk", "def", "mid", "fwd"];

  bootstrap.elements.forEach(p => {
    playersMap[p.id] = {
      name: p.web_name,
      position: positions[p.element_type] || "mid", 
      teamCode: teamsMap[p.team] || "unknown",       
      livePoints: p.event_points ?? 0
    };
  });

  return playersMap;
}

// === Pagination-supported Standing Fetcher ===
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

// === Team Details + Players Array Extraction ===
async function getTeamGwDetail(fplTeamId, gw, playersMasterMap) {
  try {
    const data = await fplFetch(`${FPL_BASE}/entry/${fplTeamId}/event/${gw}/picks/`);
    
    const squadPicks = (data.picks || []).map(p => {
      const masterInfo = playersMasterMap[p.element] || { name: "?", position: "mid", teamCode: "unknown", livePoints: 0 };
      
      return {
        playerId: p.element,
        name: masterInfo.name,
        position: masterInfo.position, 
        teamCode: masterInfo.teamCode, 
        livePoints: masterInfo.livePoints,
        multiplier: p.multiplier || 1,
        isCaptain: p.is_captain === true || p.is_captain === "true" || (p.multiplier || 1) > 1,
        isVice: p.is_vice_captain === true || p.is_vice === true 
      };
    });

    return {
      chip: data.active_chip || null,
      hitCost: data.entry_history?.event_transfers_cost || 0,
      gwPoints: data.entry_history?.points || 0,
      picks: squadPicks 
    };
  } catch (err) {
    console.log(`   ⚠️ Could not fetch detail for team ${fplTeamId}: ${err.message}`);
    return { chip: null, hitCost: 0, gwPoints: 0, picks: [] };
  }
}

// === Synchronize Specific League ===
async function syncLeague(leagueConfig, gw, playersMasterMap) {
  const { firebaseId, fplLeagueId } = leagueConfig;
  console.log(`📥 Syncing League ${fplLeagueId} (${firebaseId})...`);

  try {
    const standings = await fetchAllStandings(fplLeagueId);
    console.log(`   Found ${standings.length} teams — packing standings and player picks together...`);

    let batch = db.batch();
    let count = 0;

    for (const team of standings) {
      const detail = await getTeamGwDetail(team.entry, gw, playersMasterMap);

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
        points: team.total,           
        gwPoints: detail.gwPoints,    
        chip: detail.chip,            
        hitCost: detail.hitCost,      
        picks: detail.picks, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      
      await new Promise((r) => setTimeout(r, 100));

      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`   ...${count} entries recorded`);
      }
    }

    await batch.commit();
    console.log(`✅ League ${fplLeagueId} (${firebaseId}) — ${standings.length} records successfully unified.`);
  } catch (err) {
    // 💡 ✅ FIX: SyntaxError ဖြစ်စေသော Newline ကွဲအက္ခရာများနှင့် တိုကင်အဆန်းများကို သန့်ရှင်းစွာ ပြင်ဆင်ပြီးစီးမှု
    console.error("❌ League update omitted for league: " + firebaseId + " - Error: " + err.message);
  }
}

// === Execution Process ===
async function main() {
  console.log("🚀 Running Unified League Sync Engine...");
  try {
    const gw = await getCurrentGameweek();
    const playersMasterMap = await getPlayerMasterMap();
    
    for (const league of LEAGUES) {
      await syncLeague(league, gw, playersMasterMap);
    }
    console.log("🎉 All Standing tasks finished.");
    process.exit(0);
  } catch (err) {
    console.error("Fatal exception: " + err.message);
    process.exit(1);
  }
}

main();
