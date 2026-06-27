// ============================================
// TW Fantasy Official League
// Weekly Live Sync Script (Pure Live - Manual Week Ready)
// ============================================

const admin = require("firebase-admin");
const axios = require("axios"); // 💡 စိတ်အချရဆုံး ကွန်ရက်ဒေတာဆွဲစနစ်သို့ ပြောင်းလဲခြင်း

// ============================================
// 🎯 💡 🏆 UNCLE'S MANUAL CONTROL PANEL
// အန်ကယ် အပတ်စဉ် စိတ်ကြိုက်ပြောင်းလဲလိုသည့် Week နံပါတ် (1, 2, 3) ကို ဤနေရာတွင်သာ ပြောင်းပေးရုံပါပဲဗျာ။
// league-sync.js တွင် ပြောင်းလဲထားသည့် နံပါတ်အတိုင်း ဤနေရာတွင်လည်း တူညီစွာ သတ်မှတ်ပေးရပါမည်။
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

// === FPL API URLs ===
const FPL_BASE = "https://fantasy.premierleague.com/api";
const BOOTSTRAP_URL = `${FPL_BASE}/bootstrap-static/`;

// === Helper: FPL API Fetch Tool with Axios (Retry Engine) ===
async function fplFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 TW-Fantasy-Sync/1.0" },
        timeout: 8000
      });
      return res.data;
    } catch (err) {
      console.log(`⚠️ Fetch failed (${i + 1}/${retries}): ${url} - ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

// === Player position + team code map ဆောက်မယ် ===
function buildPositionMap(bootstrap) {
  const posMap = {};
  bootstrap.element_types.forEach((et) => {
    posMap[et.id] = et.singular_name_short; // GKP, DEF, MID, FWD
  });

  // 💡 API က ပေးမည့် အသင်းအတိုကောက်များအား အန်ကယ့်ရဲ့ ဂျာစီ Logo (code) အမည်များနှင့် တိကျစွာ Mapping ညှိခြင်း
  const officialTeamTranslateMap = {
    "ars": "ars", "avl": "avl", "bou": "bou", "bre": "bre", "bha": "bha",
    "che": "che", "cov": "cov", "cry": "cry", "eve": "eve", "ful": "ful",
    "hul": "hul", "ips": "ips", "lee": "lee", "liv": "liv", "mci": "mci",
    "mun": "mun", "new": "new", "nfo": "nfo", "sun": "sun", "tot": "tot"
  };

  const teamCodeMap = {};
  bootstrap.teams.forEach((t) => {
    const rawShortName = t.short_name.toLowerCase();
    teamCodeMap[t.id] = officialTeamTranslateMap[rawShortName] || rawShortName;
  });

  const playerPosMap = {};
  bootstrap.elements.forEach((el) => {
    playerPosMap[el.id] = {
      name: el.web_name,
      position: posMap[el.element_type] === "GKP" ? "GK" : posMap[el.element_type], //
      teamId: el.team,
      teamCode: teamCodeMap[el.team] || "unknown", // 💡 အန်ကယ့် ဂျာစီ Code အမှန် ရရှိသွားပါပြီ
    };
  });
  return playerPosMap;
}

// === Gameweek Live Points (player တစ်ယောက်ချင်းစီ) ===
async function getLivePoints(gw) {
  const data = await fplFetch(`${FPL_BASE}/event/${gw}/live/`);
  const pointsMap = {};
  if (data && data.elements) {
    data.elements.forEach((el) => {
      pointsMap[el.id] = el.stats.total_points; //
    });
  }
  return pointsMap;
}

// === User တစ်ယောက်ချင်းစီ Sync လုပ်မယ် ===
async function syncUserTeam(fplId, gw, livePointsMap, playerPosMap) {
  try {
    // Picks ယူမယ် (11+4 player)
    const picksData = await fplFetch(`${FPL_BASE}/entry/${fplId}/event/${gw}/picks/`);

    // Entry info ယူမယ် (overall rank, total points)
    const entryData = await fplFetch(`${FPL_BASE}/entry/${fplId}/`);

    // Transfer cost (hits)
    const transferCost = picksData.entry_history?.event_transfers_cost || 0;

    // Active chip
    const activeChip = picksData.active_chip || null;

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
        teamCode: playerInfo.teamCode, // 💡 အန်ကယ့်ပုံစံအတိုင်း ဂျာစီ Logo Code မှန်ကန်စွာ ဝင်ရောက်ခြင်း
        multiplier: p.multiplier, //
        isCaptain: p.is_captain, //
        isVice: p.is_vice_captain, //
        livePoints: rawPoints, //
      };
    });

    // Total GW points
    const gwPointsFinal = picksData.entry_history?.points || 0;

    // Captain points ရှာမယ်
    const captainPick = picks.find((p) => p.isCaptain);
    const captainPoints = captainPick ? captainPick.livePoints * (captainPick.multiplier || 2) : 0; //

    // === Firebase ထဲ liveTeams ရေးမယ် (အမြဲတမ်း Overwrite အစားထိုးစနစ်) ===
    await db.collection("liveTeams").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      picks: picks,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // === Firebase ထဲ livePoints ရေးမယ် (အမြဲတမ်း Overwrite အစားထိုးစနစ်) ===
    await db.collection("livePoints").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      gwPoints: gwPointsFinal,
      totalPoints: entryData.summary_overall_points || 0, //
      gwRank: entryData.summary_event_rank || null, //
      overallRank: entryData.summary_overall_rank || null, //
      transferCost: transferCost, //
      activeChip: activeChip, //
      captainPoints: captainPoints, //
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Synced: FPL ID ${fplId} — GW${gw} Points: ${gwPointsFinal}`); //
    return true;
  } catch (err) {
    console.error(`❌ Failed: FPL ID ${fplId} — ${err.message}`); //
    return false;
  }
}

// === Main Function ===
async function main() {
  // 💡 အန်ကယ် လက်နဲ့ သတ်မှတ်လိုက်သော ကိန်းဂဏန်းအား အတည်ပြုခြင်း
  const targetWeek = Number(MANUAL_WEEK_NUMBER);
  console.log("🚀 TW Fantasy — Weekly Live Sync Starting..."); //
  console.log(`🔥 [UNCLE'S CONTROL MODE]: Forcing Team Sync for Gameweek ${targetWeek} Only!`);
  console.log("Time:", new Date().toISOString()); //

  try {
    console.log("📥 Fetching bootstrap data..."); //
    const bootstrap = await fplFetch(BOOTSTRAP_URL);

    const playerPosMap = buildPositionMap(bootstrap);

    console.log(`📥 Fetching live points for Gameweek ${targetWeek}...`);
    const livePointsMap = await getLivePoints(targetWeek);

    console.log("📥 Fetching registered users..."); //
    const usersSnapshot = await db.collection("users").get(); //

    const fplIds = [];
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.fplTeamId) fplIds.push(data.fplTeamId); //
    });

    console.log(`👥 Total Teams to Sync: ${fplIds.length}`); //

    if (fplIds.length === 0) {
      console.log("⚠️ No registered users found. Exiting."); //
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const fplId of fplIds) {
      const result = await syncUserTeam(fplId, targetWeek, livePointsMap, playerPosMap);
      if (result) successCount++;
      else failCount++;

      await new Promise((r) => setTimeout(r, 300)); //
    }

    console.log("============================================"); //
    console.log(`✅ Sync Complete — Success: ${successCount}, Failed: ${failCount}`); //
    console.log("============================================"); //

    await db.collection("syncLogs").add({
      type: "weekly-live-sync",
      gameweek: targetWeek,
      totalTeams: fplIds.length,
      success: successCount,
      failed: failCount,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
    }); //
    
    process.exit(0);
  } catch (err) {
    console.error("🔥 Fatal Error:", err.message); //
    process.exit(1);
  }
}

main();
