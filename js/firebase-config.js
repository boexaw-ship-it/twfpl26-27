// ============================================
// TW Fantasy Official League
// Firebase Configuration — Central Config File
// ⚠️ ဒီ file တစ်ခုထဲမှာ မင်းရဲ့ Keys ထည့်ပါ
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⚠️ မင်းရဲ့ Firebase Keys ဒီနေရာမှာ ထည့်ပါ
const firebaseConfig = {
  apiKey: "AIzaSyAqRX8hRprmH233Tj8hTdd_K85ABVr-rko",
  authDomain: "tw-fpl-26-27.firebaseapp.com",
  projectId: "tw-fpl-26-27",
  storageBucket: "tw-fpl-26-27.firebasestorage.app",
  messagingSenderId: "257650730355",
  appId: "1:257650730355:web:f72c5dcdf8332367435106"
};

// Firebase Initialize
const app = initializeApp(firebaseConfig);

// Export — files တွေကနေ import လုပ်သုံးရမည်
export const auth = getAuth(app);
export const db = getFirestore(app);

