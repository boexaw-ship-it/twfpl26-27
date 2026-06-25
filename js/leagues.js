// =========================================================
// TW Fantasy — Leagues JavaScript Logic Engine
// =========================================================
import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let league1Data = [];
let league2Data = [];
let sortMode = "total"; 
let unsubscribePopup = null;

const CHIP_LABELS = { "3xc": "TC", "bboost": "BB", "wildcard": "WC", "freehit": "FH", "manager": "AM" };

// ၁။ Authentication & Real-time Standings Listener
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }

  // Subscribe League 1 Standings
  onSnapshot(query(collection(db, "leagues", "league1", "standings")), (snapshot) => {
    league1Data = [];
    snapshot.forEach(d => league1Data.push({ id: d.id, ...d.data() }));
    renderTable("league1");
  });

  // Subscribe League 2 Standings
  onSnapshot(query(collection(db, "leagues", "league2", "standings")), (snapshot) => {
    league2Data = [];
    snapshot.forEach(d => league2Data.push({ id: d.id, ...d.data() }));
    renderTable("league2");
  });
});

// ၂။ Chip & Hit Badges Renderers
function chipBadge(chipCode) {
  if (!chipCode || !CHIP_LABELS[chipCode]) return "";
  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:rgba(201,168,76,0.25);color:#C9A84C;margin-left:4px;">${CHIP_LABELS[chipCode]}</span>`;
}

function hitBadge(hitCost) {
  if (!hitCost || hitCost === 0) return "";
  return `<span class="text-[9px] font-bold" style="color:#f87171;margin-left:4px;">(-${hitCost})</span>`;
}

// ၃။ Render Standings Rank Table
function renderTable(firebaseId) {
  const data = firebaseId === "league1" ? league1Data : league2Data;
  const tableId = firebaseId === "league1" ? "league1-table" : "league2-table";
  const el = document.getElementById(tableId);

  if (data.length === 0) {
    el.innerHTML = `<p class="text-center text-xs py-6" style="color:#3A9E5F;">Data မရှိသေးပါ</p>`;
    return;
  }

  const sorted = [...data].sort((a, b) => {
    if (sortMode === "gw") return (b.gwPoints ?? 0) - (a.gwPoints ?? 0);
    return (b.points ?? 0) - (a.points ?? 0);
  });

  const rows = sorted.map((r, i) => ({ ...r, rank: i + 1 }));

  el.innerHTML = `
    <div class="flex items-center px-3 py-1.5 text-xs" style="color:#3A9E5F;border-bottom:1px solid #2A7A47;">
      <span class="w-6">#</span>
      <span class="flex-1">Team</span>
      <span class="w-12 text-center">GW</span>
      <span class="w-14 text-center font-bold" style="color:#C9A84C;">Total</span>
    </div>
    ${rows.map(r => `
    <div onclick="openTeamPopup('${firebaseId}', '${r.id}', '${r.teamName || '—'}')" class="flex items-center py-2.5 px-3 rounded-xl mb-1 cursor-pointer active:scale-[0.99] transition" style="background:${r.rank <= 3 ? 'rgba(201,168,76,0.1)' : '#1F5C36'};border:1px solid ${r.rank <= 3 ? 'rgba(201,168,76,0.3)' : '#2A7A47'};">
      <span class="text-sm font-bold w-6 text-center" style="color:${r.rank === 1 ? '#F0D060' : r.rank === 2 ? '#C0C0C0' : r.rank === 3 ? '#CD7F32' : '#3A9E5F'};">${r.rank}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-wrap">
          <span class="text-sm font-medium text-white truncate" style="max-width:120px;">${r.teamName || "—"}</span>
          ${chipBadge(r.chip)}
          ${hitBadge(r.hitCost)}
        </div>
      </div>
      <span class="w-12 text-center text-sm font-semibold ${sortMode === 'gw' ? 'text-yellow-400' : 'text-white'}">${r.gwPoints ?? 0}</span>
      <span class="w-14 text-center font-bold ${sortMode === 'total' ? '' : 'opacity-60'}" style="font-family:'Bebas Neue';font-size:1.1rem;color:#C9A84C;">${r.points ?? 0}</span>
    </div>`).join("")}
  `;
}

// ၄။ 🏟️ POP-UP REAL-TIME ENGINE
window.openTeamPopup = (leagueId, fplID, teamName) => {
  const modal = document.getElementById("team-popup-modal");
  modal.style.display = "flex";
  
  document.getElementById("modal-team-title").textContent = teamName;
  document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50 font-medium tracking-wide">Team loading...</p>`;
  document.getElementById("popup-bench-row").innerHTML = "";

  const docRef = doc(db, "leagues", leagueId, "standings", String(fplID).trim());
  unsubscribePopup = onSnapshot(docRef, (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    
    // Top Stats
    document.getElementById("modal-gw-pts").textContent = data.gwPoints ?? "0";
    document.getElementById("modal-total-pts").textContent = data.points ?? "0";
    document.getElementById("modal-hit-cost").textContent = "-" + (data.hitCost || 0);
    document.getElementById("modal-chip-badge").textContent = data.chip && CHIP_LABELS[data.chip] ? CHIP_LABELS[data.chip] : "NO CHIP";

    // Extract picks array correctly
    let finalPicks = [];
    if (data[fplID] && Array.isArray(data[fplID].picks)) {
      finalPicks = data[fplID].picks; // Nested
    } else if (data.picks && Array.isArray(data.picks)) {
      finalPicks = data.picks;
    }

    if (finalPicks && finalPicks.length > 0) {
      renderPopupPitch(finalPicks);
    } else {
      document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50">Team loading...</p>`;
    }
  });
};

window.closeTeamPopup = () => {
  if (unsubscribePopup) { unsubscribePopup(); unsubscribePopup = null; }
  document.getElementById("team-popup-modal").style.display = "none";
};

// ၅။ 🎨 ဂျာစီပုံရိပ်များ လမ်းကြောင်းသတ်မှတ်ခြင်း (`team.html` ပုံစံအတိုင်း `outfield` စာလုံးပေါင်းအမှန်)
function jerseyPath(p) {
  const folder = p.position === "GK" ? "gk" : "outfield"; //
  const code = p.teamCode || "unknown";
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; //
}

// ၆။ ကစားသမားကတ်ပြား HTML တည်ဆောက်ခြင်း (`team.html` အတိုင်း ကွက်တိ)
function buildPlayerCard(p) {
  const mult = p.multiplier || 1;
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); //
  const cornerBadge = mult === 3
    ? '<span class="absolute top-1 left-1 bg-[#1e1435] text-[#F0D060] text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-yellow-500/30 shadow-md z-20">3x</span>' //
    : p.isCaptain
    ? '<span class="absolute top-1 left-1 bg-[#1e1435] text-[#F0D060] text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-yellow-500/30 shadow-md z-20">C</span>' //
    : p.isVice
    ? '<span class="absolute top-1 left-1 bg-[#1e1435] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white/30 shadow-md z-20">V</span>' //
    : '';

  return `
    <div class="w-[68px] sm:w-[78px] bg-[#0d5e34]/50 border border-emerald-500/10 rounded-xl flex flex-col items-center relative p-1 pb-1 shadow-lg shadow-black/20 transition active:scale-95">
      ${cornerBadge}
      <div class="w-full h-14 sm:h-16 flex items-center justify-center mb-1 relative z-10 pt-1">
        <img src="${jerseyPath(p)}"
             onerror="this.outerHTML='<div class=\\'w-full h-12 flex items-center justify-center text-2xl\\'>👕</div>'"
             class="h-full object-contain filter drop-shadow-[0_4px_4px_rgba(0,0,0,0.45)]" alt="${p.name}" />
      </div>
      <div class="w-full bg-white px-1 py-1 rounded-t shadow-inner text-center relative z-10 flex items-center justify-center" style="min-height:24px;">
        <p class="text-[#0D2B1A] font-black text-[8px] sm:text-[9px] leading-[1.05] tracking-tight" style="word-break:break-word;">${p.name || "?"}</p>
      </div>
      <div class="w-full flex justify-center py-1 relative z-10">
        <span class="bg-black text-white text-[8px] sm:text-[9px] font-bold leading-none px-2 py-[3px] rounded-full">${displayPoints}</span>
      </div>
    </div>
  `;
}

// ၇။ ၅ တန်းကွင်းပြင်နှင့် အရန်ခုံ ခွဲခြားခြင်း
function renderPopupPitch(picks) {
  const starters = picks.filter(p => p.multiplier > 0); //
  const subs = picks.filter(p => p.multiplier === 0); //
  
  const gk = starters.filter(p => p.position === "GK"); //
  const def = starters.filter(p => p.position === "DEF"); //
  const mid = starters.filter(p => p.position === "MID"); //
  const fwd = starters.filter(p => p.position === "FWD"); //

  const renderRow = (players) => `
    <div class="flex justify-center items-center gap-x-1 sm:gap-x-2 w-full max-w-md mx-auto">
      ${players.map(buildPlayerCard).join("")}
    </div>
  `;

  document.getElementById("popup-pitch-rows").innerHTML = `
    <div class="flex flex-col justify-between h-full min-h-[390px] py-2 space-y-4">
      ${renderRow(gk)}
      ${renderRow(def)}
      ${renderRow(mid)}
      ${renderRow(fwd)}
    </div>`;

  document.getElementById("popup-bench-row").innerHTML = subs.map(buildPlayerCard).join("");
}

// ၈။ Tabs & Sorting Controls Toggles
window.switchTab = (tab) => {
  ["league1", "league2"].forEach(t => {
    const btn = document.getElementById("tab-" + t);
    if (t === tab) {
      btn.style.background = "linear-gradient(135deg,#C9A84C,#F0D060)";
      btn.style.color = "#0D2B1A";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#3A9E5F";
    }
    document.getElementById("panel-" + t).style.display = t === tab ? "block" : "none";
  });
};

window.switchSort = (mode) => {
  sortMode = mode;
  ["total", "gw"].forEach(m => {
    const btn = document.getElementById("sort-" + m);
    if (m === mode) {
      btn.style.background = "rgba(201,168,76,0.25)";
      btn.style.color = "#C9A84C";
      btn.style.borderColor = "#C9A84C";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#3A9E5F";
      btn.style.borderColor = "#2A7A47";
    }
  });
  renderTable("league1");
  renderTable("league2");
};
