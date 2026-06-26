import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 📡 Firebase User Authentication & Real-time Live Watchers
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }
  
  const fplId = snap.data().fplTeamId;
  document.getElementById("team-name").textContent = snap.data().teamName;

  // 1. liveTeams Collection Watcher
  onSnapshot(doc(db, "liveTeams", fplId), (d) => {
    if (d.exists()) renderTeam(d.data());
  });

  // 2. livePoints Collection Watcher
  onSnapshot(doc(db, "livePoints", fplId), (d) => {
    if (!d.exists()) return;
    document.getElementById("gw-label").textContent = "GW " + (d.data().gameweek ?? "—");
    document.getElementById("gw-pts").textContent = d.data().gwPoints ?? "—";
    
    const overallRank = d.data().overallRank;
    document.getElementById("overall-rank-box").textContent = overallRank ? overallRank.toLocaleString() : "—";
    
    const hit = d.data().transferCost || 0;
    document.getElementById("hit-label").textContent = "Hit: -" + hit;
    
    const chip = d.data().activeChip;
    document.getElementById("chip-badge").textContent = chip ? chip : "NO CHIP";
  });
});

// 👕 ဂျာစီပုံရိပ်လမ်းကြောင်း ရယူခြင်း
function jerseyPath(p) {
  const posClean = String(p.position || "").toLowerCase().trim();
  const folder = posClean === "gk" ? "gk" : "outfield";
  const code = String(p.teamCode || "unknown").toLowerCase().trim();
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`;
}

// 🏆 Official FPL Style Plate Design (Bigger & Lower Margin Jersey Variant)
function playerCard(p, isCaptain = false, isVice = false) {
  const mult = p.multiplier || 1;
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1);
  
  // Corner Badges (C / V / 3x) နေရာချစနစ်
  const cornerBadge = mult === 3
    ? '<span class="absolute top-0 -right-1 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">3x</span>'
    : p.isCaptain || isCaptain
    ? '<span class="absolute top-0 -right-1 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">C</span>'
    : p.isVice || isVice
    ? '<span class="absolute top-0 -right-1 bg-[#C0C0C0] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">V</span>'
    : '';

  // Captain & Vice Captain အတွက် ပိုမိုကြီးမားသော ဂျာစီအောက်ခြေ highlight အောက်ခံမျဉ်းလေး
  const borderHighlight = (isCaptain || p.isCaptain) ? 'border-b-[3px] border-b-[#F0D060]' : (isVice || p.isVice) ? 'border-b-[3px] border-b-[#C0C0C0]' : '';

  return `
    <div class="w-[68px] sm:w-[78px] flex flex-col items-center relative transition active:scale-95">
      
      <!-- 👕 💡 FIX: ဂျာစီအား (w-14 h-14) မှ (w-[60px] h-[60px]) သို့ ထပ်မံချဲ့ပေးပြီး၊ mb-1 ကို mb-[2px] သို့ လျှော့ချကာ Name Card အထက်နားသို့ တိုးကပ်ထားပါသည် -->
      <div class="w-[60px] h-[60px] flex items-center justify-center mb-[2px] overflow-visible relative ${borderHighlight}">
        <img src="${jerseyPath(p)}"
             onerror="this.outerHTML='<div class=\\'w-full h-10 flex items-center justify-center text-xl\\'>👕</div>'"
             class="w-full h-full object-contain drop-shadow-md" alt="${p.name}" />
        ${cornerBadge}
      </div>

      <!-- 📛 🔢 နာမည်ပြားနှင့် လေးထောင့်အမဲရောင် အမှတ်ပြား ပူးတွဲစနစ် -->
      <div class="w-full flex flex-col rounded overflow-hidden shadow-md" style="box-shadow: 0 3px 6px rgba(0,0,0,0.25);">
        <!-- အပေါ်ခြမ်း: ကစားသမား အမည်ပြား (ဖြူဖြူလေးထောင့်) -->
        <div class="w-full bg-white px-0.5 py-0.5 text-center flex items-center justify-center" style="height:17px;">
          <p class="text-[#0D2B1A] font-black text-[8.5px] leading-none tracking-tight truncate w-full">${p.name || "?"}</p>
        </div>
        <!-- အောက်ခြမ်း: ကစားသမား အမှတ်ပြား (လေးထောင့်အမဲတုံးစစ်စစ်) -->
        <div class="w-full bg-[#000000] text-white text-center flex items-center justify-center font-black text-[10px]" style="height:16px;">
          ${displayPoints}
        </div>
      </div>

    </div>
  `;
}

// Starters ၁၁ ယောက်နှင့် Bench ၄ ယောက် ခွဲထုတ်၍ Formation ပုံဖော်ခြင်း
function renderTeam(data) {
  const picks = data.picks || [];
  
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0);
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0);
  
  const gk = starters.filter(p => String(p.position || "").toLowerCase().trim() === "gk");
  const def = starters.filter(p => String(p.position || "").toLowerCase().trim() === "def");
  const mid = starters.filter(p => String(p.position || "").toLowerCase().trim() === "mid");
  const fwd = starters.filter(p => String(p.position || "").toLowerCase().trim() === "fwd");

  const renderRow = (players) => `
    <div class="flex justify-center items-center gap-x-2.5 w-full">
      ${players.map(p => playerCard(p, p.isCaptain, p.isVice)).join("")}
    </div>
  `;

  // Pitch Field rows
  document.getElementById("pitch-rows").innerHTML = `
    <div class="flex flex-col justify-between h-full py-1 space-y-4">
      ${renderRow(gk)}
      ${renderRow(def)}
      ${renderRow(mid)}
      ${renderRow(fwd)}
    </div>`;

  // Bench Area
  document.getElementById("bench-row").innerHTML = subs.map(p => {
    const posLabel = String(p.position || "").toUpperCase();
    return `
      <div class="flex flex-col items-center gap-y-1">
        <span class="text-[9px] font-black text-[#E8D5A3] uppercase opacity-75">${posLabel}</span>
        ${playerCard(p, p.isCaptain, p.isVice)}
      </div>
    `;
  }).join("");
}
