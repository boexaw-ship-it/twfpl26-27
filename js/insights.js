import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Variables For Filter & Live Engine Cache
let allPlayersCache = [];
let currentLiveSquadState = []; 
let activeSwapId = null;  
let activeSwapPosition = null;
let currentMarketSortKey = "form"; 

/**
 * Main Strategic Router Engine
 */
export function initRealtimeInsights(uid) {
  
  // GW Current Header Watcher
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const fplId = userSnap.data().fplTeamId;
        const cacheKey = `twf_draft_squad_${fplId}`;
        
        // Load Phone Memory Sandbox Squad
        const savedData = localStorage.getItem(cacheKey);
        if (savedData) {
          currentLiveSquadState = JSON.parse(savedData);
          renderUserSquadList(currentLiveSquadState);
          calculateTeamShieldTracker(currentLiveSquadState);
          evaluateSquadBudgetMetrics();
          checkCaptaincyRiskRadar(); // Dynamic check
        } else {
          onSnapshot(doc(db, "liveTeams", fplId), async (squadSnap) => {
            if (squadSnap.exists()) {
              const teamData = squadSnap.data();
              const rawSquadArray = teamData.picks || teamData.players || [];
              
              if (rawSquadArray.length > 0) {
                const enrichedSquad = await Promise.all(rawSquadArray.map(async (playerItem) => {
                  const pIdStr = String(playerItem.playerId || ""); 
                  if (pIdStr) {
                    const pDoc = await getDoc(doc(db, "scoutPlayers", pIdStr));
                    if (pDoc.exists()) {
                      const m = pDoc.data();
                      return {
                        ...playerItem,
                        price: m.price || 0,
                        ownership: m.ownership || 0,
                        form: m.form || 0,
                        totalPoints: m.totalPoints || 0,
                        gwPoints: m.gwPoints || 0
                      };
                    }
                  }
                  return playerItem;
                }));

                currentLiveSquadState = sortSquadByFPLFormat(enrichedSquad);
                localStorage.setItem(cacheKey, JSON.stringify(currentLiveSquadState));
                
                renderUserSquadList(currentLiveSquadState);
                calculateTeamShieldTracker(currentLiveSquadState);
                evaluateSquadBudgetMetrics();
                checkCaptaincyRiskRadar();
              }
            }
          });
        }
      }
    });
  }

  // Real-time Scout Marketplace Synchronization
  onSnapshot(collection(db, "scoutPlayers"), (snap) => {
    allPlayersCache = [];
    snap.forEach(doc => {
      allPlayersCache.push({ id: doc.id, ...doc.data() });
    });
    executeMarketRender();
  });
}

/**
 * 👑 💡 🏆 CAPTAINCY RISK RADAR REAL-TIME EVALUATOR
 * User ရွေးချယ်လိုက်သော Captain ID အပေါ်မူတည်၍ Strategy Alert အော်တိုပြောင်းပေးသော စနစ်
 */
function checkCaptaincyRiskRadar() {
  const radarLabel = document.getElementById("captain-risk-text");
  if (!radarLabel) return;

  // လက်ရှိ အသင်းသား ၁၅ ယောက်ထဲတွင် isCaptain: true ဖြစ်နေသော လူအား ရှာဖွေခြင်း
  const currentCaptain = currentLiveSquadState.find(p => p.isCaptain === true || p.isCaptain === "true");

  if (!currentCaptain) {
    radarLabel.textContent = "No Captain selected in your squad.";
    radarLabel.style.color = "#ef4444";
    return;
  }

  // ဗျူဟာမြောက် စစ်ဆေးချက် - Haaland (Id: 233 သို့မဟုတ် အမည်တွင် Haaland ပါက) ကို ပေးထားလျှင် Safe Choice ပြခြင်း
  const capName = String(currentCaptain.name).toLowerCase();
  
  if (capName.includes("haaland") || currentCaptain.playerId === 233) {
    radarLabel.textContent = `🟢 Safe Choice! You are matching the Elite Template (75% rivals captained Haaland).`;
    radarLabel.style.color = "#22c55e";
  } else {
    // အခြား Differential လူများကို ပေးပါက စွန့်စားမှုအဆင့်အား သတိပေးခြင်း
    radarLabel.textContent = `⚠️ Tactical Move! You captained ${currentCaptain.name} (Elite Rivals 75% captained Haaland).`;
    radarLabel.style.color = "#eab308";
  }
}

/**
 * 👑 USER INTERFACE: CAPTAIN (C) ယာယီရွှေ့ပြောင်းစမ်းသပ်မှု စနစ်
 */
window.toggleDraftCaptainSelection = (targetPlayerId) => {
  // ၁၅ ယောက်လုံးထဲမှ ကပ္ပတိန်အဟောင်းများအားလုံးကို အရင်ဖျက်ပစ်ခြင်း
  currentLiveSquadState.forEach(p => {
    p.isCaptain = false;
  });

  // အန်ကယ် နှိပ်လိုက်သော လူအသစ်အား Captain အဖြစ် အစားထိုးခန့်အပ်ခြင်း
  const newCap = currentLiveSquadState.find(p => String(p.playerId) === String(targetPlayerId));
  if (newCap) newCap.isCaptain = true;

  // Phone Memory အား အပ်ဒိတ်လုပ်ပြီး UI အသစ် ပြန်ဆွဲခြင်း
  const cacheKey = Object.keys(localStorage).find(k => k.startsWith("twf_draft_squad_"));
  if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(currentLiveSquadState));

  renderUserSquadList(currentLiveSquadState);
  checkCaptaincyRiskRadar(); // Radar အား ချက်ချင်း ပြန်တွက်ခိုင်းခြင်း
};

/**
 * 🔒 FPL REGULATION: BUDGET TRACKER LOGIC
 */
function evaluateSquadBudgetMetrics() {
  let totalCost = 0;
  localSquadState.forEach(p => { totalCost += parseFloat(p.price || 0); });
  localSquadState = currentLiveSquadState;
  
  let totalCostVal = 0;
  currentLiveSquadState.forEach(p => { totalCostVal += parseFloat(p.price || 0); });
  
  const remainingBank = 100.0 - totalCostVal;
  const bankLabel = document.getElementById("budget-bank-label");
  const costLabel = document.getElementById("budget-total-cost");
  
  if (bankLabel) {
    bankLabel.textContent = `£${remainingBank.toFixed(1)}m`;
    bankLabel.style.color = remainingBank >= 0 ? "#22c55e" : "#ef4444";
  }
  if (costLabel) {
    costLabel.textContent = `Squad Cost: £${totalCostVal.toFixed(1)}m / £100.0m`;
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
  document.getElementById("seg-ownership").click();
};

/**
 * 🛒 MARKET SELECTION
 */
window.executeMarketPlaceSelection = (newPlayerDocId) => {
  if (!activeSwapId) return;

  const newPlayerData = allPlayersCache.find(p => String(p.id) === String(newPlayerDocId));
  if (!newPlayerData) return;

  const oldPlayerIndex = currentLiveSquadState.findIndex(p => String(p.playerId) === String(activeSwapId));
  if (oldPlayerIndex === -1) return;

  const oldPlayer = currentLiveSquadState[oldPlayerIndex];

  // POSITION GUARD
  if (String(newPlayerData.position).toLowerCase() !== activeSwapPosition) {
    alert(`FPL Regulation Error: ${activeSwapPosition.toUpperCase()} နေရာတွင် ${newPlayerData.position.toUpperCase()} လူစားလဲခွင့်မရှိပါဗျာ။`);
    return;
  }

  // BUDGET GUARD
  let provisionalCost = 0;
  currentLiveSquadState.forEach((p, idx) => {
    if (idx === oldPlayerIndex) provisionalCost += parseFloat(newPlayerData.price || 0);
    else provisionalCost += parseFloat(p.price || 0);
  });

  if (provisionalCost > 100.0) {
    alert(`Budget Violation: အသင်းတန်ဖိုး စုစုပေါင်း £${provisionalCost.toFixed(1)}m ဖြစ်သွားသဖြင့် FPL ခွင့်ပြုချက် £100.0m ထက် ကျော်လွန်နေပါသည်ဗျာ။`);
    return;
  }

  // Approved -> Swap
  currentLiveSquadState[oldPlayerIndex] = {
    ...oldPlayer,
    playerId: newPlayerData.playerId,
    name: newPlayerData.name,
    price: newPlayerData.price,
    ownership: newPlayerData.ownership,
    form: newPlayerData.form || 0,
    totalPoints: newPlayerData.totalPoints || 0,
    gwPoints: newPlayerData.gwPoints || 0
  };

  // Update Compare progress
  const outBar = document.getElementById("template-out-bar");
  const inBar = document.getElementById("template-in-bar");
  if (outBar && inBar) {
    document.getElementById("template-out-label").textContent = `Out: ${oldPlayer.ownership}%`;
    document.getElementById("template-in-label").textContent = `In: ${newPlayerData.ownership}%`;
    outBar.style.width = `${oldPlayer.ownership}%`;
    inBar.style.width = `${newPlayerData.ownership}%`;
  }

  const cacheKey = Object.keys(localStorage).find(k => k.startsWith("twf_draft_squad_"));
  if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(currentLiveSquadState));

  renderUserSquadList(currentLiveSquadState);
  calculateTeamShieldTracker(currentLiveSquadState);
  checkCaptaincyRiskRadar();

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

/**
 * Render User Squad with Captaincy Toggle Button Included
 */
export function renderUserSquadList(squadArray) {
  let html = "";
  squadArray.forEach((p, idx) => {
    let posBg = "#15803d"; const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") posBg = "#1d4ed8"; else if (pos === "DEF") posBg = "#9f1239"; else if (pos === "MID") posBg = "#b45309";

    // Is current loop item captain?
    const isCap = p.isCaptain === true || p.isCaptain === "true";
    const capBadgeStyle = isCap ? "background:#C9A84C; color:#041e12;" : "background:rgba(0,0,0,0.3); color:#3A9E5F; border:1px solid #1e6a3c;";

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
          
          <button onclick="window.toggleDraftCaptainSelection('${p.playerId}')" class="w-7 h-8 text-[10px] font-black rounded-lg transition-all active:scale-95" style="${capBadgeStyle}">
            C
          </button>
          
          <button onclick="window.activatePlayerSwapMode('${p.playerId}', '${p.name.replace(/'/g, "\\'")}', '${pos}')" class="w-7 h-8 rounded-lg bg-black/30 border border-[#1e6a3c] flex items-center justify-center text-xs">🔄</button>
        </div>
      </div>`;
  });
  document.getElementById("my-squad-list").innerHTML = html;
  evaluateSquadBudgetMetrics();
}

/**
 * Market render engine logic
 */
function executeMarketRender() {
  let filtered = [...allPlayersCache];
  if (activeSwapPosition) {
    filtered = filtered.filter(p => String(p.position).toLowerCase() === activeSwapPosition);
  }

  filtered.sort((a, b) => {
    if (currentMarketSortKey === "price") return parseFloat(b.price || 0) - parseFloat(a.price || 0);
    if (currentMarketSortKey === "ownership") return parseFloat(b.ownership || 0) - parseFloat(a.ownership || 0);
    if (currentMarketSortKey === "points") return parseInt(b.totalPoints || 0) - parseInt(a.totalPoints || 0);
    return parseFloat(b.form || 0) - parseFloat(a.form || 0);
  });

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
  
  const listEl = document.getElementById("ownership-list");
  if (listEl) listEl.innerHTML = html || `<p class="text-center text-xs py-12 text-gray-400">လဲလှယ်ရန် နေရာတူ ကစားသမား မတွေ့ရှိပါဗျာ။</p>`;
}

export function calculateTeamShieldTracker(squadArray) {
  if (!squadArray || squadArray.length === 0) return;
  let totalOwnership = 0; squadArray.forEach(p => { totalOwnership += parseFloat(p.ownership || 0); });
  renderTeamShieldTracker(totalOwnership / squadArray.length);
}

function renderTeamShieldTracker(averageOwnership) {
  const shieldEl = document.getElementById("team-shield-badge");
  if (shieldEl) {
    if (averageOwnership >= 70) {
      shieldEl.className = "shield-box shield-safe";
      shieldEl.textContent = `SHIELD: SAFE (${Math.round(averageOwnership)}%)`;
    } else if (averageOwnership >= 40) {
      shieldEl.className = "shield-box shield-tactical";
      shieldEl.textContent = `SHIELD: TACTICAL (${Math.round(averageOwnership)}%)`;
    } else {
      shieldEl.className = "shield-box shield-aggressive";
      shieldEl.textContent = `SHIELD: AGGRESSIVE (${Math.round(averageOwnership)}%)`;
    }
  }
}
