import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, addDoc, orderBy, query, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null; 
let currentTeamName = ""; 
let isApproved = false; 

// 📡 Firebase User Auth & Real-time Live Point/Team Listener
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; } 
  currentUser = user; 

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return; 
    const data = snap.data(); 
    currentTeamName = data.teamName || ""; 
    document.getElementById("user-team").textContent = currentTeamName; 
    isApproved = data.status === "approved"; 
    updateChatLock(); 

    if (data.fplTeamId) {
      // 1. livePoints Watcher (ရမှတ်များနှင့် Summary ဒေတာများ)
      onSnapshot(doc(db, "livePoints", data.fplTeamId), (d) => {
        if (d.exists()) {
          document.getElementById("gw-points").textContent = d.data().gwPoints ?? "—"; 
          document.getElementById("overall-pts").textContent = d.data().totalPoints ?? "—"; 
          document.getElementById("overall-rank").textContent = d.data().overallRank ?? "—"; 
          document.getElementById("captain-pts").textContent = d.data().captainPoints ?? "—"; 
          document.getElementById("gw-rank").textContent = d.data().gwRank ?? "—"; 
          const hit = d.data().transferCost || 0; 
          document.getElementById("hit-label").textContent = "Hit: -" + hit; 
          const chip = d.data().activeChip; 
          document.getElementById("chip-badge").textContent = chip ? chip : "NO CHIP"; 
        }
      });
      
      // 2. liveTeams Watcher (လူစာရင်း Rendering)
      onSnapshot(doc(db, "liveTeams", data.fplTeamId), (d) => {
        if (d.exists()) renderPitch(d.data()); 
      });
    }
  });

  loadChat(); 
});

// 👕 🎨 ဂျာစီပုံရိပ်လမ်းကြောင်း (GK နှင့် Outfield တိကျစွာ ခွဲခြားမှု)
function jerseyPath(p) {
  const posClean = String(p.position || "").toLowerCase().trim();
  const folder = posClean === "gk" ? "gk" : "outfield"; 
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); 
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; 
}

// 📛 💡 🏆 UNCLE'S CIRCULAR HIGH-CONTRAST CARD
// အန်ကယ်အလိုရှိသည့် မူရင်းအဝိုင်းဒီဇိုင်းနှင့် ပြတ်သားသော Point ပြသမှုစနစ်
function playerCard(p) {
  const mult = p.multiplier || 1; 
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); 
  
  const isCap = p.isCaptain === true || p.isCaptain === "true" || mult > 1;
  const isVc = p.isVice === true || p.isVice === "true";

  // ကွင်းဘောင်အဝိုင်း အရောင်သတ်မှတ်ချက် (Captain = ရွှေရောင်၊ Vice = ငွေရောင်၊ ရိုးရိုး = အစိမ်းရောင်)
  const ringColor = isCap ? '#F0D060' : isVc ? '#C0C0C0' : '#2A7A47'; 

  const badge = mult === 3
    ? '<span style="font-size:0.55rem;background:#F0D060;color:#0D2B1A;border-radius:9999px;padding:0 4px;font-weight:900;">3x</span>' 
    : isCap
    ? '<span style="font-size:0.55rem;background:#F0D060;color:#0D2B1A;border-radius:9999px;padding:0 3px;font-weight:900;">C</span>' 
    : isVc
    ? '<span style="font-size:0.55rem;background:#C0C0C0;color:#0D2B1A;border-radius:9999px;padding:0 3px;font-weight:900;">V</span>' 
    : '';

  return `
    <div class="flex flex-col items-center mx-1" style="flex-shrink:0; min-w-[54px];">
      <div class="w-10 h-10 rounded-full flex items-center justify-center mb-0.5 overflow-hidden shadow-lg" style="background:#1F5C36; border:2px solid ${ringColor};">
        <img src="${jerseyPath(p)}" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
             class="w-7.5 h-7.5 object-contain" alt="${p.name}" />
        <span style="display:none;align-items:center;justify-content:center;font-size:0.9rem;">👕</span>
      </div>
      <p class="text-white text-center font-semibold" style="font-size:0.55rem; max-w:52px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.name || "?"}</p>
      <div class="flex items-center gap-0.5 mt-0.5">
        <span style="font-size:0.65rem; color:#F0D060; font-weight:900; background:rgba(0,0,0,0.4); padding:0px 4px; border-radius:3px;">${displayPoints}</span>
        ${badge}
      </div>
    </div>
  `;
}

// 🏟️ Fixed Rows Injection Engine
function renderPitch(data) {
  const picks = data.picks || []; 
  
  // Starters နှင့် Subs တိကျစွာ ခွဲထုတ်ခြင်း (Fail-safe Number Casting)
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0); 
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0); 
  
  const gk = starters.filter(p => String(p.position || "").toLowerCase().trim() === "gk"); 
  const def = starters.filter(p => String(p.position || "").toLowerCase().trim() === "def"); 
  const mid = starters.filter(p => String(p.position || "").toLowerCase().trim() === "mid"); 
  const fwd = starters.filter(p => String(p.position || "").toLowerCase().trim() === "fwd"); 

  const makeRow = (players) => `<div class="flex justify-center flex-nowrap gap-1 w-full">${players.map(playerCard).join("")}</div>`; 

  // HTML Structure Construction
  let htmlContent = "";

  // ပွဲထွက်ကစားသမားများအား HTML ဘက်က .field-section ဖြင့် စည်းအသေခံ၍ မောင်းထုတ်ပေးခြင်း
  htmlContent += `<div class="field-section"> ${makeRow(gk)} </div>`;
  htmlContent += `<div class="field-section"> ${makeRow(def)} </div>`;
  htmlContent += `<div class="field-section"> ${makeRow(mid)} </div>`;
  htmlContent += `<div class="field-section"> ${makeRow(fwd)} </div>`;

  // 📥 ⚙️ BENCH (အရံလူစာရင်း) DISTINCT CONTAINER
  if (subs.length > 0) {
    htmlContent += `
      <div class="mt-2 w-full px-2 py-1 rounded-xl border border-[#C9A84C]/20" style="background: rgba(0,0,0,0.45); flex-shrink:0;">
        <p class="text-center font-black tracking-wide text-[#C9A84C]/60 uppercase mb-1" style="font-size: 0.52rem;">
          📋 BENCH (အရံလူစာရင်း)
        </p>
        <div class="flex justify-around items-center w-full">
    `;
    
    subs.forEach(p => {
      htmlContent += `
        <div class="flex flex-col items-center mx-0.5 relative min-w-[50px]">
          <div class="w-8 h-8 rounded-full flex items-center justify-center mb-0.5 overflow-hidden opacity-75" style="background:#164225; border:1px solid rgba(255,255,255,0.2);">
            <img src="${jerseyPath(p)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="w-6 h-6 object-contain" />
            <span style="display:none;font-size:0.7rem;">👕</span>
          </div>
          <p class="text-white/70 text-center font-medium truncate" style="font-size:0.5rem; max-w:48px;">${p.name || "?"}</p>
          <span style="font-size:0.55rem; color:#C9A84C; font-weight:800; background:rgba(0,0,0,0.3); padding:0 3px; border-radius:2px; mt-0.5">${p.livePoints ?? 0}</span>
        </div>
      `;
    });

    htmlContent += `</div></div>`;
  }

  document.getElementById("pitch").innerHTML = htmlContent;
}

// 🔒 Chat Message Lock Control Engine
function updateChatLock() {
  const input = document.getElementById("chat-input"); 
  const sendBtn = document.getElementById("send-btn"); 
  const lockBanner = document.getElementById("chat-lock-banner"); 
  if (isApproved) {
    input.disabled = false; 
    input.placeholder = "Message ရိုက်ပါ..."; 
    sendBtn.disabled = false; 
    sendBtn.style.opacity = "1"; 
    lockBanner.classList.add("hidden"); 
  } else {
    input.disabled = true; 
    input.placeholder = "Approve ပြီးမှ Chat ရေးနိုင်သည်"; 
    sendBtn.disabled = true; 
    sendBtn.style.opacity = "0.4"; 
    lockBanner.classList.remove("hidden"); 
  }
}

// 💬 Live Chat Real-time Snapshot Watcher
function loadChat() {
  const q = query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(50)); 
  onSnapshot(q, (snapshot) => {
    const msgs = []; 
    snapshot.forEach(d => msgs.unshift({ id: d.id, ...d.data() })); 
    const chatEl = document.getElementById("chat-messages"); 
    if (msgs.length === 0) {
      chatEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#3A9E5F;">Chat မစသေးပါ — ပထမဆုံး Message ရေးလိုက်ပါ</p>`; 
      return;
    }
    chatEl.innerHTML = msgs.map(m => {
      const isSelf = m.uid === currentUser?.uid; 
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : ""; 
      return isSelf
        ? `<div class="flex flex-col items-end mb-3">
            <div class="text-xs mb-1" style="color:#C9A84C;">${m.teamName}</div>
            <div class="rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-xs" style="background:linear-gradient(135deg,#C9A84C,#F0D060);color:#0D2B1A;font-weight:500;">${m.text}</div>
            <div class="text-xs mt-1" style="color:#3A9E5F;">${time}</div>
           </div>` 
        : `<div class="flex flex-col items-start mb-3">
            <div class="text-xs mb-1" style="color:#E8D5A3;">${m.teamName}</div>
            <div class="rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-xs" style="background:#1F5C36;color:white;">${m.text}</div>
            <div class="text-xs mt-1" style="color:#3A9E5F;">${time}</div>
           </div>`; 
    }).join("");
    chatEl.scrollTop = chatEl.scrollHeight; 
  });
}

// 📤 Message Sending Trigger
window.sendMessage = async () => {
  if (!isApproved) return; 
  const input = document.getElementById("chat-input"); 
  const text = input.value.trim(); 
  if (!text || !currentUser) return; 
  input.value = ""; 
  await addDoc(collection(db, "chat"), { text, teamName: currentTeamName, uid: currentUser.uid, createdAt: serverTimestamp() }); 
};

// ⌨️ Keyboard Enter Handler
window.handleKeydown = (e) => { 
  if (e.key === "Enter" && isApproved) window.sendMessage(); 
};
