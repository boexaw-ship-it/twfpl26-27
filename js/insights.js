import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Variables For Filter & Live Engine Cache
let allPlayersCache = [];
let currentLiveSquadState = []; // Handled user 15 players current list state
let activeSwapPlayerId = null;  // For tracking which squad player is being swapped
let showGemsOnlyGlobal = false;

/**
 * Main Strategic Router Engine
 */
export function initRealtimeInsights(uid) {
  
  // GW Current Header Listener
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 👕 Tab 1: Users node -> fplTeamId -> liveTeams -> Phone Memory Cache Check
  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const fplId = userSnap.data().fplTeamId;
        
        // 🛡️ [PHONE MEMORY STRATEGY]
        // User က စမ်းသပ်ထားပြီးသား ယာယီအသင်းစာရင်း LocalStorage ထဲရှိမရှိ အရင်စစ်ဆေးခြင်း
        const cacheKey = `twf_draft_squad_${fplId}`;
        const localCachedSquad = localStorage.getItem(cacheKey);

        if (localCachedSquad) {
          console.log("🚀 Phone Memory Sandbox Squad Loaded.");
          currentLiveSquadState = JSON.parse(localCachedSquad);
          renderUserSquadList(currentLiveSquadState);
          calculateTeamShieldTracker(currentLiveSquadState);
          updateCompareWidgetProgress(0, 0); // Clear default compare bar
        } else {
          // Local Storage မရှိပါက Firebase ဆီမှ ပုံမှန် Live Data အစစ်အား ကောက်ယူခြင်း
          onSnapshot(doc(db, "liveTeams", fplId), async (squadSnap) => {
            if (squadSnap.exists()) {
              const teamData = squadSnap.data();
              const rawSquadArray = teamData.picks || teamData.players || [];
              
              if (rawSquadArray.length > 0) {
                const enrichedSquad = await Promise.all(rawSquadArray.map(async (playerItem) => {
                  const pIdStr = String(playerItem.playerId || ""); 
                  if (pIdStr) {
                    try {
                      const playerDocSnap = await getDoc(doc(db, "scoutPlayers", pIdStr));
                      if (playerDocSnap.exists()) {
                        const masterData = playerDocSnap.data();
                        return {
                          ...playerItem,
                          price: masterData.price || playerItem.price || 0,
                          ownership: masterData.ownership || playerItem.ownership || 0
                        };
                      }
                    } catch (e) {
                      console.error("Mapping Error:", pIdStr, e);
                    }
                  }
                  return playerItem;
                }));

                currentLiveSquadState = sortSquadByFPLFormat(enrichedSquad);
                // ပထမဆုံးအကြိမ် ဖတ်မိပါက Phone Memory ထဲသို့ သိမ်းဆည်းထားလိုက်ခြင်း
                localStorage.setItem(cacheKey, JSON.stringify(currentLiveSquadState));
                
                renderUserSquadList(currentLiveSquadState);
                calculateTeamShieldTracker(currentLiveSquadState);
                updateCompareWidgetProgress(0, 0);
              } else {
                fallbackSquadMessage();
              }
            } else {
              fallbackSquadMessage();
            }
          });
        }
      } else {
        fallbackSquadMessage();
      }
    }).catch((err) => {
      console.error("Sync Error:", err);
      fallbackSquadMessage();
    });
  }

  // 📊 Tab 2: Marketplace / Global Ownership Insights List
  const qOwnership = query(collection(db, "scoutPlayers"), orderBy("ownership", "desc"));
  onSnapshot(qOwnership, (snap) => {
    allPlayersCache = [];
    snap.forEach(doc => { allPlayersCache.push(doc); });
    executeInsightsRender();
  });
}

/**
 * 🔄 UNCLE'S SYSTEM ENGINE: USER SWAP SIMULATOR ACTION
 * အသင်းသားစာရင်းထဲရှိ 🔄 ခလုတ်အား နှိပ်လိုက်ပါက ဒုတိယ Tab (ဈေးကွက်) သို့ အလိုအလျောက် ပို့ပေးခြင်း
 */
window.activatePlayerSwapMode = (playerId, playerName) => {
  activeSwapPlayerId = playerId;
  
  // Marketplace ခေါင်းစဉ်အား မည်သူ့နေရာတွင် အစားထိုးမည်ဖြစ်ကြောင်း လမ်းညွှန်စာသားပြောင်းလဲပေးခြင်း
  const marketTitle = document.getElementById("market-scout-title");
  if (marketTitle) marketTitle.innerHTML = `🔄 SWAPPING OUT: <span class="text-yellow-400 font-black">${playerName}</span>`;
  
  // Tab 2 (Transfer Market) သို့ အော်တို ကူးပြောင်းပေးခြင်း
  const segMarketBtn = document.getElementById("seg-ownership");
  if (segMarketBtn) segMarketBtn.click();
};

/**
 * 🛒 MARKETPLACE EXECUTION: လူသစ်အား ယာယီအသင်းစာရင်းထဲသို့ အစားထိုးထည့်သွင်းခြင်း
 */
window.executeMarketPlaceSelection = (newPlayerDocId) => {
  if (!activeSwapPlayerId) {
    alert("ကျေးဇူးပြု၍ My Squad ထဲမှ ထုတ်ပယ်လိုသော ကစားသမား၏ 🔄 ခလုတ်အား အရင်နှိပ်ပေးပါဗျာ။");
    return;
  }

  const targetNewPlayer = allPlayersCache.find(d => String(d.id) === String(newPlayerDocId));
  if (!targetNewPlayer) return;

  const newData = targetNewPlayer.data();
  
  // အသင်းထဲရှိ လူဟောင်း၏ အချက်အလက်အား ရှာဖွေခြင်း
  const oldPlayerIndex = currentLiveSquadState.findIndex(p => String(p.playerId) === String(activeSwapPlayerId));
  if (oldPlayerIndex === -1) return;

  const oldPlayerData = currentLiveSquadState[oldPlayerIndex];

  // 🔄 Local Memory (Array) အတွင်း အချင်းချင်း ဒေတာအချက်အလက် Overwrite အစားထိုးလဲလှယ်ခြင်း
  currentLiveSquadState[oldPlayerIndex] = {
    ...oldPlayerData,
    playerId: newData.playerId,
    name: newData.name,
    position: newData.position,
    price: newData.price,
    ownership: newData.ownership
  };

  // နှိုင်းယှဉ်ချက် Progress Widget အား အချိန်နဲ့တပြေးညီ တွက်ချက်ခိုင်းခြင်း
  updateCompareWidgetProgress(oldPlayerData.ownership, newData.ownership);

  // Phone Memory (LocalStorage) ထဲသို့ အပြီးသတ် Overwrite ရေးသွင်းထိန်းသိမ်းခြင်း
  const cachedKey = Object.keys(localStorage).find(key => key.startsWith("twf_draft_squad_"));
  if (cachedKey) {
    localStorage.setItem(cachedKey, JSON.stringify(currentLiveSquadState));
  }

  // UI အား လူစာရင်းအသစ်၊ Shield အသစ်များဖြင့် ချက်ချင်း ပြန်လည် Render ပုံဖော်ခိုင်းခြင်း
  renderUserSquadList(currentLiveSquadState);
  calculateTeamShieldTracker(currentLiveSquadState);

  // စနစ်အား ပုံမှန်အခြေအနေသို့ ပြန်လည်သတ်မှတ်ပြီး Tab 1 (My Squad) သို့ ပြန်ခေါ်သွားခြင်း
  activeSwapPlayerId = null;
  const marketTitle = document.getElementById("market-scout-title");
  if (marketTitle) marketTitle.textContent = "Scout Intelligence Filter";

  const segSquadBtn = document.getElementById("seg-squad");
  if (segSquadBtn) segSquadBtn.click();
};

/**
 * 🔄 UNCLE'S RESET SYNC ENGINE: PHONE MEMORY အား သန့်ရှင်းပစ်ပြီး FPL LIVE စာရင်းအစစ် ပြန်ယူခြင်း
 */
window.resetDraftToFPLRealtime = () => {
  const cachedKey = Object.keys(localStorage).find(key => key.startsWith("twf_draft_squad_"));
  if (cachedKey) {
    localStorage.removeItem(cachedKey); // Browser Memory ဖျက်ပစ်ခြင်း
    alert("🎉 Phone Memory စမ်းသပ်ချက်များအားလုံးကို ရှင်းလင်းပြီး မူရင်း FPL Official Live အသင်းသားစာရင်းအတိုင်း ပြန်လည် Sync ပြီးစီးပါပြီဗျာ အန်ကယ်!");
    window.location.reload(); // Page အား ရိုးရှင်းစွာ Refresh မောင်းနှင်ခြင်း
  }
};

/**
 * 🔄 DRAFT TEMPLATE COMPARE PROGRESS CALCULATOR
 */
function updateCompareWidgetProgress(outOwnership, inOwnership) {
  const outLabel = document.getElementById("template-out-label");
  const inLabel = document.getElementById("template-in-label");
  const outBar = document.getElementById("template-out-bar");
  const inBar = document.getElementById("template-in-bar");

  if (outLabel && inLabel && outBar && inBar) {
    outLabel.textContent = `Out: ${outOwnership}%`;
    inLabel.textContent = `In: ${inOwnership}%`;
    outBar.style.width = `${Math.min(outOwnership, 100)}%`;
    inBar.style.width = `${Math.min(inOwnership, 100)}%`;
  }
}

/**
 * 📊 FPL Format အတိုင်း ကစားသမားများကို ကြီးစဉ်ငယ်လိုက် တန်းစီပေးသည့် Logic
 */
function sortSquadByFPLFormat(squadArray) {
  const gk = []; const def = []; const mid = []; const fwd = [];
  squadArray.forEach(p => {
    const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") gk.push(p);
    else if (pos === "DEF") def.push(p);
    else if (pos === "MID") mid.push(p);
    else if (pos === "FWD") fwd.push(p);
    else fwd.push(p);
  });
  return [...gk, ...def, ...mid, ...fwd];
}

function fallbackSquadMessage() {
  const el = document.getElementById("my-squad-list");
  if (el) el.innerHTML = `<p class="text-center text-xs py-12 text-[#3A9E5F]">No squad data found in database.</p>`;
}

/**
 * 👕 Tab 1 Render Engine (Adding Uncle's Simulation Swap Button)
 */
function renderUserSquadList(squadArray) {
  let html = "";
  squadArray.forEach((p, idx) => {
    let posBg = "#15803d"; 
    const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") posBg = "#1d4ed8";       
    else if (pos === "DEF") posBg = "#9f1239";  
    else if (pos === "MID") posBg = "#b45309";  

    html += `
      <div class="rounded-xl p-3 flex items-center justify-between bg-[#124c2a] border border-[#1e6a3c]">
        <div class="flex items-center gap-3">
          <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${idx + 1}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-black text-white" style="background:${posBg};">${pos}</span>
            <div>
              <p class="text-white text-sm font-semibold truncate max-w-[110px] sm:max-w-[160px]">${p.name || '—'}</p>
              <p class="text-[10px]" style="color:#3A9E5F;">Current Squad Selection</p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3 text-right">
          <div>
            <p class="font-bold" style="color:#C9A84C; font-family:'Bebas Neue'; font-size:1.1rem;">£${p.price || 0}m</p>
            <p class="text-[10px]" style="color:#E8D5A3;">${p.ownership || 0}% owned</p>
          </div>
          <!-- 🔄 💡 🏆 UNCLE'S SWAP TRIGGER BUTTON -->
          <button onclick="window.activatePlayerSwapMode('${p.playerId}', '${p.name.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-black/30 border border-[#1e6a3c] flex items-center justify-center text-xs text-[#C9A84C] active:bg-[#C9A84C]/20 transition-all">
            🔄
          </button>
        </div>
      </div>`;
  });
  const squadContainer = document.getElementById("my-squad-list");
  if (squadContainer) squadContainer.innerHTML = html;
}

/**
 * 🛡️ Shield Tracker Core Analyzer
 */
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

function calculateTeamShieldTracker(squadArray) {
  if (!squadArray || squadArray.length === 0) return;
  let totalOwnership = 0;
  squadArray.forEach(p => { totalOwnership += parseFloat(p.ownership || 0); });
  renderTeamShieldTracker(totalOwnership / squadArray.length);
}

/**
 * 📊 Tab 2 Render Engine (With Add Button to swap-in)
 */
function executeInsightsRender() {
  let filteredDocs = [...allPlayersCache];
  if (showGemsOnlyGlobal) {
    filteredDocs = filteredDocs.filter(d => parseFloat(d.data().ownership || 0) < 10);
  }

  let html = ""; let index = 1;
  filteredDocs.slice(0, 20).forEach((doc) => {
    const p = doc.data();
    let posBg = "#15803d"; 
    const pos = String(p.position || "").toUpperCase().trim();
    if (pos === "GK") posBg = "#1d4ed8";       
    else if (pos === "DEF") posBg = "#9f1239";  
    else if (pos === "MID") posBg = "#b45309";  

    html += `
      <div class="rounded-xl p-3 flex items-center justify-between bg-[#124c2a] border border-[#1e6a3c]">
        <div class="flex items-center gap-3">
          <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${index++}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-black text-white" style="background:${posBg};">${pos}</span>
            <div>
              <p class="text-white text-sm font-semibold truncate max-w-[110px] sm:max-w-[160px]">${p.web_name || p.name || '—'}</p>
              <p class="text-[10px]" style="color:#3A9E5F;">Scout Matrix Data</p>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3 text-right">
          <div>
            <p class="font-bold" style="color:#C9A84C; font-family:'Bebas Neue'; font-size:1.1rem;">£${p.price || 0}m</p>
            <p class="text-[10px]" style="color:#E8D5A3;">${p.ownership ?? 0}% owned</p>
          </div>
          <!-- ➕ 🔄 CHOOSE BUTTON TO SWAP IN -->
          <button onclick="window.executeMarketPlaceSelection('${doc.id}')" class="px-2.5 py-1 text-[10px] font-black rounded-lg bg-[#124c2a] border border-[#C9A84C]/40 text-[#C9A84C] active:bg-[#C9A84C]/20 transition-all">
            + USE
          </button>
        </div>
      </div>`;
  });
  
  const listEl = document.getElementById("ownership-list");
  if (listEl) listEl.innerHTML = html;
}

/**
 * Filter Controller Module
 */
window.toggleHiddenGemsFilter = () => {
  showGemsOnlyGlobal = !showGemsOnlyGlobal;
  const btn = document.getElementById("gem-toggle-btn");
  if (btn) {
    btn.style.background = showGemsOnlyGlobal ? "rgba(201,168,76,0.3)" : "rgba(0,0,0,0.2)";
    btn.style.color = showGemsOnlyGlobal ? "#C9A84C" : "#E8D5A3";
  }
  executeInsightsRender();
};
