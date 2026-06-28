import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Cache Controls
let allPlayersCache = [];
let showGemsOnlyGlobal = false;

/**
 * 📡 Firebase Firestore Database မှ ကစားသမားဒေတာများကို 
 * Real-time ဆွဲပြပေးမည့်အပြင် Draft Strategic တွက်ချက်မှုများကိုပါ တပါတည်းလုပ်ဆောင်မည့် Main Function
 */
export function initRealtimeInsights(uid) {
  
  // 🗓️ Current Gameweek အဝိုင်းတံဆိပ်စာသားကို Firebase ရဲ့ status/current ထဲမှ ဖတ်ယူခြင်း
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 👕 🎯 🚀 CRITICAL DATABASE ALIGNMENT SYNC ENGINE
  // အသုံးပြုသူ၏ users node မှ fplTeamId ကို ဖတ်ပြီး liveTeams collection အောက်ရှိ ဒေတာကို ဆွဲထုတ်ခြင်း
  if (uid) {
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      if (userSnap.exists() && userSnap.data().fplTeamId) {
        const teamId = userSnap.data().fplTeamId; // ရလာသော အသင်း ID (ဥပမာ- dmIsVFopP3...)
        
        // 🛡️ liveTeams collection အောက်ရှိ သက်ဆိုင်ရာ အသင်း ID စာရင်းအား Live နားထောင်ခြင်း
        onSnapshot(doc(db, "liveTeams", teamId), (squadSnap) => {
          if (squadSnap.exists()) {
            const teamData = squadSnap.data();
            
            // 💡 🎯 FLEXIBLE DATABASE CHECK ENGINE
            // အန်ကယ့် database ၏ players array အမည် သို့မဟုတ် သီးသန့် field တည်ဆောက်ပုံများကို ပျော့ပျောင်းစွာ ရှာဖွေခြင်း
            let finalSquadArray = [];
            if (teamData.players && Array.isArray(teamData.players)) {
              finalSquadArray = teamData.players;
            } else if (teamData.squad && Array.isArray(teamData.squad)) {
              finalSquadArray = teamData.squad;
            } else {
              // Array ပုံစံမဟုတ်ဘဲ Object အတွင်း Field များဖြင့် သိမ်းဆည်းထားပါက စစ်ထုတ်ယူခြင်း
              Object.keys(teamData).forEach(key => {
                if (teamData[key] && typeof teamData[key] === 'object' && teamData[key].name) {
                  finalSquadArray.push(teamData[key]);
                }
              });
            }

            if (finalSquadArray.length > 0) {
              renderUserSquadList(finalSquadArray);
              calculateTeamShieldTracker(finalSquadArray); // Shield Tracker အား အော်တိုတွက်ချက်ခိုင်းခြင်း
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
      console.error("Error fetching sync paths:", err);
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
 * Modular Row Card HTML Template
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
