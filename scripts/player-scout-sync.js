// ============================================
// TW Fantasy Official League
// Player Scout Sync Script
// ============================================
// ဒီ Script က Player 600+ ဦးရဲ့ —
//   - Price, Ownership%, Total Points, Form (last GW points)
//   - Position, Team, Jersey code
//   - Next 3 Matches + FDR (Fixture Difficulty Rating)
// ကို FPL API ကနေ ဆွဲပြီး Firebase ထဲ ရေးသွင်းပေးတယ်
//
// Frequency: 6 နာရီတစ်ခါ (Price/Ownership ဟာ daily လောက်ပဲ ပြောင်းတတ်လို့
//            live-sync လောက် မကြာခဏ run စရာမလို)
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
    teamCodeMap[t.id] = t.short_name.toLowerCase();
    teamNameMap[t.id] = t.name;
  });
  return { teamCodeMap, teamNameMap };
}

// === Step 3: Team တစ်သင်းချင်းစီရဲ့ Next 3 Matches + FDR ရှာမယ် ===
function buildNextFixturesMap(fixtures, currentGw, teamNameMap, teamCodeMap) {
  // GW ပြီးသွားသေးတဲ့ ပွဲတွေ ဖယ်ပြီး၊ event (GW) number အတိုင်း sort
  const upcoming = fixtures
    .filter((f) => !f.finished && f.event && f.event >= currentGw)
    .sort((a, b) => a.event - b.event);

  // Team id 1-20 အတွက် next 3 fixtures map ဆောက်မယ်
  const teamFixturesMap = {};
  for (let teamId = 1; teamId <= 20; teamId++) {
    const teamFixtures = upcoming.filter(
      (f) => f.team_h === teamId || f.team_a === teamId
    );

    teamFixturesMap[teamId] = teamFixtures.slice(0, 3).map((f) => {
      const isHome = f.team_h === teamId;
      const opponentId = isHome ? f.team_a : f.team_h;
      const fdr = isHome ? f.team_h_difficulty : f.team_a_difficulty; // 1 (easy) - 5 (hard)
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

    // Position map
    const posMap = {};
    bootstrap.element_types.forEach((et) => {
      posMap[et.id] = et.singular_name_short === "GKP" ? "GK" : et.singular_name_short;
    });

    console.log(`👥 Total Players: ${bootstrap.elements.length}`);

    // Firebase batch write
    const batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const el of bootstrap.elements) {
      const docRef = db.collection("players").doc(String(el.id));

      batch.set(docRef, {
        playerId: el.id,
        name: el.web_name,
        fullName: `${el.first_name} ${el.second_name}`,
        position: posMap[el.element_type] || "?",
        team: teamNameMap[el.team] || "Unknown",
        teamCode: teamCodeMap[el.team] || "unknown",
        price: (el.now_cost / 10).toFixed(1), // FPL price is in tenths (e.g. 125 = £12.5m)
        ownership: parseFloat(el.selected_by_percent) || 0,
        totalPoints: el.total_points || 0,
        form: parseFloat(el.form) || 0, // Average points over last few GWs
        gwPoints: el.event_points || 0, // This/last GW points
        nextMatches: nextFixturesMap[el.team] || [],
        status: el.status, // "a"=available, "i"=injured, "d"=doubtful, "u"=unavailable
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      batchCount++;

      // Firestore batch limit 500 — 400 ကျော်ရင် commit ပြီး batch အသစ်
      if (batchCount >= 400) {
        await batch.commit();
        console.log(`   ...${count} players written`);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log("============================================");
    console.log(`✅ Player Scout Sync Complete — ${count} players synced`);
    console.log("============================================");

    await db.collection("syncLogs").add({
      type: "player-scout-sync",
      gameweek: currentGw,
      totalPlayers: count,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("🔥 Fatal Error:", err.message);
    process.exit(1);
  }
}

main();
