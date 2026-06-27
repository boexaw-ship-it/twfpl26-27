import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, addDoc, orderBy, query, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null; 
let currentTeamName = ""; 
let isApproved = false; 

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
      
      onSnapshot(doc(db, "liveTeams", data.fplTeamId), (d) => {
        if (d.exists()) renderPitch(d.data()); 
      });
    }
  });

  loadChat(); 
});

function jerseyPath(p) {
  const pos = String(p.position || "").toUpperCase().trim();
  const folder = (pos.startsWith("GK")) ? "gk" : "outfield"; 
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); 
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`; 
}

// 🎯 💡 🏆 MICRO DESIGN OPTIMIZATION
function playerCard(p) {
  const mult = Number(p.multiplier ?? 1); 
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); 
  
  const isCap = p.isCaptain === true || p.isCaptain === "true" || mult > 1;
  const isVc = p.isVice === true || p.isVice === "true";

  let badgeHtml = "";
  if (mult === 3) {
    badgeHtml = `<span class="absolute -top-1 -right-2 bg-[#F0D060] text-black font-black rounded-full text-[8px] w-3.5 h-3.5 flex items-center justify-center border border-black z-10">3x</span>`;
  } else if (isCap) {
    badgeHtml = `<span class="absolute -top-1 -right-2 bg-[#F0D060] text-black font-black rounded-full text-[8px] w-3.5 h-3.5 flex items-center justify-center border border-black z-10">C</span>`;
  } else if (isVc) {
    badgeHtml = `<span class="absolute -top-1 -right-2 bg-white text-black font-black rounded-full text-[8px] w-3.5 h-3.5 flex items-center justify-center border border-black z-10">V</span>`;
  }

  return `
    <div class="flex flex-col items-center mx-0.5 my-0.5 relative min-w-[56px] sm:min-w-[60px]" style="flex-shrink:0;">
      ${badgeHtml}
      <img src="${jerseyPath(p)}" 
           onerror="this.src='/twfpl26-27/public/jerseys/outfield/unknown.png'" 
           class="w-9 h-9 object-contain" alt="${p.name}" />
      <div class="player-box-title mt-0.5 shadow-md rounded-t-sm">${p.name || "?"}</div>
      <div class="player-box-points shadow-md rounded-b-sm">${displayPoints}</div>
    </div>
  `;
}

function renderPitch(data) {
  const picks = data.picks || []; 
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0); 
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0); 
  
  const gk = starters.filter(p => { const pos = String(p.position || "").toUpperCase().trim(); return pos.startsWith("GK"); });
  const def = starters.filter(p => { const pos = String(p.position || "").toUpperCase().trim(); return pos.startsWith("DE"); });
  const mid = starters.filter(p => { const pos = String(p.position || "").toUpperCase().trim(); return pos.startsWith("MI"); });
  const fwd = starters.filter(p => { const pos = String(p.position || "").toUpperCase().trim(); return pos.startsWith("FW") || pos.startsWith("FO"); });

  let htmlContent = "";
  htmlContent += `<div class="pitch-row"> ${gk.map(playerCard).join("")} </div>`;
  htmlContent += `<div class="pitch-row"> ${def.map(playerCard).join("")} </div>`;
  htmlContent += `<div class="pitch-row"> ${mid.map(playerCard).join("")} </div>`;
  htmlContent += `<div class="pitch-row"> ${fwd.map(playerCard).join("")} </div>`;

  if (subs.length > 0) {
    htmlContent += `
      <div class="mt-1 w-full px-1 py-0.5 rounded-xl border border-white/10" style="background: rgba(0,0,0,0.45);">
        <p class="text-center font-bold tracking-wide text-white/40 uppercase mb-0.5" style="font-size: 0.5rem;">
          ⚙️ BENCH (အရံလူစာရင်း)
        </p>
        <div class="flex justify-around items-center w-full">
    `;
    
    subs.forEach(p => {
      htmlContent += `
        <div class="flex flex-col items-center mx-0.5 relative min-w-[48px]">
          <img src="${jerseyPath(p)}" 
               onerror="this.src='/twfpl26-27/public/jerseys/outfield/unknown.png'"
               class="w-7 h-7 object-contain opacity-75" alt="Jersey" />
          <div class="player-box-title mt-0.5 scale-90 origin-bottom" style="max-w: 52px;">${p.name || "?"}</div>
          <div class="player-box-points scale-90 origin-top text-white/60" style="max-w: 52px; background:#111;">${p.livePoints ?? 0}</div>
        </div>
      `;
    });
    htmlContent += `</div></div>`;
  }
  document.getElementById("pitch").innerHTML = htmlContent;
}

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

window.sendMessage = async () => {
  if (!isApproved) return; 
  const input = document.getElementById("chat-input"); 
  const text = input.value.trim(); 
  if (!text || !currentUser) return; 
  input.value = ""; 
  await addDoc(collection(db, "chat"), { text, teamName: currentTeamName, uid: currentUser.uid, createdAt: serverTimestamp() }); 
};

window.handleKeydown = (e) => { 
  if (e.key === "Enter" && isApproved) window.sendMessage(); 
};
