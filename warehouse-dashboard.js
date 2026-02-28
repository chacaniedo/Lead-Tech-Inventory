
import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  getDoc,
  doc,
  collection,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

let allMaterials = [];
let allWarehouses = [];
let allProjects = [];
let allMaterialRequests = [];
let currentUser = null;
let unsubscribeAuth = null;
let editingMaterialId = null;
let editingWarehouseId = null;
let stockStatusChartInstance = null;
let projectDistributionChartInstance = null;
let currentMRItems = [];  // Track items being added to MR
let stockChartDailyData = {}; // Store daily stock data {date: {day: 'Thu', stock: 7607}}
let stockChartMidnightInterval = null; // Store interval reference
let materialColumns = [
  { name: "Item Code", visible: true },
  { name: "Material", visible: true },
  { name: "Specification", visible: true },
  { name: "Brand", visible: true },
  { name: "Unit", visible: true },
  { name: "Warehouse", visible: true },
  { name: "Status", visible: true },
  { name: "Quantity", visible: true }
];

function showAlert(message, type = "success") {
  const alert = document.createElement("div");
  alert.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: ${type === "success" ? "#0a9b03" : "#ff6b6b"};
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    z-index: 3000;
    max-width: 420px;
    font-weight: 600;
    white-space: pre-wrap;
    text-align: left;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  alert.innerHTML = message.replace(/\n/g, "<br>");
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 4200);
}

// Generate sequential MR number (MR001, MR002, etc.) - synced with main dashboard
async function getNextMRNumber() {
  try {
    const snap = await getDocs(collection(db, "materialRequests"));
    let count = snap.size + 1;
    
    return `MR${String(count).padStart(3, '0')}`;
  } catch (err) {
    console.error("Error getting MR number:", err);
    return `MR001`;
  }
}

function showDeleteConfirmCard(itemType, itemName) {
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
        <h2 style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">Are you sure you want to delete ${itemName || 'this item'} ?</h2>

        <div>
          <strong style="margin: 0; font-size: 12px; color: #a60202;">Note : This action cannot be undone</strong>
        </div>

        <div style="padding: 16px; margin-top: auto;">
          <div style="display: flex; gap: 10px;">
            <button id="cancelDeleteBtn" style="flex: 1; background:rgba(21, 175, 37, 0.67); color: #e0e0e0; border: 1px solid #00ff00; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">Keep</button>
            <button id="confirmDeleteBtn" style="flex: 1; background:rgba(188, 14, 14, 0.58); color: #e0e0e0; border: 1px solid #ff0000; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">Delete</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(card);

    const confirmBtn = document.getElementById("confirmDeleteBtn");
    const cancelBtn = document.getElementById("cancelDeleteBtn");

    confirmBtn.onmouseover = () => { confirmBtn.style.opacity = "0.9"; };
    confirmBtn.onmouseout = () => { confirmBtn.style.opacity = "1"; };
    cancelBtn.onmouseover = () => { cancelBtn.style.opacity = "0.9"; };
    cancelBtn.onmouseout = () => { cancelBtn.style.opacity = "1"; };

    const removeCard = () => {
      backdrop.remove();
      card.remove();
    };

    confirmBtn.onclick = () => {
      removeCard();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      removeCard();
      resolve(false);
    };

    backdrop.onclick = () => {
      removeCard();
      resolve(false);
    };
  });
}

// ==================== WAREHOUSE FUNCTIONS ====================
async function loadWarehouses() {
  try {
    const snap = await getDocs(collection(db, "projects"));
    allWarehouses = [];
    snap.forEach(doc => {
      allWarehouses.push({ id: doc.id, ...doc.data() });
    });
    renderWarehouseTable();
    updateWarehouseDropdowns();
    updateProjectDistributionChart();
    updateWeeklyStockChart();
    return Promise.resolve();
  } catch (err) {
    console.error("Error loading projects:", err);
    return Promise.reject(err);
  }
}

function renderWarehouseTable() {
  const warehouseBody = document.getElementById("warehouseBody");
  if (!warehouseBody) return;
  warehouseBody.innerHTML = "";
  allWarehouses.forEach(wh => {
    const tradesDisplay = Array.isArray(wh.trades) ? wh.trades.join(", ") : (wh.trade || "N/A");
    warehouseBody.innerHTML += `
      <tr>
        <td>${wh.name || "N/A"}</td>
        <td>${wh.code || "N/A"}</td>
        <td>${wh.projectId || "N/A"}</td>
        <td>${wh.client || "N/A"}</td>
        <td>${wh.clientPo || "N/A"}</td>
        <td>${wh.scope || "N/A"}</td>
        <td>${tradesDisplay}</td>
        <td>${wh.location || "N/A"}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-edit" onclick="editWarehouse('${wh.id}')">Edit</button>
            <button class="btn-delete" onclick="deleteWarehouse('${wh.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}

function updateWarehouseFilters() {
  const tabsContainer = document.querySelector(".warehouses-row .tabs");
  if (tabsContainer) {
    tabsContainer.innerHTML = '<button class="tab active" data-warehouse="all">All</button>';
    allWarehouses.forEach(wh => {
      tabsContainer.innerHTML += `<button class="tab" data-warehouse="${wh.id}">${wh.name}</button>`;
    });
  }
}

function updateWarehouseDropdowns() {
  const matWarehouse = document.getElementById("matWarehouse");
  if (matWarehouse) {
    const selectedValue = matWarehouse.value;
    matWarehouse.innerHTML = '<option value="">Select Warehouse</option>';
    allWarehouses.forEach(wh => {
      matWarehouse.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
    });
    if (selectedValue) matWarehouse.value = selectedValue;
  }
}

function openWarehouseModal(warehouse = null) {
  const modal = document.getElementById("warehouseModal");
  const form = document.getElementById("warehouseForm");
  if (warehouse) {
    document.getElementById("warehouseModalTitle").textContent = "Edit Project";
    document.getElementById("whName").value = warehouse.name || "";
    document.getElementById("whCode").value = warehouse.code || "";
    document.getElementById("whProjectId").value = warehouse.projectId || "";
    document.getElementById("whClient").value = warehouse.client || "";
    document.getElementById("whClientPo").value = warehouse.clientPo || "";
    document.getElementById("whScope").value = warehouse.scope || "";
    const trades = Array.isArray(warehouse.trades) ? warehouse.trades : (warehouse.trade ? [warehouse.trade] : []);
    document.getElementById("whTrade").value = trades.join(",");
    document.getElementById("whLocation").value = warehouse.location || "";
    editingWarehouseId = warehouse.id;
  } else {
    document.getElementById("warehouseModalTitle").textContent = "Add Project";
    form.reset();
    editingWarehouseId = null;
  }
  modal.style.display = "flex";
}

window.editWarehouse = (id) => {
  const warehouse = allWarehouses.find(w => w.id === id);
  if (warehouse) openWarehouseModal(warehouse);
};

window.deleteWarehouse = async (id) => {
  const warehouse = allWarehouses.find(w => w.id === id);
  const confirmed = await showDeleteConfirmCard("Project", warehouse?.name || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "projects", id));
    await logActivity("project", "delete", `Deleted project: ${warehouse?.name}`);
    showAlert("✅ Project deleted!", "success");
    loadWarehouses();
  } catch (e) {
    showAlert("❌ Error: " + e.message, "error");
  }
};

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("tab")) {
    const tabsParent = e.target.closest(".warehouses-row .tabs");
    if (tabsParent) {
      document.querySelectorAll(".warehouses-row .tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const warehouse = e.target.dataset.warehouse;
      if (warehouse) {
        const stockTab = document.getElementById("stock-monitoring");
        if (stockTab) {
          renderStockMonitoring(warehouse);
        }
      }
    }
  }
});

function updateMaterialSummaries(warehouse = "all") {
  let total = 0, items = 0, low = 0;
  
  // Group materials by itemCode + material to deduplicate (same material in different warehouses)
  const groupedMaterials = {};
  
  allMaterials.forEach(mat => {
    // Stock Monitoring only counts materials that have been added to stock (have itemCode, material, AND warehouse, and quantity > 0)
    const quantity = parseInt(mat.quantity) || 0;
    if (!mat.itemCode || !mat.material || !mat.warehouse || quantity === 0) return;
    
    // If not "all", only count materials from selected warehouse
    if (warehouse !== "all" && mat.warehouse !== warehouse) {
      return;
    }
    
    // Create key using itemCode + material + specification to keep different specs separate
    const key = `${mat.itemCode}_${mat.material}_${mat.specification || "-"}`;
    
    if (!groupedMaterials[key]) {
      groupedMaterials[key] = {
        totalQuantity: 0
      };
    }
    
    // Sum quantities across all warehouses (or within selected warehouse)
    groupedMaterials[key].totalQuantity += quantity;
  });
  
  // Count unique items and calculate totals
  Object.values(groupedMaterials).forEach(mat => {
    const qty = mat.totalQuantity;
    total += qty;
    items++;
  });
  
  // For low stock: count warehouse entries with low stock based on the warehouse filter
  allMaterials.forEach(mat => {
    const quantity = parseInt(mat.quantity) || 0;
    const minQty = parseInt(mat.minimumQuantity) || 10;
    
    // Only count if it's a valid stock item
    if (!mat.itemCode || !mat.material || !mat.warehouse || quantity === 0) return;
    
    // Filter by warehouse if not "all"
    if (warehouse !== "all" && mat.warehouse !== warehouse) {
      return;
    }
    
    // Count if low stock
    if (quantity <= minQty) {
      low++;
    }
  });
  
  document.getElementById("matTotalStock") && (document.getElementById("matTotalStock").textContent = total);
  document.getElementById("matTotalItems") && (document.getElementById("matTotalItems").textContent = items);
  document.getElementById("matLowStock") && (document.getElementById("matLowStock").textContent = low);
  document.getElementById("dashTotalStock") && (document.getElementById("dashTotalStock").textContent = total);
  document.getElementById("dashTotalItems") && (document.getElementById("dashTotalItems").textContent = items);
  document.getElementById("dashLowStock") && (document.getElementById("dashLowStock").textContent = low);
  
  // Update near-to-expire count
  updateNearExpireCount(warehouse);
}

// Stock Monitoring Table Rendering
function renderStockMonitoring(warehouseFilter = "") {
  const inventoryBody = document.getElementById("inventoryBody");
  const emptyMsg = document.getElementById("stockEmptyMsg");
  
  if (!inventoryBody) return;
  inventoryBody.innerHTML = "";
  
  // Get search and status filter values
  const searchInput = document.getElementById("searchMaterial");
  const statusSelect = document.getElementById("materialFilterStatus");
  const searchQuery = searchInput ? searchInput.value.toLowerCase() : "";
  const statusFilter = statusSelect ? statusSelect.value : "";
  
  // Group materials by itemCode + material to deduplicate
  const groupedMaterials = {};
  
  allMaterials.forEach(mat => {
    // Only show items with itemCode, material, warehouse, and qty > 0
    const quantity = parseInt(mat.quantity) || 0;
    if (!mat.itemCode || !mat.material || !mat.warehouse || quantity === 0) return;
    
    // Filter by selected warehouse (if warehouse staff, only their assigned warehouse)
    if (currentUser?.role === "warehouse_staff" && currentUser?.warehouse !== mat.warehouse) {
      return;
    }
    
    // Apply warehouse filter from dropdown/tabs
    if (warehouseFilter && warehouseFilter !== "all" && mat.warehouse !== warehouseFilter) return;
    
    // Apply search filter
    if (searchQuery) {
      const matchesItemCode = mat.itemCode && mat.itemCode.toLowerCase().includes(searchQuery);
      const matchesMaterial = mat.material && mat.material.toLowerCase().includes(searchQuery);
      if (!matchesItemCode && !matchesMaterial) return;
    }
    
    // Create key using itemCode + material + specification to keep different specs separate
    const key = `${mat.itemCode}_${mat.material}_${mat.specification || "-"}`;
    
    if (!groupedMaterials[key]) {
      groupedMaterials[key] = {
        id: mat.id,
        itemCode: mat.itemCode,
        material: mat.material,
        description: mat.description,
        specification: mat.specification || mat.specs || "",
        category: mat.category,
        whloc: mat.whloc || "",
        warehouse: mat.warehouse,
        minimumQuantity: mat.minimumQuantity || 10,
        ...mat,
        totalQuantity: 0
      };
    }
    
    // Sum quantities
    groupedMaterials[key].totalQuantity += quantity;
  });
  
  // Sort by item code and render
  const materials = Object.values(groupedMaterials).sort((a, b) => {
    const aCode = parseInt(a.itemCode) || 0;
    const bCode = parseInt(b.itemCode) || 0;
    return aCode - bCode;
  });
  
  if (materials.length === 0) {
    inventoryBody.innerHTML = "";
    if (emptyMsg) emptyMsg.style.display = "block";
    return;
  }
  
  if (emptyMsg) emptyMsg.style.display = "none";
  
  materials.forEach(mat => {
    const quantity = mat.totalQuantity;
    const minQty = parseInt(mat.minimumQuantity) || 10;
    const status = quantity <= minQty ? "LOW" : "OK";
    if (statusFilter && status !== statusFilter) return;
    const statusClass = status === "LOW" ? "status-low" : "status-ok";
    const warehouseName = allWarehouses.find(w => w.id === mat.warehouse)?.name || mat.warehouse || "-";
    
    // Check if user can edit this material (only if it's their warehouse)
    const canEdit = currentUser?.warehouse === mat.warehouse;
    
    let row = `<tr>`;
    
    // Add columns based on materialColumns configuration
    materialColumns.forEach(col => {
      if (col.name === "Item Code") {
        row += `<td>${mat.itemCode || "-"}</td>`;
      } else if (col.name === "Material") {
        row += `<td>${mat.material || "-"}</td>`;
      } else if (col.name === "Specification") {
        row += `<td>${mat.specification || "-"}</td>`;
      } else if (col.name === "Brand") {
        row += `<td>${mat.brand || "-"}</td>`;
      } else if (col.name === "Unit") {
        row += `<td>${mat.unit || "PCS"}</td>`;
      } else if (col.name === "Warehouse") {
        row += `<td>${warehouseName}</td>`;
      } else if (col.name === "Status") {
        row += `<td><span class="${statusClass}"><i class="fa-solid fa-${status === 'LOW' ? 'exclamation' : 'check'}"></i> ${status}</span></td>`;
      } else if (col.name === "Quantity") {
        row += `<td>${quantity || "0"}</td>`;
      }
    });
    
    // Actions column - Update/Transfer for own warehouse, View text only for others
    row += `<td><div class="action-buttons">`;
    if (canEdit) {
      // Own warehouse - show Update and Transfer
      row += `<button class="btn-edit" onclick="window.editMaterialQuantity('${mat.id}')">Update</button>`;
      row += `<button class="btn-edit" style="background:#1dd1a1;" onclick="window.transferMaterialStock('${mat.id}')">Transfer</button>`;
    } else {
      // Other warehouse - show View as plain text only (NOT clickable)
      row += `<span style="color:#0a9b03;font-weight:600;">View</span>`;
    }
    row += `</div></td></tr>`;
    
    inventoryBody.innerHTML += row;
  });
  
  // Update summary based on warehouse filter
  if (warehouseFilter) {
    updateMaterialSummaries(warehouseFilter);
  } else {
    updateMaterialSummaries(currentUser?.warehouse || "all");
  }
}

// Window functions for stock monitoring
window.editMaterialQuantity = function(materialId) {
  const material = allMaterials.find(m => m.id === materialId);
  if (!material) return;
  
  const modal = document.getElementById("materialModal");
  const updateChoice = document.getElementById("updateMaterialChoice");
  const transferChoice = document.getElementById("transferMaterialChoice");
  
  // Set to update mode
  updateChoice.checked = true;
  transferChoice.checked = false;
  document.getElementById("materialForm").style.display = "block";
  document.getElementById("transferMaterialForm").style.display = "none";
  
  // Populate form
  document.getElementById("matItemCode").value = material.itemCode || "";
  document.getElementById("matMaterial").value = material.material || "";
  document.getElementById("matDescription").value = material.description || "";
  document.getElementById("matQuantity").value = "";
  
  // Store current material ID
  window.currentEditingMaterialId = materialId;
  
  modal.style.display = "flex";
};

window.transferMaterialStock = function(materialId) {
  const material = allMaterials.find(m => m.id === materialId);
  if (!material) return;
  
  const modal = document.getElementById("materialModal");
  const updateChoice = document.getElementById("updateMaterialChoice");
  const transferChoice = document.getElementById("transferMaterialChoice");
  
  // Set to transfer mode
  updateChoice.checked = false;
  transferChoice.checked = true;
  document.getElementById("materialForm").style.display = "none";
  document.getElementById("transferMaterialForm").style.display = "block";
  
  // Populate transfer form
  document.getElementById("transferMaterialName").textContent = material.material;
  document.getElementById("transferAvailableQty").textContent = material.quantity;
  document.getElementById("transferQuantity").value = "";
  
  // Populate warehouse selector (exclude current warehouse)
  const warehouseSelect = document.getElementById("transferToWarehouse");
  warehouseSelect.innerHTML = '<option value="">Select destination warehouse</option>';
  
  allWarehouses.forEach(wh => {
    if (wh.id !== material.warehouse) {
      const option = document.createElement("option");
      option.value = wh.id;
      option.textContent = wh.name;
      warehouseSelect.appendChild(option);
    }
  });
  
  // Store current material ID
  window.currentEditingMaterialId = materialId;
  
  modal.style.display = "flex";
};

// View material details (read-only for other warehouses)
window.viewMaterialDetails = function(materialId) {
  const material = allMaterials.find(m => m.id === materialId);
  if (!material) return;
  
  const warehouseName = allWarehouses.find(w => w.id === material.warehouse)?.name || material.warehouse || "-";
  const qty = parseInt(material.quantity) || 0;
  const minQty = parseInt(material.minimumQuantity) || 10;
  const status = qty <= minQty ? "LOW" : "OK";
  const statusColor = status === "LOW" ? "#ff6b6b" : "#1dd1a1";
  
  // Create modal dialog
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 5000;
  `;
  
  modal.innerHTML = `
    <div style="background: #0f1e35;border: 1px solid rgba(10,155,3,0.3);border-radius: 8px;padding: 30px;max-width: 500px;width: 90%;color: #e0e0e0;box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
      <h2 style="color: #0a9b03;margin: 0 0 20px 0;font-size: 20px;">Material Details</h2>
      
      <div style="display: grid;grid-template-columns: 1fr 1fr;gap: 15px;margin-bottom: 20px;">
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Item Code</label>
          <p style="margin: 0;color: #e0e0e0;font-weight: 600;">${material.itemCode || "-"}</p>
        </div>
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Category</label>
          <p style="margin: 0;color: #e0e0e0;font-weight: 600;">${material.category || "-"}</p>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Material</label>
        <p style="margin: 0;color: #e0e0e0;font-weight: 600;">${material.material || "-"}</p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Specification</label>
        <p style="margin: 0;color: #e0e0e0;">${material.specification || "-"}</p>
      </div>
      
      <div style="display: grid;grid-template-columns: 1fr 1fr;gap: 15px;margin-bottom: 20px;">
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Wh Loc</label>
          <p style="margin: 0;color: #e0e0e0;">${material.whloc || "-"}</p>
        </div>
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Warehouse</label>
          <p style="margin: 0;color: #e0e0e0;font-weight: 600;">${warehouseName}</p>
        </div>
      </div>
      
      <div style="display: grid;grid-template-columns: 1fr 1fr 1fr;gap: 15px;margin-bottom: 20px;padding: 15px;background: rgba(10,155,3,0.1);border-radius: 6px;border-left: 4px solid #0a9b03;">
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Current Qty</label>
          <p style="margin: 0;color: #1dd1a1;font-weight: 600;font-size: 18px;">${qty}</p>
        </div>
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Min Qty</label>
          <p style="margin: 0;color: #e0e0e0;font-weight: 600;font-size: 18px;">${minQty}</p>
        </div>
        <div>
          <label style="color: #a0a0a0;font-size: 12px;font-weight: 600;text-transform: uppercase;display: block;margin-bottom: 5px;">Status</label>
          <p style="margin: 0;color: ${statusColor};font-weight: 600;font-size: 18px;">${status}</p>
        </div>
      </div>
      
      <button style="width: 100%;padding: 12px;background: #0a9b03;color: white;border: none;border-radius: 6px;cursor: pointer;font-weight: 600;font-size: 14px;" onclick="this.closest('div').parentElement.parentElement.remove()">Close</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
};

function updateProjectDistributionChart() {
  const canvas = document.getElementById("projectDistributionChart");
  if (!canvas) return;

  // Count materials by project using same logic as Stock Monitoring
  const projectData = {};
  
  allMaterials.forEach(mat => {
    // Only count materials that are actually in stock (same as Stock Monitoring tab)
    const quantity = parseInt(mat.quantity) || 0;
    if (!mat.itemCode || !mat.material || !mat.warehouse || quantity === 0) return;
    
    // Sum quantity for each project/warehouse
    const projectId = mat.warehouse;
    projectData[projectId] = (projectData[projectId] || 0) + quantity;
  });

  const labels = [];
  const data = [];
  
  // Better color palette - softer, more professional
  const colors = [
    "#4CAF50", "#2196F3", "#FF9800", "#9C27B0",
    "#00BCD4", "#F44336", "#E91E63", "#673AB7",
    "#3F51B5", "#009688", "#CDDC39", "#795548",
    "#607D8B", "#FF5722", "#8BC34A", "#FFEB3B"
  ];
  
  // Show ALL projects from project management with their stock totals
  if (allWarehouses && allWarehouses.length > 0) {
    allWarehouses.forEach((project, idx) => {
      const projectCode = project.code || project.projectId || project.name || project.id;
      const projectDocId = project.id;
      
      // Try matching by both code AND document ID
      const quantity = projectData[projectCode] || projectData[projectDocId] || 0;
      
      labels.push(projectCode);
      data.push(quantity);
    });
  }

  // Destroy previous chart if it exists
  if (projectDistributionChartInstance) {
    projectDistributionChartInstance.destroy();
  }

  // Create new HORIZONTAL BAR chart
  const ctx = canvas.getContext("2d");
  projectDistributionChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length > 0 ? labels : ["No Projects"],
      datasets: [{
        label: "Quantity (units)",
        data: data.length > 0 ? data : [0],
        backgroundColor: colors.slice(0, Math.max(labels.length, 1)),
        borderColor: "#0f1419",
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#d0d0d0",
            font: { size: 11, weight: "600" },
            padding: 10
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.x;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return "Quantity: " + value + " units (" + percentage + "%)";
            }
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "#666",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: "#d0d0d0",
            font: { size: 11 }
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)"
          }
        },
        y: {
          ticks: {
            color: "#d0d0d0",
            font: { size: 11, weight: "600" }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

function loadStockChartDailyData() {
  // Load saved daily data from localStorage
  const savedData = localStorage.getItem("stockChartDailyData");
  if (savedData) {
    try {
      stockChartDailyData = JSON.parse(savedData);
      console.log("Loaded stock chart daily data:", stockChartDailyData);
    } catch (e) {
      console.error("Error loading chart data:", e);
      stockChartDailyData = {};
    }
  } else {
    stockChartDailyData = {};
  }
}

function saveStockChartDailyData() {
  // Clean up data older than 14 days
  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  
  Object.keys(stockChartDailyData).forEach(dateStr => {
    const dataDate = new Date(dateStr);
    if (dataDate < fourteenDaysAgo) {
      delete stockChartDailyData[dateStr];
    }
  });
  
  // Save data to localStorage
  localStorage.setItem("stockChartDailyData", JSON.stringify(stockChartDailyData));
  console.log("Saved stock chart daily data:", stockChartDailyData);
}

function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}

function updateDailyStockData() {
  // Get current total stock
  const totalStock = allMaterials.reduce((sum, mat) => sum + parseInt(mat.quantity || 0), 0);
  
  // Get today's date
  const dateString = getTodayDateString();
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, Wed, etc.
  
  // Only update if data doesn't exist for today or if stock value has changed
  const hasExistingData = stockChartDailyData[dateString];
  const dataChanged = !hasExistingData || stockChartDailyData[dateString].stock !== totalStock;
  
  if (dataChanged) {
    // Save today's stock data
    stockChartDailyData[dateString] = {
      day: dayName,
      stock: totalStock,
      date: dateString
    };
    
    // Save to localStorage immediately
    saveStockChartDailyData();
    
    console.log(`Updated stock data for ${dayName} (${dateString}): ${totalStock} units`);
  }
}

function getNextMidnightTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0); // Set to midnight
  
  const timeUntilMidnight = tomorrow.getTime() - now.getTime();
  return timeUntilMidnight;
}

function startMidnightStockUpdate() {
  // Clear any existing timeout/interval
  if (stockChartMidnightInterval) {
    clearInterval(stockChartMidnightInterval);
    stockChartMidnightInterval = null;
  }
  
  // Update stock data immediately (in case it's a new day)
  updateDailyStockData();
  updateWeeklyStockChart();
  
  // Calculate time until next midnight
  const timeUntilMidnight = getNextMidnightTime();
  
  // Set timeout for next midnight
  setTimeout(() => {
    console.log("Midnight reached - capturing daily stock data");
    updateDailyStockData();
    updateWeeklyStockChart();
    
    // After midnight, set up the daily interval
    stockChartMidnightInterval = setInterval(() => {
      console.log("Daily midnight - capturing stock data");
      updateDailyStockData();
      updateWeeklyStockChart();
    }, 24 * 60 * 60 * 1000); // Every 24 hours (86400000 milliseconds)
  }, timeUntilMidnight);
}

function updateWeeklyStockChart() {
  const canvas = document.getElementById("weeklyStockChart");
  if (!canvas) return;

  let labels = [];
  let stockData = [];
  
  // Get the current week starting from Monday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate Monday of this week
  const monday = new Date(today);
  if (dayOfWeek === 0) {
    // If today is Sunday, go back 6 days to get Monday of the previous week
    monday.setDate(today.getDate() - 6);
  } else {
    // Otherwise, go back (dayOfWeek - 1) days to get Monday
    monday.setDate(today.getDate() - (dayOfWeek - 1));
  }
  
  // Generate Monday through Sunday
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateString = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, etc.
    
    labels.push(dayName);
    
    // Check if we have data for this day
    if (stockChartDailyData[dateString]) {
      stockData.push(stockChartDailyData[dateString].stock);
    } else {
      // Show current stock for today if no data, otherwise show null (creates gap in chart)
      const currentDate = new Date();
      const currentDateString = currentDate.toISOString().split('T')[0];
      if (dateString === currentDateString) {
        const currentStock = allMaterials.reduce((sum, mat) => sum + parseInt(mat.quantity || 0), 0);
        stockData.push(currentStock);
      } else {
        // For past dates without data, show null (creates a gap)
        stockData.push(null);
      }
    }
  }

  if (stockStatusChartInstance) {
    stockStatusChartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");
  stockStatusChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Daily Stock Level",
        data: stockData,
        borderColor: "#0a9b03",
        backgroundColor: "rgba(10, 155, 3, 0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#0a9b03",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#d0d0d0",
            font: { size: 12, weight: "600" },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#0a9b03",
          borderColor: "#0a9b03",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return "Units: " + Math.round(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "#a0a0a0" },
          grid: { color: "rgba(10, 155, 3, 0.1)" }
        },
        x: {
          ticks: { color: "#a0a0a0" },
          grid: { color: "rgba(10, 155, 3, 0.1)" }
        }
      }
    }
  });
}

function renderMaterials(warehouse, searchQuery = "", statusFilter = "") {
  const inventoryBody = document.getElementById("inventoryBody");
  const warehouseColHeader = document.getElementById("warehouseColHeader");
  if (!inventoryBody) return;
  inventoryBody.innerHTML = "";
  
  const userAssignedWarehouse = currentUser?.warehouse;
  
  // Create warehouse name mapping
  const warehouseMap = {};
  allWarehouses.forEach(wh => {
    warehouseMap[wh.id] = wh.name;
  });
  
  // For "All" view: Group materials by itemCode + material to consolidate duplicates
  if (warehouse === "all") {
    const groupedMaterials = {};
    
    allMaterials.forEach(mat => {
      // Only show materials with quantity > 0 (matches inventory module behavior)
      const quantity = parseInt(mat.quantity) || 0;
      if (quantity === 0) return;
      
      if (searchQuery && !mat.material.toLowerCase().includes(searchQuery.toLowerCase())) return;
      
      // Create key using itemCode + material + specification to keep different specs separate
      const key = `${mat.itemCode}_${mat.material}_${mat.specification || "-"}`;
      
      if (!groupedMaterials[key]) {
        groupedMaterials[key] = {
          id: mat.id,
          itemCode: mat.itemCode,
          material: mat.material,
          description: mat.description,
          specification: mat.specification || mat.specs || mat.specsbrand || "",
          category: mat.category || "",
          whloc: mat.whloc || mat.wh_loc || mat.whlocation || "",
          warehouse: mat.warehouse || "",
          brand: mat.brand || "",
          // Copy all other properties
          ...mat,
          totalQuantity: 0
        };
      }
      
      // Sum quantities across all warehouses
      groupedMaterials[key].totalQuantity += parseInt(mat.quantity) || 0;
    });
    
    // Render deduplicated materials
    Object.values(groupedMaterials).forEach(mat => {
      const quantity = mat.totalQuantity;
      const status = quantity <= 10 ? "LOW" : "OK";
      const statusClass = status === "LOW" ? "status-low" : "status-ok";
      
      // Apply status filter
      if (statusFilter && status !== statusFilter) return;
      
      // Get warehouse name from warehouse ID
      const warehouse = allWarehouses.find(w => w.id === mat.warehouse);
      const warehouseName = warehouse ? warehouse.name : (mat.warehouse || "-");
      
      inventoryBody.innerHTML += `
        <tr>
          <td>${mat.itemCode || "-"}</td>
          <td>${mat.material || "-"}</td>
          <td>${mat.specification || mat.specs || mat.specsbrand || "-"}</td>
          <td>${mat.category || "-"}</td>
          <td>${mat.whloc || mat.wh_loc || mat.whlocation || "-"}</td>
          <td>${warehouseName}</td>
          <td><span class="${statusClass}"><i class="fa-solid fa-${status === 'LOW' ? 'exclamation' : 'check'}"></i> ${status}</span></td>
          <td>${quantity || "0"}</td>
          <td>
            <div class="action-buttons">
              <span style="color:#a0a0a0;font-size:12px;font-style:italic;">View only</span>
            </div>
          </td>
        </tr>
      `;
    });
  } else {
    // For specific warehouse view: Show individual items with edit/delete options
    let filteredMaterials = allMaterials.filter(mat => {
      if (mat.warehouse !== warehouse) return false;
      // Only show materials with quantity > 0 (matches inventory module behavior)
      const quantity = parseInt(mat.quantity) || 0;
      if (quantity === 0) return false;
      if (searchQuery && !mat.material.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    // Render materials
    filteredMaterials.forEach(mat => {
      const quantity = parseInt(mat.quantity) || 0;
      const status = quantity <= 10 ? "LOW" : "OK";
      const statusClass = status === "LOW" ? "status-low" : "status-ok";
      
      // Apply status filter
      if (statusFilter && status !== statusFilter) return;
      
      // Can edit/delete materials from own warehouse
      const canEdit = mat.warehouse === userAssignedWarehouse;
      const actionButtons = canEdit
        ? `<button class="btn-edit" onclick="editMaterial('${mat.id}')">Edit</button>
           <button class="btn-delete" onclick="deleteMaterial('${mat.id}')">Delete</button>`
        : `<span style="color:#a0a0a0;font-size:12px;font-style:italic;">View only</span>`;
      
      // Get warehouse name from warehouse ID
      const warehouseObj = allWarehouses.find(w => w.id === mat.warehouse);
      const warehouseName = warehouseObj ? warehouseObj.name : (mat.warehouse || "-");
      
      inventoryBody.innerHTML += `
        <tr>
          <td>${mat.itemCode || "-"}</td>
          <td>${mat.material || "-"}</td>
          <td>${mat.specification || mat.specs || mat.specsbrand || "-"}</td>
          <td>${mat.category || "-"}</td>
          <td>${mat.whloc || mat.wh_loc || mat.whlocation || "-"}</td>
          <td>${warehouseName}</td>
          <td><span class="${statusClass}"><i class="fa-solid fa-${status === 'LOW' ? 'exclamation' : 'check'}"></i> ${status}</span></td>
          <td>${quantity || "0"}</td>
          <td>
            <div class="action-buttons">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    });
  }
  
  // Hide warehouse column for warehouse-dashboard (not needed here)
  if (warehouseColHeader) {
    warehouseColHeader.style.display = "none";
  }
  
  updateMaterialSummaries(warehouse);
}

function openMaterialModal(material = null) {
  const userAssignedWarehouse = currentUser?.warehouse;
  
  // If trying to edit material from different warehouse, prevent it
  if (material && material.warehouse !== userAssignedWarehouse) {
    showAlert("❌ You can only edit materials in your assigned warehouse", "error");
    return;
  }
  
  const modal = document.getElementById("materialModal");
  const form = document.getElementById("materialForm");
  const choiceToggle = document.getElementById("materialChoiceToggle");
  
  if (material) {
    // Show toggle and set to update mode for editing
    choiceToggle.style.display = "flex";
    document.getElementById("updateMaterialChoice").checked = true;
    document.getElementById("materialModalTitle").textContent = "Material - Update Quantity or Transfer";
    document.getElementById("matItemCode").value = material.itemCode || "";
    document.getElementById("matMaterial").value = material.material || "";
    document.getElementById("matDescription").value = material.description || "";
    document.getElementById("matQuantity").value = material.quantity || "";
    
    // Populate transfer form data
    document.getElementById("transferMaterialName").textContent = material.material || "-";
    document.getElementById("transferAvailableQty").textContent = material.quantity || "0";
    
    // Populate destination warehouses
    const toWarehouse = document.getElementById("transferToWarehouse");
    toWarehouse.innerHTML = '<option value="">Select destination warehouse</option>';
    allWarehouses.forEach(wh => {
      if (wh.id !== userAssignedWarehouse) {
        const option = document.createElement("option");
        option.value = wh.id;
        option.textContent = wh.name;
        toWarehouse.appendChild(option);
      }
    });
    
    // Show update form
    document.getElementById("materialForm").style.display = "block";
    document.getElementById("transferMaterialForm").style.display = "none";
    editingMaterialId = material.id;
  } else {
    // Hide toggle for add new
    choiceToggle.style.display = "none";
    document.getElementById("materialModalTitle").textContent = "Add Material";
    form.reset();
    editingMaterialId = null;
  }
  modal.style.display = "flex";
}

window.editMaterial = (id) => {
  const material = allMaterials.find(m => m.id === id);
  if (material) openMaterialModal(material);
};

window.deleteMaterial = async (id) => {
  const material = allMaterials.find(m => m.id === id);
  const confirmed = await showDeleteConfirmCard("Material", material?.material || "Unknown Material");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "materials", id));
    await logActivity("material", "delete", `Deleted material: ${material?.material}`);
    showAlert("✅ Material deleted!", "success");
    loadMaterials();
  } catch (e) {
    showAlert("❌ Error: " + e.message, "error");
  }
};

// ==================== ACTIVITY LOG ====================
async function logActivity(type, action, details) {
  try {
    const user = currentUser?.name || currentUser?.email || "Unknown";
    
    const activityData = {
      type: type,
      action: action,
      details: details,
      user: user,
      timestamp: new Date().toISOString(),
      userEmail: currentUser?.email || "system",
      userRole: currentUser?.role || "unknown"
    };
    
    const result = await addDoc(collection(db, "activityLog"), activityData);
    console.log(`Activity logged successfully: ${type} - ${action}`, result.id);
  } catch (err) {
    console.error("Error logging activity:", err);
    console.error("Activity details:", { type, action, details });
  }
}

// ==================== MATERIALS FUNCTIONS ====================
async function loadMaterials() {
  try {
    const snap = await getDocs(collection(db, "materials"));
    allMaterials = [];
    snap.forEach(doc => {
      allMaterials.push({ id: doc.id, ...doc.data() });
    });
    
    updateMaterialSummaries();
    loadMaterialCategories();
    renderMaterials("all");
    
    // Setup warehouse filter dropdown for stock monitoring
    setupWarehouseFilter();
  } catch (err) {
    console.error("Error loading materials:", err);
  }
}

// Setup warehouse filter dropdown for stock monitoring
function setupWarehouseFilter() {
  const warehouseFilter = document.getElementById("warehouseFilter");
  if (!warehouseFilter) return;
  
  // Populate dropdown with warehouses (projects)
  warehouseFilter.innerHTML = '<option value="all">All Projects</option>';
  if (allWarehouses && allWarehouses.length > 0) {
    allWarehouses.forEach(wh => {
      const option = document.createElement("option");
      option.value = wh.id;
      option.textContent = `${wh.name} (${wh.projectId || wh.id})`;
      warehouseFilter.appendChild(option);
    });
  }
  
  // Set up change event listener
  warehouseFilter.addEventListener("change", (e) => {
    const selectedWarehouse = e.target.value;
    renderStockMonitoring(selectedWarehouse);
    updateMaterialSummaries(selectedWarehouse);
  });
  
  // Initial render
  renderStockMonitoring("all");
  setupStockMonitoringFilters();
}

// Update Near to Expire count
function updateNearExpireCount(warehouse = "all") {
  try {
    const nearExpireItems = allMaterials.filter(item => {
      const qty = parseInt(item.quantity || 0);
      if (qty === 0) return false;
      
      if (!item.itemCode || !item.material) return false;
      if (!item.warehouse) return false;
      
      // Filter by warehouse if not "all"
      if (warehouse !== "all" && item.warehouse !== warehouse) {
        return false;
      }
      
      if (!item.expiryDate) return false;
      
      try {
        const expiryDate = new Date(item.expiryDate);
        const today = new Date();
        
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        const nearExpiryThresholdDays = Math.ceil((item.agingDays || 90) * 0.30);
        return daysUntilExpiry <= nearExpiryThresholdDays;
      } catch (e) {
        return false;
      }
    }).length;
    
    document.getElementById("matNearExpire") && (document.getElementById("matNearExpire").textContent = nearExpireItems);
    
    return nearExpireItems;
  } catch (err) {
    console.error("Error updating near-to-expire count:", err);
    return 0;
  }
}

// Open Low Stock Modal
window.openLowStockModal = function() {
  // Get currently selected warehouse from dropdown
  const warehouseFilterSelect = document.getElementById("warehouseFilter");
  const selectedWarehouse = warehouseFilterSelect ? warehouseFilterSelect.value : "all";
  
  const lowStockItems = allMaterials.filter(item => {
    const qty = parseInt(item.quantity || 0);
    const minQty = parseInt(item.minimumQuantity) || 10;
    
    if (!item.itemCode || !item.material || !item.warehouse || qty === 0) return false;
    
    // Filter by selected warehouse if not "all"
    if (selectedWarehouse !== "all" && item.warehouse !== selectedWarehouse) {
      return false;
    }
    
    return qty <= minQty;
  });

  const modal = document.createElement("div");
  modal.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);
    backdrop-filter:blur(3px);z-index:3000;display:flex;align-items:center;justify-content:center;
  `;

  let itemsHTML = "";
  if (lowStockItems.length === 0) {
    itemsHTML = '<p style="color:#0a9b03;text-align:center;padding:20px;">✓ All items have sufficient stock!</p>';
  } else {
    itemsHTML = lowStockItems.map(item => `
      <div style="padding:12px;border-bottom:1px solid rgba(255,107,107,0.2);border-left:4px solid #ff6b6b;">
        <div style="color:#ffffff;font-weight:600;margin-bottom:4px;">${item.itemCode} - ${item.material || "N/A"}</div>
        <div style="color:#a0a0a0;font-size:12px;">
          Current: <span style="color:#ff6b6b;font-weight:600;">${item.quantity || 0}</span> / Min: ${item.minimumQuantity || 0}
        </div>
      </div>
    `).join("");
  }

  modal.innerHTML = `
    <div style="background:#1a2332;border-radius:8px;padding:30px;width:90%;max-width:800px;max-height:80vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <h2 style="margin:0 0 20px 0;color:#ff6b6b;font-size:20px;">⚠️ Low Stock Items</h2>
      <p style="color:#a0a0a0;margin:0 0 15px 0;">Total: ${lowStockItems.length} items below minimum quantity</p>
      <div style="background:rgba(255,0,0,.05);border:1px solid rgba(255,0,0,.2);border-radius:6px;padding:15px;">
        ${itemsHTML}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button id="closeLowStockModal" style="background:rgba(10,155,3,0.2);color:#0a9b03;border:1px solid rgba(10,155,3,0.4);padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("closeLowStockModal").onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

// Open Near to Expire Modal
window.openNearExpireModal = function() {
  const nearExpireItems = allMaterials.filter(item => {
    const qty = parseInt(item.quantity || 0);
    if (qty === 0) return false;
    
    if (!item.itemCode || !item.material) return false;
    if (!item.warehouse) return false;
    if (!item.expiryDate) return false;
    
    try {
      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      
      today.setHours(0, 0, 0, 0);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      const nearExpiryThresholdDays = Math.ceil((item.agingDays || 90) * 0.30);
      return daysUntilExpiry <= nearExpiryThresholdDays;
    } catch (e) {
      return false;
    }
  });

  const modal = document.createElement("div");
  modal.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);
    backdrop-filter:blur(3px);z-index:3000;display:flex;align-items:center;justify-content:center;
  `;

  let itemsHTML = "";
  if (nearExpireItems.length === 0) {
    itemsHTML = '<p style="color:#0a9b03;text-align:center;padding:20px;">✓ No items near expiry!</p>';
  } else {
    itemsHTML = nearExpireItems.map(item => {
      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expiryDate.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      return `
        <div style="padding:12px;border-bottom:1px solid rgba(255,152,0,0.2);border-left:4px solid #ff9800;">
          <div style="color:#ffffff;font-weight:600;margin-bottom:4px;">${item.itemCode} - ${item.material || "N/A"}</div>
          <div style="color:#a0a0a0;font-size:12px;">
            Expiry: <span style="color:#ff9800;font-weight:600;">${expiryDate.toLocaleDateString()}</span> (${daysUntilExpiry} days remaining)
          </div>
        </div>
      `;
    }).join("");
  }

  modal.innerHTML = `
    <div style="background:#1a2332;border-radius:8px;padding:30px;width:90%;max-width:800px;max-height:80vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <h2 style="margin:0 0 20px 0;color:#ff9800;font-size:20px;">⏰ Near to Expire Items</h2>
      <p style="color:#a0a0a0;margin:0 0 15px 0;">Total: ${nearExpireItems.length} items expiring within 30% of shelf life</p>
      <div style="background:rgba(255,152,0,.05);border:1px solid rgba(255,152,0,.2);border-radius:6px;padding:15px;">
        ${itemsHTML}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button id="closeNearExpireModal" style="background:rgba(10,155,3,0.2);color:#0a9b03;border:1px solid rgba(10,155,3,0.4);padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("closeNearExpireModal").onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
};

// Setup event listeners for stock monitoring filters
function setupStockMonitoringFilters() {
  const searchInput = document.getElementById("searchMaterial");
  const statusSelect = document.getElementById("materialFilterStatus");
  
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderStockMonitoring("");
    });
  }
  
  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      renderStockMonitoring("");
    });
  }
  
  // Setup More button dropdown
  if (document.getElementById("moreMaterialBtn")) {
    document.getElementById("moreMaterialBtn").onclick = () => {
      const dropdown = document.getElementById("moreMaterialDropdown");
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
      dropdown.style.flexDirection = "column";
    };
  }

  if (document.getElementById("configureColumnOption")) {
    document.getElementById("configureColumnOption").onclick = () => {
      showAlert("Column configuration is not yet available for warehouse staff", "info");
    };
  }

  if (document.getElementById("exportMaterialOption")) {
    document.getElementById("exportMaterialOption").onclick = () => {
      showAlert("Export feature is not yet available for warehouse staff", "info");
    };
  }
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("moreMaterialDropdown");
    const btn = document.getElementById("moreMaterialBtn");
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

function loadMaterialCategories() {
  const categories = [...new Set(allMaterials.map(m => m.category || "Uncategorized"))];
  const categoryTabs = document.getElementById("categoryTabs");
  
  if (!categoryTabs) return;
  
  categoryTabs.innerHTML = '<button class="tab active" data-category="all">All</button>';
  categories.forEach(cat => {
    if (cat) {
      categoryTabs.innerHTML += `<button class="tab" data-category="${cat}">${cat}</button>`;
    }
  });
  
  document.querySelectorAll("#categoryTabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#categoryTabs .tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderMaterials(tab.dataset.category);
    });
  });
}

// Load Material Requests for warehouse
async function loadMaterialRequests() {
  try {
    const snap = await getDocs(collection(db, "materialRequests"));
    allMaterialRequests = [];
    snap.forEach(doc => {
      const mr = { id: doc.id, ...doc.data() };
      // Only show MRs from current user's warehouse
      if (mr.warehouse === currentUser?.warehouse) {
        allMaterialRequests.push(mr);
      }
    });
    
    renderMRTable();
    updateMRSummary();
  } catch (err) {
    console.error("Error loading Material Requests:", err);
    showAlert("Error loading Material Requests", "error");
  }
}

// Update MR summary cards
function updateMRSummary() {
  const total = allMaterialRequests.length;
  const pending = allMaterialRequests.filter(mr => mr.status === "Pending").length;
  const ordered = allMaterialRequests.filter(mr => mr.status === "Ordered").length;
  const delivered = allMaterialRequests.filter(mr => mr.status === "Delivered").length;
  
  // Only update if elements exist
  const mrTotalEl = document.getElementById("mrTotalCount");
  const mrPendingEl = document.getElementById("mrPendingCount");
  const mrOrderedEl = document.getElementById("mrOrderedCount");
  const mrDeliveredEl = document.getElementById("mrDeliveredCount");
  
  if (mrTotalEl) mrTotalEl.textContent = total;
  if (mrPendingEl) mrPendingEl.textContent = pending;
  if (mrOrderedEl) mrOrderedEl.textContent = ordered;
  if (mrDeliveredEl) mrDeliveredEl.textContent = delivered;
}

// Render MR table
function renderMRTable() {
  const tbody = document.getElementById("mrTableBody");
  const emptyMsg = document.getElementById("mrEmptyMsg");
  const searchQuery = document.getElementById("searchMR")?.value.toLowerCase() || "";
  const statusFilter = document.getElementById("filterMRStatus")?.value || "";
  
  if (!tbody) return;
  
  let filtered = allMaterialRequests;
  
  if (searchQuery) {
    filtered = filtered.filter(mr => 
      mr.mrNo.toLowerCase().includes(searchQuery)
    );
  }
  
  if (statusFilter) {
    filtered = filtered.filter(mr => mr.status === statusFilter);
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  
  emptyMsg.style.display = "none";
  tbody.innerHTML = filtered.map(mr => {
    // Handle both ISO strings and Firestore Timestamp objects
    let createdDate = "Unknown";
    if (mr.createdAt) {
      if (mr.createdAt.toDate) {
        // It's a Firestore Timestamp object
        createdDate = mr.createdAt.toDate().toLocaleDateString();
      } else if (typeof mr.createdAt === 'string') {
        // It's an ISO string
        createdDate = new Date(mr.createdAt).toLocaleDateString();
      }
    }
    const statusColor = mr.status === "Pending" ? "#ff6b6b" : mr.status === "Ordered" ? "#ffd93d" : "#1dd1a1";
    
    return `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;font-size:12px;font-weight:600;">${mr.mrNo}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:12px;">${mr.type === "borrow" ? "Borrow" : "New Project"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:12px;text-align:center;">${mr.items?.length || 0}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:12px;">${createdDate}</td>
        <td style="padding:10px;font-size:12px;">
          <span style="background:${statusColor}33;color:${statusColor};padding:4px 8px;border-radius:4px;font-weight:600;">${mr.status}</span>
        </td>
        <td style="padding:10px;text-align:center;">
          <button onclick="window.viewMRItems('${mr.id}')" style="background:#0a9b03;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;margin-right:5px;">View Items</button>
          ${mr.type === "borrow" && mr.status === "Approved" ? `<button style="background:#1dd1a1;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.openReceiveBorrowModal('${mr.id}')">Receive</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

window.viewMRItems = function(mrId) {
  const mr = allMaterialRequests.find(m => m.id === mrId);
  if (!mr) return;
  
  let itemsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <thead style="background:rgba(10,155,3,0.1);">
        <tr>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">No.</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Item Code</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Material Name</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Specification</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Brand</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Qty</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Unit</th>
          <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Cost</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  mr.items.forEach((item, idx) => {
    // Try to fetch the actual material's data from allMaterials
    const material = allMaterials.find(m => m.id === item.materialId);
    const itemCode = item.itemCode || material?.itemCode || material?.code || "-";
    const itemCost = item.cost || item.unitPrice || material?.cost || material?.unitPrice || material?.price || 0;
    
    itemsHtml += `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${idx + 1}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${itemCode}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.material || item.materialName || "-"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.specification || "-"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.brand || "-"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.quantity}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.unit}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;text-align:right;">₱${parseFloat(itemCost || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
      </tr>
    `;
  });
  
  itemsHtml += `</tbody></table>`;
  
  const warehouseName = allWarehouses.find(w => w.id === mr.warehouse)?.name || mr.warehouse;
  const createdBy = mr.createdBy || "Unknown";
  
  // Handle both ISO strings and Firestore Timestamp objects
  let createdDate = "Unknown";
  if (mr.createdAt) {
    if (mr.createdAt.toDate) {
      // It's a Firestore Timestamp object
      createdDate = mr.createdAt.toDate().toLocaleDateString();
    } else if (typeof mr.createdAt === 'string') {
      // It's an ISO string
      createdDate = new Date(mr.createdAt).toLocaleDateString();
    }
  }
  
  const modal = document.createElement("div");
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
    display:flex;justify-content:center;align-items:center;z-index:10000;
  `;
  
  const content = `
    <div style="background:#1a2332;border-radius:8px;padding:30px;max-width:1200px;width:95%;max-height:85vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <h2 style="margin:0 0 20px 0;color:#0a9b03;">Material Request Details</h2>
      
      <div style="background:rgba(10,155,3,0.08);border:1px solid rgba(10,155,3,0.3);border-radius:8px;padding:15px;margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">MR No.</p>
            <p style="margin:0;color:#0a9b03;font-size:14px;font-weight:600;">${mr.mrNo}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Status</p>
            <p style="margin:0;color:#0a9b03;font-size:14px;font-weight:600;">${mr.status}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Type</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${mr.type === "borrow" ? "Borrow Stock" : "New Project"}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Warehouse</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${warehouseName}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Date</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${createdDate}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Items Count</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${mr.items?.length || 0}</p>
          </div>
        </div>
      </div>
      
      <h3 style="margin:0 0 10px 0;color:#0a9b03;font-size:13px;font-weight:600;">Requested Materials:</h3>
      ${itemsHtml}
      
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button id="closeMRDetailsModal" style="background:rgba(10,155,3,0.2);color:#0a9b03;border:1px solid rgba(10,155,3,0.4);padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;">Close</button>
      </div>
    </div>
  `;
  
  modal.innerHTML = content;
  document.body.appendChild(modal);
  
  document.getElementById("closeMRDetailsModal").onclick = () => {
    modal.remove();
  };
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
};

window.deleteMRFromWarehouse = async function(mrId, mrNo) {
  if (confirm(`Are you sure you want to delete MR "${mrNo}"?`)) {
    try {
      await deleteDoc(doc(db, "materialRequests", mrId));
      await logActivity("mr", "delete", `Deleted material request ${mrNo} from warehouse dashboard`);
      showAlert(`✅ MR ${mrNo} deleted successfully!`, "success");
      loadMaterialRequests();
    } catch (err) {
      showAlert("❌ Error deleting MR: " + err.message, "error");
    }
  }
};

window.openReceiveBorrowModal = async function(mrId) {
  try {
    // Get the material request document
    const mrSnap = await getDoc(doc(db, "materialRequests", mrId));
    if (!mrSnap.exists()) {
      showAlert("❌ Material request not found", "error");
      return;
    }
    
    const mr = { id: mrSnap.id, ...mrSnap.data() };
    
    // Format the date properly from Firestore timestamp
    let mrDate = "Invalid Date";
    if (mr.createdAt) {
      try {
        const dateObj = mr.createdAt.toDate ? mr.createdAt.toDate() : new Date(mr.createdAt);
        mrDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch (e) {
        mrDate = "Invalid Date";
      }
    }
    
    // Verify it's an approved borrow request
    if (mr.type !== "borrow" || mr.status !== "Approved") {
      showAlert("❌ This material request is not approved for receipt", "error");
      return;
    }
    
    // Get source and target warehouse names
    const sourceWh = allWarehouses.find(w => w.id === mr.sourceWarehouseId);
    const targetWh = allWarehouses.find(w => w.id === mr.borrowWarehouseId);
    
    const sourceName = sourceWh?.name || mr.sourceWarehouseId || "Unknown";
    const targetName = targetWh?.name || mr.borrowWarehouseId || "Unknown";
    
    // Build items list
    let itemsHTML = "";
    if (mr.items && mr.items.length > 0) {
      itemsHTML = `
        <table style="width:100%;border-collapse:collapse;margin-top:15px;">
          <thead style="border-bottom:2px solid rgba(10,155,3,.3);">
            <tr>
              <th style="padding:10px;text-align:left;color:#0a9b03;">Item Code</th>
              <th style="padding:10px;text-align:left;color:#0a9b03;">Material</th>
              <th style="padding:10px;text-align:center;color:#0a9b03;">Qty</th>
              <th style="padding:10px;text-align:left;color:#0a9b03;">Unit</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      mr.items.forEach(item => {
        itemsHTML += `
          <tr style="border-bottom:1px solid rgba(10,155,3,.1);">
            <td style="padding:10px;color:#d0d0d0;">${item.itemCode || "-"}</td>
            <td style="padding:10px;color:#d0d0d0;">${item.material || item.materialName || "-"}</td>
            <td style="padding:10px;text-align:center;color:#d0d0d0;font-weight:600;">${item.quantity}</td>
            <td style="padding:10px;color:#d0d0d0;">${item.unit || "unit"}</td>
          </tr>
        `;
      });
      
      itemsHTML += `
          </tbody>
        </table>
      `;
    }
    
    // Create modal
    const backdropId = "receiveBorrowBackdrop";
    const modalId = "receiveBorrowModal";
    
    // Remove old modal if exists
    const oldBackdrop = document.getElementById(backdropId);
    const oldModal = document.getElementById(modalId);
    if (oldBackdrop) oldBackdrop.remove();
    if (oldModal) oldModal.remove();
    
    // Create backdrop
    const backdrop = document.createElement("div");
    backdrop.id = backdropId;
    backdrop.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.6);
      z-index:4999;
    `;
    backdrop.onclick = () => {
      backdrop.remove();
      document.getElementById(modalId)?.remove();
    };
    document.body.appendChild(backdrop);
    
    // Create modal
    const modal = document.createElement("div");
    modal.id = modalId;
    modal.style.cssText = `
      position:fixed;
      top:50%;
      left:50%;
      transform:translate(-50%,-50%);
      background:linear-gradient(135deg,#1a3a52 0%,#0f1419 100%);
      border:2px solid rgba(10,155,3,.4);
      border-radius:12px;
      padding:30px;
      z-index:5000;
      max-width:600px;
      width:90%;
      max-height:80vh;
      overflow-y:auto;
      color:#e0e0e0;
      box-shadow:0 10px 40px rgba(0,0,0,0.5);
    `;
    
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="margin:0;color:#0a9b03;font-size:20px;">Receive Borrowed Materials</h2>
        <button onclick="document.getElementById('${backdropId}').onclick()" style="background:none;border:none;color:#ff6b6b;font-size:24px;cursor:pointer;padding:0;width:30px;height:30px;">×</button>
      </div>
      
      <div style="background:rgba(10,155,3,.1);padding:15px;border-radius:8px;margin-bottom:20px;border-left:4px solid #0a9b03;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div>
            <label style="color:#a0a0a0;font-size:11px;text-transform:uppercase;display:block;margin-bottom:5px;">Source Warehouse</label>
            <div style="color:#0a9b03;font-weight:600;font-size:14px;padding:8px;background:rgba(10,155,3,.15);border-radius:4px;">${sourceName}</div>
          </div>
          <div>
            <label style="color:#a0a0a0;font-size:11px;text-transform:uppercase;display:block;margin-bottom:5px;">Receiving Warehouse</label>
            <div style="color:#0a9b03;font-weight:600;font-size:14px;padding:8px;background:rgba(10,155,3,.15);border-radius:4px;">${targetName}</div>
          </div>
          <div>
            <label style="color:#a0a0a0;font-size:11px;text-transform:uppercase;display:block;margin-bottom:5px;">MR Number</label>
            <div style="color:#d0d0d0;font-weight:600;font-size:14px;">${mr.mrNo}</div>
          </div>
          <div>
            <label style="color:#a0a0a0;font-size:11px;text-transform:uppercase;display:block;margin-bottom:5px;">Date</label>
            <div style="color:#d0d0d0;font-size:14px;">${mrDate}</div>
          </div>
        </div>
      </div>
      
      <div>
        <h3 style="color:#0a9b03;font-size:14px;margin:15px 0 10px;text-transform:uppercase;">📦 Items to Receive</h3>
        ${itemsHTML}
      </div>
      
      <div style="background:rgba(255,215,0,.1);padding:15px;border-radius:8px;margin-top:20px;border-left:4px solid #ffd700;">
        <p style="color:#ffd700;font-weight:600;margin:0 0 10px;font-size:12px;">⚠️ By confirming receipt:</p>
        <ul style="color:#d0d0d0;font-size:12px;margin:0;padding-left:20px;line-height:1.6;">
          <li>Materials will be removed from <strong>${sourceName}</strong></li>
          <li>Materials will be added to <strong>${targetName}</strong></li>
          <li>A Delivery Receipt (DR) will be created</li>
          <li>This action cannot be undone</li>
        </ul>
      </div>
      
      <div style="display:flex;gap:10px;margin-top:25px;">
        <button onclick="document.getElementById('${backdropId}').onclick()" style="flex:1;background:rgba(160,160,160,.2);color:#a0a0a0;border:1px solid rgba(160,160,160,.4);padding:12px;border-radius:6px;cursor:pointer;font-weight:600;transition:all 0.3s;font-size:13px;" onmouseover="this.style.background='rgba(160,160,160,.3)'" onmouseout="this.style.background='rgba(160,160,160,.2)'">
          Cancel
        </button>
        <button onclick="window.confirmReceiveBorrowMaterials('${mr.id}')" style="flex:1;background:#1dd1a1;color:white;border:none;padding:12px;border-radius:6px;cursor:pointer;font-weight:600;transition:all 0.3s;font-size:13px;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          ✓ Confirm Receipt
        </button>
      </div>
    `;
    
    document.body.appendChild(modal);
  } catch (err) {
    console.error("Error opening receive borrow modal:", err);
    showAlert("❌ Error loading borrow request details: " + err.message, "error");
  }
};

window.confirmReceiveBorrowMaterials = async function(mrId) {
  try {
    showAlert("⏳ Processing receipt...", "success");
    
    // Get the material request
    const mrSnap = await getDoc(doc(db, "materialRequests", mrId));
    if (!mrSnap.exists()) {
      showAlert("❌ Material request not found", "error");
      return;
    }
    
    const mr = { id: mrSnap.id, ...mrSnap.data() };
    const sourceWarehouseId = mr.sourceWarehouseId;
    const targetWarehouseId = mr.borrowWarehouseId;
    
    // For each item in the MR, deduct from source warehouse and add to target warehouse
    if (mr.items && mr.items.length > 0) {
      for (const mrItem of mr.items) {
        try {
          // Find the material in the source warehouse
          const sourceMatSnap = await getDocs(query(
            collection(db, "materials"),
            where("warehouse", "==", sourceWarehouseId),
            where("itemCode", "==", mrItem.itemCode),
            where("material", "==", mrItem.material)
          ));
          
          if (!sourceMatSnap.empty) {
            const sourceMat = sourceMatSnap.docs[0];
            const sourceData = sourceMat.data();
            const currentQty = parseInt(sourceData.quantity || 0);
            const newQty = Math.max(0, currentQty - mrItem.quantity);
            
            // Update source warehouse quantity
            await updateDoc(sourceMat.ref, {
              quantity: newQty
            });
            
            console.log(`✓ Deducted ${mrItem.quantity} units from source warehouse (${sourceWarehouseId})`);
          }
          
          // Find or create material in target warehouse
          const targetMatSnap = await getDocs(query(
            collection(db, "materials"),
            where("warehouse", "==", targetWarehouseId),
            where("itemCode", "==", mrItem.itemCode),
            where("material", "==", mrItem.material)
          ));
          
          if (!targetMatSnap.empty) {
            // Material exists in target warehouse - add quantity
            const targetMat = targetMatSnap.docs[0];
            const targetData = targetMat.data();
            const currentQty = parseInt(targetData.quantity || 0);
            const newQty = currentQty + mrItem.quantity;
            
            await updateDoc(targetMat.ref, {
              quantity: newQty
            });
            
            console.log(`✓ Added ${mrItem.quantity} units to target warehouse (${targetWarehouseId})`);
          } else {
            // Material doesn't exist in target warehouse - create new record
            // Copy the source material record to target warehouse
            const sourceMatSnap2 = await getDocs(query(
              collection(db, "materials"),
              where("warehouse", "==", sourceWarehouseId),
              where("itemCode", "==", mrItem.itemCode),
              where("material", "==", mrItem.material)
            ));
            
            if (!sourceMatSnap2.empty) {
              const sourceData = sourceMatSnap2.docs[0].data();
              
              // Create new material record in target warehouse
              await addDoc(collection(db, "materials"), {
                ...sourceData,
                warehouse: targetWarehouseId,
                quantity: mrItem.quantity,
                createdAt: new Date().toISOString(),
                borrowedFrom: sourceWarehouseId,
                borrowNote: `Borrowed from ${sourceWarehouseId}`
              });
              
              console.log(`✓ Created new material record in target warehouse (${targetWarehouseId})`);
            }
          }
          
        } catch (itemErr) {
          console.error(`Error processing item ${mrItem.material}:`, itemErr);
        }
      }
    }
    
    // Update MR status to "Delivered"
    await updateDoc(doc(db, "materialRequests", mrId), {
      status: "Delivered",
      receivedAt: new Date().toISOString(),
      receivedBy: currentUser?.name || currentUser?.email || "Unknown"
    });
    
    await logActivity("borrow_receipt", "received", `Received borrowed materials - MR: ${mr.mrNo}`);
    
    showAlert(`✅ Materials received successfully!`, "success");
    
    // Close modal
    const backdrop = document.getElementById("receiveBorrowBackdrop");
    const modal = document.getElementById("receiveBorrowModal");
    if (backdrop) backdrop.remove();
    if (modal) modal.remove();
    
    // Reload MR table
    await loadMaterialRequests();
    
  } catch (err) {
    console.error("Error confirming receipt:", err);
    showAlert("❌ Error completing receipt: " + err.message, "error");
  }
};

window.loadActivityLog = async function ()
 {
  try {
    const snap = await getDocs(collection(db, "activityLog"));
    const activities = [];
    snap.forEach(doc => {
      activities.push({ id: doc.id, ...doc.data() });
    });
    
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    renderActivityLog(activities);
    updateActivityFilters(activities);
  } catch (err) {
    console.error("Error loading activity log:", err);
  }
}

function renderActivityLog(activities, filterType = "", filterUser = "", searchQuery = "") {
  const activityBody = document.getElementById("activityBody");
  if (!activityBody) return;
  activityBody.innerHTML = "";

  activities.forEach(log => {
    if (filterType && log.type !== filterType) return;
    if (filterUser && log.user !== filterUser) return;
    if (searchQuery && !JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase())) return;

    const date = new Date(log.timestamp);
    const timeStr = date.toLocaleString();
    const actionColor = log.action === "delete" ? "#ff6b6b" : (log.action === "update" ? "#ffa500" : "#0a9b03");
    
    activityBody.innerHTML += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;font-size:12px;">${timeStr}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;">${log.user}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);"><span style="background:rgba(10,155,3,.2);color:#0a9b03;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${log.type.toUpperCase()}</span></td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);"><span style="background:rgba(${actionColor === '#ff6b6b' ? '255,107,107' : actionColor === '#ffa500' ? '255,165,0' : '10,155,3'},.2);color:${actionColor};padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${log.action.toUpperCase()}</span></td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#a0a0a0;font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${typeof log.details === 'string' ? log.details : JSON.stringify(log.details).substring(0, 100)}</td>
      </tr>
    `;
  });

  if (activityBody.innerHTML === "") {
    activityBody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:30px;color:#a0a0a0;'>No activities found</td></tr>";
  }
}

function updateActivityFilters(activities) {
  const filterUser = document.getElementById("filterActivityUser");
  if (filterUser) {
    const users = [...new Set(activities.map(a => a.user))];
    const currentValue = filterUser.value;
    filterUser.innerHTML = '<option value="">All Users</option>';
    users.forEach(user => {
      filterUser.innerHTML += `<option value="${user}">${user}</option>`;
    });
    if (currentValue) filterUser.value = currentValue;
  }
}

// ==================== SETTINGS TAB SWITCHING ====================
window.switchSettingsTab = (tabName) => {
  // For warehouse staff, we only have one settings page (Change Password)
  // So we just display the settings page directly
  const settingsPage = document.getElementById("settings");
  if (settingsPage) {
    settingsPage.style.display = "block";
  }
};

// ==================== PASSWORD CHANGE FUNCTION ====================
async function changeUserPassword() {
  const currentPassword = (document.getElementById("currentPassword").value || "").trim();
  const newPassword = (document.getElementById("newPassword").value || "").trim();
  const confirmPassword = (document.getElementById("confirmPassword").value || "").trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    showAlert("❌ All fields are required", "error");
    return;
  }

  if (newPassword.length < 6) {
    showAlert("❌ New password must be at least 6 characters", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showAlert("❌ New passwords do not match", "error");
    return;
  }

  if (newPassword === currentPassword) {
    showAlert("❌ New password must be different from current password", "error");
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      showAlert("❌ User not found", "error");
      return;
    }

    // Reauthenticate with current password FIRST
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Then update password
    await updatePassword(user, newPassword);
    await logActivity("account", "update", "Changed password");
    
    showAlert("✅ Password changed successfully! Log in with your new password.", "success");
    document.getElementById("changePasswordForm").reset();
  } catch (error) {
    console.error("Password change error:", error);
    if (error.code === "auth/wrong-password") {
      showAlert("❌ Current password is incorrect", "error");
    } else if (error.code === "auth/weak-password") {
      showAlert("❌ Password is too weak", "error");
    } else {
      showAlert("❌ Error: " + error.message, "error");
    }
  }
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded fired"); // Debug
  console.log("Nav links found:", document.querySelectorAll(".nav-link").length); // Debug
  
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("Menu clicked, sidebar active before:", sidebar.classList.contains("active"));
      sidebar.classList.toggle("active");
      console.log("Sidebar active after:", sidebar.classList.contains("active"));
    }, true); // Use capture phase to ensure this fires first
  }

  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = "modules.html";
    };
  }

  // Setup navigation link handlers
  const navLinks = document.querySelectorAll(".nav-link");
  console.log("Setting up nav-link handlers for", navLinks.length, "elements"); // Debug
  
  // Add a catch-all click handler to sidebar to verify clicks are reaching it
  if (sidebar) {
    sidebar.addEventListener("click", (e) => {
      console.log("SIDEBAR CLICKED - Event target:", e.target, "Class:", e.target.className); // Debug
    });
  }
  
  navLinks.forEach(link => {
    link.addEventListener("click", async function(e) {
      console.log("NAV LINK CLICKED:", this.dataset.page); // Debug log
      e.preventDefault();
      e.stopPropagation();
      
      const page = this.dataset.page;
      console.log("Navigating to:", page); // Debug log
      
      // Remove active class from all links
      navLinks.forEach(x => x.classList.remove("active"));
      // Add active class to clicked link
      this.classList.add("active");
      
      // Hide all pages
      document.querySelectorAll(".page").forEach(p => p.style.display = "none");
      
      // Show selected page
      const target = document.getElementById(page);
      if (target) {
        target.style.display = "block";
        console.log("Showing page:", page); // Debug log
      } else {
        console.log("Page not found:", page); // Debug log
      }
      
      // Load data based on page
      if (page === "stock-monitoring") {
        console.log("Loading materials..."); // Debug log
        // Ensure warehouses are loaded first
        await loadWarehouses();
        loadMaterials();
      } else if (page === "material-requests") {
        console.log("Loading material requests..."); // Debug log
        loadMaterialRequests();
      }
      
      // Close sidebar on mobile after clicking a nav link (but not when clicking the menu button)
      setTimeout(() => {
        if (sidebar && sidebar.classList.contains("active")) {
          sidebar.classList.remove("active");
        }
      }, 0);
    });
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
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
    };
  }

    // Password change handler
  const changePasswordForm = document.getElementById("changePasswordForm");
  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await changeUserPassword();
    });
  }

  const resetPasswordFormBtn = document.getElementById("resetPasswordForm");
  if (resetPasswordFormBtn) {
    resetPasswordFormBtn.onclick = () => {
      document.getElementById("changePasswordForm").reset();
    };
  }

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (sessionStorage.getItem('isLoggingOut') === 'true') return;
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    try {
      let userData = null;
      
      // Check warehouse_users collection first (for warehouse staff)
      let userSnap = await getDoc(doc(db, "warehouse_users", user.uid));
      if (userSnap.exists()) {
        userData = userSnap.data();
      } else {
        // Try to find by email in warehouse_users
        const q = query(collection(db, "warehouse_users"), where("email", "==", user.email));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) userData = qSnap.docs[0].data();
      }
      
      if (!userData) {
        window.location.href = "login.html";
        return;
      }
      currentUser = { id: user.uid, ...userData };
      const roleEl = document.getElementById("currentUserRole");
      if (roleEl) {
        roleEl.textContent = "WAREHOUSE STAFF";
        roleEl.addEventListener("click", () => {
          showUserProfile();
        });
      }
    } catch (e) {
      console.error("auth error:", e);
      window.location.href = "login.html";
    }
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

    const userRole = currentUser?.role || "warehouse";
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

  const materialModal = document.getElementById("materialModal");
  const warehouseModal = document.getElementById("warehouseModal");

  if (document.getElementById("addMaterialBtn")) {
    document.getElementById("addMaterialBtn").onclick = () => {
      openMaterialModal();
    };
  }

  if (document.getElementById("closeMaterialModal")) {
    document.getElementById("closeMaterialModal").onclick = () => {
      materialModal.style.display = "none";
    };
  }

  if (document.getElementById("cancelMaterialBtn")) {
    document.getElementById("cancelMaterialBtn").onclick = () => {
      materialModal.style.display = "none";
    };
  }

  if (document.getElementById("saveMaterialBtn")) {
    document.getElementById("saveMaterialBtn").onclick = async (e) => {
      e.preventDefault();
      const itemCode = (document.getElementById("matItemCode").value || "").trim();
      const material = (document.getElementById("matMaterial").value || "").trim();
      const description = (document.getElementById("matDescription").value || "").trim();
      const quantity = (document.getElementById("matQuantity").value || "").trim();
      const userAssignedWarehouse = currentUser?.warehouse;

      if (!itemCode || !material || !quantity) {
        showAlert("Fill in all required fields", "error");
        return;
      }

      try {
        const materialData = {
          itemCode, material, description,
          quantity: parseInt(quantity),
          warehouse: userAssignedWarehouse,
          updatedAt: new Date().toISOString()
        };
        if (editingMaterialId) {
          await updateDoc(doc(db, "materials", editingMaterialId), materialData);
          
          // Check if there are duplicates of this material in the same warehouse
          const duplicates = allMaterials.filter(m => 
            m.id !== editingMaterialId &&
            m.itemCode === itemCode && 
            m.material === material && 
            m.warehouse === userAssignedWarehouse &&
            (m.specification || "-") === (materialData.specification || "-") &&
            (m.brand || "-") === (materialData.brand || "-")
          );
          
          // Merge duplicates by summing quantities and deleting duplicates
          if (duplicates.length > 0) {
            let totalQty = parseInt(quantity);
            for (const dup of duplicates) {
              totalQty += parseInt(dup.quantity) || 0;
              await deleteDoc(doc(db, "materials", dup.id));
            }
            // Update the main material with merged quantity
            await updateDoc(doc(db, "materials", editingMaterialId), {
              quantity: totalQty
            });
            await logActivity("material", "update", `Updated material: ${material} (merged ${duplicates.length} duplicate entries)`);
            showAlert(`✅ Material updated! Merged ${duplicates.length} duplicate entries.`, "success");
          } else {
            await logActivity("material", "update", `Updated material: ${material}`);
            showAlert("Material updated!", "success");
          }
        } else {
          // Check if material already exists in this warehouse (prevent duplicates)
          const existingMaterial = allMaterials.find(m => 
            m.itemCode === itemCode && 
            m.material === material && 
            m.warehouse === userAssignedWarehouse &&
            (m.specification || "-") === (materialData.specification || "-") &&
            (m.brand || "-") === (materialData.brand || "-")
          );
          
          if (existingMaterial) {
            // Update existing material instead of creating duplicate
            await updateDoc(doc(db, "materials", existingMaterial.id), {
              ...materialData,
              quantity: existingMaterial.quantity + parseInt(quantity)
            });
            await logActivity("material", "update", `Updated quantity for material: ${material}`);
            showAlert(`✅ Added ${quantity} units to existing material: ${material}`, "success");
          } else {
            // Create new material entry
            await addDoc(collection(db, "materials"), {
              ...materialData,
              createdAt: new Date().toISOString()
            });
            await logActivity("material", "create", `Added material: ${material}`);
            showAlert("Material added!", "success");
          }
        }
        document.getElementById("materialModal").style.display = "none";
        loadMaterials();
      } catch (err) {
        showAlert("Error saving material: " + err.message, "error");
      }
    };
  }

  if (document.getElementById("addWarehouseBtn")) {
    document.getElementById("addWarehouseBtn").onclick = () => {
      openWarehouseModal();
    };
  }

  if (document.getElementById("closeWarehouseModal")) {
    document.getElementById("closeWarehouseModal").onclick = () => {
      warehouseModal.style.display = "none";
    };
  }

  if (document.getElementById("cancelWarehouseBtn")) {
    document.getElementById("cancelWarehouseBtn").onclick = () => {
      warehouseModal.style.display = "none";
    };
  }

  if (document.getElementById("saveWarehouseBtn")) {
    document.getElementById("saveWarehouseBtn").onclick = async (e) => {
      e.preventDefault();
      const name = (document.getElementById("whName").value || "").trim();
      const code = (document.getElementById("whCode").value || "").trim();
      const projectId = (document.getElementById("whProjectId").value || "").trim();
      const client = (document.getElementById("whClient").value || "").trim();
      const clientPo = (document.getElementById("whClientPo").value || "").trim();
      const scope = (document.getElementById("whScope").value || "").trim();
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

        if (editingWarehouseId) {
          await updateDoc(doc(db, "projects", editingWarehouseId), projectData);
          await logActivity("project", "update", `Updated project: ${name}`);
          showAlert("✅ Project updated!", "success");
        } else {
          await addDoc(collection(db, "projects"), {
            ...projectData,
            createdAt: new Date().toISOString()
          });
          await logActivity("project", "create", `Added project: ${name}`);
          showAlert("✅ Project added!", "success");
        }

        const warehouseModal = document.getElementById("warehouseModal");
        if (warehouseModal) warehouseModal.style.display = "none";
        editingWarehouseId = null;
        loadWarehouses();
      } catch (err) {
        showAlert("Error saving project: " + err.message, "error");
      }
    };
  }

  if (document.getElementById("clearLogsBtnActivity")) {
    document.getElementById("clearLogsBtnActivity").onclick = async () => {
      const confirmed = await showDeleteConfirmCard("All Activity Logs", "This cannot be undone");
      if (!confirmed) return;
      try {
        const snap = await getDocs(collection(db, "activityLog"));
        snap.forEach(doc => deleteDoc(doc.ref));
        showAlert("✅ Logs cleared!", "success");
        loadActivityLog();
      } catch (err) {
        showAlert("Error clearing logs: " + err.message, "error");
      }
    };
  }

  // ==================== TRANSFER STOCK MODAL HANDLERS ====================
  const transferModal = document.getElementById("transferModal");

  if (document.getElementById("closeTransferModal")) {
    document.getElementById("closeTransferModal").onclick = () => {
      transferModal.style.display = "none";
    };
  }

  if (document.getElementById("cancelTransferBtn")) {
    document.getElementById("cancelTransferBtn").onclick = () => {
      transferModal.style.display = "none";
    };
  }

  // Update material dropdown when source warehouse changes
  if (document.getElementById("transferFromWarehouse")) {
    document.getElementById("transferFromWarehouse").addEventListener("change", (e) => {
      const selectedWarehouse = e.target.value;
      const materialSelect = document.getElementById("transferMaterial");
      materialSelect.innerHTML = '<option value="">Select material</option>';
      
      if (selectedWarehouse) {
        allMaterials.filter(m => m.warehouse === selectedWarehouse).forEach(mat => {
          const option = document.createElement("option");
          option.value = mat.id;
          option.textContent = `${mat.material} (${mat.itemCode}) - Qty: ${mat.quantity}`;
          materialSelect.appendChild(option);
        });
      }
    });
  }

  if (document.getElementById("submitTransferBtn")) {
    document.getElementById("submitTransferBtn").onclick = async (e) => {
      e.preventDefault();
      
      const fromWarehouseId = document.getElementById("transferFromWarehouse").value;
      const toWarehouseId = document.getElementById("transferToWarehouse").value;
      const materialId = document.getElementById("transferMaterial").value;
      const quantity = parseInt(document.getElementById("transferQuantity").value) || 0;
      const notes = document.getElementById("transferNotes").value.trim();
      
      if (!fromWarehouseId || !toWarehouseId || !materialId || quantity <= 0) {
        showAlert("❌ Please fill in all required fields with valid values", "error");
        return;
      }
      
      if (fromWarehouseId === toWarehouseId) {
        showAlert("❌ Source and destination warehouses cannot be the same", "error");
        return;
      }
      
      try {
        const material = allMaterials.find(m => m.id === materialId);
        
        if (!material || material.quantity < quantity) {
          showAlert("❌ Insufficient stock in source warehouse", "error");
          return;
        }
        
        // Update source warehouse material (decrease)
        const newSourceQty = material.quantity - quantity;
        await updateDoc(doc(db, "materials", materialId), {
          quantity: newSourceQty,
          updatedAt: new Date().toISOString()
        });
        
        // Find or create material in destination warehouse
        const destMaterial = allMaterials.find(m => 
          m.material === material.material && m.warehouse === toWarehouseId
        );
        
        if (destMaterial) {
          // Update existing material in destination
          await updateDoc(doc(db, "materials", destMaterial.id), {
            quantity: destMaterial.quantity + quantity,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Create new material in destination warehouse
          // Important: Copy ALL fields from source material to prevent data loss
          const newMaterialData = {
            itemCode: material.itemCode || "",
            material: material.material || "",
            description: material.description || "",
            quantity: quantity,
            warehouse: toWarehouseId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // Copy any additional fields that might exist in the source material
          // to ensure no data is lost during transfer
          const additionalFields = ['unit', 'category', 'sku', 'supplier', 'cost', 'reorderLevel', 'specs', 'batch', 'expiryDate'];
          additionalFields.forEach(field => {
            if (material[field] !== undefined && material[field] !== null) {
              newMaterialData[field] = material[field];
            }
          });
          
          await addDoc(collection(db, "materials"), newMaterialData);
        }
        
        // Log the transfer
        const fromWh = allWarehouses.find(w => w.id === fromWarehouseId);
        const toWh = allWarehouses.find(w => w.id === toWarehouseId);
        await addDoc(collection(db, "stock_transfers"), {
          fromWarehouseId,
          toWarehouseId,
          fromWarehouse: fromWh?.name || fromWarehouseId,
          toWarehouse: toWh?.name || toWarehouseId,
          materialId,
          material: material.material,
          itemCode: material.itemCode,
          quantity,
          notes,
          transferredBy: currentUser?.email || "Unknown",
          timestamp: new Date().toISOString()
        });
        
        await logActivity("transfer", "stock_transfer", `Transferred ${quantity} units of ${material.material} from ${fromWh?.name} to ${toWh?.name}`);
        
        showAlert(`✅ Successfully transferred ${quantity} units of ${material.material}`, "success");
        document.getElementById("transferForm").reset();
        transferModal.style.display = "none";
        loadMaterials();
      } catch (err) {
        showAlert("❌ Error transferring stock: " + err.message, "error");
        console.error("Transfer error:", err);
      }
    };
  }

  const searchActivityLog = document.getElementById("searchActivityLog");
  const filterActivityType = document.getElementById("filterActivityType");
  const filterActivityUser = document.getElementById("filterActivityUser");

  if (searchActivityLog) {
    searchActivityLog.addEventListener("input", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, filterActivityType.value, filterActivityUser.value, e.target.value);
    });
  }

  if (filterActivityType) {
    filterActivityType.addEventListener("change", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, e.target.value, filterActivityUser.value, (searchActivityLog?.value || ""));
    });
  }

  if (filterActivityUser) {
    filterActivityUser.addEventListener("change", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, filterActivityType.value, e.target.value, (searchActivityLog?.value || ""));
    });
  }

  // ==================== MATERIAL FORM TOGGLE ====================
  const materialForm = document.getElementById("materialForm");
  const transferMaterialForm = document.getElementById("transferMaterialForm");

  // Toggle between update and transfer forms
  document.querySelectorAll("input[name='materialChoice']").forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "update") {
        materialForm.style.display = "block";
        transferMaterialForm.style.display = "none";
      } else if (e.target.value === "transfer") {
        materialForm.style.display = "none";
        transferMaterialForm.style.display = "block";
        
        // Populate stock info
        if (editingMaterialId) {
          const material = allMaterials.find(m => m.id === editingMaterialId);
          if (material) {
            const warehouse = allWarehouses.find(w => w.id === material.warehouse);
            document.getElementById("matTransferFromWarehouse").textContent = warehouse?.name || material.warehouse;
            document.getElementById("matTransferAvailableQty").textContent = material.quantity;
          }
        }
        
        // Populate destination warehouses
        const toWarehouse = document.getElementById("matTransferToWarehouse");
        toWarehouse.innerHTML = '<option value="">Select destination warehouse</option>';
        
        allWarehouses.forEach(wh => {
          const option = document.createElement("option");
          option.value = wh.id;
          option.textContent = wh.name;
          toWarehouse.appendChild(option);
        });
      }
    });
  });

  // Handle transfer form submission
  if (document.getElementById("submitMaterialTransferBtn")) {
    document.getElementById("submitMaterialTransferBtn").onclick = async () => {
      const toWarehouseId = document.getElementById("matTransferToWarehouse").value;
      const quantity = parseInt(document.getElementById("matTransferQuantity").value) || 0;
      
      if (!toWarehouseId || quantity <= 0) {
        showAlert("❌ Please fill in all required fields", "error");
        return;
      }
      
      if (!editingMaterialId) {
        showAlert("❌ No material selected", "error");
        return;
      }
      
      try {
        const material = allMaterials.find(m => m.id === editingMaterialId);
        
        if (!material || material.quantity < quantity) {
          showAlert("❌ Insufficient stock in source warehouse", "error");
          return;
        }
        
        if (material.warehouse === toWarehouseId) {
          showAlert("❌ Source and destination warehouses cannot be the same", "error");
          return;
        }
        
        // Update source warehouse material (decrease)
        const newSourceQty = material.quantity - quantity;
        if (newSourceQty <= 0) {
          // Delete the material if quantity becomes 0 or less
          await deleteDoc(doc(db, "materials", editingMaterialId));
        } else {
          await updateDoc(doc(db, "materials", editingMaterialId), {
            quantity: newSourceQty,
            updatedAt: new Date().toISOString()
          });
        }
        
        // Find or create material in destination warehouse
        const destMaterial = allMaterials.find(m => 
          m.itemCode === material.itemCode && 
          m.material === material.material && 
          m.warehouse === toWarehouseId
        );
        
        if (destMaterial) {
          // Update existing material in destination
          await updateDoc(doc(db, "materials", destMaterial.id), {
            quantity: destMaterial.quantity + quantity,
            updatedAt: new Date().toISOString()
          });
        } else {
          // Create new material in destination warehouse
          // Important: Copy ALL fields from source material to prevent data loss
          const newMaterialData = {
            itemCode: material.itemCode || "",
            material: material.material || "",
            description: material.description || "",
            quantity: quantity,
            warehouse: toWarehouseId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // Copy any additional fields that might exist in the source material
          // to ensure no data is lost during transfer
          const additionalFields = ['unit', 'category', 'sku', 'supplier', 'cost', 'reorderLevel', 'specs', 'batch', 'expiryDate'];
          additionalFields.forEach(field => {
            if (material[field] !== undefined && material[field] !== null) {
              newMaterialData[field] = material[field];
            }
          });
          
          await addDoc(collection(db, "materials"), newMaterialData);
        }
        
        // Log the transfer
        const fromWh = allWarehouses.find(w => w.id === material.warehouse);
        const toWh = allWarehouses.find(w => w.id === toWarehouseId);
        await addDoc(collection(db, "stock_transfers"), {
          fromWarehouseId: material.warehouse,
          toWarehouseId,
          fromWarehouse: fromWh?.name || material.warehouse,
          toWarehouse: toWh?.name || toWarehouseId,
          materialId: editingMaterialId,
          material: material.material,
          itemCode: material.itemCode,
          quantity,
          transferredBy: currentUser?.email || "Unknown",
          timestamp: new Date().toISOString()
        });
        
        await logActivity("transfer", "stock_transfer", `Transferred ${quantity} units of ${material.material} from ${fromWh?.name} to ${toWh?.name}`);
        
        showAlert(`✅ Successfully transferred ${quantity} units of ${material.material}`, "success");
        document.getElementById("transferMaterialForm").reset();
        document.getElementById("updateMaterialChoice").checked = true;
        const materialForm = document.getElementById("materialForm");
        const transferMaterialForm = document.getElementById("transferMaterialForm");
        materialForm.style.display = "block";
        transferMaterialForm.style.display = "none";
        materialModal.style.display = "none";
        editingMaterialId = null;
        loadMaterials();
      } catch (err) {
        showAlert("❌ Error transferring stock: " + err.message, "error");
        console.error("Transfer error:", err);
      }
    };
  }

  if (document.getElementById("cancelMaterialTransferBtn")) {
    document.getElementById("cancelMaterialTransferBtn").onclick = () => {
      materialModal.style.display = "none";
      editingMaterialId = null;
      document.getElementById("transferMaterialForm").reset();
      document.getElementById("updateMaterialChoice").checked = true;
      materialForm.style.display = "block";
      transferMaterialForm.style.display = "none";
    };
  }

  // Handle Material Choice Toggle (Update Quantity vs Transfer Stock)
  const materialChoiceToggle = document.getElementById("materialChoiceToggle");
  if (materialChoiceToggle) {
    const updateChoice = document.getElementById("updateMaterialChoice");
    const transferChoice = document.getElementById("transferMaterialChoice");
    
    updateChoice?.addEventListener("change", () => {
      document.getElementById("materialForm").style.display = "block";
      document.getElementById("transferMaterialForm").style.display = "none";
    });
    
    transferChoice?.addEventListener("change", () => {
      document.getElementById("materialForm").style.display = "none";
      document.getElementById("transferMaterialForm").style.display = "block";
    });
  }

  // Handle Transfer Stock Submission
  const submitTransferBtn = document.getElementById("submitTransferBtn");
  if (submitTransferBtn) {
    submitTransferBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        if (!editingMaterialId) {
          showAlert("❌ No material selected", "error");
          return;
        }

        const destinationWarehouse = document.getElementById("transferToWarehouse").value;
        const transferQty = parseInt(document.getElementById("transferQuantity").value) || 0;
        const currentQty = parseInt(document.getElementById("transferAvailableQty").textContent) || 0;

        if (!destinationWarehouse) {
          showAlert("❌ Please select a destination warehouse", "error");
          return;
        }

        if (transferQty <= 0) {
          showAlert("❌ Transfer quantity must be greater than 0", "error");
          return;
        }

        if (transferQty > currentQty) {
          showAlert(`❌ Cannot transfer ${transferQty}. Only ${currentQty} available`, "error");
          return;
        }

        // Update source material
        const material = allMaterials.find(m => m.id === editingMaterialId);
        const newSourceQty = currentQty - transferQty;
        
        await updateDoc(doc(db, "materials", editingMaterialId), {
          quantity: newSourceQty,
          updatedAt: serverTimestamp()
        });

        // Add or update material in destination warehouse
        const destMaterialQuery = query(
          collection(db, "materials"),
          where("warehouse", "==", destinationWarehouse),
          where("itemCode", "==", material.itemCode)
        );
        const destMaterialSnap = await getDocs(destMaterialQuery);

        if (!destMaterialSnap.empty) {
          // Material exists in destination warehouse - update quantity
          const destMaterialDoc = destMaterialSnap.docs[0];
          const destCurrentQty = parseInt(destMaterialDoc.data().quantity) || 0;
          await updateDoc(doc(db, "materials", destMaterialDoc.id), {
            quantity: destCurrentQty + transferQty,
            updatedAt: serverTimestamp()
          });
        } else {
          // Material doesn't exist in destination warehouse - create new entry
          await addDoc(collection(db, "materials"), {
            itemCode: material.itemCode,
            material: material.material,
            description: material.description,
            quantity: transferQty,
            warehouse: destinationWarehouse,
            category: material.category || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }

        // Add transfer log
        await addDoc(collection(db, "activityLog"), {
          action: "stock_transfer",
          details: {
            material: material.material,
            itemCode: material.itemCode,
            fromWarehouse: currentUser.warehouse,
            toWarehouse: destinationWarehouse,
            quantity: transferQty,
            timestamp: serverTimestamp()
          },
          warehouseId: currentUser.warehouse,
          userId: currentUser.id,
          timestamp: serverTimestamp()
        });

        showAlert("✅ Stock transferred successfully!", "success");
        document.getElementById("materialModal").style.display = "none";
        await loadMaterials();
      } catch (err) {
        console.error("Transfer error:", err);
        showAlert("❌ Error transferring stock: " + err.message, "error");
      }
    });
  }

  // Initialize the application
  (async () => {
    try {
      loadStockChartDailyData();
      await loadWarehouses();
      await loadMaterials();
      await loadMaterialRequests();
      startMidnightStockUpdate();
      // Ensure dashboard page is visible
      const dashboardPage = document.getElementById("dashboard");
      if (dashboardPage) {
        dashboardPage.style.display = "block";
      }
    } catch (err) {
      console.error("Error during initialization:", err);
    }
  })();

  document.addEventListener("click", (e) => {
    if (e.target === materialModal) materialModal.style.display = "none";
    if (e.target === warehouseModal) warehouseModal.style.display = "none";
    if (e.target === transferModal) transferModal.style.display = "none";
  });
});

const searchMaterialInput = document.getElementById("searchMaterial");
const statusFilterSelect = document.getElementById("materialFilterStatus");

if (searchMaterialInput) {
  searchMaterialInput.addEventListener("input", (e) => {
    renderMaterials("all", e.target.value);
  });
}

if (statusFilterSelect) {
  statusFilterSelect.addEventListener("change", (e) => {
    renderMaterials("all", "");
  });
}

// Material Request search and filter listeners
const searchMRInput = document.getElementById("searchMR");
const filterMRStatusSelect = document.getElementById("filterMRStatus");

if (searchMRInput) {
  searchMRInput.addEventListener("input", (e) => {
    renderMRTable();
  });
}

if (filterMRStatusSelect) {
  filterMRStatusSelect.addEventListener("change", (e) => {
    renderMRTable();
  });
}

// Add Material button listener
const addMaterialBtn = document.getElementById("addMaterialBtn");
if (addMaterialBtn) {
  addMaterialBtn.addEventListener("click", () => {
    openMaterialModal();
  });
}

// ==================== MR CREATION ====================
function openMRModal() {
  currentMRItems = [];
  const mrModal = document.getElementById("mrModal");
  const mrForm = document.getElementById("mrForm");
  
  if (!mrForm) return;
  
  mrForm.reset();
  
  // Auto-populate warehouse with current user's warehouse
  const mrWarehouseDisplay = document.getElementById("mrWarehouseDisplay");
  const mrWarehouse = document.getElementById("mrWarehouse");
  const warehouseId = currentUser?.warehouse || "";
  
  // Find warehouse by ID and get its name
  const warehouseData = allWarehouses?.find(w => w.id === warehouseId);
  const warehouseName = warehouseData?.name || warehouseData?.projectName || "Unknown Warehouse";
  
  if (mrWarehouseDisplay) {
    mrWarehouseDisplay.value = warehouseName;
  }
  if (mrWarehouse) {
    mrWarehouse.value = warehouseId;
  }
  
  // Clear the autocomplete inputs
  const mrAddMaterialInput = document.getElementById("mrAddMaterialSelect");
  const mrAddQtyInput = document.getElementById("mrAddQty");
  const mrBorrowFromSelect = document.getElementById("mrBorrowFromWarehouse");
  
  if (mrAddMaterialInput) mrAddMaterialInput.value = "";
  if (mrAddQtyInput) mrAddQtyInput.value = "";
  if (mrBorrowFromSelect) mrBorrowFromSelect.value = "";
  
  // Clear dropdown displays
  const mrMaterialDropdown = document.getElementById("mrMaterialDropdown");
  if (mrMaterialDropdown) mrMaterialDropdown.style.display = "none";
  
  // Clear and show items table
  const mrItemsBody = document.getElementById("mrItemsBody");
  if (mrItemsBody) mrItemsBody.innerHTML = "";
  const mrNoItemsMsg = document.getElementById("mrNoItemsMsg");
  if (mrNoItemsMsg) mrNoItemsMsg.style.display = "block";
  
  mrModal.style.display = "flex";
}

function renderMRItemsDisplay() {
  const itemsBody = document.getElementById("mrItemsBody");
  const noItemsMsg = document.getElementById("mrNoItemsMsg");
  
  if (!itemsBody || !noItemsMsg) return;
  
  if (currentMRItems.length === 0) {
    itemsBody.innerHTML = "";
    noItemsMsg.style.display = "block";
    return;
  }
  
  noItemsMsg.style.display = "none";
  itemsBody.innerHTML = currentMRItems.map((item, idx) => `
    <tr style="border-bottom:1px solid rgba(10,155,3,0.2);">
      <td style="padding:8px;text-align:center;color:#e0e0e0;font-size:12px;">${idx + 1}</td>
      <td style="padding:8px;color:#e0e0e0;font-size:12px;">${item.itemCode || "-"}</td>
      <td style="padding:8px;color:#e0e0e0;font-size:12px;">${item.material}</td>
      <td style="padding:8px;text-align:center;color:#0a9b03;font-weight:600;font-size:12px;">${item.quantity}</td>
      <td style="padding:8px;color:#e0e0e0;font-size:12px;">${item.unit || "PCS"}</td>
      <td style="padding:8px;text-align:right;color:#e0e0e0;font-size:12px;">₱${parseFloat(item.cost || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
      <td style="padding:8px;text-align:center;">
        <button type="button" onclick="window.removeMRItem(${idx})" style="background:#ff6b6b;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;">Remove</button>
      </td>
    </tr>
  `).join("");
}

window.removeMRItem = (idx) => {
  currentMRItems.splice(idx, 1);
  renderMRItemsDisplay();
};

// Create MR button listener
const createMRBtn = document.getElementById("createMRBtn");
if (createMRBtn) {
  createMRBtn.onclick = () => {
    openMRModal();
  };
}

// MR Modal handlers
const mrModal = document.getElementById("mrModal");
const mrForm = document.getElementById("mrForm");
const closeMRModalBtn = document.getElementById("closeMRModal");
const cancelMRBtn = document.getElementById("cancelMRBtn");
const addMRItemBtn = document.getElementById("addMRItemBtn");
const saveMRBtn = document.getElementById("saveMRBtn");
currentMRItems = [];

if (closeMRModalBtn) {
  closeMRModalBtn.onclick = () => {
    mrModal.style.display = "none";
  };
}

if (cancelMRBtn) {
  cancelMRBtn.onclick = () => {
    mrModal.style.display = "none";
  };
}

// Material autocomplete for warehouse MR
if (document.getElementById("mrAddMaterialSelect")) {
  const materialInput = document.getElementById("mrAddMaterialSelect");
  const materialDropdown = document.getElementById("mrMaterialDropdown");
  
  materialInput.oninput = function() {
    const searchText = this.value.toLowerCase();
    materialDropdown.innerHTML = "";
    
    if (searchText.length === 0) {
      materialDropdown.style.display = "none";
      return;
    }
    
    // Check if borrowing - only show materials from selected borrow warehouse
    const mrTypeSelect = document.getElementById("mrType");
    const borrowSelect = document.getElementById("mrBorrowFromWarehouse");
    const isBorrow = mrTypeSelect?.value === "borrow";
    const selectedBorrowWarehouse = borrowSelect?.value;
    
    const filtered = (allMaterials || []).filter(mat => {
      const matName = (mat.material || mat.materialName || mat.name || "").toLowerCase();
      const spec = (mat.specification || mat.specs || "").toLowerCase();
      const brand = (mat.brand || "").toLowerCase();
      
      // Check text match
      const textMatch = matName.includes(searchText) || spec.includes(searchText) || brand.includes(searchText);
      
      // If borrowing, only show materials from selected warehouse
      if (isBorrow && selectedBorrowWarehouse) {
        return textMatch && mat.warehouse === selectedBorrowWarehouse;
      }
      
      return textMatch;
    });
    
    if (filtered.length > 0) {
      filtered.slice(0, 20).forEach(mat => {
        const matName = mat.material || mat.materialName || mat.name;
        const spec = mat.specification || mat.specs || "-";
        const brand = mat.brand || "-";
        const cost = parseFloat(mat.cost || mat.unitPrice || mat.price || 0);
        const availableStock = parseInt(mat.quantity || 0);
        
        // Get stock info if borrowing
        let stockInfo = "";
        const mrTypeSelect = document.getElementById("mrType");
        const isBorrow = mrTypeSelect?.value === "borrow";
        if (isBorrow) {
          const stockColor = availableStock > 0 ? "#0a9b03" : "#ff6b6b";
          stockInfo = `<div style="font-size:11px;color:${stockColor};margin-top:5px;font-weight:600;">Available Stock: ${availableStock} ${mat.unit || "PCS"}</div>`;
        }
        
        const div = document.createElement("div");
        div.style.cssText = "padding:10px;border-bottom:1px solid rgba(10,155,3,.2);cursor:pointer;color:#e0e0e0;font-size:12px;";
        div.innerHTML = `<div style="font-weight:600;color:#0a9b03;">${matName}</div><div style="font-size:11px;color:#a0a0a0;">Spec: ${spec} | Brand: ${brand}</div><div style="font-size:11px;color:#1dd1a1;margin-top:5px;">Cost: ₱${cost.toLocaleString('en-US', {minimumFractionDigits:2})}</div>${stockInfo}`;
        div.onmouseover = function() { this.style.background = "rgba(10,155,3,.15)"; };
        div.onmouseout = function() { this.style.background = "transparent"; };
        div.onclick = function() {
          materialInput.value = matName;
          materialInput.dataset.selectedId = mat.id;
          materialInput.dataset.selectedMat = JSON.stringify({
            id: mat.id,
            material: matName,
            specification: spec,
            brand: brand,
            unit: mat.unit || "",
            itemCode: mat.itemCode || mat.code || "",
            cost: cost,
            availableStock: availableStock,
            sourceWarehouseId: mat.warehouse
          });
          materialDropdown.style.display = "none";
        };
        materialDropdown.appendChild(div);
      });
      materialDropdown.style.display = "block";
    } else {
      materialDropdown.innerHTML = `<div style="padding:10px;color:#a0a0a0;text-align:center;font-size:12px;">No materials found</div>`;
      materialDropdown.style.display = "block";
    }
  };
  
  document.addEventListener("click", function(e) {
    if (!materialInput.contains(e.target) && !materialDropdown.contains(e.target)) {
      materialDropdown.style.display = "none";
    }
  });
}

// Type change handler to show/hide borrow warehouse
if (document.getElementById("mrType")) {
  const mrTypeSelect = document.getElementById("mrType");
  mrTypeSelect.onchange = function() {
    const borrowDiv = document.getElementById("borrowWarehouseDiv");
    const borrowSelect = document.getElementById("mrBorrowFromWarehouse");
    
    if (this.value === "borrow") {
      borrowDiv.style.display = "block";
      
      // Populate borrow warehouse dropdown with all warehouses except current one
      if (borrowSelect) {
        borrowSelect.innerHTML = '<option value="">Select Source Warehouse</option>';
        const currentWarehouseId = document.getElementById("mrWarehouse")?.value || currentUser?.warehouse;
        
        allWarehouses.forEach(wh => {
          if (wh.id !== currentWarehouseId) {
            const option = document.createElement("option");
            option.value = wh.id;
            option.textContent = wh.name || wh.projectName || wh.id;
            borrowSelect.appendChild(option);
          }
        });
        
        // Add change listener to clear material input when warehouse selection changes
        borrowSelect.onchange = function() {
          const materialInput = document.getElementById("mrAddMaterialSelect");
          const materialDropdown = document.getElementById("mrMaterialDropdown");
          
          if (materialInput) {
            materialInput.value = "";
            materialInput.dataset.selectedId = "";
            materialInput.dataset.selectedMat = "";
          }
          if (materialDropdown) {
            materialDropdown.style.display = "none";
            materialDropdown.innerHTML = "";
          }
        };
      }
    } else {
      borrowDiv.style.display = "none";
      
      // Clear borrow warehouse when switching away from borrow
      if (borrowSelect) {
        borrowSelect.value = "";
        borrowSelect.onchange = null;
      }
    }
  };
}

window.removeMRItem = (idx) => {
  currentMRItems.splice(idx, 1);
  renderMRItemsDisplay();
};

if (addMRItemBtn) {
  addMRItemBtn.onclick = () => {
    const materialInput = document.getElementById("mrAddMaterialSelect");
    const qtyInput = document.getElementById("mrAddQty");
    const mrTypeSelect = document.getElementById("mrType");
    const borrowSelect = document.getElementById("mrBorrowFromWarehouse");
    
    // Validate borrow warehouse selection if borrowing
    if (mrTypeSelect?.value === "borrow" && !borrowSelect?.value) {
      showAlert("Please select a source warehouse to borrow from", "error");
      return;
    }
    
    if (!materialInput.value) {
      showAlert("Please select a material", "error");
      return;
    }
    
    const qty = parseInt(qtyInput.value) || 0;
    if (qty <= 0) {
      showAlert("Please enter a valid quantity", "error");
      return;
    }
    
    // Get material data from the selected material
    const matData = materialInput.dataset.selectedMat ? JSON.parse(materialInput.dataset.selectedMat) : {
      id: materialInput.dataset.selectedId,
      material: materialInput.value,
      specification: "-",
      brand: "-",
      unit: "",
      itemCode: "",
      cost: 0,
      sourceWarehouseId: null
    };
    
    const isBorrow = mrTypeSelect?.value === "borrow";
    
    const item = {
      materialId: matData.id,
      itemCode: matData.itemCode,
      material: matData.material,
      specification: matData.specification,
      brand: matData.brand,
      quantity: qty,
      unit: matData.unit || "PCS",
      cost: matData.cost
    };
    
    // Add source warehouse for borrow requests
    if (isBorrow && matData.sourceWarehouseId) {
      item.sourceWarehouseId = matData.sourceWarehouseId;
    }
    
    currentMRItems.push(item);
    
    renderMRItemsDisplay();
    materialInput.value = "";
    qtyInput.value = "";
    showAlert("✅ Material added!", "success");
  };
}

if (mrForm) {
  mrForm.onsubmit = async (e) => {
    e.preventDefault();
    
    if (currentMRItems.length === 0) {
      showAlert("Please add at least one material", "error");
      return;
    }
    
    const mrWarehouseInput = document.getElementById("mrWarehouse");
    if (!mrWarehouseInput.value) {
      showAlert("Warehouse not assigned. Please contact admin.", "error");
      return;
    }
    
    try {
      const mrTypeSelect = document.getElementById('mrType');
      if (!mrTypeSelect) {
        showAlert("Error: Cannot read request type", "error");
        return;
      }
      const mrType = mrTypeSelect.value;
      
      // Get next MR number (synced with main dashboard)
      const mrNo = await getNextMRNumber();
      
      // Get warehouse (already selected/validated)
      const selectedWarehouseId = mrWarehouseInput.value;
      const mrWarehouseDisplay = document.getElementById("mrWarehouseDisplay");
      const warehouseName = mrWarehouseDisplay.value || currentUser?.warehouse || "Unknown";
      
      // Get borrow warehouse if applicable
      let borrowWarehouseId = null;
      if (mrType === "borrow") {
        const borrowSelect = document.getElementById("mrBorrowFromWarehouse");
        if (!borrowSelect) {
          showAlert("Error: Cannot find borrow warehouse selector", "error");
          return;
        }
        borrowWarehouseId = borrowSelect.value;
        if (!borrowWarehouseId) {
          showAlert("Please select a source warehouse for borrow", "error");
          return;
        }
      }
      
      const mrData = {
        mrNo: mrNo,
        type: mrType,
        warehouse: selectedWarehouseId,
        warehouseName: warehouseName,
        items: currentMRItems,
        status: mrType === "borrow" ? "Pending_Approval" : "Pending",
        sourceWarehouseId: mrType === "borrow" ? borrowWarehouseId : null,
        borrowWarehouseId: mrType === "borrow" ? selectedWarehouseId : null,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.name || currentUser?.email || "Unknown"
      };
      
      await addDoc(collection(db, "materialRequests"), mrData);
      await logActivity("materialRequest", "create", `Created MR: ${mrNo}`);
      
      // NOTE: Stock deduction for borrow requests now happens in dashboard when admin approves
      
      showAlert(`✅ Material Request ${mrNo} created successfully!`, "success");
      mrModal.style.display = "none";
      currentMRItems = [];
      
      // Reload MRs
      await loadMaterialRequests();
      
      // Navigate to MR tab to show the newly created MR
      const mrLink = document.querySelector('.nav-link[data-page="material-requests"]');
      if (mrLink) {
        mrLink.click();
      }
    } catch (err) {
      console.error("Error creating MR:", err);
      showAlert("❌ Error creating MR: " + err.message, "error");
    }
  };
}

if (mrModal) {
  mrModal.onclick = (e) => {
    if (e.target === mrModal) mrModal.style.display = "none";
  };
}
