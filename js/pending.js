    import { auth, db } from "../js/firebase-config.js";
    import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
    import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

    onAuthStateChanged(auth, (user) => {
      if (!user) { window.location.href = "../index.html"; return; }
      onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          document.getElementById("team-name").textContent = data.teamName || "";
          if (data.status === "approved") window.location.href = "../pages/dashboard.html";
          if (data.status === "rejected") {
            document.getElementById("status-area").innerHTML = `
              <div class="text-center">
                <div class="text-4xl mb-3">❌</div>
                <p class="font-semibold text-red-400">Register Ngat Ppe Khan Ra Thal</p>
                <p class="text-xs mt-2 text-red-300">Admin Ko Sat Thwal Par</p>
              </div>`;
          }
        }
      });
    });

    window.handleLogout = async () => {
      await signOut(auth);
      window.location.href = "../index.html";
    };
  
