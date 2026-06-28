import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allPlayersCache = [];
let showGemsOnlyGlobal = false;

/**
 * Main Strategy Router Engine
 */
export function initRealtimeInsights(uid) {
  
  // GW Listener
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 👕 Tab 1 Fix: Users Collection ထဲမှ fplTeamId ကို အရင်ရှာဖွေပြီးမှ Squad ဒေတာဆွဲထုတ်ခြင်း
  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const teamId = userSnap.data().fplTeamId; // ရလာသော Team ID (ဥပမာ- dmIsVFopP3...)
        
        // liveTeams အောက်တွင် ၎င်း Team ID ဖြင့် ကစားသမား ၁၅ ယောက်ကို Listener ချိတ်ဆက်ခြင်း
        onSnapshot(doc(db, "liveTeams", teamId), (squadSnap) => {
          if (squadSnap.exists()) {
            const teamData = squadSnap.data();
            renderUserSquadList(teamData.players || []);
          } else {
            fallbackSquadMessage();
          }
        });
      } else {
        fallbackSquadMessage();
      }
    }).catch(() => {
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

function fallbackSquadMessage() {
  const el = document.getElementById("my-squad-list");
  if (el) el.innerHTML = `<p class="text-center text-xs py-12 text-[#3A9E5F]">No squad data found in database.</p>`;
}

/**
 * Render Engine for 15 Players Squad List
 */
function renderUserSquadList(squadArray) {
  let html = "";
  if (squadArray.length === 0) {
    fallbackSquadMessage();
    return;
  }

  squadArray.forEach((p, idx) => {
    html += buildHtmlRow(p, idx + 1, `${p.ownership || 0}% owned`, "Current Squad Selection");
  });
  document.getElementById("my-squad-list").innerHTML = html;
}

/**
 * Filter Engine for Global Ownership Insights
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
 * Standard Metric Card Layout Builder
 */
function buildHtmlRow(p, index, rightLabel, subText) {
  let posBg = "#9f1239";
  const pos = String(p.position || "").toUpperCase();
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
 * Filter Controller
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
