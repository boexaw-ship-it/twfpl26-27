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

// === Helper: FPL API fetch ===
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

// === Current Gameweek ===
async function getCurrentGameweek() {
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  const current = bootstrap.events.find((e) => e.is_current);
  if (current) return current.id;
  const next = bootstrap.events.find((e) => e.is_next);
  return next ? Math.max(next.id - 1, 1) : 1;
}

// 💡 Player Element ID အလိုက် Player Details မာစတာဒေတာဆွဲယူခြင်း
async function getPlayerMasterMap() {
  console.log("📊 Loading FPL Player Elements Map Data...");
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  
  const teamsMap = {};
  bootstrap.teams.forEach(t => {
    teamsMap[t.id] = t.short_name.toUpperCase(); // e.g., "ARS", "MCI"
  });

  const playersMap = {};
  const positions = ["", "GK", "DEF", "MID", "FWD"];

  bootstrap.elements.forEach(p => {
    playersMap[p.id] = {
      name: p.web_name,
      position: positions[p.element_type] || "MID",
      teamCode: teamsMap[p.team] || "unknown",
      livePoints: p.event_points ?? 0
    };
  });

  return playersMap;
}

// === League Standings ဆွဲမယ် ===
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

// === Team တစ်ခုချင်းစီ၏ Chip, Hit နှင့် Player Picks ဒေတာများယူခြင်း ===
async function getTeamGwDetail(fplTeamId, gw, playersMasterMap) {
  try {
    const data = await fplFetch(`${FPL_BASE}/entry/${fplTeamId}/event/${gw}/picks/`);
    
    // ကစားသမားတစ်ယောက်ချင်းစီကို အမှတ်၊ နာမည်၊ ပိုဇီရှင်၊ ဂျာစီကုဒ်များနှင့် တွဲဖက်ပုံစံသွင်းခြင်း
    const squadPicks = (data.picks || []).map(p => {
      const masterInfo = playersMasterMap[p.element] || { name: "?", position: "MID", teamCode: "unknown", livePoints: 0 };
      return {
        playerId: p.element,
        name: masterInfo.name,
        position: masterInfo.position,
        teamCode: masterInfo.teamCode,
        livePoints: masterInfo.livePoints,
        multiplier: p.multiplier || 1,
        isCaptain: p.is_captain || false,
        isVice: p.is_vice || false
      };
    });

    return {
      chip: data.active_chip || null,
      hitCost: data.entry_history?.event_transfers_cost || 0,
      gwPoints: data.entry_history?.points || 0,
      picks: squadPicks // 💡 တိုးမြှင့်လိုက်သည့် အသင်းသား ၁၅ ယောက် စာရင်း
    };
  } catch (err) {
    console.log(`   ⚠️ Could not fetch detail for team ${fplTeamId}: ${err.message}`);
    return { chip: null, hitCost: 0, gwPoints: 0, picks: [] };
  }
}

// === League Sync Function ===
async function syncLeague(leagueConfig, gw, playersMasterMap) {
  const { firebaseId, fplLeagueId } = leagueConfig;
  console.log(`📥 Fetching League ${fplLeagueId} (${firebaseId})...`);

  try {
    const standings = await fetchAllStandings(fplLeagueId);
    console.log(`   Found ${standings.length} teams — fetching details...`);

    const batch = db.batch();
    let count = 0;

    for (const team of standings) {
      const detail = await getTeamGwDetail(team.entry, gw, playersMasterMap);

      const docRef = db
        .collection("leagues")
        .doc(firebaseId)
        .collection("standings")
        .doc(String(team.entry));

      // 💡 အပြောင်းအလဲ: မူရင်း Standings နေရာမှာပဲ picks (Player Points) ကိုပါ ပူးတွဲသိမ်းဆည်းလိုက်ခြင်း
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
        picks: detail.picks, // 👈 ဤနေရာတွင် Player Points စာရင်း ရောက်ရှိသွားပါပြီ
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      await new Promise((r) => setTimeout(r, 200));

      if (count % 400 === 0) {
        await batch.commit();
        console.log(`   ...${count} teams written`);
      }
    }

    await batch.commit();
    console.log(`✅ League ${fplLeagueId} (${firebaseId}) — ${standings.length} teams synced`);
  } catch (err) {
    console.error(`❌ League ${fplLeagueId} failed: ${err.message}`);
  }
}

async function main() {
  const gw = await getCurrentGameweek();
  const playersMasterMap = await getPlayerMasterMap(); // မာစတာ Map အရင်ဆွဲမည်
  
  for (const league of LEAGUES) {
    await syncLeague(league, gw, playersMasterMap);
  }
  process.exit(0);
}

main();
