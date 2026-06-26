import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let teamsMap = {};
let playersMap = {}; // Goal/Assist နာမည်များ ရှာဖွေရန် Player ID Map Database
let allFixtures = [];
let currentFilterMode = "all";

const PROXY = "https://api.allorigins.win/raw?url=";
const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_FIXTURES = "https://fantasy.premierleague.com/api/fixtures/";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }
  initFixturesEngine();
});

async function initFixturesEngine() {
  const listEl = document.getElementById("fixtures-list");
  try {
    // ၁။ FPL Bootstrap API မှ Teams ရော Players ဒေတာပါ တစ်ခါတည်း ဆွဲယူခြင်း
    const bootstrapRes = await fetch(PROXY + encodeURIComponent(FPL_BOOTSTRAP));
    const bootstrap = await bootstrapRes.json();
    
    // Team ID Mapping
    bootstrap.teams.forEach(t => {
      teamsMap[t.id] = { name: t.name, short: t.short_name, code: t.code };
    });

    // Player ID Mapping (ဂိုးသွင်း/ဂိုးဖန်တီးသူ နာမည်အမှန်များ သန့်ရှင်းစွာ ထုတ်ယူရန်)
    bootstrap.elements.forEach(p => {
      playersMap[p.id] = p.web_name || p.second_name;
    });

    // လက်ရှိ Gameweek အား Dynamic သတ်မှတ်ခြင်း
    const currentGW = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next) || bootstrap.events[0];
    document.getElementById("gw-label").textContent = "Gameweek " + (currentGW?.id || "—");

    // ၂။ Fixtures API မှ ပွဲစဉ်များနှင့် Live Stats အားလုံး ဆွဲယူခြင်း
    const fixturesRes = await fetch(PROXY + encodeURIComponent(FPL_FIXTURES));
    allFixtures = await fixturesRes.json();

    renderFixturesMatrix();
  } catch (err) {
    listEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#f87171;">ပွဲစဉ်ဒေတာများ ဆွဲယူ၍မရပါ — Refresh ပြန်လုပ်ကြည့်ပါဗျာ</p>`;
    console.error("Error loading Match Center:", err);
  }
}

function teamBadgeHtml(teamId) {
  const t = teamsMap[teamId];
  if (!t) return `<span class="text-white text-sm">—</span>`;
  return `
    <div class="flex items-center gap-1.5">
      <img src="https://resources.premierleague.com/premierleague/badges/50/t${t.code}.png" class="w-6 h-6 object-contain drop-shadow" onerror="this.style.visibility='hidden'" />
      <span class="text-white text-sm font-bold tracking-wide">${t.short}</span>
    </div>
  `;
}

// 💡 🇲🇲 CRITICAL FIX: UTC အချိန်ဇယားအား မြန်မာစံတော်ချိန် (MMT) သို့ ကွက်တိ ပြောင်းလဲတွက်ချက်ပေးသော အော်တိုဖန်ရှင်
function translateToMyanmarTime(kickoffUtcString) {
  if (!kickoffUtcString) return { date: "TBC", time: "ညှိနှိုင်းဆဲ" };
  
  const utcDate = new Date(kickoffUtcString);
  
  // မြန်မာနိုင်ငံ၏ ဒေသစံတော်ချိန် (en-GB localization ဖြင့် အချိုးကျ ရက်စွဲ/နာရီ ပုံဖော်ခြင်း)
  const dateStr = utcDate.toLocaleDateString("en-GB", { 
    timeZone: "Asia/Yangon", 
    weekday: "short", 
    day: "numeric", 
    month: "short" 
  });
  
  const timeStr = utcDate.toLocaleTimeString("en-GB", { 
    timeZone: "Asia/Yangon", 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false
  });
  
  return { date: dateStr, time: timeStr + " MMT" };
}

// 💡 🏆 ⚽ STATS COLLECTOR ENGINE: API JSON ထဲမှ Goal စာရင်းနှင့် Assist စာရင်းအား ပေါင်းစပ်ထုတ်ယူခြင်း
function extractMatchScorers(statsArray) {
  let homeGoals = [];
  let awayGoals = [];
  let homeAssists = [];
  let awayAssists = [];

  statsArray.forEach(stat => {
    // ဂိုးသွင်းသူစာရင်း စစ်ထုတ်ခြင်း
    if (stat.identifier === "goals_scored") {
      stat.h.forEach(item => { if(playersMap[item.element]) homeGoals.push(`${playersMap[item.element]} (${item.value})`); });
      stat.a.forEach(item => { if(playersMap[item.element]) awayGoals.push(`${playersMap[item.element]} (${item.value})`); });
    }
    // ဂိုးဖန်တီးသူစာရင်း စစ်ထုတ်ခြင်း
    if (stat.identifier === "assists") {
      stat.h.forEach(item => { if(playersMap[item.element]) homeAssists.push(playersMap[item.element]); });
      stat.a.forEach(item => { if(playersMap[item.element]) awayAssists.push(playersMap[item.element]); });
    }
  });

  return {
    hasStats: (homeGoals.length > 0 || awayGoals.length > 0),
    homeGoals: homeGoals.join(", "),
    awayGoals: awayGoals.join(", "),
    homeAssists: homeAssists.length > 0 ? "A: " + homeAssists.join(", ") : "",
    awayAssists: awayAssists.length > 0 ? "A: " + awayAssists.join(", ") : ""
  };
}

function renderFixturesMatrix() {
  const listEl = document.getElementById("fixtures-list");
  let fixtures = allFixtures;

  if (currentFilterMode === "upcoming") fixtures = allFixtures.filter(f => !f.finished);
  if (currentFilterMode === "finished") fixtures = allFixtures.filter(f => f.finished);

  // Gameweek အလိုက် အုပ်စုဖွဲ့ခြင်း
  const grouped = {};
  fixtures.forEach(f => {
    const gw = f.event || "TBC";
    if (!grouped[gw]) grouped[gw] = [];
    grouped[gw].push(f);
  });

  // အနီးစပ်ဆုံး ကန်မည့် GW ၅ ခုစာကိုသာ ပတ်ဖတ်ပြသရန်
  const gwKeys = Object.keys(grouped).sort((a, b) => a - b).slice(0, 5);

  if (gwKeys.length === 0) {
    listEl.innerHTML = `<p class="text-center text-xs py-12" style="color:#3A9E5F;">ကိုက်ညီသည့် ပွဲစဉ်ဇယားများ မရှိပါဗျာ</p>`;
    return;
  }

  listEl.innerHTML = gwKeys.map(gw => `
    <div class="mb-6">
      <p class="text-[11px] font-black uppercase tracking-widest mb-2.5" style="color:#C9A84C;">⚽ Gameweek ${gw}</p>
      <div class="space-y-2.5">
        ${grouped[gw].map(f => {
          const { date, time } = translateToMyanmarTime(f.kickoff_time); // 💡 မြန်မာစံတော်ချိန် ကူးပြောင်းမှု
          const isLive = f.started && !f.finished;
          const isFinished = f.finished;
          const matchStats = extractMatchScorers(f.stats || []); // 💡 Live Stats ထုတ်ယူမှု

          return `
          <div class="rounded-xl p-3 flex flex-col transition" style="background:#1F5C36; border:1px solid ${isLive ? '#ef4444' : '#2A7A47'}; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
            
            <div class="flex items-center justify-between mb-2.5" style="border-bottom: 1px solid rgba(42,122,71,0.3); padding-bottom:6px;">
              <span class="text-[11px] font-semibold text-white/70">${date}</span>
              ${isLive 
                ? `<span class="text-[9px] px-2 py-0.5 rounded-md font-black animate-pulse bg-red-600 text-white shadow-sm">LIVE NOW</span>` 
                : isFinished
                ? `<span class="text-[9px] px-2 py-0.5 rounded-md font-bold bg-black/30 text-white/50">FULL TIME</span>`
                : `<span class="text-[11px] font-black" style="color:#F0D060;">${time}</span>`
              }
            </div>
            
            <div class="flex items-center justify-between px-1">
              <div class="w-[35%] flex justify-start">${teamBadgeHtml(f.team_h)}</div>
              
              <div class="w-[30%] text-center">
                <span class="font-black px-3 py-1 rounded bg-black/20" style="font-family:'Bebas Neue'; font-size:1.4rem; letter-spacing:0.05em; color:${isFinished || isLive ? '#F0D060' : '#3A9E5F'};">
                  ${isFinished || isLive ? `${f.team_h_score ?? 0} - ${f.team_a_score ?? 0}` : 'VS'}
                </span>
              </div>
              
              <div class="w-[35%] flex justify-end">${teamBadgeHtml(f.team_a)}</div>
            </div>

            ${(isLive || isFinished) && matchStats.hasStats ? `
              <div class="mt-3 pt-2 grid grid-cols-2 gap-3 text-[10px] text-white/80" style="border-top:1px dashed rgba(255,255,255,0.12);">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <p class="font-bold text-[#F0D060] truncate">⚽ ${matchStats.homeGoals || "—"}</p>
                  ${matchStats.homeAssists ? `<p class="text-white/50 font-medium truncate">${matchStats.homeAssists}</p>` : ""}
                </div>
                <div class="flex flex-col gap-0.5 text-right min-w-0">
                  <p class="font-bold text-[#F0D060] truncate">${matchStats.awayGoals || "—"} ⚽</p>
                  ${matchStats.awayAssists ? `<p class="text-white/50 font-medium truncate">${matchStats.awayAssists}</p>` : ""}
                </div>
              </div>
            ` : ""}

          </div>`;
        }).join("")}
      </div>
    </div>`).join("");
}

// Global Filter Controller Module
window.filterFixtures = (filter) => {
  currentFilterMode = filter;
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.style.borderColor = "transparent";
    b.style.color = "#3A9E5F";
  });
  
  const activeBtn = document.getElementById("tab-" + filter);
  if (activeBtn) {
    activeBtn.style.borderColor = "#C9A84C";
    activeBtn.style.color = "#C9A84C";
  }
  renderFixturesMatrix();
};
