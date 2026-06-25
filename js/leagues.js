import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let league1Data = [];
let league2Data = [];
let sortMode = "total"; 
let unsubscribePopup = null;

const CHIP_LABELS = { "3xc": "TC", "bboost": "BB", "wildcard": "WC", "freehit": "FH", "manager": "AM" };

// 📡 Firebase Standings Listeners
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }

  onSnapshot(query(collection(db, "leagues", "league1", "standings")), (snapshot) => {
    league1Data = [];
    snapshot.forEach(d => league1Data.push({ id: d.id, ...d.data() }));
    renderTable("league1");
  });

  onSnapshot(query(collection(db, "leagues", "league2", "standings")), (snapshot) => {
    league2Data = [];
    snapshot.forEach(d => league2Data.push({ id: d.id, ...d.data() }));
    renderTable("league2");
  });
});

function chipBadge(chipCode) {
  if (!chipCode || !CHIP_LABELS[chipCode]) return "";
  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:rgba(201,168,76,0.25);color:#C9A84C;margin-left:4px;">${CHIP_LABELS[chipCode]}</span>`;
}

function hitBadge(hitCost) {
  if (!hitCost || hitCost === 0) return "";
  return `<span class="text-[9px] font-bold" style="color:#f87171;margin-left:4px;">(-${hitCost})</span>`;
}

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

// 🏟️ Pop-up Engine (Standings document single reader)
window.openTeamPopup = (leagueId, fplID, teamName) => {
  const modal = document.getElementById("team-popup-modal");
  modal.style.display = "flex";
  
  document.getElementById("modal-team-title").textContent = teamName;
  document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50 font-medium tracking-wide">Team loading...</p>`;
  document.getElementById("popup-bench-row").innerHTML = "";

  const cleanID = String(fplID).trim();
  const docRef = doc(db, "leagues", leagueId, "standings", cleanID);

  unsubscribePopup = onSnapshot(docRef, (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    
    document.getElementById("modal-gw-pts").textContent = data.gwPoints ?? "0";
    document.getElementById("modal-total-pts").textContent = data.points ?? "0";
    document.getElementById("modal-hit-cost").textContent = "-" + (data.hitCost || 0);
    document.getElementById("modal-chip-badge").textContent = data.chip && CHIP_LABELS[data.chip] ? CHIP_LABELS[data.chip] : "NO CHIP";

    if (data.picks && Array.isArray(data.picks)) {
      renderPopupPitch(data.picks);
    } else {
      document.getElementById("popup-pitch-rows").innerHTML = `<div class="w-full text-center py-20 text-xs text-red-400">လူစာရင်း ဒေတာ မတွေ့ရှိပါဗျာ</div>`;
    }
  });
};

window.closeTeamPopup = () => {
  if (unsubscribePopup) { unsubscribePopup(); unsubscribePopup = null; }
  document.getElementById("team-popup-modal").style.display = "none";
};

function jerseyPath(p) {
  // 💡 Safeguard: Position စာလုံးအကြီးအသေး ဘယ်လိုလာလာ အော်တို အသေးပြောင်းလဲပြီး ဂျာစီ Folder လမ်းကြောင်းခွဲခြားခြင်း
  const posClean = String(p.position || "").toUpperCase().trim(); //
  const folder = posClean === "GK" ? "gk" : "outfield"; //
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); //
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; //
}

function buildPlayerCard(p) {
  // multiplier စစ်ဆေးချက်
  const multRaw = p.multiplier !== undefined ? p.multiplier : (p.multiplier !== undefined ? p.multiplier : 1);
  const mult = Number(multRaw);
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); //
  
  // 💡 Safeguard: isCaptain နှင့် isVice ဒေတာအမျိုးအစား (Boolean / String) နှစ်မျိုးလုံးအတွက် စိတ်ချရအောင် စစ်ဆေးခြင်း
  const isCap = p.isCaptain === true || p.isCaptain === "true" || mult > 1;
  const isVc = p.isVice === true || p.isVice === "true";
  
  const cornerBadge = mult === 3
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">3x</span>' //
    : isCap
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#F0D060] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">C</span>' //
    : isVc
    ? '<span class="absolute -top-1.5 -right-1.5 bg-[#C0C0C0] text-[#0D2B1A] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md z-20">V</span>' //
    : '';

  return `
    <div class="w-[72px] sm:w-[82px] flex flex-col items-center relative transition active:scale-95">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-1 overflow-visible relative" style="background:#1F5C36; border:2px solid ${isCap ? '#F0D060' : isVc ? '#C0C0C0' : '#2A7A47'};">
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

function renderPopupPitch(picks) {
  const checkMult = (p) => p.multiplier !== undefined ? p.multiplier : (p.multiplier !== undefined ? p.multiplier : 1);
  
  const starters = picks.filter(p => Number(checkMult(p)) > 0); 
  const subs = picks.filter(p => Number(checkMult(p)) === 0); 
  
  // 💡 Safeguard: Position စာလုံးအကြီးအသေး နှစ်မျိုးလုံးဖြစ်နိုင်သဖြင့် .toUpperCase() ပြောင်းလဲ၍ တန်းစီစနစ်တကျ ခွဲထုတ်ခြင်း
  const gk = starters.filter(p => String(p.position || "").toUpperCase().trim() === "GK"); //
  const def = starters.filter(p => String(p.position || "").toUpperCase().trim() === "DEF"); //
  const mid = starters.filter(p => String(p.position || "").toUpperCase().trim() === "MID"); //
  const fwd = starters.filter(p => String(p.position || "").toUpperCase().trim() === "FWD"); //

  const renderRow = (players) => `
    <div class="flex justify-center items-center gap-x-2 w-full">
      ${players.map(buildPlayerCard).join("")}
    </div>
  `;

  document.getElementById("popup-pitch-rows").innerHTML = `
    <div class="flex flex-col justify-between h-full py-1 space-y-4">
      ${renderRow(gk)}
      ${renderRow(def)}
      ${renderRow(mid)}
      ${renderRow(fwd)}
    </div>`;

  document.getElementById("popup-bench-row").innerHTML = subs.map(buildPlayerCard).join("");
}

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
