// ============================================
// TW Fantasy Official League
// League Sync Script (Standalone Variant - Manual Control Fixed)
// ============================================

const admin = require("firebase-admin");

// ============================================
// 🎯 💡 🏆 UNCLE'S MANUAL CONTROL PANEL
// အန်ကယ် အပတ်စဉ် စိတ်ကြိုက်ပြောင်းလဲလိုသည့် Week နံပါတ် (1, 2, 3) ကို ဤနေရာတွင်သာ ပြောင်းပေးရုံပါပဲဗျာ။
// ၎င်းနံပါတ်အတိုင်းသာ ဒေတာများကို အမြဲတမ်း Overwrite Live ဆွဲယူပေးသွားမည်ဖြစ်ပါသည်။
const MANUAL_WEEK_NUMBER = 1; 
// ============================================

// === Firebase Admin Init ===
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Error: FIREBASE_SERVICE_ACCOUNT Environment Variable မတွေ့ရှိပါဗျာ။");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// === FPL API ===
const FPL_BASE = "https://fantasy.premierleague.com/api";

// === League Config ===
const LEAGUES = [
  { firebaseId: "league1", fplLeagueId: 151552 }, // Weekly League
  { firebaseId: "league2", fplLeagueId: 184965 }, // All Friends
];

// === Helper: FPL API Fetch ===
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

// 📊 ကစားသမား Master Lookup ပုံဖော်ခြင်း (မူရင်းအတိုင်း စာကြောင်းရေအပြည့်)
async function getPlayerMasterMap() {
  console.log("📊 Fetching FPL Bootstrap-Static Master Data...");
  const bootstrap = await fplFetch(`${FPL_BASE}/bootstrap-static/`);
  
  const teamsMap = {};
  bootstrap.teams.forEach(t => {
    teamsMap[t.id] = t.short_name.toLowerCase(); 
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
      const finalMultiplier = p.multiplier !== undefined && p.multiplier !== null ? Number(p.multiplier) : 1;

      return {
        playerId: p.element,
        name: masterInfo.name,
        position: masterInfo.position, 
        teamCode: masterInfo.teamCode, 
        livePoints: masterInfo.livePoints,
        multiplier: finalMultiplier, 
        isCaptain: p.is_captain === true || p.is_captain === "true" || finalMultiplier > 1,
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
  console.log(`📥 Syncing League ${fplLeagueId} (${firebaseId}) — Gameweek ${gw} Mode...`);

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

      // 💡 ✅ PURE LIVE OVERWRITE: အဟောင်းမှတ်တမ်းများ လုံးဝမချန်ဘဲ အန်ကယ် ညွှန်ကြားသည့် Week ၏ Live ရမှတ်များကိုသာ အစားထိုးသိမ်းဆည်းခြင်း
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
      
      await new Promise((r) => setTimeout(r, 50));

      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`   ...${count} entries recorded`);
      }
    }

    await batch.commit();
    console.log(`✅ League ${fplLeagueId} (${firebaseId}) — ${standings.length} records successfully unified.`);
  } catch (err) {
    console.error("❌ League update omitted for league: " + firebaseId + " - Error: " + err.message);
  }
}

// === Execution Process ===
async function main() {
  // 💡 စနစ်၏ အလိုအလျောက်ဖတ်ခြင်းအား ကျော်ဖြတ်ပြီး အန်ကယ် သတ်မှတ်လိုက်သော Manual Week အား အတည်ပြုခြင်း
  const targetWeek = Number(MANUAL_WEEK_NUMBER);
  console.log("🚀 Running Unified League Sync Engine...");
  console.log(`🔥 [UNCLE'S CONTROL MODE]: Forcing execution for Gameweek ${targetWeek} Only!`);

  try {
    const playersMasterMap = await getPlayerMasterMap();
    
    // 💡 Lock များနှင့် Guard များအားလုံးကို ဖယ်ထုတ်လိုက်သဖြင့် အခေါက်တိုင်း Live ဒေတာများ တရစပ် အော်တို ဝင်ရောက်ပါမည်
    for (const league of LEAGUES) {
      await syncLeague(league, targetWeek, playersMasterMap);
    }

    console.log(`🎉 [SUCCESS] Gameweek ${targetWeek} အတွက် Leaderboard ရမှတ်များနှင့် လူစာရင်းများအားလုံး အော်တို Live မောင်းနှင်ပြီးစီးပါပြီ အန်ကယ်ဗျာ။`);
    process.exit(0);
  } catch (err) {
    console.error("Fatal exception: " + err.message);
    process.exit(1);
  }
}

main();
