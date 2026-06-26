import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allPlayers = [];
let currentFilter = "all";
let currentSort = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "/twfpl26-27/index.html"; return; }
  loadPlayers();
});

async function loadPlayers() {
  try {
    const snap = await getDocs(collection(db, "scoutPlayers"));
    allPlayers = [];
    snap.forEach(d => allPlayers.push(d.data()));
    
    // Default အနေဖြင့် ရမှတ်အများဆုံးလူများကို အပေါ်ဆုံးကပြထားရန်
    allPlayers.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    
    renderPlayers();
  } catch (err) {
    console.error("Error loading scout players:", err);
    document.getElementById("player-list").innerHTML = `<p class="text-center text-xs py-8" style="color:#ef4444;">Data ဆွဲယူမှု အမှားအယွင်းရှိနေပါသည်</p>`;
  }
}

function fdrColor(fdr) {
  const colors = { 1: "#22c55e", 2: "#84cc16", 3: "#eab308", 4: "#f97316", 5: "#ef4444" };
  return colors[fdr] || "#3A9E5F";
}

// 💡 အန်ကယ် ညွှန်ကြားထားသည့်အတိုင်း ကစားသမား ပိုဇီရှင်အလိုက် အရောင်သတ်မှတ်ချက်စနစ်သစ်
function getPositionBadgeColor(position) {
  const pos = String(position).toUpperCase();
  if (pos === 'GK') return '#1d4ed8';   // 🔵 GK = အပြာ
  if (pos === 'DEF') return '#dc2626';  // 🔴 DEF = အနီ
  if (pos === 'MID') return '#eab308';  // 🟡 MID = အဝါ (စာလုံးအမဲဖြင့် ပေါ်လွင်စေမည်)
  if (pos === 'FWD') return '#16a34a';  // 🟢 FWD = အစိမ်း
  return '#37003c';
}

function getFiltered() {
  let players = currentFilter === "all" ? allPlayers : allPlayers.filter(p => String(p.position).toLowerCase() === currentFilter);
  
  if (currentSort) {
    players = [...players].sort((a, b) => {
      if (currentSort === "price") return parseFloat(b.price || 0) - parseFloat(a.price || 0);
      if (currentSort === "ownership") return (b.ownership ?? 0) - (a.ownership ?? 0);
      if (currentSort === "points") return (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
      if (currentSort === "form") return (b.form ?? 0) - (a.form ?? 0);
      return 0;
    });
  }
  return players;
}

function renderPlayers() {
  const players = getFiltered();
  const el = document.getElementById("player-list");
  
  if (players.length === 0) {
    el.innerHTML = `<p class="text-center text-xs py-8" style="color:#3A9E5F;">ကိုက်ညီသည့် Player data မရှိသေးပါ</p>`;
    return;
  }
  
  el.innerHTML = players.map((p, i) => {
    const posUpper = String(p.position || "?").toUpperCase();
    const badgeColor = getPositionBadgeColor(posUpper);
    const textColor = posUpper === 'MID' ? '#0D2B1A' : '#ffffff'; // MID အဝါကွက်ထဲတွင် စာလုံးအမဲဖြင့် ပိုမိုထင်ရှားစေရန်
    
    return `
      <div onclick="window.openPlayerModal(${i})" class="rounded-xl p-3 mb-2 cursor-pointer active:scale-[0.98] transition" style="background:#1F5C36;border:1px solid #2A7A47;">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[9px] px-2 py-0.5 rounded-full font-black" style="background:${badgeColor}; color:${textColor};">${posUpper}</span>
            <div>
              <p class="text-white text-sm font-bold tracking-wide">${p.name || "—"}</p>
              <p class="text-xs" style="color:#E8D5A3; opacity:0.8;">${p.team || ""}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="font-bold" style="color:#C9A84C;font-family:'Bebas Neue';font-size:1.15rem;line-height:1.1;">£${p.price || 0}m</p>
            <p class="text-[10px]" style="color:#E8D5A3;opacity:0.8;">${p.ownership || 0}% owned</p>
          </div>
        </div>
        <div class="mt-2 pt-2 flex justify-between" style="border-top:1px solid rgba(42,122,71,0.5);">
          <span class="text-xs" style="color:#3A9E5F;">Form: <span class="text-white font-bold">${p.form ?? 0}</span></span>
          <span class="text-xs" style="color:#3A9E5F;">Total Pts: <span style="color:#C9A84C;font-weight:900;">${p.totalPoints || 0}</span></span>
        </div>
      </div>
    `;
  }).join("");
}

window.openPlayerModal = (index) => {
  const players = getFiltered();
  const p = players[index];
  if (!p) return;

  const posUpper = String(p.position || "—").toUpperCase();
  const badgeColor = getPositionBadgeColor(posUpper);
  const textColor = posUpper === 'MID' ? '#0D2B1A' : '#ffffff';

  document.getElementById("modal-name").textContent = p.fullName || p.name || "—";
  document.getElementById("modal-team").textContent = p.team || "Unknown Team";
  
  const posEl = document.getElementById("modal-position");
  posEl.textContent = posUpper;
  posEl.style.backgroundColor = badgeColor;
  posEl.style.color = textColor;

  document.getElementById("modal-price").textContent = "£" + (p.price || 0) + "m";
  document.getElementById("modal-ownership").textContent = (p.ownership || 0) + "%";
  document.getElementById("modal-points").textContent = p.totalPoints || 0;
  document.getElementById("modal-form").textContent = p.form ?? 0;

  const fixturesEl = document.getElementById("modal-fixtures");
  const matches = p.nextMatches || [];
  
  if (matches.length === 0) {
    fixturesEl.innerHTML = `<p class="text-center text-xs py-4" style="color:#3A9E5F;">Fixture ဇယားများ မရှိသေးပါ</p>`;
  } else {
    fixturesEl.innerHTML = matches.map(m => `
      <div class="flex items-center justify-between py-2 px-3 rounded-lg mb-1.5" style="background:#162F20;border:1px solid #2A7A47;">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/30" style="color:#C9A84C;">GW ${m.gw}</span>
          <span class="text-xs text-white font-semibold">${m.isHome ? "vs" : "@"} ${m.opponent}</span>
        </div>
        <span class="text-[10px] font-black px-2 py-0.5 rounded-md text-white" style="background:${fdrColor(m.fdr)};">FDR ${m.fdr}</span>
      </div>
    `).join("");
  }

  document.getElementById("player-modal").classList.remove("hidden");
  document.getElementById("player-modal").style.display = "flex";
};

window.closeModal = () => {
  document.getElementById("player-modal").classList.add("hidden");
  document.getElementById("player-modal").style.display = "none";
};

window.filterPos = (pos) => {
  currentFilter = pos.toLowerCase();
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.style.background = "transparent";
    b.style.borderColor = "rgba(201,168,76,0.3)";
  });
  
  const btn = document.getElementById("filter-" + pos.toLowerCase());
  btn.style.background = "rgba(201,168,76,0.25)";
  btn.style.borderColor = "#C9A84C";
  renderPlayers();
};

window.toggleSort = (sortKey) => {
  currentSort = currentSort === sortKey ? null : sortKey;
  
  document.querySelectorAll(".sort-btn").forEach(b => {
    b.style.background = "transparent";
    b.style.color = "#3A9E5F";
    b.style.borderColor = "#2A7A47";
  });
  
  if (currentSort) {
    const btn = document.getElementById("sort-" + sortKey);
    btn.style.background = "rgba(201,168,76,0.25)";
    btn.style.color = "#C9A84C";
    btn.style.borderColor = "#C9A84C";
  }
  renderPlayers();
};

