// ============================================
// TW Fantasy Official League
// GW Finalize Sync Script
// ============================================
// ဒီ Script က GW (Gameweek) တစ်ခု **ပြီးဆုံးမှ** run ပြီး
// "Final/Completed" team data ကို Firebase ထဲ သီးခြား ရေးသွင်းပေးတယ်
//
// weekly-live-sync.js နှင့် ကွာခြားချက်:
//   weekly-live-sync.js → 5 မိနစ်တိုင်း run, "Live" (running ဆဲ) data
//                          → liveTeams/{id}, livePoints/{id}
//                          → live.html ကဖတ်တယ်
//
//   gw-finalize-sync.js → GW matches အားလုံး "finished" ဖြစ်မှသာ run
//                          → finalTeams/{id}, finalPoints/{id}
//                          → team.html ကဖတ်တယ် (ပွဲမစခင် ခဲ့တဲ့ GW result)
//
// Trigger logic:
//   FPL API ရဲ့ bootstrap-static → events[].finished === true ဆိုမှ
//   ဒီ GW အတွက် data ကို Firebase ထဲ ရေးမယ်
//   (finished မဖြစ်သေးရင် script က skip လုပ်ပြီး ဘာမှ မရေးဘဲ ထွက်မယ်)
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

// === Step 1: GW finished ဖြစ်ပြီးလား စစ်မယ် ===
function findFinishedGameweek(bootstrap) {
  // "is_current" ဖြစ်ပြီး "finished" ဖြစ်နေတဲ့ GW ကို ရှာမယ်
  // (ပွဲစဉ်အားလုံး ပြီးပြီး result confirm ဖြစ်ပြီးမှသာ true ဖြစ်မယ်)
  const finished = bootstrap.events.find((e) => e.is_current && e.finished);
  if (finished) return finished.id;

  // is_current မဟုတ်တော့ပေမယ့် data_checked မရှိသေးရင် (most recent finished GW)
  const mostRecentFinished = [...bootstrap.events]
    .filter((e) => e.finished && e.data_checked)
    .sort((a, b) => b.id - a.id)[0];

  return mostRecentFinished ? mostRecentFinished.id : null;
}

// === Step 2: Player position + team code map ဆောက်မယ် ===
function buildPositionMap(bootstrap) {
  const posMap = {};
  bootstrap.element_types.forEach((et) => {
    posMap[et.id] = et.singular_name_short;
  });

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
      teamCode: teamCodeMap[el.team] || "unknown",
    };
  });
  return playerPosMap;
}

// === Step 3: Finished GW ရဲ့ Final Points (player တစ်ယောက်ချင်းစီ) ===
async function getFinalPoints(gw) {
  const data = await fplFetch(`${FPL_BASE}/event/${gw}/live/`);
  const pointsMap = {};
  data.elements.forEach((el) => {
    pointsMap[el.id] = el.stats.total_points;
  });
  return pointsMap;
}

// === Step 4: User တစ်ယောက်ချင်းစီ Finalize Sync လုပ်မယ် ===
async function finalizeUserTeam(fplId, gw, finalPointsMap, playerPosMap) {
  try {
    const picksData = await fplFetch(`${FPL_BASE}/entry/${fplId}/event/${gw}/picks/`);
    const entryData = await fplFetch(`${FPL_BASE}/entry/${fplId}/`);

    const transferCost = picksData.entry_history?.event_transfers_cost || 0;
    const activeChip = picksData.active_chip || null;

    const picks = picksData.picks.map((p) => {
      const playerInfo = playerPosMap[p.element] || {
        name: "Unknown",
        position: "?",
        teamCode: "unknown",
      };
      const rawPoints = finalPointsMap[p.element] || 0;
      return {
        playerId: p.element,
        name: playerInfo.name,
        position: playerInfo.position,
        teamCode: playerInfo.teamCode,
        multiplier: p.multiplier,
        isCaptain: p.is_captain,
        isVice: p.is_vice_captain,
        livePoints: rawPoints, // GW ပြီးသွားပြီဆိုတော့ ဒါက "final" points ဖြစ်သွားပြီ
      };
    });

    const gwPointsFinal = picksData.entry_history?.points || 0;
    const captainPick = picks.find((p) => p.isCaptain);
    const captainPoints = captainPick ? captainPick.livePoints * (captainPick.multiplier || 2) : 0;

    // === Firebase ထဲ finalTeams ရေးမယ် (team.html ကဖတ်မယ်) ===
    await db.collection("finalTeams").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      picks: picks,
      isFinal: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // === Firebase ထဲ finalPoints ရေးမယ် ===
    await db.collection("finalPoints").doc(String(fplId)).set({
      fplTeamId: fplId,
      gameweek: gw,
      gwPoints: gwPointsFinal,
      totalPoints: entryData.summary_overall_points || 0,
      gwRank: entryData.summary_event_rank || null,
      overallRank: entryData.summary_overall_rank || null,
      transferCost: transferCost,
      activeChip: activeChip,
      captainPoints: captainPoints,
      isFinal: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Finalized: FPL ID ${fplId} — GW${gw} Final Points: ${gwPointsFinal}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed: FPL ID ${fplId} — ${err.message}`);
    return false;
  }
}

// === Main Function ===
async function main() {
  console.log("🚀 TW Fantasy — GW Finalize Sync Starting...");
  console.log("Time:", new Date().toISOString());

  try {
    console.log("📥 Fetching bootstrap data...");
    const bootstrap = await fplFetch(BOOTSTRAP_URL);

    const gw = findFinishedGameweek(bootstrap);

    if (!gw) {
      console.log("⏸ No finished gameweek found yet. Skipping finalize sync.");
      console.log("   (ပွဲစဉ်တွေ run ဆဲ ဖြစ်လို့ live data ကိုပဲ သုံးနေပါသေးတယ်)");
      return;
    }

    console.log(`✅ Gameweek ${gw} is FINISHED — proceeding with finalize sync`);

    const playerPosMap = buildPositionMap(bootstrap);

    console.log("📥 Fetching final points...");
    const finalPointsMap = await getFinalPoints(gw);

    console.log("📥 Fetching registered users...");
    const usersSnapshot = await db.collection("users").get();

    const fplIds = [];
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.fplTeamId) fplIds.push(data.fplTeamId);
    });

    console.log(`👥 Total Teams to Finalize: ${fplIds.length}`);

    if (fplIds.length === 0) {
      console.log("⚠️ No registered users found. Exiting.");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const fplId of fplIds) {
      const result = await finalizeUserTeam(fplId, gw, finalPointsMap, playerPosMap);
      if (result) successCount++;
      else failCount++;
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log("============================================");
    console.log(`✅ Finalize Complete — GW${gw} — Success: ${successCount}, Failed: ${failCount}`);
    console.log("============================================");

    await db.collection("syncLogs").add({
      type: "gw-finalize-sync",
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
