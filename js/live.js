import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, addDoc, orderBy, query, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null; //
let currentTeamName = ""; //
let isApproved = false; //

// 📡 Firebase User Auth & Real-time Live Point/Team Listener
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; } //
  currentUser = user; //

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return; //
    const data = snap.data(); //
    currentTeamName = data.teamName || ""; //
    document.getElementById("user-team").textContent = currentTeamName; //
    isApproved = data.status === "approved"; //
    updateChatLock(); //

    if (data.fplTeamId) {
      // 1. livePoints Collection Watcher (အမှတ်နှင့် Summary ဒေတာများ ရယူခြင်း)
      onSnapshot(doc(db, "livePoints", data.fplTeamId), (d) => {
        if (d.exists()) {
          document.getElementById("gw-points").textContent = d.data().gwPoints ?? "—"; //
          document.getElementById("overall-pts").textContent = d.data().totalPoints ?? "—"; //
          document.getElementById("overall-rank").textContent = d.data().overallRank ?? "—"; //
          document.getElementById("captain-pts").textContent = d.data().captainPoints ?? "—"; //
          document.getElementById("gw-rank").textContent = d.data().gwRank ?? "—"; //
          const hit = d.data().transferCost || 0; //
          document.getElementById("hit-label").textContent = "Hit: -" + hit; //
          const chip = d.data().activeChip; //
          document.getElementById("chip-badge").textContent = chip ? chip : "NO CHIP"; //
        }
      });
      
      // 2. liveTeams Collection Watcher (ကွင်းပြင်လူစာရင်း ရယူခြင်း)
      onSnapshot(doc(db, "liveTeams", data.fplTeamId), (d) => {
        if (d.exists()) renderPitch(d.data()); //
      });
    }
  });

  loadChat(); //
});

// 👕 🎨 ဂျာစီပုံရိပ်များ၏ ပတ်လမ်းကြောင်းအား စာလုံးအသေးစနစ်ဖြင့် ရယူခြင်း
function jerseyPath(p) {
  // weekly-live-sync.js ဒေတာနှင့်ကိုက်ညီစေရန် position အား lowercase ပြောင်း၍ gk ခွဲခြားခြင်း
  const posClean = String(p.position || "").toLowerCase().trim();
  const folder = posClean === "gk" ? "gk" : "outfield"; //
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); //
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; //
}

// 📛 Player Card ကတ်ပြားဒီဇိုင်းပုံစံစစ်စစ် (Live View သီးသန့် အဝိုင်းဒီဇိုင်းလေး)
function playerCard(p) {
  const mult = p.multiplier || 1; //
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); //
  
  // 💡 weekly-live-sync.js ၏ field အမှန်အတိုင်း isCaptain နှင့် isVice စာလုံးအသေးများဖြင့် စနစ်တကျထောက်လှမ်းခြင်း
  const isCap = p.isCaptain === true || p.isCaptain === "true" || mult > 1;
  const isVc = p.isVice === true || p.isVice === "true";

  const ring = isCap ? '#F0D060' : isVc ? '#C0C0C0' : '#2A7A47'; //

  const badge = mult === 3
    ? '<span style="font-size:0.55rem;background:#F0D060;color:#0D2B1A;border-radius:9999px;padding:0 4px;font-weight:900;">3x</span>' //
    : isCap
    ? '<span style="font-size:0.55rem;background:#F0D060;color:#0D2B1A;border-radius:9999px;padding:0 3px;font-weight:900;">C</span>' //
    : isVc
    ? '<span style="font-size:0.55rem;background:#C0C0C0;color:#0D2B1A;border-radius:9999px;padding:0 3px;font-weight:900;">V</span>' //
    : '';

  return `
    <div class="flex flex-col items-center" style="flex-shrink:0;">
      <div class="w-9 h-9 rounded-full flex items-center justify-center mb-1 overflow-hidden" style="background:#1F5C36;border:2px solid ${ring};">
        <img src="${jerseyPath(p)}" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
             class="w-7 h-7 object-contain" alt="${p.name}" />
        <span style="display:none;align-items:center;justify-content:center;font-size:0.95rem;">👕</span>
      </div>
      <p class="text-white text-center font-medium" style="font-size:0.55rem;max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name || "?"}</p>
      <div class="flex items-center gap-1 mt-0.5">
        <span style="font-size:0.6rem;color:#C9A84C;font-weight:700;">${displayPoints}</span>
        ${badge}
      </div>
    </div>
  `;
}

// 🏟️ Starters နှင့် Subs ခွဲထုတ်၍ Live Pitch ကွင်းပြင်ပုံဖော်ခြင်း
function renderPitch(data) {
  const picks = data.picks || []; //
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0); //
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0); //
  
  // 💡 weekly-live-sync.js ၏ ဒေတာအဝင်အတိုင်း စာလုံးအသေး (gk, def, mid, fwd) ဖြင့် အုပ်စုခွဲခြားခြင်း
  const gk = starters.filter(p => String(p.position || "").toLowerCase().trim() === "gk"); //
  const def = starters.filter(p => String(p.position || "").toLowerCase().trim() === "def"); //
  const mid = starters.filter(p => String(p.position || "").toLowerCase().trim() === "mid"); //
  const fwd = starters.filter(p => String(p.position || "").toLowerCase().trim() === "fwd"); //

  const render = (players) => `<div class="flex justify-center flex-nowrap gap-1.5">${players.map(playerCard).join("")}</div>`; //

  document.getElementById("pitch").innerHTML = `
    <div class="space-y-3">
      ${render(gk)}
      <div style="border-top:1px solid rgba(255,255,255,0.4);"></div>
      ${render(def)}
      <div style="border-top:1px solid rgba(255,255,255,0.4);"></div>
      ${render(mid)}
      <div style="border-top:1px solid rgba(255,255,255,0.4);"></div>
      ${render(fwd)}
    </div>
    <div style="border-top:2px dashed rgba(201,168,76,0.3);margin:10px 0;"></div>
    <div class="flex justify-center flex-nowrap gap-1.5">${subs.map(playerCard).join("")}</div>
  `; //
}

// 🔒 Chat Message Lock Control Engine
function updateChatLock() {
  const input = document.getElementById("chat-input"); //
  const sendBtn = document.getElementById("send-btn"); //
  const lockBanner = document.getElementById("chat-lock-banner"); //
  if (isApproved) {
    input.disabled = false; //
    input.placeholder = "Message ရိုက်ပါ..."; //
    sendBtn.disabled = false; //
    sendBtn.style.opacity = "1"; //
    lockBanner.classList.add("hidden"); //
  } else {
    input.disabled = true; //
    input.placeholder = "Approve ပြီးမှ Chat ရေးနိုင်သည်"; //
    sendBtn.disabled = true; //
    sendBtn.style.opacity = "0.4"; //
    lockBanner.classList.remove("hidden"); //
  }
}

// 💬 Live Chat Real-time Snapshot Watcher
function loadChat() {
  const q = query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(50)); //
  onSnapshot(q, (snapshot) => {
    const msgs = []; //
    snapshot.forEach(d => msgs.unshift({ id: d.id, ...d.data() })); //
    const chatEl = document.getElementById("chat-messages"); //
    if (msgs.length === 0) {
      chatEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#3A9E5F;">Chat မစသေးပါ — ပထမဆုံး Message ရေးလိုက်ပါ</p>`; //
      return;
    }
    chatEl.innerHTML = msgs.map(m => {
      const isSelf = m.uid === currentUser?.uid; //
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : ""; //
      return isSelf
        ? `<div class="flex flex-col items-end mb-3">
            <div class="text-xs mb-1" style="color:#C9A84C;">${m.teamName}</div>
            <div class="rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-xs" style="background:linear-gradient(135deg,#C9A84C,#F0D060);color:#0D2B1A;font-weight:500;">${m.text}</div>
            <div class="text-xs mt-1" style="color:#3A9E5F;">${time}</div>
           </div>` //
        : `<div class="flex flex-col items-start mb-3">
            <div class="text-xs mb-1" style="color:#E8D5A3;">${m.teamName}</div>
            <div class="rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-xs" style="background:#1F5C36;color:white;">${m.text}</div>
            <div class="text-xs mt-1" style="color:#3A9E5F;">${time}</div>
           </div>`; //
    }).join("");
    chatEl.scrollTop = chatEl.scrollHeight; //
  });
}

// 📤 Message Sending Trigger
window.sendMessage = async () => {
  if (!isApproved) return; //
  const input = document.getElementById("chat-input"); //
  const text = input.value.trim(); //
  if (!text || !currentUser) return; //
  input.value = ""; //
  await addDoc(collection(db, "chat"), { text, teamName: currentTeamName, uid: currentUser.uid, createdAt: serverTimestamp() }); //
};

// ⌨️ Keyboard Enter Handler
window.handleKeydown = (e) => { 
  if (e.key === "Enter" && isApproved) window.sendMessage(); 
};
