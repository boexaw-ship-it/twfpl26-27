import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { initRealtimeInsights } from "./insights.js";
import { loadFixturesFromLocalJSON, buildCustomDropdownOptions } from "./fixtures.js";

// Global Modal Trigger functions for script access
window.showPremiumAlertBox = (message, icon = "⚠️") => {
  document.getElementById("premium-alert-icon").textContent = icon;
  document.getElementById("premium-alert-message").textContent = message;
  const m = document.getElementById("premium-alert-modal");
  m.classList.remove("hidden"); m.style.display = "flex";
};
window.closePremiumAlertBox = () => {
  const m = document.getElementById("premium-alert-modal");
  m.classList.add("hidden"); m.style.display = "none";
};

const headerRow = document.getElementById("fixture-header-row");
for (let gw = 1; gw <= 38; gw++) {
  headerRow.innerHTML += `<th style="border-color:rgba(30,106,60,0.15); padding:10px 4px; text-align:center;" class="border-r">GW${gw}</th>`;
}

document.querySelectorAll("#fixture-table-body tr").forEach(row => {
  const team = row.getAttribute("data-team");
  let cellsHtml = "";
  for (let gw = 1; gw <= 38; gw++) {
    cellsHtml += `<td id="${team}-gw${gw}" style="border-color:rgba(30,106,60,0.15); text-align:center;" class="border-r">—</td>`;
  }
  row.innerHTML += cellsHtml;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../index.html"; return; }
  initRealtimeInsights(user.uid);
  loadFixturesFromLocalJSON();
  buildCustomDropdownOptions(plTeams);
});

const plTeams = [
  { code: "ALL", name: "Show All Teams" }, { code: "ARS", name: "Arsenal" }, { code: "AVL", name: "Aston Villa" },
  { code: "BHA", name: "Brighton" }, { code: "BOU", name: "Bournemouth" }, { code: "BRE", name: "Brentford" },
  { code: "CHE", name: "Chelsea" }, { code: "COV", name: "Coventry City" }, { code: "CRY", name: "Crystal Palace" },
  { code: "EVE", name: "Everton" }, { code: "FUL", name: "Fulham" }, { code: "HUL", name: "Hull City" },
  { code: "IPS", name: "Ipswich Town" }, { code: "LEE", name: "Leeds United" }, { code: "LIV", name: "Liverpool" },
  { code: "MCI", name: "Man City" }, { code: "MUN", name: "Man United" }, { code: "NEW", name: "Newcastle" },
  { code: "NFO", name: "Nottm Forest" }, { code: "SUN", name: "Sunderland" }, { code: "TOT", name: "Tottenham" }
];

window.openTeamModal = () => { const m = document.getElementById("team-modal"); m.classList.remove("hidden"); m.style.display = "flex"; };
window.closeTeamModal = () => { const m = document.getElementById("team-modal"); m.classList.add("hidden"); m.style.display = "none"; };
window.selectTeamFilter = (code, label) => {
  document.getElementById("selected-team-label").textContent = label; closeTeamModal();
  document.querySelectorAll('#fixture-table-body tr').forEach(r => {
    if (code === 'ALL' || r.getAttribute('data-team') === code) r.classList.remove('hidden'); else r.classList.add('hidden');
  });
};

function switchDraftTab(tabId) {
  document.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
  document.getElementById('seg-' + tabId).classList.add('active');
  document.getElementById('view-' + tabId).classList.remove('hidden');
}
window.switchDraftTab = switchDraftTab;
