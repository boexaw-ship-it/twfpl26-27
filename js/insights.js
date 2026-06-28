import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allPlayersCache = [];
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

  // 👕 Tab 1 Fix: Users node -> fplTeamId -> liveTeams Cross-mapping
  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const fplId = userSnap.data().fplTeamId;
        
        onSnapshot(doc(db, "liveTeams", fplId), async (squadSnap) => {
          if (squadSnap.exists()) {
            const teamData = squadSnap.data();
            const rawSquadArray = teamData.picks || teamData.players || [];
            
            if (rawSquadArray.length > 0) {
              // Cross Ref Mapping with Master Database For Price & Ownership %
              const enrichedSquad = await Promise.all(rawSquadArray.map(async (playerItem) => {
                const pIdStr = String(playerItem.playerId || ""); 
                if (pIdStr) {
                  try {
                    const playerDocSnap = await getDoc(doc(db, "players", pIdStr));
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

              // 💡 🎯 🚀 CRITICAL FIX: STRUCTURED POSITION SORTING 
              // GK (2) -> DEF (5) -> MID (5) -> FWD (3) စနစ်တကျစီခြင်း
              const sortedSquad = sortSquadByFPLFormat(enrichedSquad);

              renderUserSquadList(sortedSquad);
              calculateTeamShieldTracker(sortedSquad);
            } else {
              fallbackSquadMessage();
            }
          } else {
            fallbackSquadMessage();
          }
        });
      } else {
        fallbackSquadMessage();
      }
    }).catch((err) => {
      console.error("Sync Error:", err);
      fallbackSquadMessage();
    });
  }

  // 📊 Tab 2: Global Ownership Insights List
  const qOwnership = query(collection(db, "players"), orderBy("ownership", "desc"));
  onSnapshot(qOwnership, (snap) => {
    allPlayersCache = [];
    snap.forEach(doc => { allPlayersCache.push(doc); });
    executeInsightsRender();
  });
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
    else fwd.push(p); // Fallback boundary
  });

  return [...gk, ...def, ...mid, ...fwd];
}

function fallbackSquadMessage() {
  const el = document.getElementById("my-squad-list");
  if (el) el.innerHTML = `<p class="text-center text-xs py-12 text-[#3A9E5F]">No squad data found in database.</p>`;
}

/**
 * 👕 Tab 1 Render Engine
 */
function renderUserSquadList(squadArray) {
  let html = "";
  squadArray.forEach((p, idx) => {
    html += buildHtmlRow(p, idx + 1, `${p.ownership || 0}% owned`, "Current Squad Selection");
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
      shieldEl.className = "shield-badge shield-safe";
      shieldEl.textContent = `SHIELD: SAFE (${Math.round(averageOwnership)}%)`;
    } else if (averageOwnership >= 40) {
      shieldEl.className = "shield-badge shield-tactical";
      shieldEl.textContent = `SHIELD: TACTICAL (${Math.round(averageOwnership)}%)`;
    } else {
      shieldEl.className = "shield-badge shield-aggressive";
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
 * 📊 Tab 2 Render Engine
 */
function executeInsightsRender() {
  let filteredDocs = [...allPlayersCache];
  if (showGemsOnlyGlobal) {
    filteredDocs = filteredDocs.filter(d => parseFloat(d.data().ownership || 0) < 10);
  }

  let html = ""; let index = 1;
  filteredDocs.slice(0, 20).forEach((doc) => {
    const p = doc.data();
    html += buildHtmlRow(p, index++, `${p.ownership ?? 0}% owned`, "Scout Matrix Data");
  });
  
  const listEl = document.getElementById("ownership-list");
  if (listEl) listEl.innerHTML = html;
}

/**
 * 🎨 💡 CRITICAL UI FIX: BRAND NEW UNCLE'S COLOR DEFINITIONS 
 * GK (အပြာ) | DEF (အနီ) | MID (အဝါ) | FWD (အစိမ်း)
 */
function buildHtmlRow(p, index, rightLabel, subText) {
  let posBg = "#15803d"; // Default Green For FWD (🟢)
  const pos = String(p.position || "").toUpperCase().trim();
  
  if (pos === "GK") posBg = "#1d4ed8";       // GK Blue (🔵)
  else if (pos === "DEF") posBg = "#9f1239";  // DEF Red (🔴)
  else if (pos === "MID") posBg = "#b45309";  // MID Yellow-Amber (🟡)

  return `
    <div class="rounded-xl p-3 flex items-center justify-between bg-[#124c2a] border border-[#1e6a3c]">
      <div class="flex items-center gap-3">
        <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${index}</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-black text-white" style="background:${posBg};">${pos}</span>
          <div>
            <p class="text-white text-sm font-semibold truncate max-w-[130px] sm:max-w-[180px]">${p.name || '—'}</p>
            <p class="text-[10px]" style="color:#3A9E5F;">${subText}</p>
          </div>
        </div>
      </div>
      <div class="text-right">
        <p class="font-bold" style="color:#C9A84C; font-family:'Bebas Neue'; font-size:1.1rem;">£${p.price || 0}m</p>
        <p class="text-[10px]" style="color:#E8D5A3;">${rightLabel}</p>
      </div>
    </div>`;
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

