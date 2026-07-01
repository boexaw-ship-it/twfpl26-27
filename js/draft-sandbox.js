let localMarketCache = [];
let localSquadState = [];
let activeSwapId = null;
let activeSwapPosition = null;
let currentMarketSortKey = "form"; 

export function loadCachedDraftSquad(key) {
  const data = localStorage.getItem(key);
  if (data) {
    localSquadState = JSON.parse(data);
    return localSquadState;
  }
  return null;
}

export function saveDraftSquadToMemory(key, squad) {
  localSquadState = squad;
  localStorage.setItem(key, JSON.stringify(squad));
}

export function syncDraftMarketCollection(playersArray) {
  localMarketCache = playersArray;
  executeMarketRender();
}

/**
 * 🔒 FPL REGULATION: BUDGET TRACKER LOGIC
 */
function evaluateSquadBudgetMetrics() {
  let totalCost = 0;
  localSquadState.forEach(p => { totalCost += parseFloat(p.price || 0); });
  
  const remainingBank = 100.0 - totalCost;
  
  const bankLabel = document.getElementById("budget-bank-label");
  const costLabel = document.getElementById("budget-total-cost");
  
  if (bankLabel) {
    bankLabel.textContent = `£${remainingBank.toFixed(1)}m`;
    bankLabel.style.color = remainingBank >= 0 ? "#22c55e" : "#ef4444";
  }
  if (costLabel) {
    costLabel.textContent = `Squad Cost: £${totalCost.toFixed(1)}m / £100.0m`;
  }
}

/**
 * 🔄 ACTIVATE SWAP MODE
 */
window.activatePlayerSwapMode = (playerId, name, position) => {
  activeSwapId = playerId;
  activeSwapPosition = position.toLowerCase().trim();
  
  const marketTitle = document.getElementById("market-scout-title");
  if (marketTitle) {
    marketTitle.innerHTML = `🔄 SWAP ${position.toUpperCase()}: <span class="text-yellow-400 font-black">${name}</span>`;
  }
  
  executeMarketRender();
  const segMarketBtn = document.getElementById("seg-ownership");
  if (segMarketBtn) segMarketBtn.click();
};

/**
 * 🛒 MARKET SELECTION WITH BUDGET CONSTRAINT CHECK
 */
window.executeMarketPlaceSelection = (newPlayerDocId) => {
  if (!activeSwapId) return;

  const newPlayerData = localMarketCache.find(p => String(p.id) === String(newPlayerDocId));
  if (!newPlayerData) return;

  const oldPlayerIndex = localSquadState.findIndex(p => String(p.playerId) === String(activeSwapId));
  if (oldPlayerIndex === -1) return;

  const oldPlayer = localSquadState[oldPlayerIndex];

  // 🔒 1. POSITION ENFORCEMENT GUARD
  if (String(newPlayerData.position).toLowerCase() !== activeSwapPosition) {
    alert(`FPL Regulation Error: ${activeSwapPosition.toUpperCase()} နေရာတွင် ${newPlayerData.position.toUpperCase()} လူစားလဲခွင့်မရှိပါဗျာ။`);
    return;
  }

  // 🔒 2. FINANCIAL REGULATION BUDGET GUARD
  let provisionalCost = 0;
  localSquadState.forEach((p, idx) => {
    if (idx === oldPlayerIndex) provisionalCost += parseFloat(newPlayerData.price || 0);
    else provisionalCost += parseFloat(p.price || 0);
  });

  if (provisionalCost > 100.0) {
    alert(`Budget Violation: အသင်းတန်ဖိုး စုစုပေါင်း £${provisionalCost.toFixed(1)}m ဖြစ်သွားသဖြင့် FPL ခွင့်ပြုချက် £100.0m ထက် ကျော်လွန်နေပါသည်ဗျာ။`);
    return;
  }

  // Rules approved -> Swap data structure arrays
  localSquadState[oldPlayerIndex] = {
    ...oldPlayer,
    playerId: newPlayerData.playerId,
    name: newPlayerData.name,
    price: newPlayerData.price,
    ownership: newPlayerData.ownership,
    form: newPlayerData.form || 0,
    totalPoints: newPlayerData.totalPoints || 0,
    gwPoints: newPlayerData.gwPoints || 0
  };

  // Update Progress bars
  const outBar = document.getElementById("template-out-bar");
  const inBar = document.getElementById("template-in-bar");
  if (outBar && inBar) {
    document.getElementById("template-out-label").textContent = `Out: ${oldPlayer.ownership}%`;
    document.getElementById("template-in-label").textContent = `In: ${newPlayerData.ownership}%`;
    outBar.style.width = `${oldPlayer.ownership}%`;
    inBar.style.width = `${newPlayerData.ownership}%`;
  }

  const cacheKey = Object.keys(localStorage).find(k => k.startsWith("twf_draft_squad_"));
  if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(localSquadState));

  renderUserSquadList(localSquadState);
  calculateTeamShieldTracker(localSquadState);

  activeSwapId = null; activeSwapPosition = null;
  document.getElementById("market-scout-title").textContent = "Market Filters";
  document.getElementById("seg-squad").click();
};

window.updateMarketSorting = (key) => {
  currentMarketSortKey = key;
  executeMarketRender();
};

window.resetDraftToFPLRealtime = () => {
  const cacheKey = Object.keys(localStorage).find(k => k.startsWith("twf_draft_squad_"));
  if (cacheKey) {
    localStorage.removeItem(cacheKey);
    alert("🎉 Budget စည်းကမ်းချက်များနှင့် လူစာရင်းများအားလုံး FPL Official Live အတိုင်း ပြန်လည် Reset/Sync ပြီးစီးပါပြီဗျာ!");
    window.location.reload();
  }
};

export function sortSquadByFPLFormat(squadArray) {
  const gk = []; const def = []; const mid = []; const fwd = [];
  squadArray.forEach(p => {
    const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") gk.push(p);
    else if (pos === "DEF") def.push(p);
    else if (pos === "MID") mid.push(p);
    else if (pos === "FWD") fwd.push(p);
  });
  return [...gk, ...def, ...mid, ...fwd];
}

export function renderUserSquadList(squadArray) {
  let html = "";
  squadArray.forEach((p, idx) => {
    let posBg = "#15803d"; const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") posBg = "#1d4ed8"; else if (pos === "DEF") posBg = "#9f1239"; else if (pos === "MID") posBg = "#b45309";

    html += `
      <div class="rounded-xl p-3 flex items-center justify-between bg-[#124c2a] border border-[#1e6a3c]">
        <div class="flex items-center gap-3">
          <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${idx + 1}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-black text-white" style="background:${posBg};">${pos}</span>
            <div>
              <p class="text-white text-sm font-semibold truncate max-w-[110px] sm:max-w-[160px]">${p.name || '—'}</p>
              <p class="text-[9px] text-[#3A9E5F]">Pts: ${p.totalPoints || 0} | Form: ${p.form || 0}</p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 text-right">
          <div>
            <p class="font-bold text-[#C9A84C] font-mono text-sm">£${parseFloat(p.price || 0).toFixed(1)}m</p>
            <p class="text-[9px] text-[#E8D5A3]">${p.ownership || 0}% owned</p>
          </div>
          <button onclick="window.activatePlayerSwapMode('${p.playerId}', '${p.name.replace(/'/g, "\\'")}', '${pos}')" class="w-7 h-8 rounded-lg bg-black/30 border border-[#1e6a3c] flex items-center justify-center text-xs">🔄</button>
        </div>
      </div>`;
  });
  document.getElementById("my-squad-list").innerHTML = html;
  evaluateSquadBudgetMetrics();
}

/**
 * 🛒 COMPACT PREMIUM MARKETPLACE CARD VIEW ENGINE
 */
function executeMarketRender() {
  let filtered = [...localMarketCache];
  
  // Position active filter alignment
  if (activeSwapPosition) {
    filtered = filtered.filter(p => String(p.position).toLowerCase() === activeSwapPosition);
  }

  // Sort logic re-mapping
  filtered.sort((a, b) => {
    if (currentMarketSortKey === "price") return parseFloat(b.price || 0) - parseFloat(a.price || 0);
    if (currentMarketSortKey === "ownership") return parseFloat(b.ownership || 0) - parseFloat(a.ownership || 0);
    if (currentMarketSortKey === "points") return parseInt(b.totalPoints || 0) - parseInt(a.totalPoints || 0);
    return parseFloat(b.form || 0) - parseFloat(a.form || 0); // default form sort
  });

  // UI Button Active indicators update
  ["form", "points", "price", "ownership"].forEach(k => {
    const btn = document.getElementById("msort-" + k);
    if (btn) {
      if (k === currentMarketSortKey) {
        btn.style.background = "rgba(201,168,76,0.25)"; btn.style.borderColor = "#C9A84C"; btn.style.color = "#C9A84C";
      } else {
        btn.style.background = "rgba(0,0,0,0.2)"; btn.style.borderColor = "rgba(58,158,95,0.3)"; btn.style.color = "#ffffff";
      }
    }
  });

  let html = "";
  filtered.slice(0, 25).forEach((p) => {
    let posBg = "#15803d"; const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") posBg = "#1d4ed8"; else if (pos === "DEF") posBg = "#9f1239"; else if (pos === "MID") posBg = "#b45309";

    html += `
      <div class="rounded-xl p-3 bg-[#124c2a] border border-[#1e6a3c]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[9px] px-1.5 py-0.5 rounded-full font-black text-white" style="background:${posBg};">${pos}</span>
            <p class="text-white text-xs font-bold truncate max-w-[120px]">${p.name || '—'}</p>
          </div>
          <div class="flex items-center gap-2">
            <p class="font-bold text-[#C9A84C] text-xs font-mono">£${parseFloat(p.price || 0).toFixed(1)}m</p>
            <button onclick="window.executeMarketPlaceSelection('${p.id}')" class="px-2 py-0.5 text-[9px] font-black rounded bg-black/40 border border-[#C9A84C]/30 text-[#C9A84C] active:bg-[#C9A84C]/20">+ USE</button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1 mt-2 pt-1.5 border-t border-white/5 text-[9px] text-gray-400 text-center">
          <div>Form: <span class="text-white font-bold">${p.form ?? 0}</span></div>
          <div>Total Pts: <span class="text-[#C9A84C] font-bold">${p.totalPoints ?? 0}</span></div>
          <div>Week Pts: <span class="text-yellow-500 font-bold">${p.gwPoints ?? 0}</span></div>
          <div>Owned: <span class="text-white font-bold">${p.ownership ?? 0}%</span></div>
        </div>
      </div>`;
  });
  
  document.getElementById("ownership-list").innerHTML = html || `<p class="text-center text-xs py-12 text-gray-400">လဲလှယ်ရန် နေရာတူ ကစားသမား မတွေ့ရှိပါဗျာ။</p>`;
}

export function calculateTeamShieldTracker(squadArray) {
  if (!squadArray || squadArray.length === 0) return;
  let totalOwnership = 0; squadArray.forEach(p => { totalOwnership += parseFloat(p.ownership || 0); });
  renderTeamShieldTracker(totalOwnership / squadArray.length);
}
