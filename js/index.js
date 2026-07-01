import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Login ဝင်ပြီးသားဆိုရင် dashboard တန်းပို့
onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.location.href = "./pages/dashboard.html";
  }
});

window.handleLogin = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorEl = document.getElementById("error-msg");
  const btnEl = document.getElementById("login-btn");

  if (!email || !password) {
    errorEl.textContent = "Email နှင့် Password ထည့်ပါ။";
    errorEl.classList.remove("hidden");
    return;
  }

  btnEl.disabled = true;
  btnEl.innerHTML = "⏳ Logging in...";
  errorEl.classList.add("hidden");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "./pages/dashboard.html";
  } catch (err) {
    let msg = "Login မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။";
    if (err.code === "auth/user-not-found") msg = "Account မရှိပါ။ Register လုပ်ပါ။";
    if (err.code === "auth/wrong-password") msg = "Password မှားနေသည်။";
    if (err.code === "auth/invalid-email") msg = "Email မှားနေသည်။";
    if (err.code === "auth/invalid-credential") msg = "Email သို့မဟုတ် Password မှားနေသည်။";
    if (err.code === "auth/too-many-requests") msg = "အကြိမ်များလွန်းသည်။ နောက်မှ ထပ်ကြိုးစားပါ။";
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
    btnEl.disabled = false;
    btnEl.innerHTML = "Login";
  }
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.handleLogin();
});

function togglePassword() {
  const pwd = document.getElementById("password");
  pwd.type = pwd.type === "password" ? "text" : "password";
}
window.togglePassword = togglePassword;

// 💡 🎯 🚀 PWA AUTO INSTALL SERVICE WORKER SYSTEM
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Live!', reg))
      .catch(err => console.log('Service Worker Failed!', err));
  });
}

// Auto Prompt Trigger
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  const deferredPrompt = e;
  setTimeout(() => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('App Installed Successfully');
      }
    });
  }, 1000);
});
