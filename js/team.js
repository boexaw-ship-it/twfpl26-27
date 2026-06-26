import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 📡 Firebase User Authentication & Real-time Live Watchers
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; } //
  const snap = await getDoc(doc(db, "users", user.uid)); //
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; } //
  
  const fplId = snap.data().fplTeamId; //
  document.getElementById("team-name").textContent = snap.data().teamName; //

  // 1. liveTeams Collection အား နားထောင်ပြီး ကွင်းပြင် Formation ဆွဲသားခြင်း
  onSnapshot(doc(db, "liveTeams", fplId), (d) => {
    if (d.exists()) renderTeam(d.data()); //
  });

  // 2. livePoints Collection အား နားထောင်ပြီး ရမှတ်နှင့် Status Display များ တပ်ဆင်ခြင်း
  onSnapshot(doc(db, "livePoints", fplId), (d) => {
    if (!d.exists()) return; //
    document.getElementById("gw-label").textContent = "GW " + (d.data().gameweek ?? "—"); //
    document.getElementById("gw-pts").textContent = d.data().gwPoints ?? "—"; //
    
    // Overall Rank Box တန်ဖော်မတ်အား နေရာချခြင်း
    const overallRank = d.data().overallRank; //
    document.getElementById("overall-rank-box").textContent = overallRank ? overallRank.toLocaleString() : "—"; //
    
    const hit = d.data().transferCost || 0; //
    document.getElementById("hit-label").textContent = "Hit: -" + hit; //
    
    const chip = d.data().activeChip; //
    document.getElementById("chip-badge").textContent = chip ? chip : "NO CHIP"; //
  });
});

// 👕 🎨 ဂျာစီပုံရိပ်များ၏ ပတ်လမ်းကြောင်းအား စာလုံးအသေးစနစ်ဖြင့် ရယူခြင်း
function jerseyPath(p) {
  // weekly-live-sync.js နှင့် ကိုက်ညီစေရန် position တန်ဖိုးအား lowercase ပြောင်း၍ gk ခွဲခြားခြင်း
  const posClean = String(p.position || "").toLowerCase().trim(); 
  const folder = posClean === "gk" ? "gk" : "outfield"; //
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); //
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; //
}

// 📛 Player Card ကတ်ပြားဒီဇိုင်းပုံစံစစ်စစ် (Absolute Badge & Point Rendering)
function playerCard(p, isCaptain = false, isVice = false) {
  const mult = p.multiplier || 1; //
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); //
  
  // 💡 Corner Captain/Vice Badge များ နေရာမှန်ကန်အောင် absolute style ဖြင့် ပြင်ဆင်ခြင်း
  const cornerBadge = mult === 3
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">3x</span>' //
    : p.isCaptain || isCaptain
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">C</span>' //
    : p.isVice || isVice
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#C0C0C0] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">V</span>' //
    : '';

  // ကပ္ပတိန်အဆင့်အတန်းအလိုက် ဘောင်အရောင်များ သတ်မှတ်ခြင်း
  const borderColor = (isCaptain || p.isCaptain) ? '#F0D060' : (isVice || p.isVice) ? '#C0C0C0' : '#2A7A47'; //

  return `
    <div class="w-[72px] sm:w-[82px] flex flex-col items-center relative transition active:scale-95">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-1 overflow-visible relative" style="background:#1F5C36; border:2px solid ${borderColor};">
        <img src="${jerseyPath(p)}"
             onerror="this.outerHTML='<div class=\\'w-full h-10 flex items-center justify-center text-xl\\'>👕</div>'"
             class="w-9 h-9 object-contain" alt="${p.name}" />
        ${cornerBadge}
      </div>

      <div class="w-full bg-white px-1 py-0.5 rounded shadow text-center flex items-center justify-center" style="min-height:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        <p class="text-[#0D2B1A] font-bold text-[9px] leading-[1.1] tracking-tight truncate w-full">${p.name || "?"}</p>
      </div>

      <div class="player-point-circle">${displayPoints}</div>
    </div>
  `;
}

// 🪑 🏟️ Starters ၁၁ ယောက်နှင့် Bench ၄ ယောက် ခွဲထုတ်၍ Formation ပုံဖော်ခြင်း
function renderTeam(data) {
  const picks = data.picks || []; //
  
  // multiplier ဂဏန်းစစ်ဆေးချက်အရ ပွဲထွက်နှင့် အရန်ခုံ တိကျစွာ ခွဲခြားခြင်း
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0); //
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0); //
  
  // 💡 weekly-live-sync.js ၏ ဒေတာအဝင်အတိုင်း စာလုံးအသေး (gk, def, mid, fwd) ဖြင့် အုပ်စုခွဲခြားခြင်း
  const gk = starters.filter(p => String(p.position || "").toLowerCase().trim() === "gk"); //
  const def = starters.filter(p => String(p.position || "").toLowerCase().trim() === "def"); //
  const mid = starters.filter(p => String(p.position || "").toLowerCase().trim() === "mid"); //
  const fwd = starters.filter(p => String(p.position || "").toLowerCase().trim() === "fwd"); //

  const renderRow = (players) => `
    <div class="flex justify-center items-center gap-x-2 w-full">
      ${players.map(p => playerCard(p, p.isCaptain, p.isVice)).join("")}
    </div>
  `; //

  // Pitch Field rows များထဲသို့ ထည့်သွင်းခြင်း
  document.getElementById("pitch-rows").innerHTML = `
    <div class="flex flex-col justify-between h-full py-1 space-y-4">
      ${renderRow(gk)}
      ${renderRow(def)}
      ${renderRow(mid)}
      ${renderRow(fwd)}
    </div>`; //

  // Bench အရန်ခုံ ၄ ယောက်အား သီးသန့် ထုတ်ပြခြင်း
  document.getElementById("bench-row").innerHTML = subs.map(p => playerCard(p, p.isCaptain, p.isVice)).join(""); //
}
