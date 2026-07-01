import { auth, db } from "../js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const teamDetailsMap = {
  1: { name: "Arsenal", short: "ARS", code: "ars" },
  2: { name: "Aston Villa", short: "AVL", code: "avl" },
  3: { name: "AFC Bournemouth", short: "BOU", code: "bou" },
  4: { name: "Brentford", short: "BRE", code: "bre" },
  5: { name: "Brighton & Hove Albion", short: "BHA", code: "bha" },
  6: { name: "Chelsea", short: "CHE", code: "che" },
  7: { name: "Coventry City", short: "COV", code: "cov" },
  8: { name: "Crystal Palace", short: "CRY", code: "cry" },
  9: { name: "Everton", short: "EVE", code: "eve" },
  10: { name: "Fulham", short: "FUL", code: "ful" },
  11: { name: "Hull City", short: "HUL", code: "hul" },
  12: { name: "Ipswich Town", short: "IPS", code: "ips" },
  13: { name: "Leeds United", short: "LEE", code: "lee" },
  14: { name: "Liverpool", short: "LIV", code: "liv" },
  15: { name: "Manchester City", short: "MCI", code: "mci" },
  16: { name: "Manchester United", short: "MUN", code: "mun" },
  17: { name: "Newcastle United", short: "NEW", code: "new" },
  18: { name: "Nottingham Forest", short: "NFO", code: "nfo" },
  19: { name: "Sunderland", short: "SUN", code: "sun" },
  20: { name: "Tottenham Hotspur", short: "TOT", code: "tot" }
};

let firebaseFixturesList = [];
let selectedGameweek = 1;
let currentFilterMode = "all";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "../index.html"; return; }
  buildMatchCenterSystem();
});

async function buildMatchCenterSystem() {
  const listEl = document.getElementById("fixtures-list");
  try {
    // 💡 စာသားမလှသော Default Dropdown အစား Custom UI Dropdown အား ပြင်ဆင်ခြင်း
    setupCustomDropdown();

    // 💡 အန်ကယ်မိန့်ဆိုသကဲ့သို့ Console တွင် Loading စာသားသန့်သန့်သာ ပြသရန် ညှိနှိုင်းခြင်း
    console.log("Loading...");
    const querySnapshot = await getDocs(collection(db, "fixtures"));
    
    firebaseFixturesList = [];
    querySnapshot.forEach((doc) => {
      firebaseFixturesList.push({ id: doc.id, ...doc.data() });
    });

    renderFixturesTimeline();
  } catch (err) {
    listEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#f87171;">Loading Error</p>`;
    console.error(err);
  }
}

// 💡 ✅ FIXED PHONE DROPDOWN UI: ဖုန်းနှင့်သုံးလျှင် စနစ်တကျ လှပစေရန် HTML Custom UI ဖြင့် Week Selector အား ပြန်လည်တည်ဆောက်ခြင်း
function setupCustomDropdown() {
  const container = document.getElementById("gw-selector-container");
  if (!container) return;

  // အန်ကယ့် UI Theme အရောင်အတိုင်း ကွက်တိကျစေရန် ညှိနှိုင်းမှု
  container.innerHTML = `
    <div class="relative inline-block text-left w-full max-w-[160px]">
      <button id="gw-dropdown-btn" onclick="toggleGwDropdown()" class="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-black text-white bg-[#1F5C36] border border-[#2A7A47] focus:outline-none transition-all shadow-md">
        <span>Gameweek ${selectedGameweek}</span>
        <svg class="w-3 h-3 ml-1 text-[#F0D060] transition-transform duration-200" id="gw-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg>
      </button>
      
      <div id="gw-dropdown-menu" class="hidden absolute right-0 mt-1 w-full max-w-[160px] max-h-[240px] overflow-y-auto rounded-lg shadow-2xl bg-[#154226] border border-[#2A7A47] z-50 transition-all">
        <div class="py-1">
          ${Array.from({ length: 38 }, (_, i) => i + 1).map(w => `
            <button onclick="selectCustomGw(${w})" class="w-full text-left px-3 py-2 text-xs font-bold transition-all flex items-center justify-between ${w === selectedGameweek ? 'text-[#F0D060] bg-[#1F5C36]' : 'text-white/80 hover:bg-[#1F5C36] hover:text-white'}">
              <span>Gameweek ${w}</span>
              ${w === selectedGameweek ? `<span class="w-1.5 h-1.5 rounded-full bg-[#F0D060]"></span>` : ''}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

// Custom Dropdown ဖွင့်/ပိတ် Logic
window.toggleGwDropdown = () => {
  const menu = document.getElementById("gw-dropdown-menu");
  const arrow = document.getElementById("gw-arrow");
  if (!menu) return;

  if (menu.classList.contains("hidden")) {
    menu.classList.remove("hidden");
    if (arrow) arrow.style.transform = "rotate(180deg)";
  } else {
    menu.classList.add("hidden");
    if (arrow) arrow.style.transform = "rotate(0deg)";
  }
};

// အပတ်စဉ် ရွေးချယ်လိုက်သည့်စနစ်
window.selectCustomGw = (gwNumber) => {
  selectedGameweek = Number(gwNumber);
  
  // Button စာသားအား ပြောင်းလဲခြင်း
  const btn = document.getElementById("gw-dropdown-btn");
  if (btn) btn.querySelector("span").innerText = `Gameweek ${gwNumber}`;

  // Dropdown ပိတ်ခြင်း
  window.toggleGwDropdown();
  
  // Custom UI အား Refresh လုပ်ပြီး ပွဲစဉ်များအား စစ်ထုတ်ဖတ်ခြင်း
  setupCustomDropdown();
  renderFixturesTimeline();
};

// 💡 ကလစ်နှိပ်သည့်အခါ နေရာလွတ်ဖြစ်ပါက Dropdown အလိုအလျောက် ပိတ်စေရန်
document.addEventListener("click", (e) => {
  const menu = document.getElementById("gw-dropdown-menu");
  const btn = document.getElementById("gw-dropdown-btn");
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add("hidden");
    const arrow = document.getElementById("gw-arrow");
    if (arrow) arrow.style.transform = "rotate(0deg)";
  }
});

function teamBadgeHtml(teamId) {
  const t = teamDetailsMap[teamId];
  if (!t) return `<span class="text-white text-sm">—</span>`;
  
  return `
    <div class="flex items-center gap-1.5">
      <img src="../assets/badges/${teamId}.${t.code}.png" class="w-6 h-6 object-contain drop-shadow" onerror="this.style.display='none'; this.onerror=null;" />
      <span class="text-white text-sm font-bold tracking-wide">${t.short}</span>
    </div>
  `;
}

function translateToMyanmarTime(kickoffUtcString) {
  if (!kickoffUtcString) return { date: "TBC", time: "ညှိနှိုင်းဆဲ" };
  
  const utcDate = new Date(kickoffUtcString);
  utcDate.setMinutes(utcDate.getMinutes() - 60);
  
  const dateOptions = { timeZone: "Asia/Yangon", weekday: "short", day: "numeric", month: "short" };
  const timeOptions = { timeZone: "Asia/Yangon", hour: "2-digit", minute: "2-digit", hour12: false };
  
  let dateStr = utcDate.toLocaleDateString("en-GB", dateOptions);
  let timeStr = utcDate.toLocaleTimeString("en-GB", timeOptions);
  
  return { date: dateStr, time: timeStr + " MMT" };
}

function renderFixturesTimeline() {
  const listEl = document.getElementById("fixtures-list");
  
  let targetedFixtures = firebaseFixturesList.filter(f => Number(f.event) === Number(selectedGameweek));

  if (currentFilterMode === "upcoming") targetedFixtures = targetedFixtures.filter(f => !f.finished);
  if (currentFilterMode === "finished") targetedFixtures = targetedFixtures.filter(f => f.finished);

  if (targetedFixtures.length === 0) {
    listEl.innerHTML = `<p class="text-center text-xs py-16 text-white/50">ယခု အပတ်အတွက် ပွဲစဉ်မရှိပါဗျာ</p>`;
    return;
  }

  targetedFixtures.sort((a,b) => new Date(a.kickoff_time) - new Date(b.kickoff_time));

  listEl.innerHTML = `
    <div class="space-y-3">
      ${targetedFixtures.map(f => {
        const { date, time } = translateToMyanmarTime(f.kickoff_time);
        const isLive = f.started && !f.finished;
        const isFinished = f.finished;

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

        </div>`;
      }).join("")}
    </div>
  `;
}

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

