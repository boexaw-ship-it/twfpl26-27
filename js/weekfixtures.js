import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let teamsMap = {};
let playersMap = {}; 
let firebaseFixturesList = []; // Firebase မှ ဆွဲယူထားသော ပွဲစဉ် ၃၈၀ လုံးစာရင်း
let selectedGameweek = 1;      // Switch မှာ လက်ရှိရွေးချထားသည့် GW နံပါတ်
let currentFilterMode = "all";

const PROXY = "https://api.allorigins.win/raw?url=";
const FPL_BOOTSTRAP = "https://fantasy.premierleague.com/api/bootstrap-static/";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }
  buildMatchCenterSystem();
});

async function buildMatchCenterSystem() {
  const listEl = document.getElementById("fixtures-list");
  try {
    // ၁။ Player Names & Logos များအတွက် Bootstrap static ဒေတာအား ယူခြင်း
    const bootstrapRes = await fetch(PROXY + encodeURIComponent(FPL_BOOTSTRAP));
    const bootstrap = await bootstrapRes.json();
    
    bootstrap.teams.forEach(t => { teamsMap[t.id] = { name: t.name, short: t.short_name, code: t.code }; });
    bootstrap.elements.forEach(p => { playersMap[p.id] = p.web_name || p.second_name; });

    // လက်ရှိ Gameweek အား Auto သတ်မှတ်ခြင်း
    const currentGW = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next) || bootstrap.events[0];
    selectedGameweek = currentGW?.id || 1;

    // 💡 🏆 ၂။ အန်ကယ့် အိုင်ဒီယာအမှန်အတိုင်း: Firebase Firestore 'fixtures' Collection ထံမှ တိုက်ရိုက်ဒေတာဆွဲယူခြင်း
    console.log("🔥 [TWFPL Database] Loading fixtures from Firebase Firestore Cloud...");
    const querySnapshot = await getDocs(collection(db, "fixtures"));
    
    firebaseFixturesList = [];
    querySnapshot.forEach((doc) => {
      firebaseFixturesList.push({ id: doc.id, ...doc.data() });
    });

    // 💡 ၃။ UI Dropdown Selector Switch အား Week 1 မှ 38 အထိ အလိုအလျောက် ဆောက်ပေးခြင်း
    populateGwSelectorOptions();
    
    renderFixturesTimeline();
  } catch (err) {
    listEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#f87171;">Firebase မှ ပွဲစဉ်များ ဆွဲမရပါ — Backend Sync မောင်းထားရန် လိုအပ်ပါသည်ဗျာ</p>`;
    console.error("Firebase Fixtures Load Error:", err);
  }
}

// Switch Dropdown options တည်ဆောက်ရေး ဖန်ရှင်
function populateGwSelectorOptions() {
  const selector = document.getElementById("gw-selector");
  if (!selector) return;

  let optionsHtml = "";
  for (let w = 1; w <= 38; w++) {
    const isSelected = w === selectedGameweek ? "selected" : "";
    optionsHtml += `<option value="${w}" ${isSelected}>Gameweek ${w}</option>`;
  }
  selector.innerHTML = optionsHtml;
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

function translateToMyanmarTime(kickoffUtcString) {
  if (!kickoffUtcString) return { date: "TBC", time: "ညှိနှိုင်းဆဲ" };
  const utcDate = new Date(kickoffUtcString);
  const dateStr = utcDate.toLocaleDateString("en-GB", { timeZone: "Asia/Yangon", weekday: "short", day: "numeric", month: "short" });
  const timeStr = utcDate.toLocaleTimeString("en-GB", { timeZone: "Asia/Yangon", hour: "2-digit", minute: "2-digit", hour12: false });
  return { date: dateStr, time: timeStr + " MMT" };
}

// 💡 🟨 🟥 ⚽ PRE-EXTRACTOR ENGINE: ဂိုး၊ Assist၊ အဝါကတ်၊ အနီကတ်များအား တစ်ခါတည်း စစ်ထုတ်မည့် စနစ်
function parseMatchCardStatistics(statsArray) {
  let homeG = []; let awayG = [];
  let homeA = []; let awayA = [];
  let homeY = []; let awayY = [];
  let homeR = []; let awayR = [];

  statsArray.forEach(stat => {
    // ⚽ Goals Scored
    if (stat.identifier === "goals_scored") {
      stat.h.forEach(i => { if(playersMap[i.element]) homeG.push(`${playersMap[i.element]} (${i.value})`); });
      stat.a.forEach(i => { if(playersMap[i.element]) awayG.push(`${playersMap[i.element]} (${i.value})`); });
    }
    // 🅰️ Assists
    if (stat.identifier === "assists") {
      stat.h.forEach(i => { if(playersMap[i.element]) homeA.push(playersMap[i.element]); });
      stat.a.forEach(i => { if(playersMap[i.element]) awayA.push(playersMap[i.element]); });
    }
    // 🟨 Yellow Cards
    if (stat.identifier === "yellow_cards") {
      stat.h.forEach(i => { if(playersMap[i.element]) homeY.push(`${playersMap[i.element]}`); });
      stat.a.forEach(i => { if(playersMap[i.element]) awayY.push(`${playersMap[i.element]}`); });
    }
    // 🟥 Red Cards
    if (stat.identifier === "red_cards") {
      stat.h.forEach(i => { if(playersMap[i.element]) homeR.push(`${playersMap[i.element]}`); });
      stat.a.forEach(i => { if(playersMap[i.element]) awayR.push(`${playersMap[i.element]}`); });
    }
  });

  const hasAnyData = (homeG.length > 0 || awayG.length > 0 || homeY.length > 0 || awayY.length > 0 || homeR.length > 0 || awayR.length > 0);

  return {
    hasStats: hasAnyData,
    hGoals: homeG.join(", "), aGoals: awayG.join(", "),
    hAssists: homeA.length > 0 ? "A: " + homeA.join(", ") : "",
    aAssists: awayA.length > 0 ? "A: " + awayA.join(", ") : "",
    hYellows: homeY.length > 0 ? "🟨 " + homeY.join(", ") : "",
    aYellows: awayY.length > 0 ? "🟨 " + awayY.join(", ") : "",
    hReds: homeR.length > 0 ? "🟥 " + homeR.join(", ") : "",
    aReds: awayR.length > 0 ? "🟥 " + awayR.join(", ") : ""
  };
}

function renderFixturesTimeline() {
  const listEl = document.getElementById("fixtures-list");
  
  // 💡 Switch က ရွေးထားတဲ့ သက်ဆိုင်ရာ Gameweek တစ်ခုတည်းက ပွဲစဉ်များကိုသာ Filter စစ်ထုတ်မည်
  let targetedFixtures = firebaseFixturesList.filter(f => Number(f.event) === Number(selectedGameweek));

  // Tabs Filter Mode (All / Upcoming / Results)
  if (currentFilterMode === "upcoming") targetedFixtures = targetedFixtures.filter(f => !f.finished);
  if (currentFilterMode === "finished") targetedFixtures = targetedFixtures.filter(f => f.finished);

  if (targetedFixtures.length === 0) {
    listEl.innerHTML = `<p class="text-center text-xs py-16 text-white/50">ယခု အပတ်အတွက် ဤအမျိုးအစားထဲတွင် ပွဲစဉ်မရှိပါဗျာ</p>`;
    return;
  }

  // ပွဲချိန်အလိုက် စီစဉ်ခြင်း
  targetedFixtures.sort((a,b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));

  listEl.innerHTML = `
    <div class="space-y-3">
      ${targetedFixtures.map(f => {
        const { date, time } = translateToMyanmarTime(f.kickoff_time);
        const isLive = f.started && !f.finished;
        const isFinished = f.finished;
        const s = parseMatchCardStatistics(f.stats || []); // 💡 Live Stats Panel

        return `
        <div class="rounded-xl p-3 flex flex-col transition bg-[#1F5C36]" style="border:1px solid ${isLive ? '#ef4444' : '#2A7A47'}; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
          
          <div class="flex items-center justify-between mb-2.5" style="border-bottom: 1px solid rgba(42,122,71,0.3); padding-bottom:6px;">
            <span class="text-[11px] font-semibold text-white/70">${date}</span>
            ${isLive 
              ? `<span class="text-[9px] px-2 py-0.5 rounded-md font-black animate-pulse bg-red-600 text-white">LIVE NOW</span>` 
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

          ${s.hasStats ? `
            <div class="mt-3 pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-white/90" style="border-top:1px dashed rgba(255,255,255,0.12);">
              
              <div class="flex flex-col gap-0.5 min-w-0">
                ${s.hGoals ? `<p class="font-bold text-[#F0D060] truncate">⚽ ${s.hGoals}</p>` : ""}
                ${s.hAssists ? `<p class="text-white/50 font-medium truncate">${s.hAssists}</p>` : ""}
                ${s.hReds ? `<p class="text-red-400 font-medium truncate">${s.hReds}</p>` : ""}
                ${s.hYellows ? `<p class="text-yellow-400/80 font-medium truncate">${s.hYellows}</p>` : ""}
              </div>
              
              <div class="flex flex-col gap-0.5 text-right min-w-0">
                ${s.aGoals ? `<p class="font-bold text-[#F0D060] truncate">${s.aGoals} ⚽</p>` : ""}
                ${s.aAssists ? `<p class="text-white/50 font-medium truncate">${s.aAssists}</p>` : ""}
                ${s.aReds ? `<p class="text-red-400 font-medium truncate">${s.aReds}</p>` : ""}
                ${s.aYellows ? `<p class="text-yellow-400/80 font-medium truncate">${s.aYellows}</p>` : ""}
              </div>

            </div>
          ` : ""}

        </div>`;
      }).join("")}
    </div>
  `;
}

// 💡 🏆 GW SWITCH TRIGGERS: Dropdown ကလစ်နှိပ်လိုက်လျှင် ဒေတာချက်ချင်းလှည့်ပြောင်းပေးမည့် စနစ်
window.handleGwChange = (gwValue) => {
  if (!gwValue) return;
  selectedGameweek = Number(gwValue);
  renderFixturesTimeline();
};

// Global Tabs Controller Modules
window.filterFixtures = (filter) => {
  currentFilterMode = filter;
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.style.borderColor = "transparent";
    b.style.color = "#3A9E5F";
  });
  const activeBtn = document.getElementById("tab-" + filter);
  if (activeBtn) { activeBtn.style.borderColor = "#C9A84C"; activeBtn.style.color = "#C9A84C"; }
  renderFixturesTimeline();
};
