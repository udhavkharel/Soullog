// 🔥 Firebase SDKs (MODULAR v10.x – STABLE)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ✅ Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBidG87JdnPE5TA1pA3xGq8t6R7HV4qBp8",
    authDomain: "mobile-app-f5d2a.firebaseapp.com",
    databaseURL: "https://mobile-app-f5d2a-default-rtdb.firebaseio.com",
    projectId: "mobile-app-f5d2a",
    storageBucket: "mobile-app-f5d2a.appspot.com",
    messagingSenderId: "503556979466",
    appId: "1:503556979466:web:237e8629dd005c784998f3"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Initialize services
const auth = getAuth(app);
const db = getDatabase(app);

console.log("Firebase initialized from firebase.js");

export { auth, db };
