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

// 📊 ကစားသမား Element ID များမှ အမည်၊ ပိုဇီရှင်နှင့် အသင်းတံဆိပ်များကို Master Lookup ပုံဖော်ခြင်း
async function getPlayerMasterMap() {
  console.log("📊 Fetching FPL Bootstrap-Static Master Data...");
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  
  const teamsMap = {};
  bootstrap.teams.forEach(t => {
    // 💡 ပြင်ဆင်ချက်: အန်ကယ့် GitHub ဂျာစီပုံများနှင့် ကိုက်ညီစေရန် အသင်းအတိုကောက်အား စာလုံးအသေး (lowercase) သို့ ပြောင်းလဲသိမ်းဆည်းခြင်း
    teamsMap[t.id] = t.short_name.toLowerCase(); // e.g., "ars", "mci"
  });

  const playersMap = {};
  // 💡 ပြင်ဆင်ချက်: team.html ၏ Formation နှင့် ကိုက်ညီစေရန် ပိုဇီရှင်များကို စာလုံးအသေး (lowercase) သို့ ညှိယူခြင်း
  const positions = ["", "gk", "def", "mid", "fwd"];

  bootstrap.elements.forEach(p => {
    playersMap[p.id] = {
      name: p.web_name,
      position: positions[p.element_type] || "mid", // "gk", "def", "mid", "fwd" ဖြစ်သွားပါပြီ
      teamCode: teamsMap[p.team] || "unknown",       // "ars", "mci" ဖြစ်သွားပါပြီ
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
    
    // ကစားသမားတစ်ယောက်ချင်းစီကို Master Map အတိုင်း စနစ်တကျ ပုံဖော်ဆွဲသားခြင်း
    const squadPicks = (data.picks || []).map(p => {
      const masterInfo = playersMasterMap[p.element] || { name: "?", position: "mid", teamCode: "unknown", livePoints: 0 };
      
      // 💡 🏆 အဓိကပြင်ဆင်ချက်ကွက်တိ: team.html နှင့် ၁၀၀% ကိုက်ညီစေရန် picks ခေါင်းစဉ်အတွင်းပိုင်းအား စာလုံးအသေးစနစ်စစ်စစ်ဖြင့် Firestore ထဲသို့ သွင်းခြင်း
      return {
        playerId: p.element,
        name: masterInfo.name,
        position: masterInfo.position, // ⬅️ "gk", "def", "mid", "fwd" (စာလုံးအသေးစစ်စစ်)
        teamCode: masterInfo.teamCode, // ⬅️ "ars", "mci", "mun" (စာလုံးအသေးစစ်စစ်)
        livePoints: masterInfo.livePoints,
        multiplier: p.multiplier || 1,
        // 💡 Boolean Type-safe Safeguard: true/false စစ်စစ်များအဖြစ် တိကျစွာ ပြောင်းလဲပေးခြင်း
        isCaptain: p.is_captain === true || p.is_captain === "true" || (p.multiplier || 1) > 1,
        isVice: p.is_vice === true || p.is_vice === "true" // ⬅️ VCaptain ဒေတာအား ဤနေရာတွင် စနစ်တကျ လက်ခံသိမ်းဆည်းပေးလိုက်ပါပြီ
      };
    });

    return {
      chip: data.active_chip || null,
      hitCost: data.entry_history?.event_transfers_cost || 0,
      gwPoints: data.entry_history?.points || 0,
      picks: squadPicks // 💡 Standings Document ထဲတွင် ပူးတွဲသိမ်းဆည်းမည့် လူစာရင်း Array
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

      // 💡 အဓိကလုပ်ဆောင်ချက်: liveTeams နှင့် လုံးဝမရောဘဲ ဤနေရာတွင် Picks ကို တစ်ခါတည်း သွတ်သွင်းသိမ်းဆည်းပါသည်
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
        picks: detail.picks, // 👈 Player list array is saved directly inside standings!
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      
      // Real-time API configuration safeguard delay
      await new Promise((r) => setTimeout(r, 100));

      // Batch threshold safety limiter
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`   ...${count} entries recorded`);
      }
    }

    await batch.commit();
    console.log(`✅ League ${fplLeagueId} (${firebaseId}) — ${standings.length} records successfully unified.`);
  } catch (err) {\n    console.error(`❌ League ${fplLeagueId} update omitted: ${err.message}`);
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
    console.error("Fatal exception:", err.message);
    process.exit(1);
  }
}

main();
