    import { auth, db } from "../js/firebase-config.js";
    import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
    import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = "../index.html"; return; }

      onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        document.getElementById("team-name").textContent = data.teamName || "";
        document.getElementById("fpl-id").textContent = "Team ID: " + (data.fplTeamId || "—");
        document.getElementById("welcome-name").textContent = data.teamName || "TW Fantasy League";

        const badge = document.getElementById("status-badge");
        if (data.status === "approved") {
          badge.textContent = "Approved";
          badge.style.background = "rgba(27,77,46,0.1)";
          badge.style.color = "#1B4D2E";
          badge.style.borderColor = "rgba(27,77,46,0.3)";
        } else if (data.status === "rejected") {
          badge.textContent = "Rejected";
          badge.style.background = "rgba(220,38,38,0.08)";
          badge.style.color = "#B91C1C";
          badge.style.borderColor = "rgba(220,38,38,0.25)";
        } else {
          badge.textContent = "Pending approval";
          badge.style.background = "rgba(201,168,76,0.14)";
          badge.style.color = "#8A6D22";
          badge.style.borderColor = "rgba(201,168,76,0.35)";
        }

        const infoBanner = document.getElementById("pending-banner");
        if (data.status !== "approved") {
          infoBanner.classList.remove("hidden");
        } else {
          infoBanner.classList.add("hidden");
        }
      });
    });

    window.handleLogout = async () => { await signOut(auth); window.location.href = "../index.html"; };
    window.navigate = (page) => {
      const pages = {
        team: "../pages/team.html",
        live: "../pages/live.html",
        leagues: "../pages/leagues.html",
        fixtures: "../pages/fixtures.html",
        scout: "../pages/scout.html",
        draft: "../pages/draft.html"
      };
      if (pages[page]) window.location.href = pages[page];
    };
  
