// ============================================
// TW Fantasy Official League
// Weekly Live Sync Script
// ============================================
// ဒီ Script က GitHub Actions ကနေ run ပြီး
// User တစ်ယောက်ချင်းစီရဲ့ FPL Team data ကို
// FPL Official API ကနေ ဆွဲပြီး Firebase ထဲ ရေးသွင်းပေးတယ်
//
// လုပ်ဆောင်ချက်များ:
//   1. Firebase users collection ထဲက fplTeamId အားလုံး ယူ
//   2. Current Gameweek ကို FPL API ကနေ ရှာ
//   3. User တစ်ယောက်ချင်းစီအတွက် —
//      - 11+4 player picks (official FPL squad)
//      - Live points (player တစ်ယောက်ချင်းစီ)
//      - Captain 2x calculation
//      - Transfer hits (-4, -8) နုတ်
//      - Total GW points + Overall points + Rank
//      - teamCode (jersey image file name အတွက် — Arsenal→"ars")
//   4. Firebase ထဲ liveTeams/{fplId} နှင့် livePoints/{fplId} ရေး
// ============================================

const admin = require("firebase-admin");

// === Firebase Admin Init ===
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// === FPL API URLs ===
const FPL_BASE = "https://fantasy.premierleague.com/api";
const BOOTSTRAP_URL = `${FPL_BASE}/bootstrap-static/`;

// === Helper: FPL API ကို fetch လုပ်မယ် (retry ပါ) ===
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
async function getCurrentGameweek(bootstrap) {
  const events = bootstrap.events;
  const current = events.find((e) => e.is_current);
  if (current) return current.id;
  const next = events.find((e) => e.is_next);
  if (next) return next.id - 1 > 0 ? next.id - 1 : next.id;
  return 1;
}

// === Step 2: Player position + team code map ဆောက်မယ် ===
// (element_type → GK/DEF/MID/FWD, team → jersey file name)
function buildPositionMap(bootstrap) {
  const posMap = {};
  bootstrap.element_types.forEach((et) => {
    posMap[et.id] = et.singular_name_short; // GKP, DEF, MID, FWD
  });

  // FPL team.id → short_name (lowercase) — jersey image file name အဖြစ်သုံးမယ်
  // ဥပမာ: Arsenal → "ars" → /public/jerseys/outfield/ars.png
  const teamCodeMap = {};
  bootstrap.teams.forEach((t) => {
    teamCodeMap[t.id] = t.short_name.toLowerCase();
  });

  const playerPosMap = {};
  bootstrap.elements.forEach((el) => {
    playerPosMap[el.id] = {
      name: el.web_name,
      position: posMap[el.element_type] === "GKP" ? "GK" : posMap[el.element_type],
      teamId: el.team,
      teamCode: teamCodeMap[el.team] || "unknown", // jersey file name key
    };
  });
  return playerPosMap;
}

// === Step 3: Gameweek Live Points (player တစ်ယောက်ချင်းစီ) ===
async function getLivePoints(gw) {
  const data = await fplFetch(`${FPL_BASE}/event/${gw}/live/`);
  const pointsMap = {};
  data.elements.forEach((el) => {
    pointsMap[el.id] = el.stats.total_points;
  });
  return pointsMap;
}

// === Step 4: User တစ်ယောက်ချင်းစီ Sync လုပ်မယ် ===
async function syncUserTeam(fplId, gw, livePointsMap, playerPosMap) {
  try {
    // Picks ယူမယ် (11+4 player)
    const picksData = await fplFetch(`${FPL_BASE}/entry/${fplId}/event/${gw}/picks/`);

    // Entry info ယူမယ် (overall rank, total points)
    const entryData = await fplFetch(`${FPL_BASE}/entry/${fplId}/`);

    // Transfer cost (hits)
    const transferCost = picksData.entry_history?.event_transfers_cost || 0;

    // Picks array ဆောက်မယ် — teamCode ပါအောင်
    const picks = picksData.picks.map((p) => {
      const playerInfo = playerPosMap[p.element] || {
        name: "Unknown",
        position: "?",
        teamCode: "unknown",
      };
      const rawPoints = livePointsMap[p.element] || 0;
      return {
        playerId: p.element,
        name: playerInfo.name,
        position: playerInfo.position,
        teamCode: playerInfo.teamCode, // ← Jersey image အတွက် (ဥပမာ: "ars", "liv", "mun")
        multiplier: p.multiplier, // 0 = bench, 1 = normal, 2 = captain, 3 = triple captain
        isCaptain: p.is_captain,
        isVice: p.is_vice_captain,
        livePoints: rawPoints, // Raw points (multiplier မပါသေး)
      };
    });

    // Total GW points (FPL API ကိုယ်တိုင် Captain+Hits တွက်ပြီးသား value)
    const gwPointsFinal = picksData.entry_history?.points || 0;

    // Captain points ရှာမယ်
    const captainPick = picks.find((p) => p.isCaptain);
    const captainPoints = captainPick ? captainPick.livePoints * (captainPick.multiplier || 2) : 0;

    // === Firebase ထဲ liveTeams ရေးမယ် (11+4 player list, jersey code ပါ) ===
    await db.collection("liveTeams").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      picks: picks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // === Firebase ထဲ livePoints ရေးမယ် (summary points) ===
    await db.collection("livePoints").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      gwPoints: gwPointsFinal,
      totalPoints: entryData.summary_overall_points || 0,
      gwRank: entryData.summary_event_rank || null,
      overallRank: entryData.summary_overall_rank || null,
      transferCost: transferCost,
      captainPoints: captainPoints,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Synced: FPL ID ${fplId} — GW${gw} Points: ${gwPointsFinal}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed: FPL ID ${fplId} — ${err.message}`);
    return false;
  }
}

// === Main Function ===
async function main() {
  console.log("🚀 TW Fantasy — Weekly Live Sync Starting...");
  console.log("Time:", new Date().toISOString());

  try {
    // Bootstrap data ယူမယ် (player info, gameweek info, team codes)
    console.log("📥 Fetching bootstrap data...");
    const bootstrap = await fplFetch(BOOTSTRAP_URL);

    const gw = await getCurrentGameweek(bootstrap);
    console.log(`📅 Current Gameweek: ${gw}`);

    const playerPosMap = buildPositionMap(bootstrap);

    console.log("📥 Fetching live points...");
    const livePointsMap = await getLivePoints(gw);

    // Firebase ကနေ User အားလုံးရဲ့ fplTeamId list ယူမယ်
    console.log("📥 Fetching registered users...");
    const usersSnapshot = await db.collection("users").get();

    const fplIds = [];
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.fplTeamId) fplIds.push(data.fplTeamId);
    });

    console.log(`👥 Total Teams to Sync: ${fplIds.length}`);

    if (fplIds.length === 0) {
      console.log("⚠️ No registered users found. Exiting.");
      return;
    }

    // User တစ်ယောက်ချင်းစီ sync (rate limit ရှောင်ဖို့ batch ခွဲမယ်)
    let successCount = 0;
    let failCount = 0;

    for (const fplId of fplIds) {
      const result = await syncUserTeam(fplId, gw, livePointsMap, playerPosMap);
      if (result) successCount++;
      else failCount++;

      // FPL API rate limit မထိအောင် 300ms delay
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log("============================================");
    console.log(`✅ Sync Complete — Success: ${successCount}, Failed: ${failCount}`);
    console.log("============================================");

    // Sync log Firebase ထဲ ရေးထားမယ် (Admin စစ်ဆေးနိုင်ဖို့)
    await db.collection("syncLogs").add({
      type: "weekly-live-sync",
      gameweek: gw,
      totalTeams: fplIds.length,
      success: successCount,
      failed: failCount,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("🔥 Fatal Error:", err.message);
    process.exit(1);
  }
}

main();
