
 import {
  auth,
  db,
  signOut,
  onAuthStateChanged,
  getDoc,
  doc,
  collection,
  query,
  where,
  getDocs,
  loadUserPermissions,
  checkUserPermission,
  getPermissionErrorMessage,
} from "./firebase.js";

console.log("📄 modules.js loaded - displaying modules page");

let authCheckCompleted = false;

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const adminPortalBtn = document.getElementById("adminPortalBtn");

  // Function to setup module card with permission checking
  const setupModuleCard = (moduleElement, href, hasAccess) => {
    const btn = moduleElement.querySelector('.module-btn');
    if (!btn) return;

    if (hasAccess) {
      // Has access - make it a link
      btn.onclick = () => {
        window.location.href = href;
      };
      btn.style.cursor = "pointer";
      btn.style.opacity = "1";
      btn.innerHTML = '<span>Open</span><i class="fa-solid fa-arrow-right"></i>';
    } else {
      // No access - show permission denied
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPermissionAlert();
      };
      btn.style.cursor = "not-allowed";
      btn.style.opacity = "0.6";
      btn.style.background = "#ff6b6b";
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> <span>No Access</span>';
    }
  };

  // Function to show permission alert
  const showPermissionAlert = () => {
    const alert = document.createElement("div");
    alert.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff6b6b;
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
    alert.textContent = "❌ You don't have permission to view this module!";
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 4200);
  };

  // Check if user is logged in and set up role-based access
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (sessionStorage.getItem('isLoggingOut') === 'true') return;
    if (authCheckCompleted) return;
    
    if (!user) {
      authCheckCompleted = true;
      window.location.href = "login.html";
      unsubscribe();
      return;
    }

    try {
      let userRole = null;
      
      // Try warehouse_users first to avoid admin record overriding warehouse role
      let userDoc = await getDoc(doc(db, "warehouse_users", user.uid));
      if (userDoc.exists()) {
        userRole = userDoc.data().role;
      } else {
        // Then try to get user from inventory_users, purchasing_users, attendance_users, finance_users, admin_users, or employees
        userDoc = await getDoc(doc(db, "inventory_users", user.uid));
        if (userDoc.exists()) {
          userRole = userDoc.data().role;
        } else {
          userDoc = await getDoc(doc(db, "purchasing_users", user.uid));
          if (userDoc.exists()) {
            userRole = userDoc.data().role;
          } else {
            userDoc = await getDoc(doc(db, "attendance_users", user.uid));
            if (userDoc.exists()) {
              userRole = userDoc.data().role;
            } else {
              userDoc = await getDoc(doc(db, "finance_users", user.uid));
              if (userDoc.exists()) {
                userRole = userDoc.data().role;
              } else {
                userDoc = await getDoc(doc(db, "admin_users", user.uid));
                if (userDoc.exists()) {
                  userRole = userDoc.data().role;
                } else {
                  // Check employees collection (for attendance module employees)
                  userDoc = await getDoc(doc(db, "employees", user.uid));
                  if (userDoc.exists()) {
                    userRole = userDoc.data().role;
                  }
                }
              }
            }
          }
        }
      }

      // If still not found, try querying by email
      if (!userRole) {
        let q = query(collection(db, "warehouse_users"), where("email", "==", user.email));
        let qSnap = await getDocs(q);
        if (!qSnap.empty) {
          userRole = qSnap.docs[0].data().role;
        } else {
          q = query(collection(db, "inventory_users"), where("email", "==", user.email));
          qSnap = await getDocs(q);
          if (!qSnap.empty) {
            userRole = qSnap.docs[0].data().role;
          } else {
            q = query(collection(db, "purchasing_users"), where("email", "==", user.email));
            qSnap = await getDocs(q);
            if (!qSnap.empty) {
              userRole = qSnap.docs[0].data().role;
            } else {
              q = query(collection(db, "attendance_users"), where("email", "==", user.email));
              qSnap = await getDocs(q);
              if (!qSnap.empty) {
                userRole = qSnap.docs[0].data().role;
              } else {
                q = query(collection(db, "finance_users"), where("email", "==", user.email));
                qSnap = await getDocs(q);
                if (!qSnap.empty) {
                  userRole = qSnap.docs[0].data().role;
                } else {
                  q = query(collection(db, "admin_users"), where("email", "==", user.email));
                  qSnap = await getDocs(q);
                  if (!qSnap.empty) {
                    userRole = qSnap.docs[0].data().role;
                  } else {
                    // Check employees collection
                    q = query(collection(db, "employees"), where("email", "==", user.email));
                    qSnap = await getDocs(q);
                    if (!qSnap.empty) {
                      userRole = qSnap.docs[0].data().role;
                    }
                  }
                }
              }
            }
          }
        }
      }

      const role = (userRole || "").toLowerCase();

      console.log("🔍 DEBUG: Detected user role:", role);
      console.log("🔍 DEBUG: Admin button element:", adminPortalBtn);

      // 🔐 Load user permissions for action-based access control
      await loadUserPermissions(user.uid);
      console.log("✅ User permissions loaded for permission checking");

      // Check for user restrictions
      let userRestrictions = null;
      try {
        // Try loading by user.uid first, then by user.email as fallback
        let restrictionDoc = await getDoc(doc(db, "user_restrictions", user.uid));
        
        // If not found by uid, try by email
        if (!restrictionDoc.exists() && user.email) {
          const q = query(collection(db, "user_restrictions"), where("userId", "==", user.uid));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.docs.length > 0) {
            restrictionDoc = querySnapshot.docs[0];
          }
        }
        
        if (restrictionDoc.exists()) {
          userRestrictions = restrictionDoc.data();
          console.log("⚠️ User restrictions found:", userRestrictions);
        }
      } catch (err) {
        console.error("Error checking restrictions:", err);
      }

      // Show/hide modules based on role
      const inventoryModule = document.querySelector('[data-module="inventory"]');
      const attendanceModule = document.querySelector('[data-module="attendance"]');
      const purchasingModule = document.querySelector('[data-module="purchasing"]');
      const financeModule = document.querySelector('[data-module="finance"]');

      if (role === "admin") {
        // Admin can see everything
        console.log("✅ Detected ADMIN role - showing all modules and admin button");
        if (inventoryModule) {
          inventoryModule.style.display = "flex";
          setupModuleCard(inventoryModule, "dashboard.html", true);
        }
        if (attendanceModule) {
          attendanceModule.style.display = "flex";
          setupModuleCard(attendanceModule, "attendance.html", true);
        }
        if (purchasingModule) {
          purchasingModule.style.display = "flex";
          setupModuleCard(purchasingModule, "purchasing.html", true);
        }
        if (financeModule) {
          financeModule.style.display = "flex";
          setupModuleCard(financeModule, "finance.html", true);
        }
        adminPortalBtn.style.cssText = "display: flex !important;";
      } else {
        // All non-admin users cannot access admin portal
        console.log("❌ Not admin - hiding admin button for role:", role);
        adminPortalBtn.style.cssText = "display: none !important;";
        
        // Default: NO access to any module
        let finalAccess = {
          inventory: false,
          attendance: false,
          purchasing: false,
          finance: false
        };

        // If user has module restrictions set by admin, use allowedModules array
        if (userRestrictions && userRestrictions.allowedModules && Array.isArray(userRestrictions.allowedModules)) {
          console.log("✅ User has module restrictions - allowed modules:", userRestrictions.allowedModules);
          // Only these modules are accessible
          finalAccess.inventory = userRestrictions.allowedModules.includes("inventory");
          finalAccess.attendance = userRestrictions.allowedModules.includes("attendance");
          finalAccess.purchasing = userRestrictions.allowedModules.includes("purchasing");
          finalAccess.finance = userRestrictions.allowedModules.includes("finance");
        } else {
          // No restrictions - user gets default access based on role
          console.log("⚠️ No module restrictions found - allowing default access by role");
          if (role === "inventory") finalAccess.inventory = true;
          if (role === "warehouse") finalAccess.inventory = true;
          if (role === "purchasing") finalAccess.purchasing = true;
          if (role === "attendance") finalAccess.attendance = true;
          if (role === "finance") finalAccess.finance = true;
        }

        // Apply access based on finalAccess object for all non-employee roles
        if (role !== "employee") {
          // Show all modules with appropriate access
          if (inventoryModule) {
            inventoryModule.style.display = "flex";
            setupModuleCard(inventoryModule, "dashboard.html", finalAccess.inventory);
          }
          if (attendanceModule) {
            attendanceModule.style.display = "flex";
            setupModuleCard(attendanceModule, "attendance.html", finalAccess.attendance);
          }
          if (purchasingModule) {
            purchasingModule.style.display = "flex";
            setupModuleCard(purchasingModule, "purchasing.html", finalAccess.purchasing);
          }
          if (financeModule) {
            financeModule.style.display = "flex";
            setupModuleCard(financeModule, "finance.html", finalAccess.finance);
          }
        } else if (role === "employee") {
          // Employees can ONLY access attendance module
          console.log("✅ Detected EMPLOYEE role - showing only attendance module");
          if (inventoryModule) {
            inventoryModule.style.display = "none";
          }
          if (attendanceModule) {
            attendanceModule.style.display = "flex";
            setupModuleCard(attendanceModule, "employee-dashboard.html", true);
          }
          if (purchasingModule) {
            purchasingModule.style.display = "none";
          }
          if (financeModule) {
            financeModule.style.display = "none";
          }
        }
      }

      // Add click handler for admin portal if visible
      if (adminPortalBtn.style.display === "flex") {
        adminPortalBtn.addEventListener("click", () => {
          window.location.href = "admin.html";
        });
      }

      authCheckCompleted = true;
      unsubscribe();
    } catch (e) {
      console.error("Error fetching user data:", e);
      authCheckCompleted = true;
      unsubscribe();
    }
  });

  // Logout functionality
  logoutBtn.addEventListener("click", async () => {
    try {
      localStorage.removeItem('authCheckDone');
      sessionStorage.clear(); // Clear all session storage
      unsubscribe(); // Unsubscribe from auth listener first
      authCheckCompleted = true;
      await signOut(auth);
      setTimeout(() => {
        window.location.href = "login.html";
      }, 200);
    } catch (e) {
      console.error("Logout error:", e);
      authCheckCompleted = false;
    }
  });
});
