import {
  auth,
  db,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  getDoc,
  doc,
  collection,
  query,
  where,
  getDocs
} from "./firebase.js";

function showAlert(message, type = "error") {
  const alert = document.createElement("div");
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "success" ? "#0a9b03" : "#ff6b6b"};
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    z-index: 3000;
    max-width: 420px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    text-align: left;
    line-height: 1.4;
  `;
  alert.textContent = message;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 4200);
}

// Check if user is already logged in - redirect based on role
let authCheckCompleted = false;
const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
  // Don't redirect if we're in logout mode or already checked
  if (localStorage.getItem('authCheckDone') === 'true') return;
  if (sessionStorage.getItem('isLoggingOut') === 'true') {
    sessionStorage.removeItem('isLoggingOut');
    return;
  }
  if (authCheckCompleted) return;
  
  // Wait a moment to ensure page is fully loaded before checking
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (user) {
    try {
      let userDocSnap = await getDoc(doc(db, "admin_user", user.uid));
      let userData = null;

      if (userDocSnap.exists()) {
        userData = userDocSnap.data();
      } else {
        // Try admin_users collection (legacy)
        userDocSnap = await getDoc(doc(db, "admin_users", user.uid));
        if (userDocSnap.exists()) {
          userData = userDocSnap.data();
        } else {
          // Try inventory_users collection
          userDocSnap = await getDoc(doc(db, "inventory_users", user.uid));
          if (userDocSnap.exists()) {
            userData = userDocSnap.data();
          } else {
            // Try warehouse_users collection
            userDocSnap = await getDoc(doc(db, "warehouse_users", user.uid));
            if (userDocSnap.exists()) {
              userData = userDocSnap.data();
            } else {
              // Try purchasing_users collection
              userDocSnap = await getDoc(doc(db, "purchasing_users", user.uid));
              if (userDocSnap.exists()) {
                userData = userDocSnap.data();
              } else {
                // Try attendance_users collection
                userDocSnap = await getDoc(doc(db, "attendance_users", user.uid));
                if (userDocSnap.exists()) {
                  userData = userDocSnap.data();
                } else {
                  // Fallback: query by email in all collections
                  let q = query(collection(db, "admin_users"), where("email", "==", user.email));
                  let qSnap = await getDocs(q);
                  if (!qSnap.empty) {
                    userData = qSnap.docs[0].data();
                  } else {
                    q = query(collection(db, "inventory_users"), where("email", "==", user.email));
                    qSnap = await getDocs(q);
                    if (!qSnap.empty) {
                      userData = qSnap.docs[0].data();
                    } else {
                      q = query(collection(db, "warehouse_users"), where("email", "==", user.email));
                      qSnap = await getDocs(q);
                      if (!qSnap.empty) {
                        userData = qSnap.docs[0].data();
                      } else {
                        q = query(collection(db, "purchasing_users"), where("email", "==", user.email));
                        qSnap = await getDocs(q);
                        if (!qSnap.empty) {
                          userData = qSnap.docs[0].data();
                        } else {
                          q = query(collection(db, "attendance_users"), where("email", "==", user.email));
                          qSnap = await getDocs(q);
                          if (!qSnap.empty) {
                            userData = qSnap.docs[0].data();
                          } else {
                            q = query(collection(db, "finance_users"), where("email", "==", user.email));
                            qSnap = await getDocs(q);
                            if (!qSnap.empty) {
                              userData = qSnap.docs[0].data();
                            } else {
                              // Check employees collection
                              q = query(collection(db, "employees"), where("email", "==", user.email));
                              qSnap = await getDocs(q);
                              if (!qSnap.empty) {
                                userData = qSnap.docs[0].data();
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (userData) {
        authCheckCompleted = true;
        localStorage.setItem('authCheckDone', 'true');
        unsubscribeAuth();
        window.location.href = "modules.html";
      }
    } catch (e) {
      console.error("Error checking user role:", e);
      authCheckCompleted = true;
      localStorage.setItem('authCheckDone', 'true');
      unsubscribeAuth();
      window.location.href = "modules.html";
    }
  } else {
    authCheckCompleted = true;
    localStorage.setItem('authCheckDone', 'true');
    unsubscribeAuth();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("loginBtn");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("togglePassword");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const forgotPasswordModal = document.getElementById("forgotPasswordModal");
  const closeForgotModal = document.getElementById("closeForgotModal");
  const cancelForgotBtn = document.getElementById("cancelForgotBtn");
  const sendResetBtn = document.getElementById("sendResetBtn");
  const forgotPasswordEmail = document.getElementById("forgotPasswordEmail");

  // Password visibility toggle
  togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.classList.toggle("fa-eye");
    togglePassword.classList.toggle("fa-eye-slash");
  });

  // Forgot password button
  forgotPasswordBtn.addEventListener("click", (e) => {
    e.preventDefault();
    forgotPasswordModal.classList.add("active");
    forgotPasswordEmail.value = "";
    forgotPasswordEmail.focus();
  });

  // Close forgot password modal
  closeForgotModal.addEventListener("click", () => {
    forgotPasswordModal.classList.remove("active");
  });

  cancelForgotBtn.addEventListener("click", () => {
    forgotPasswordModal.classList.remove("active");
  });

  // Send reset email
  sendResetBtn.addEventListener("click", handleForgotPassword);
  forgotPasswordEmail.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleForgotPassword();
  });

  async function handleForgotPassword() {
    const email = (forgotPasswordEmail.value || "").trim();
    
    if (!email) {
      showAlert("❌ Please enter your email address!", "error");
      forgotPasswordEmail.focus();
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert("❌ Please enter a valid email address!", "error");
      forgotPasswordEmail.focus();
      return;
    }

    sendResetBtn.disabled = true;
    sendResetBtn.textContent = "Sending...";

    try {
      await sendPasswordResetEmail(auth, email);
      showAlert(`✅ Password reset link sent to ${email}!\n\nCheck your email inbox.\nIf you don't see it, check your spam folder.\nLink expires in 1 hour.`, "success");
      forgotPasswordModal.classList.remove("active");
      forgotPasswordEmail.value = "";
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = "Send Reset Link";
    } catch (err) {
      console.error("Forgot password error:", err);
      if (err.code === "auth/user-not-found") {
        showAlert("❌ Email not found!\n\nPlease check the email address and try again.", "error");
      } else if (err.code === "auth/invalid-email") {
        showAlert("❌ Invalid email format!", "error");
      } else {
        showAlert(`❌ Error: ${err.message}`, "error");
      }
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = "Send Reset Link";
    }
  }

  // Login button click
  loginBtn.addEventListener("click", handleLogin);

  // Enter key to login
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  async function handleLogin() {
    const email = (emailInput.value || "").trim();
    const password = (passwordInput.value || "").trim();

    if (!email) {
      showAlert("❌ Email is required!", "error");
      emailInput.focus();
      return;
    }
    if (!password) {
      showAlert("❌ Password is required!", "error");
      passwordInput.focus();
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user data from Firestore - check admin_user collection first
      let userDocSnap = await getDoc(doc(db, "admin_user", user.uid));
      let userData = null;

      if (userDocSnap.exists()) {
        userData = userDocSnap.data();
      } else {
        // Try admin_users collection (legacy)
        userDocSnap = await getDoc(doc(db, "admin_users", user.uid));
        if (userDocSnap.exists()) {
          userData = userDocSnap.data();
        } else {
          // Try inventory_users collection
          userDocSnap = await getDoc(doc(db, "inventory_users", user.uid));
          if (userDocSnap.exists()) {
            userData = userDocSnap.data();
          } else {
            // Try warehouse_users collection
            userDocSnap = await getDoc(doc(db, "warehouse_users", user.uid));
            if (userDocSnap.exists()) {
              userData = userDocSnap.data();
            } else {
              // Try purchasing_users collection
              userDocSnap = await getDoc(doc(db, "purchasing_users", user.uid));
              if (userDocSnap.exists()) {
                userData = userDocSnap.data();
              } else {
                // Try attendance_users collection
                userDocSnap = await getDoc(doc(db, "attendance_users", user.uid));
                if (userDocSnap.exists()) {
                  userData = userDocSnap.data();
                } else {
                  // Try finance_users collection
                  userDocSnap = await getDoc(doc(db, "finance_users", user.uid));
                  if (userDocSnap.exists()) {
                    userData = userDocSnap.data();
                  } else {
                    // Try employees collection
                    userDocSnap = await getDoc(doc(db, "employees", user.uid));
                    if (userDocSnap.exists()) {
                      userData = userDocSnap.data();
                    } else {
                      // Fallback: query by email in all collections
                      let q = query(collection(db, "admin_user"), where("email", "==", user.email));
                      let qSnap = await getDocs(q);
                      if (!qSnap.empty) {
                        userData = qSnap.docs[0].data();
                      } else {
                        q = query(collection(db, "inventory_users"), where("email", "==", user.email));
                        qSnap = await getDocs(q);
                        if (!qSnap.empty) {
                          userData = qSnap.docs[0].data();
                        } else {
                          q = query(collection(db, "warehouse_users"), where("email", "==", user.email));
                          qSnap = await getDocs(q);
                          if (!qSnap.empty) {
                            userData = qSnap.docs[0].data();
                          } else {
                            q = query(collection(db, "purchasing_users"), where("email", "==", user.email));
                            qSnap = await getDocs(q);
                            if (!qSnap.empty) {
                              userData = qSnap.docs[0].data();
                            } else {
                              q = query(collection(db, "attendance_users"), where("email", "==", user.email));
                              qSnap = await getDocs(q);
                              if (!qSnap.empty) {
                                userData = qSnap.docs[0].data();
                              } else {
                                q = query(collection(db, "finance_users"), where("email", "==", user.email));
                                qSnap = await getDocs(q);
                                if (!qSnap.empty) {
                                  userData = qSnap.docs[0].data();
                                } else {
                                  // Check employees collection
                                  q = query(collection(db, "employees"), where("email", "==", user.email));
                                  qSnap = await getDocs(q);
                                  if (!qSnap.empty) {
                                    userData = qSnap.docs[0].data();
                                  } else {
                                    showAlert("❌ User not found in database. Contact your administrator.", "error");
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (!userData) {
        showAlert("❌ User profile not found!", "error");
        await auth.signOut();
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
        return;
      }

      // If role is not set, assume it's an employee
      if (!userData.role) {
        userData.role = 'employee';
      }

      // Check if user is disabled
      if (userData.status === "disabled" || userData.status === "inactive") {
        showAlert("❌ Your account has been disabled. Please contact the administrator.", "error");
        await auth.signOut();
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
        return;
      }

      console.log("✅ User authenticated successfully, redirecting to modules page...");
      showAlert("✅ Login successful!", "success");

      setTimeout(() => {
        console.log("🔄 Redirecting to modules.html");
        window.location.href = "modules.html";
      }, 1000);

    } catch (e) {
      let errorMsg = "❌ Login failed!";
      if (e.code === "auth/invalid-email") errorMsg = "❌ Invalid email format!";
      else if (e.code === "auth/user-not-found") errorMsg = "❌ Email not found!";
      else if (e.code === "auth/wrong-password") errorMsg = "❌ Wrong password!";
      else if (e.code === "auth/invalid-credential") errorMsg = "❌ Invalid credentials!";

      showAlert(errorMsg, "error");
      loginBtn.disabled = false;
      loginBtn.textContent = "Login";
    }
  }
});