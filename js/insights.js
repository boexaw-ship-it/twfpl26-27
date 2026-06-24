import { db } from "/twfpl26-27/js/firebase-config.js";
import { collection, doc, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * 📡 Firebase Firestore Database မှ ကစားသမားဒေတာများကို 
 * Tab အလိုက် အော်တိုစစ်ထုတ်ပြီး Real-time ဆွဲပြပေးမည့် Main Function
 */
export function initRealtimeInsights() {
  
  // 🗓️ Current Gameweek အဝိုင်းတံဆိပ်စာသားကို Firebase ရဲ့ status/current ထဲမှ ဖတ်ယူခြင်း
  onSnapshot(doc(db, "status", "current"), (d) => {
    if (d.exists()) {
      document.getElementById("gw-header-label").textContent = "GW " + (d.data().gameweek || "");
    }
  });

  // 1️⃣ 📊 Ownership Tab Logic
  // စုစုပေါင်းပိုင်ဆိုင်မှု (ownership) အများဆုံးထိပ်သီး ၅ ယောက်ကို ကြီးစဉ်ငယ်လိုက် စစ်ထုတ်ခြင်း
  const qOwnership = query(collection(db, "players"), orderBy("ownership", "desc"), limit(5));
  onSnapshot(qOwnership, (snap) => {
    renderScoutStyleList("ownership-list", snap, (p) => `${p.ownership ?? 0}% owned`, "အသင်းတိုင်းနီးပါး သယ်ထားသော မရှိမဖြစ်လူ");
  });

  // 2️⃣ 👑 Captains Tab Logic
  // လက်ရှိ Form ခြေစွမ်းအကောင်းဆုံးနှင့် Points အများဆုံးရနေသည့် ထိပ်သီး ၅ ယောက်ကို စစ်ထုတ်ခြင်း
  const qCaptains = query(collection(db, "players"), orderBy("form", "desc"), limit(5));
  onSnapshot(qCaptains, (snap) => {
    renderScoutStyleList("captains-list", snap, (p) => `Form: ${p.form ?? 0}`, (p) => `Team: ${p.team || "—"} | ⭐ Pts: ${p.totalPoints ?? 0}`);
  });

  // 3️⃣ ⚡ Differentials Tab Logic
  // ပိုင်ဆိုင်မှု ၁၀ ရာခိုင်နှုန်းအောက် (ownership < 10) သာရှိပြီး လက်ရှိ Form အတက်ဆုံးလူ ၅ ယောက်ကို စစ်ထုတ်ခြင်း
  const qDiff = query(collection(db, "players"), orderBy("form", "desc"), limit(20));
  onSnapshot(qDiff, (snap) => {
    const filteredDocs = [];
    snap.forEach(d => { 
      const ownerValue = parseFloat(d.data().ownership || 0);
      if (ownerValue < 10) {
        filteredDocs.push(d); 
      }
    });
    // စစ်ထုတ်ပြီးသားထဲမှ ထိပ်ဆုံး ၅ ယောက်ကိုသာ Layout ကတ်ပြားထုတ်ပေးခြင်း
    renderScoutStyleListFromArr("differentials-list", filteredDocs.slice(0, 5), (p) => `${p.ownership ?? 0}% owned`, (p) => `Form: ${p.form ?? 0} | ရမှတ်ထွက်နှုန်း မြင့်တက်နေသူ`);
  });
}

/**
 * 🎨 ကစားသမားတစ်ယောက်ချင်းစီအတွက် သပ်ရပ်လှပသော 
 * Scout Style HTML Card တည်ဆောက်ပေးမည့် Function
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
 * Snapshot Data တိုက်ရိုက်ဝင်လာလျှင် Render လုပ်ပေးမည့် Logic
 */
function renderScoutStyleList(elementId, snapshot, rightLabelCallback, descCallback) {
  let html = ""; let index = 1;
  snapshot.forEach((doc) => {
    const p = doc.data();
    const desc = typeof descCallback === "function" ? descCallback(p) : descCallback;
    html += buildHtmlRow(p, index++, rightLabelCallback, desc);
  });
  document.getElementById(elementId).innerHTML = html || `<p class="text-center text-xs py-8" style="color:#3A9E5F;">No data available</p>`;
}

/**
 * Filter လုပ်ပြီးသား Array Data ဝင်လာလျှင် Render လုပ်ပေးမည့် Logic
 */
function renderScoutStyleListFromArr(elementId, arr, rightLabelCallback, descCallback) {
  let html = ""; let index = 1;
  arr.forEach((doc) => {
    const p = doc.data();
    const desc = typeof descCallback === "function" ? descCallback(p) : descCallback;
    html += buildHtmlRow(p, index++, rightLabelCallback, desc);
  });
  document.getElementById(elementId).innerHTML = html || `<p class="text-center text-xs py-8" style="color:#3A9E5F;">No data available</p>`;
}
