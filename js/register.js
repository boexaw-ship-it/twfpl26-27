    import { auth, db } from "../js/firebase-config.js";
    import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
    import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

    window.handleRegister = async () => {
      const teamName = document.getElementById("teamName").value.trim();
      const fplId = document.getElementById("fplId").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();
      const errorEl = document.getElementById("error-msg");
      const btnEl = document.getElementById("register-btn");

      if (!teamName || !fplId || !email || !password) {
        errorEl.textContent = "အချက်အလက်အားလုံး ဖြည့်ပါ။";
        errorEl.classList.remove("hidden"); return;
      }
      if (password.length < 6) {
        errorEl.textContent = "Password အနည်းဆုံး ၆ လုံး ထည့်ပါ။";
        errorEl.classList.remove("hidden"); return;
      }

      btnEl.disabled = true;
      btnEl.innerHTML = "⏳ Registering...";
      errorEl.classList.add("hidden");

      try {
        const uc = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", uc.user.uid), {
          teamName, fplTeamId: fplId, email,
          status: "pending", createdAt: serverTimestamp()
        });
        // Approve မရသေးလည်း Dashboard တန်းပို့ (View only access)
        window.location.href = "../pages/dashboard.html";
      } catch (err) {
        let msg = "Register မအောင်မြင်ပါ။";
        if (err.code === "auth/email-already-in-use") msg = "ဒီ Email နှင့် Account ရှိပြီးသား။";
        if (err.code === "auth/invalid-email") msg = "Email မှားနေသည်။";
        if (err.code === "auth/weak-password") msg = "Password အားနည်းလွန်းသည်။";
        errorEl.textContent = msg;
        errorEl.classList.remove("hidden");
        btnEl.disabled = false;
        btnEl.innerHTML = "Register လုပ်ရန်";
      }
    };
  
