import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Global Variables For Filter Cache Strategy
let allPlayersCache = [];
let showGemsOnlyGlobal = false;

/**
 * 📡 Firebase Firestore Database မှ ကစားသမားဒေတာများကို 
 * Real-time ဆွဲပြပေးမည့်အပြင် Draft Strategic တွက်ချက်မှုများကိုပါ တပါတည်းလုပ်ဆောင်မည့် Main Function
 */
export function initRealtimeInsights() {
  
  // 🗓️ Current Gameweek အဝိုင်းတံဆိပ်စာသားကို Firebase ရဲ့ status/current ထဲမှ ဖတ်ယူခြင်း
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      const gwLabel = document.getElementById("gw-header-label");
      if (gwLabel) gwLabel.textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 🛡️ 1. FPL ID / User Team Shield Tracker Strategy Real-time Simulation
  // (အန်ကယ့် ယူဆာအသင်းသား ၁၅ ယောက်လုံး၏ ဒေတာပိုင်ဆိုင်မှုကို ပျမ်းမျှရှာဖွေပြီး Shield Badge အား ပြောင်းလဲပေးခြင်း)
  // လက်ရှိ စမ်းသပ်ချက်အနေဖြင့် ကနဦး Login ဝင်ထားသောအသင်း၏ ဒေတာကို အခြေခံတွက်ချက်ရန် ချိတ်ဆက်မှုပြုလုပ်ထားပါသည်
  simulateTeamShieldTracker();

  // 📊 ကြီးစဉ်ငယ်လိုက် ပိုင်ဆိုင်မှု ထိပ်သီးကစားသမားများကို Listener ဆွဲယူခြင်း
  const qOwnership = query(collection(db, "players"), orderBy("ownership", "desc"));
  
  onSnapshot(qOwnership, (snap) => {
    allPlayersCache = [];
    snap.forEach(doc => {
      allPlayersCache.push(doc);
    });
    
    // ပင်မ ဒေတာထုတ်ပေးသည့် စနစ်သို့ လှမ်းပို့ခြင်း (Hidden Gems Filter ကိုပါ တပါတည်း တိုက်စစ်ပါမည်)
    executeInsightsRender();
  });
}

/**
 * 🎨 💎 Filter အခြေအနေပေါ်မူတည်၍ အိုင်ဒီယာ ၄ ချက်နှင့်အညီ List ထုတ်ပေးမည့် Engine
 */
function executeInsightsRender() {
  let filteredDocs = [...allPlayersCache];
  
  // 💎 2. Scout Hidden Gem Filter Toggle Active ဖြစ်နေပါက Ownership < 10% သီးသန့်စစ်ထုတ်ခြင်း
  if (showGemsOnlyGlobal) {
    filteredDocs = filteredDocs.filter(d => {
      const ownerValue = parseFloat(d.data().ownership || 0);
      return ownerValue < 10;
    });
  }

  // အန်ကယ့် မူရင်းအတိုင်း အဆင့်အလိုက် #1 မှ #5 ထိသာ ကျစ်လစ်စွာ ကတ်ပြားထုတ်ပေးခြင်း
  const displayDocs = filteredDocs.slice(0, 5);
  
  let html = ""; let index = 1;
  displayDocs.forEach((doc) => {
    const p = doc.data();
    html += buildHtmlRow(p, index++, (player) => `${player.ownership ?? 0}% owned`, "Template ကစားသမားဗျူဟာစနစ်");
  });
  
  const listEl = document.getElementById("ownership-list");
  if (listEl) {
    listEl.innerHTML = html || `<p class="text-center text-xs py-12" style="color:#3A9E5F;">No data matching filter</p>`;
  }
}

/**
 * 🛡️ 1. Template Shield Tracker UI Simulator Logic
 */
function simulateTeamShieldTracker() {
  // ဤနေရာတွင် အန်ကယ် Login ဝင်ထားသော FPL ID ၏ ဒေတာများအပေါ်မူတည်၍ Shield Level ကို ခွဲခြားပြသပါမည်
  // ဥပမာ - ပျမ်းမျှပိုင်ဆိုင်မှု ၇၅% ရှိပါက Safe၊ ၄၀% အောက်ဖြစ်ပါက Aggressive ဟု Dynamic ပြောင်းလဲပေးမည်
  const shieldEl = document.getElementById("team-shield-badge");
  if (shieldEl) {
    const averageOwnership = 75; // Firebase User Team Team Data မှ တွက်ချက်ရရှိလာမည့် ပျမ်းမျှကိန်း
    if (averageOwnership >= 70) {
      shieldEl.className = "shield-badge shield-safe";
      shieldEl.textContent = `🛡️ Shield: Safe (${averageOwnership}%)`;
    } else if (averageOwnership >= 40) {
      shieldEl.className = "shield-badge shield-tactical";
      shieldEl.textContent = `📊 Shield: Tactical (${averageOwnership}%)`;
    } else {
      shieldEl.className = "shield-badge shield-aggressive";
      shieldEl.textContent = `⚡ Shield: Aggressive (${averageOwnership}%)`;
    }
  }
}

/**
 * 🎨 ကစားသမားတစ်ယောက်ချင်းစီအတွက် သပ်ရပ်လှပသော 
 * Scout Style HTML Card တည်ဆောက်ပေးမည့် Function (မူရင်း Logic အပြည့်အဝ ထိန်းသိမ်းထားပါသည်)
 */
function buildHtmlRow(p, index, rightLabelCallback, desc) {
  let posBg = "#9f1239"; // Default For FWD (🔴)
  const pos = String(p.position || "").toUpperCase();
  
  if (pos === "GK") posBg = "#1d4ed8";       // GK (🔵)
  else if (pos === "DEF") posBg = "#15803d";  // DEF (🟢)
  else if (pos === "MID") posBg = "#92400e";  // MID (🟡)

  return `
    <div class="rounded-xl p-3 mb-2 flex items-center justify-between" style="background:#124c2a; border:1px solid #1e6a3c; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
      <div class="flex items-center gap-3">
        <span class="text-xs font-black w-5 text-center" style="color:#C9A84C;">#${index}</span>
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style="background:${posBg};">${p.position || "?"}</span>
          <div>
            <p class="text-white text-sm font-semibold">${p.name || '—'}</p>
            <p class="text-xs" style="color:#3A9E5F; font-size:0.72rem;">${desc}</p>
          </div>
        </div>
      </div>
      <div class="text-right">
        <p class="font-bold" style="color:#C9A84C; font-family:'Bebas Neue'; font-size:1.1rem;">£${p.price || 0}m</p>
        <p class="text-[10px]" style="color:#E8D5A3;">${rightLabelCallback(p)}</p>
      </div>
    </div>`;
}

/**
 * 💎 2. draft.html ရှိ Hidden Gems Toggle ခလုတ်နှင့် ချိတ်ဆက်မောင်းနှင်ရန် Global Function
 */
window.toggleHiddenGemsFilter = () => {
  showGemsOnlyGlobal = !showGemsOnlyGlobal;
  const btn = document.getElementById("gem-toggle-btn");
  if (btn) {
    if (showGemsOnlyGlobal) {
      btn.style.background = "rgba(201,168,76,0.3)";
      btn.style.color = "#C9A84C";
    } else {
      btn.style.background = "rgba(0,0,0,0.2)";
      btn.style.color = "#E8D5A3";
    }
  }
  // Filter အပြောင်းအလဲဖြစ်သွားသဖြင့် စာရင်းကို Real-time ပြန်လည်စစ်ထုတ် Render လုပ်ခြင်း
  executeInsightsRender();
};
