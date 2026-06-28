import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Variables For Filter & Live Engine Cache
let allPlayersCache = [];
let showGemsOnlyGlobal = false;

/**
 * 📡 Firebase Firestore Database မှ ကစားသမားဒေတာများကို 
 * Real-time ဆွဲပြပေးမည့်အပြင် Draft Strategic တွက်ချက်မှုများကိုပါ တပါတည်းလုပ်ဆောင်မည့် Main Function
 */
export function initRealtimeInsights(uid) {
  
  // 🗓️ Current Gameweek Header Listener
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 👕 🎯 🚀 UNCLE'S TRUE path: 15 SQUAD PLAYERS FROM LIVETEAMS SYNC
  // အန်ကယ် ပေးပို့ထားသော live.js မူရင်းအလုပ်လုပ်ပုံအတိုင်း users မှတစ်ဆင့် fplTeamId ကိုဖတ်ပြီး 
  // doc(db, "liveTeams", fplId) အောက်ရှိ picks/players ဒေတာဇယားကို စက္ကန့်ပိုင်းအတွင်း ဖတ်ယူခြင်း
  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const fplId = userSnap.data().fplTeamId; // အန်ကယ့် ကိုယ်ပိုင် FPL Team ID ရယူခြင်း
        
        // liveTeams collection ကို မူရင်းအတိုင်း တိုက်ရိုက် Watcher လုပ်ခြင်း
        onSnapshot(doc(db, "liveTeams", fplId), (squadSnap) => {
          if (squadSnap.exists()) {
            const teamData = squadSnap.data();
            
            // အန်ကယ့် database တည်ဆောက်ပုံ Flexible ဖြစ်စေရန် picks သို့မဟုတ် players array အား ရွေးချယ်ဖတ်ယူခြင်း
            const squadArray = teamData.picks || teamData.players || [];
            
            if (squadArray.length > 0) {
              renderUserSquadList(squadArray);
              calculateTeamShieldTracker(squadArray); // Shield Tracker အား ပိုင်ဆိုင်မှု ပျမ်းမျှတွက်ချက်ခိုင်းခြင်း
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
      console.error("Error path syncing squad database:", err);
      fallbackSquadMessage();
    });
  }

  // 📊 Tab 2: Ownership Real-time Insights Listener
  const qOwnership = query(collection(db, "players"), orderBy("ownership", "desc"));
  onSnapshot(qOwnership, (snap) => {
    allPlayersCache = [];
    snap.forEach(doc => { allPlayersCache.push(doc); });
    executeInsightsRender();
  });
}

/**
 * Squad Load မအောင်မြင်ပါက fallback ပြသပေးမည့်စာသား
 */
function fallbackSquadMessage() {
  const el = document.getElementById("my-squad-list");
  if (el) el.innerHTML = `<p class="text-center text-xs py-12 text-[#3A9E5F]">No squad data found in database.</p>`;
}

/**
 * 👕 Tab 1 Render: အန်ကယ့် လက်ရှိလူ ၁၅ ယောက်အား သပ်ရပ်စွာ ထုတ်ပေးခြင်း
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
 * 🛡️ 1. Template Shield Tracker Real-time Strategy Analyzer
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

/**
 * လူစာရင်းမှ ပိုင်ဆိုင်မှု ပျမ်းမျှအား တွက်ချက်ပေးသည့် Function
 */
function calculateTeamShieldTracker(squadArray) {
  if (!squadArray || squadArray.length === 0) return;
  let totalOwnership = 0;
  squadArray.forEach(p => {
    totalOwnership += parseFloat(p.ownership || 0);
  });
  const avg = totalOwnership / squadArray.length;
  renderTeamShieldTracker(avg);
}

/**
 * 📊 Tab 2 Render: Global Ownership Insights List
 */
function executeInsightsRender() {
  let filteredDocs = [...allPlayersCache];
  
  if (showGemsOnlyGlobal) {
    filteredDocs = filteredDocs.filter(d => {
      return parseFloat(d.data().ownership || 0) < 10;
    });
  }

  let html = ""; let index = 1;
  filteredDocs.slice(0, 15).forEach((doc) => {
    const p = doc.data();
    html += buildHtmlRow(p, index++, `${p.ownership ?? 0}% owned`, "Scout Matrix Data");
  });
  
  const listEl = document.getElementById("ownership-list");
  if (listEl) listEl.innerHTML = html;
}

/**
 * Modular Row Card HTML Template (Clean English Version Only)
 */
function buildHtmlRow(p, index, rightLabel, subText) {
  let posBg = "#9f1239";
  const pos = String(p.position || "").toUpperCase().trim();
  if (pos === "GK") posBg = "#1d4ed8";
  else if (pos === "DEF") posBg = "#15803d";
  else if (pos === "MID") posBg = "#92400e";

  return `
    <div class="rounded-xl p-3 mb-2 flex items-center justify-between" style="background:#124c2a; border:1px solid #1e6a3c;">
      <div class="flex items-center gap-3">
        <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${index}</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style="background:${posBg};">${p.position || "?"}</span>
          <div>
            <p class="text-white text-sm font-semibold">${p.name || '—'}</p>
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
 * 💎 Hidden Gems Toggle Controller
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
