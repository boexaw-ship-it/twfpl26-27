import { auth, db } from "../js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, collection, addDoc, deleteDoc, orderBy, query, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null; 
let currentTeamName = ""; 
let isApproved = false; 

// Reply/Delete State Variables
let activeReplyId = null; 
let selectedMessageData = null; 

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../index.html"; return; } 
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
          // Robust checking for real-time Firebase Data Injection
          if(document.getElementById("gw-points")) document.getElementById("gw-points").textContent = d.data().gwPoints ?? "—"; 
          if(document.getElementById("overall-pts")) document.getElementById("overall-pts").textContent = d.data().totalPoints ?? "—"; 
          if(document.getElementById("overall-rank")) document.getElementById("overall-rank").textContent = d.data().overallRank ?? "—"; 
          if(document.getElementById("captain-pts")) document.getElementById("captain-pts").textContent = d.data().captainPoints ?? "—"; 
          if(document.getElementById("gw-rank")) document.getElementById("gw-rank").textContent = d.data().gwRank ?? "—"; 
          
          if(document.getElementById("hit-label")) {
            const hit = d.data().transferCost || 0; 
            document.getElementById("hit-label").textContent = "Hit: -" + hit; 
          }
          if(document.getElementById("chip-badge")) {
            const chip = d.data().activeChip; 
            document.getElementById("chip-badge").textContent = chip ? chip : "NO CHIP"; 
          }
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
  const folder = (pos === "GK" || pos === "GKP") ? "gk" : "outfield"; 
  const code = String(p.teamCode || "unknown").toLowerCase().trim(); 
  return `../public/jerseys/${folder}/${code}.png`; 
}

function playerCard(p, isBench = false) {
  const mult = Number(p.multiplier ?? 1); 
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1); 
  const isCap = p.isCaptain === true || p.isCaptain === "true" || mult > 1;
  const isVc = p.isVice === true || p.isVice === "true";
  const ringColor = isBench ? '#C9A84C' : isCap ? '#F0D060' : isVc ? '#C0C0C0' : '#2A7A47'; 

  const badge = mult === 3
    ? '<span style="position:absolute; top:-3px; right:-5px; font-size:0.5rem; background:#F0D060; color:#0D2B1A; border-radius:9999px; width:13px; height:13px; display:flex; align-items:center; justify-content:center; font-weight:900; border:1px solid #000; z-index:10;">3x</span>' 
    : isCap
    ? '<span style="position:absolute; top:-3px; right:-5px; font-size:0.52rem; background:#F0D060; color:#0D2B1A; border-radius:9999px; width:13px; height:13px; display:flex; align-items:center; justify-content:center; font-weight:900; border:1px solid #000; z-index:10;">C</span>' 
    : isVc
    ? '<span style="position:absolute; top:-3px; right:-5px; font-size:0.52rem; background:#C0C0C0; color:#0D2B1A; border-radius:9999px; width:13px; height:13px; display:flex; align-items:center; justify-content:center; font-weight:900; border:1px solid #000; z-index:10;">V</span>' 
    : '';

  return `
    <div class="flex flex-col items-center mx-1" style="flex-shrink:0; min-w-[50px]; filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.55));">
      <div class="w-8 h-8 rounded-full flex items-center justify-center mb-0.5 overflow-visible relative" style="background:#1F5C36; border:2px solid ${ringColor};">
        <img src="${jerseyPath(p)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" class="w-6.5 h-6.5 object-contain rounded-full" alt="${p.name}" />
        <span style="display:none;align-items:center;justify-content:center;font-size:0.8rem;">👕</span>
        ${badge}
      </div>
      <p class="text-white text-center font-bold" style="font-size:0.52rem; max-w:48px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.name || "?"}</p>
      <div class="flex items-center gap-0.5 mt-0.5">
        <span style="font-size:0.65rem; color:#F0D060; font-weight:900; background:rgba(0,0,0,0.65); padding:0px 4px; border-radius:2px; line-height:1.1; border:0.5px solid rgba(255,255,255,0.05);">${displayPoints}</span>
      </div>
    </div>
  `;
}

function renderPitch(data) {
  const picks = data.picks || []; 
  const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0); 
  const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0); 
  
  const gk = starters.filter(p => { const pos = String(p.position || "").toUpperCase().trim(); return pos === "GK" || pos === "GKP"; });
  const def = starters.filter(p => String(p.position || "").toUpperCase().trim() === "DEF");
  const mid = starters.filter(p => String(p.position || "").toUpperCase().trim() === "MID");
  const fwd = starters.filter(p => String(p.position || "").toUpperCase().trim() === "FWD");

  const makeRow = (players) => `<div class="field-row"> ${players.map(p => playerCard(p, false)).join("")} </div>`; 

  let htmlContent = `
    ${makeRow(gk)}
    ${makeRow(def)}
    ${makeRow(mid)}
    ${makeRow(fwd)}
  `;
  if(document.getElementById("pitch")) document.getElementById("pitch").innerHTML = htmlContent;

  let benchContent = "";
  if (subs.length > 0) {
    benchContent += `
      <div class="w-full px-2 py-1.5 rounded-xl border border-[#C9A84C]/30" style="background: rgba(0,0,0,0.15);">
        <p class="text-center font-black tracking-wide text-[#C9A84C]/70 uppercase mb-1" style="font-size: 0.5rem; letter-spacing: 0.05em;">
          📋 BENCH
        </p>
        <div class="flex justify-around items-center w-full">
          ${subs.map(p => playerCard(p, true)).join("")}
        </div>
      </div>
    `;
  }
  if(document.getElementById("bench-container")) document.getElementById("bench-container").innerHTML = benchContent;
}

function updateChatLock() {
  const input = document.getElementById("chat-input"); 
  const sendBtn = document.getElementById("send-btn"); 
  const lockBanner = document.getElementById("chat-lock-banner"); 
  if (!input || !sendBtn || !lockBanner) return;

  if (isApproved) {
    input.disabled = false; 
    input.placeholder = "Type a message..."; 
    sendBtn.disabled = false; 
    sendBtn.style.opacity = "1"; 
    lockBanner.classList.add("hidden"); 
  } else {
    input.disabled = true; 
    input.placeholder = "Chat unlocks once approved"; 
    sendBtn.disabled = true; 
    sendBtn.style.opacity = "0.4"; 
    lockBanner.classList.remove("hidden"); 
  }
}

function loadChat() {
  const q = query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(55)); 
  onSnapshot(q, (snapshot) => {
    const msgs = []; 
    snapshot.forEach(d => msgs.unshift({ id: d.id, ...d.data() })); 
    const chatEl = document.getElementById("chat-messages"); 
    if (!chatEl) return;

    if (msgs.length === 0) {
      chatEl.innerHTML = `<p class="text-center text-xs py-8" style="color:#7A8B82;">No messages yet — send the first one</p>`; 
      return;
    }

    window.chatMessagesCache = msgs; 

    chatEl.innerHTML = msgs.map(m => {
      const isSelf = m.uid === currentUser?.uid; 
      const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : ""; 
      
      let replyBoxHtml = "";
      if (m.replyToName && m.replyToText) {
        replyBoxHtml = `
          <div class="text-[10px] bg-[#F4F7F2] rounded px-2 py-1 mb-1 border-l-2 border-[#C9A84C] max-w-xs text-left truncate" style="color: #5B7566;">
             ↩️ <b>${m.replyToName}</b>: ${m.replyToText}
          </div>
        `;
      }

      return isSelf
        ? `<div class="flex flex-col items-end mb-3 cursor-pointer" onclick="window.openOptionsModal('${m.id}')">
            <div class="text-xs mb-1 font-semibold" style="color:#8A6D22;">${m.teamName}</div>
            ${replyBoxHtml}
            <div class="rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-xs" style="background:linear-gradient(135deg,#C9A84C,#F0D060);color:#0D2B1A;font-weight:500; text-align:left;">${m.text}</div>
            <div class="text-[9px] mt-1" style="color:#9AA8A0;">${time}</div>
           </div>` 
        : `<div class="flex flex-col items-start mb-3 cursor-pointer" onclick="window.openOptionsModal('${m.id}')">
            <div class="text-xs mb-1 font-semibold" style="color:#1B4D2E;">${m.teamName}</div>
            ${replyBoxHtml}
            <div class="rounded-2xl rounded-bl-sm px-4 py-2 text-sm max-w-xs" style="background:#1F5C36;color:white; text-align:left;">${m.text}</div>
            <div class="text-[9px] mt-1" style="color:#9AA8A0;">${time}</div>
           </div>`; 
    }).join("");
    chatEl.scrollTop = chatEl.scrollHeight; 
  });
}

window.sendMessage = async () => {
  if (!isApproved) return; 
  const input = document.getElementById("chat-input"); 
  if (!input) return;
  const text = input.value.trim(); 
  if (!text || !currentUser) return; 

  const payload = {
    text: text,
    teamName: currentTeamName,
    uid: currentUser.uid,
    createdAt: serverTimestamp()
  };

  if (activeReplyId && selectedMessageData) {
    payload.replyToId = activeReplyId;
    payload.replyToName = selectedMessageData.teamName;
    payload.replyToText = selectedMessageData.text;
  }

  input.value = ""; 
  window.cancelReply(); 
  await addDoc(collection(db, "chat"), payload); 
};

window.openOptionsModal = (msgId) => {
  if (!isApproved) return;
  const found = window.chatMessagesCache?.find(m => m.id === msgId);
  if (!found) return;

  selectedMessageData = found;
  const previewEl = document.getElementById("modal-msg-preview");
  if(previewEl) previewEl.textContent = `"${found.text}"`;
  
  const deleteBtn = document.getElementById("modal-delete-btn");
  if(deleteBtn) {
    if (found.uid === currentUser?.uid) {
      deleteBtn.classList.remove("hidden");
    } else {
      deleteBtn.classList.add("hidden");
    }
  }

  const modal = document.getElementById("message-options-modal");
  if(modal) modal.classList.remove("hidden");
};

window.closeOptionsModal = () => {
  const modal = document.getElementById("message-options-modal");
  if(modal) modal.classList.add("hidden");
};

if(document.getElementById("modal-reply-btn")) {
  document.getElementById("modal-reply-btn").onclick = () => {
    if (!selectedMessageData) return;
    activeReplyId = selectedMessageData.id;

    if(document.getElementById("reply-target-name")) document.getElementById("reply-target-name").textContent = `Reply to ${selectedMessageData.teamName}`;
    if(document.getElementById("reply-target-text")) document.getElementById("reply-target-text").textContent = selectedMessageData.text;
    if(document.getElementById("reply-preview-bar")) document.getElementById("reply-preview-bar").classList.remove("hidden");
    
    window.closeOptionsModal();
    if(document.getElementById("chat-input")) document.getElementById("chat-input").focus();
  };
}

window.cancelReply = () => {
  activeReplyId = null;
  if(document.getElementById("reply-preview-bar")) document.getElementById("reply-preview-bar").classList.add("hidden");
};

if(document.getElementById("modal-delete-btn")) {
  document.getElementById("modal-delete-btn").onclick = async () => {
    if (!selectedMessageData) return;
    window.closeOptionsModal();
    try {
      await deleteDoc(doc(db, "chat", selectedMessageData.id));
    } catch (error) {
      console.error("Error deleting message: ", error);
    }
  };
}

window.handleKeydown = (e) => { 
  if (e.key === "Enter" && isApproved) window.sendMessage(); 
};

