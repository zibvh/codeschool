// ─────────────────────────────────────────────
//  app.js — codeSchool Firebase module
//  Import this in any page that needs Firebase
// ─────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  enableNetwork,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ──────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDjSs8AoDt6bG4-_FxWJbRLFM0tyR2S2D0",
  authDomain:        "codeschool-41f52.firebaseapp.com",
  projectId:         "codeschool-41f52",
  storageBucket:     "codeschool-41f52.firebasestorage.app",
  messagingSenderId: "224975256200",
  appId:             "1:224975256200:web:68ffc1a1160f3315d77d3d",
};

// ── Initialise ───────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── EmailJS config — fill in your own ───────
const EMAILJS_SERVICE_ID       = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_STUDENT = "YOUR_STUDENT_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY       = "YOUR_EMAILJS_PUBLIC_KEY";

// ── Race-condition flags ─────────────────────
let _googleSignInInProgress = false;
let _signupInProgress       = false;
let _loginInProgress        = false;

// ── Helpers ──────────────────────────────────
function isValidEmail(email) {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) &&
    !/@(test\.com|fake\.com|example\.com|mailinator\.com|guerrillamail\.com|yopmail\.com|sharklasers\.com|throwam\.com|trashmail\.com|tempmail\.com|10minutemail\.com|disposablemail\.com)/i.test(email)
  );
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className   = "toast show " + (type || "");
  setTimeout(() => t.classList.remove("show"), 3200);
}

function setLoading(btn, loading) {
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? '<span class="spinner"></span>Please wait\u2026'
    : btn.dataset.label || btn.textContent;
}

async function sendWelcomeEmail(email, firstName) {
  try {
    if (!window.emailjs) {
      await new Promise((res, rej) => {
        const s  = document.createElement("script");
        s.src    = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    }
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_STUDENT, {
      to_email:      email,
      to_name:       firstName || "Student",
      dashboard_url: "student-dashboard.html",
      platform_name: "codeSchool",
    });
  } catch (e) {
    console.warn("Welcome email failed:", e);
  }
}

function showUnverifiedPrompt(email) {
  const existing = document.getElementById("unverified-prompt");
  if (existing) existing.remove();
  const anchor = document.getElementById("login-email");
  const div    = document.createElement("div");
  div.id        = "unverified-prompt";
  div.style.cssText =
    "background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.25);border-radius:10px;padding:.85rem 1rem;margin-top:.75rem;font-family:var(--mono);font-size:.72rem;color:#F59E0B;line-height:1.65;";
  div.innerHTML = `
    <strong>Email not verified.</strong><br>
    Check your inbox for a verification link.<br>
    Also check <strong>Spam</strong> / <strong>Promotions</strong>.<br><br>
    <button onclick="resendVerification('${email}',this)"
      style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:.35rem .85rem;color:#F59E0B;font-family:var(--mono);font-size:.68rem;cursor:pointer;">
      Resend Verification Email
    </button>`;
  if (anchor) {
    const fg = anchor.closest(".form-group") || anchor.parentNode;
    if (fg) fg.insertAdjacentElement("afterend", div);
  }
  showToast("Verify your email before logging in.", "error");
}

function showVerifyBanner(email) {
  const card = document.querySelector(".auth-card");
  if (!card) return;
  card.innerHTML = `
    <div style="text-align:center;padding:2rem 1.6rem;">
      <div style="font-family:var(--display);font-size:1.3rem;font-weight:800;margin-bottom:.6rem;">Verify Your Email</div>
      <div style="font-family:var(--mono);font-size:.78rem;color:var(--gray);line-height:1.7;margin-bottom:1rem;">
        We sent a verification link to<br>
        <strong style="color:var(--white);">${email}</strong><br><br>
        Click that link, then come back here to log in.
      </div>
      <div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:1rem;font-family:var(--mono);font-size:.7rem;color:var(--gray);line-height:1.7;margin-bottom:1.25rem;">
        Don't see it? Check <strong style="color:var(--white);">Spam</strong> or <strong style="color:var(--white);">Promotions</strong>.
      </div>
      <button style="width:100%;padding:.8rem;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:10px;color:var(--white);font-family:var(--mono);font-size:.72rem;cursor:pointer;margin-bottom:.75rem;"
        onclick="resendVerification('${email}',this)">Resend Verification Email</button>
      <a href="auth.html" style="font-family:var(--mono);font-size:.72rem;color:var(--gray);">Back to Login</a>
    </div>`;
}

// ── Redirect result (Google / GitHub) ───────
(async () => {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return;
    const user = result.user;
    _googleSignInInProgress = true;

    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const profile = snap.data();
      if (profile.status === "suspended") {
        showToast("Account suspended. Contact support.", "error");
        await signOut(auth);
        _googleSignInInProgress = false;
        return;
      }
      if (profile.role !== "student") {
        showToast("Wrong Portal", "error");
        await signOut(auth);
        _googleSignInInProgress = false;
        return;
      }
      _googleSignInInProgress = false;
      showToast("Logging in\u2026", "success");
      setTimeout(() => { window.location.href = "student-dashboard.html"; }, 700);
    } else {
      const nameParts = (user.displayName || "").split(" ");
      const firstName = nameParts[0] || "Student";
      const lastName  = nameParts.slice(1).join(" ") || "";
      const provider  = result.providerId === "github.com" ? "github" : "google";
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid, firstName, lastName,
        fullName: user.displayName || firstName,
        email: user.email || "", phone: "",
        role: "student", status: "active",
        emailVerified: true, provider,
        createdAt: serverTimestamp(),
      });
      sendWelcomeEmail(user.email, firstName);
      _googleSignInInProgress = false;
      showToast("Account created! Logging in\u2026", "success");
      setTimeout(() => { window.location.href = "student-dashboard.html"; }, 900);
    }
  } catch (e) {
    if (e.code === "auth/account-exists-with-different-credential") {
      showToast("An account already exists with this email!", "error");
    } else if (e.code && e.code !== "auth/popup-closed-by-user") {
      console.error("[codeSchool]", e.code, e.message);
      showToast("Sign-in failed, please try again", "error");
    }
    _googleSignInInProgress = false;
  }
})();

// ── Auto-redirect if already logged in ──────
onAuthStateChanged(auth, async (user) => {
  if (!user || _googleSignInInProgress || _signupInProgress || _loginInProgress) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;
    const role = snap.data().role;
    if (role === "student")    window.location.href = "student-dashboard.html";
    else if (role === "admin") window.location.href = "admin-dashboard.html";
  } catch (e) { /* offline */ }
});

// ── LOGIN ────────────────────────────────────
window.handleLogin = async function () {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-pw").value;
  const btn   = document.getElementById("btn-login");
  if (!email || !pw) { showToast("Please fill in all fields.", "error"); return; }
  setLoading(btn, true);
  try {
    try { await enableNetwork(db); } catch (_) {}
    _loginInProgress = true;
    const cred    = await signInWithEmailAndPassword(auth, email, pw);
    const snapPre = await getDoc(doc(db, "users", cred.user.uid));
    const adminVerified = snapPre.exists() && snapPre.data().isVerified === true;

    if (!cred.user.emailVerified && !adminVerified) {
      _loginInProgress = false;
      await signOut(auth);
      setLoading(btn, false);
      showUnverifiedPrompt(email);
      return;
    }

    let profile;
    if (!snapPre.exists()) {
      const pendingSnap = await getDoc(doc(db, "pending_users", cred.user.uid));
      if (!pendingSnap.exists()) {
        _loginInProgress = false;
        showToast("Account not found. Please sign up.", "error");
        await signOut(auth);
        setLoading(btn, false);
        return;
      }
      const pendingData  = pendingSnap.data();
      const promotedData = { ...pendingData, emailVerified: true };
      await setDoc(doc(db, "users", cred.user.uid), promotedData);
      try { await deleteDoc(doc(db, "pending_users", cred.user.uid)); } catch (_) {}
      sendWelcomeEmail(pendingData.email, pendingData.firstName || pendingData.fullName);
      profile = promotedData;
    } else {
      profile = snapPre.data();
    }

    if (profile.status === "suspended") {
      _loginInProgress = false;
      showToast("Account suspended. Contact support.", "error");
      await signOut(auth);
      setLoading(btn, false);
      return;
    }
    if (profile.role !== "student") {
      _loginInProgress = false;
      showToast("Incorrect email or password.", "error");
      await signOut(auth);
      setLoading(btn, false);
      return;
    }

    _loginInProgress = false;
    showToast("Logging in\u2026", "success");
    setTimeout(() => { window.location.href = "student-dashboard.html"; }, 700);
  } catch (e) {
    const msgs = {
      "auth/user-not-found":     "No account with this email.",
      "auth/wrong-password":     "Incorrect password.",
      "auth/invalid-email":      "Invalid email address.",
      "auth/too-many-requests":  "Too many attempts. Try again later.",
      "auth/invalid-credential": "Email or password is incorrect.",
    };
    _loginInProgress = false;
    showToast(msgs[e.code] || "Sign-in failed \u2014 please try again", "error");
    setLoading(btn, false);
  }
};

// ── SIGNUP ───────────────────────────────────
window.handleSignup = async function () {
  const v     = (id) => document.getElementById(id)?.value.trim();
  const email = v("s-email");
  if (!v("s-fname") || !v("s-lname") || !email || !v("s-phone")) {
    showToast("Please fill in all fields.", "error"); return;
  }
  if (!isValidEmail(email)) { showToast("Please enter a real email address.", "error"); return; }
  const pw  = document.getElementById("s-pw").value;
  const pw2 = document.getElementById("s-pw2").value;
  if (pw.length < 6) { showToast("Password must be at least 6 characters.", "error"); return; }
  if (pw !== pw2)    { showToast("Passwords do not match.", "error"); return; }
  if (!document.getElementById("s-terms").checked) {
    showToast("Please accept the Terms of Service.", "error"); return;
  }

  const btn = document.getElementById("btn-signup");
  setLoading(btn, true);
  _signupInProgress = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, "pending_users", cred.user.uid), {
      uid: cred.user.uid,
      firstName: v("s-fname"),
      lastName:  v("s-lname"),
      fullName:  v("s-fname") + " " + v("s-lname"),
      email, phone: v("s-phone"),
      role: "student", status: "active",
      emailVerified: false,
      createdAt: serverTimestamp(),
    });
    await sendEmailVerification(cred.user);
    await signOut(auth);
    _signupInProgress = false;
    showVerifyBanner(email);
    setLoading(btn, false);
  } catch (e) {
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email":        "That doesn't look like a valid email address.",
      "auth/weak-password":        "Password is too weak \u2014 use at least 6 characters.",
    };
    _signupInProgress = false;
    showToast(msgs[e.code] || "Something went wrong \u2014 please try again", "error");
    setLoading(btn, false);
  }
};

// ── PASSWORD RESET ───────────────────────────
async function handlePasswordReset(email, anchorEl) {
  if (!email) {
    showToast("Enter your email address first, then click Forgot password.", "error");
    return;
  }
  const existing = document.getElementById("reset-feedback");
  if (existing) existing.remove();
  try {
    await sendPasswordResetEmail(auth, email);
    const div = document.createElement("div");
    div.id    = "reset-feedback";
    div.style.cssText =
      "background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:10px;padding:.85rem 1rem;margin-top:.75rem;font-family:var(--mono);font-size:.72rem;color:#22C55E;line-height:1.65;";
    div.innerHTML = `Reset email sent to <strong style="color:var(--white);">${email}</strong><br><br>
      <span style="color:var(--gray);">Check <strong style="color:var(--white);">Spam</strong> / <strong style="color:var(--white);">Promotions</strong> if you don't see it.</span>`;
    if (anchorEl) {
      const fg = anchorEl.closest(".form-group") || anchorEl.parentNode;
      if (fg) fg.insertAdjacentElement("afterend", div);
    }
  } catch (e) {
    const msgs = {
      "auth/invalid-email":     "That email address is not valid.",
      "auth/too-many-requests": "Too many requests. Wait a few minutes.",
      "auth/user-not-found":    "No account found with this email.",
    };
    showToast(msgs[e.code] || "Reset failed \u2014 check your email and try again", "error");
  }
}

// ── RESEND VERIFICATION ──────────────────────
window.resendVerification = async function (email, btn) {
  const pw = prompt("Enter your password to resend the verification email:");
  if (!pw) return;
  btn.textContent = "Sending\u2026";
  btn.disabled    = true;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pw);
    if (cred.user.emailVerified) {
      await signOut(auth);
      showToast("Email already verified \u2014 you can log in!", "success");
      setTimeout(() => { window.location.href = "auth.html"; }, 1500);
      return;
    }
    await sendEmailVerification(cred.user);
    await signOut(auth);
    showToast("Verification email resent \u2014 check your inbox.", "success");
  } catch (e) {
    showToast(
      e.code === "auth/wrong-password"
        ? "Wrong password entered"
        : "Could not resend \u2014 check your connection",
      "error"
    );
  }
  btn.textContent = "Resend Verification Email";
  btn.disabled    = false;
};

// ── GOOGLE SIGN-IN ───────────────────────────
window.handleGoogleSignIn = async function () {
  const btn = document.getElementById("btn-login-google");
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Redirecting\u2026'; }
  try {
    await signInWithRedirect(auth, new GoogleAuthProvider());
  } catch (e) {
    console.error("[codeSchool]", e.code, e.message);
    showToast("Google sign-in failed \u2014 please try again", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = "Google"; }
  }
};

// ── GITHUB SIGN-IN ───────────────────────────
window.handleGithubSignIn = async function () {
  const btn = document.getElementById("btn-login-github");
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Redirecting\u2026'; }
  try {
    await signInWithRedirect(auth, new GithubAuthProvider());
  } catch (e) {
    console.error("[codeSchool]", e.code, e.message);
    showToast("GitHub sign-in failed \u2014 please try again", "error");
    if (btn) { btn.disabled = false; btn.innerHTML = "GitHub"; }
  }
};

// ── Forgot-password link — call after DOMContentLoaded ──
export function wireForgotLink() {
  const link = document.getElementById("forgot-link");
  if (!link) return;
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    await handlePasswordReset(
      document.getElementById("login-email").value.trim(),
      e.currentTarget
    );
  });
}

export { app, auth, db };
