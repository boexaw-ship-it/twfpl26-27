// ============================================
// TW Fantasy Official League
// Live Engine Script (League Popup Style Matcher)
// ============================================

import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🎯 💡 UNCLE'S CONTROL CONFIG: မောင်းနှင်မည့် Week အား ဤနေရာတွင် ညှိထားပါသည်
const CURRENT_WEEK = 1; 

console.log("⚡ TW Fantasy Live JS Engine Starting...");

// DOM Elements
const pitchEl = document.getElementById("pitch");
const gwPointsEl = document.getElementById("gw-points");
const gwRankEl = document.getElementById("gw-rank");
const overallPtsEl = document.getElementById("overall-pts");
const overallRankEl = document.getElementById("overall-rank");
const captainPtsEl = document.getElementById("captain-pts");
const userTeamEl = document.getElementById("user-team");
const hitLabelEl = document.getElementById("hit-label");
const chipBadgeEl = document.getElementById("chip-badge");

// Helper: Check if User Object is Empty
function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

// === 📺 Core Function: Render Pitch in League Popup Style ===
function renderLeagueStylePitch(picks) {
  if (!picks || picks.length === 0) {
    pitchEl.innerHTML = `<p class="text-center text-xs py-8 text-white/50">လူစာရင်း မရှိသေးပါဗျာ</p>`;
    return;
  }

  // ၁။ ပွဲထွက် (Starters) နှင့် အရံ (Bench) အား Multiplier အလိုက် တိကျစွာ ခွဲထုတ်ခြင်း
  // multiplier > 0 ဆိုလျှင် ပွဲထွက်၊ multiplier === 0 ဆိုလျှင် အရံ (Bench) ဖြစ်သည်
  const starters = picks.filter(p => p.multiplier > 0);
  const benchers = picks.filter(p => p.multiplier === 0);

  // ၂။ ပွဲထွက်ကစားသမားများအား နေရာအလိုက် Row များ ထပ်မံခွဲထုတ်ခြင်း
  const gks = starters.filter(p => p.position === "GK");
  const defs = starters.filter(p => p.position === "DEF");
  const mids = starters.filter(p => p.position === "MID");
  const fwds = starters.filter(p => p.position === "FWD");

  let htmlContent = "";

  // Helper: Individual Player Card HTML Block Builder (League Popup Specification)
  const buildPlayerCardHtml = (p) => {
    // Captain / Vice Captain Badge တွက်ချက်မှု
    let badgeHtml = "";
    if (p.isCaptain) {
      badgeHtml = `<span class="absolute -top-1 -right-1 bg-[#C9A84C] text-black font-black rounded-full text-[9px] w-4 h-4 flex items-center justify-center border border-black z-10">C</span>`;
    } else if (p.isVice) {
      badgeHtml = `<span class="absolute -top-1 -right-1 bg-white text-black font-black rounded-full text-[9px] w-4 h-4 flex items-center justify-center border border-black z-10">V</span>`;
    }

    // Captain ဖြစ်ပါက Live ရမှတ်အား Multiplier (2x သို့မဟုတ် 3x) အလိုက် မြှောက်၍ ပြသခြင်း
    const finalDisplayPoints = p.isCaptain ? p.livePoints * (p.multiplier || 2) : p.livePoints;

    return `
      <div class="flex flex-col items-center mx-1 my-1 relative min-w-[65px] sm:min-w-[72px]">
        ${badgeHtml}
        <img src="/twfpl26-27/public/jerseys/outfield/${p.teamCode || 'unknown'}.png" 
             onerror="this.src='/twfpl26-27/public/jerseys/outfield/unknown.png'"
             class="w-11 h-11 object-contain" alt="Jersey" />
        
        <div class="player-box-title mt-1 shadow-md rounded-t-sm">${p.name || 'Unknown'}</div>
        <div class="player-box-points shadow-md rounded-b-sm">${finalDisplayPoints}</div>
      </div>
    `;
  };

  // 🏟️ Row 1 — Goalkeeper Row
  htmlContent += `<div class="pitch-row">`;
  gks.forEach(p => { htmlContent += buildPlayerCardHtml(p); });
  htmlContent += `</div>`;

  // 🏟️ Row 2 — Defenders Row
  htmlContent += `<div class="pitch-row">`;
  defs.forEach(p => { htmlContent += buildPlayerCardHtml(p); });
  htmlContent += `</div>`;

  // 🏟️ Row 3 — Midfielders Row
  htmlContent += `<div class="pitch-row">`;
  mids.forEach(p => { htmlContent += buildPlayerCardHtml(p); });
  htmlContent += `</div>`;

  // 🏟️ Row 4 — Forwards Row
  htmlContent += `<div class="pitch-row">`;
  fwds.forEach(p => { htmlContent += buildPlayerCardHtml(p); });
  htmlContent += `</div>`;

  // ============================================
  // 📥 🔥 📺 BENCH (အရံလူစာရင်း) CONTAINER DETACHED PANEL
  // အန်ကယ် ပေးပို့ထားသည့် ပုံစံအတိုင်း အောက်ခြေတွင် အရံသေတ္တာသီးသန့် တည်ဆောက်ခြင်း
  if (benchers.length > 0) {
    htmlContent += `
      <div class="mt-2 w-full px-2 py-1.5 rounded-xl border border-white/10" style="background: rgba(0,0,0,0.25);">
        <p class="text-center font-bold tracking-wide text-white/50 uppercase mb-1" style="font-size: 0.6rem;">
          ⚙️ BENCH (အရံလူစာရင်း)
        </p>
        <div class="flex justify-around items-center w-full">
    `;
    
    benchers.forEach(p => {
      htmlContent += `
        <div class="flex flex-col items-center mx-0.5 relative min-w-[55px]">
          <img src="/twfpl26-27/public/jerseys/outfield/${p.teamCode || 'unknown'}.png" 
               onerror="this.src='/twfpl26-27/public/jerseys/outfield/unknown.png'"
               class="w-9 h-9 object-contain opacity-75" alt="Jersey" />
          <div class="player-box-title mt-1 scale-90 origin-bottom" style="max-w: 62px;">${p.name || 'Unknown'}</div>
          <div class="player-box-points scale-90 origin-top text-white/60" style="max-w: 62px; background:#111;">${p.livePoints}</div>
        </div>
      `;
    });

    htmlContent += `
        </div>
      </div>
    `;
  }

  // Master UI Injection
  pitchEl.innerHTML = htmlContent;
}

// === 🚀 Realtime Listener Configuration ===
function initLiveSync() {
  // LocalStorage ထံမှ လက်ရှိ Login ဝင်ထားသော User ၏ FPL Team ID အား လှမ်းယူခြင်း
  const fplTeamId = localStorage.getItem("fplTeamId");
  const managerName = localStorage.getItem("managerName") || "My Team";

  if (!fplTeamId) {
    pitchEl.innerHTML = `<p class="text-center text-xs py-12 text-yellow-500 font-bold">⚠️ Dashboard တွင် FPL ID အား အရင်ချိတ်ဆက်ပေးပါဦးဗျာ။</p>`;
    return;
  }

  userTeamEl.textContent = managerName;

  // 📡 Listen 1: Realtime User Live Team Picks & Squad Listener
  onSnapshot(doc(db, "liveTeams", String(fplTeamId)), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      renderLeagueStylePitch(data.picks || []);
    } else {
      pitchEl.innerHTML = `<p class="text-center text-xs py-12 text-white/40">GW${CURRENT_WEEK} စတင်ရန် စောင့်ဆိုင်းနေဆဲဖြစ်ပါသည်ဗျာ</p>`;
    }
  });

  // 📡 Listen 2: Realtime Points & Rank Summary Listener
  onSnapshot(doc(db, "livePoints", String(fplTeamId)), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      
      gwPointsEl.textContent = data.gwPoints ?? "—";
      gwRankEl.textContent = data.gwRank ? Number(data.gwRank).toLocaleString() : "—";
      overallPtsEl.textContent = data.totalPoints ?? "—";
      overallRankEl.textContent = data.overallRank ? Number(data.overallRank).toLocaleString() : "—";
      captainPtsEl.textContent = data.captainPoints ? `${data.captainPoints} pts` : "—";
      hitLabelEl.textContent = `Hit: -${data.transferCost || 0}`;

      if (data.activeChip) {
        chipBadgeEl.textContent = String(data.activeChip).toUpperCase();
        chipBadgeEl.style.background = "rgba(220,38,38,0.2)";
        chipBadgeEl.style.borderColor = "#dc2626";
        chipBadgeEl.style.color = "#ffffff";
      } else {
        chipBadgeEl.textContent = "NO CHIP";
        chipBadgeEl.style.background = "rgba(201,168,76,0.15)";
        chipBadgeEl.style.borderColor = "rgba(201,168,76,0.4)";
        chipBadgeEl.style.color = "#C9A84C";
      }
    }
  });
}

// Run Engine
initLiveSync();
