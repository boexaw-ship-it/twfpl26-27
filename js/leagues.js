import { auth, db } from "/twfpl26-27/js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let userTeamId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/twfpl26-27/index.html"; return; }
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (userSnap.exists()) {
    userTeamId = userSnap.data().fplTeamId;
  }
  loadLeagueStandings();
});

async function loadLeagueStandings() {
  try {
    const querySnapshot = await getDocs(collection(db, "leagues", "h2h_1", "standings"));
    const standings = [];
    querySnapshot.forEach((doc) => {
      standings.push({ id: doc.id, ...doc.data() });
    });

    // 🏆 အမှတ်အများဆုံးအသင်းအား ထိပ်ဆုံးမှ စီစဉ်ခြင်း
    standings.sort((a, b) => (b.total || 0) - (a.total || 0));
    renderStandings(standings);
  } catch (error) {
    console.error("Error loading standings:", error);
  }
}

function renderStandings(standings) {
  const listEl = document.getElementById("league-list");
  if (!listEl) return;

  listEl.innerHTML = standings.map((team, index) => {
    const isMe = team.id === userTeamId ? "border-l-4 border-[#C9A84C] bg-[#1A4B2A]" : "bg-[#1F5C36]";
    return `
      <div onclick="window.openTeamPopup('${team.id}', '${team.name}')" 
           class="rounded-xl p-3 mb-2 flex items-center justify-between cursor-pointer active:scale-[0.99] transition ${isMe}" 
           style="border:1px solid #2A7A47;">
        <div class="flex items-center gap-3">
          <span class="font-black text-sm text-[#E8D5A3]" style="width:20px;">${index + 1}</span>
          <div>
            <p class="text-white text-sm font-bold tracking-wide">${team.name}</p>
            <p class="text-[10px] text-white/50">Manager: ${team.managerName || "Unknown"}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm font-black" style="color:#C9A84C; font-family:'Bebas Neue'; font-size:1.2rem; line-height:1;">${team.total || 0}</p>
          <p class="text-[9px] text-[#E8D5A3]/70">GW Pts: ${team.gwPoints || 0}</p>
        </div>
      </div>
    `;
  }).join("");
}

// 👕 ဂျာစီပုံရိပ်လမ်းကြောင်း ရယူခြင်း
function getJerseyUrl(p) {
  const pos = String(p.position || "").toLowerCase().trim();
  const folder = pos === "gk" ? "gk" : "outfield";
  const code = String(p.teamCode || "unknown").toLowerCase().trim();
  return `/twfpl26-27/public/jerseys/${folder}/${code}.png`;
}

// 🏆 Popup အတွင်း ကစားသမားကတ်ပြား ပုံဖော်ခြင်း (အမဲရောင် လေးထောင့် Point စနစ်စစ်စစ်)
function generatePlayerCard(p) {
  const mult = p.multiplier || 1;
  const displayPoints = (p.livePoints ?? 0) * (mult > 1 ? mult : 1);
  
  const cornerBadge = mult === 3
    ? '<span class="absolute top-0 -right-1 bg-[#F0D060] text-[#0D2B1A] text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow z-20">3x</span>'
    : p.isCaptain
    ? '<span class="absolute top-0 -right-1 bg-[#F0D060] text-[#0D2B1A] text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow z-20">C</span>'
    : p.isVice
    ? '<span class="absolute top-0 -right-1 bg-[#C0C0C0] text-[#0D2B1A] text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shadow z-20">V</span>'
    : '';

  const borderHighlight = p.isCaptain ? 'border-b-2 border-b-[#F0D060]' : p.isVice ? 'border-b-2 border-b-[#C0C0C0]' : '';

  return `
    <div class="w-[62px] flex flex-col items-center relative">
      <div class="w-12 h-12 flex items-center justify-center mb-[2px] relative ${borderHighlight}">
        <img src="${getJerseyUrl(p)}" onerror="this.outerHTML='👕'" class="w-full h-full object-contain drop-shadow" />
        ${cornerBadge}
      </div>
      <div class="w-full flex flex-col rounded overflow-hidden shadow">
        <div class="w-full bg-white px-0.5 py-0.5 text-center flex items-center justify-center" style="height:15px;">
          <p class="text-[#0D2B1A] font-black text-[8px] leading-none tracking-tight truncate w-full">${p.name || "?"}</p>
        </div>
        <div class="w-full bg-black text-white text-center flex items-center justify-center font-black text-[9px]" style="height:14px;">
          ${displayPoints}
        </div>
      </div>
    </div>
  `;
}

// ⚡ 💡 အဆင့်မြှင့်တင်မှု: ရွေးချယ်ထားသောအသင်းအား Starters ၁၁ ယောက်နှင့် Bench ၄ ယောက် တိကျစွာ ခွဲထုတ်ပြသခြင်း
window.openTeamPopup = async function(teamId, teamName) {
  const modal = document.getElementById("team-modal");
  document.getElementById("modal-team-title").textContent = teamName.toUpperCase();
  
  document.getElementById("modal-pitch-rows").innerHTML = `<p class="text-center text-xs py-12 text-white/60">Loading pitch alignment...</p>`;
  document.getElementById("modal-bench-row").innerHTML = "";
  
  modal.classList.remove("hidden");
  modal.style.display = "flex";

  try {
    const liveTeamSnap = await getDoc(doc(db, "liveTeams", teamId));
    const livePointsSnap = await getDoc(doc(db, "livePoints", teamId));

    if (livePointsSnap.exists()) {
      const lp = livePointsSnap.data();
      document.getElementById("modal-hit").textContent = `Hit: -${lp.transferCost || 0}`;
      document.getElementById("modal-gw-pts").textContent = `GW Pts: ${lp.gwPoints ?? 0}`;
      document.getElementById("modal-total-pts").textContent = `Total: ${lp.total ?? 0}`;
      document.getElementById("modal-chip").textContent = lp.activeChip ? String(lp.activeChip).toUpperCase() : "NO CHIP";
    }

    if (liveTeamSnap.exists()) {
      const picks = liveTeamSnap.data().picks || [];

      const starters = picks.filter(p => Number(p.multiplier ?? 1) > 0);
      const subs = picks.filter(p => Number(p.multiplier ?? 1) === 0);

      const gk = starters.filter(p => String(p.position || "").toLowerCase().trim() === "gk");
      const def = starters.filter(p => String(p.position || "").toLowerCase().trim() === "def");
      const mid = starters.filter(p => String(p.position || "").toLowerCase().trim() === "mid");
      const fwd = starters.filter(p => String(p.position || "").toLowerCase().trim() === "fwd");

      // 💡 🏆 FIXED HIGH SAFEGUARD: ၅ ယောက်တန်းစီလာလျှင် ဘေးဘောင်မကျော်စေရန် အော်တို ညှိပေးမည့် Dynamic Master Row
      const renderPopupRow = (players) => {
        const gapClass = players.length >= 5 ? "gap-x-1" : "gap-x-2";
        return `
          <div class="flex justify-center items-center ${gapClass} w-full overflow-visible">
            ${players.map(p => generatePlayerCard(p)).join("")}
          </div>
        `;
      };

      // 💡 ✅ Syntax Error ကို အပြီးတိုင်ဖြေရှင်းချက်: လေးတန်းစလုံးအား renderPopupRow ဖြင့် တစ်သမတ်တည်း နေရာချခြင်း
      document.getElementById("modal-pitch-rows").innerHTML = `
        <div class="flex flex-col justify-between h-full py-1.5 space-y-3.5">
          ${renderPopupRow(gk)}
          ${renderPopupRow(def)}
          ${renderPopupRow(mid)}
          ${renderPopupRow(fwd)}
        </div>
      `;

      // အရန်လူ ၄ ယောက်အား အောက်ခြေ BENCH Frame ထဲသို့ သီးသန့် မောင်းထည့်ခြင်း
      document.getElementById("modal-bench-row").innerHTML = subs.map(p => {
        const posLabel = String(p.position || "").toUpperCase();
        return `
          <div class="flex flex-col items-center gap-y-0.5">
            <span class="text-[8px] font-black text-[#E8D5A3] uppercase opacity-60">${posLabel}</span>
            ${generatePlayerCard(p)}
          </div>
        `;
      }).join("");
    }
  } catch (error) {
    console.error("Error fetching team popup data:", error);
  }
};

window.closeTeamPopup = function() {
  const modal = document.getElementById("team-modal");
  modal.classList.add("hidden");
  modal.style.display = "none";
};
