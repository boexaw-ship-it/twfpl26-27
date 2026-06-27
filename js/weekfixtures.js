import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 💡 🏆 အန်ကယ့်ရဲ့ ၂၀၂၆-၂၇ Jersey အခေါ်အဝေါ် အတိုကောက်များနှင့် နာမည်များ ဇယား (Frontend ပြသရန်)
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

let firebaseFixturesList = []; // Firebase မှ ဆွဲယူထားသော ပွဲစဉ် ၃၈၀ လုံး
let selectedGameweek = 1;      // Switch မှာ လက်ရှိရွေးထားသည့် GW (Default: Week 1)
let currentFilterMode = "all";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }
  buildMatchCenterSystem();
});

async function buildMatchCenterSystem() {
  const listEl = document.getElementById("fixtures-list");
  try {
    // 💡 အပတ်စဉ် Switch Selector အား (Week 1 မှ 38 အထိ) အော်တို ထုတ်ပေးခြင်း
    populateGwSelectorOptions();

    // 💡 🏆 အုန်းခနဲ ဆွဲဖတ်ခြင်း: အန်ကယ့် Firebase Cloud Database ထံမှ တိုက်ရိုက်ဒေတာ ဆွဲယူခြင်း
    console.log("🔥 [TWFPL Database] Loading fixtures from Firebase Firestore...");
    const querySnapshot = await getDocs(collection(db, "fixtures"));
    
    firebaseFixturesList = [];
    querySnapshot.forEach((doc) => {
      firebaseFixturesList.push({ id: doc.id, ...doc.data() });
    });

    // ဒေတာများရပြီဖြစ်၍ Timeline အား စတင်ပုံဖော်ခြင်း
    renderFixturesTimeline();
  } catch (err) {
    listEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#f87171;">Firebase မှ ပွဲစဉ်များ ဆွဲမရပါ — Rules သို့မဟုတ် အကောင့်ဝင်ခြင်း စစ်ဆေးပါဗျာ</p>`;
    console.error("Firebase Fixtures Load Error:", err);
  }
}

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

// 💡 အန်ကယ့်ရဲ့ Jersey ID အလိုက် Logo / Badge သရုပ်ဖော်ပေးမည့် စနစ်
function teamBadgeHtml(teamId) {
  const t = teamDetailsMap[teamId];
  if (!t) return `<span class="text-white text-sm">—</span>`;
  
  // အန်ကယ့် Repository ထဲရှိ .png jersey ပုံရိပ်လမ်းကြောင်းများသို့ ချိတ်ဆက်ခြင်း (ဥပမာ- 1.ars.png အတိုင်း)
  return `
    <div class="flex items-center gap-1.5">
      <img src="/twfpl26-27/assets/badges/${teamId}.${t.code}.png" class="w-6 h-6 object-contain drop-shadow" onerror="this.src='https://resources.premierleague.com/premierleague/badges/50/t1.png'; this.onerror=null;" />
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

function renderFixturesTimeline() {
  const listEl = document.getElementById("fixtures-list");
  
  // 💡 ရွေးချယ်ထားသော Gameweek နံပါတ်တစ်ခုတည်းရှိ ပွဲစဉ်များကိုသာ စစ်ထုတ်မည်
  let targetedFixtures = firebaseFixturesList.filter(f => Number(f.event) === Number(selectedGameweek));

  // Filter Mode (All / Upcoming / Results)
  if (currentFilterMode === "upcoming") targetedFixtures = targetedFixtures.filter(f => !f.finished);
  if (currentFilterMode === "finished") targetedFixtures = targetedFixtures.filter(f => f.finished);

  if (targetedFixtures.length === 0) {
    listEl.innerHTML = `<p class="text-center text-xs py-16 text-white/50">ယခု အပတ်အတွက် ဤအမျိုးအစားထဲတွင် ပွဲစဉ်မရှိပါဗျာ</p>`;
    return;
  }

  // ရက်စွဲ/အချိန်အလိုက် စီစဉ်ခြင်း
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

// 💡 GW SWITCH TRIGGERS: Dropdown ပြောင်းလဲလိုက်လျှင် ချက်ချင်း အလုပ်လုပ်မည့် စနစ်
window.handleGwChange = (gwValue) => {
  if (!gwValue) return;
  selectedGameweek = Number(gwValue);
  renderFixturesTimeline();
};

// Tabs Filter Mode Controller
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
