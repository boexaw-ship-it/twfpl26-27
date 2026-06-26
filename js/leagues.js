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
  return `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(201,168,76,0.25);color:#C9A84C;margin-left:4px;">${CHIP_LABELS[chipCode]}</span>`;
}

function hitBadge(hitCost) {
  if (!hitCost || hitCost === 0) return "";
  return `<span style="font-size:9px;font-weight:700;color:#f87171;margin-left:4px;">(-${hitCost})</span>`;
}

function renderTable(firebaseId) {
  const data = firebaseId === "league1" ? league1Data : league2Data;
  const tableId = firebaseId === "league1" ? "league1-table" : "league2-table";
  const el = document.getElementById(tableId);

  if (!el) return;
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
    <div onclick="openTeamPopup('${firebaseId}', '${r.fplTeamId}', '${(r.teamName || '—').replace(/'/g, "\\'")}')"
         class="flex items-center py-2.5 px-3 rounded-xl mb-1 cursor-pointer active:scale-[0.99] transition"
         style="background:${r.rank <= 3 ? 'rgba(201,168,76,0.1)' : '#1F5C36'};border:1px solid ${r.rank <= 3 ? 'rgba(201,168,76,0.3)' : '#2A7A47'};">
      <span class="text-sm font-bold w-6 text-center" style="color:${r.rank === 1 ? '#F0D060' : r.rank === 2 ? '#C0C0C0' : r.rank === 3 ? '#CD7F32' : '#3A9E5F'};">${r.rank}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-wrap">
          <span class="text-sm font-medium text-white truncate" style="max-width:140px;">${r.teamName || "—"}</span>
          ${chipBadge(r.chip)}
          ${hitBadge(r.hitCost)}
        </div>
      </div>
      <span class="w-12 text-center text-sm font-semibold ${sortMode === 'gw' ? 'text-yellow-400' : 'text-white'}">${r.gwPoints ?? 0}</span>
      <span class="w-14 text-center font-bold ${sortMode === 'total' ? '' : 'opacity-60'}" style="font-family:'Bebas Neue';font-size:1.1rem;color:#C9A84C;">${r.points ?? 0}</span>
    </div>`).join("")}
  `;
}

// 💡 POP-UP ENGINE (STANDINGS COLLECTION DIRECT CONNECTOR)
window.openTeamPopup = (leagueId, fplTeamId, teamName) => {
  const modal = document.getElementById("team-popup-modal");
  modal.style.display = "flex";

  document.getElementById("modal-team-title").textContent = teamName;
  document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50 font-medium">Team loading...</p>`;
  document.getElementById("popup-bench-row").innerHTML = "";

  if (unsubscribePopup) { unsubscribePopup(); unsubscribePopup = null; }

  const docRef = doc(db, "leagues", leagueId, "standings", String(fplTeamId));
  
  unsubscribePopup = onSnapshot(docRef, (snap) => {
    if (!snap.exists()) {
      document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50">ဒေတာ မရှိသေးပါဗျာ</p>`;
      return;
    }
    const d = snap.data();
    
    document.getElementById("modal-gw-pts").textContent = d.gwPoints ?? "0";
    document.getElementById("modal-total-pts").textContent = d.points ?? "0";
    document.getElementById("modal-hit-cost").textContent = "-" + (d.hitCost || 0);
    document.getElementById("modal-chip-badge").textContent = d.chip && CHIP_LABELS[d.chip] ? CHIP_LABELS[d.chip] : "NO CHIP";

    const picks = d.picks || [];
    if (picks.length > 0) {
      renderPopupPitch(picks);
    } else {
      document.getElementById("popup-pitch-rows").innerHTML = `<p class="text-center text-xs py-24 text-white/50">လူစာရင်း ဒေတာ မတွေ့ရှိပါဗျာ</p>`;
    }
  });
};

window.closeTeamPopup = () => {
  if (unsubscribePopup) { unsubscribePopup(); unsubscribePopup = null; }
  document.getElementById("team-popup-modal").style.display = "none";
};

// Jersey path
function jerseyPath(p) {
  const folder = (p.position || "").toLowerCase() === "gk" ? "gk" : "outfield"; 
  const code = (p.teamCode || "unknown").toLowerCase(); 
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; 
}

// 💡 🏆 FIXED DESIGN: နာမည်ပြားအား လုံးဝသွားမဖုံးစေမည့် Official Square Name Plate စနစ်သစ်
function buildPlayerCard(p) {
  const mult = Number(p.multiplier) || 0; 
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); 

  let cornerBadge = ""; 
  if (p.multiplier === 3) { 
    cornerBadge = `<span style="position:absolute;top:-5px;right:-3px;background:#F0D060;color:#0D2B1A;font-size:8px;font-weight:900;width:16px;height:16px;border-radius:9999px;display:flex;align-items:center;justify-content:center;z-index:20;box-shadow:0 1px 3px rgba(0,0,0,0.4);">3x</span>`; 
  } else if (p.isCaptain || mult > 1) { 
    cornerBadge = `<span style="position:absolute;top:-5px;right:-3px;background:#F0D060;color:#0D2B1A;font-size:8px;font-weight:900;width:16px;height:16px;border-radius:9999px;display:flex;align-items:center;justify-content:center;z-index:20;box-shadow:0 1px 3px rgba(0,0,0,0.4);">C</span>`; 
  } else if (p.isVice) { 
    cornerBadge = `<span style="position:absolute;top:-5px;right:-3px;background:#C0C0C0;color:#0D2B1A;font-size:8px;font-weight:900;width:16px;height:16px;border-radius:9999px;display:flex;align-items:center;justify-content:center;z-index:20;box-shadow:0 1px 3px rgba(0,0,0,0.4);">V</span>`; 
  }

  // ဂျာစီအောက်ခြေ highlight border စနစ်
  const borderHighlight = (p.isCaptain || mult > 1) ? 'border-b-2 border-b-[#F0D060]' : p.isVice ? 'border-b-2 border-b-[#C0C0C0]' : ''; 

  return `
    <div style="width:64px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; position:relative;">
      ${cornerBadge}
      
      <div class="${borderHighlight}" style="width:44px; height:44px; display:flex; align-items:center; justify-content:center; margin-bottom:2px;">
        <img src="${jerseyPath(p)}"
             onerror="this.outerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;\\'>👕</div>'"
             style="width:100%; height:100%; object-fit:contain; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.3));" alt="${p.name}" />
      </div>
      
      <div style="width:100%; display:flex; flex-direction:column; rounded-sm; overflow:hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
        <div style="width:100%; background:white; padding:1px 2px; text-align:center; height:15px; display:flex; align-items:center; justify-content:center;">
          <p style="color:#0D2B1A; font-weight:900; font-size:7.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.1; w-full">${p.name || "?"}</p>
        </div>
        <div style="width:100%; background:#000000; color:#ffffff; text-align:center; height:14px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:9px;">
          ${displayPoints}
        </div>
      </div>
      
    </div>
  `;
}

// FIXED PITCH ENGINE (၅ ယောက်တန်းနှင့် အရန်လူ အပြတ်ခွဲထုတ်မှုစနစ်)
function renderPopupPitch(picks) {
  const starters = picks.filter(p => Number(p.multiplier ?? 0) > 0); 
  const subs = picks.filter(p => Number(p.multiplier ?? 0) === 0); 

  const gk  = starters.filter(p => (p.position || "").toLowerCase() === "gk"); 
  const def = starters.filter(p => (p.position || "").toLowerCase() === "def"); 
  const mid = starters.filter(p => (p.position || "").toLowerCase() === "mid"); 
  const fwd = starters.filter(p => (p.position || "").toLowerCase() === "fwd"); 

  const renderRow = (players) => {
    const gapSize = players.length >= 5 ? "4px" : "6px";
    return `
      <div style="display:flex; justify-content:center; align-items:center; gap:${gapSize}; width:100%; overflow:visible;">
        ${players.map(buildPlayerCard).join("")}
      </div>
    `;
  };

  document.getElementById("popup-pitch-rows").innerHTML = `
    <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%; padding:4px 0; gap:12px;">
      ${renderRow(gk)}
      ${renderRow(def)}
      ${renderRow(mid)}
      ${renderRow(fwd)}
    </div>`; 

  // All Team Bench Fix: အရန်လူ ၄ ယောက်စလုံးအား ပိုဇီရှင်တံဆိပ်လေးများဖြင့် သီးသန့် အပြတ်ခွဲပြသခြင်း
  document.getElementById("popup-bench-row").innerHTML = subs.map(p => {
    const posLabel = String(p.position || "").toUpperCase();
    return `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
        <span style="font-size:8px; font-weight:900; color:#E8D5A3; text-transform:uppercase; opacity:0.6;">${posLabel}</span>
        ${buildPlayerCard(p)}
      </div>
    `;
  }).join("");
}

// Window Toggles Modules
window.switchTab = (tab) => {
  ["league1", "league2"].forEach(t => {
    const btn = document.getElementById("tab-" + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.background = "linear-gradient(135deg,#C9A84C,#F0D060)";
      btn.style.color = "#0D2B1A";
      btn.style.border = "none";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#3A9E5F";
      btn.style.border = "1px solid #2A7A47";
    }
    const panel = document.getElementById("panel-" + t);
    if (panel) panel.style.display = t === tab ? "block" : "none";
  });
};

window.switchSort = (mode) => {
  sortMode = mode;
  ["total", "gw"].forEach(m => {
    const btn = document.getElementById("sort-" + m);
    if (!btn) return;
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
