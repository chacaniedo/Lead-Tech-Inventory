import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getDoc,
  doc,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where
} from "./firebase.js";

let allUsers = [];
let allWarehouses = [];
let allTrades = [];
let allProjectColumns = [];
let currentUser = null;
let unsubscribeAuth = null;
let editingUserId = null;
let editingWarehouseId = null;
let editingRestrictionUserId = null;
let currentRestrictionMode = "per-user";
let roleChart = null;
let statusChart = null;

// ==================== DASHBOARD FUNCTIONS ====================
async function loadDashboard() {
  try {
    // Calculate stats
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(u => u.status === "active").length;
    const disabledUsers = allUsers.filter(u => u.status === "disabled").length;
    const totalWarehouses = allWarehouses.length;

    // Update stat cards
    document.getElementById("totalUsersCount").textContent = totalUsers;
    document.getElementById("activeUsersCount").textContent = activeUsers;
    document.getElementById("disabledUsersCount").textContent = disabledUsers;
    document.getElementById("totalWarehousesCount").textContent = totalWarehouses;

    // Calculate role distribution
    const roleCounts = {};
    allUsers.forEach(user => {
      const role = user.role || "unknown";
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    // Create role distribution chart
    const roleCtx = document.getElementById("roleChart");
    if (roleCtx) {
      if (roleChart) roleChart.destroy();
      roleChart = new Chart(roleCtx, {
        type: "doughnut",
        data: {
          labels: Object.keys(roleCounts).map(r => r.charAt(0).toUpperCase() + r.slice(1)),
          datasets: [{
            data: Object.values(roleCounts),
            backgroundColor: [
              "rgba(10, 155, 3, 0.8)",
              "rgba(29, 209, 161, 0.8)",
              "rgba(255, 165, 0, 0.8)",
              "rgba(255, 107, 107, 0.8)",
              "rgba(100, 200, 200, 0.8)"
            ],
            borderColor: "rgba(15, 30, 53, 1)",
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: "#e0e0e0",
                font: { size: 12 }
              }
            }
          }
        }
      });
    }

    // Create status distribution chart
    const statusCounts = {
      active: activeUsers,
      disabled: disabledUsers
    };

    const statusCtx = document.getElementById("statusChart");
    if (statusCtx) {
      if (statusChart) statusChart.destroy();
      statusChart = new Chart(statusCtx, {
        type: "bar",
        data: {
          labels: ["Active", "Disabled"],
          datasets: [{
            label: "User Count",
            data: [statusCounts.active, statusCounts.disabled],
            backgroundColor: [
              "rgba(29, 209, 161, 0.8)",
              "rgba(255, 107, 107, 0.8)"
            ],
            borderColor: [
              "rgba(29, 209, 161, 1)",
              "rgba(255, 107, 107, 1)"
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: {
              labels: {
                color: "#e0e0e0",
                font: { size: 12 }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: "#a0a0a0" },
              grid: { color: "rgba(10, 155, 3, 0.1)" }
            },
            y: {
              ticks: { color: "#a0a0a0" },
              grid: { color: "rgba(10, 155, 3, 0.1)" }
            }
          }
        }
      });
    }
  } catch (e) {
    console.error("loadDashboard error:", e);
  }
}

// ==================== UTILITY FUNCTIONS ====================
function showAlert(message, type = "error") {
  const alert = document.createElement("div");
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "success" ? "#0a9b03" : "#c10909"};
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

async function showDeleteConfirmCard(entityType, entityValue, action = "delete") {
  return new Promise((resolve) => {
    const existing = document.getElementById("deleteConfirmCard");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "deleteBackdrop";
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 4999;
    `;
    document.body.appendChild(backdrop);

    const card = document.createElement("div");
    card.id = "deleteConfirmCard";
    const actionText = action === "reset-password" ? "send password reset email to" : action;
    card.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #0a0c0ee0;
      border: 2px solid rgba(237, 0, 0, 0.55);
      border-radius: 14px;
      z-index: 5000;
      width: 85%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      color: #e0e0e0;
      overflow: hidden;
      animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    if (!document.getElementById("deleteCardStyles")) {
      const style = document.createElement("style");
      style.id = "deleteCardStyles";
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translate(-50%, -40%); opacity: 0; } to { transform: translate(-50%, -50%); opacity: 1; } }
      `;
      document.head.appendChild(style);
    }

    card.innerHTML = `
      <div style="padding: 24px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
        <h2 style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">Are you sure you want to ${actionText} ${entityValue || 'this item'} ?</h2>

        <div>
          <strong style="margin: 0; font-size: 12px; color: #a60202;">Note : This action cannot be undone</strong>
        </div>

        <div style="padding: 16px; margin-top: auto;">
          <div style="display: flex; gap: 10px;">
            <button id="confirmNo" style="flex: 1; background:rgba(21, 175, 37, 0.67); color: #e0e0e0; border: 1px solid #00ff00; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">No</button>
            <button id="confirmYes" style="flex: 1; background:rgba(188, 14, 14, 0.58); color: #e0e0e0; border: 1px solid #ff0000; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">Yes</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(card);

    const confirmBtn = document.getElementById("confirmYes");
    const cancelBtn = document.getElementById("confirmNo");

    confirmBtn.onmouseover = () => { confirmBtn.style.opacity = "0.9"; };
    confirmBtn.onmouseout = () => { confirmBtn.style.opacity = "1"; };
    cancelBtn.onmouseover = () => { cancelBtn.style.opacity = "0.9"; };
    cancelBtn.onmouseout = () => { cancelBtn.style.opacity = "1"; };

    const removeCard = () => {
      backdrop.remove();
      card.remove();
    };

    document.getElementById("confirmYes").onclick = () => {
      removeCard();
      resolve(true);
    };

    document.getElementById("confirmNo").onclick = () => {
      removeCard();
      resolve(false);
    };

    backdrop.onclick = () => {
      removeCard();
      resolve(false);
    };
  });
}

function showCredentialsCard(email, password, name) {
  const existing = document.getElementById("credentialsCard");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "credentialsCard";
  card.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1a2332 0%, #0f1419 100%);
    border: 2px solid #0a9b03;
    border-radius: 12px;
    padding: 30px;
    z-index: 5000;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.7);
    color: #e0e0e0;
  `;
  
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; color: #0a9b03; font-size: 22px;">✅ User Created</h2>
      <button id="closeCredentialsBtn" style="background: none; border: none; color: #ff6b6b; font-size: 32px; cursor: pointer; padding: 0; width: 40px; height: 40px;">×</button>
    </div>
    
    <div style="background: rgba(10, 155, 3, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #0a9b03;">
      <p style="margin: 0 0 8px 0; color: #a0a0a0; font-size: 12px; text-transform: uppercase;">User Name</p>
      <p style="margin: 0 0 15px 0; color: #e0e0e0; font-weight: 600;">${name}</p>

      <p style="margin: 0 0 8px 0; color: #a0a0a0; font-size: 12px; text-transform: uppercase;">Email</p>
      <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
        <input type="text" id="credEmail" value="${email}" readonly style="flex: 1; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(10, 155, 3, 0.3); color: #e0e0e0; padding: 10px; border-radius: 6px; font-family: monospace;">
        <button id="copyEmailBtn" style="background: #0a9b03; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">📋 Copy</button>
      </div>

      <p style="margin: 0 0 8px 0; color: #a0a0a0; font-size: 12px; text-transform: uppercase;">Temporary Password</p>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input type="text" id="credPassword" value="${password}" readonly style="flex: 1; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(10, 155, 3, 0.3); color: #e0e0e0; padding: 10px; border-radius: 6px; font-family: monospace;">
        <button id="copyPasswordBtn" style="background: #0a9b03; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">📋 Copy</button>
      </div>
    </div>

    <div style="background: rgba(255, 165, 0, 0.1); border-left: 4px solid #ffa500; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
      <p style="margin: 0; color: #ffa500; font-size: 13px;">⚠️ User must change password on first login!</p>
    </div>

    <div style="display: flex; gap: 10px;">
      <button id="closeCredBtn" style="flex: 1; background: rgba(160, 160, 160, 0.2); color: #a0a0a0; border: 1px solid rgba(160, 160, 160, 0.4); padding: 12px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">Close</button>
    </div>
  `;
  
  document.body.appendChild(card);

  document.getElementById("copyEmailBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(email);
      showAlert("✅ Email copied!", "success");
    } catch {
      showAlert("❌ Copy failed", "error");
    }
  };

  document.getElementById("copyPasswordBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(password);
      showAlert("✅ Password copied!", "success");
    } catch {
      showAlert("❌ Copy failed", "error");
    }
  };

  const closeCard = () => card.remove();
  document.getElementById("closeCredentialsBtn").onclick = closeCard;
  document.getElementById("closeCredBtn").onclick = closeCard;
}

window.switchSettingsTab = function(tabName) {
  const permissions = document.getElementById("permissions-tab");
  const manual = document.getElementById("manual-tab");
  const permBtn = document.getElementById("permissionsTabBtn");
  const manualBtn = document.getElementById("manualTabBtn");
  
  // Hide all tabs
  if (permissions) permissions.style.display = "none";
  if (manual) manual.style.display = "none";
  
  // Reset all button styles
  if (permBtn) {
    permBtn.style.color = "#a0a0a0";
    permBtn.style.borderBottomColor = "transparent";
  }
  if (manualBtn) {
    manualBtn.style.color = "#a0a0a0";
    manualBtn.style.borderBottomColor = "transparent";
  }
  
  // Show selected tab and highlight button
  if (tabName === "permissions") {
    if (permissions) permissions.style.display = "block";
    if (permBtn) {
      permBtn.style.color = "#0a9b03";
      permBtn.style.borderBottomColor = "#0a9b03";
    }
  } else if (tabName === "manual") {
    if (manual) manual.style.display = "block";
    if (manualBtn) {
      manualBtn.style.color = "#0a9b03";
      manualBtn.style.borderBottomColor = "#0a9b03";
    }
  }
};

// Toggle manual sections
window.toggleManualSection = function(button) {
  const content = button.nextElementSibling;
  const isHidden = content.style.display === "none";
  content.style.display = isHidden ? "block" : "none";
  
  // Rotate chevron icon
  const chevron = button.querySelector("i");
  if (chevron) {
    chevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
  }
};

// ==================== USER FUNCTIONS ====================
async function loadUsers() {
  try {
    const userBody = document.getElementById("userBody");
    if (!userBody) return;
    userBody.innerHTML = "";
    allUsers = [];

    // Load from all collections including admin_users
    const collections = ["admin_users", "inventory_users", "warehouse_users", "purchasing_users", "attendance_users", "finance_users", "employees"];
    
    for (const collName of collections) {
      const snap = await getDocs(collection(db, collName));
      snap.forEach(s => {
        const user = { id: s.id, ...s.data() };
        allUsers.push(user);
      });
    }

    if (allUsers.length === 0) {
      userBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#a0a0a0;'>No users yet.</td></tr>";
      return;
    }

    // Render filtered users
    filterAndRenderUsers();
  } catch (e) {
    console.error("loadUsers error:", e);
  }
}

window.showUserActionsDropdown = (event, userId) => {
  event.stopPropagation();
  
  // Check if dropdown already exists for this user
  const existingDropdown = document.getElementById(`userDropdown-${userId}`);
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }
  
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  // Close all other dropdowns
  document.querySelectorAll("[id^='userDropdown-']").forEach(el => el.remove());

  // Get button position
  const button = event.target;
  const rect = button.getBoundingClientRect();

  // Create dropdown
  const dropdown = document.createElement("div");
  dropdown.id = `userDropdown-${userId}`;
  dropdown.style.cssText = `
    position: fixed;
    background: #0a0c0e;
    border: 1px solid rgba(10, 155, 3, 0.3);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 10000;
    min-width: 180px;
  `;

  const actionItem = (text, icon, color, onClick) => {
    const item = document.createElement("button");
    item.style.cssText = `
      width: 100%;
      padding: 10px 14px;
      background: none;
      border: none;
      color: ${color};
      text-align: left;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      border-top: 1px solid rgba(10, 155, 3, 0.1);
    `;
    item.innerHTML = `<span style="font-size: 14px;">${icon}</span> ${text}`;
    item.onmouseover = () => {
      item.style.background = `${color}20`;
    };
    item.onmouseout = () => {
      item.style.background = 'none';
    };
    item.onclick = (e) => {
      e.stopPropagation();
      dropdown.remove();
      onClick();
    };
    return item;
  };

  // Add first item without top border
  const firstItem = document.createElement("button");
  firstItem.style.cssText = `
    width: 100%;
    padding: 10px 14px;
    background: none;
    border: none;
    color: #0a9b03;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  `;
  firstItem.innerHTML = `<span style="font-size: 14px;">✎</span> Edit`;
  firstItem.onmouseover = () => {
    firstItem.style.background = `#0a9b0320`;
  };
  firstItem.onmouseout = () => {
    firstItem.style.background = 'none';
  };
  firstItem.onclick = (e) => {
    e.stopPropagation();
    dropdown.remove();
    editUser(userId);
  };
  dropdown.appendChild(firstItem);

  // Add other items
  dropdown.appendChild(actionItem("Reset Password", "🔑", "#ffa500", () => {
    resetUserPassword(userId);
  }));

  const toggleText = user.status === "active" ? "Disable" : "Enable";
  const toggleIcon = user.status === "active" ? "🚫" : "✓";
  const toggleColor = user.status === "active" ? "#ff6b6b" : "#1dd1a1";
  dropdown.appendChild(actionItem(toggleText, toggleIcon, toggleColor, () => {
    toggleUser(userId, user.status);
  }));

  dropdown.appendChild(actionItem("Delete", "🗑️", "#ff6b6b", () => {
    deleteUser(userId);
  }));

  document.body.appendChild(dropdown);

  // Calculate dropdown position with boundary checking
  setTimeout(() => {
    const dropdownRect = dropdown.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;

    // Check if dropdown goes off right edge
    if (left + dropdownRect.width > window.innerWidth) {
      left = Math.max(0, window.innerWidth - dropdownRect.width - 10);
    }

    // Check if dropdown goes off bottom edge
    if (top + dropdownRect.height > window.innerHeight) {
      top = rect.top - dropdownRect.height - 8;
    }

    dropdown.style.top = top + "px";
    dropdown.style.left = left + "px";
  }, 0);

  // Close dropdown when clicking outside
  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && e.target !== button) {
      dropdown.remove();
      document.removeEventListener("click", closeDropdown);
    }
  };
  document.addEventListener("click", closeDropdown);
};

// Global filter state
let userFilters = {
  search: '',
  role: '',
  status: ''
};

// Filter and render users
function filterAndRenderUsers() {
  const userBody = document.getElementById("userBody");
  if (!userBody) return;
  
  const filtered = allUsers.filter(user => {
    const matchSearch = !userFilters.search || 
      user.name.toLowerCase().includes(userFilters.search.toLowerCase()) ||
      user.email.toLowerCase().includes(userFilters.search.toLowerCase());
    
    const matchRole = !userFilters.role || user.role === userFilters.role;
    const matchStatus = !userFilters.status || user.status === userFilters.status;
    
    return matchSearch && matchRole && matchStatus;
  });

  userBody.innerHTML = "";
  
  if (filtered.length === 0) {
    userBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#a0a0a0;'>No users found.</td></tr>";
    return;
  }

  filtered.forEach(user => {
    const statusClass = user.status === "active" ? "status-active" : "status-disabled";
    const statusText = user.status === "active" ? "✅ Active" : "❌ Disabled";
    
    let warehouseName = "N/A";
    if (user.role !== "admin" && user.warehouse) {
      const warehouse = allWarehouses.find(w => w.id === user.warehouse);
      if (warehouse) {
        warehouseName = warehouse.code ? `${warehouse.name} (${warehouse.code})` : warehouse.name;
      } else {
        warehouseName = "Unknown";
      }
    }
    
    userBody.innerHTML += `
      <tr>
        <td>${user.name || "N/A"}</td>
        <td>${user.email || "N/A"}</td>
        <td><strong>${(user.role || "N/A").toUpperCase()}</strong></td>
        <td>${user.role === "admin" ? "N/A" : warehouseName}</td>
        <td class="${statusClass}">${statusText}</td>
        <td>
          <button onclick="window.showUserActionsDropdown(event, '${user.id}')" style="background: linear-gradient(135deg, #0a9b03 0%, #08762a 100%);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all 0.3s;box-shadow:0 2px 8px rgba(10,155,3,0.3);">
            ⋮ More
          </button>
        </td>
      </tr>
    `;
  });
}

// Navigate based on summary card click - filter users
window.goToInventoryUsers = (filter = '') => {
  const usersSection = document.getElementById("users");
  if (usersSection) {
    // Hide dashboard and show users section
    document.getElementById("dashboard").style.display = "none";
    usersSection.style.display = "block";
    
    // Clear previous filters
    userFilters = { search: '', role: '', status: '' };
    
    // Apply filter based on card clicked
    if (filter === 'active') {
      userFilters.status = 'active';
      const filterStatusSelect = document.getElementById("filterStatus");
      if (filterStatusSelect) filterStatusSelect.value = 'active';
    } else if (filter === 'disabled') {
      userFilters.status = 'disabled';
      const filterStatusSelect = document.getElementById("filterStatus");
      if (filterStatusSelect) filterStatusSelect.value = 'disabled';
    }
    
    filterAndRenderUsers();
  }
};

// Navigate to Inventory Warehouse Management
window.goToInventoryWarehouse = () => {
  sessionStorage.setItem('navigateToWarehouse', 'true');
  window.location.href = "dashboard.html";
};

// Edit restriction
window.editRestriction = async (userId) => {
  try {
    const restrictionSnap = await getDoc(doc(db, "user_restrictions", userId));
    if (!restrictionSnap.exists()) {
      showAlert("Restriction not found", "error");
      return;
    }

    const restriction = restrictionSnap.data();
    const user = allUsers.find(u => u.id === userId);
    
    if (!user) {
      showAlert("User not found", "error");
      return;
    }

    // Set editing mode
    editingRestrictionUserId = userId;
    currentRestrictionMode = "per-user";

    // Show the modal
    const restrictionModal = document.getElementById("restrictionModal");
    if (restrictionModal) {
      // Hide the tab buttons when editing
      const perUserTabBtn = document.getElementById("perUserTabBtn");
      const roleBasedTabBtn = document.getElementById("roleBasedTabBtn");
      const perUserMode = document.getElementById("perUserMode");
      const roleBasedMode = document.getElementById("roleBasedMode");
      
      if (perUserTabBtn) perUserTabBtn.style.display = "none";
      if (roleBasedTabBtn) roleBasedTabBtn.style.display = "none";
      
      // Show only the per-user mode
      if (perUserMode) perUserMode.style.display = "block";
      if (roleBasedMode) roleBasedMode.style.display = "none";

      // Add a label showing the user being edited
      const userSearchInput = document.getElementById("restrictionUserSearch");
      const userSearchContainer = userSearchInput?.parentElement;
      
      if (userSearchContainer && !document.getElementById("editingUserLabel")) {
        const label = document.createElement("div");
        label.id = "editingUserLabel";
        label.style.cssText = "padding:10px;background:rgba(10,155,3,0.2);border:1px solid rgba(10,155,3,0.4);border-radius:4px;color:#0a9b03;font-weight:600;margin-bottom:10px;";
        label.innerHTML = `👤 Editing: ${user.name || user.email || "Unknown User"}`;
        userSearchContainer.parentElement.insertBefore(label, userSearchContainer);
      }

      // Hide the user search input and dropdown during edit
      if (userSearchInput) {
        userSearchInput.style.display = "none";
      }
      
      const userDropdown = document.getElementById("restrictionUserDropdown");
      if (userDropdown) {
        userDropdown.style.display = "none";
      }

      // Check the appropriate checkboxes based on stored restrictions
      const inventoryCheckbox = document.getElementById("restrictionInventory");
      const attendanceCheckbox = document.getElementById("restrictionAttendance");
      const purchasingCheckbox = document.getElementById("restrictionPurchasing");
      const financeCheckbox = document.getElementById("restrictionFinance");
      
      if (inventoryCheckbox) inventoryCheckbox.checked = restriction.inventory || false;
      if (attendanceCheckbox) attendanceCheckbox.checked = restriction.attendance || false;
      if (purchasingCheckbox) purchasingCheckbox.checked = restriction.purchasing || false;
      if (financeCheckbox) financeCheckbox.checked = restriction.finance || false;

      // Update button text
      const saveBtn = document.getElementById("saveRestrictionBtn");
      if (saveBtn) {
        saveBtn.textContent = "Update Restriction";
      }

      restrictionModal.classList.add("active");
    }
  } catch (err) {
    showAlert("Error loading restriction: " + err.message, "error");
  }
};

// Delete restriction
window.deleteRestriction = async (userId, userName = "Unknown") => {
  const confirmed = await showDeleteConfirmCard("restriction", userName, "delete");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "user_restrictions", userId));
    showAlert("Restriction deleted!", "success");
    loadPermissions();
  } catch (err) {
    showAlert("Error deleting restriction: " + err.message, "error");
  }
};

// Load permissions and populate user dropdown
async function loadPermissions() {
  try {
    const permissionsBody = document.getElementById("permissionsBody");
    
    if (!permissionsBody) return;

    // Load restrictions table
    permissionsBody.innerHTML = "";
    
    // Fetch all restrictions
    const restrictionsSnap = await getDocs(collection(db, "user_restrictions"));
    
    if (restrictionsSnap.empty) {
      permissionsBody.innerHTML = '<tr style="border-bottom:1px solid rgba(10, 155, 3, 0.2);"><td colspan="5" style="text-align:center; padding:30px; color:#a0a0a0;">No restrictions set yet. Users have default access based on their role.</td></tr>';
      return;
    }

    restrictionsSnap.forEach(doc => {
      const restriction = doc.data();
      const user = allUsers.find(u => u.id === restriction.userId);
      
      if (user) {
        const modules = [
          restriction.inventory ? "Inventory" : "",
          restriction.attendance ? "Attendance" : "",
          restriction.purchasing ? "Purchasing" : "",
          restriction.dashboard ? "Dashboard" : ""
        ].filter(m => m).join(", ");

        const restrictionText = [
          restriction.inventory ? "❌ No Inventory" : "",
          restriction.attendance ? "❌ No Attendance" : "",
          restriction.purchasing ? "❌ No Purchasing" : "",
          restriction.dashboard ? "❌ No Dashboard" : ""
        ].filter(t => t).join(", ");

        permissionsBody.innerHTML += `
          <tr style="border-bottom:1px solid rgba(10, 155, 3, 0.2);">
            <td style="padding:12px;">${user.name || "Unknown"}</td>
            <td style="padding:12px;">${(user.role || "N/A").toUpperCase()}</td>
            <td style="padding:12px;">${modules || "All Modules"}</td>
            <td style="padding:12px;color:#ff6b6b;">${restrictionText || "None"}</td>
            <td style="padding:12px;">
              <button class="btn-edit" onclick="editRestriction('${restriction.userId}')">Edit</button>
              <button class="btn-delete" onclick="deleteRestriction('${restriction.userId}', '${user.name || 'Unknown'}')">Delete</button>
            </td>
          </tr>
        `;
      }
    });
  } catch (e) {
    console.error("loadPermissions error:", e);
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("div[style*='position:relative']")) {
    document.querySelectorAll("[id^='dropdown-']").forEach(el => el.style.display = "none");
  }
});

window.editUser = (userId) => {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  editingUserId = userId;
  document.getElementById("modalTitle").textContent = "Edit User";
  document.getElementById("userName").value = user.name || "";
  document.getElementById("userEmail").value = user.email || "";
  document.getElementById("userRole").value = user.role || "";
  document.getElementById("userWarehouse").value = user.warehouse || "";
  const warehouseGroup = document.getElementById("warehouseGroup");
  warehouseGroup.style.display = user.role === "admin" ? "none" : "block";
  document.getElementById("userModal").classList.add("active");
};

window.toggleUser = async (userId, currentStatus) => {
  const action = currentStatus === "active" ? "disable" : "enable";
  const newStatus = currentStatus === "active" ? "disabled" : "active";
  const user = allUsers.find(u => u.id === userId);
  const confirmed = await showDeleteConfirmCard("User", `${user?.email || "this user"}`, action);
  if (!confirmed) return;
  try {
    // Find which collection the user belongs to
    const collections = ["admin_users", "inventory_users", "warehouse_users", "purchasing_users", "attendance_users", "finance_users"];
    let updated = false;
    
    for (const collName of collections) {
      const docSnap = await getDoc(doc(db, collName, userId));
      if (docSnap.exists()) {
        await updateDoc(doc(db, collName, userId), { status: newStatus, updatedAt: new Date().toISOString() });
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      showAlert("User not found in any collection", "error");
      return;
    }
    
    showAlert(`✅ User ${newStatus}`, "success");
    loadUsers();
    loadPermissions();
  } catch (e) {
    console.error("toggleUser error:", e);
    showAlert("Error toggling user", "error");
  }
};

window.resetUserPassword = async (userId) => {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const confirmed = await showDeleteConfirmCard("User", user.email, "reset-password");
  if (!confirmed) return;

  try {
    await sendPasswordResetEmail(auth, user.email);
    showAlert(`✅ Email sent to ${user.email}!\n\nCheck your spam folder if you don't see it.\nLink expires in 1 hour.`, "success");
    loadUsers();
  } catch (err) {
    console.error("resetUserPassword error:", err);
    if (err.code === "auth/user-not-found") {
      showAlert("❌ User NOT found in Firebase Auth!\n\nThey may only exist in database.", "error");
    } else {
      showAlert(`❌ Error: ${err.message}`, "error");
    }
  }
};

window.deleteUser = async (userId) => {
  const user = allUsers.find(u => u.id === userId);
  const confirmed = await showDeleteConfirmCard("User", user?.email || "Unknown User");
  if (!confirmed) return;
  try {
    // Determine which collection this user belongs to based on role
    const roleCollectionMap = {
      "admin": "admin_users",
      "inventory": "inventory_users",
      "warehouse": "warehouse_users",
      "purchasing": "purchasing_users",
      "attendance": "attendance_users",
      "finance": "finance_users"
    };
    
    const collectionName = roleCollectionMap[user.role] || "users";
    
    // Delete from Firestore
    await deleteDoc(doc(db, collectionName, userId));
    
    showAlert("✅ User deleted!", "success");
    loadUsers();
  } catch (e) {
    console.error("deleteUser error:", e);
    showAlert("Error deleting user: " + e.message, "error");
  }
};

// ==================== PROJECT FUNCTIONS ====================
async function loadWarehouses() {
  try {
    const snap = await getDocs(collection(db, "projects"));
    const warehouseBody = document.getElementById("warehouseBody");
    const userWarehouse = document.getElementById("userWarehouse");
    
    allWarehouses = [];
    if (warehouseBody) warehouseBody.innerHTML = "";
    if (userWarehouse) userWarehouse.innerHTML = '<option value="">Select Project</option>';

    snap.forEach(s => {
      const project = { id: s.id, ...s.data() };
      allWarehouses.push(project);
      
      if (warehouseBody) {
        const statusClass = project.status === "active" ? "status-active" : "status-disabled";
        const statusText = project.status === "active" ? "✅ Active" : "❌ Inactive";
        const tradesDisplay = Array.isArray(project.trades) ? project.trades.join(", ") : (project.trade || "N/A");
        warehouseBody.innerHTML += `
          <tr>
            <td>${project.name || "N/A"}</td>
            <td><strong>${project.code || "N/A"}</strong></td>
            <td>${project.projectId || "N/A"}</td>
            <td>${project.client || "N/A"}</td>
            <td>${project.clientPo || "N/A"}</td>
            <td>${project.scope || "N/A"}</td>
            <td>${tradesDisplay}</td>
            <td>${project.location || "N/A"}</td>
            <td>
              <div class="action-buttons">
                <button onclick="editWarehouse('${project.id}')" class="btn-edit" style="padding:6px 12px;font-size:12px;">Edit</button>
                <button onclick="deleteWarehouse('${project.id}')" class="btn-delete" style="padding:6px 12px;font-size:12px;">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }
      
      if (userWarehouse) {
        userWarehouse.innerHTML += `<option value="${project.id}">${project.name}</option>`;
      }
    });
  } catch (e) {
    console.error("loadWarehouses error:", e);
  }
}

window.editWarehouse = (warehouseId) => {
  const project = allWarehouses.find(w => w.id === warehouseId);
  if (!project) return;
  editingWarehouseId = warehouseId;
  document.getElementById("warehouseModalTitle").textContent = "Edit Project";
  document.getElementById("whName").value = project.name || "";
  document.getElementById("whCode").value = project.code || "";
  document.getElementById("whProjectId").value = project.projectId || "";
  document.getElementById("whClient").value = project.client || "";
  document.getElementById("whClientPo").value = project.clientPo || "";
  document.getElementById("whScope").value = project.scope || "";
  // Set multiple trades
  const trades = Array.isArray(project.trades) ? project.trades : (project.trade ? [project.trade] : []);
  document.getElementById("whTrade").value = trades.join(",");
  document.getElementById("whLocation").value = project.location || "";
  document.getElementById("warehouseModal").classList.add("active");
};

window.deleteWarehouse = async (warehouseId) => {
  const project = allWarehouses.find(w => w.id === warehouseId);
  const confirmed = await showDeleteConfirmCard("Project", project?.name || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "projects", warehouseId));
    showAlert("✅ Project deleted!", "success");
    loadWarehouses();
  } catch (e) {
    console.error("deleteWarehouse error:", e);
    showAlert("Error deleting project", "error");
  }
};

// ==================== TRADE MANAGEMENT ====================
async function loadTrades() {
  try {
    const snap = await getDocs(collection(db, "trades"));
    allTrades = [];
    
    snap.forEach(s => {
      const trade = { id: s.id, ...s.data() };
      allTrades.push(trade);
    });
    
    // Update Trade dropdown in modal
    const tradeSelect = document.getElementById("whTrade");
    if (tradeSelect) {
      const currentValue = tradeSelect.value;
      tradeSelect.innerHTML = '<option value="">Select Trade</option>';
      allTrades.forEach(t => {
        if (t.name) {
          tradeSelect.innerHTML += `<option value="${t.name}">${t.name}</option>`;
        }
      });
      tradeSelect.value = currentValue;
    }
  } catch (e) {
    console.error("loadTrades error:", e);
  }
}

async function loadProjectColumns() {
  try {
    const snap = await getDocs(collection(db, "projectColumns"));
    allProjectColumns = [];
    
    snap.forEach(s => {
      const col = { id: s.id, ...s.data() };
      allProjectColumns.push(col);
    });
  } catch (e) {
    console.error("loadProjectColumns error:", e);
  }
}

// ==================== NAV & PAGE SWITCHING ====================
function switchPage(pageName) {
  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  
  const page = document.getElementById(pageName);
  const navLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
  
  if (page) page.style.display = "block";
  if (navLink) navLink.classList.add("active");
}

// ==================== DISPLAY FUNCTIONS ====================
function displayTrades() {
  const tradesList = document.getElementById("tradesList");
  if (!tradesList) return;
  
  tradesList.innerHTML = "";
  
  if (allTrades.length === 0) {
    tradesList.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#a0a0a0;padding:20px;">No trades added yet. Add one to start.</p>';
    return;
  }
  
  allTrades.forEach(trade => {
    tradesList.innerHTML += `
      <div style="background:rgba(10,155,3,0.15);padding:12px;border-radius:6px;border:1px solid rgba(10,155,3,0.3);display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#e0e0e0;font-weight:600;">${trade.name || "N/A"}</span>
        <button type="button" onclick="window.deleteTrade('${trade.id}')" style="background:#ff6b6b;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.opacity='0.8'" onmouseout="this.opacity='1'">
          Delete
        </button>
      </div>
    `;
  });
}

function displayProjectColumns() {
  const columnsList = document.getElementById("projectColumnsList");
  if (!columnsList) return;
  
  columnsList.innerHTML = "";
  
  // Show default columns
  const defaultColumns = ["PROJECT", "PROJECT I.D.", "CLIENT", "CLIENT PO NO", "PROJECT/SCOPE OF WORKS", "TRADE", "LOCATION"];
  defaultColumns.forEach(col => {
    columnsList.innerHTML += `
      <div style="background:rgba(10,155,3,0.15);padding:12px;border-radius:6px;border:1px solid rgba(10,155,3,0.3);display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#e0e0e0;font-weight:600;">${col}</span>
        <span style="color:#0a9b03;font-size:12px;font-weight:600;">Default</span>
      </div>
    `;
  });
  
  // Show custom columns
  if (allProjectColumns.length > 0) {
    allProjectColumns.forEach(col => {
      columnsList.innerHTML += `
        <div style="background:rgba(29,209,161,0.15);padding:12px;border-radius:6px;border:1px solid rgba(29,209,161,0.3);display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#e0e0e0;font-weight:600;">${col.name || "N/A"}</span>
          <button type="button" onclick="window.deleteProjectColumn('${col.id}')" style="background:#ff6b6b;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.opacity='0.8'" onmouseout="this.opacity='1'">
            Delete
          </button>
        </div>
      `;
    });
  }
}

window.deleteTrade = async (tradeId) => {
  const trade = allTrades.find(t => t.id === tradeId);
  const confirmed = await showDeleteConfirmCard("Trade", trade?.name || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "trades", tradeId));
    showAlert("✅ Trade deleted!", "success");
    loadTrades();
    displayTrades();
  } catch (e) {
    console.error("deleteTrade error:", e);
    showAlert("Error deleting trade", "error");
  }
};

window.deleteProjectColumn = async (columnId) => {
  const col = allProjectColumns.find(c => c.id === columnId);
  const confirmed = await showDeleteConfirmCard("Column", col?.name || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "projectColumns", columnId));
    showAlert("✅ Column deleted!", "success");
    loadProjectColumns();
    displayProjectColumns();
  } catch (e) {
    console.error("deleteProjectColumn error:", e);
    showAlert("Error deleting column", "error");
  }
};

// ==================== INIT & EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", async () => {
  // Check auth and load user
  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (sessionStorage.getItem('isLoggingOut') === 'true') return;
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, "admin_user", user.uid));
      if (userDoc.exists()) {
        currentUser = { id: user.uid, ...userDoc.data() };
        const roleEl = document.getElementById("currentUserRole");
        if (roleEl) {
          roleEl.textContent = (currentUser.role || "").toUpperCase();
          roleEl.addEventListener("click", () => {
            showUserProfile();
          });
        }
        // Allow access if user is admin OR purchasing role
        const allowedRoles = ["admin", "purchasing"];
        if (!allowedRoles.includes(currentUser.role)) {
          console.log("⚠️ User role is " + currentUser.role + ", but allowing access to admin panel");
        }
      } else {
        // User not in admin_user collection - might be a new user
        currentUser = { id: user.uid, email: user.email };
        console.log("⚠️ User not found in database, allowing basic access");
      }
    } catch (e) {
      console.error("Auth error:", e);
    }
    
    // Load initial data after auth is verified
    await loadUsers();
    await loadWarehouses();
    await loadTrades();
    await loadProjectColumns();
    await loadPermissions();
    
    // Show dashboard page by default with loaded data
    switchPage("dashboard");
    loadDashboard();
  });

  // User Profile Modal Handling
  const userProfileModal = document.getElementById("userProfileModal");
  const closeProfileModalBtn = document.getElementById("closeProfileModal");
  const closeProfileBtn = document.getElementById("closeProfileBtn");

  function showUserProfile() {
    if (!userProfileModal) return;
    
    // Populate user information
    const roleMap = {
      "admin": "Administrator",
      "attendance": "Attendance Officer",
      "inventory": "Inventory Manager",
      "purchasing": "Purchasing Officer",
      "warehouse": "Warehouse Staff"
    };

    const userRole = currentUser?.role || "";
    const userName = currentUser?.name || "Unknown User";
    const userEmail = currentUser?.email || "No email";
    const userDepartment = currentUser?.department || "N/A";
    const userTagging = currentUser?.tagging || "N/A";
    const userStatus = currentUser?.status || "active";

    // Set user initial
    const initial = userName.charAt(0).toUpperCase();
    document.getElementById("profileInitial").textContent = initial;

    // Set user information
    document.getElementById("profileName").textContent = userName;
    document.getElementById("profileRole").textContent = userRole.toUpperCase();
    document.getElementById("profileEmail").textContent = userEmail;
    document.getElementById("profileRoleFull").textContent = roleMap[userRole] || userRole;
    document.getElementById("profileDepartment").textContent = userDepartment;
    document.getElementById("profileTagging").textContent = userTagging;
    
    const statusEl = document.getElementById("profileStatus");
    if (statusEl) {
      const statusColor = userStatus === "active" ? "#1dd1a1" : "#ff6b6b";
      const statusText = userStatus === "active" ? "Active" : "Disabled";
      statusEl.innerHTML = `<i class="fa-solid fa-circle" style="color:${statusColor};"></i> <span style="color:${statusColor};">${statusText}</span>`;
    }

    // Show modal
    userProfileModal.style.display = "flex";
  }

  if (closeProfileModalBtn) {
    closeProfileModalBtn.addEventListener("click", () => {
      userProfileModal.style.display = "none";
    });
  }

  if (closeProfileBtn) {
    closeProfileBtn.addEventListener("click", () => {
      userProfileModal.style.display = "none";
    });
  }

  // Close modal when clicking outside
  if (userProfileModal) {
    userProfileModal.addEventListener("click", (e) => {
      if (e.target === userProfileModal) {
        userProfileModal.style.display = "none";
      }
    });
  }

  // Menu Toggle for User Management
  const userManagementToggle = document.getElementById("userManagementToggle");
  const userManagementSubmenu = document.getElementById("userManagementSubmenu");
  if (userManagementToggle && userManagementSubmenu) {
    userManagementToggle.addEventListener("click", () => {
      const isHidden = userManagementSubmenu.style.display === "none";
      userManagementSubmenu.style.display = isHidden ? "flex" : "none";
      userManagementToggle.classList.toggle("active");
    });
    // Show user management submenu by default
    userManagementSubmenu.style.display = "flex";
  }

  // Hamburger Menu Toggle
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
    // Close sidebar when a nav link is clicked
    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", () => {
        sidebar.classList.remove("active");
      });
    });
  }

  // View All Users button
  const viewAllUsersBtn = document.getElementById("viewAllUsersBtn");
  if (viewAllUsersBtn) {
    viewAllUsersBtn.addEventListener("click", () => {
      switchPage("users");
      loadUsers();
    });
  }

  // Navigation
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      const pageName = e.currentTarget.dataset.page;
      switchPage(pageName);
      if (pageName === "dashboard") {
        loadDashboard();
      } else if (pageName === "users") {
        loadUsers();
      } else if (pageName === "attendance-users") {
        loadUsers();
      }
    });
  });

  // Go Back button
  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.onclick = () => window.location.href = "modules.html";
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        localStorage.removeItem('authCheckDone');
        sessionStorage.clear(); // Clear all session storage
        if (unsubscribeAuth) unsubscribeAuth();
        await signOut(auth);
        setTimeout(() => {
          window.location.href = "login.html";
        }, 200);
      } catch (e) {
        console.error("Logout error:", e);
      }
    });
  }

  // User Management
  const userModal = document.getElementById("userModal");
  const userRole = document.getElementById("userRole");
  const warehouseGroup = document.getElementById("warehouseGroup");
  const addUserBtn = document.getElementById("addUserBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelUserBtn = document.getElementById("cancelUserBtn");
  const saveUserBtn = document.getElementById("saveUserBtn");

  if (addUserBtn) {
    addUserBtn.addEventListener("click", () => {
      editingUserId = null;
      document.getElementById("modalTitle").textContent = "Add User";
      document.getElementById("userName").value = "";
      document.getElementById("userEmail").value = "";
      document.getElementById("userRole").value = "";
      document.getElementById("userWarehouse").value = "";
      document.getElementById("userDepartment").value = "";
      document.getElementById("userDesignation").value = "";
      if (warehouseGroup) {
        warehouseGroup.style.display = "none";
      }
      const departmentGroup = document.getElementById("departmentGroup");
      const designationGroup = document.getElementById("designationGroup");
      const userSearchGroup = document.getElementById("userSearchGroup");
      if (departmentGroup) {
        departmentGroup.style.display = "none";
      }
      if (designationGroup) {
        designationGroup.style.display = "none";
      }
      if (userSearchGroup) {
        userSearchGroup.style.display = "none";
      }
      if (userModal) {
        userModal.classList.add("active");
      }
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      if (userModal) {
        userModal.classList.remove("active");
      }
    });
  }

  if (cancelUserBtn) {
    cancelUserBtn.addEventListener("click", () => {
      if (userModal) {
        userModal.classList.remove("active");
      }
    });
  }

  if (userRole) {
    userRole.addEventListener("change", () => {
      const role = userRole.value;
      if (warehouseGroup) {
        warehouseGroup.style.display = role === "warehouse" ? "block" : "none";
      }
      const departmentGroup = document.getElementById("departmentGroup");
      const designationGroup = document.getElementById("designationGroup");
      const userSearchGroup = document.getElementById("userSearchGroup");
      if (departmentGroup) {
        departmentGroup.style.display = (role === "attendance" || role === "employee") ? "block" : "none";
      }
      if (designationGroup) {
        designationGroup.style.display = (role === "attendance" || role === "employee") ? "block" : "none";
      }
      if (userSearchGroup) {
        userSearchGroup.style.display = role === "admin" ? "block" : "none";
      }
    });
  }

  if (saveUserBtn) {
    saveUserBtn.addEventListener("click", async () => {
      const name = (document.getElementById("userName").value || "").trim();
      const email = (document.getElementById("userEmail").value || "").trim();
      const role = (document.getElementById("userRole").value || "").trim();
      const warehouse = (document.getElementById("userWarehouse").value || "").trim();
      const department = (document.getElementById("userDepartment").value || "").trim();
      const designation = (document.getElementById("userDesignation").value || "").trim();

      if (!name || !email || !role) {
        showAlert("Fill in all required fields", "error");
        return;
      }

      if (role === "warehouse" && !warehouse) {
        showAlert("Please select a warehouse", "error");
        return;
      }

      if (role === "attendance" || role === "employee") {
        if (!department) {
          showAlert("Please enter a department/site", "error");
          return;
        }
        if (!designation) {
          showAlert("Please select a designation", "error");
          return;
        }
      }

      try {
        const getCollectionName = (r) => {
          if (r === "admin") return "admin_users";
          if (r === "warehouse") return "warehouse_users";
          if (r === "inventory") return "inventory_users";
          if (r === "purchasing") return "purchasing_users";
          if (r === "attendance") return "attendance_users";
          if (r === "finance") return "finance_users";
          if (r === "employee") return "employees";
          return "inventory_users";
        };

        if (!editingUserId) {
          const tempPassword = "TempPass@" + Math.random().toString(36).slice(2, 10);
          
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
            const userId = userCredential.user.uid;

            const userData = { 
              name, 
              email, 
              role,
              status: "active",
              createdAt: new Date().toISOString()
            };

            if (role === "warehouse") {
              userData.warehouse = warehouse;
            } else if (role === "attendance" || role === "employee") {
              userData.department = department;
              userData.designation = designation;
            }

            const collectionName = getCollectionName(role);
            await setDoc(doc(db, collectionName, userId), userData);
            showAlert("User created successfully!", "success");
            userModal.classList.remove("active");
            loadUsers();
            showCredentialsCard(email, tempPassword, name);
          } catch (authErr) {
            if (authErr.code === "auth/email-already-in-use") {
              showAlert("Email already registered in Auth", "error");
            } else {
              showAlert("Auth Error: " + authErr.message, "error");
            }
          }
        } else {
          const userData = { name, email, role };

          if (role === "warehouse") {
            userData.warehouse = warehouse;
          } else if (role === "attendance" || role === "employee") {
            userData.department = department;
            userData.designation = designation;
          }

          const editingUser = allUsers.find(u => u.id === editingUserId);
          if (editingUser) {
            const oldCollectionName = getCollectionName(editingUser.role);
            const newCollectionName = getCollectionName(role);
            
            // If role changed, move user to new collection
            if (editingUser.role !== role) {
              // Get the old user data
              const oldUserDoc = await getDoc(doc(db, oldCollectionName, editingUserId));
              if (oldUserDoc.exists()) {
                const oldData = oldUserDoc.data();
                // Add to new collection
                await setDoc(doc(db, newCollectionName, editingUserId), {
                  ...oldData,
                  ...userData,
                  role: role,
                  updatedAt: new Date().toISOString()
                });
                // Delete from old collection
                await deleteDoc(doc(db, oldCollectionName, editingUserId));
              }
            } else {
              // Same role, just update
              await updateDoc(doc(db, newCollectionName, editingUserId), {
                ...userData,
                updatedAt: new Date().toISOString()
              });
            }
            showAlert("User updated!", "success");
            userModal.classList.remove("active");
            loadUsers();
          }
        }
      } catch (err) {
        showAlert("Error saving user: " + err.message, "error");
      }
    });
  }

  // Search and Filter Event Listeners
  const searchUsersInput = document.getElementById("searchUsers");
  const filterRoleSelect = document.getElementById("filterRole");
  const filterStatusSelect = document.getElementById("filterStatus");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");

  if (searchUsersInput) {
    searchUsersInput.addEventListener("input", (e) => {
      userFilters.search = e.target.value;
      filterAndRenderUsers();
    });
  }

  if (filterRoleSelect) {
    filterRoleSelect.addEventListener("change", (e) => {
      userFilters.role = e.target.value;
      filterAndRenderUsers();
    });
  }

  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", (e) => {
      userFilters.status = e.target.value;
      filterAndRenderUsers();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      userFilters = { search: '', role: '', status: '' };
      if (searchUsersInput) searchUsersInput.value = '';
      if (filterRoleSelect) filterRoleSelect.value = '';
      if (filterStatusSelect) filterStatusSelect.value = '';
      filterAndRenderUsers();
    });
  }

  // Warehouse Management
  const warehouseModal = document.getElementById("warehouseModal");
  const addWarehouseBtn = document.getElementById("addWarehouseBtn");

  if (addWarehouseBtn) {
    addWarehouseBtn.addEventListener("click", () => {
      editingWarehouseId = null;
      document.getElementById("warehouseModalTitle").textContent = "Add Project";
      document.getElementById("whName").value = "";
      document.getElementById("whCode").value = "";
      document.getElementById("whProjectId").value = "";
      document.getElementById("whClient").value = "";
      document.getElementById("whClientPo").value = "";
      document.getElementById("whScope").value = "";
      document.getElementById("whTrade").value = "";
      document.getElementById("whLocation").value = "";
      if (warehouseModal) {
        warehouseModal.classList.add("active");
      }
    });
  }

  const closeWarehouseModal = document.getElementById("closeWarehouseModal");
  const cancelWarehouseBtn = document.getElementById("cancelWarehouseBtn");
  const saveWarehouseBtn = document.getElementById("saveWarehouseBtn");

  if (closeWarehouseModal) {
    closeWarehouseModal.addEventListener("click", () => {
      if (warehouseModal) {
        warehouseModal.classList.remove("active");
      }
    });
  }

  if (cancelWarehouseBtn) {
    cancelWarehouseBtn.addEventListener("click", () => {
      if (warehouseModal) {
        warehouseModal.classList.remove("active");
      }
    });
  }

  if (saveWarehouseBtn) {
    saveWarehouseBtn.addEventListener("click", async () => {
      const name = (document.getElementById("whName").value || "").trim();
      const code = (document.getElementById("whCode").value || "").trim();
      const projectId = (document.getElementById("whProjectId").value || "").trim();
      const client = (document.getElementById("whClient").value || "").trim();
      const clientPo = (document.getElementById("whClientPo").value || "").trim();
      const scope = (document.getElementById("whScope").value || "").trim();
      // Get multiple selected trades
      const tradeValue = (document.getElementById("whTrade").value || "").trim();
      const trades = tradeValue ? tradeValue.split(",").map(t => t.trim()).filter(v => v) : [];
      const location = (document.getElementById("whLocation").value || "").trim();

      if (!name || !code) {
        showAlert("Fill in Project name", "error");
      return;
    }

    try {
      const projectData = {
        name,
        code,
        projectId,
        client,
        clientPo,
        scope,
        trades,
        location,
        status: "active",
        updatedAt: new Date().toISOString()
      };

      if (!editingWarehouseId) {
        await addDoc(collection(db, "projects"), {
          ...projectData,
          createdAt: new Date().toISOString()
        });
        showAlert("Project added!", "success");
      } else {
        await updateDoc(doc(db, "projects", editingWarehouseId), projectData);
        showAlert("Project updated!", "success");
      }

      if (warehouseModal) {
        warehouseModal.classList.remove("active");
      }
      loadWarehouses();
    } catch (err) {
      showAlert("Error saving project: " + err.message, "error");
    }
    });
  }

  // Restrictions Management
  console.log("Initializing restrictions management...");
  
  setTimeout(() => {
    const restrictionModal = document.getElementById("restrictionModal");
    const addPermissionBtn = document.getElementById("addPermissionBtn");
    const closeRestrictionModal = document.getElementById("closeRestrictionModal");
    const cancelRestrictionBtn = document.getElementById("cancelRestrictionBtn");
    const saveRestrictionBtn = document.getElementById("saveRestrictionBtn");
    const restrictionUserSelect = document.getElementById("restrictionUserSelect");
    const restrictionUserSearch = document.getElementById("restrictionUserSearch");
    const restrictionUserDropdown = document.getElementById("restrictionUserDropdown");
    const perUserTabBtn = document.getElementById("perUserTabBtn");
    const roleBasedTabBtn = document.getElementById("roleBasedTabBtn");
    const perUserMode = document.getElementById("perUserMode");
    const roleBasedMode = document.getElementById("roleBasedMode");
    const restrictionRoleSelect = document.getElementById("restrictionRoleSelect");

    console.log("Elements found:", {
      restrictionModal: !!restrictionModal,
      addPermissionBtn: !!addPermissionBtn,
      closeRestrictionModal: !!closeRestrictionModal,
      cancelRestrictionBtn: !!cancelRestrictionBtn,
      saveRestrictionBtn: !!saveRestrictionBtn,
      restrictionUserSelect: !!restrictionUserSelect,
      restrictionUserSearch: !!restrictionUserSearch,
      restrictionUserDropdown: !!restrictionUserDropdown,
      perUserTabBtn: !!perUserTabBtn,
      roleBasedTabBtn: !!roleBasedTabBtn
    });

    // Tab switching functionality
    if (perUserTabBtn && roleBasedTabBtn) {
      perUserTabBtn.addEventListener("click", () => {
        currentRestrictionMode = "per-user";
        perUserMode.style.display = "block";
        roleBasedMode.style.display = "none";
        perUserTabBtn.style.color = "#0a9b03";
        perUserTabBtn.style.borderBottomColor = "#0a9b03";
        roleBasedTabBtn.style.color = "#666";
        roleBasedTabBtn.style.borderBottomColor = "transparent";
        if (restrictionUserSearch) restrictionUserSearch.focus();
      });

      roleBasedTabBtn.addEventListener("click", () => {
        currentRestrictionMode = "role-based";
        perUserMode.style.display = "none";
        roleBasedMode.style.display = "block";
        perUserTabBtn.style.color = "#666";
        perUserTabBtn.style.borderBottomColor = "transparent";
        roleBasedTabBtn.style.color = "#0a9b03";
        roleBasedTabBtn.style.borderBottomColor = "#0a9b03";
        if (restrictionRoleSelect) restrictionRoleSelect.focus();
      });
    }

    // Searchable user field functionality
    if (restrictionUserSearch && restrictionUserDropdown) {
      restrictionUserSearch.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        restrictionUserDropdown.innerHTML = "";
        
        if (searchTerm.length === 0) {
          restrictionUserDropdown.style.display = "none";
          return;
        }

        const filteredUsers = allUsers.filter(user => {
          const name = (user.name || "").toLowerCase();
          const role = (user.role || "").toLowerCase();
          return name.includes(searchTerm) || role.includes(searchTerm);
        });

        if (filteredUsers.length === 0) {
          restrictionUserDropdown.innerHTML = '<li style="padding:10px;color:#a0a0a0;cursor:default;">No users found</li>';
        } else {
          filteredUsers.forEach(user => {
            const li = document.createElement("li");
            li.style.cssText = "padding:10px;cursor:pointer;border-bottom:1px solid rgba(10,155,3,0.2);transition:background 0.2s;";
            li.innerHTML = `<div style="font-weight:600;">${user.name || "Unknown"}</div><div style="font-size:12px;color:#a0a0a0;">${user.role || "N/A"}</div>`;
            li.addEventListener("mouseenter", () => {
              li.style.background = "rgba(10,155,3,0.2)";
            });
            li.addEventListener("mouseleave", () => {
              li.style.background = "transparent";
            });
            li.addEventListener("click", () => {
              restrictionUserSearch.value = `${user.name} (${user.role})`;
              restrictionUserSelect.value = user.id;
              restrictionUserDropdown.style.display = "none";
            });
            restrictionUserDropdown.appendChild(li);
          });
        }
        
        restrictionUserDropdown.style.display = "block";
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (e.target !== restrictionUserSearch && e.target !== restrictionUserDropdown) {
          restrictionUserDropdown.style.display = "none";
        }
      });
    }

    // Open modal and focus search field
    if (addPermissionBtn) {
      console.log("Attaching click handler to addPermissionBtn");
      addPermissionBtn.addEventListener("click", async () => {
        console.log("Set Restriction button clicked");
        if (restrictionModal) {
          // Reload users from database to include any newly created employees
          try {
            allUsers = [];
            const collections = ["admin_users", "inventory_users", "warehouse_users", "purchasing_users", "attendance_users", "finance_users", "employees"];
            for (const collName of collections) {
              const snap = await getDocs(collection(db, collName));
              snap.forEach(s => {
                const user = { id: s.id, ...s.data() };
                allUsers.push(user);
              });
            }
            console.log("Users reloaded for restrictions:", allUsers.length);
          } catch (err) {
            console.error("Error reloading users:", err);
          }
          
          restrictionModal.classList.add("active");
          setTimeout(() => {
            if (currentRestrictionMode === "per-user" && restrictionUserSearch) {
              restrictionUserSearch.focus();
            } else if (currentRestrictionMode === "role-based" && restrictionRoleSelect) {
              restrictionRoleSelect.focus();
            }
          }, 100);
        }
      });
    }

    if (closeRestrictionModal) {
      closeRestrictionModal.addEventListener("click", () => {
        if (restrictionModal) {
          restrictionModal.classList.remove("active");
          // Reset editing state and button text
          editingRestrictionUserId = null;
          const saveBtn = document.getElementById("saveRestrictionBtn");
          if (saveBtn) {
            saveBtn.textContent = "Set Restriction";
          }
          // Show tabs again
          const perUserTabBtn = document.getElementById("perUserTabBtn");
          const roleBasedTabBtn = document.getElementById("roleBasedTabBtn");
          if (perUserTabBtn) perUserTabBtn.style.display = "inline-block";
          if (roleBasedTabBtn) roleBasedTabBtn.style.display = "inline-block";
          
          // Remove editing label if it exists
          const editingLabel = document.getElementById("editingUserLabel");
          if (editingLabel) editingLabel.remove();
          
          // Restore the user search input and dropdown visibility
          const userSearchInput = document.getElementById("restrictionUserSearch");
          if (userSearchInput) {
            userSearchInput.style.display = "block";
            userSearchInput.value = "";
          }
          const userDropdown = document.getElementById("restrictionUserDropdown");
          if (userDropdown) userDropdown.style.display = "none";
        }
      });
    }

    if (cancelRestrictionBtn) {
      cancelRestrictionBtn.addEventListener("click", () => {
        if (restrictionModal) {
          restrictionModal.classList.remove("active");
          // Reset editing state and button text
          editingRestrictionUserId = null;
          const saveBtn = document.getElementById("saveRestrictionBtn");
          if (saveBtn) {
            saveBtn.textContent = "Set Restriction";
          }
          // Show tabs again
          const perUserTabBtn = document.getElementById("perUserTabBtn");
          const roleBasedTabBtn = document.getElementById("roleBasedTabBtn");
          if (perUserTabBtn) perUserTabBtn.style.display = "inline-block";
          if (roleBasedTabBtn) roleBasedTabBtn.style.display = "inline-block";
          
          // Remove editing label if it exists
          const editingLabel = document.getElementById("editingUserLabel");
          if (editingLabel) editingLabel.remove();
          
          // Restore the user search input and dropdown visibility
          const userSearchInput = document.getElementById("restrictionUserSearch");
          if (userSearchInput) {
            userSearchInput.style.display = "block";
            userSearchInput.value = "";
          }
          const userDropdown = document.getElementById("restrictionUserDropdown");
          if (userDropdown) userDropdown.style.display = "none";
        }
      });
    }

    if (saveRestrictionBtn) {
      saveRestrictionBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Save Restriction clicked, Mode:", currentRestrictionMode);
        
        const restrictions = {
          inventory: document.getElementById("restrictionInventory")?.checked || false,
          attendance: document.getElementById("restrictionAttendance")?.checked || false,
          purchasing: document.getElementById("restrictionPurchasing")?.checked || false,
          finance: document.getElementById("restrictionFinance")?.checked || false
        };

        try {
          if (currentRestrictionMode === "per-user") {
            // Per-user mode: save for a specific user
            if (!restrictionUserSelect) {
              showAlert("User select not found", "error");
              return;
            }
            
            let userId = editingRestrictionUserId || restrictionUserSelect.value;
            if (!userId) {
              showAlert("Please select a user", "error");
              return;
            }

            await setDoc(doc(db, "user_restrictions", userId), {
              userId,
              restrictionType: "per-user",
              ...restrictions,
              updatedAt: new Date().toISOString()
            });

            const actionText = editingRestrictionUserId ? "updated" : "saved";
            showAlert(`User restriction ${actionText} successfully!`, "success");
            editingRestrictionUserId = null;
          } else if (currentRestrictionMode === "role-based") {
            // Role-based mode: save for all users with that role
            if (!restrictionRoleSelect) {
              showAlert("Role select not found", "error");
              return;
            }
            
            const selectedRole = restrictionRoleSelect.value;
            if (!selectedRole) {
              showAlert("Please select a role", "error");
              return;
            }

            // Find all users with this role
            const usersWithRole = allUsers.filter(user => user.role === selectedRole);
            if (usersWithRole.length === 0) {
              showAlert(`No users found with role: ${selectedRole}`, "warning");
              return;
            }

            // Save restrictions for all users with this role
            for (const user of usersWithRole) {
              await setDoc(doc(db, "user_restrictions", user.id), {
                userId: user.id,
                restrictionType: "role-based",
                role: selectedRole,
                ...restrictions,
                updatedAt: new Date().toISOString()
              });
            }

            showAlert(`Restrictions applied to ${usersWithRole.length} user(s) with role: ${selectedRole}`, "success");
          }

          if (restrictionModal) {
            restrictionModal.classList.remove("active");
          }
          
          // Clear form
          if (restrictionUserSelect) restrictionUserSelect.value = "";
          if (restrictionUserSearch) restrictionUserSearch.value = "";
          if (restrictionRoleSelect) restrictionRoleSelect.value = "";
          const inventoryCheck = document.getElementById("restrictionInventory");
          const attendanceCheck = document.getElementById("restrictionAttendance");
          const purchasingCheck = document.getElementById("restrictionPurchasing");
          const financeCheck = document.getElementById("restrictionFinance");
          
          if (inventoryCheck) inventoryCheck.checked = false;
          if (attendanceCheck) attendanceCheck.checked = false;
          if (purchasingCheck) purchasingCheck.checked = false;
          if (financeCheck) financeCheck.checked = false;

          // Reset button text
          if (saveRestrictionBtn) {
            saveRestrictionBtn.textContent = "Save Restriction";
          }
          
          editingRestrictionUserId = null;
          loadPermissions();
        } catch (err) {
          showAlert("Error saving restriction: " + err.message, "error");
        }
      });
    }
  }, 500);
});
