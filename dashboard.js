import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  getDoc,
  doc,
  collection,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  deleteDoc,
  query,
  where
} from "./firebase.js";

// ========================================
// Utility function to calculate material status
// ========================================
function calculateMaterialStatus(material) {
  // Return existing status if available
  if (!material.stockInDate || !material.agingDays) {
    return material.status || "In Stock";
  }
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stockInDate = new Date(material.stockInDate);
    stockInDate.setHours(0, 0, 0, 0);
    
    const agingDays = material.agingDays || 90;
    const daysElapsed = Math.floor((today - stockInDate) / (1000 * 60 * 60 * 24));
    const nearExpiryThresholdDays = Math.ceil(agingDays * 0.30);
    const daysUntilNearExpiry = agingDays - nearExpiryThresholdDays;
    
    if (daysElapsed >= agingDays) {
      return "Expired";
    } else if (daysElapsed >= daysUntilNearExpiry) {
      return "Near Expiry";
    } else {
      return "In Stock";
    }
  } catch (e) {
    console.error('Error calculating material status:', e);
    return material.status || "In Stock";
  }
}

window.switchSettingsTab = async function(tabName) {
  const warehouse = document.getElementById("warehouse-tab");
  const activity = document.getElementById("activity-tab");
  const whBtn = document.getElementById("warehouseTabBtn");
  const actBtn = document.getElementById("activityTabBtn");
  
  // Clear active classes
  warehouse.classList.remove("active");
  activity.classList.remove("active");
  
  // Hide both
  warehouse.style.display = "none";
  activity.style.display = "none";
  
  // Reset buttons
  whBtn.style.color = "#a0a0a0";
  whBtn.style.borderBottomColor = "transparent";
  actBtn.style.color = "#a0a0a0";
  actBtn.style.borderBottomColor = "transparent";
  
  // Show selected
  if (tabName === "warehouse") {
    warehouse.style.display = "block";
    warehouse.classList.add("active");
    whBtn.style.color = "#0a9b03";
    whBtn.style.borderBottomColor = "#0a9b03";
    // show temporary loading placeholder while projects load
    const body = document.getElementById("warehouseBody");
    if (body) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#e0e0e0;padding:20px;">Loading projects...</td></tr>';
    }
    await loadProjects();
  } else if (tabName === "activity") {
    activity.style.display = "block";
    activity.classList.add("active");
    actBtn.style.color = "#0a9b03";
    actBtn.style.borderBottomColor = "#0a9b03";
    if (window.loadActivityLog) window.loadActivityLog();
  }
};

window.switchProcurementTab = function(tabName) {
  const mrTab = document.getElementById("mrTabContent");
  const poTab = document.getElementById("poTabContent");
  const drTab = document.getElementById("drTabContent");
  const mrBtn = document.getElementById("mrTabBtn");
  const poBtn = document.getElementById("poTabBtn");
  const drBtn = document.getElementById("drTabBtn");
  
  // Hide all tabs
  mrTab.style.display = "none";
  poTab.style.display = "none";
  drTab.style.display = "none";
  
  // Reset all button styles
  mrBtn.style.background = "none";
  mrBtn.style.color = "#a0a0a0";
  mrBtn.style.borderBottomColor = "transparent";
  poBtn.style.background = "none";
  poBtn.style.color = "#a0a0a0";
  poBtn.style.borderBottomColor = "transparent";
  drBtn.style.background = "none";
  drBtn.style.color = "#a0a0a0";
  drBtn.style.borderBottomColor = "transparent";
  
  // Show selected tab
  if (tabName === "mr") {
    mrTab.style.display = "block";
    mrBtn.style.background = "rgba(10,155,3,0.2)";
    mrBtn.style.color = "#0a9b03";
    mrBtn.style.borderBottomColor = "#0a9b03";
    loadMaterialRequests().then(() => setupFilters());
  } else if (tabName === "po") {
    poTab.style.display = "block";
    poBtn.style.background = "rgba(10,155,3,0.2)";
    poBtn.style.color = "#0a9b03";
    poBtn.style.borderBottomColor = "#0a9b03";
    loadPurchaseOrders().then(() => setupFilters());
  } else if (tabName === "dr") {
    drTab.style.display = "block";
    drBtn.style.background = "rgba(10,155,3,0.2)";
    drBtn.style.color = "#0a9b03";
    drBtn.style.borderBottomColor = "#0a9b03";
    loadDeliveries().then(() => setupFilters());
  }
};

window.selectMRProject = function(projectName, projectID, clientName) {
  const mrProjectInput = document.getElementById('mrProject');
  const dropdown = document.getElementById('mrProjectDropdown');
  
  if (mrProjectInput) {
    mrProjectInput.value = `${projectName} (${projectID})`;
    mrProjectInput.dataset.selectedProjectId = projectID;
    mrProjectInput.dataset.selectedProjectName = projectName;
    mrProjectInput.dataset.selectedClientName = clientName;
    console.log('✅ Selected project:', { projectID, projectName, clientName });
  }
  
  if (dropdown) {
    dropdown.style.display = 'none';
  }
};

window.goToPurchasingModule = function() {
  try {
    // If we just created a PO, prefer that project over the dashboard's current detail panel
    let projectId = null;
    let projectName = null;
    const last = localStorage.getItem('lastPOProjectId');
    if (last) {
      projectId = last;
      localStorage.removeItem('lastPOProjectId');
      console.log('🔁 Using last PO project for redirect:', projectId);
    }

    if (!projectId) {
      // Get the current project ID from the detail panel
      const projectIdElement = document.getElementById('detailProjectID');
      const projectNameElement = document.getElementById('detailProjectName');
      
      projectId = projectIdElement ? projectIdElement.textContent.trim() : null;
      projectName = projectNameElement ? projectNameElement.textContent.trim() : null;
    }
    
    if (!projectId) {
      console.warn('⚠️ No project ID found. Navigating to Purchasing module.');
      window.location.href = 'purchasing.html';
      return;
    }
    
    console.log('🔄 Navigating to Purchasing module with project:', { projectId, projectName });
    
    // Try to store project info and redirect via function if available
    if (typeof window.redirectToPurchasingWithPO === 'function') {
      // Prepare minimal PO data with project info
      const poData = {
        projectId: projectId,
        projectName: projectName || projectId,
        fromMaterialProcessing: true
      };
      window.redirectToPurchasingWithPO(projectId, poData);
    } else {
      // Fallback: store in localStorage and navigate
      localStorage.setItem('currentProjectId', projectId);
      localStorage.setItem('autoOpenPOStorage', 'true');
      localStorage.setItem('fromMaterialProcessing', 'true');
      console.log('📍 Stored project ID in localStorage, navigating to Purchasing');
      window.location.href = 'purchasing.html';
    }
  } catch (err) {
    console.error('❌ Error navigating to Purchasing:', err);
    window.location.href = 'purchasing.html';
  }
};

window.openLowStockModal = async function() {
  const modal = document.getElementById("lowStockModal");
  if (!modal) return;
  
  // Force fresh data load from Firestore server, bypassing persistent cache
  try {
    // Clear the cached materials array
    allMaterials = [];
    
    // Fetch fresh data directly from Firestore SERVER (not cache)
    const snap = await getDocsFromServer(collection(db, "materials"));
    snap.forEach(doc => {
      allMaterials.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Fresh load: ${allMaterials.length} total materials loaded from Firestore`);
  } catch (err) {
    console.error("❌ Error loading fresh materials:", err);
    showAlert("Error loading materials: " + err.message, "error");
    return;
  }
  
  // Reload warehouses to ensure we have latest warehouse list (for display purposes)
  try {
    const whSnap = await getDocsFromServer(collection(db, "warehouses"));
    allWarehouses = [];
    whSnap.forEach(doc => {
      allWarehouses.push({ id: doc.id, ...doc.data() });
    });
    console.log(`✅ Loaded ${allWarehouses.length} warehouses`);
  } catch (err) {
    console.error("Error loading warehouses:", err);
    // Continue even if warehouses fail to load - not a blocker
  }
  
  // Filter items with low stock (quantity <= minimum quantity)
  const lowStockItems = allMaterials.filter(item => {
    // Only include materials that have been added to stock (have itemCode, material, AND warehouse, and quantity > 0)
    const qty = parseInt(item.quantity || 0);
    if (!item.itemCode || !item.material || !item.warehouse || qty === 0) return false;
    
    const minQty = parseInt(item.minimumQuantity || 10);
    const passesFilter = qty <= minQty;
    
    if (passesFilter) {
      console.log(`📦 Low stock material: ${item.itemCode} (${item.material}) - Current: ${qty}, Minimum: ${minQty}`);
    }
    
    return passesFilter;
  });

  console.log(`✅ Found ${lowStockItems.length} items with low stock`);

  const tableBody = document.getElementById("lowStockTableBody");
  const emptyMsg = document.getElementById("lowStockEmptyMsg");

  if (lowStockItems.length === 0) {
    tableBody.innerHTML = "";
    emptyMsg.style.display = "block";
  } else {
    emptyMsg.style.display = "none";
    tableBody.innerHTML = lowStockItems.map((item) => {
      const qty = parseInt(item.quantity || 0);
      const minQty = parseInt(item.minimumQuantity || 10);
      const statusClass = qty < minQty ? "status-low" : "status-warning";
      const statusText = qty < minQty ? "CRITICAL" : "LOW";
      
      // Get project/warehouse name (and code) from ID
      const warehouseId = item.warehouse || "-";
      let warehouseName = "-";
      let warehouseCode = "-";
      if (warehouseId !== "-") {
        const wh = allWarehouses.find(w => w.id === warehouseId);
        if (wh) {
          warehouseName = wh.name || "-";
          warehouseCode = wh.code || "-";
        } else {
          warehouseName = warehouseId;
        }
      }
      
      return `
        <tr>
          <td>${item.itemCode || "-"}</td>
          <td>${item.material || item.materialName || "-"}</td>
          <td>${item.specification || "-"}</td>
          <td>${warehouseName}</td>
          <td>${warehouseCode}</td>
          <td style="font-weight:600;color:#ff6b6b;">${qty}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join("");
  }
  
  modal.style.display = "flex";
};

window.openNearExpireModal = async function() {
  const modal = document.getElementById("nearExpireModal");
  if (!modal) {
    showAlert("Near to Expire modal not found", "error");
    return;
  }
  
  // Force fresh data load from Firestore server, bypassing persistent cache
  try {
    // Clear the cached materials array
    allMaterials = [];
    
    // Fetch fresh data directly from Firestore SERVER (not cache)
    const snap = await getDocsFromServer(collection(db, "materials"));
    snap.forEach(doc => {
      allMaterials.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Fresh load: ${allMaterials.length} total materials loaded from Firestore`);
  } catch (err) {
    console.error("❌ Error loading fresh materials:", err);
    showAlert("Error loading materials: " + err.message, "error");
    return;
  }
  
  // Reload warehouses to ensure we have latest warehouse list (detects deleted warehouses)
  try {
    const whSnap = await getDocsFromServer(collection(db, "warehouses"));
    allWarehouses = [];
    whSnap.forEach(doc => {
      allWarehouses.push({ id: doc.id, ...doc.data() });
    });
    console.log(`✅ Loaded ${allWarehouses.length} warehouses`);
  } catch (err) {
    console.error("Error loading warehouses:", err);
  }
  
  // Filter items that expire within 30 days (including expired) AND validate warehouse exists
  const seenItems = new Set(); // Deduplicate items
  const nearExpireItems = allMaterials.filter(item => {
    // Only include materials with quantity > 0 (actually in stock)
    const qty = parseInt(item.quantity || 0);
    if (qty === 0) return false;
    
    // Must have all required fields for a valid material
    if (!item.itemCode || !item.material || !item.warehouse) return false;
    
    // If no expiry date, skip this item
    if (!item.expiryDate) return false;
    
    // Verify warehouse still exists (not deleted)
    const warehouseExists = allWarehouses.some(w => w.id === item.warehouse);
    if (!warehouseExists) {
      console.warn(`⚠️ Material ${item.itemCode} has non-existent warehouse: ${item.warehouse}`);
      return false;
    }
    
    try {
      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      
      // Set time to midnight for accurate day calculation
      today.setHours(0, 0, 0, 0);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if expires within 30 days (original logic for compatibility)
      const passesFilter = daysUntilExpiry <= 30;
      
      // Deduplicate: only keep first occurrence of itemCode + warehouse combo
      const itemKey = `${item.itemCode}|${item.warehouse}`;
      if (seenItems.has(itemKey)) return false;
      if (passesFilter) seenItems.add(itemKey);
      
      if (passesFilter) {
        console.log(`📦 Near-expire material: ${item.itemCode} (${item.material}) - ${daysUntilExpiry} days left`);
      }
      
      return passesFilter;
    } catch (e) {
      console.error(`Error parsing expiry date for ${item.itemCode}:`, e);
      return false;
    }
  }).sort((a, b) => {
    const dateA = new Date(a.expiryDate);
    const dateB = new Date(b.expiryDate);
    return dateA - dateB;
  });

  console.log(`✅ Found ${nearExpireItems.length} items expiring within 30 days`);

  const tableBody = document.getElementById("nearExpireTableBody");
  const emptyMsg = document.getElementById("nearExpireEmptyMsg");

  if (nearExpireItems.length === 0) {
    tableBody.innerHTML = "";
    emptyMsg.style.display = "block";
  } else {
    emptyMsg.style.display = "none";
    tableBody.innerHTML = nearExpireItems.map((item) => {
      const expiryDate = new Date(item.expiryDate);
      const today = new Date();
      
      // Set time to midnight for accurate day calculation
      today.setHours(0, 0, 0, 0);
      expiryDate.setHours(0, 0, 0, 0);
      
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      let daysClass = "status-ok";
      let daysText = `${daysUntilExpiry} days`;
      if (daysUntilExpiry <= 0) {
        daysClass = "status-low";
        daysText = "EXPIRED";
      } else if (daysUntilExpiry <= 7) {
        daysClass = "status-warning";
      }
      
      const warehouseId = item.warehouse || "-";
      let projectName = "-";
      if (warehouseId !== "-") {
        // Try to find project first
        const project = allProjects?.find(p => p.id === warehouseId);
        if (project) {
          projectName = project.projectName || project.name || warehouseId;
        } else {
          // Fallback to warehouse
          const wh = allWarehouses.find(w => w.id === warehouseId);
          if (wh) {
            projectName = wh.code ? `${wh.name} (${wh.code})` : wh.name;
          } else {
            projectName = warehouseId;
          }
        }
      }
      
      return `
        <tr data-project-id="${warehouseId}">
          <td>${item.itemCode || "-"}</td>
          <td>${item.material || item.materialName || "-"}</td>
          <td>${expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
          <td><span class="${daysClass}">${daysText}</span></td>
          <td>${projectName}</td>
        </tr>
      `;
    }).join("");
  }
  
  // Populate and setup project filter dropdown
  setTimeout(() => {
    const projectFilter = document.getElementById("nearExpireProjectFilter");
    if (projectFilter) {
      // Get unique projects from the items
      const uniqueProjects = new Map();
      nearExpireItems.forEach(item => {
        const projectId = item.warehouse;
        if (projectId && !uniqueProjects.has(projectId)) {
          const project = allProjects?.find(p => p.id === projectId);
          const warehouse = allWarehouses?.find(w => w.id === projectId);
          const name = project?.projectName || warehouse?.name || projectId;
          uniqueProjects.set(projectId, name);
        }
      });
      
      // Reset and populate dropdown
      projectFilter.innerHTML = '<option value="">All Projects</option>';
      Array.from(uniqueProjects.entries()).forEach(([id, name]) => {
        projectFilter.innerHTML += `<option value="${id}">${name}</option>`;
      });
      
      // Add change listener for filtering
      projectFilter.onchange = function() {
        const selectedProjectId = this.value;
        const tableRows = document.querySelectorAll("#nearExpireTableBody tr");
        
        tableRows.forEach(row => {
          if (selectedProjectId === "") {
            // Show all rows
            row.style.display = "";
          } else {
            // Show only matching project
            const rowProjectId = row.getAttribute("data-project-id");
            row.style.display = rowProjectId === selectedProjectId ? "" : "none";
          }
        });
      };
      
      console.log('✅ Project filter dropdown populated with', uniqueProjects.size, 'projects');
    }
  }, 100);
  
  modal.style.display = "flex";
};

let allUsers = [];
let allMaterials = [];
let allWarehouses = [];
let allProjects = [];
let allCategories = [];
let allSuppliers = []; // List of known suppliers (DAIKIN, LG, etc.)
let allDeliveries = [];
let allScheduleRecords = [];
let allMaterialRequests = [];
let editingWarehouseId = null;
let isEditingProject = false; // Flag to track if we're editing a project
let allPurchaseOrders = [];
let currentUser = null;
let unsubscribeAuth = null;
let editingMaterialId = null;
let editingUserId = null;
let editingDeliveryId = null;
let editingScheduleId = null;
let usingMaterialColumns2 = false;
let selectedMaterialForStock = null; // Track selected material ID for Stock Monitoring
let selectedCategory = ""; // Track selected category in Materials tab (will be set to first category)
let deliveryColumns = [];
let scheduleColumns = [];
let materialColumns = [];
let materialColumns2 = [];
let configuringColumnsFor = "delivery"; // Track which section is configuring columns

// Initialize delivery receipt items array
window.drCurrentItems = [];

const DELIVERY_COLUMNS_KEY = "deliveryColumns";
const SCHEDULE_COLUMNS_KEY = "scheduleColumns";
const MATERIAL_COLUMNS_KEY = "materialColumns";
const MATERIAL_COLUMNS_KEY_2 = "materialColumns2";
const CATEGORIES_KEY = "materialCategories";
const SUPPLIERS_KEY = "materialSuppliers";
const SUPPLIERS_PREFIX = "materialSuppliers_category_"; // Prefix for category-specific suppliers
const CATEGORY_COLUMNS_PREFIX = "materialColumns_category_"; // Prefix for category-specific columns

// Pagination variables for Materials tab
let currentPage = 1;
const itemsPerPage = 50;
let filteredMaterialsList = [];
let totalPages = 1;

// Helper function to get the key for category-specific columns
function getCategoryColumnsKey(category) {
  return CATEGORY_COLUMNS_PREFIX + category;
}

// Helper function to get the key for category-specific suppliers
function getCategorySuppliersKey(category) {
  return SUPPLIERS_PREFIX + category;
}

// Export Delivery Data to Excel with filters
function openExportDeliveryModal() {
  if (allDeliveries.length === 0) {
    showAlert("❌ No delivery records to export!", "error");
    return;
  }

  const modal = document.getElementById("exportDeliveryModal");
  if (!modal) return;

  modal.style.display = "flex";

  // Reset filters
  document.getElementById("exportAllBtn").style.background = "rgba(10,155,3,0.3)";
  document.getElementById("exportAllBtn").style.borderColor = "#0a9b03";
  document.getElementById("exportByDateBtn").style.background = "rgba(255,255,255,0.08)";
  document.getElementById("exportByDateBtn").style.borderColor = "rgba(255,255,255,0.2)";
  document.getElementById("exportByMonthBtn").style.background = "rgba(255,255,255,0.08)";
  document.getElementById("exportByMonthBtn").style.borderColor = "rgba(255,255,255,0.2)";
  document.getElementById("dateRangeFilter").style.display = "none";
  document.getElementById("monthFilter").style.display = "none";

  let selectedFilter = "all";

  document.getElementById("exportAllBtn").onclick = () => {
    selectedFilter = "all";
    document.getElementById("exportAllBtn").style.background = "rgba(10,155,3,0.3)";
    document.getElementById("exportAllBtn").style.borderColor = "#0a9b03";
    document.getElementById("exportByDateBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportByDateBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("exportByMonthBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportByMonthBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("dateRangeFilter").style.display = "none";
    document.getElementById("monthFilter").style.display = "none";
  };

  document.getElementById("exportByDateBtn").onclick = () => {
    selectedFilter = "dateRange";
    document.getElementById("exportAllBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportAllBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("exportByDateBtn").style.background = "rgba(10,155,3,0.3)";
    document.getElementById("exportByDateBtn").style.borderColor = "#0a9b03";
    document.getElementById("exportByMonthBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportByMonthBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("dateRangeFilter").style.display = "block";
    document.getElementById("monthFilter").style.display = "none";
  };

  document.getElementById("exportByMonthBtn").onclick = () => {
    selectedFilter = "month";
    document.getElementById("exportAllBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportAllBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("exportByDateBtn").style.background = "rgba(255,255,255,0.08)";
    document.getElementById("exportByDateBtn").style.borderColor = "rgba(255,255,255,0.2)";
    document.getElementById("exportByMonthBtn").style.background = "rgba(10,155,3,0.3)";
    document.getElementById("exportByMonthBtn").style.borderColor = "#0a9b03";
    document.getElementById("dateRangeFilter").style.display = "none";
    document.getElementById("monthFilter").style.display = "block";
  };

  document.getElementById("proceedExportBtn").onclick = () => {
    exportDeliveryToExcel(selectedFilter);
    modal.style.display = "none";
  };

  document.getElementById("cancelExportBtn").onclick = () => {
    modal.style.display = "none";
  };

  document.getElementById("closeExportDeliveryModalBtn").onclick = () => {
    modal.style.display = "none";
  };
}

function exportDeliveryToExcel(filter = "all") {
  if (allDeliveries.length === 0) {
    showAlert("❌ No delivery records to export!", "error");
    return;
  }

  try {
    let exportRecords = [...allDeliveries];

    // Apply filters
    if (filter === "dateRange") {
      const startDate = document.getElementById("exportStartDate")?.value;
      const endDate = document.getElementById("exportEndDate")?.value;

      if (!startDate || !endDate) {
        showAlert("❌ Please select both start and end dates!", "error");
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      exportRecords = exportRecords.filter(delivery => {
        const deliveryDate = new Date(delivery.Date || delivery.date || "");
        return deliveryDate >= start && deliveryDate <= end;
      });
    } else if (filter === "month") {
      const month = document.getElementById("exportMonth")?.value;
      if (!month) {
        showAlert("❌ Please select a month!", "error");
        return;
      }

      const [year, monthNum] = month.split("-");
      exportRecords = exportRecords.filter(delivery => {
        const deliveryDate = new Date(delivery.Date || delivery.date || "");
        return deliveryDate.getFullYear() === parseInt(year) &&
               deliveryDate.getMonth() === parseInt(monthNum) - 1;
      });
    }

    if (exportRecords.length === 0) {
      showAlert("❌ No records found for the selected filter!", "error");
      return;
    }

    // Get visible columns from the table header
    const headerRow = document.getElementById("headerRow");
    const columns = [];
    
    if (headerRow) {
      headerRow.querySelectorAll("th").forEach(th => {
        const text = th.textContent.trim();
        if (text && text !== "Actions") {
          columns.push(text);
        }
      });
    }

    // If no columns found from header, use all available data keys
    if (columns.length === 0) {
      if (exportRecords.length > 0) {
        columns.push(...Object.keys(exportRecords[0]).filter(key => key !== "id"));
      }
    }

    // Format data for Excel
    const exportData = exportRecords.map(delivery => {
      const row = {};
      columns.forEach(col => {
        const key = Object.keys(delivery).find(k => 
          k.toLowerCase().replace(/[_-]/g, '') === col.toLowerCase().replace(/[_-]/g, '')
        ) || col;
        row[col] = delivery[key] || "";
      });
      return row;
    });

    // Create workbook and sheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivery Records");

    // Auto-adjust column widths
    const colWidths = columns.map(col => ({
      wch: Math.min(20, Math.max(12, col.length + 2))
    }));
    worksheet["!cols"] = colWidths;

    // Generate filename with date
    const now = new Date();
    const filename = `Delivery_Records_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`;

    // Write file
    XLSX.writeFile(workbook, filename);
    showAlert("✅ Delivery records exported successfully!", "success");
  } catch (error) {
    console.error("Export error:", error);
    showAlert("❌ Failed to export data!", "error");
  }
}

function exportMaterialToExcel() {
  if (allMaterials.length === 0) {
    showAlert("❌ No materials to export!", "error");
    return;
  }

  try {
    // Get visible columns from materialColumns configuration
    const columns = materialColumns.map(col => col.name).filter(col => col !== "Status" && col !== "Actions");
    
    // Format data for Excel
    const exportData = allMaterials.map(material => {
      const row = {};
      columns.forEach(col => {
        if (col === "Item Code") {
          row[col] = material.itemCode || "";
        } else if (col === "Material") {
          row[col] = material.material || "";
        } else if (col === "Description") {
          row[col] = material.description || "";
        } else if (col === "Quantity") {
          row[col] = material.quantity || "";
        } else if (col === "Warehouse") {
          row[col] = material.warehouse || "";
        } else {
          // Custom columns
          row[col] = material[col.toLowerCase().replace(/\s+/g, '')] || "";
        }
      });
      return row;
    });

    // Create workbook and sheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Materials");

    // Auto-adjust column widths
    const colWidths = columns.map(col => ({
      wch: Math.min(20, Math.max(12, col.length + 2))
    }));
    worksheet["!cols"] = colWidths;

    // Generate filename with date
    const now = new Date();
    const filename = `Materials_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.xlsx`;

    // Write file
    XLSX.writeFile(workbook, filename);
    showAlert("✅ Materials exported successfully!", "success");
  } catch (error) {
    console.error("Export error:", error);
    showAlert("❌ Failed to export data!", "error");
  }
}

// Generate sequential MR number with month/year prefix (MR-202402-001, etc.) - resets monthly
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

// Generate sequential PO number (PO001, PO002, etc.)
async function getNextPONumber() {
  try {
    const snap = await getDocs(collection(db, "purchaseOrders"));
    let count = snap.size + 1;
    
    return `PO${String(count).padStart(3, '0')}`;
  } catch (err) {
    console.error("Error getting PO number:", err);
    return `PO001`;
  }
}

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

function showDeleteConfirmCard(itemType, itemName, action = "delete") {
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

    // Generate the appropriate message based on action
    let actionMessage = action;
    if (action === "delete") {
      actionMessage = "delete";
    } else if (action === "disable") {
      actionMessage = "disable";
    } else if (action === "enable") {
      actionMessage = "enable";
    } else if (action === "reset-password") {
      actionMessage = "send password reset email to";
    }
    
    card.innerHTML = `
      <div style="padding: 24px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 15px;">⚠️</div>
        <h2 style="margin: 0 0 10px; font-size: 18px; font-weight: 700;">Are you sure you want to ${actionMessage} ${itemName || 'this item'} ?</h2>

        <div>
          <strong style="margin: 0; font-size: 12px; color: #a60202;">Note : This action cannot be undone</strong>
        </div>

        <div style="padding: 16px; margin-top: auto;">
          <div style="display: flex; gap: 10px;">
            <button id="cancelDeleteBtn" style="flex: 1; background:rgba(21, 175, 37, 0.67); color: #e0e0e0; border: 1px solid #00ff00; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">No</button>
            <button id="confirmDeleteBtn" style="flex: 1; background:rgba(188, 14, 14, 0.58); color: #e0e0e0; border: 1px solid #ff0000; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.3s ease;">Yes</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(card);

    const confirmBtn = document.getElementById("confirmDeleteBtn");
    const cancelBtn = document.getElementById("cancelDeleteBtn");

    confirmBtn.onmouseover = () => {
      confirmBtn.style.opacity = "0.9";
    };
    confirmBtn.onmouseout = () => {
      confirmBtn.style.opacity = "1";
    };

    cancelBtn.onmouseover = () => {
      cancelBtn.style.opacity = "0.9";
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.opacity = "1";
    };

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

  if (document.getElementById("changePasswordBtn")) {
    document.getElementById("changePasswordBtn").onclick = async (e) => {
      e.preventDefault();
      await changeUserPassword();
    };
  }

  if (document.getElementById("resetPasswordForm")) {
    document.getElementById("resetPasswordForm").onclick = () => {
      document.getElementById("changePasswordForm").reset();
    };
  }

  // Update sidebar link handler for settings
  document.querySelectorAll(".nav-link").forEach(link => {
    if (link.dataset.page === "settings") {
      link.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
        link.classList.add("active");
        document.querySelectorAll(".page").forEach(p => p.style.display = "none");
        const target = document.getElementById(link.dataset.page);
        if (target) {
          target.style.display = "block";
          document.getElementById("changePasswordForm").reset();
        }
      };
    }
  });

// ==================== WAREHOUSE FUNCTIONS ====================
async function loadWarehouses() {
  // repurposed: load project data instead of physical warehouses
  try {
    const snap = await getDocs(collection(db, "projects"));
    allWarehouses = []; // still used by other code for compatibility
    snap.forEach(doc => {
      const proj = { id: doc.id, ...doc.data() };
      allWarehouses.push(proj);
    });
    // renderWarehouseTable is not used for projects, but keep for any legacy use
    renderWarehouseTable();
    updateWarehouseFilters();
    updateWarehouseDropdowns();
    updateWarehouseChart();
    populateReportWarehouses();
    return Promise.resolve();
  } catch (err) {
    console.error("Error loading projects as warehouses:", err);
    return Promise.reject(err);
  }
}

function populateReportWarehouses() {
  const whSelect = document.getElementById("reportWarehouse");
  if (!whSelect) return;
  
  const currentValue = whSelect.value;
  whSelect.innerHTML = '<option value="">All Projects</option>';
  
  allWarehouses.forEach(wh => {
    const option = document.createElement("option");
    option.value = wh.id || wh.name;
    option.textContent = wh.code ? `${wh.name} (${wh.code})` : wh.name;
    whSelect.appendChild(option);
  });
  
  whSelect.value = currentValue;
}

function renderWarehouseTable() {
  const warehouseBody = document.getElementById("warehouseBody");
  if (!warehouseBody) return;
  warehouseBody.innerHTML = "";
  allWarehouses.forEach(wh => {
    warehouseBody.innerHTML += `
      <tr>
        <td>${wh.name || "-"}</td>
        <td>${wh.code || "-"}</td>
        <td>${wh.location || "-"}</td>
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

// Load Projects from Firestore
async function loadProjects() {
  try {
    const snap = await getDocs(collection(db, "projects"));
    allProjects = [];
    snap.forEach(doc => {
      allProjects.push({ id: doc.id, ...doc.data() });
    });
    renderProjectsTable();
    return Promise.resolve();
  } catch (err) {
    console.error("Error loading projects:", err);
    return Promise.reject(err);
  }
}

// Render Projects Table
function renderProjectsTable() {
  const warehouseBody = document.getElementById("warehouseBody");
  if (!warehouseBody) return;
  warehouseBody.innerHTML = "";
  
  if (allProjects.length === 0) {
    warehouseBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e0e0e0;padding:20px;">No projects found.</td></tr>';
    return;
  }
  
  allProjects.forEach(project => {
    const tradesDisplay = Array.isArray(project.trades) ? project.trades.join(", ") : (project.trade || "N/A");
    warehouseBody.innerHTML += `
      <tr>
        <td>${project.name || "N/A"}</td>
        <td>${project.projectId || "N/A"}</td>
        <td>${project.client || "N/A"}</td>
        <td>${project.clientPo || "N/A"}</td>
        <td>${project.scope || "N/A"}</td>
        <td>${tradesDisplay}</td>
        <td>${project.location || "N/A"}</td>
        <td>
          <div class="action-buttons">
            <button onclick="window.editWarehouse('${project.id}')" class="btn-edit" style="padding:6px 12px;font-size:12px;">Edit</button>
            <button onclick="window.deleteWarehouse('${project.id}')" class="btn-delete" style="padding:6px 12px;font-size:12px;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}

function updateWarehouseFilters() {
  // IMPORTANT: Only update warehouse tabs in Stock Monitoring section, NOT Materials section
  const tabsContainer = document.querySelector("#stock-monitoring .warehouses-row .tabs");
  if (tabsContainer) {
    tabsContainer.innerHTML = '<button class="tab active" data-warehouse="all">All</button>';
    allWarehouses.forEach(wh => {
      // show project name and optionally code
      const label = wh.code ? `${wh.name} (${wh.code})` : wh.name;
      tabsContainer.innerHTML += `<button class="tab" data-warehouse="${wh.id}">${label}</button>`;
    });
  }
}


function updateWarehouseDropdowns() {
  const matWarehouse = document.getElementById("matWarehouse");
  if (matWarehouse) {
    const selectedValue = matWarehouse.value;
    matWarehouse.innerHTML = '<option value="">Select Project</option>';
    allWarehouses.forEach(wh => {
      const label = wh.code ? `${wh.name} (${wh.code})` : wh.name;
      matWarehouse.innerHTML += `<option value="${wh.id}">${label}</option>`;
    });
    if (selectedValue) matWarehouse.value = selectedValue;
  }

  const userWarehouse = document.getElementById("userWarehouse");
  if (userWarehouse) {
    const selectedValue = userWarehouse.value;
    userWarehouse.innerHTML = '<option value="">Select Project</option>';
    allWarehouses.forEach(wh => {
      const label = wh.code ? `${wh.name} (${wh.code})` : wh.name;
      userWarehouse.innerHTML += `<option value="${wh.id}">${label}</option>`;
    });
    if (selectedValue) userWarehouse.value = selectedValue;
  }
}

function openWarehouseModal(warehouse = null) {
  const modal = document.getElementById("warehouseModal");
  const form = document.getElementById("warehouseForm");
  if (warehouse) {
    document.getElementById("warehouseModalTitle").textContent = "Edit Warehouse";
    document.getElementById("whName").value = warehouse.name || "";
    document.getElementById("whCode").value = warehouse.code || "";
    document.getElementById("whLocation").value = warehouse.location || "";
    editingWarehouseId = warehouse.id;
  } else {
    document.getElementById("warehouseModalTitle").textContent = "Add Warehouse";
    form.reset();
    editingWarehouseId = null;
  }
  modal.style.display = "flex";
}

window.editWarehouse = async (id) => {
  console.log("editWarehouse called with id:", id, "Type:", typeof id);
  
  // First check if it's a project
  let project = allProjects.find(p => p.id === id);
  console.log("Searching for project with id:", id, "Found:", !!project, "allProjects.length:", allProjects.length);
  
  if (!project) {
    // data might not be loaded yet, try fetching once
    console.log("Project not found, reloading projects...");
    await loadProjects().catch(e => console.error('reload projects for edit failed', e));
    project = allProjects.find(p => p.id === id);
    console.log("After reload, found project:", !!project);
  }

  if (project) {
    console.log("Found project, opening modal for edit:", project);
    // This is a project, open project modal
    isEditingProject = true;
    editingWarehouseId = id;
    
    console.log("Set editingWarehouseId to:", editingWarehouseId, "isEditingProject to:", isEditingProject);
    
    document.getElementById("warehouseModalTitle").textContent = "Edit Project";
    document.getElementById("whName").value = project.name || "";
    document.getElementById("whProjectId").value = project.projectId || "";
    document.getElementById("whClient").value = project.client || "";
    document.getElementById("whClientPo").value = project.clientPo || "";
    document.getElementById("whScope").value = project.scope || "";
    document.getElementById("whTrade").value = Array.isArray(project.trades) ? project.trades.join(",") : (project.trade || "");
    document.getElementById("whLocation").value = project.location || "";
    
    displayTradeDropdown();
    updateTradeDisplay();
    
    const warehouseModal = document.getElementById("warehouseModal");
    if (warehouseModal) warehouseModal.classList.add("active");
    console.log("Modal opened for project edit, about to return");
    return;
  }
  
  // Otherwise check if it's a warehouse
  console.log("Not a project, checking if it's a warehouse");
  isEditingProject = false;
  const warehouse = allWarehouses.find(w => w.id === id);
  if (warehouse) openWarehouseModal(warehouse);
};

window.deleteWarehouse = async (id) => {
  // Check if it's a project
  const project = allProjects.find(p => p.id === id);
  if (project) {
    const confirmed = await showDeleteConfirmCard("Project", project?.name || "Unknown");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      await logActivity("project", "delete", `Deleted project: ${project?.name}`);
      showAlert("✅ Project deleted!", "success");
      loadProjects();
    } catch (e) {
      showAlert("❌ Error: " + e.message, "error");
    }
    return;
  }
  
  // Otherwise delete from warehouses
  const warehouse = allWarehouses.find(w => w.id === id);
  const confirmed = await showDeleteConfirmCard("Warehouse", warehouse?.name || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "warehouses", id));
    await logActivity("warehouse", "delete", `Deleted warehouse: ${warehouse?.name}`);
    showAlert("✅ Warehouse deleted!", "success");
    loadWarehouses();
  } catch (e) {
    showAlert("❌ Error: " + e.message, "error");
  }
};

  // Single centralized tab click handler - ONLY for Stock Monitoring warehouse tabs
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("tab")) {
      // IMPORTANT: Only handle warehouse tabs in Stock Monitoring section, NEVER touch Materials category tabs
      const warehouseTabsParent = e.target.closest("#stock-monitoring .warehouses-row .tabs");
      
      if (warehouseTabsParent) {
        // This is a Stock Monitoring warehouse tab - handle it
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll("#stock-monitoring .warehouses-row .tab").forEach(t => t.classList.remove("active"));
        e.target.classList.add("active");
        const warehouse = e.target.dataset.warehouse;
        console.log("Tab clicked: warehouse=" + warehouse);
        renderMaterials(warehouse);
      }
      // If NOT a warehouse tab in Stock Monitoring, don't touch it - let other handlers (like updateCategoryTabs) handle it
    }
  });

// ==================== CATEGORY FUNCTIONS ====================
async function loadCategories() {
  try {
    const user = auth.currentUser;
    if (!user) {
      allCategories = [];
      updateCategoryTabs();
      return;
    }

    // Load from Firebase first
    const docRef = doc(db, "categoryConfig", "allCategories");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      allCategories = docSnap.data().categories || [];
    } else {
      allCategories = [];
    }
    
    updateCategoryTabs();
  } catch (err) {
    console.error("Error loading categories:", err);
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(CATEGORIES_KEY);
      if (stored) {
        allCategories = JSON.parse(stored);
      } else {
        allCategories = [];
      }
      updateCategoryTabs();
    } catch (e) {
      console.error("Error loading from localStorage:", e);
    }
  }
}

function updateCategoryTabs() {
  const categoryTabsContainer = document.getElementById("categoryTabs");
  if (!categoryTabsContainer) return;
  
  // Remove "All" tab - just show individual categories
  categoryTabsContainer.innerHTML = '';
  allCategories.forEach((cat, idx) => {
    const isActive = idx === 0 ? "active" : "";
    categoryTabsContainer.innerHTML += `<button class="tab ${isActive}" data-category="${cat}">${cat}</button>`;
  });
  
  // Set first category as default if not set
  if (!selectedCategory && allCategories.length > 0) {
    selectedCategory = allCategories[0];
    console.log("Setting default selected category to:", selectedCategory);
  }
  
  // Add direct click listeners to category tabs
  const categoryTabs = categoryTabsContainer.querySelectorAll(".tab");
  categoryTabs.forEach(tab => {
    tab.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove active class from all tabs
      categoryTabs.forEach(t => t.classList.remove("active"));
      // Add active class to clicked tab
      tab.classList.add("active");
      
      // Update selected category
      selectedCategory = tab.dataset.category;
      console.log("✓ Category tab clicked, selectedCategory is now:", selectedCategory);
      
      // Load the column configuration for this category - WAIT for it to complete
      await loadMaterialColumnsForCategory(selectedCategory);
      
      // Load the suppliers for this category
      loadSuppliersForCategory(selectedCategory);
      console.log("Loaded suppliers for category:", selectedCategory, allSuppliers);
      
      // Re-render the table with new columns and data (now materialColumns2 is loaded)
      const searchQuery = document.getElementById("searchMaterial2")?.value || "";
      console.log("Rendering materials for category:", selectedCategory);
      renderMaterialsWithFilter2("all", searchQuery, "");
    });
  });
}

function saveCategoriesToLocalStorage() {
  // Save to Firebase
  const user = auth.currentUser;
  if (user) {
    try {
      const docRef = doc(db, "categoryConfig", "allCategories");
      setDoc(docRef, { categories: allCategories, lastUpdated: new Date() }, { merge: true }).then(() => {
        console.log("Categories saved to Firebase");
      }).catch(err => {
        console.error("Error saving to Firebase:", err);
        // Fallback to localStorage
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(allCategories));
      });
    } catch (e) {
      console.error("Error:", e);
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(allCategories));
    }
  } else {
    // Fallback to localStorage if not logged in
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(allCategories));
  }
}

function openConfigureCategoriesModal() {
  const modal = document.getElementById("configureCategoriesModal");
  const list = document.getElementById("categoriesList");
  
  list.innerHTML = "";
  allCategories.forEach((cat, index) => {
    list.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);">
        <input type="text" class="category-edit-input" data-index="${index}" value="${cat}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onblur="updateCategory(${index}, this.value)">
        <button type="button" onclick="deleteCategory(${index})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
  });
  
  modal.style.display = "flex";
}

window.deleteCategory = (index) => {
  allCategories.splice(index, 1);
  saveCategoriesToLocalStorage();
  openConfigureCategoriesModal();
  updateCategoryTabs();
};

window.updateCategory = (index, newValue) => {
  const trimmedValue = (newValue || "").trim();
  if (!trimmedValue) {
    showAlert("Category name cannot be empty", "error");
    openConfigureCategoriesModal();
    return;
  }
  if (trimmedValue === allCategories[index]) {
    return; // No change
  }
  if (allCategories.some((cat, i) => i !== index && cat === trimmedValue)) {
    showAlert("Category already exists", "error");
    openConfigureCategoriesModal();
    return;
  }
  allCategories[index] = trimmedValue;
  saveCategoriesToLocalStorage();
  updateCategoryTabs();
  renderMaterials2("all");
};

// ==================== SUPPLIER FUNCTIONS ====================
async function loadSuppliers() {
  try {
    // Load suppliers for the current category
    loadSuppliersForCategory(selectedCategory);
    console.log("Loaded suppliers for category:", selectedCategory, allSuppliers);
  } catch (err) {
    console.error("Error loading suppliers:", err);
  }
}

function loadSuppliersForCategory(category) {
  return new Promise((resolve) => {
    const categoryKey = getCategorySuppliersKey(category);
    
    // Try to load from Firebase first
    const user = auth.currentUser;
    if (user) {
      try {
        const docRef = doc(db, "supplierConfig", categoryKey);
        getDoc(docRef).then(docSnap => {
          if (docSnap.exists() && docSnap.data().suppliers) {
            allSuppliers = docSnap.data().suppliers;
            console.log("✅ Loaded category suppliers from Firebase:", category, allSuppliers);
            resolve();
          } else {
            setDefaultSuppliers();
            saveSuppliersForCategory(category);
            resolve();
          }
        }).catch(err => {
          console.error("Error loading from Firebase:", err);
          // Fallback to localStorage
          const stored = localStorage.getItem(categoryKey);
          if (stored) {
            try {
              allSuppliers = JSON.parse(stored);
              console.log("✅ Loaded suppliers from localStorage:", allSuppliers);
            } catch (e) {
              setDefaultSuppliers();
            }
          } else {
            setDefaultSuppliers();
          }
          resolve();
        });
      } catch (e) {
        console.error("Error:", e);
        // Fallback to localStorage
        const stored = localStorage.getItem(categoryKey);
        if (stored) {
          try {
            allSuppliers = JSON.parse(stored);
            console.log("✅ Loaded suppliers from localStorage:", allSuppliers);
          } catch (e2) {
            setDefaultSuppliers();
          }
        } else {
          setDefaultSuppliers();
        }
        resolve();
      }
    } else {
      // Load from localStorage if not logged in
      const stored = localStorage.getItem(categoryKey);
      if (stored) {
        try {
          allSuppliers = JSON.parse(stored);
          console.log("✅ Loaded suppliers from localStorage:", allSuppliers);
        } catch (e) {
          setDefaultSuppliers();
        }
      } else {
        setDefaultSuppliers();
      }
      resolve();
    }
  });
}

function setDefaultSuppliers() {
  allSuppliers = ["DAIKIN", "LG", "DUCTWIN", "RITEMORE"];
}

function saveSuppliersForCategory(category) {
  const categoryKey = getCategorySuppliersKey(category);
  const user = auth.currentUser;
  
  if (user) {
    try {
      const docRef = doc(db, "supplierConfig", categoryKey);
      setDoc(docRef, { suppliers: allSuppliers, lastUpdated: new Date() }, { merge: true }).then(() => {
        console.log("Suppliers saved to Firebase");
      }).catch(err => {
        console.error("Error saving to Firebase:", err);
        // Fallback to localStorage
        localStorage.setItem(categoryKey, JSON.stringify(allSuppliers));
      });
    } catch (e) {
      console.error("Error:", e);
      localStorage.setItem(categoryKey, JSON.stringify(allSuppliers));
    }
  } else {
    // Fallback to localStorage
    localStorage.setItem(categoryKey, JSON.stringify(allSuppliers));
  }
}

function saveSuppliers() {
  // Save to category-specific key
  saveSuppliersForCategory(selectedCategory);
}

window.addSupplier = (supplierName) => {
  const trimmed = (supplierName || "").trim().toUpperCase();
  if (!trimmed) {
    showAlert("Supplier name cannot be empty", "error");
    return;
  }
  if (allSuppliers.includes(trimmed)) {
    showAlert("Supplier already exists", "error");
    return;
  }
  allSuppliers.push(trimmed);
  saveSuppliers();
  showAlert("✅ Supplier added!", "success");
};

window.deleteSupplier = (index) => {
  allSuppliers.splice(index, 1);
  saveSuppliers();
  showAlert("✅ Supplier deleted!", "success");
};

function openConfigureSuppliersModal() {
  const modal = document.getElementById("configureSuppliersModal");
  const list = document.getElementById("suppliersList");
  
  // Update the modal header to show which category is being configured
  const supplierCategoryName = document.getElementById("supplierCategoryName");
  if (supplierCategoryName) {
    supplierCategoryName.textContent = selectedCategory;
  }
  
  list.innerHTML = "";
  allSuppliers.forEach((supplier, index) => {
    list.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);">
        <input type="text" class="supplier-edit-input" data-index="${index}" value="${supplier}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onblur="updateSupplier(${index}, this.value)">
        <button type="button" onclick="deleteSuppliersListItem(${index})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
  });
  
  modal.style.display = "flex";
}

window.deleteSuppliersListItem = (index) => {
  allSuppliers.splice(index, 1);
  saveSuppliers();
  openConfigureSuppliersModal();
};

window.updateSupplier = (index, newValue) => {
  const trimmedValue = (newValue || "").trim();
  if (!trimmedValue) {
    showAlert("Supplier name cannot be empty", "error");
    openConfigureSuppliersModal();
    return;
  }
  if (trimmedValue === allSuppliers[index]) {
    return; // No change
  }
  if (allSuppliers.some((sup, i) => i !== index && sup === trimmedValue)) {
    showAlert("Supplier already exists", "error");
    openConfigureSuppliersModal();
    return;
  }
  allSuppliers[index] = trimmedValue;
  saveSuppliers();
  loadSuppliersForCategory(selectedCategory);
};

// ==================== MATERIALS FUNCTIONS ====================
async function loadMaterials() {
  try {
    // Ensure columns are initialized before rendering
    if (!materialColumns || materialColumns.length === 0) {
      initMaterialColumns();
    }
    if (!materialColumns2 || materialColumns2.length === 0) {
      await initMaterialColumns2();
    }
    
    // Load suppliers
    await loadSuppliers();
    
    const snap = await getDocs(collection(db, "materials"));
    allMaterials = [];
    snap.forEach(doc => {
      allMaterials.push({ id: doc.id, ...doc.data() });
    });
    updateWarehouseFilters();
    await loadCategories();
    updateCategoryTabs();
    
    // ALWAYS render both tabs to keep them in sync
    const stockTab = document.getElementById("stock-monitoring");
    const materialsTab = document.getElementById("materials");
    const isStockMonitoringTab = stockTab && stockTab.style.display !== "none";
    const isMaterialsTab = materialsTab && materialsTab.style.display !== "none";
    
    // Render whichever tab is active
    if (isStockMonitoringTab) {
      renderMaterials("all");
      updateMaterialSummaries();
    }
    
    if (isMaterialsTab) {
      renderMaterials2("all");
      updateMaterialSummaries2();
    }
    
    updateWarehouseChart();
    updateWeeklyStockChart();
    
    // Update today's stock data whenever materials are loaded
    // Load and initialize daily stock data
    await loadStockChartDailyData();
    await updateDailyStockData();
    updateWeeklyStockChart();
    startMidnightStockUpdate();
  } catch (err) {
    console.error("Error loading materials:", err);
  }
}

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
}


// ==================== CHART FUNCTIONS ====================
let warehouseChartInstance = null;

function updateWarehouseChart() {
  const canvas = document.getElementById("warehouseChart");
  if (!canvas) return;

  // Count materials by warehouse
  const warehouseData = {};
  allMaterials.forEach(mat => {
    const wh = mat.warehouse || "Unassigned";
    warehouseData[wh] = (warehouseData[wh] || 0) + parseInt(mat.quantity || 0);
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
  
  allWarehouses.forEach((wh, idx) => {
    const id = wh.id;
    labels.push(wh.name);
    data.push(warehouseData[id] || 0);
  });

  // Destroy previous chart if it exists
  if (warehouseChartInstance) {
    warehouseChartInstance.destroy();
  }

  // Create new PIE chart
  const ctx = canvas.getContext("2d");
  warehouseChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels.length > 0 ? labels : ["No Data"],
      datasets: [{
        data: data.length > 0 ? data : [1],
        backgroundColor: colors.slice(0, Math.max(labels.length, 1)),
        borderColor: "#0f1419",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d0d0d0",
            font: { size: 12, weight: "600" },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return context.label + ": " + value + " units (" + percentage + "%)";
            }
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "#666",
          borderWidth: 1
        }
      }
    }
  });
}

let stockStatusChartInstance = null;
let stockChartDailyData = {}; // Store daily stock data {date: {day: 'Thu', stock: 7607}}
let stockChartMidnightInterval = null; // Store interval reference

async function loadStockChartDailyData() {
  try {
    // Load from Firestore (primary source)
    const dailyDataRef = collection(db, "dailyStockData");
    const q = query(dailyDataRef);
    const querySnapshot = await getDocs(q);
    
    stockChartDailyData = {};
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.date) {
        stockChartDailyData[data.date] = {
          day: data.day,
          stock: data.stock,
          date: data.date
        };
      }
    });
    
    console.log("Loaded stock chart daily data from Firestore:", stockChartDailyData);
  } catch (e) {
    console.error("Error loading from Firestore, falling back to localStorage:", e);
    
    // Fallback to localStorage if Firestore fails
    const savedData = localStorage.getItem("stockChartDailyData");
    if (savedData) {
      try {
        stockChartDailyData = JSON.parse(savedData);
        console.log("Loaded stock chart daily data from localStorage:", stockChartDailyData);
      } catch (err) {
        console.error("Error loading chart data from localStorage:", err);
        stockChartDailyData = {};
      }
    } else {
      stockChartDailyData = {};
    }
  }
}

async function saveStockChartDailyData() {
  // Clean up data older than 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  // Save to localStorage as backup
  const dataToSave = { ...stockChartDailyData };
  Object.keys(dataToSave).forEach(dateStr => {
    const dataDate = new Date(dateStr + 'T00:00:00Z'); // Parse as UTC
    if (dataDate < thirtyDaysAgo) {
      delete dataToSave[dateStr];
    }
  });
  
  localStorage.setItem("stockChartDailyData", JSON.stringify(dataToSave));
  
  // Save each day to Firestore
  try {
    for (const [dateStr, data] of Object.entries(dataToSave)) {
      const dataDate = new Date(dateStr + 'T00:00:00Z');
      if (dataDate >= thirtyDaysAgo) {
        await setDoc(doc(db, "dailyStockData", dateStr), {
          date: dateStr,
          day: data.day,
          stock: data.stock,
          timestamp: new Date(dateStr).getTime()
        });
      }
    }
    console.log("Saved stock chart daily data to Firestore:", dataToSave);
  } catch (e) {
    console.error("Error saving to Firestore:", e);
  }
}

function getTodayDateString() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}

async function updateDailyStockData() {
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
    
    // Save to localStorage and Firestore immediately
    await saveStockChartDailyData();
    
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
  updateDailyStockData().catch(e => console.error("Error updating daily stock:", e));
  updateWeeklyStockChart();
  
  // Calculate time until next midnight
  const timeUntilMidnight = getNextMidnightTime();
  
  // Set timeout for next midnight
  setTimeout(() => {
    console.log("Midnight reached - capturing daily stock data");
    updateDailyStockData().catch(e => console.error("Error updating daily stock:", e));
    updateWeeklyStockChart();
    
    // After midnight, set up the daily interval
    stockChartMidnightInterval = setInterval(() => {
      console.log("Daily midnight - capturing stock data");
      updateDailyStockData().catch(e => console.error("Error updating daily stock:", e));
      updateWeeklyStockChart();
    }, 24 * 60 * 60 * 1000); // Every 24 hours (86400000 milliseconds)
  }, timeUntilMidnight);
  
  console.log(`Stock chart midnight update scheduled in ${Math.round(timeUntilMidnight / 1000 / 60)} minutes`);
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

function updateStockStatusChart() {
  const canvas = document.getElementById("stockStatusChart");
  if (!canvas) return;

  // Categorize materials by stock status
  let highStock = 0;
  let mediumStock = 0;
  let lowStock = 0;

  allMaterials.forEach(mat => {
    const qty = parseInt(mat.quantity || 0);
    const minQty = parseInt(mat.minimumQuantity || 0);
    
    if (qty >= minQty * 1.5) {
      highStock += qty;
    } else if (qty >= minQty) {
      mediumStock += qty;
    } else {
      lowStock += qty;
    }
  });

  if (stockStatusChartInstance) {
    stockStatusChartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");
  stockStatusChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["High Stock", "Medium Stock", "Low Stock"],
      datasets: [{
        data: [highStock, mediumStock, lowStock],
        backgroundColor: [
          "rgba(76, 175, 80, 0.8)",
          "rgba(255, 152, 0, 0.8)",
          "rgba(244, 67, 54, 0.8)"
        ],
        borderColor: "#0f1419",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#d0d0d0",
            font: { size: 12, weight: "600" },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return context.label + ": " + value + " units (" + percentage + "%)";
            }
          },
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "#666",
          borderWidth: 1
        }
      }
    }
  });
}

function updateTopItems() {
  const topItemsList = document.getElementById("topItemsList");
  if (!topItemsList) return;

  // Sort materials by quantity (descending) and take top 5
  const topItems = [...allMaterials]
    .sort((a, b) => parseInt(b.quantity || 0) - parseInt(a.quantity || 0))
    .slice(0, 5);

  if (topItems.length === 0) {
    topItemsList.innerHTML = '<p style="color:#a0a0a0;text-align:center;">No items found</p>';
    return;
  }

  topItemsList.innerHTML = topItems.map((item, idx) => `
    <div style="padding:12px;border-bottom:1px solid rgba(10,155,3,0.2);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="color:#0a9b03;font-weight:600;">${idx + 1}. ${item.itemCode || "N/A"}</div>
        <div style="color:#a0a0a0;font-size:12px;margin-top:4px;">${item.materialName || "N/A"}</div>
      </div>
      <div style="background:rgba(10,155,3,0.2);padding:6px 12px;border-radius:6px;color:#0a9b03;font-weight:600;font-size:14px;">
        ${item.quantity || 0} units
      </div>
    </div>
  `).join("");
}

function updateLowStockItems() {
  const lowStockList = document.getElementById("lowStockList");
  if (!lowStockList) return;

  // Filter items with low stock
  const lowItems = allMaterials.filter(item => {
    const qty = parseInt(item.quantity || 0);
    const minQty = parseInt(item.minimumQuantity || 0);
    return qty < minQty;
  });

  if (lowItems.length === 0) {
    lowStockList.innerHTML = '<p style="color:#0a9b03;text-align:center;padding:20px;">✓ All items have sufficient stock!</p>';
    return;
  }

  lowStockList.innerHTML = lowItems.map((item) => `
    <div style="padding:12px;border-bottom:1px solid rgba(255,107,107,0.2);border-left:4px solid #ff6b6b;">
      <div style="color:#ffffff;font-weight:600;margin-bottom:4px;">${item.itemCode} - ${item.materialName || "N/A"}</div>
      <div style="color:#a0a0a0;font-size:12px;">
        Current: <span style="color:#ff6b6b;font-weight:600;">${item.quantity || 0}</span> / Min: ${item.minimumQuantity || 0}
      </div>
    </div>
  `).join("");
}

// ==================== STOCK MOVEMENT LOGGING ====================
async function logStockMovement(materialId, warehouseId, type, quantity, details = {}) {
  try {
    const movementData = {
      materialId: materialId,
      warehouseId: warehouseId,
      date: new Date().toISOString(),
      type: type, // "add", "transfer_out", "transfer_in", "adjustment", "delete"
      quantity: quantity,
      notes: details.notes || "",
      fromWarehouse: details.fromWarehouse || null,
      toWarehouse: details.toWarehouse || null,
      createdBy: currentUser?.email || "system",
      createdAt: new Date().toISOString()
    };

    // Add to stock_movements collection
    await addDoc(collection(db, "stock_movements"), movementData);
    console.log("Stock movement logged:", movementData);
  } catch (err) {
    console.error("Error logging stock movement:", err);
  }
}

// ==================== MONTHLY SNAPSHOTS ====================
async function createMonthlySnapshot(year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    // Get all movements for this month
    const movementsQuery = query(
      collection(db, "stock_movements"),
      where("date", ">=", startDate.toISOString()),
      where("date", "<=", endDate.toISOString())
    );
    
    const movementsSnap = await getDocs(movementsQuery);
    const movements = [];
    movementsSnap.forEach(doc => movements.push(doc.data()));
    
    // Group movements by material and warehouse
    const snapshotsByKey = {};
    
    movements.forEach(movement => {
      const key = `${movement.materialId}_${movement.warehouseId}`;
      if (!snapshotsByKey[key]) {
        snapshotsByKey[key] = {
          year: year,
          month: month,
          materialId: movement.materialId,
          warehouseId: movement.warehouseId,
          totalAdded: 0,
          totalRemoved: 0,
          totalAdjustment: 0,
          movementCount: 0
        };
      }
      
      const snapshot = snapshotsByKey[key];
      snapshot.movementCount++;
      
      if (movement.type === "add" || movement.type === "transfer_in") {
        snapshot.totalAdded += Math.max(0, movement.quantity);
      } else if (movement.type === "delete" || movement.type === "transfer_out") {
        snapshot.totalRemoved += Math.abs(Math.min(0, movement.quantity));
      } else if (movement.type === "adjustment") {
        if (movement.quantity > 0) {
          snapshot.totalAdded += movement.quantity;
        } else {
          snapshot.totalRemoved += Math.abs(movement.quantity);
        }
      }
    });
    
    // Save snapshots for each material-warehouse combo
    const documentIds = [];
    for (const key in snapshotsByKey) {
      const snapshot = snapshotsByKey[key];
      const material = allMaterials.find(m => m.id === snapshot.materialId);
      
      // Get beginning quantity (need to query previous movements)
      const beforeDate = new Date(year, month - 1, 1);
      const beforeQuery = query(
        collection(db, "stock_movements"),
        where("materialId", "==", snapshot.materialId),
        where("warehouseId", "==", snapshot.warehouseId),
        where("date", "<", beforeDate.toISOString())
      );
      const beforeSnap = await getDocs(beforeQuery);
      let beginningQty = 0;
      if (material) {
        beginningQty = parseInt(material.quantity) || 0;
      }
      
      snapshot.beginningQty = beginningQty;
      snapshot.endingQty = Math.max(0, beginningQty + snapshot.totalAdded - snapshot.totalRemoved);
      snapshot.createdAt = new Date().toISOString();
      
      const docRef = await addDoc(collection(db, "monthly_snapshots"), snapshot);
      documentIds.push(docRef.id);
      console.log("Monthly snapshot created:", snapshot);
    }
    
    return documentIds;
  } catch (err) {
    console.error("Error creating monthly snapshot:", err);
    return [];
  }
}

function renderMaterialsWithFilter(warehouse, searchQuery = "", statusFilter = "") {
  // Rebuild the table header based on materialColumns configuration
  const stockMonitoringTable = document.querySelector("#stock-monitoring table thead tr");
  if (stockMonitoringTable) {
    stockMonitoringTable.innerHTML = "";
    materialColumns.forEach(col => {
      stockMonitoringTable.innerHTML += `<th>${col.name}</th>`;
    });
    // Add Actions column
    stockMonitoringTable.innerHTML += `<th>Actions</th>`;
    console.log("Stock Monitoring table header rebuilt with columns:", materialColumns.map(c => c.name));
  }

  const inventoryBody = document.getElementById("inventoryBody");
  if (!inventoryBody) return;
  inventoryBody.innerHTML = "";
  
  // Group materials by itemCode + material name to deduplicate (same material in different warehouses)
  const groupedMaterials = {};
  
  allMaterials.forEach(mat => {
    // Stock Monitoring only shows materials that have been added to stock (have itemCode, material, AND warehouse, and quantity > 0)
    const quantity = parseInt(mat.quantity) || 0;
    if (!mat.itemCode || !mat.material || !mat.warehouse || quantity === 0) return;
    
    // Filter by selected warehouse (if not "all")
    if (warehouse !== "all" && mat.warehouse !== warehouse) return;
    
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesItemCode = mat.itemCode && mat.itemCode.toLowerCase().includes(searchLower);
      const matchesMaterial = mat.material && mat.material.toLowerCase().includes(searchLower);
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
        specs: mat.specsbrand || mat.specs || mat.specification || "",
        specification: mat.specification || mat.specs || mat.specsbrand || "",
        category: mat.category,
        whloc: mat.whloc || "",
        warehouse: mat.warehouse,
        // Copy ALL properties from the original material record
        ...mat,
        totalQuantity: 0
      };
    }
    
    // Sum quantities across all warehouses
    groupedMaterials[key].totalQuantity += parseInt(mat.quantity) || 0;
  });
  
  // Render deduplicated materials - sorted by item code
  Object.values(groupedMaterials)
    .sort((a, b) => {
      const aCode = parseInt(a.itemCode) || 0;
      const bCode = parseInt(b.itemCode) || 0;
      return aCode - bCode;
    })
    .forEach(mat => {
    const quantity = mat.totalQuantity;
    const status = quantity <= 10 ? "LOW" : "OK";
    if (statusFilter && status !== statusFilter) return;
    const statusClass = status === "LOW" ? "status-low" : "status-ok";

    let row = `<tr>`;

    // Add columns based on materialColumns configuration
    materialColumns.forEach(col => {
      if (col.name === "Item Code") {
        row += `<td>${mat.itemCode || "-"}</td>`;
      } else if (col.name === "Material") {
        row += `<td>${mat.material || "-"}</td>`;
      } else if (col.name === "Description") {
        row += `<td>${mat.description || "-"}</td>`;
      } else if (col.name === "Specification") {
        row += `<td>${mat.specification || mat.specs || "-"}</td>`;
      } else if (col.name === "Category") {
        row += `<td>${mat.category || "-"}</td>`;
      } else if (col.name === "Wh Loc") {
        // Fetch warehouse location from allWarehouses using warehouse ID
        const warehouseData = allWarehouses.find(w => w.id === mat.warehouse);
        const whLoc = mat.whloc || warehouseData?.location || warehouseData?.code || "-";
        row += `<td>${whLoc}</td>`;
      } else if (col.name === "Warehouse" || col.name === "Project") {
        const warehouseName = allWarehouses.find(w => w.id === mat.warehouse)?.name || mat.warehouse || "-";
        row += `<td>${warehouseName}</td>`;
      } else if (col.name === "Quantity") {
        row += `<td>${quantity || "0"}</td>`;
      } else if (col.name === "Expiry Date") {
        const expiryDate = mat.expiryDate ? new Date(mat.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "-";
        row += `<td>${expiryDate}</td>`;
      } else if (col.name === "Status") {
        row += `<td><span class="${statusClass}"><i class="fa-solid fa-${status === 'LOW' ? 'exclamation' : 'check'}"></i> ${status}</span></td>`;
      } else if (col.name === "Specs / Brand") {
        row += `<td>${mat.specification || mat.specs || "-"}</td>`;
      } else if (col.name === "Cost" || col.name?.toUpperCase() === "COST" || col.name?.trim().toUpperCase() === "COST") {
        const costValue = mat.cost ? '₱' + parseFloat(mat.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "₱0.00";
        row += `<td style="text-align:center;">${costValue}</td>`;
      } else {
        const normalizedKey = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Special handling for cost field - always format with peso sign
        if (normalizedKey === 'cost') {
          const costValue = mat.cost ? '₱' + parseFloat(mat.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "₱0.00";
          row += `<td style="text-align:center;">${costValue}</td>`;
        } else {
          row += `<td>${mat[normalizedKey] || "-"}</td>`;
        }
      }
    });
    
    // Always add actions column
    row += `
        <td>
          <div class="action-buttons">
            <button class="btn-edit" onclick="editMaterial('${mat.id}')">Edit</button>
            <button class="btn-delete" onclick="deleteMaterial('${mat.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
    
    inventoryBody.innerHTML += row;
  });
  
  // Update summary cards for this warehouse
  updateMaterialSummaries(warehouse);
}

function renderMaterials(warehouse, searchQuery = "") {
  renderMaterialsWithFilter(warehouse, searchQuery, "");
}

function renderMaterialsWithFilter2(warehouse, searchQuery = "", statusFilter = "") {
  console.log("=== renderMaterialsWithFilter2 called ===");
  console.log("selectedCategory:", selectedCategory);
  console.log("materialColumns2:", materialColumns2);
  
  // Ensure materialColumns2 is initialized
  if (!materialColumns2 || materialColumns2.length === 0) {
    console.warn("materialColumns2 is empty! Using default columns");
    setDefaultMaterialColumns2();
  }
  
  // First, rebuild the header based on materialColumns2 configuration
  const materialsTable = document.querySelector("#materials table thead tr");
  if (materialsTable) {
    console.log("Rebuilding table header with columns:", materialColumns2);
    materialsTable.innerHTML = "";
    materialColumns2.forEach(col => {
      // Skip warehouse column for Materials tab
      if (col.name === "Warehouse") return;
      materialsTable.innerHTML += `<th>${col.name}</th>`;
    });
    // Add Actions column
    materialsTable.innerHTML += `<th>Actions</th>`;
    console.log("Table header rebuilt successfully. Columns rendered:", materialColumns2.map(c => c.name));
  } else {
    console.warn("Materials table header not found - selector '#materials table thead tr' failed");
  }

  const inventoryBody = document.getElementById("inventoryBody2");
  if (!inventoryBody) return;
  inventoryBody.innerHTML = "";
  
  // Group materials by material name to deduplicate (same material in different warehouses)
  const groupedMaterials = {};
  
  allMaterials.forEach(mat => {
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesItemCode = mat.itemCode && mat.itemCode.toLowerCase().includes(searchLower);
      const matchesMaterial = mat.material && mat.material.toLowerCase().includes(searchLower);
      if (!matchesItemCode && !matchesMaterial) return;
    }
    
    // Filter by category - only show materials in the selected category
    if (!mat.category || mat.category !== selectedCategory) {
      console.log("Filtering out material:", mat.material, "category:", mat.category, "selectedCategory:", selectedCategory);
      return;
    }
    
    // Create key using itemCode + material + specification to keep different specs separate
    const key = `${mat.itemCode}_${mat.material}_${mat.specification || "-"}`;
    
    if (!groupedMaterials[key]) {
      // Copy all material properties, not just specific ones
      groupedMaterials[key] = {
        id: mat.id,
        itemCode: mat.itemCode,
        material: mat.material,
        description: mat.description,
        category: mat.category,
        specification: mat.specification || mat.specs || "",
        brand: mat.brand || "",
        specs: mat.specsbrand || mat.specs,
        "specsbrand": mat.specsbrand || mat.specs,
        supplier: mat.supplier,
        unit: mat.unit,
        whloc: mat.whloc,
        trade: mat.trade,
        warehouse: mat.warehouse,
        totalQuantity: 0,
        // Copy all custom columns (any additional properties not listed above)
        ...Object.keys(mat).reduce((acc, key) => {
          if (!["id", "itemCode", "material", "description", "category", "specification", "brand", "specs", "specsbrand", "supplier", "unit", "whloc", "trade", "warehouse", "quantity", "status", "createdAt", "updatedAt"].includes(key)) {
            acc[key] = mat[key];
          }
          return acc;
        }, {})
      };
    }
    
    // Sum quantities across all warehouses
    groupedMaterials[key].totalQuantity += parseInt(mat.quantity) || 0;
  });
  
  // Convert to array and sort by item code
  filteredMaterialsList = Object.values(groupedMaterials).sort((a, b) => {
    const aCode = parseInt(a.itemCode) || 0;
    const bCode = parseInt(b.itemCode) || 0;
    return aCode - bCode;
  });
  
  // Calculate pagination
  totalPages = Math.ceil(filteredMaterialsList.length / itemsPerPage);
  if (currentPage > totalPages) {
    currentPage = Math.max(1, totalPages);
  }
  
  console.log("Pagination calculated - filteredMaterialsList.length:", filteredMaterialsList.length, "itemsPerPage:", itemsPerPage, "totalPages:", totalPages, "currentPage:", currentPage);
  
  // Get materials for current page
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedMaterials = filteredMaterialsList.slice(startIdx, endIdx);
  
  // Render materials for current page
  paginatedMaterials.forEach(mat => {
    const quantity = mat.totalQuantity;
    const status = quantity <= 10 ? "LOW" : "OK";
    if (statusFilter && status !== statusFilter) return;
    const statusClass = status === "LOW" ? "status-low" : "status-ok";
    
    let row = `<tr>`;
    
    // Add columns based on materialColumns2 configuration (skip Warehouse column)
    materialColumns2.forEach(col => {
      // Skip warehouse column for Materials tab
      if (col.name === "Warehouse") return;
      
      if (col.name === "Item Code") {
        row += `<td>${mat.itemCode || "-"}</td>`;
      } else if (col.name === "Material") {
        row += `<td>${mat.material || "-"}</td>`;
      } else if (col.name === "Description") {
        row += `<td>${mat.description || "-"}</td>`;
      } else if (col.name === "Category") {
        row += `<td>${mat.category || "-"}</td>`;
      } else if (col.name === "Specification") {
        row += `<td>${mat.specification || "-"}</td>`;
      } else if (col.name === "Brand") {
        row += `<td>${mat.brand || "-"}</td>`;
      } else if (col.name === "Trade") {
        row += `<td>${mat.trade || "-"}</td>`;
      } else if (col.name === "Wh Loc") {
        // Fetch warehouse location from allWarehouses using warehouse ID
        const warehouseData = allWarehouses.find(w => w.id === mat.warehouse);
        const whLoc = mat.whloc || warehouseData?.location || warehouseData?.code || "-";
        row += `<td>${whLoc}</td>`;
      } else if (col.name === "Specs / Brand") {
        row += `<td>${mat.specsbrand || mat.specification || "-"}</td>`;
      } else if (col.name === "Status") {
        row += `<td><span class="${statusClass}"><i class="fa-solid fa-${status === 'LOW' ? 'exclamation' : 'check'}"></i> ${status}</span></td>`;
      } else if (col.name === "Quantity") {
        row += `<td>${quantity || "0"}</td>`;
      } else if (col.name === "Expiry Date") {
        const expiryDate = mat.expiryDate ? new Date(mat.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : "-";
        row += `<td>${expiryDate}</td>`;
      } else if (col.name === "Cost" || col.name?.toUpperCase() === "COST" || col.name?.trim().toUpperCase() === "COST") {
        const costValue = mat.cost ? '₱' + parseFloat(mat.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "₱0.00";
        row += `<td style="text-align:center;">${costValue}</td>`;
      } else {
        const normalizedKey = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Special handling for cost field - always format with peso sign
        if (normalizedKey === 'cost') {
          const costValue = mat.cost ? '₱' + parseFloat(mat.cost).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "₱0.00";
          row += `<td style="text-align:center;">${costValue}</td>`;
        } else {
          row += `<td>${mat[normalizedKey] || "-"}</td>`;
        }
      }
    });
    
    row += `
      <td>
        <div class="action-buttons">
          <button class="btn-edit" onclick="editMaterial('${mat.id}')">Edit</button>
          <button class="btn-delete" onclick="deleteMaterial('${mat.id}')">Delete</button>
        </div>
      </td>
    </tr>
    `;
    
    inventoryBody.innerHTML += row;
  });
  
  // Update pagination controls
  updatePaginationControls();
  
  // Update summary cards for this warehouse
  updateMaterialSummaries2(warehouse);
}

function updatePaginationControls() {
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const pageInfo = document.getElementById("pageInfo");
  
  if (!prevBtn || !nextBtn || !pageInfo) return;
  
  // Update page info text
  pageInfo.textContent = `Page ${currentPage} of ${Math.max(1, totalPages)}`;
  
  // Remove disabled attribute but use visual feedback only
  prevBtn.style.opacity = currentPage === 1 ? "0.5" : "1";
  nextBtn.style.opacity = currentPage >= totalPages ? "0.5" : "1";
  prevBtn.style.cursor = currentPage === 1 ? "not-allowed" : "pointer";
  nextBtn.style.cursor = currentPage >= totalPages ? "not-allowed" : "pointer";
  prevBtn.style.pointerEvents = currentPage === 1 ? "none" : "auto";
  nextBtn.style.pointerEvents = currentPage >= totalPages ? "none" : "auto";
}

window.goToPrevPage = function() {
  if (currentPage > 1) {
    currentPage--;
    renderMaterialsWithFilter2("all", document.getElementById("searchMaterial2")?.value || "", "");
    updatePaginationControls();
  }
};

window.goToNextPage = function() {
  if (currentPage < totalPages) {
    currentPage++;
    renderMaterialsWithFilter2("all", document.getElementById("searchMaterial2")?.value || "", "");
    updatePaginationControls();
  }
};

function renderMaterials2(warehouse, searchQuery = "") {
  console.log("renderMaterials2 called with warehouse:", warehouse, "searchQuery:", searchQuery);
  currentPage = 1; // Reset to first page on new search/filter
  console.log("Reset currentPage to 1");
  renderMaterialsWithFilter2(warehouse, searchQuery, "");
}

function updateMaterialSummaries2(warehouse = "all") {
  let total = 0, items = 0, low = 0, nearExpire = 0;
  
  // Group materials by itemCode + material to deduplicate (same material in different warehouses)
  const groupedMaterials = {};
  
  allMaterials.forEach(mat => {
    // Only count materials with proper data
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
        totalQuantity: 0,
        expiryDate: mat.expiryDate
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
  
  // For low stock and near-expiry: check the materials
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
    
    // Count if near to expire (within 30 days from today) AND warehouse still exists
    if (mat.expiryDate) {
      try {
        // Only count if warehouse still exists
        const warehouseExists = allWarehouses.some(w => w.id === mat.warehouse);
        if (!warehouseExists) {
          console.warn(`⚠️ Material ${mat.itemCode} warehouse deleted, not counting in near-expire`);
          return;
        }
        
        const expiryDate = new Date(mat.expiryDate);
        const today = new Date();
        
        // Set time to midnight for accurate day calculation
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        console.log(`Material: ${mat.material}, ExpiryDate: ${expiryDate.toLocaleDateString()}, Today: ${today.toLocaleDateString()}, Days: ${daysUntilExpiry}`);
        
        // Expired (0 or negative) OR coming up soon (1-30 days)
        if (daysUntilExpiry <= 30) {
          nearExpire++;
        }
      } catch (e) {
        console.error("Error parsing expiry date for", mat.material, ":", e);
      }
    }
  });
  
  // Update all summary card elements (visible in all tabs)
  document.getElementById("matTotalStock") && (document.getElementById("matTotalStock").textContent = total);
  document.getElementById("matTotalItems") && (document.getElementById("matTotalItems").textContent = items);
  document.getElementById("matLowStock") && (document.getElementById("matLowStock").textContent = low);
  document.getElementById("matNearExpire") && (document.getElementById("matNearExpire").textContent = nearExpire);
  document.getElementById("dashTotalStock") && (document.getElementById("dashTotalStock").textContent = total);
  document.getElementById("dashTotalItems") && (document.getElementById("dashTotalItems").textContent = items);
  document.getElementById("dashLowStock") && (document.getElementById("dashLowStock").textContent = low);
  document.getElementById("dashNearExpire") && (document.getElementById("dashNearExpire").textContent = nearExpire);
}

function renderMaterialForm(material = null) {
  const formFields = document.getElementById("materialFormFields");
  if (!formFields) return;
  formFields.innerHTML = "";

  const cols = usingMaterialColumns2 ? materialColumns2 : materialColumns;
  const isStockMonitoringTab = !usingMaterialColumns2;

  // For Stock Monitoring tab, show material selection dropdown ONLY when adding new stock
  if (isStockMonitoringTab) {
    // Show all materials but group by unique itemCode + material (not warehouse)
    const uniqueMaterials = {};
    allMaterials.forEach(mat => {
      const key = `${mat.itemCode}_${mat.material}`;
      if (!uniqueMaterials[key]) {
        uniqueMaterials[key] = mat;
      }
    });
    const cleanMaterials = Object.values(uniqueMaterials);
    
    // STOCK TAB: Simple single column layout
    const isEditing = material && material.id;
    let formHTML = `
      <div style="padding:15px 20px;display:flex;flex-direction:column;gap:8px;">
        <div>
          <label style="color:#0a9b03;font-weight:600;font-size:11px;display:block;margin-bottom:3px;text-transform:uppercase;">Search Material * (${cleanMaterials.length} available)</label>
          <div id="materialSelectGroup" style="position:relative;">
            <input type="text" id="materialSearchInput" placeholder="Enter item code or name..." style="width:100%;padding:12px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:13px;box-sizing:border-box;">
            <div id="materialSearchDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:rgba(15,30,53,0.98);border:1px solid rgba(10,155,3,.3);border-radius:0 0 6px 6px;max-height:240px;overflow-y:auto;z-index:2000;"></div>
            <input type="hidden" id="selectedMaterialId" value="">
            <div id="selectedMaterialDisplay" style="margin-top:3px;padding:10px;background:rgba(10,155,3,.15);border-left:3px solid #0a9b03;border-radius:4px;color:#0a9b03;font-weight:600;font-size:12px;">Select a material</div>
          </div>
        </div>

        <div>
          <label style="color:#0a9b03;font-weight:600;font-size:11px;display:block;margin-bottom:3px;text-transform:uppercase;">Project${isEditing ? '' : ' *'}</label>
          <select id="matwarehouse" ${isEditing ? '' : 'required'} style="width:100%;padding:12px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:13px;box-sizing:border-box;">
            <option value="">Select project</option>
          </select>
        </div>

        <div>
          <label style="color:#0a9b03;font-weight:600;font-size:11px;display:block;margin-bottom:3px;text-transform:uppercase;">Quantity *</label>
          <input type="number" id="matquantity" placeholder="Enter quantity" required style="width:100%;padding:12px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:13px;box-sizing:border-box;" onchange="updateQuantityDelta()">
        </div>
      </div>
    `;
    
    formFields.innerHTML = formHTML;
    
    // Populate warehouse dropdown
    const warehouseSelect = document.getElementById("matwarehouse");
    if (warehouseSelect) {
      allWarehouses.forEach(wh => {
        const option = document.createElement("option");
        option.value = wh.id;
        option.textContent = wh.name;
        warehouseSelect.appendChild(option);
      });
    }
    
    // Add material search functionality
    setTimeout(() => {
      const searchInput = document.getElementById("materialSearchInput");
      const searchDropdown = document.getElementById("materialSearchDropdown");
      const selectedIdInput = document.getElementById("selectedMaterialId");
      const displayDiv = document.getElementById("selectedMaterialDisplay");
      
      if (!searchInput || !searchDropdown) return;
      
      function performSearch(query) {
        if (!searchDropdown) return;
        searchDropdown.innerHTML = "";
        
        if (!query.trim()) {
          searchDropdown.style.display = "none";
          return;
        }
        
        const searchLower = query.toLowerCase();
        const filtered = cleanMaterials.filter(mat => {
          const matchesCode = mat.itemCode && mat.itemCode.toLowerCase().includes(searchLower);
          const matchesName = mat.material && mat.material.toLowerCase().includes(searchLower);
          return matchesCode || matchesName;
        });
        
        if (filtered.length === 0) {
          searchDropdown.innerHTML = `<div style="padding:12px;color:#a0a0a0;text-align:center;">No materials found</div>`;
          searchDropdown.style.display = "block";
          return;
        }
        
        filtered.forEach(mat => {
          const item = document.createElement("div");
          item.style.cssText = "padding:12px;cursor:pointer;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;transition:all 0.2s;";
          item.textContent = `${mat.itemCode} - ${mat.material}`;
          item.onmouseover = () => {
            item.style.background = "rgba(10,155,3,.2)";
          };
          item.onmouseout = () => {
            item.style.background = "transparent";
          };
          item.onclick = (e) => {
            e.stopPropagation();
            selectedIdInput.value = mat.id;
            searchInput.value = `${mat.itemCode} - ${mat.material}`;
            displayDiv.innerHTML = `✓ Selected: <strong>${mat.itemCode} - ${mat.material}</strong>`;
            
            // Show specs and wh loc if available
            const specText = mat.specification || mat.specs || mat.specsbrand ? ` | Specs: ${mat.specification || mat.specs || mat.specsbrand}` : "";
            const whLocText = mat.whloc ? ` | Wh Loc: ${mat.whloc}` : "";
            
            if (specText || whLocText) {
              displayDiv.innerHTML += `<div style="font-size:11px;margin-top:4px;color:#a0a0a0;">${specText}${whLocText}</div>`;
            }
            
            displayDiv.style.color = "#1dd1a1";
            searchDropdown.style.display = "none";
            
            const warehouseSelect = document.getElementById("matwarehouse");
            if (warehouseSelect) {
              warehouseSelect.value = mat.warehouse;
            }
          };
          searchDropdown.appendChild(item);
        });
        
        searchDropdown.style.display = "block";
      }
      
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          performSearch(e.target.value);
        });
        
        searchInput.addEventListener("focus", () => {
          if (searchInput.value.trim()) {
            performSearch(searchInput.value);
          }
        });
      }
      
      document.addEventListener("click", (e) => {
        const group = document.getElementById("materialSelectGroup");
        if (group && !group.contains(e.target) && searchDropdown) {
          searchDropdown.style.display = "none";
        }
      });
    }, 100);
    
    if (material && material.id) {
      selectedMaterialForStock = material.id;
      setTimeout(() => {
        const searchInput = document.getElementById("materialSearchInput");
        const selectedIdInput = document.getElementById("selectedMaterialId");
        const displayDiv = document.getElementById("selectedMaterialDisplay");
        const qtyInput = document.getElementById("matquantity");
        const warehouseSelect = document.getElementById("matwarehouse");
        
        if (searchInput) {
          selectedIdInput.value = material.id;
          displayDiv.innerHTML = `✓ Selected: <strong>${material.itemCode} - ${material.material || material.description}</strong>`;
          displayDiv.style.color = "#1dd1a1";
          searchInput.value = `${material.itemCode} - ${material.material || material.description}`;
          searchInput.disabled = true;
        }
        
        if (qtyInput) qtyInput.value = material.quantity || "";
        if (warehouseSelect) {
          // Auto-populate the Project field from the material's warehouse
          warehouseSelect.value = material.warehouse || "";
        }
      }, 100);
    }
  } else {
    // MATERIALS TAB: Three column layout - Left 2 columns: Material Info, Right 1 column: Supplier Prices
    let formHTML = `<div style="padding:25px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:25px;">`;
    
    // FIRST COLUMN - First half of Material Info
    formHTML += `<div style="display:flex;flex-direction:column;gap:15px;">`;
    
    const midPoint = Math.ceil((cols.length - 1) / 2); // Exclude Status field
    let fieldCount = 0;
    
    cols.forEach((col, index) => {
      const colName = col.name;
      if (colName === "Status") return;
      
      if (fieldCount >= midPoint) return; // Skip for first column
      
      const fieldId = colName.toLowerCase().replace(/\s+/g, '');
      let inputType = "text";
      if (colName === "Quantity") inputType = "number";
      if (colName === "Expiry Date") inputType = "date";
      
      formHTML += `<div style="display:flex;flex-direction:column;gap:6px;">`;
      formHTML += `<label style="color:#0a9b03;font-weight:600;font-size:11px;text-transform:uppercase;">${colName}</label>`;
      
      if (colName === "Category") {
        formHTML += `<select id="mat${fieldId}" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:14px;box-sizing:border-box;">`;
        formHTML += `<option value="">Select category</option>`;
        allCategories.forEach(cat => {
          formHTML += `<option value="${cat}">${cat}</option>`;
        });
        formHTML += `</select>`;
      } else {
        formHTML += `<input type="${inputType}" id="mat${fieldId}" placeholder="Enter ${colName.toLowerCase()}" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:14px;box-sizing:border-box;${colName !== "Expiry Date" ? "text-transform:uppercase;" : ""}">`;
      }
      formHTML += `</div>`;
      fieldCount++;
    });
    
    formHTML += `</div>`; // End first column
    
    // SECOND COLUMN - Second half of Material Info
    formHTML += `<div style="display:flex;flex-direction:column;gap:15px;">`;
    
    fieldCount = 0;
    cols.forEach((col, index) => {
      const colName = col.name;
      if (colName === "Status") return;
      
      if (fieldCount < midPoint) { // Skip for second column
        fieldCount++;
        return;
      }
      
      const fieldId = colName.toLowerCase().replace(/\s+/g, '');
      let inputType = "text";
      if (colName === "Quantity") inputType = "number";
      if (colName === "Expiry Date") inputType = "date";
      
      formHTML += `<div style="display:flex;flex-direction:column;gap:6px;">`;
      formHTML += `<label style="color:#0a9b03;font-weight:600;font-size:11px;text-transform:uppercase;">${colName}</label>`;
      
      if (colName === "Category") {
        formHTML += `<select id="mat${fieldId}" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:14px;box-sizing:border-box;">`;
        formHTML += `<option value="">Select category</option>`;
        allCategories.forEach(cat => {
          formHTML += `<option value="${cat}">${cat}</option>`;
        });
        formHTML += `</select>`;
      } else if (colName === "Cost") {
        // 🔧 COST field is auto-calculated from supplier prices - make it read-only
        formHTML += `<input type="${inputType}" id="mat${fieldId}" placeholder="Auto-calculated" readonly style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(10,155,3,.2);color:#a0a0a0;border-radius:6px;font-size:14px;box-sizing:border-box;cursor:not-allowed;opacity:0.7;">`;
      } else {
        formHTML += `<input type="${inputType}" id="mat${fieldId}" placeholder="Enter ${colName.toLowerCase()}" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:14px;box-sizing:border-box;${colName !== "Expiry Date" ? "text-transform:uppercase;" : ""}">`;
      }
      formHTML += `</div>`;
      fieldCount++;
    });
    
    formHTML += `</div>`; // End second column
    
    // THIRD COLUMN - Supplier Prices
    formHTML += `<div style="display:flex;flex-direction:column;gap:15px;border-left:2px solid rgba(10,155,3,.2);padding-left:20px;">`;
    
    // Add Cost Display at the top
    formHTML += `<div style="display:flex;flex-direction:column;gap:6px;padding:12px;background:rgba(10,155,3,.15);border:1.5px solid rgba(10,155,3,.4);border-radius:6px;">`;
    formHTML += `<label style="color:#0a9b03;font-weight:600;font-size:11px;text-transform:uppercase;">🟢 Cost (Cheapest)</label>`;
    formHTML += `<div id="matCostDisplay" style="font-size:18px;font-weight:700;color:#1dd1a1;padding:8px 0;">₱0.00</div>`;
    formHTML += `<p style="color:#a0a0a0;font-size:10px;margin:0;">Updates automatically when supplier prices change</p>`;
    formHTML += `</div>`;
    
    if (allSuppliers && allSuppliers.length > 0) {
      allSuppliers.forEach(supplier => {
        const supplierId = supplier.toLowerCase().replace(/\s+/g, '');
        formHTML += `<div style="display:flex;flex-direction:column;gap:6px;">`;
        formHTML += `<label style="color:#0a9b03;font-weight:600;font-size:11px;text-transform:uppercase;">${supplier}</label>`;
        formHTML += `<input type="number" id="matsupplier${supplierId}" placeholder="Enter price (₱)" step="0.01" min="0" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:6px;font-size:14px;box-sizing:border-box;" class="supplierPriceInput">`;
        formHTML += `</div>`;
      });
    } else {
      formHTML += `<p style="color:#a0a0a0;font-size:12px;margin-top:20px;">No suppliers configured for this category.</p>`;
    }
    
    formHTML += `</div>`; // End third column
    formHTML += `</div>`; // End main grid
    
    formFields.innerHTML = formHTML;
    
    // Add real-time cost update functionality with event delegation
    setTimeout(() => {
      const costDisplay = document.getElementById('matCostDisplay');
      const formFieldsContainer = document.getElementById('materialFormFields');
      
      function updateCostDisplay() {
        // Get all current supplier price inputs from the DOM
        const supplierInputs = document.querySelectorAll('.supplierPriceInput');
        const costInputField = document.getElementById('matcost');
        let minPrice = Infinity;
        let hasValidPrice = false;
        
        supplierInputs.forEach(input => {
          const price = parseFloat(input.value);
          if (input.value && !isNaN(price) && price > 0) {
            hasValidPrice = true;
            minPrice = Math.min(minPrice, price);
          }
        });
        
        if (costDisplay) {
          if (hasValidPrice) {
            costDisplay.textContent = '₱' + minPrice.toFixed(2);
            costDisplay.style.color = '#1dd1a1';
            // 🔧 ALSO UPDATE THE COST INPUT FIELD with calculated cost
            if (costInputField) {
              costInputField.value = minPrice.toFixed(2);
            }
          } else {
            costDisplay.textContent = '₱0.00';
            costDisplay.style.color = '#a0a0a0';
            if (costInputField) {
              costInputField.value = '';
            }
          }
        }
      }
      
      // Use event delegation on the container to catch all input changes
      if (formFieldsContainer) {
        // Remove old listeners if any
        formFieldsContainer.onclick = null;
        formFieldsContainer.onchange = null;
        formFieldsContainer.oninput = null;
        
        // Add new event listener using event delegation
        formFieldsContainer.addEventListener('input', function(e) {
          if (e.target.classList.contains('supplierPriceInput')) {
            updateCostDisplay();
          }
        }, true);
        
        formFieldsContainer.addEventListener('change', function(e) {
          if (e.target.classList.contains('supplierPriceInput')) {
            updateCostDisplay();
          }
        }, true);
      }
      
      // Initial update
      updateCostDisplay();
      console.log('✅ Real-time cost update listeners attached');
    }, 100);
    
    // Populate values if editing
    if (material) {
      cols.forEach(col => {
        const fieldId = col.name.toLowerCase().replace(/\s+/g, '');
        const inputElement = document.getElementById(`mat${fieldId}`);
        if (inputElement) {
          if (col.name === "Item Code") {
            inputElement.value = material.itemCode || "";
            inputElement.readOnly = true;
          } else if (col.name === "Material") {
            inputElement.value = material.material || "";
          } else if (col.name === "Description") {
            inputElement.value = material.description || "";
            inputElement.readOnly = true;
          } else if (col.name === "Category") {
            inputElement.value = material.category || "";
          } else if (col.name === "Specification") {
            // Check multiple possible field names for specs
            inputElement.value = material.specification || material.specs || material.specsbrand || "";
          } else if (col.name === "Brand") {
            inputElement.value = material.brand || material.supplier || "";
          } else if (col.name === "Wh Loc") {
            // Check for wh loc field
            inputElement.value = material.whloc || material.wh_loc || material.whlocation || "";
          } else if (col.name === "Expiry Date") {
            // Format date for input[type=date]
            if (material.expiryDate) {
              const date = new Date(material.expiryDate);
              const isoString = date.toISOString().split('T')[0];
              inputElement.value = isoString;
            }
          } else {
            const normalizedKey = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const customValue = material[normalizedKey];
            inputElement.value = customValue || "";
          }
        }
      });
      
      // Populate supplier prices if editing
      // 🔧 WAIT for DOM to be ready before populating
      setTimeout(() => {
        if (material && material.supplierprices) {
          try {
            const supplierPrices = JSON.parse(material.supplierprices);
            console.log("📋 Populating supplier prices from material:", supplierPrices);
            Object.keys(supplierPrices).forEach(supplier => {
              const supplierId = supplier.toLowerCase().replace(/\s+/g, '');
              const priceInput = document.getElementById(`matsupplier${supplierId}`);
              if (priceInput) {
                priceInput.value = supplierPrices[supplier] || "";
                console.log(`✓ Set ${supplier} price to ${supplierPrices[supplier]}`);
              } else {
                console.log(`⚠️ Price input not found for supplier: matsupplier${supplierId}`);
              }
            });
            
            // Update the cost display with the current cheapest price
            const costDisplay = document.getElementById('matCostDisplay');
            if (costDisplay && material.cost) {
              costDisplay.textContent = '₱' + parseFloat(material.cost).toFixed(2);
              costDisplay.style.color = '#1dd1a1';
              console.log(`✓ Set cost display to ${material.cost}`);
            }
          } catch (e) {
            console.error("❌ Error parsing supplier prices:", e);
          }
        }
      }, 150); // Give DOM time to render
    }
  }
}

// Helper function to show quantity change delta
window.updateQuantityDelta = function() {
  const qtyInput = document.getElementById("matquantity");
  const deltaDisplay = document.getElementById("qtyDelta");
  
  if (!qtyInput || !deltaDisplay) return;
  
  const newQty = parseInt(qtyInput.value) || 0;
  // Could show delta here if we tracked original quantity
  // For now, just show current input value is valid
  if (newQty > 0) {
    deltaDisplay.style.color = "#0a9b03";
  } else if (newQty === 0) {
    deltaDisplay.style.color = "#ff9800";
  }
};

async function openMaterialModal(material = null) {
  updateWarehouseDropdowns();  // ADD THIS LINE - refresh dropdown when modal opens
  
  // 🔧 FIX: If editing a material, load suppliers for that material's category FIRST - AND WAIT
  if (material && material.category) {
    console.log("📥 Loading suppliers for category:", material.category);
    await loadSuppliersForCategory(material.category);
    console.log("✅ Suppliers loaded, allSuppliers now has:", allSuppliers.length, "suppliers");
  }
  
  renderMaterialForm(material);  // Generate form fields dynamically
  
  const modal = document.getElementById("materialModal");
  const modalContent = document.getElementById("materialModalContent");
  const form = document.getElementById("materialForm");
  const toggle = document.getElementById("materialChoiceToggle");
  
  // Adjust modal width based on whether it's Stock Monitoring or Materials tab
  if (modalContent) {
    if (usingMaterialColumns2) {
      // Materials tab - wide modal (3 columns)
      modalContent.style.maxWidth = "1200px";
    } else {
      // Stock Monitoring - narrow modal (2 columns: search + supplier prices)
      modalContent.style.maxWidth = "700px";
    }
  }
  
  // Hide supplier prices header for Stock Monitoring, show for Materials tab
  const supplierPricesHeader = document.getElementById("supplierPricesHeader");
  if (supplierPricesHeader) {
    supplierPricesHeader.style.display = usingMaterialColumns2 ? "flex" : "none";
  }
  
  // SHOW toggle ONLY for Stock Monitoring EDIT (when not using materialColumns2 AND editing), HIDE for ADD and Materials tab
  if (toggle) {
    toggle.style.display = (usingMaterialColumns2 || !material) ? "none" : "flex";
  }
  
  if (material) {
    document.getElementById("materialModalTitle").textContent = usingMaterialColumns2 ? "Edit Material" : "Edit Stock";
    editingMaterialId = material.id;
  } else {
    document.getElementById("materialModalTitle").textContent = usingMaterialColumns2 ? "Add Material" : "Add Stock";
    form.reset();
    editingMaterialId = null;
    
    // For Materials tab, pre-fill category with currently selected category
    if (usingMaterialColumns2) {
      setTimeout(() => {
        const categorySelect = document.getElementById("matcategory");
        console.log("Pre-filling category field. selectedCategory:", selectedCategory, "Found element:", categorySelect);
        if (categorySelect && selectedCategory) {
          categorySelect.value = selectedCategory;
          console.log("Category pre-filled with:", selectedCategory);
        }
      }, 50);
    }
  }
  modal.style.display = "flex";
  
  // CRITICAL: Add listener to warehouse dropdown to update selectedMaterialId
  // When user changes warehouse, find the correct material record for that warehouse
  setTimeout(() => {
    const warehouseSelect = document.getElementById("matwarehouse");
    const selectedIdInput = document.getElementById("selectedMaterialId");
    
    if (warehouseSelect && selectedIdInput && !usingMaterialColumns2) {
      warehouseSelect.addEventListener("change", (e) => {
        const selectedWarehouseId = e.target.value;
        
        if (selectedWarehouseId && selectedIdInput.value) {
          // Find the material record that matches BOTH material ID and warehouse
          // First get the material code/name from the current selected ID
          const currentMaterial = allMaterials.find(m => m.id === selectedIdInput.value);
          if (currentMaterial) {
            // Find the matching material in the selected warehouse
            const correctMaterial = allMaterials.find(m => 
              m.material === currentMaterial.material && 
              m.itemCode === currentMaterial.itemCode &&
              m.warehouse === selectedWarehouseId
            );
            
            if (correctMaterial) {
              // Update to the correct material ID for this warehouse
              selectedIdInput.value = correctMaterial.id;
            }
          }
        }
      });
    }
  }, 100);
}

window.editMaterial = (id) => {
  // Fetch FRESH data from database instead of using cached allMaterials
  getDoc(doc(db, "materials", id)).then(async (docSnap) => {
    if (docSnap.exists()) {
      const material = { id: docSnap.id, ...docSnap.data() };
      // Check which tab is currently active
      const materialsTab = document.getElementById("materials");
      const stockTab = document.getElementById("stock-monitoring");
      const isOnMaterialsTab = materialsTab && materialsTab.style.display !== "none";
      usingMaterialColumns2 = isOnMaterialsTab;
      await openMaterialModal(material);
    } else {
      showAlert("Material not found", "error");
    }
  }).catch(err => {
    console.error("Error fetching material:", err);
    showAlert("Error loading material", "error");
  });
};

window.deleteMaterial = async (id) => {
  console.log("Delete button clicked for:", id);
  const material = allMaterials.find(m => m.id === id);
  if (!material) {
    showAlert("❌ Material not found!", "error");
    return;
  }
  
  // Check which tab we're on
  const stockTab = document.getElementById("stock-monitoring");
  const materialsTab = document.getElementById("materials");
  const isStockMonitoringTab = stockTab && stockTab.style.display !== "none";
  const isMaterialsTab = materialsTab && materialsTab.style.display !== "none";
  
  console.log("isStockMonitoringTab:", isStockMonitoringTab, "isMaterialsTab:", isMaterialsTab);
  
  if (isStockMonitoringTab) {
    // Stock Monitoring delete: only remove stock entry, keep material master data
    const confirmed = await showDeleteConfirmCard("Stock Entry", material?.material || "Unknown Material");
    if (!confirmed) {
      console.log("User cancelled delete");
      return;
    }
    try {
      console.log("Deleting stock for:", id);
      const oldQuantity = parseInt(material.quantity) || 0;
      
      // ONLY clear quantity - warehouse stays in Materials tab master list
      await updateDoc(doc(db, "materials", id), {
        quantity: 0
      });
      
      // Log stock movement - delete removes all quantity
      const warehouseName = allWarehouses.find(w => w.id === material.warehouse)?.name || material.warehouse;
      await logStockMovement(id, material.warehouse, "delete", -oldQuantity, {
        notes: `Deleted stock: ${oldQuantity} units removed`
      });
      
      console.log("Stock entry cleared successfully");
      await logActivity("material", "delete_stock", `DELETED Stock - Material: ${material?.material}, Warehouse: ${warehouseName}, Quantity Removed: -${oldQuantity} units, Total Deleted: ${oldQuantity}`);
      showAlert("✅ Stock removed!", "success");
      await loadMaterials();
      renderMaterials("all");
      updateMaterialSummaries();
    } catch (e) {
      console.error("Delete error:", e);
      showAlert("❌ Error: " + e.message, "error");
    }
  } else if (isMaterialsTab) {
    // Materials tab delete: delete entire material completely
    const confirmed = await showDeleteConfirmCard("Material", material?.material || "Unknown Material");
    if (!confirmed) {
      console.log("User cancelled delete");
      return;
    }
    try {
      console.log("Deleting material:", id);
      await deleteDoc(doc(db, "materials", id));
      console.log("Material deleted successfully");
      await logActivity("material", "delete", `Deleted material: ${material?.material}`);
      showAlert("✅ Material deleted!", "success");
      await loadMaterials();
      renderMaterials2("all");
      updateMaterialSummaries2();
      setTimeout(() => {
        updateDailyStockData().catch(e => console.error("Error updating daily stock:", e));
        updateWeeklyStockChart();
      }, 500);
    } catch (e) {
      console.error("Delete error:", e);
      showAlert("❌ Error: " + e.message, "error");
    }
  } else {
    console.warn("No active tab detected");
    showAlert("❌ Could not determine active tab!", "error");
  }
};

// ==================== USER FUNCTIONS ====================
async function loadUsers() {
  try {
    allUsers = [];
    const userBody = document.getElementById("userBody");
    if (!userBody) return;
    userBody.innerHTML = "";

    // Load from all collections
    const collections = ["inventory_users", "warehouse_users", "purchasing_users", "attendance_users"];
    
    for (const collectionName of collections) {
      const snap = await getDocs(collection(db, collectionName));
      snap.forEach(s => {
        const user = { id: s.id, collection: collectionName, ...s.data() };
        allUsers.push(user);
      });
    }

    if (allUsers.length === 0) {
      userBody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:30px; color:#a0a0a0;'>No users yet.</td></tr>";
      return;
    }

    allUsers.forEach(user => {
      const statusClass = user.status === "active" ? "status-active" : "status-disabled";
      const statusText = user.status === "active" ? "✅ Active" : "❌ Disabled";
      userBody.innerHTML += `
        <tr>
          <td>${user.name || "N/A"}</td>
          <td>${user.email || "N/A"}</td>
          <td><strong>${(user.role || "N/A").toUpperCase()}</strong></td>
          <td>${user.role === "admin" ? "N/A" : (user.warehouse || "N/A")}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>
            <div style="position:relative;display:inline-block;">
              <button onclick="toggleDropdown('${user.id}')" style="background: #0b9b038d;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all 0.3s;">
                ⋮ More
              </button>
              <div id="dropdown-${user.id}" style="display:none;position:absolute;top:calc(100% + 8px);right:0;background:linear-gradient(135deg,rgba(26,58,82,0.95) 0%,rgba(11,37,64,0.95) 100%);border:1px solid rgba(10,155,3,0.4);border-radius:8px;min-width:160px;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,0.5);overflow:hidden;backdrop-filter:blur(10px);">
                <button onclick="editUser('${user.id}')" style="width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e0e0e0;cursor:pointer;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:8px;">
                  <span style="color:#0a9b03;">✎</span> Edit
                </button>
                <button onclick="resetUserPassword('${user.id}')" style="width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e0e0e0;cursor:pointer;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:8px;border-top:1px solid rgba(10,155,3,0.2);">
                  <span style="color:#ffa500;">🔑</span> Reset Password
                </button>
                <button onclick="toggleUser('${user.id}', '${user.status}')" style="width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e0e0e0;cursor:pointer;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:8px;border-top:1px solid rgba(10,155,3,0.2);">
                  <span style="color:#15c524;">${user.status === "active" ? "🚫" : "✓"}</span> ${user.status === "active" ? "Disable" : "Enable"}
                </button>
                <button onclick="deleteUser('${user.id}')" style="width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;transition:all 0.2s;display:flex;align-items:center;gap:8px;border-top:1px solid rgba(10,155,3,0.2);">
                  <span>🗑️</span> Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (e) {
    console.error("loadUsers error:", e);
  }
}

window.toggleDropdown = (userId) => {
  const dropdown = document.getElementById(`dropdown-${userId}`);
  document.querySelectorAll("[id^='dropdown-']").forEach(el => {
    if (el.id !== `dropdown-${userId}`) el.style.display = "none";
  });
  dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
};

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
  document.getElementById("userModal").style.display = "flex";
};

window.toggleUser = async (userId, currentStatus) => {
  const action = currentStatus === "active" ? "disable" : "enable";
  const newStatus = currentStatus === "active" ? "disabled" : "active";
  const confirmed = await showDeleteConfirmCard("User", `${allUsers.find(u => u.id === userId)?.email || "this user"}`, action);
  if (!confirmed) return;
  try {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    await updateDoc(doc(db, "users", userId), { status: newStatus, updatedAt: new Date().toISOString() });
    await logActivity("user", "update", `Changed user status to ${newStatus}`);
    showAlert(`✅ User ${newStatus}`, "success");
    loadUsers();
  } catch (e) {
    console.error("toggleUser error:", e);
    showAlert("Error toggling user", "error");
  }
};

// ==================== RESET PASSWORD ====================
window.resetUserPassword = async (userId) => {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const confirmed = await showDeleteConfirmCard("User", user.email, "reset-password");
  if (!confirmed) return;

  try {
    await sendPasswordResetEmail(auth, user.email);
    await logActivity("user", "update", `Password reset email sent to: ${user.email}`);
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
    const collectionName = user?.collection || "inventory_users";
    await deleteDoc(doc(db, collectionName, userId));
    await logActivity("user", "delete", `Deleted user: ${user?.email}`);
    showAlert("✅ User deleted!", "success");
    loadUsers();
  } catch (e) {
    console.error("deleteUser error:", e);
    showAlert("Error deleting user", "error");
  }
};

// ==================== DELIVERY FUNCTIONS ====================

// Fetch delivery status from PO tracking based on delivery items' PO numbers AND material details
async function getLinkedDeliveryStatus(delivery) {
  try {
    console.log('🔍 Fetching linked delivery status for delivery:', delivery.id, 'Items:', delivery.items);
    
    if (!delivery.items || delivery.items.length === 0) {
      console.warn('⚠️ No items in delivery');
      return "No Items";
    }
    
    // Collect items with their PO numbers and material details
    const deliveryItems = delivery.items
      .filter(item => item.poNo && item.poNo.trim() !== '')
      .map(item => ({
        poNo: item.poNo.trim(),
        material: (item.materialName || item.material || '').toLowerCase().trim(),
        itemCode: (item.itemCode || '').toLowerCase().trim(),
        specification: (item.specification || '').toLowerCase().trim(),
        brand: (item.brand || '').toLowerCase().trim()
      }));
    
    console.log('📦 Delivery items for matching:', deliveryItems);
    
    if (deliveryItems.length === 0) {
      console.warn('⚠️ No PO numbers in delivery items');
      return "No PO Data";
    }
    
    // Fetch all projects to get their tracking items
    const projectsRef = collection(db, "projects");
    const projectsSnap = await getDocs(projectsRef);
    
    const deliveryStatuses = [];
    let matchesFound = 0;
    
    projectsSnap.forEach(projectDoc => {
      const project = projectDoc.data();
      if (project.items && Array.isArray(project.items)) {
        project.items.forEach(item => {
          const itemPoNo = (item.poNumber || item.purchaseOrderNo || item.poNo || '').trim();
          
          // Check if this PO matches one of our delivery's PO numbers
          if (itemPoNo) {
            // Find matching delivery item by PO and material details
            const matchingDeliveryItem = deliveryItems.find(delItem => {
              if (delItem.poNo !== itemPoNo) return false;
              
              // Match by material name, item code, or specification
              const itemMaterial = (item.itemDescription || item.description || '').toLowerCase().trim();
              const itemCode = (item.itemCode || item.itemNumber || '').toLowerCase().trim();
              const itemSpec = (item.specification || '').toLowerCase().trim();
              const itemBrand = (item.bestSupplier || item.brand || '').toLowerCase().trim();
              
              // Try to match by various criteria
              const materialMatch = itemMaterial && delItem.material && itemMaterial.includes(delItem.material);
              const codeMatch = itemCode && delItem.itemCode && (itemCode === delItem.itemCode || itemCode.includes(delItem.itemCode) || delItem.itemCode.includes(itemCode));
              const specMatch = itemSpec && delItem.specification && itemSpec.includes(delItem.specification);
              
              console.log(`📍 Comparing PO=${itemPoNo}:`, {
                poMatch: true,
                delMaterial: delItem.material,
                itemMaterial: itemMaterial,
                materialMatch,
                delCode: delItem.itemCode,
                itemCode,
                codeMatch,
                delSpec: delItem.specification,
                itemSpec,
                specMatch
              });
              
              return materialMatch || codeMatch || specMatch;
            });
            
            if (matchingDeliveryItem) {
              matchesFound++;
              console.log('✅ Found matching item in PO tracking:', itemPoNo, 'Item:', item.itemDescription || item.itemNumber);
              
              // Calculate delivery status based on received quantity
              const quantity = parseFloat(item.quantity || item.poQty || 0);
              const receivedQty = parseFloat(item.receivedQty || item.received || 0);
              let status = item.deliveryStatus || 'PENDING';
              
              if (quantity > 0) {
                if (receivedQty >= quantity) {
                  status = 'FULLY RECEIVED';
                } else if (receivedQty > 0) {
                  status = 'PARTIALLY RECEIVED';
                } else {
                  status = 'PENDING';
                }
              }
              
              deliveryStatuses.push({
                poNo: itemPoNo,
                status: status,
                quantity: quantity,
                receivedQty: receivedQty,
                material: matchingDeliveryItem.material
              });
            }
          }
        });
      }
    });
    
    console.log('📊 Delivery statuses found:', deliveryStatuses, 'Total matches:', matchesFound);
    
    if (deliveryStatuses.length === 0) {
      console.warn('⚠️ No matching items found in project tracking');
      return "Not Tracked";
    }
    
    // Summarize statuses:
    const statuses = deliveryStatuses.map(d => d.status);
    const uniqueStatuses = [...new Set(statuses)];
    
    console.log('📋 Unique statuses:', uniqueStatuses);
    
    if (uniqueStatuses.length === 1) {
      // All items have the same status
      const finalStatus = uniqueStatuses[0];
      console.log('✅ Final status (all same):', finalStatus);
      return finalStatus;
    } else {
      // Mixed statuses - return a combination
      const pendingCount = statuses.filter(s => s === 'PENDING').length;
      const partialCount = statuses.filter(s => s === 'PARTIALLY RECEIVED').length;
      const fullCount = statuses.filter(s => s === 'FULLY RECEIVED').length;
      
      if (pendingCount > 0) {
        const result = `${pendingCount} PENDING`;
        console.log('✅ Final status (mixed):', result);
        return result;
      } else if (partialCount > 0) {
        const result = `${partialCount} PARTIAL / ${fullCount} FULL`;
        console.log('✅ Final status (mixed):', result);
        return result;
      }
      
      const result = 'MIXED';
      console.log('✅ Final status (mixed):', result);
      return result;
    }
  } catch (error) {
    console.error('❌ Error fetching linked delivery status:', error);
    return 'Error';
  }
}

function loadDeliveryColumns() {
  const saved = localStorage.getItem(DELIVERY_COLUMNS_KEY);
  const defaultFields = {
    "Date": "date",
    "Warehouse": "warehouse",
    "Control No": "controlNo",
    "Client PO": "clientPO",
    "Items Count": "itemsCount",
    "Type": "type",
    "Status": "status"
  };
  
  if (saved) {
    deliveryColumns = JSON.parse(saved);
    // Ensure all columns have field property by matching original names to fields
    deliveryColumns = deliveryColumns.map((col, idx) => {
      if (!col.field) {
        // Try to find the field by matching id with default column ids
        const defaultColumns = [
          { id: 1, name: "Date", field: "date" },
          { id: 2, name: "Warehouse", field: "warehouse" },
          { id: 3, name: "Control No", field: "controlNo" },
          { id: 4, name: "Client PO", field: "clientPO" },
          { id: 5, name: "Items Count", field: "itemsCount" },
          { id: 6, name: "Type", field: "type" },
          { id: 7, name: "Status", field: "status" }
        ];
        const defaultCol = defaultColumns.find(dc => dc.id === col.id);
        if (defaultCol) {
          col.field = defaultCol.field;
        }
      }
      return col;
    });
    saveDeliveryColumns();
  } else {
    // Default columns for delivery receipt display table (not the form)
    deliveryColumns = [
      { id: 1, name: "Date", field: "date" },
      { id: 2, name: "Warehouse", field: "warehouse" },
      { id: 3, name: "Control No", field: "controlNo" },
      { id: 4, name: "Client PO", field: "clientPO" },
      { id: 5, name: "Items Count", field: "itemsCount" },
      { id: 6, name: "Type", field: "type" },
      { id: 7, name: "Status", field: "status" }
    ];
    saveDeliveryColumns();
  }
  
  // Ensure Status column exists (add if missing)
  if (!deliveryColumns.find(col => col.name === 'Status' || col.field === 'status')) {
    deliveryColumns.push({ id: 7, name: "Status", field: "status" });
    saveDeliveryColumns();
    console.log('✅ Added missing Status column to delivery columns');
  }
  
  renderDeliveryTable();
}

function loadScheduleColumns() {
  const saved = localStorage.getItem(SCHEDULE_COLUMNS_KEY);
  if (saved) {
    scheduleColumns = JSON.parse(saved);
  } else {
    scheduleColumns = [
      { id: 1, name: "Item", field: "item" },
      { id: 2, name: "Quantity", field: "quantity" },
      { id: 3, name: "Date", field: "date" }
    ];
    saveScheduleColumns();
  }
}

function saveDeliveryColumns() {
  localStorage.setItem(DELIVERY_COLUMNS_KEY, JSON.stringify(deliveryColumns));
}

function saveScheduleColumns() {
  localStorage.setItem(SCHEDULE_COLUMNS_KEY, JSON.stringify(scheduleColumns));
}

function renderColumnsConfig() {
  const list = document.getElementById("columnsList");
  if (!list) return;
  list.innerHTML = "";
  deliveryColumns.forEach((col, idx) => {
    list.innerHTML += `
      <div class="delivery-col-item" draggable="true" data-col-idx="${idx}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);cursor:grab;">
        <span style="margin-right:8px;color:#0a9b03;cursor:grab;"><i class="fa-solid fa-grip-vertical"></i></span>
        <input type="text" id="colInput-${idx}" value="${col.name}" data-col-idx="${idx}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onchange="updateDeliveryColumnName(${idx}, this.value)">
        <button type="button" onclick="deleteDeliveryColumn(${idx})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
  });
  setupDeliveryColumnDragDrop();
}

window.deleteDeliveryColumn = (idx) => {
  deliveryColumns.splice(idx, 1);
  saveDeliveryColumns();
  renderColumnsConfig();
};

window.updateDeliveryColumnName = (idx, newName) => {
  if (deliveryColumns[idx]) {
    deliveryColumns[idx].name = newName.trim();
    saveDeliveryColumns();
    renderDeliveryTable();
  }
};

// Schedule Columns Management
function renderScheduleColumnsConfig() {
  const list = document.getElementById("columnsList");
  if (!list) return;
  list.innerHTML = "";
  scheduleColumns.forEach((col, idx) => {
    list.innerHTML += `
      <div class="schedule-col-item" draggable="true" data-col-idx="${idx}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);cursor:grab;">
        <span style="margin-right:8px;color:#0a9b03;cursor:grab;"><i class="fa-solid fa-grip-vertical"></i></span>
        <input type="text" id="schedColInput-${idx}" value="${col.name}" data-col-idx="${idx}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onchange="updateScheduleColumnName(${idx}, this.value)">
        <button type="button" onclick="deleteScheduleColumn(${idx})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
  });
  setupScheduleColumnDragDrop();
}

window.deleteScheduleColumn = (idx) => {
  scheduleColumns.splice(idx, 1);
  saveScheduleColumns();
  renderScheduleColumnsConfig();
};

window.updateScheduleColumnName = (idx, newName) => {
  if (scheduleColumns[idx]) {
    scheduleColumns[idx].name = newName.trim();
    saveScheduleColumns();
    window.renderScheduleTable(allScheduleRecords);
  }
};

// Material Columns Management
function initMaterialColumns() {
  // Load Stock Monitoring columns from Firebase first, then localStorage, then use defaults
  const user = auth.currentUser;
  
  // Try Firebase first
  if (user) {
    try {
      const docRef = doc(db, "columnConfig", "materialColumns");
      getDoc(docRef).then(docSnap => {
        if (docSnap.exists() && docSnap.data().columns) {
          materialColumns = docSnap.data().columns;
          console.log("Stock Monitoring columns loaded from Firebase:", materialColumns);
        } else {
          // Fall back to localStorage
          const saved = localStorage.getItem(MATERIAL_COLUMNS_KEY);
          if (saved) {
            materialColumns = JSON.parse(saved);
            console.log("Stock Monitoring columns loaded from localStorage:", materialColumns);
          } else {
            // Use default columns
            materialColumns = [
              { id: 1, name: "Item Code" },
              { id: 2, name: "Material" },
              { id: 3, name: "Specification" },
              { id: 4, name: "Category" },
              { id: 5, name: "Wh Loc" },
              { id: 6, name: "Project" },
              { id: 7, name: "Status" },
              { id: 8, name: "Quantity" },
              { id: 9, name: "Cost" }
            ];
            console.log("Stock Monitoring columns using defaults");
          }
        }
        renderMaterialTable();
      }).catch(err => {
        console.error("Error loading from Firebase:", err);
        const saved = localStorage.getItem(MATERIAL_COLUMNS_KEY);
        if (saved) {
          materialColumns = JSON.parse(saved);
        } else {
          materialColumns = [
            { id: 1, name: "Item Code", field: "itemCode" },
            { id: 2, name: "Material", field: "material" },
            { id: 3, name: "Specification", field: "specification" },
            { id: 4, name: "Category", field: "category" },
            { id: 5, name: "Wh Loc", field: "whloc" },
            { id: 6, name: "Project", field: "warehouse" },
            { id: 7, name: "Status", field: "status" },
            { id: 8, name: "Quantity", field: "quantity" },
            { id: 9, name: "Cost", field: "cost" }
          ];
        }
        renderMaterialTable();
      });
    } catch (err) {
      console.error("Error in initMaterialColumns:", err);
      renderMaterialTable();
    }
  } else {
    const saved = localStorage.getItem(MATERIAL_COLUMNS_KEY);
    if (saved) {
      materialColumns = JSON.parse(saved);
    } else {
      materialColumns = [
        { id: 1, name: "Item Code", field: "itemCode" },
        { id: 2, name: "Material", field: "material" },
        { id: 3, name: "Specification", field: "specification" },
        { id: 4, name: "Category", field: "category" },
        { id: 5, name: "Wh Loc", field: "whloc" },
        { id: 6, name: "Project", field: "warehouse" },
        { id: 7, name: "Status", field: "status" },
        { id: 8, name: "Quantity", field: "quantity" },
        { id: 9, name: "Cost", field: "cost" }
      ];
    }
    renderMaterialTable();
  }
}

async function initMaterialColumns2() {
  // Load columns for the current category - WAIT for it to complete
  await loadMaterialColumnsForCategory(selectedCategory);
  // renderMaterialTable2() is already called inside loadMaterialColumnsForCategory
}

// Load column configuration for Materials tab - SAME for all categories
function loadMaterialColumnsForCategory(category) {
  // Load GLOBAL column configuration (NOT category-specific) - ALL categories use the same columns
  const user = auth.currentUser;
  
  console.log("🔵 LOADING columns for Materials tab (global)");
  
  // Return a Promise that resolves when loading is complete
  return new Promise((resolve) => {
    // Try Firebase first
    if (user) {
      try {
        // Load from a GLOBAL key, not category-specific
        const docRef = doc(db, "columnConfig", "materialColumns2");
        getDoc(docRef).then(docSnap => {
          if (docSnap.exists() && docSnap.data().columns) {
            materialColumns2 = docSnap.data().columns;
            // CRITICAL: Remove Warehouse column from Materials tab
            materialColumns2 = materialColumns2.filter(col => col.name !== "Warehouse");
            console.log("✅ LOADED global columns from Firebase:", materialColumns2);
            renderMaterialTable2();
            resolve();
          } else {
            console.log("ℹ️ No Firebase config found, checking localStorage...");
            // No config, try fallback
            loadFromLocalStorageOrDefault(resolve);
          }
        }).catch(err => {
          console.error("❌ Error loading from Firebase:", err);
          loadFromLocalStorageOrDefault(resolve);
        });
      } catch (e) {
        console.error("❌ Error:", e);
        loadFromLocalStorageOrDefault(resolve);
      }
    } else {
      // Not logged in, load from localStorage
      loadFromLocalStorageOrDefault(resolve);
    }
    
    function loadFromLocalStorageOrDefault(callback) {
      // Load from GLOBAL localStorage key
      const saved = localStorage.getItem("materialColumns2");
      if (saved) {
        try {
          materialColumns2 = JSON.parse(saved);
          // CRITICAL: Remove Warehouse column from Materials tab
          materialColumns2 = materialColumns2.filter(col => col.name !== "Warehouse");
          if (!materialColumns2 || materialColumns2.length === 0) {
            console.log("ℹ️ Loaded config is empty, using defaults");
            setDefaultMaterialColumns2();
          }
          console.log("✅ LOADED global columns from localStorage:", materialColumns2);
        } catch (e) {
          console.error("❌ Error parsing localStorage:", e);
          setDefaultMaterialColumns2();
        }
      } else {
        console.log("ℹ️ No saved config found, using defaults");
        setDefaultMaterialColumns2();
      }
      renderMaterialTable2();
      callback(); // Resolve the Promise
    }
  });
}

// Ensure loaded columns include Specification and Brand (NO LONGER REPLACES SAVED CONFIG)
function ensureMaterialColumnsHaveNewFields() {
  // This function is now DISABLED to prevent overwriting user's saved columns
  // Users can configure any columns they want - we don't force defaults
  return;
}

// Set default columns for materials (NOTE: Warehouse column MUST NOT be included in Materials tab)
function setDefaultMaterialColumns2() {
  materialColumns2 = [
    { id: 1, name: "Item Code", field: "itemCode" },
    { id: 2, name: "Material", field: "material" },
    { id: 3, name: "Specification", field: "specification" },
    { id: 4, name: "Brand", field: "brand" },
    { id: 5, name: "Category", field: "category" },
    { id: 6, name: "Trade", field: "trade" },
    { id: 7, name: "Quantity", field: "quantity" },
    { id: 8, name: "Expiry Date", field: "expiryDate" },
    { id: 9, name: "Status", field: "status" }
    // NOTE: DO NOT add Warehouse column here - it's for Stock Monitoring tab only
  ];
}

// Save columns for Materials tab - ONE GLOBAL configuration for ALL categories
function saveMaterialColumnsForCategory(category) {
  // Save to a GLOBAL key, not category-specific - ALL categories will use the same columns
  const columnsToSave = materialColumns2.filter(col => col.name !== "Warehouse");
  const user = auth.currentUser;
  
  console.log("🔴 SAVING GLOBAL columns for Materials tab:", columnsToSave);
  console.log("🔴 User logged in:", !!user);
  
  if (user) {
    try {
      // Save to GLOBAL key "materialColumns2", not category-specific
      const docRef = doc(db, "columnConfig", "materialColumns2");
      return setDoc(docRef, { columns: columnsToSave, lastUpdated: new Date() }, { merge: true }).then(() => {
        console.log("✅ SAVED to Firebase successfully");
        // Also save to localStorage as backup
        localStorage.setItem("materialColumns2", JSON.stringify(columnsToSave));
        console.log("✅ SAVED to localStorage as backup");
        return Promise.resolve();
      }).catch(err => {
        console.error("❌ Error saving to Firebase:", err);
        // Fallback to localStorage
        localStorage.setItem("materialColumns2", JSON.stringify(columnsToSave));
        console.log("✅ SAVED to localStorage (Firebase fallback)");
        return Promise.resolve();
      });
    } catch (e) {
      console.error("❌ Error in save:", e);
      localStorage.setItem("materialColumns2", JSON.stringify(columnsToSave));
      console.log("✅ SAVED to localStorage (catch fallback)");
      return Promise.resolve();
    }
  } else {
    // Fallback to localStorage
    localStorage.setItem("materialColumns2", JSON.stringify(columnsToSave));
    console.log("✅ SAVED to localStorage (user not logged in)");
    return Promise.resolve();
  }
}

function saveMaterialColumns() {
  // Save to Firebase for Stock Monitoring columns
  const user = auth.currentUser;
  if (user) {
    try {
      const docRef = doc(db, "columnConfig", "materialColumns");
      setDoc(docRef, { columns: materialColumns, lastUpdated: new Date() }, { merge: true }).then(() => {
        console.log("Stock Monitoring columns saved to Firebase");
      }).catch(err => {
        console.error("Error saving to Firebase:", err);
        // Fallback to localStorage
        localStorage.setItem(MATERIAL_COLUMNS_KEY, JSON.stringify(materialColumns));
      });
    } catch (err) {
      console.error("Error in saveMaterialColumns:", err);
      localStorage.setItem(MATERIAL_COLUMNS_KEY, JSON.stringify(materialColumns));
    }
  } else {
    localStorage.setItem(MATERIAL_COLUMNS_KEY, JSON.stringify(materialColumns));
  }
}

// OLD: saveMaterialColumns2 - DEPRECATED - Now calls category-specific save
function saveMaterialColumns2() {
  // Route to category-specific save instead of global
  console.log("saveMaterialColumns2() called - routing to saveMaterialColumnsForCategory for:", selectedCategory);
  saveMaterialColumnsForCategory(selectedCategory);
}

function renderMaterialColumnsConfig() {
  const list = document.getElementById("materialColumnsList");
  if (!list) return;
  list.innerHTML = "";
  materialColumns.forEach((col, idx) => {
    list.innerHTML += `
      <div class="material-col-item" draggable="true" data-col-idx="${idx}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);cursor:grab;">
        <span style="margin-right:8px;color:#0a9b03;cursor:grab;"><i class="fa-solid fa-grip-vertical"></i></span>
        <input type="text" id="matColInput-${idx}" value="${col.name}" data-col-idx="${idx}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onchange="updateMaterialColumnName(${idx}, this.value)">
        <button type="button" onclick="deleteMaterialColumn(${idx})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
  });
  setupMaterialColumnDragDrop();
}

function renderMaterialColumnsConfig2() {
  const list = document.getElementById("materialColumnsList2");
  if (!list) return;
  list.innerHTML = "";
  let displayIdx = 0;
  materialColumns2.forEach((col, idx) => {
    // CRITICAL: Skip Warehouse column in Materials tab config UI
    if (col.name === "Warehouse") return;
    
    list.innerHTML += `
      <div class="material-col-item2" draggable="true" data-col-idx="${idx}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px;border:1px solid rgba(10,155,3,.2);cursor:grab;">
        <span style="margin-right:8px;color:#0a9b03;cursor:grab;"><i class="fa-solid fa-grip-vertical"></i></span>
        <input type="text" id="matColInput2-${idx}" value="${col.name}" data-col-idx="${idx}" style="flex:1;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;font-size:13px;font-weight:500;margin-right:10px;" onchange="updateMaterialColumnName2(${idx}, this.value)">
        <button type="button" onclick="deleteMaterialColumn2(${idx})" style="background:rgba(255,0,0,.2);color:#ff6b6b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,0,0,.4)'" onmouseout="this.style.background='rgba(255,0,0,.2)'">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </div>
    `;
    displayIdx++;
  });
  setupMaterialColumnDragDrop2();
}

window.deleteMaterialColumn = (idx) => {
  materialColumns.splice(idx, 1);
  saveMaterialColumns();
  renderMaterialColumnsConfig();
  renderMaterialTable();
};

window.deleteMaterialColumn2 = (idx) => {
  materialColumns2.splice(idx, 1);
  saveMaterialColumnsForCategory(selectedCategory);
  renderMaterialColumnsConfig2();
  renderMaterialTable2();
};

window.updateMaterialColumnName = (idx, newName) => {
  if (materialColumns[idx]) {
    materialColumns[idx].name = newName.trim();
    saveMaterialColumns();
    // Only update the header, don't re-render table rows
    const materialsTable = document.querySelector(".materials-table thead tr");
    if (materialsTable) {
      // Rebuild only the header
      materialsTable.innerHTML = "";
      materialColumns.forEach(col => {
        materialsTable.innerHTML += `<th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">${col.name}</th>`;
      });
      materialsTable.innerHTML += `<th style="padding:12px;text-align:center;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">Actions</th>`;
    }
  }
};

window.updateMaterialColumnName2 = (idx, newName) => {
  const trimmedName = newName.trim();
  if (!trimmedName) {
    showAlert("Column name cannot be empty", "error");
    renderMaterialColumnsConfig2();
    return;
  }
  
  if (materialColumns2[idx]) {
    materialColumns2[idx].name = trimmedName;
    saveMaterialColumnsForCategory(selectedCategory);
    
    // Re-render the table (headers + rows)
    renderMaterials2("all");
    showAlert("✅ Column renamed!", "success");
    
    // Re-render the columns config modal to show updated names
    renderMaterialColumnsConfig2();
  }
};

// ========== DRAG AND DROP FUNCTIONS ==========
function setupDeliveryColumnDragDrop() {
  const items = document.querySelectorAll(".delivery-col-item");
  let draggedItem = null;

  items.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.5";
      item.style.borderColor = "#0a9b03";
    });

    item.addEventListener("dragend", (e) => {
      item.style.opacity = "1";
      item.style.borderColor = "transparent";
      draggedItem = null;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        item.style.borderTop = "3px solid #0a9b03";
      }
    });

    item.addEventListener("dragleave", (e) => {
      item.style.borderTop = "none";
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderTop = "none";
      
      if (draggedItem && draggedItem !== item) {
        // Swap column positions
        const draggedIdx = parseInt(draggedItem.dataset.colIdx);
        const targetIdx = parseInt(item.dataset.colIdx);
        
        [deliveryColumns[draggedIdx], deliveryColumns[targetIdx]] = 
        [deliveryColumns[targetIdx], deliveryColumns[draggedIdx]];
        
        saveDeliveryColumns();
        renderColumnsConfig();
      }
    });
  });
}

function setupScheduleColumnDragDrop() {
  const items = document.querySelectorAll(".schedule-col-item");
  let draggedItem = null;

  items.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.5";
      item.style.borderColor = "#0a9b03";
    });

    item.addEventListener("dragend", (e) => {
      item.style.opacity = "1";
      item.style.borderColor = "transparent";
      draggedItem = null;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        item.style.borderTop = "3px solid #0a9b03";
      }
    });

    item.addEventListener("dragleave", (e) => {
      item.style.borderTop = "none";
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderTop = "none";
      
      if (draggedItem && draggedItem !== item) {
        const draggedIdx = parseInt(draggedItem.dataset.colIdx);
        const targetIdx = parseInt(item.dataset.colIdx);
        
        [scheduleColumns[draggedIdx], scheduleColumns[targetIdx]] = 
        [scheduleColumns[targetIdx], scheduleColumns[draggedIdx]];
        
        saveScheduleColumns();
        renderScheduleColumnsConfig();
      }
    });
  });
}

function setupMaterialColumnDragDrop() {
  const items = document.querySelectorAll(".material-col-item");
  let draggedItem = null;

  items.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.5";
      item.style.borderColor = "#0a9b03";
    });

    item.addEventListener("dragend", (e) => {
      item.style.opacity = "1";
      item.style.borderColor = "transparent";
      draggedItem = null;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        item.style.borderTop = "3px solid #0a9b03";
      }
    });

    item.addEventListener("dragleave", (e) => {
      item.style.borderTop = "none";
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderTop = "none";
      
      if (draggedItem && draggedItem !== item) {
        const draggedIdx = parseInt(draggedItem.dataset.colIdx);
        const targetIdx = parseInt(item.dataset.colIdx);
        
        [materialColumns[draggedIdx], materialColumns[targetIdx]] = 
        [materialColumns[targetIdx], materialColumns[draggedIdx]];
        
        saveMaterialColumns();
        renderMaterialColumnsConfig();
        renderMaterialTable();
      }
    });
  });
}

function setupMaterialColumnDragDrop2() {
  const items = document.querySelectorAll(".material-col-item2");
  let draggedItem = null;

  items.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.style.opacity = "0.5";
      item.style.borderColor = "#0a9b03";
    });

    item.addEventListener("dragend", (e) => {
      item.style.opacity = "1";
      item.style.borderColor = "transparent";
      draggedItem = null;
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        item.style.borderTop = "3px solid #0a9b03";
      }
    });

    item.addEventListener("dragleave", (e) => {
      item.style.borderTop = "none";
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderTop = "none";
      
      if (draggedItem && draggedItem !== item) {
        const draggedIdx = parseInt(draggedItem.dataset.colIdx);
        const targetIdx = parseInt(item.dataset.colIdx);
        
        [materialColumns2[draggedIdx], materialColumns2[targetIdx]] = 
        [materialColumns2[targetIdx], materialColumns2[draggedIdx]];
        
        saveMaterialColumns2();
        renderMaterialColumnsConfig2();
        renderMaterialTable2();
      }
    });
  });
}

function renderMaterialTable() {
  const materialsTable = document.querySelector(".materials-table thead tr");
  if (!materialsTable) return;
  materialsTable.innerHTML = "";
  materialColumns.forEach(col => {
    materialsTable.innerHTML += `<th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">${col.name}</th>`;
  });
  materialsTable.innerHTML += `<th style="padding:12px;text-align:center;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">Actions</th>`;
}

function renderMaterialTable2() {
  // Ensure materialColumns2 is initialized
  if (!materialColumns2 || materialColumns2.length === 0) {
    console.warn("materialColumns2 is empty in renderMaterialTable2! Using default columns");
    setDefaultMaterialColumns2();
  }
  
  const tableBody = document.getElementById("inventoryBody2");
  if (!tableBody) return;
  const materialsTable = tableBody.closest("table").querySelector("thead tr");
  if (!materialsTable) return;
  materialsTable.innerHTML = "";
  materialColumns2.forEach(col => {
    // Skip warehouse column for Materials tab
    if (col.name === "Warehouse") return;
    materialsTable.innerHTML += `<th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">${col.name}</th>`;
  });
  materialsTable.innerHTML += `<th style="padding:12px;text-align:center;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">Actions</th>`;
}

function renderDeliveryTable() {
  const headerRow = document.getElementById("headerRow");
  if (!headerRow) return;
  headerRow.innerHTML = "";
  
  // Use default columns if empty
  const cols = deliveryColumns && deliveryColumns.length > 0 ? deliveryColumns : [
    { name: "Date" }, { name: "Warehouse" }, { name: "Control No" }, 
    { name: "Client PO" }, { name: "Items Count" }, { name: "Type" }
  ];
  
  cols.forEach(col => {
    headerRow.innerHTML += `<th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">${col.name}</th>`;
  });
  headerRow.innerHTML += `<th style="padding:12px;text-align:center;color:#0a9b03;font-weight:600;border-bottom:2px solid rgba(10,155,3,.3);">Actions</th>`;
}

function renderDeliveryForm() {
  // Populate warehouse dropdowns
  const whSelect = document.getElementById("drWarehouse");
  const fromWhSelect = document.getElementById("drFromWarehouse");
  
  if (!whSelect || !fromWhSelect) {
    console.error("Warehouse select elements not found");
    return;
  }
  
  // Clear and rebuild warehouse options
  whSelect.innerHTML = '<option value="">Select Project</option>';
  fromWhSelect.innerHTML = '<option value="">Leave blank for Stock In. Select for Transfer</option>';
  
  if (allWarehouses && allWarehouses.length > 0) {
    allWarehouses.forEach(wh => {
      whSelect.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
      fromWhSelect.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
    });
  }
  
  // Set today's date if not already set
  const dateField = document.getElementById("drDate");
  if (dateField && !dateField.value) {
    const today = new Date().toISOString().split('T')[0];
    dateField.value = today;
  }
  
  // Initialize empty items array
  if (!window.drCurrentItems) {
    window.drCurrentItems = [];
  }
}

function renderScheduleForm() {
  const formFields = document.getElementById("deliveryFormFields");
  if (!formFields) return;
  formFields.innerHTML = "";
  scheduleColumns.forEach(col => {
    // Check if column name suggests it's a date field
    const isDateField = col.name.toLowerCase().includes("date") || 
                       col.name.toLowerCase().includes("time") ||
                       col.name.toLowerCase().includes("day");
    
    const inputType = isDateField ? "date" : "text";
    const inputClass = isDateField ? "delivery-field date-field" : "delivery-field";
    
    formFields.innerHTML += `
      <div class="form-group">
        <label>${col.name} *</label>
        <input type="${inputType}" class="${inputClass}" data-column="${col.name}" placeholder="Enter ${col.name.toLowerCase()}" required>
      </div>
    `;
  });
}

// Delivery Receipt Item Management
window.addDeliveryReceiptItem = function() {
  // This is handled by the Add Item button in the modal now
  // Kept for backward compatibility
};

window.removeDeliveryReceiptItem = function(itemId) {
  if (!window.drCurrentItems) return;
  window.drCurrentItems = window.drCurrentItems.filter(item => item.id !== itemId);
  renderDeliveryReceiptItems();
};

window.updateDeliveryReceiptItem = function(itemId, field, value) {
  if (!window.drCurrentItems) return;
  const item = window.drCurrentItems.find(i => i.id === itemId);
  if (item) {
    item[field] = value;
  }
};

function renderDeliveryReceiptItems() {
  const tbody = document.getElementById("drItemsBody");
  const noItemsMsg = document.getElementById("drNoItemsMsg");
  
  if (!window.drCurrentItems || window.drCurrentItems.length === 0) {
    tbody.innerHTML = "";
    noItemsMsg.style.display = "block";
    return;
  }
  
  noItemsMsg.style.display = "none";
  tbody.innerHTML = "";
  
  window.drCurrentItems.forEach((item, index) => {
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:12px;color:#d0d0d0;">${index + 1}</td>
        <td style="padding:12px;color:#d0d0d0;">${item.itemCode || "-"}</td>
        <td style="padding:12px;color:#d0d0d0;">${item.materialName}</td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.brand}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'brand', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.specification}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'specification', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="number" value="${item.quantity}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'quantity', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.unit}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'unit', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.mrNo}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'mrNo', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.poNo}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'poNo', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;color:#d0d0d0;">
          <input type="text" value="${item.remarks || ''}" onchange="window.updateDeliveryReceiptItem(${item.id}, 'remarks', this.value)" style="width:90%;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;box-sizing:border-box;">
        </td>
        <td style="padding:12px;text-align:center;">
          <button type="button" onclick="window.removeDeliveryReceiptItem(${item.id})" style="background:#ff6b6b;color:white;border:none;padding:6px 10px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;">Remove</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// Material Request (MR) Functions
async function loadMaterialRequests() {
  try {
    const snap = await getDocs(collection(db, "materialRequests"));
    allMaterialRequests = [];
    snap.forEach(doc => {
      allMaterialRequests.push({ id: doc.id, ...doc.data() });
    });
    renderMRTable();
  } catch (err) {
    console.error("Error loading MRs:", err);
  }
}

function renderMRTable() {
  const tbody = document.getElementById("mrTableBody");
  const emptyMsg = document.getElementById("mrEmptyMsg");
  
  if (!tbody) return;
  
  if (!allMaterialRequests || allMaterialRequests.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";
  
  // Sort by MR number in descending order
  const sortedMRs = [...allMaterialRequests].sort((a, b) => {
    const numA = parseInt(a.mrNo?.replace(/\D/g, '') || 0);
    const numB = parseInt(b.mrNo?.replace(/\D/g, '') || 0);
    return numB - numA;
  });
  
  sortedMRs.forEach(mr => {
    const warehouseName = allWarehouses.find(w => w.id === mr.warehouse)?.name || mr.warehouse;
    const statusColor = mr.status === "Pending" ? "#ff9800" : "#0a9b03";
    
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
    
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;">${mr.mrNo}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.createdBy}</td>
        <td style="padding:10px;color:#d0d0d0;">${warehouseName}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.type === "borrow" ? "🔄 Borrow" : "📦 New Project"}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.items?.length || 0}</td>
        <td style="padding:10px;color:#d0d0d0;">${createdDate}</td>
        <td style="padding:10px;"><span style="background:${statusColor};color:white;padding:4px 8px;border-radius:3px;font-size:11px;font-weight:600;">${mr.status}</span></td>
        <td style="padding:10px;text-align:center;display:flex;gap:5px;justify-content:center;">
          <button style="background:#0a9b03;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.viewMRDetails('${mr.id}')">View</button>
          <button style="background:#ff6b6b;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.deleteMR('${mr.id}', '${mr.mrNo}')">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

window.deleteMR = function(mrId, mrNo) {
  (async () => {
    const confirmed = await showDeleteConfirmCard("Material Request", mrNo);
    if (!confirmed) return;
    
    try {
      await deleteDoc(doc(db, "materialRequests", mrId));
      await logActivity("mr", "delete", `Deleted material request ${mrNo}`);
      showAlert(`✅ MR ${mrNo} deleted successfully!`, "success");
      loadMaterialRequests();
    } catch (err) {
      showAlert("❌ Error deleting MR: " + err.message, "error");
    }
  })();
};

window.viewMRDetails = function(mrId) {
  const mr = allMaterialRequests.find(m => m.id === mrId);
  if (!mr) return;
  
  // Create modal to display MR details
  const modal = document.createElement("div");
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
    display:flex;justify-content:center;align-items:center;z-index:10000;
  `;
  
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
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.materialName}</td>
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
  
  const modalContent = `
    <div style="background:#1a2332;border-radius:8px;padding:30px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
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
  
  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  
  document.getElementById("closeMRDetailsModal").onclick = () => {
    modal.remove();
  };
  
  // Close modal when clicking outside
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
};

window.renderMRItems = function() {
  const tbody = document.getElementById("mrItemsBody");
  const noItemsMsg = document.getElementById("mrNoItemsMsg");
  
  if (!tbody) return;
  
  if (!window.mrCurrentItems || window.mrCurrentItems.length === 0) {
    tbody.innerHTML = "";
    noItemsMsg.style.display = "block";
    return;
  }
  
  noItemsMsg.style.display = "none";
  tbody.innerHTML = "";
  
  window.mrCurrentItems.forEach((item, idx) => {
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:8px;color:#d0d0d0;">${idx + 1}</td>
        <td style="padding:8px;color:#d0d0d0;">${item.itemCode || ''}</td>
        <td style="padding:8px;color:#d0d0d0;">${item.materialName}</td>
        <td style="padding:8px;color:#d0d0d0;">
          <input type="number" value="${item.quantity}" onchange="window.updateMRItem(${item.id}, 'quantity', this.value)" style="width:80%;padding:4px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:2px;">
        </td>
        <td style="padding:8px;color:#d0d0d0;">
          <input type="text" value="${item.unit}" onchange="window.updateMRItem(${item.id}, 'unit', this.value)" style="width:80%;padding:4px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:2px;">
        </td>
        <td style="padding:8px;color:#d0d0d0;text-align:right;">₱${parseFloat(item.cost || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
        <td style="padding:8px;text-align:center;">
          <button type="button" onclick="window.removeMRItem(${item.id})" style="background:#ff6b6b;color:white;border:none;padding:4px 8px;border-radius:2px;cursor:pointer;font-size:11px;">Remove</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
};

window.updateMRItem = function(itemId, field, value) {
  if (!window.mrCurrentItems) return;
  const item = window.mrCurrentItems.find(i => i.id === itemId);
  if (item) {
    item[field] = value;
  }
};

window.removeMRItem = function(itemId) {
  if (!window.mrCurrentItems) return;
  window.mrCurrentItems = window.mrCurrentItems.filter(item => item.id !== itemId);
  window.renderMRItems();
};

async function loadPurchaseOrders() {
  try {
    const snap = await getDocs(collection(db, "purchaseOrders"));
    allPurchaseOrders = [];
    snap.forEach(doc => {
      allPurchaseOrders.push({ id: doc.id, ...doc.data() });
    });
    renderPOTable();
  } catch (err) {
    console.error("Error loading POs:", err);
  }
}

function renderPOTable() {
  const tbody = document.getElementById("poTableBody");
  const emptyMsg = document.getElementById("poEmptyMsg");
  
  if (!tbody) return;
  
  if (!allPurchaseOrders || allPurchaseOrders.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";
  
  // Sort by PO number in descending order
  const sortedPOs = [...allPurchaseOrders].sort((a, b) => {
    const numA = parseInt(a.poNo?.replace(/\D/g, '') || 0);
    const numB = parseInt(b.poNo?.replace(/\D/g, '') || 0);
    return numB - numA;
  });
  
  sortedPOs.forEach(po => {
    const itemsCount = po.items?.length || 0;
    const totalQty = po.items?.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0) || 0;
    const statusColor = po.status === "Pending" ? "#ff9800" : (po.status === "Ordered" ? "#2196f3" : "#0a9b03");
    const mrNumbers = po.linkedMRs?.join(", ") || (po.mrNo || "N/A");
    
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;">${po.poNo}</td>
        <td style="padding:10px;color:#d0d0d0;">${mrNumbers}</td>
        <td style="padding:10px;color:#d0d0d0;">${po.supplier || "N/A"}</td>
        <td style="padding:10px;color:#d0d0d0;">${itemsCount}</td>
        <td style="padding:10px;color:#d0d0d0;">${totalQty}</td>
        <td style="padding:10px;color:#d0d0d0;">${new Date(po.createdAt).toLocaleDateString()}</td>
        <td style="padding:10px;"><span style="background:${statusColor};color:white;padding:4px 8px;border-radius:3px;font-size:11px;font-weight:600;">${po.status}</span></td>
        <td style="padding:10px;text-align:center;display:flex;gap:5px;justify-content:center;">
          <button style="background:#0a9b03;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.viewPODetails('${po.id}')">View</button>
          <button style="background:#ff6b6b;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.deletePO('${po.id}', '${po.poNo}')">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

window.deletePO = function(poId, poNo) {
  (async () => {
    const confirmed = await showDeleteConfirmCard("Purchase Order", poNo);
    if (!confirmed) return;
    
    try {
      await deleteDoc(doc(db, "purchaseOrders", poId));
      await logActivity("po", "delete", `Deleted purchase order ${poNo}`);
      showAlert(`✅ PO ${poNo} deleted successfully!`, "success");
      loadPurchaseOrders();
    } catch (err) {
      showAlert("❌ Error deleting PO: " + err.message, "error");
    }
  })();
};

window.viewPODetails = function(poId) {
  const po = allPurchaseOrders.find(p => p.id === poId);
  if (!po) return;
  
  // Create modal to display PO details
  const modal = document.createElement("div");
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
    display:flex;justify-content:center;align-items:center;z-index:10000;
  `;
  
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
  
  po.items.forEach((item, idx) => {
    // Try to fetch the actual material's data from allMaterials
    const material = allMaterials.find(m => m.id === item.materialId);
    const itemCode = item.itemCode || material?.itemCode || material?.code || "-";
    const itemCost = item.cost || item.unitPrice || material?.cost || material?.unitPrice || material?.price || 0;
    
    itemsHtml += `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${idx + 1}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${itemCode}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.materialName}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.specification || "-"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.brand || "-"}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.quantity}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;">${item.unit}</td>
        <td style="padding:10px;color:#d0d0d0;font-size:11px;text-align:right;">₱${parseFloat(itemCost || 0).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
      </tr>
    `;
  });
  
  itemsHtml += `</tbody></table>`;
  
  const totalQty = po.items?.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0) || 0;
  const statusColor = po.status === "Pending" ? "#ff9800" : (po.status === "Ordered" ? "#2196f3" : "#0a9b03");
  
  const modalContent = `
    <div style="background:#1a2332;border-radius:8px;padding:30px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <h2 style="margin:0 0 20px 0;color:#0a9b03;">Purchase Order Details</h2>
      
      <div style="background:rgba(10,155,3,0.08);border:1px solid rgba(10,155,3,0.3);border-radius:8px;padding:15px;margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">PO No.</p>
            <p style="margin:0;color:#0a9b03;font-size:14px;font-weight:600;">${po.poNo}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Status</p>
            <p style="margin:0;background:${statusColor};color:white;padding:4px 8px;border-radius:3px;font-size:12px;font-weight:600;width:fit-content;">${po.status}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Supplier</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;font-weight:600;">${po.supplier || "-"}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Date</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${new Date(po.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Items Count</p>
            <p style="margin:0;color:#d0d0d0;font-size:13px;">${po.items?.length || 0}</p>
          </div>
          <div>
            <p style="margin:0 0 5px 0;color:#a0a0a0;font-size:11px;font-weight:600;text-transform:uppercase;">Total Qty</p>
            <p style="margin:0;color:#1dd1a1;font-size:13px;font-weight:600;">${totalQty} units</p>
          </div>
        </div>
      </div>
      
      <h3 style="margin:0 0 10px 0;color:#0a9b03;font-size:13px;font-weight:600;">Order Items:</h3>
      ${itemsHtml}
      
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button id="closePODetailsModal" style="background:rgba(10,155,3,0.2);color:#0a9b03;border:1px solid rgba(10,155,3,0.4);padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;">Close</button>
      </div>
    </div>
  `;
  
  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  
  document.getElementById("closePODetailsModal").onclick = () => {
    modal.remove();
  };
  
  // Close modal when clicking outside
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
};

async function loadDeliveries() {
  try {
    const snap = await getDocs(collection(db, "deliveries"));
    allDeliveries = [];
    snap.forEach(doc => {
      allDeliveries.push({ id: doc.id, ...doc.data() });
    });
    window.deliveryPaginationState.allDeliveries = allDeliveries;
    window.deliveryPaginationState.currentPage = 1;
    window.renderDeliveriesTableWithPagination(allDeliveries);
    window.updateDeliveryFilters(allDeliveries);
  } catch (err) {
    console.error("Error loading deliveries:", err);
  }
}

async function loadScheduleRecords() {
  try {
    const snap = await getDocs(collection(db, "scheduleRecords"));
    allScheduleRecords = [];
    snap.forEach(doc => {
      allScheduleRecords.push({ id: doc.id, ...doc.data() });
    });
    window.renderScheduleTable(allScheduleRecords);
  } catch (err) {
    console.error("Error loading schedule records:", err);
  }
}

// Populate year dropdowns for MR and PO filters
function populateYearFilters() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [];
  
  // Add years from 2 years ago to 2 years from now
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    years.push(y);
  }
  
  // Populate MR year filter
  const mrYearSelect = document.getElementById("filterMRYear");
  if (mrYearSelect) {
    years.forEach(year => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      mrYearSelect.appendChild(option);
    });
    mrYearSelect.addEventListener("change", applyMRFilters);
  }
  
  // Populate PO year filter
  const poYearSelect = document.getElementById("filterPOYear");
  if (poYearSelect) {
    years.forEach(year => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      poYearSelect.appendChild(option);
    });
    poYearSelect.addEventListener("change", applyPOFilters);
  }
}

// Apply MR filters
function applyMRFilters() {
  const month = document.getElementById("filterMRMonth")?.value || "";
  const year = document.getElementById("filterMRYear")?.value || "";
  const tbody = document.getElementById("mrTableBody");
  const emptyMsg = document.getElementById("mrEmptyMsg");
  
  if (!tbody || !allMaterialRequests) return;
  
  let filtered = allMaterialRequests;
  
  if (month || year) {
    filtered = allMaterialRequests.filter(mr => {
      const createdDate = new Date(mr.createdAt);
      const mrMonth = String(createdDate.getMonth() + 1).padStart(2, '0');
      const mrYear = String(createdDate.getFullYear());
      
      if (month && year) {
        return mrMonth === month && mrYear === year;
      } else if (year) {
        return mrYear === year;
      } else if (month) {
        return mrMonth === month;
      }
      return true;
    });
  }
  
  renderMRTableFiltered(filtered);
}

// Apply PO filters
function applyPOFilters() {
  const month = document.getElementById("filterPOMonth")?.value || "";
  const year = document.getElementById("filterPOYear")?.value || "";
  const tbody = document.getElementById("poTableBody");
  const emptyMsg = document.getElementById("poEmptyMsg");
  
  if (!tbody || !allPurchaseOrders) return;
  
  let filtered = allPurchaseOrders;
  
  if (month || year) {
    filtered = allPurchaseOrders.filter(po => {
      const createdDate = new Date(po.createdAt);
      const poMonth = String(createdDate.getMonth() + 1).padStart(2, '0');
      const poYear = String(createdDate.getFullYear());
      
      if (month && year) {
        return poMonth === month && poYear === year;
      } else if (year) {
        return poYear === year;
      } else if (month) {
        return poMonth === month;
      }
      return true;
    });
  }
  
  renderPOTableFiltered(filtered);
}

// Render MR table with filtered data
function renderMRTableFiltered(filteredMRs) {
  const tbody = document.getElementById("mrTableBody");
  const emptyMsg = document.getElementById("mrEmptyMsg");
  
  if (!tbody) return;
  
  if (!filteredMRs || filteredMRs.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";
  
  filteredMRs.forEach(mr => {
    const warehouseName = allWarehouses.find(w => w.id === mr.warehouse)?.name || mr.warehouse;
    const statusColor = mr.status === "Pending" ? "#ff9800" : "#0a9b03";
    
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
    
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;">${mr.mrNo}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.createdBy}</td>
        <td style="padding:10px;color:#d0d0d0;">${warehouseName}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.type === "borrow" ? "🔄 Borrow" : "📦 New Project"}</td>
        <td style="padding:10px;color:#d0d0d0;">${mr.items?.length || 0}</td>
        <td style="padding:10px;color:#d0d0d0;">${createdDate}</td>
        <td style="padding:10px;"><span style="background:${statusColor};color:white;padding:4px 8px;border-radius:3px;font-size:11px;font-weight:600;">${mr.status}</span></td>
        <td style="padding:10px;text-align:center;display:flex;gap:5px;justify-content:center;">
          <button style="background:#0a9b03;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.viewMRDetails('${mr.id}')">View</button>
          <button style="background:#ff6b6b;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.deleteMR('${mr.id}', '${mr.mrNo}')">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// Render PO table with filtered data
function renderPOTableFiltered(filteredPOs) {
  const tbody = document.getElementById("poTableBody");
  const emptyMsg = document.getElementById("poEmptyMsg");
  
  if (!tbody) return;
  
  if (!filteredPOs || filteredPOs.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  
  emptyMsg.style.display = "none";
  tbody.innerHTML = "";
  
  filteredPOs.forEach(po => {
    const itemsCount = po.items?.length || 0;
    const totalQty = po.items?.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0) || 0;
    const statusColor = po.status === "Pending" ? "#ff9800" : (po.status === "Ordered" ? "#2196f3" : "#0a9b03");
    
    const row = `
      <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
        <td style="padding:10px;color:#d0d0d0;">${po.poNo}</td>
        <td style="padding:10px;color:#d0d0d0;">${po.supplier || "N/A"}</td>
        <td style="padding:10px;color:#d0d0d0;">${itemsCount}</td>
        <td style="padding:10px;color:#d0d0d0;">${totalQty}</td>
        <td style="padding:10px;color:#d0d0d0;">${new Date(po.createdAt).toLocaleDateString()}</td>
        <td style="padding:10px;"><span style="background:${statusColor};color:white;padding:4px 8px;border-radius:3px;font-size:11px;font-weight:600;">${po.status}</span></td>
        <td style="padding:10px;text-align:center;display:flex;gap:5px;justify-content:center;">
          <button style="background:#0a9b03;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.viewPODetails('${po.id}')">View</button>
          <button style="background:#ff6b6b;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;" onclick="window.deletePO('${po.id}', '${po.poNo}')">Delete</button>
        </td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// Clear MR filters
window.clearMRFilters = function() {
  document.getElementById("filterMRMonth").value = "";
  document.getElementById("filterMRYear").value = "";
  renderMRTable();
}

// Clear PO filters
window.clearPOFilters = function() {
  document.getElementById("filterPOMonth").value = "";
  document.getElementById("filterPOYear").value = "";
  renderPOTable();
}

// Add event listeners for filters
function setupFilters() {
  const mrMonthSelect = document.getElementById("filterMRMonth");
  const poMonthSelect = document.getElementById("filterPOMonth");
  
  if (mrMonthSelect) {
    mrMonthSelect.addEventListener("change", applyMRFilters);
  }
  
  if (poMonthSelect) {
    poMonthSelect.addEventListener("change", applyPOFilters);
  }
  
  populateYearFilters();
}

function renderDeliveriesTable() {
  const deliveryBody = document.getElementById("deliveryBody");
  if (!deliveryBody) return;
  deliveryBody.innerHTML = "";
  
  console.log('📋 Rendering deliveries table with', allDeliveries.length, 'deliveries');
  console.log('📊 Delivery columns:', deliveryColumns);
  
  // Ensure we have columns, use defaults if needed
  let cols = deliveryColumns && deliveryColumns.length > 0 ? deliveryColumns : [
    { name: "Date" }, { name: "Warehouse" }, { name: "Control No" }, 
    { name: "Client PO" }, { name: "Items Count" }, { name: "Type" }, { name: "Status" }
  ];
  
  // Make sure Status column exists
  if (!cols.find(c => c.name === 'Status')) {
    cols.push({ name: "Status" });
  }
  
  // Pre-fetch all linked delivery statuses before rendering
  (async () => {
    const deliveryStatusMap = {};
    
    console.log('⏳ Pre-fetching delivery statuses for', allDeliveries.length, 'deliveries...');
    
    // Fetch status for each delivery in parallel
    await Promise.all(allDeliveries.map(async (delivery) => {
      try {
        const linkedStatus = await getLinkedDeliveryStatus(delivery);
        deliveryStatusMap[delivery.id] = linkedStatus;
        console.log(`✅ Status for delivery ${delivery.id}:`, linkedStatus);
      } catch (e) {
        console.error(`❌ Error fetching status for delivery ${delivery.id}:`, e);
        deliveryStatusMap[delivery.id] = 'Error';
      }
    }));
    
    console.log('📦 All delivery statuses fetched:', deliveryStatusMap);
    
    // Now render the table with pre-fetched statuses
    allDeliveries.forEach(delivery => {
      let row = `<tr>`;
      
      cols.forEach(col => {
        let cellValue = "-";
        let cellStyle = "padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;font-size:12px;";
        
        // Use field property if available, fallback to name-based matching
        const field = col.field || col.name;
        
        if (field === 'date' || col.name === 'Date') {
          cellValue = delivery.date || "-";
        } else if (field === 'warehouse' || col.name === 'Warehouse') {
          cellValue = allWarehouses?.find(w => w.id === delivery.warehouse)?.name || delivery.warehouse || "-";
        } else if (field === 'controlNo' || col.name === 'Control No') {
          cellValue = delivery.controlNo || "-";
        } else if (field === 'clientPO' || col.name === 'Client PO') {
          cellValue = delivery.clientPO || "-";
        } else if (field === 'itemsCount' || col.name === 'Items Count') {
          cellValue = delivery.itemsCount || 0;
        } else if (field === 'type' || col.name === 'Type') {
          cellValue = delivery.type || (delivery.fromWarehouse ? "Transfer" : "Stock In");
        } else if (field === 'status' || col.name === 'Status') {
          cellValue = deliveryStatusMap[delivery.id] || "Fetching...";
          cellStyle += "font-weight:600;";
          
          // Apply color based on status
          if (cellValue.includes('FULLY RECEIVED')) {
            cellStyle += "color:#0a9b03;";
          } else if (cellValue.includes('PARTIALLY RECEIVED') || cellValue.includes('PARTIAL')) {
            cellStyle += "color:#ffa500;";
          } else if (cellValue.includes('PENDING')) {
            cellStyle += "color:#ff1744;";
          } else if (cellValue === 'Error') {
            cellStyle += "color:#ff6b6b;";
          }
        }
        
        row += `<td style="${cellStyle}">${cellValue}</td>`;
      });
      
      row += `<td style="padding:12px;text-align:center;border-bottom:1px solid rgba(10,155,3,.1);">
        <button class="btn-edit" onclick="editDelivery('${delivery.id}')">View</button>
        <button class="btn-delete" onclick="deleteDelivery('${delivery.id}')" style="margin-left:4px;">Delete</button>
      </td></tr>`;
      
      deliveryBody.innerHTML += row;
    });
    
    console.log('✅ Delivery table rendered successfully with', allDeliveries.length, 'rows');
  })();
}

window.viewDeliveryReceipt = async (id) => {
  const delivery = allDeliveries.find(d => d.id === id);
  if (!delivery) {
    showAlert("Delivery receipt not found", "error");
    return;
  }
  
  console.log('📦 Viewing delivery:', delivery);
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);backdrop-filter:blur(3px);z-index:2000;display:flex;align-items:center;justify-content:center;';
  
  const content = document.createElement('div');
  content.style.cssText = 'background:#1a3a52;border:2px solid rgba(10,155,3,0.5);border-radius:8px;padding:30px;width:95%;max-width:1000px;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);';
  
  const title = document.createElement('h3');
  title.textContent = '📋 Delivery Receipt - ' + (delivery.controlNo || 'N/A');
  title.style.cssText = 'color:#0a9b03;margin:0 0 20px 0;font-size:18px;';
  content.appendChild(title);
  
  // Get project name (warehouse field stores project ID)
  const projectId = delivery.warehouse;
  const project = allProjects.find(p => p.id === projectId);
  const projectName = project ? project.projectName : 'N/A';
  
  // Fetch linked delivery status
  const linkedDeliveryStatus = await getLinkedDeliveryStatus(delivery);
  let statusColor = '#e0e0e0';
  if (linkedDeliveryStatus.includes('FULLY RECEIVED')) {
    statusColor = '#0a9b03'; // Green
  } else if (linkedDeliveryStatus.includes('PARTIALLY RECEIVED') || linkedDeliveryStatus.includes('PARTIAL')) {
    statusColor = '#ffa500'; // Orange
  } else if (linkedDeliveryStatus.includes('PENDING')) {
    statusColor = '#ff1744'; // Red
  }
  
  const headerInfo = document.createElement('div');
  headerInfo.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-bottom:25px;';
  headerInfo.innerHTML = `
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid #0a9b03;">
      <strong style="color:#0a9b03;font-size:11px;">DATE</strong><br><span style="color:#e0e0e0;font-size:14px;">${delivery.date || '-'}</span>
    </div>
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid #0a9b03;">
      <strong style="color:#0a9b03;font-size:11px;">PROJECT</strong><br><span style="color:#e0e0e0;font-size:14px;">${projectName}</span>
    </div>
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid ${statusColor};">
      <strong style="color:#0a9b03;font-size:11px;">DELIVERY STATUS (from PO)</strong><br><span style="color:${statusColor};font-size:14px;font-weight:600;">${linkedDeliveryStatus}</span>
    </div>
  `;
  content.appendChild(headerInfo);
  headerInfo.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-bottom:25px;';
  headerInfo.innerHTML = `
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid #0a9b03;">
      <strong style="color:#0a9b03;font-size:11px;">DATE</strong><br><span style="color:#e0e0e0;font-size:14px;">${delivery.date || '-'}</span>
    </div>
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid #0a9b03;">
      <strong style="color:#0a9b03;font-size:11px;">PROJECT</strong><br><span style="color:#e0e0e0;font-size:14px;">${projectName}</span>
    </div>
    <div style="background:rgba(10,155,3,0.1);padding:12px;border-radius:6px;border-left:3px solid #0a9b03;">
      <strong style="color:#0a9b03;font-size:11px;">STATUS</strong><br><span style="color:#e0e0e0;font-size:14px;">${delivery.status || 'Received'}</span>
    </div>
  `;
  content.appendChild(headerInfo);
  
  // Items table with relevant columns
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;margin-bottom:20px;';
  
  const headerRow = table.insertRow();
  headerRow.style.cssText = 'background:rgba(10,155,3,0.2);';
  const headers = ['Item Code', 'Material', 'Specification', 'Brand', 'Received Qty', 'Unit', 'MR No', 'PO No'];
  headers.forEach(headerText => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.cssText = 'color:#0a9b03;padding:12px;text-align:left;font-size:12px;font-weight:600;border-bottom:2px solid rgba(10,155,3,0.3);';
    headerRow.appendChild(th);
  });
  
  if (delivery.items && delivery.items.length > 0) {
    delivery.items.forEach((item, idx) => {
      const row = table.insertRow();
      row.style.cssText = 'border-bottom:1px solid rgba(10,155,3,0.2);';
      if (idx % 2 === 0) {
        row.style.backgroundColor = 'rgba(10,155,3,0.05)';
      }
      
      const cells = [
        item.itemCode || '-',
        item.materialName || item.material || '-',
        item.specification || '-',
        item.brand || '-',
        item.receivedQty || item.quantity || '-',
        item.unit || 'PCS',
        item.mrNo || '-',
        item.poNo || item.poNumber || '-'
      ];
      
      cells.forEach(cellText => {
        const td = document.createElement('td');
        td.textContent = cellText;
        td.style.cssText = 'color:#d0d0d0;padding:10px 12px;font-size:13px;';
        row.appendChild(td);
      });
    });
  } else {
    const emptyRow = table.insertRow();
    const emptyCell = emptyRow.insertCell();
    emptyCell.colSpan = 8;
    emptyCell.textContent = 'No items';
    emptyCell.style.cssText = 'padding:20px;text-align:center;color:#a0a0a0;';
  }
  
  content.appendChild(table);
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'width:100%;padding:12px;background:rgba(10,155,3,0.2);color:#0a9b03;border:1px solid rgba(10,155,3,0.3);border-radius:6px;cursor:pointer;font-weight:600;';
  closeBtn.onclick = () => modal.remove();
  content.appendChild(closeBtn);
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};

window.editDeliveryControlNo = (id) => {
  const delivery = allDeliveries.find(d => d.id === id);
  if (!delivery) {
    showAlert("Delivery receipt not found", "error");
    return;
  }
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);backdrop-filter:blur(3px);z-index:2000;display:flex;align-items:center;justify-content:center;';
  
  const content = document.createElement('div');
  content.style.cssText = 'background:#1a3a52;border:2px solid rgba(10,155,3,0.5);border-radius:8px;padding:30px;width:90%;max-width:500px;box-shadow:0 10px 40px rgba(0,0,0,0.4);';
  
  const title = document.createElement('h3');
  title.textContent = '✏️ Edit Control Number';
  title.style.cssText = 'color:#0a9b03;margin:0 0 20px 0;font-size:18px;';
  content.appendChild(title);
  
  const label = document.createElement('label');
  label.textContent = 'Control Number:';
  label.style.cssText = 'display:block;color:#0a9b03;font-weight:600;margin-bottom:8px;font-size:13px;';
  content.appendChild(label);
  
  const input = document.createElement('input');
  input.type = 'text';
  input.value = delivery.controlNo || '';
  input.style.cssText = 'width:100%;padding:12px;background:rgba(10,155,3,0.1);border:1px solid rgba(10,155,3,0.3);border-radius:6px;color:#e0e0e0;font-size:14px;box-sizing:border-box;margin-bottom:20px;';
  content.appendChild(input);
  
  const btnDiv = document.createElement('div');
  btnDiv.style.cssText = 'display:flex;gap:10px;';
  
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'flex:1;padding:12px;background:linear-gradient(135deg,#0a9b03 0%,#15c524 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
  saveBtn.onclick = async () => {
    try {
      const newControlNo = input.value.trim();
      if (!newControlNo) {
        showAlert('Please enter a control number', 'error');
        return;
      }
      
      // Update in Firestore
      await updateDoc(doc(db, 'deliveries', id), { controlNo: newControlNo });
      console.log('✅ Control number updated:', newControlNo);
      
      showAlert('✅ Control number updated!', 'success');
      modal.remove();
      
      // Reload deliveries
      loadDeliveries();
    } catch (e) {
      console.error('Error updating control number:', e);
      showAlert('❌ Error: ' + e.message, 'error');
    }
  };
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;padding:12px;background:rgba(255,255,255,0.1);color:#e0e0e0;border:1px solid rgba(255,255,255,0.2);border-radius:6px;cursor:pointer;font-weight:600;';
  cancelBtn.onclick = () => modal.remove();
  
  btnDiv.appendChild(saveBtn);
  btnDiv.appendChild(cancelBtn);
  content.appendChild(btnDiv);
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Focus on input
  setTimeout(() => input.focus(), 100);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};



window.deleteDelivery = async (id) => {
  const delivery = allDeliveries.find(d => d.id === id);
  const confirmed = await showDeleteConfirmCard("Delivery Record", delivery?.Item || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "deliveries", id));
    await logActivity("delivery", "delete", `Deleted delivery record`);
    showAlert("✅ Delivery deleted!", "success");
    loadDeliveries();
  } catch (e) {
    showAlert("❌ Error: " + e.message, "error");
  }
};

window.stockInDelivery = async (id) => {
  const delivery = allDeliveries.find(d => d.id === id);
  if (!delivery) {
    showAlert("Delivery receipt not found", "error");
    return;
  }

  if (!delivery.items || delivery.items.length === 0) {
    showAlert("❌ This delivery has no items", "error");
    return;
  }

  // Show custom styled confirmation dialog
  const confirmed = await new Promise((resolve) => {
    const modalBg = document.createElement('div');
    modalBg.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, #1a3a2a 0%, #0d1f18 100%);
      border: 2px solid #15c524;
      border-radius: 8px;
      padding: 30px;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(21, 197, 36, 0.2);
      font-family: Arial, sans-serif;
    `;

    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 50px;
      height: 50px;
      background: #15c524;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 15px;
      font-size: 28px;
    `;
    icon.textContent = '📦';

    const title = document.createElement('h3');
    title.style.cssText = `
      color: #15c524;
      text-align: center;
      margin: 0 0 10px 0;
      font-size: 18px;
      font-weight: 600;
    `;
    title.textContent = 'Stock In Items';

    const message = document.createElement('p');
    message.style.cssText = `
      color: #d0d0d0;
      text-align: center;
      margin: 0 0 20px 0;
      line-height: 1.5;
      font-size: 14px;
    `;
    message.innerHTML = `Stock in <strong style="color: #15c524;">${delivery.items.length}</strong> items from this delivery?<br><br><small style="color: #a0a0a0;">This will add/update items in the stock inventory.</small>`;

    // Add Days until Expiry input field
    const agingContainer = document.createElement('div');
    agingContainer.style.cssText = `
      margin: 0 0 20px 0;
      padding: 15px;
      background: rgba(21, 197, 36, 0.1);
      border: 1px solid rgba(21, 197, 36, 0.3);
      border-radius: 6px;
    `;

    const agingLabel = document.createElement('label');
    agingLabel.style.cssText = `
      display: block;
      color: #15c524;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      text-transform: uppercase;
    `;
    agingLabel.textContent = 'Days until Expiry *';

    const agingInput = document.createElement('input');
    agingInput.type = 'number';
    agingInput.value = '90';
    agingInput.min = '1';
    agingInput.max = '3650';
    agingInput.style.cssText = `
      width: 100%;
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(21, 197, 36, 0.3);
      color: #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
    `;
    agingInput.placeholder = 'Enter days (e.g., 90, 180, 365)';

    agingContainer.appendChild(agingLabel);
    agingContainer.appendChild(agingInput);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 25px;
    `;

    const okBtn = document.createElement('button');
    okBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: #15c524;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
    `;
    okBtn.textContent = 'Confirm';
    okBtn.onmouseover = () => okBtn.style.background = '#11a820';
    okBtn.onmouseout = () => okBtn.style.background = '#15c524';
    okBtn.onclick = () => {
      const agingDays = parseInt(agingInput.value) || 90;
      if (agingDays < 1) {
        showAlert("❌ Days must be at least 1", "error");
        return;
      }
      modalBg.remove();
      resolve({ confirmed: true, agingDays: agingDays });
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background: #444;
      color: #d0d0d0;
      border: 1px solid #666;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
    `;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onmouseover = () => { cancelBtn.style.background = '#555'; cancelBtn.style.borderColor = '#777'; };
    cancelBtn.onmouseout = () => { cancelBtn.style.background = '#444'; cancelBtn.style.borderColor = '#666'; };
    cancelBtn.onclick = () => {
      modalBg.remove();
      resolve(false);
    };

    buttonContainer.appendChild(okBtn);
    buttonContainer.appendChild(cancelBtn);
    modal.appendChild(icon);
    modal.appendChild(title);
    modal.appendChild(message);
    modal.appendChild(agingContainer);
    modal.appendChild(buttonContainer);
    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);
  });

  if (!confirmed || !confirmed.confirmed) return;

  const agingDays = confirmed.agingDays || 90;

  try {
    let itemsProcessed = 0;
    const warehouseId = delivery.warehouse;

    console.log('📦 Starting Stock In for delivery:', { id, warehouse: warehouseId, itemsCount: delivery.items?.length, agingDays });

    if (!delivery.items || delivery.items.length === 0) {
      showAlert("❌ This delivery has no items to stock in", "error");
      return;
    }

    // Process each item in the delivery
    for (const drItem of delivery.items) {
      if (!drItem.materialName) {
        console.warn("Skipping item missing materialName:", drItem);
        continue;
      }

      // Generate itemCode if missing
      const itemCode = drItem.itemCode || `AUTO-${drItem.materialName.substring(0, 3).toUpperCase()}-${Date.now()}`;

      console.log('Processing item:', { itemCode, material: drItem.materialName, qty: drItem.quantity });

      // Find existing material in stock with matching itemCode, material name, and warehouse
      const existingMaterial = allMaterials.find(m => 
        m.itemCode === itemCode && 
        m.material === drItem.materialName &&
        m.warehouse === warehouseId &&
        (m.specification || "-") === (drItem.specification || "-") &&
        (m.brand || "-") === (drItem.brand || "-")
      );

      if (existingMaterial) {
        // Update existing material quantity
        const currentQty = parseInt(existingMaterial.quantity || 0);
        const newQty = currentQty + parseInt(drItem.quantity || 0);
        
        // Calculate update fields
        const updateFields = {
          quantity: newQty,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.email || "unknown"
        };
        
        // If no expiry date exists, set new one with aging days
        if (!existingMaterial.expiryDate) {
          const stockInDate = new Date();
          stockInDate.setHours(0, 0, 0, 0);
          
          const expiryDate = new Date(stockInDate);
          expiryDate.setDate(expiryDate.getDate() + agingDays);
          
          const nearExpiryThresholdDays = Math.ceil(agingDays * 0.30);
          const nearExpiryThresholdDate = new Date(stockInDate);
          nearExpiryThresholdDate.setDate(nearExpiryThresholdDate.getDate() + (agingDays - nearExpiryThresholdDays));
          
          updateFields.expiryDate = expiryDate.toISOString();
          updateFields.stockInDate = stockInDate.toISOString();
          updateFields.agingDays = agingDays;
          updateFields.nearExpiryThresholdDays = nearExpiryThresholdDays;
          updateFields.nearExpiryThresholdDate = nearExpiryThresholdDate.toISOString();
          updateFields.status = "In Stock";
        } else {
          // Material already has expiry date - recalculate status based on elapsed days
          const stockInDate = new Date(existingMaterial.stockInDate || new Date());
          stockInDate.setHours(0, 0, 0, 0);
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const matAgingDays = existingMaterial.agingDays || agingDays;
          const daysElapsed = Math.floor((today - stockInDate) / (1000 * 60 * 60 * 24));
          
          let newStatus = "In Stock";
          if (daysElapsed >= matAgingDays) {
            newStatus = "Expired";
          } else if (daysElapsed >= (matAgingDays - Math.ceil(matAgingDays * 0.30))) {
            newStatus = "Near Expiry";
          }
          updateFields.status = newStatus;
        }
        
        await updateDoc(doc(db, "materials", existingMaterial.id), updateFields);
        
        console.log(`✅ Updated quantity for ${itemCode} (${drItem.materialName}): ${currentQty} → ${newQty}`);
      } else {
        // Create new material record
        const projectName = allProjects?.find(p => p.id === warehouseId)?.projectName || 
                           allWarehouses?.find(w => w.id === warehouseId)?.name || 
                           warehouseId;

        // Calculate expiry date based on user-specified aging days
        const stockInDate = new Date();
        stockInDate.setHours(0, 0, 0, 0);
        
        const expiryDate = new Date(stockInDate);
        expiryDate.setDate(expiryDate.getDate() + agingDays);

        // Calculate near expiry threshold: 30% of aging days
        const nearExpiryThresholdDays = Math.ceil(agingDays * 0.30);
        const nearExpiryThresholdDate = new Date(stockInDate);
        nearExpiryThresholdDate.setDate(nearExpiryThresholdDate.getDate() + (agingDays - nearExpiryThresholdDays));

        // Calculate initial status based on days elapsed
        let initialStatus = "In Stock";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysElapsed = Math.floor((today - stockInDate) / (1000 * 60 * 60 * 24));
        
        if (daysElapsed >= agingDays) {
          initialStatus = "Expired";
        } else if (daysElapsed >= (agingDays - nearExpiryThresholdDays)) {
          initialStatus = "Near Expiry";
        }

        // 🔍 FETCH WH LOC FROM MATERIALS TAB - Look for existing material with matching itemCode
        let whLocFromMaterials = "";
        const materialWithWHLoc = allMaterials.find(m => m.itemCode === itemCode);
        if (materialWithWHLoc && materialWithWHLoc.whloc) {
          whLocFromMaterials = materialWithWHLoc.whloc;
          console.log(`📍 Found WH LOC from Materials tab: ${itemCode} → ${whLocFromMaterials}`);
        }

        const newMaterial = {
          itemCode: itemCode,
          material: drItem.materialName,
          materialName: drItem.materialName,
          specification: drItem.specification || "-",
          brand: drItem.brand || "-",
          warehouse: warehouseId,
          warehouseName: projectName,
          quantity: parseInt(drItem.quantity || 0),
          unit: drItem.unit || "PCS",
          status: initialStatus,
          stockInDate: stockInDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          agingDays: agingDays,
          nearExpiryThresholdDays: nearExpiryThresholdDays,
          nearExpiryThresholdDate: nearExpiryThresholdDate.toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.email || "unknown",
          sourceDelivery: id,
          mrNo: drItem.mrNo || "",
          poNo: drItem.poNo || "",
          whloc: whLocFromMaterials
        };

        const materialRef = await addDoc(collection(db, "materials"), newMaterial);
        console.log(`✅ Created new material: ${itemCode} (${drItem.materialName}) - DocID: ${materialRef.id} - Stock In: ${stockInDate.toLocaleDateString()}, Expiry: ${expiryDate.toLocaleDateString()}, Near Expiry Threshold: ${nearExpiryThresholdDate.toLocaleDateString()}, Status: ${initialStatus}`);
      }

      itemsProcessed++;
    }

    // Update delivery status
    await updateDoc(doc(db, "deliveries", id), {
      status: "Stocked In",
      stockedInAt: new Date().toISOString(),
      stockedInBy: currentUser?.email || "unknown"
    });

    // Log activity
    await logActivity("stock-in", "create", `Stocked in ${itemsProcessed} items from delivery (Control No: ${delivery.controlNo || 'N/A'}) with ${agingDays} days aging`);

    const nearExpiryThresholdDays = Math.ceil(agingDays * 0.30);
    const daysUntilNearExpiry = agingDays - nearExpiryThresholdDays;
    showAlert(`✅ Successfully stocked in ${itemsProcessed} items!\n⏱️ Expiry: ${agingDays} days from today\n⚠️ Near Expiry: After ${daysUntilNearExpiry} days (when 30% of shelf life remains)\n📋 Edit in Aging tab to customize dates.`, "success");
    
    // Reload both deliveries and materials
    console.log('🔄 Reloading data...');
    await new Promise(resolve => setTimeout(resolve, 500));
    await loadDeliveries();
    await loadMaterials();
    
    // Navigate to stock monitoring
    const stockMonitoringLink = document.querySelector('[data-page="stock-monitoring"]');
    if (stockMonitoringLink) {
      console.log('📍 Navigating to Stock Monitoring tab');
      stockMonitoringLink.click();
    }
  } catch (err) {
    console.error("Error during Stock In:", err);
    showAlert("❌ Error: " + err.message, "error");
  }
};

window.editSchedule = (id) => {
  const record = allScheduleRecords.find(r => r.id === id);
  if (record) {
    editingScheduleId = id;
    document.getElementById("deliveryModalTitle").textContent = "Edit Schedule Record";
    
    // First render the form fields
    renderScheduleForm();
    
    // Then populate with existing data
    setTimeout(() => {
      document.querySelectorAll(".delivery-field").forEach(field => {
        const columnName = field.dataset.column;
        field.value = record[columnName] || "";
      });
      document.getElementById("deliveryModal").style.display = "flex";
    }, 100);
  }
};

window.deleteSchedule = async (id) => {
  const record = allScheduleRecords.find(r => r.id === id);
  const confirmed = await showDeleteConfirmCard("Schedule Record", record?.Item || "Unknown");
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "scheduleRecords", id));
    await logActivity("schedule", "delete", `Deleted schedule record`);
    showAlert("✅ Schedule record deleted!", "success");
    loadScheduleRecords();
  } catch (e) {
    showAlert("❌ Error: " + e.message, "error");
  }
};

// Stock Movement and Delivery Receipt Functions
async function updateStockAfterDelivery(delivery) {
  try {
    const toWarehouseId = delivery.warehouse;
    const fromWarehouseId = delivery.fromWarehouse;
    const isTransfer = !!fromWarehouseId;
    
    for (const item of delivery.items) {
      const material = allMaterials.find(m => m.id === item.materialId);
      if (!material) continue;
      
      const qty = parseInt(item.quantity) || 0;
      
      if (isTransfer) {
        // Stock Out from source warehouse
        const sourceStock = allMaterials.find(m => 
          m.id === item.materialId && m.warehouse === fromWarehouseId
        );
        if (sourceStock) {
          const newQty = Math.max(0, parseInt(sourceStock.quantity || 0) - qty);
          await updateDoc(doc(db, "materials", sourceStock.id), {
            quantity: newQty.toString()
          });
        }
      }
      
      // Stock In to destination warehouse
      const destStockDoc = allMaterials.find(m =>
        m.id === item.materialId && m.warehouse === toWarehouseId
      );
      
      if (destStockDoc) {
        // Update existing stock
        const newQty = parseInt(destStockDoc.quantity || 0) + qty;
        const updateData = {
          quantity: newQty.toString()
        };
        // Ensure specification and brand are included if missing
        if (!destStockDoc.specification && !destStockDoc.specs && item.specification) {
          updateData.specification = item.specification;
        }
        if (!destStockDoc.brand && item.brand) {
          updateData.brand = item.brand;
        }
        await updateDoc(doc(db, "materials", destStockDoc.id), updateData);
      } else {
        // Create new stock entry for this warehouse
        const newMaterial = { ...material };
        newMaterial.warehouse = toWarehouseId;
        newMaterial.quantity = qty.toString();
        // IMPORTANT: Use specification and brand from the delivery item to ensure they're captured
        newMaterial.specification = item.specification || material.specification || material.specs || material.specsbrand || "";
        newMaterial.brand = item.brand || material.brand || "";
        delete newMaterial.id;
        await addDoc(collection(db, "materials"), newMaterial);
      }
    }
    
    // Update daily stock chart data
    const today = new Date().toISOString().split('T')[0];
    const totalStock = allMaterials.reduce((sum, mat) => sum + parseInt(mat.quantity || 0), 0);
    if (!stockChartDailyData) stockChartDailyData = {};
    stockChartDailyData[today] = { stock: totalStock };
    localStorage.setItem("stockChartDailyData", JSON.stringify(stockChartDailyData));
    
    // Reload data
    await loadMaterials();
    updateWeeklyStockChart();
    updateWarehouseChart();
    
  } catch (err) {
    console.error("Error updating stock:", err);
    throw err;
  }
}

function openDeliveryReceiptModal() {
  // Initialize delivery items array if not exists
  if (!window.drCurrentItems) {
    window.drCurrentItems = [];
  }
  
  // Check if we have prepopulated data from purchasing module
  const prepopulateData = localStorage.getItem('_prepopulateDRItem');
  if (prepopulateData) {
    try {
      const itemData = JSON.parse(prepopulateData);
      window.drCurrentItems = [{
        id: Date.now(),
        materialId: itemData.materialId,
        materialName: itemData.material,
        specification: itemData.specification,
        brand: itemData.brand,
        quantity: itemData.quantity,
        unit: itemData.unit,
        mrNo: itemData.mrNo,
        poNo: itemData.poNo,
        remarks: itemData.receivedDate ? `Received: ${itemData.receivedDate}` : ''
      }];
      localStorage.removeItem('_prepopulateDRItem');
      console.log('📋 Delivery Receipt pre-populated with received material:', itemData);
    } catch (e) {
      console.warn('⚠️ Could not prepopulate delivery receipt:', e);
    }
  }
  
  // Remove existing material selector if present
  const existingSelector = document.getElementById("drMaterialSelector");
  if (existingSelector) existingSelector.remove();
  
  // Find the items table and inject the material selector before it
  const itemsTable = document.getElementById("drItemsTable");
  if (!itemsTable) {
    console.error("Items table not found");
    return;
  }
  
  // Create and inject the material selector HTML
  const selectorHTML = `
    <div id="drMaterialSelector" style="background:rgba(10,155,3,0.05);border:1px solid rgba(10,155,3,0.2);border-radius:8px;padding:15px;margin-bottom:20px;">
      <h4 style="margin-top:0;color:#0a9b03;font-size:12px;font-weight:600;margin-bottom:15px;">Add Item to Delivery</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="display:block;color:#a0a0a0;font-size:12px;margin-bottom:5px;">Select Material</label>
          <select id="drAddMaterialSelect" style="width:100%;padding:8px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;box-sizing:border-box;">
            <option value="">Choose material...</option>
          </select>
        </div>
        <div>
          <label style="display:block;color:#a0a0a0;font-size:12px;margin-bottom:5px;">PO Number</label>
          <input type="text" id="drAddPONo" placeholder="e.g., PO001" style="width:100%;padding:8px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;color:#a0a0a0;font-size:12px;margin-bottom:5px;">Quantity</label>
          <input type="number" id="drAddQty" placeholder="0" min="1" style="width:100%;padding:8px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;box-sizing:border-box;">
        </div>
        <div style="display:flex;align-items:flex-end;">
          <button type="button" id="addItemButton" style="width:100%;background:#0a9b03;color:white;border:none;padding:8px;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;">Add Item</button>
        </div>
      </div>
    </div>
  `;
  
  // Insert before the items table
  itemsTable.parentElement.insertAdjacentHTML("beforebegin", selectorHTML);
  
  // Give the DOM a moment to update, then populate and setup events
  setTimeout(() => {
    // Populate material select
    const matSelect = document.getElementById("drAddMaterialSelect");
    if (matSelect && allMaterials && allMaterials.length > 0) {
      matSelect.innerHTML = '<option value="">Choose material...</option>';
      const uniqueMaterials = {};
      
      allMaterials.forEach(m => {
        // Use material ID as unique key
        const key = m.id || m.material;
        if (!uniqueMaterials[key]) {
          uniqueMaterials[key] = m;
        }
      });
      
      Object.values(uniqueMaterials).forEach(mat => {
        const displayText = `${mat.material || mat.materialName} | Spec: ${mat.specification || '-'} | Brand: ${mat.brand || '-'}`;
        const optionValue = mat.id || mat.material;
        matSelect.innerHTML += `<option value="${optionValue}">${displayText}</option>`;
      });
      
      console.log("Material dropdown populated with", Object.keys(uniqueMaterials).length, "items");
    }
    
    // Set up the add item button listener
    const addItemBtn = document.getElementById("addItemButton");
    if (addItemBtn) {
      // Remove any previous listeners and rebind
      addItemBtn.onclick = function(e) {
        e.preventDefault();
        const materialId = document.getElementById("drAddMaterialSelect").value;
        const qty = document.getElementById("drAddQty").value;
        const poNo = document.getElementById("drAddPONo").value;
        
        if (!materialId) {
          showAlert("Please select a material first", "error");
          return;
        }
        
        if (!qty || parseInt(qty) <= 0) {
          showAlert("Please enter a valid quantity", "error");
          return;
        }
        
        if (!poNo || poNo.trim() === "") {
          showAlert("Please enter PO Number - this links delivery to Purchase Order tracking", "warning");
          return;
        }
        
        const material = allMaterials.find(m => (m.id || m.material) === materialId);
        if (!material) {
          showAlert("Material not found", "error");
          return;
        }
        
        const newItem = {
          id: Date.now(),
          materialId: material.id || material.material,
          itemCode: material.itemCode || "",
          materialName: material.material || material.materialName,
          specification: material.specification || "-",
          brand: material.brand || "-",
          quantity: qty,
          unit: material.unit || "PCS",
          mrNo: "",
          poNo: poNo.trim(),  // CAPTURE PO NUMBER
          remarks: ""
        };
        
        if (!window.drCurrentItems) window.drCurrentItems = [];
        window.drCurrentItems.push(newItem);
        
        console.log('✅ Added delivery item with PO:', newItem.poNo);
        
        renderDeliveryReceiptItems();
        
        // Reset inputs
        document.getElementById("drAddMaterialSelect").value = "";
        document.getElementById("drAddPONo").value = "";
        document.getElementById("drAddQty").value = "";
        showAlert("✅ Item added with PO: " + poNo, "success");
      };
      
      console.log("Add Item button listener attached");
    }

    // Populate MR select dropdown
    const mrSelect = document.getElementById("drMRNo");
    if (mrSelect && allMaterialRequests && allMaterialRequests.length > 0) {
      mrSelect.innerHTML = '<option value="">Select MR to auto-populate items</option>';
      
      // Filter pending and ordered MRs
      const availableMRs = allMaterialRequests.filter(mr => 
        mr.status === "Pending" || mr.status === "Ordered"
      );
      
      availableMRs.forEach(mr => {
        const warehouseName = allWarehouses?.find(w => w.id === mr.warehouse)?.name || mr.warehouse;
        const displayText = `${mr.mrNo} - ${warehouseName} (${mr.items?.length || 0} items)`;
        mrSelect.innerHTML += `<option value="${mr.id}" data-mr-no="${mr.mrNo}">${displayText}</option>`;
      });
      
      console.log("MR dropdown populated with", availableMRs.length, "items");
    }

    // Set up MR selection listener
    const mrSelectElement = document.getElementById("drMRNo");
    if (mrSelectElement) {
      mrSelectElement.onchange = function() {
        const selectedMrId = this.value;
        if (!selectedMrId) {
          window.drCurrentItems = [];
          renderDeliveryReceiptItems();
          showAlert("✅ Items cleared. Ready to add manually.", "info");
          return;
        }

        const selectedMR = allMaterialRequests.find(mr => mr.id === selectedMrId);
        if (!selectedMR) {
          showAlert("❌ MR not found", "error");
          return;
        }

        // Load items from MR
        window.drCurrentItems = [];
        if (selectedMR.items && selectedMR.items.length > 0) {
          selectedMR.items.forEach(item => {
            const drItem = {
              id: Date.now() + Math.random(),
              materialId: item.materialId,
              itemCode: item.itemCode || "",
              materialName: item.materialName,
              specification: item.specification || "-",
              brand: item.brand || "-",
              quantity: item.quantity,
              unit: item.unit || "PCS",
              mrNo: selectedMR.mrNo,
              poNo: "",
              remarks: ""
            };
            window.drCurrentItems.push(drItem);
          });

          // Auto-fill warehouse if MR has one
          const drWarehouseSelect = document.getElementById("drWarehouse");
          if (drWarehouseSelect && selectedMR.warehouse) {
            drWarehouseSelect.value = selectedMR.warehouse;
          }

          renderDeliveryReceiptItems();
          showAlert(`✅ Loaded ${window.drCurrentItems.length} items from ${selectedMR.mrNo}`, "success");
        } else {
          showAlert("❌ MR has no items", "error");
        }
      };
      
      console.log("MR select listener attached");
    }
  }, 100);
}
async function logActivity(type, action, details) {
  try {
    // Use email as primary identifier (more reliable than name)
    const userEmail = currentUser?.email || "system@unknown.com";
    const userName = currentUser?.name || "Unknown User";
    
    await addDoc(collection(db, "activityLog"), {
      type: type,
      action: action,
      details: details,
      user: userName,
      userEmail: userEmail,
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString()
    });
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

// Delivery Pagination state
window.deliveryPaginationState = {
  allDeliveries: [],
  filteredDeliveries: [],
  currentPage: 1,
  itemsPerPage: 20,
  filterMonth: "",
  filterYear: "",
  searchQuery: ""
};

window.filterDeliveries = function(deliveries, filterMonth = "", filterYear = "", searchQuery = "") {
  return deliveries.filter(delivery => {
    // Date filtering
    if (filterMonth || filterYear) {
      const deliveryDate = delivery.deliveryDate || delivery.Date || delivery.date || "";
      if (deliveryDate) {
        const date = new Date(deliveryDate);
        const logMonth = (date.getMonth() + 1).toString();
        const logYear = date.getFullYear().toString();
        
        if (filterMonth && logMonth !== filterMonth) return false;
        if (filterYear && logYear !== filterYear) return false;
      }
    }
    
    if (searchQuery) {
      const searchStr = JSON.stringify(delivery).toLowerCase();
      if (!searchStr.includes(searchQuery.toLowerCase())) return false;
    }
    
    return true;
  });
}

window.renderDeliveriesTableWithPagination = function(deliveries, filterMonth = "", filterYear = "", searchQuery = "") {
  window.deliveryPaginationState.filterMonth = filterMonth;
  window.deliveryPaginationState.filterYear = filterYear;
  window.deliveryPaginationState.searchQuery = searchQuery;
  
  const filtered = window.filterDeliveries(deliveries, filterMonth, filterYear, searchQuery);
  window.deliveryPaginationState.filteredDeliveries = filtered;
  window.deliveryPaginationState.currentPage = 1;
  
  window.displayDeliveryPage();
}

window.displayDeliveryPage = function() {
  const filtered = window.deliveryPaginationState.filteredDeliveries;
  const itemsPerPage = window.deliveryPaginationState.itemsPerPage;
  const currentPage = window.deliveryPaginationState.currentPage;
  
  const deliveryBody = document.getElementById("deliveryBody");
  if (!deliveryBody) return;
  
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filtered.slice(startIdx, endIdx);
  
  deliveryBody.innerHTML = "";
  
  // Pre-fetch all delivery statuses before rendering
  (async () => {
    const deliveryStatusMap = {};
    
    console.log('⏳ Pre-fetching delivery statuses for pagination page...');
    
    // Fetch status for each delivery on this page
    await Promise.all(pageItems.map(async (delivery) => {
      try {
        const linkedStatus = await getLinkedDeliveryStatus(delivery);
        deliveryStatusMap[delivery.id] = linkedStatus;
        console.log(`✅ Status for delivery ${delivery.id}:`, linkedStatus);
      } catch (e) {
        console.error(`❌ Error fetching status for delivery ${delivery.id}:`, e);
        deliveryStatusMap[delivery.id] = 'Error';
      }
    }));
    
    // Now render the rows with pre-fetched statuses
    pageItems.forEach(delivery => {
      let row = `<tr>`;
      
      // Use default columns if deliveryColumns is empty
      const cols = deliveryColumns && deliveryColumns.length > 0 ? deliveryColumns : [
        { name: "Date" }, { name: "Warehouse" }, { name: "Control No" }, 
        { name: "Client PO" }, { name: "Items Count" }, { name: "Type" }, { name: "Status" }
      ];
      
      cols.forEach(col => {
        let cellContent = "-";
        let cellStyle = "padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;";
        
        if (col.name === 'Date') {
          cellContent = delivery.date || "-";
        } else if (col.name === 'Warehouse' || col.name === 'Project') {
          cellContent = allWarehouses?.find(w => w.id === delivery.warehouse)?.name || allProjects?.find(p => p.id === delivery.warehouse)?.projectName || delivery.warehouse || "-";
        } else if (col.name === 'Control No') {
          cellContent = delivery.controlNo || "-";
        } else if (col.name === 'Client PO') {
          cellContent = delivery.clientPO || "-";
        } else if (col.name === 'Items Count') {
          cellContent = delivery.itemsCount || 0;
        } else if (col.name === 'Type') {
          // Check if already stocked in
          const isStockedIn = delivery.status === "Stocked In";
          const buttonStyle = isStockedIn 
            ? "padding:6px 12px;background:#808080;color:white;border:none;border-radius:4px;cursor:not-allowed;font-size:11px;font-weight:600;white-space:nowrap;opacity:0.6;"
            : "padding:6px 12px;background:#15c524;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
          const buttonText = isStockedIn ? "Stocked" : "Stock In";
          const buttonClick = isStockedIn ? "" : `onclick="stockInDelivery('${delivery.id}')"`;
          cellContent = `<button ${buttonClick} style="${buttonStyle}">${buttonText}</button>`;
          row += `<td style="${cellStyle}">${cellContent}</td>`;
          return;  // Skip the default cell rendering for this column
        } else if (col.name === 'Status') {
          cellContent = deliveryStatusMap[delivery.id] || "Fetching...";
          cellStyle += "font-weight:600;";
          
          // Apply color based on status
          if (cellContent.includes('FULLY RECEIVED')) {
            cellStyle += "color:#0a9b03;";
          } else if (cellContent.includes('PARTIALLY RECEIVED') || cellContent.includes('PARTIAL')) {
            cellStyle += "color:#ffa500;";
          } else if (cellContent.includes('PENDING')) {
            cellStyle += "color:#ff1744;";
          } else if (cellContent === 'Error') {
            cellStyle += "color:#ff6b6b;";
          }
        }
        
        row += `<td style="${cellStyle}">${cellContent}</td>`;
      });
      
      row += `<td style="padding:12px;text-align:center;border-bottom:1px solid rgba(10,155,3,.1);">
        <button class="btn-edit" onclick="viewDeliveryReceipt('${delivery.id}')" style="padding:6px 10px;background:#0a9b03;color:white;border:none;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;">View</button>
        <button class="btn-edit" onclick="editDeliveryControlNo('${delivery.id}')" style="padding:6px 10px;background:#1976d2;color:white;border:none;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;margin-left:4px;">Edit</button>
        <button class="btn-delete" onclick="deleteDelivery('${delivery.id}')" style="padding:6px 10px;background:#d32f2f;color:white;border:none;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;margin-left:4px;">Delete</button>
      </td></tr>`;
      deliveryBody.innerHTML += row;
    });
    
    if (pageItems.length === 0) {
      const cols = deliveryColumns && deliveryColumns.length > 0 ? deliveryColumns.length : 7;
      deliveryBody.innerHTML = `<tr><td colspan='${cols + 1}' style='text-align:center;padding:30px;color:#a0a0a0;'>No deliveries found</td></tr>`;
    }
    
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    window.updateDeliveryPaginationInfo(totalPages);
    window.updateDeliveryPaginationButtons(totalPages);
    
    console.log('✅ Delivery page rendered with', pageItems.length, 'items');
  })();
}

window.renderScheduleTable = function(records) {
  const scheduleBody = document.getElementById("deliveryScheduleBody");
  const scheduleHeader = document.getElementById("scheduleHeaderRow");
  
  if (!scheduleBody || !scheduleHeader) return;
  
  scheduleBody.innerHTML = "";
  
  // Render header row with columns
  scheduleHeader.innerHTML = "";
  if (scheduleColumns && scheduleColumns.length > 0) {
    scheduleColumns.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col.label || col.name;
      scheduleHeader.appendChild(th);
    });
    
    // Add actions column header
    const actionTh = document.createElement("th");
    actionTh.textContent = "Actions";
    scheduleHeader.appendChild(actionTh);
  }
  
  // Render data rows
  if (records && records.length > 0) {
    records.forEach(record => {
      let row = `<tr>`;
      scheduleColumns.forEach(col => {
        row += `<td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;">${record[col.name] || "-"}</td>`;
      });
      row += `<td style="padding:12px;text-align:center;">
        <button class="btn-edit" onclick="editSchedule('${record.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteSchedule('${record.id}')" style="margin-left:4px;">Delete</button>
      </td></tr>`;
      scheduleBody.innerHTML += row;
    });
  } else {
    scheduleBody.innerHTML = `<tr><td colspan='${(scheduleColumns?.length || 1) + 1}' style='text-align:center;padding:30px;color:#a0a0a0;'>No data found</td></tr>`;
  }
}

window.updateDeliveryPaginationInfo = function(totalPages) {
  const pageInfo = document.getElementById("deliveryPageInfo");
  if (pageInfo) {
    const currentPage = window.deliveryPaginationState.currentPage;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  }
}

window.updateDeliveryPaginationButtons = function(totalPages) {
  const prevBtn = document.getElementById("deliveryPrevBtn");
  const nextBtn = document.getElementById("deliveryNextBtn");
  const currentPage = window.deliveryPaginationState.currentPage;
  
  if (prevBtn) {
    prevBtn.disabled = currentPage === 1;
    prevBtn.style.opacity = currentPage === 1 ? "0.5" : "1";
    prevBtn.style.cursor = currentPage === 1 ? "not-allowed" : "pointer";
  }
  
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.style.opacity = currentPage >= totalPages ? "0.5" : "1";
    nextBtn.style.cursor = currentPage >= totalPages ? "not-allowed" : "pointer";
  }
}

window.nextDeliveryPage = function() {
  const filtered = window.deliveryPaginationState.filteredDeliveries;
  const itemsPerPage = window.deliveryPaginationState.itemsPerPage;
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  
  if (window.deliveryPaginationState.currentPage < totalPages) {
    window.deliveryPaginationState.currentPage++;
    window.displayDeliveryPage();
  }
}

window.previousDeliveryPage = function() {
  if (window.deliveryPaginationState.currentPage > 1) {
    window.deliveryPaginationState.currentPage--;
    window.displayDeliveryPage();
  }
}

window.updateDeliveryFilters = function(deliveries) {
  const filterYear = document.getElementById("filterDeliveryYear");
  if (filterYear) {
    // Extract unique years from deliveries
    const years = new Set();
    deliveries.forEach(delivery => {
      const deliveryDate = delivery.deliveryDate || delivery.Date || delivery.date || "";
      if (deliveryDate) {
        const date = new Date(deliveryDate);
        const year = date.getFullYear();
        // Only add valid years (not NaN)
        if (!isNaN(year) && year > 1900) {
          years.add(year);
        }
      }
    });
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const currentValue = filterYear.value;
    
    filterYear.innerHTML = '<option value="">All Years</option>';
    sortedYears.forEach(year => {
      filterYear.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    if (currentValue) filterYear.value = currentValue;
  }
}

// Pagination state
window.activityPaginationState = {
  allActivities: [],
  filteredActivities: [],
  currentPage: 1,
  itemsPerPage: 20,
  filterType: "",
  filterMonth: "",
  filterYear: "",
  searchQuery: ""
};

window.loadActivityLog = async function() {
  try {
    const snap = await getDocs(collection(db, "activityLog"));
    const activities = [];
    snap.forEach(doc => {
      activities.push({ id: doc.id, ...doc.data() });
    });
    
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    window.activityPaginationState.allActivities = activities;
    window.activityPaginationState.currentPage = 1;
    renderActivityLog(activities);
    updateActivityFilters(activities);
  } catch (err) {
    console.error("Error loading activity log:", err);
  }
}

window.filterActivityLog = function(activities, filterType = "", filterMonth = "", filterYear = "", searchQuery = "") {
  return activities.filter(log => {
    if (filterType && log.type !== filterType) return false;
    
    // Date filtering
    if (filterMonth || filterYear) {
      const date = new Date(log.timestamp);
      const logMonth = (date.getMonth() + 1).toString();
      const logYear = date.getFullYear().toString();
      
      if (filterMonth && logMonth !== filterMonth) return false;
      if (filterYear && logYear !== filterYear) return false;
    }
    
    if (searchQuery && !JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
}

window.renderActivityLog = function(activities, filterType = "", filterMonth = "", filterYear = "", searchQuery = "") {
  // Update pagination state
  window.activityPaginationState.filterType = filterType;
  window.activityPaginationState.filterMonth = filterMonth;
  window.activityPaginationState.filterYear = filterYear;
  window.activityPaginationState.searchQuery = searchQuery;
  
  // Filter activities
  const filtered = window.filterActivityLog(activities, filterType, filterMonth, filterYear, searchQuery);
  window.activityPaginationState.filteredActivities = filtered;
  window.activityPaginationState.currentPage = 1;
  
  // Calculate pagination
  const itemsPerPage = window.activityPaginationState.itemsPerPage;
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIdx = (window.activityPaginationState.currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filtered.slice(startIdx, endIdx);
  
  // Render table rows
  const activityBody = document.getElementById("activityBody");
  if (!activityBody) return;
  activityBody.innerHTML = "";

  pageItems.forEach(log => {
    const date = new Date(log.timestamp);
    const timeStr = date.toLocaleString();
    const userDisplay = log.userEmail && log.userEmail !== "system@unknown.com" ? log.userEmail : log.user || "Unknown";
    const actionColor = log.action === "delete" || log.action === "delete_stock" ? "#ff6b6b" : (log.action.includes("update") || log.action.includes("edit") ? "#ffa500" : "#0a9b03");
    const detailsText = typeof log.details === 'string' ? log.details : JSON.stringify(log.details);
    
    activityBody.innerHTML += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;font-size:12px;">${timeStr}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#e0e0e0;font-weight:600;">${userDisplay}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);"><span style="background:rgba(10,155,3,.2);color:#0a9b03;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${log.type.toUpperCase()}</span></td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);"><span style="background:rgba(${actionColor === '#ff6b6b' ? '255,107,107' : actionColor === '#ffa500' ? '255,165,0' : '10,155,3'},.2);color:${actionColor};padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;">${log.action.toUpperCase().replace(/_/g, ' ')}</span></td>
        <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#a0a0a0;font-size:13px;word-wrap:break-word;word-break:break-word;white-space:normal;max-width:600px;" title="${detailsText}">${detailsText}</td>
      </tr>
    `;
  });

  if (pageItems.length === 0) {
    activityBody.innerHTML = "<tr><td colspan='5' style='text-align:center;padding:30px;color:#a0a0a0;'>No activities found</td></tr>";
  }
  
  // Update pagination info
  window.updateActivityPaginationInfo(totalPages);
  window.updateActivityPaginationButtons(totalPages);
}

window.updateActivityPaginationInfo = function(totalPages) {
  const pageInfo = document.getElementById("activityPageInfo");
  if (pageInfo) {
    const currentPage = window.activityPaginationState.currentPage;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }
}

window.updateActivityPaginationButtons = function(totalPages) {
  const prevBtn = document.getElementById("activityPrevBtn");
  const nextBtn = document.getElementById("activityNextBtn");
  const currentPage = window.activityPaginationState.currentPage;
  
  if (prevBtn) {
    prevBtn.disabled = currentPage === 1;
    prevBtn.style.opacity = currentPage === 1 ? "0.5" : "1";
    prevBtn.style.cursor = currentPage === 1 ? "not-allowed" : "pointer";
  }
  
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.style.opacity = currentPage >= totalPages ? "0.5" : "1";
    nextBtn.style.cursor = currentPage >= totalPages ? "not-allowed" : "pointer";
  }
}

window.nextActivityPage = function() {
  const filtered = window.activityPaginationState.filteredActivities;
  const itemsPerPage = window.activityPaginationState.itemsPerPage;
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  
  if (window.activityPaginationState.currentPage < totalPages) {
    window.activityPaginationState.currentPage++;
    window.displayActivityPage();
  }
}

window.previousActivityPage = function() {
  if (window.activityPaginationState.currentPage > 1) {
    window.activityPaginationState.currentPage--;
    window.displayActivityPage();
  }
}

window.displayActivityPage = function() {
  const filtered = window.activityPaginationState.filteredActivities;
  const itemsPerPage = window.activityPaginationState.itemsPerPage;
  const currentPage = window.activityPaginationState.currentPage;
  
  const activityBody = document.getElementById("activityBody");
  if (!activityBody) return;
  
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = filtered.slice(startIdx, endIdx);
  
  activityBody.innerHTML = "";
  pageItems.forEach(log => {
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
  
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  window.updateActivityPaginationInfo(totalPages);
  window.updateActivityPaginationButtons(totalPages);
}

window.updateActivityFilters = function(activities) {
  const filterYear = document.getElementById("filterActivityYear");
  if (filterYear) {
    // Extract unique years from activities
    const years = new Set();
    activities.forEach(activity => {
      const date = new Date(activity.timestamp);
      years.add(date.getFullYear());
    });
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const currentValue = filterYear.value;
    
    filterYear.innerHTML = '<option value="">All Years</option>';
    sortedYears.forEach(year => {
      filterYear.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    if (currentValue) filterYear.value = currentValue;
  }
}



// ==================== DOM CONTENT LOADED ====================
document.addEventListener("DOMContentLoaded", () => {
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

  // Handle navigation from admin panel
  const navigateToWarehouse = sessionStorage.getItem('navigateToWarehouse');
  const filterUserStatus = sessionStorage.getItem('filterUserStatus');
  
  if (navigateToWarehouse === 'true') {
    sessionStorage.removeItem('navigateToWarehouse');
    setTimeout(() => {
      // Navigate to Settings page and show Warehouse tab
      const settingsLink = document.querySelector('[data-page="settings"]');
      if (settingsLink) {
        settingsLink.click();
        window.switchSettingsTab('warehouse');
      }
    }, 500);
  }

  // Handle MR creation from warehouse dashboard
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('openMR') === 'true') {
    // Switch to dashboard tab and open MR modal
    setTimeout(() => {
      const addMRBtn = document.getElementById("addMRBtn");
      if (addMRBtn) {
        addMRBtn.click();
      }
    }, 500);
  }

  document.querySelectorAll(".nav-link").forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav-link").forEach(x => x.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".page").forEach(p => p.style.display = "none");
      const target = document.getElementById(link.dataset.page);
      if (target) target.style.display = "block";
      
      // Close sidebar automatically after clicking a nav link
      sidebar.classList.remove("active");
      
      if (link.dataset.page === "dashboard") {
        loadMaterials();
        updateMaterialSummaries("all");
        loadMaterialRequests();
      }
      if (link.dataset.page === "users") loadUsers();
      if (link.dataset.page === "settings") {
        // refresh warehouses (now projects renamed) and ensure project list is fetched as well
        loadWarehouses();
        const body = document.getElementById("warehouseBody");
        if (body) {
          body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#e0e0e0;padding:20px;">Loading projects...</td></tr>';
        }
        loadProjects().catch(e=>console.error('loadProjects in nav click failed',e));
      }
      if (link.dataset.page === "stock-monitoring") {
        renderMaterials("all");
        updateMaterialSummaries("all");
      }
      if (link.dataset.page === "materials") {
        renderMaterials2("all");
        updateMaterialSummaries2();
      }
      if (link.dataset.page === "delivery-receipt") {
        loadDeliveryColumns();
        loadDeliveries();
      }
      if (link.dataset.page === "delivery-schedule") {
        loadScheduleColumns();
        loadScheduleRecords();
      }
    };
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

  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.onclick = () => window.location.href = "modules.html";
  }

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    const materialDropdown = document.getElementById("moreMaterialDropdown");
    const materialBtn = document.getElementById("moreMaterialBtn");
    if (materialDropdown && materialBtn && !materialBtn.contains(e.target) && !materialDropdown.contains(e.target)) {
      materialDropdown.style.display = "none";
    }

    const deliveryDropdown = document.getElementById("moreDeliveryDropdown");
    const deliveryBtn = document.getElementById("moreDeliveryBtn");
    if (deliveryDropdown && deliveryBtn && !deliveryBtn.contains(e.target) && !deliveryDropdown.contains(e.target)) {
      deliveryDropdown.style.display = "none";
    }
  });

  unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (sessionStorage.getItem('isLoggingOut') === 'true') return;
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    try {
      let userData = null;
      
      // Check admin_users collection first
      let userSnap = await getDoc(doc(db, "admin_users", user.uid));
      if (userSnap.exists()) {
        userData = userSnap.data();
      } else {
        // Then check other collections
        const collections = ["inventory_users", "warehouse_users", "purchasing_users", "attendance_users"];
        for (const collName of collections) {
          try {
            userSnap = await getDoc(doc(db, collName, user.uid));
            if (userSnap.exists()) {
              userData = userSnap.data();
              break;
            }
          } catch (e) {
            // Continue to next collection
          }
        }
      }
      
      if (!userData) {
        window.location.href = "login.html";
        return;
      }
      currentUser = { id: user.uid, ...userData };
      const roleEl = document.getElementById("currentUserRole");
      if (roleEl) {
        roleEl.textContent = (userData.role || "").toUpperCase();
        // Add click handler to show profile modal
        roleEl.addEventListener("click", () => {
          showUserProfile();
        });
      }
      
      // If user is warehouse staff, redirect them to warehouse dashboard
      if (userData.role === "warehouse") {
        window.location.href = "warehouse-dashboard.html";
        return;
      }
      
      // Initialize daily stock chart data tracking
      loadStockChartDailyData();
      startMidnightStockUpdate();
      
      // Load materials and update dashboard summary on page load
      await loadMaterials();
      updateMaterialSummaries("all");
      // preload warehouse/project data so settings page renders instantly
      await loadWarehouses();
      await loadProjects();
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

  const userModal = document.getElementById("userModal");
  const materialModal = document.getElementById("materialModal");
  const warehouseModal = document.getElementById("warehouseModal");
  const deliveryModal = document.getElementById("deliveryModal");

  if (document.getElementById("addUserBtn")) {
    document.getElementById("addUserBtn").onclick = () => {
      editingUserId = null;
      document.getElementById("modalTitle").textContent = "Add User";
      document.getElementById("userName").value = "";
      document.getElementById("userEmail").value = "";
      document.getElementById("userRole").value = "";
      document.getElementById("userWarehouse").value = "";
      document.getElementById("warehouseGroup").style.display = "block";
      userModal.style.display = "flex";
    };
  }

  if (document.getElementById("closeModalBtn")) {
    document.getElementById("closeModalBtn").onclick = () => {
      userModal.style.display = "none";
    };
  }

  if (document.getElementById("cancelUserBtn")) {
    document.getElementById("cancelUserBtn").onclick = () => {
      userModal.style.display = "none";
    };
  }

  if (document.getElementById("saveUserBtn")) {
    document.getElementById("saveUserBtn").onclick = async () => {
      const name = (document.getElementById("userName").value || "").trim();
      const email = (document.getElementById("userEmail").value || "").trim();
      const role = (document.getElementById("userRole").value || "").trim();
      const warehouse = (document.getElementById("userWarehouse").value || "").trim();

      if (!name || !email || !role) {
        showAlert("Fill in all required fields", "error");
        return;
      }

      try {
        if (!editingUserId) {
          const tempPassword = "TempPass@" + Math.random().toString(36).slice(2, 10);
          
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
            const userId = userCredential.user.uid;

            const userData = { 
              name, 
              email, 
              role, 
              warehouse, 
              status: "active",
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, "users", userId), userData);
            
            await logActivity("user", "create", `Created user: ${email}`);
            showAlert("User created successfully!", "success");
            userModal.style.display = "none";
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
          const userData = { name, email, role, warehouse };
          await updateDoc(doc(db, "users", editingUserId), userData);
          await logActivity("user", "update", `Updated user: ${email}`);
          showAlert("User updated!", "success");
          userModal.style.display = "none";
          loadUsers();
        }
      } catch (err) {
        showAlert("Error saving user: " + err.message, "error");
      }
    };
  }



  if (document.getElementById("addMaterialBtn2")) {
    document.getElementById("addMaterialBtn2").onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      usingMaterialColumns2 = true;
      await openMaterialModal();
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
      
      const isStockMonitoringTab = !usingMaterialColumns2;
      
      // For Stock Monitoring, validate material selection and save with quantity
      if (isStockMonitoringTab) {
        // Get selected material ID from hidden field OR directly from dropdown as fallback
        let selectedMaterialId = null;
        const selectedIdInput = document.getElementById("selectedMaterialId");
        const materialSelect = document.getElementById("materialSearchInput");
        
        // Try hidden field first, fallback to dropdown
        if (selectedIdInput && selectedIdInput.value) {
          selectedMaterialId = selectedIdInput.value;
        } else if (materialSelect && materialSelect.value) {
          selectedMaterialId = materialSelect.value;
        }
        
        if (!selectedMaterialId) {
          showAlert("Please select a material", "error");
          return;
        }
        
        const selectedMaterial = allMaterials.find(m => m.id === selectedMaterialId);
        
        if (!selectedMaterial) {
          showAlert("Material not found", "error");
          return;
        }

        // Get quantity and warehouse from form
        const quantityInput = document.getElementById("matquantity");
        if (!quantityInput || !quantityInput.value) {
          showAlert("Please enter quantity", "error");
          return;
        }
        
        const warehouseSelect = document.getElementById("matwarehouse");
        let warehouse = warehouseSelect?.value || "";
        
        // If editing existing material and warehouse not selected, use material's original warehouse
        if (editingMaterialId && !warehouse) {
          warehouse = selectedMaterial.warehouse;
        }
        
        // Only require warehouse if adding new stock
        if (!warehouse && !editingMaterialId) {
          showAlert("Please select a warehouse", "error");
          return;
        }
        
        const quantity = parseInt(quantityInput.value) || 0;

        try {
          // Check if there's already a stock record for this material in this warehouse
          // If yes, just add to it. If no, create/update this record.
          const materialItemCode = selectedMaterial.itemCode;
          const materialName = selectedMaterial.material;
          
          // Query for existing stock with same itemCode, material, and warehouse
          const q = query(
            collection(db, "materials"),
            where("itemCode", "==", materialItemCode),
            where("material", "==", materialName),
            where("warehouse", "==", warehouse)
          );
          
          const existingQuerySnap = await getDocs(q);
          let targetMaterialId = selectedMaterialId;
          let currentData = {};
          
          if (existingQuerySnap.docs.length > 0) {
            // Found existing stock - verify specification and brand also match before merging
            const candidateDoc = existingQuerySnap.docs[0];
            const candidateData = candidateDoc.data();
            
            const candidateSpec = (candidateData.specification || "-");
            const selectedSpec = (selectedMaterial.specification || "-");
            const candidateBrand = (candidateData.brand || "-");
            const selectedBrand = (selectedMaterial.brand || "-");
            
            // Only merge if specification and brand also match
            if (candidateSpec === selectedSpec && candidateBrand === selectedBrand) {
              // Use that record instead
              targetMaterialId = candidateDoc.id;
              currentData = candidateData;
            } else {
              // Different specification or brand - create new record instead
              targetMaterialId = selectedMaterialId;
              const currentDoc = await getDoc(doc(db, "materials", selectedMaterialId));
              if (!currentDoc.exists()) {
                showAlert("Material not found in database", "error");
                return;
              }
              currentData = currentDoc.data();
            }
          } else {
            // No existing stock in warehouse - fetch the selected material record
            const currentDoc = await getDoc(doc(db, "materials", selectedMaterialId));
            if (!currentDoc.exists()) {
              showAlert("Material not found in database", "error");
              return;
            }
            currentData = currentDoc.data();
          }
          
          const databaseQuantity = parseInt(currentData.quantity) || 0;
          const formQuantity = quantity; // What user entered in form
          
          // DISTINGUISH between EDIT and ADD modes:
          // - EDIT mode (editingMaterialId set): User is setting a NEW TOTAL - use form value as-is
          // - ADD mode (editingMaterialId null): User is adding an AMOUNT - add to database value
          let newQuantity;
          if (editingMaterialId) {
            // EDIT mode: Form shows current value, user changed it to a new total
            newQuantity = formQuantity;
          } else {
            // ADD mode: Form was empty, user entered amount to add
            newQuantity = databaseQuantity + formQuantity;
          }
          
          const quantityChange = editingMaterialId ? (formQuantity - databaseQuantity) : formQuantity;
          
          // Prepare update data with ALL fields from the current database record
          const updateData = {
            ...currentData, // Copy ALL existing fields from database
            quantity: newQuantity,
            warehouse: warehouse,
            updatedAt: new Date().toISOString()
          };
          
          // If current record doesn't have spec/whloc but selectedMaterial does, copy them
          if (!updateData.specification && !updateData.specs && selectedMaterial) {
            const specValue = selectedMaterial.specification || selectedMaterial.specs || selectedMaterial.specsbrand;
            if (specValue) {
              updateData.specification = specValue;
            }
          }
          
          if (!updateData.whloc && selectedMaterial) {
            const whloc = selectedMaterial.whloc;
            if (whloc) {
              updateData.whloc = whloc;
            }
          }
          
          // Update the material with ALL data
          await updateDoc(doc(db, "materials", targetMaterialId), updateData);
          
          // Log stock movement
          const movementType = editingMaterialId ? "adjustment" : "add";
          const warehouseName = allWarehouses.find(w => w.id === warehouse)?.name || warehouse;
          
          await logStockMovement(selectedMaterialId, warehouse, movementType, quantityChange, {
            notes: `${movementType === "add" ? "Added" : "Adjusted"} stock: ${databaseQuantity} → ${newQuantity} units in ${warehouseName}`
          });
          
          // Log detailed activity with all stock information
          if (editingMaterialId) {
            await logActivity("material", "edit_stock", `EDITED Stock - Material: ${materialName}, Warehouse: ${warehouseName}, Previous Qty: ${databaseQuantity}, New Qty: ${newQuantity}, Change: ${quantityChange > 0 ? '+' : ''}${quantityChange} units`);
          } else {
            await logActivity("material", "add_stock", `ADDED Stock - Material: ${materialName}, Warehouse: ${warehouseName}, Quantity Added: +${quantity} units, Total: ${newQuantity} units`);
          }
          
          materialModal.style.display = "none";
          editingMaterialId = null;
          await loadMaterials();
          renderMaterials("all");
          updateMaterialSummaries();
          showAlert("Material added to stock monitoring!", "success");
        } catch (err) {
          showAlert("Error saving material to stock: " + err.message, "error");
          console.error("Save error:", err);
        }
      } else {
        // Materials tab - save all fields
        const materialData = {
          updatedAt: new Date().toISOString()
        };
        let isValid = true;

        const cols = materialColumns2;

        cols.forEach(col => {
          const fieldId = col.name.toLowerCase().replace(/\s+/g, '');
          const inputElement = document.getElementById(`mat${fieldId}`);
          // Materials tab doesn't have Warehouse field - only Stock Monitoring does
          const isRequired = ["Item Code", "Material", "Quantity"].includes(col.name);
          
          if (!inputElement) return;

          const value = inputElement.value.trim();
          
          if (isRequired && !value) {
            isValid = false;
            return;
          }

          if (col.name === "Item Code") {
            materialData.itemCode = value;
          } else if (col.name === "Material") {
            materialData.material = value;
          } else if (col.name === "Description") {
            materialData.description = value;
          } else if (col.name === "Category") {
            materialData.category = value;
          } else if (col.name === "Specification") {
            materialData.specification = value;
          } else if (col.name === "Brand") {
            materialData.brand = value;
          } else if (col.name === "Quantity") {
            materialData.quantity = parseInt(value) || 0;
          } else if (col.name === "Warehouse") {
            materialData.warehouse = value;
          } else if (col.name === "Expiry Date") {
            // Convert date string to ISO format
            materialData.expiryDate = value ? new Date(value).toISOString() : null;
          } else if (col.name === "Status") {
            // Status is computed, skip
          } else {
            // Custom columns - store with normalized key (remove all special characters)
            const normalizedKey = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            materialData[normalizedKey] = value;
          }
        });

        // If category is empty and user is on Materials tab, auto-fill with current category
        if (!materialData.category && selectedCategory) {
          materialData.category = selectedCategory;
          console.log("Auto-filled category with selectedCategory:", selectedCategory);
        }

        // Calculate best supplier based on lowest price
        // 🔧 IMPROVED: Collect supplier prices, prioritizing user input over existing data
        const supplierPrices = {};
        let lowestPrice = Infinity;
        let bestSupplier = null;
        
        // Get the material data if we're editing
        const materialData_forSuppliers = editingMaterialId ? allMaterials.find(m => m.id === editingMaterialId) : null;
        
        // Get list of all suppliers to check (from allSuppliers AND existing prices)
        const allSuppliersToCheck = new Set();
        if (allSuppliers && allSuppliers.length > 0) {
          allSuppliers.forEach(s => allSuppliersToCheck.add(s));
        }
        if (materialData_forSuppliers && materialData_forSuppliers.supplierprices) {
          try {
            const existingPrices = JSON.parse(materialData_forSuppliers.supplierprices);
            Object.keys(existingPrices).forEach(s => allSuppliersToCheck.add(s));
          } catch (e) {
            console.log("Error parsing existing supplier prices:", e);
          }
        }
        
        // Check each supplier for a price
        allSuppliersToCheck.forEach(supplier => {
          const supplierId = supplier.toLowerCase().replace(/\s+/g, '');
          const priceInput = document.getElementById(`matsupplier${supplierId}`);
          
          // Priority 1: If input exists and has a value, use it
          if (priceInput && priceInput.value) {
            const price = parseFloat(priceInput.value);
            if (!isNaN(price) && price > 0) {
              supplierPrices[supplier] = price;
              console.log(`✓ Using input value for ${supplier}: ${price}`);
              if (price < lowestPrice) {
                lowestPrice = price;
                bestSupplier = supplier;
              }
              return;
            }
          }
          
          // Priority 2: If no input value, try to use existing price
          if (materialData_forSuppliers && materialData_forSuppliers.supplierprices) {
            try {
              const existingPrices = JSON.parse(materialData_forSuppliers.supplierprices);
              const existingPrice = parseFloat(existingPrices[supplier]);
              if (!isNaN(existingPrice) && existingPrice > 0) {
                supplierPrices[supplier] = existingPrice;
                console.log(`✓ Preserving existing price for ${supplier}: ${existingPrice}`);
                if (existingPrice < lowestPrice) {
                  lowestPrice = existingPrice;
                  bestSupplier = supplier;
                }
              }
            } catch (e) {
              console.log("Error checking existing price for", supplier, e);
            }
          }
        });
        
        // Store supplier prices and best supplier
        if (Object.keys(supplierPrices).length > 0) {
          materialData.supplierprices = JSON.stringify(supplierPrices);
          materialData.bestsupplier = bestSupplier;
          materialData.cost = lowestPrice === Infinity ? 0 : lowestPrice;
          console.log("💾 SAVING - Supplier prices:", supplierPrices, "Best:", bestSupplier, "Lowest Price:", materialData.cost);
        } else {
          console.log("⚠️ No supplier prices to save");
        }

        console.log("Final materialData being saved:", materialData);

        if (!isValid) {
          showAlert("Fill in all required fields", "error");
          return;
        }

        try {
          if (editingMaterialId) {
            await updateDoc(doc(db, "materials", editingMaterialId), materialData);
            await logActivity("material", "update", `Updated material: ${materialData.material}`);
            showAlert("Material updated!", "success");
          } else {
            console.log("Adding new material with data:", materialData);
            await addDoc(collection(db, "materials"), {
              ...materialData,
              createdAt: new Date().toISOString()
            });
            await logActivity("material", "create", `Added material: ${materialData.material}`);
            showAlert("Material added!", "success");
          }
          materialModal.style.display = "none";
          await loadMaterials();
          // Render with currently selected category
          renderMaterials2(selectedCategory);
          updateMaterialSummaries2();
        } catch (err) {
          showAlert("Error saving material: " + err.message, "error");
        }
      }
    };
  }

  if (document.getElementById("addWarehouseBtn")) {
    document.getElementById("addWarehouseBtn").onclick = () => {
      // Check context - if in Project Management tab, add project
      if (document.getElementById("warehouse-tab") && document.getElementById("warehouse-tab").style.display === "block") {
        isEditingProject = true;
        editingWarehouseId = null;
        document.getElementById("warehouseModalTitle").textContent = "Add Project";
        document.getElementById("whName").value = "";
        document.getElementById("whProjectId").value = "";
        document.getElementById("whClient").value = "";
        document.getElementById("whClientPo").value = "";
        document.getElementById("whScope").value = "";
        document.getElementById("whTrade").value = "";
        document.getElementById("whLocation").value = "";
        displayTradeDropdown();
        updateTradeDisplay();
        const warehouseModal = document.getElementById("warehouseModal");
        if (warehouseModal) warehouseModal.classList.add("active");
      } else {
        openWarehouseModal();
      }
    };
  }

  if (document.getElementById("closeWarehouseModal")) {
    document.getElementById("closeWarehouseModal").onclick = () => {
      isEditingProject = false;
      editingWarehouseId = null;
      const warehouseModal = document.getElementById("warehouseModal");
      if (warehouseModal) warehouseModal.classList.remove("active");
    };
  }

  if (document.getElementById("cancelWarehouseBtn")) {
    document.getElementById("cancelWarehouseBtn").onclick = () => {
      isEditingProject = false;
      editingWarehouseId = null;
      const warehouseModal = document.getElementById("warehouseModal");
      if (warehouseModal) warehouseModal.classList.remove("active");
    };
  }

  if (document.getElementById("saveWarehouseBtn")) {
    document.getElementById("saveWarehouseBtn").onclick = async (e) => {
      e.preventDefault();
      
      console.log("Save button clicked. editingWarehouseId =", editingWarehouseId, ", isEditingProject =", isEditingProject);
      
      const modalTitle = document.getElementById("warehouseModalTitle").textContent || "";
      const isProject = modalTitle.includes("Project");
      
      console.log("Modal title:", modalTitle, "isProject:", isProject);
      
      // Check if we're saving a project
      if (isProject) {
        const name = (document.getElementById("whName").value || "").trim();
        const projectId = (document.getElementById("whProjectId").value || "").trim();
        const client = (document.getElementById("whClient").value || "").trim();
        const clientPo = (document.getElementById("whClientPo").value || "").trim();
        const scope = (document.getElementById("whScope").value || "").trim();
        const tradeValue = (document.getElementById("whTrade").value || "").trim();
        const trades = tradeValue ? tradeValue.split(",").map(t => t.trim()).filter(v => v) : [];
        const location = (document.getElementById("whLocation").value || "").trim();

        if (!name) {
          showAlert("Please fill in the Project name", "error");
          return;
        }

        try {
          const projectData = {
            name,
            projectId,
            client,
            clientPo,
            scope,
            trades,
            location,
            status: "active",
            updatedAt: new Date().toISOString()
          };

          console.log("editingWarehouseId value:", editingWarehouseId, "Type:", typeof editingWarehouseId, "Truthy:", !!editingWarehouseId);
          
          if (editingWarehouseId && editingWarehouseId !== null && editingWarehouseId !== undefined && editingWarehouseId !== "") {
            console.log("Updating project with ID:", editingWarehouseId);
            await updateDoc(doc(db, "projects", editingWarehouseId), projectData);
            await logActivity("project", "update", `Updated project: ${name}`);
            showAlert("✅ Project updated!", "success");
          } else {
            console.log("Creating new project (editingWarehouseId is:", editingWarehouseId, ")");
            await addDoc(collection(db, "projects"), {
              ...projectData,
              createdAt: new Date().toISOString()
            });
            await logActivity("project", "create", `Added project: ${name}`);
            showAlert("✅ Project added!", "success");
          }

          const warehouseModal = document.getElementById("warehouseModal");
          if (warehouseModal) warehouseModal.classList.remove("active");
          editingWarehouseId = null;
          isEditingProject = false;
          loadProjects();
        } catch (err) {
          showAlert("Error saving project: " + err.message, "error");
        }
      } else {
        // Save as warehouse (old behavior)
        const name = (document.getElementById("whName").value || "").trim();
        const code = (document.getElementById("whCode").value || "").trim();
        const location = (document.getElementById("whLocation").value || "").trim();

        if (!name || !code) {
          showAlert("Fill in warehouse name and code", "error");
          return;
        }

        try {
          const warehouseData = { name, code, location };
          if (editingWarehouseId) {
            await updateDoc(doc(db, "warehouses", editingWarehouseId), warehouseData);
            await logActivity("warehouse", "update", `Updated warehouse: ${name}`);
            showAlert("Warehouse updated!", "success");
          } else {
            await addDoc(collection(db, "warehouses"), warehouseData);
            await logActivity("warehouse", "create", `Added warehouse: ${name}`);
            showAlert("Warehouse added!", "success");
          }
          const warehouseModal = document.getElementById("warehouseModal");
          if (warehouseModal) warehouseModal.style.display = "none";
          editingWarehouseId = null;
          loadWarehouses();
          updateWarehouseDropdowns();
        } catch (err) {
          showAlert("Error saving warehouse: " + err.message, "error");
        }
      }
    };
  }

  if (document.getElementById("configureColumnsBtn")) {
    document.getElementById("configureColumnsBtn").onclick = () => {
      renderColumnsConfig();
      document.getElementById("configureColumnsModal").style.display = "flex";
    };
  }

  if (document.getElementById("moreDeliveryBtn")) {
    document.getElementById("moreDeliveryBtn").onclick = () => {
      const dropdown = document.getElementById("moreDeliveryDropdown");
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
      dropdown.style.flexDirection = "column";
    };
  }

  if (document.getElementById("configureColumnsOption")) {
    document.getElementById("configureColumnsOption").onclick = () => {
      configuringColumnsFor = "delivery";
      renderColumnsConfig();
      document.getElementById("configureColumnsModal").style.display = "flex";
      document.getElementById("moreDeliveryDropdown").style.display = "none";
    };
  }

  if (document.getElementById("exportDeliveryOption")) {
    document.getElementById("exportDeliveryOption").onclick = () => {
      openExportDeliveryModal();
      document.getElementById("moreDeliveryDropdown").style.display = "none";
    };
  }

  if (document.getElementById("moreMaterialBtn")) {
    document.getElementById("moreMaterialBtn").onclick = () => {
      const dropdown = document.getElementById("moreMaterialDropdown");
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
      dropdown.style.flexDirection = "column";
    };
  }

  if (document.getElementById("moreMaterialBtn2")) {
    document.getElementById("moreMaterialBtn2").onclick = () => {
      const dropdown = document.getElementById("moreMaterialDropdown2");
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
      dropdown.style.flexDirection = "column";
    };
  }

  if (document.getElementById("configureColumnOption")) {
    document.getElementById("configureColumnOption").onclick = () => {
      renderMaterialColumnsConfig();
      document.getElementById("configureMaterialColumnsModal").style.display = "flex";
      document.getElementById("moreMaterialDropdown").style.display = "none";
    };
  }

  if (document.getElementById("configureColumnOption2")) {
    document.getElementById("configureColumnOption2").onclick = () => {
      // Update the modal header to show which category is being configured
      const categoryNameEl = document.getElementById("configCategoryName");
      if (categoryNameEl) {
        categoryNameEl.textContent = selectedCategory;
      }
      renderMaterialColumnsConfig2();
      document.getElementById("configureMaterialColumnsModal2").style.display = "flex";
      document.getElementById("moreMaterialDropdown2").style.display = "none";
    };
  }

  if (document.getElementById("exportMaterialOption")) {
    document.getElementById("exportMaterialOption").onclick = () => {
      exportMaterialToExcel();
      document.getElementById("moreMaterialDropdown").style.display = "none";
    };
  }

  if (document.getElementById("exportMaterialOption2")) {
    document.getElementById("exportMaterialOption2").onclick = () => {
      exportMaterialToExcel();
      document.getElementById("moreMaterialDropdown2").style.display = "none";
    };
  }

  if (document.getElementById("closeColumnsModalBtn")) {
    document.getElementById("closeColumnsModalBtn").onclick = () => {
      document.getElementById("configureColumnsModal").style.display = "none";
    };
  }

  if (document.getElementById("closeMaterialColumnsModalBtn")) {
    document.getElementById("closeMaterialColumnsModalBtn").onclick = () => {
      document.getElementById("configureMaterialColumnsModal").style.display = "none";
    };
  }

  if (document.getElementById("addColumnBtn")) {
    document.getElementById("addColumnBtn").onclick = () => {
      const columnName = (document.getElementById("newColumnName").value || "").trim();
      if (!columnName) {
        showAlert("Enter column name", "error");
        return;
      }
      if (configuringColumnsFor === "schedule") {
        scheduleColumns.push({ id: Date.now(), name: columnName });
      } else {
        deliveryColumns.push({ id: Date.now(), name: columnName });
      }
      document.getElementById("newColumnName").value = "";
      if (configuringColumnsFor === "schedule") {
        renderScheduleColumnsConfig();
      } else {
        renderColumnsConfig();
      }
    };
  }

  // CATEGORY MODAL HANDLERS
  if (document.getElementById("configureCategoryOption")) {
    document.getElementById("configureCategoryOption").onclick = () => {
      openConfigureCategoriesModal();
      document.getElementById("moreMaterialDropdown2").style.display = "none";
    };
  }

  if (document.getElementById("closeCategoriesModalBtn")) {
    document.getElementById("closeCategoriesModalBtn").onclick = () => {
      document.getElementById("configureCategoriesModal").style.display = "none";
    };
  }

  if (document.getElementById("cancelCategoriesBtn")) {
    document.getElementById("cancelCategoriesBtn").onclick = () => {
      document.getElementById("configureCategoriesModal").style.display = "none";
    };
  }

  if (document.getElementById("addCategoryBtn")) {
    document.getElementById("addCategoryBtn").onclick = () => {
      const categoryName = (document.getElementById("newCategoryName").value || "").trim();
      if (!categoryName) {
        showAlert("Enter category name", "error");
        return;
      }
      if (allCategories.includes(categoryName)) {
        showAlert("Category already exists", "error");
        return;
      }
      allCategories.push(categoryName);
      saveCategoriesToLocalStorage();
      document.getElementById("newCategoryName").value = "";
      openConfigureCategoriesModal();
      updateCategoryTabs();
    };
  }

  if (document.getElementById("saveCategoriesBtn")) {
    document.getElementById("saveCategoriesBtn").onclick = () => {
      saveCategoriesToLocalStorage();
      updateCategoryTabs();
      renderMaterials2("all");
      document.getElementById("configureCategoriesModal").style.display = "none";
      showAlert("✅ Categories saved!", "success");
    };
  }

  // Suppliers modal handlers
  if (document.getElementById("configureSupplierOption")) {
    document.getElementById("configureSupplierOption").onclick = () => {
      openConfigureSuppliersModal();
      document.getElementById("moreMaterialDropdown2").style.display = "none";
    };
  }

  if (document.getElementById("closeSuppliersModalBtn")) {
    document.getElementById("closeSuppliersModalBtn").onclick = () => {
      document.getElementById("configureSuppliersModal").style.display = "none";
    };
  }

  if (document.getElementById("cancelSuppliersBtn")) {
    document.getElementById("cancelSuppliersBtn").onclick = () => {
      document.getElementById("configureSuppliersModal").style.display = "none";
    };
  }

  if (document.getElementById("addSupplierBtn")) {
    document.getElementById("addSupplierBtn").onclick = () => {
      const supplierName = (document.getElementById("newSupplierName").value || "").trim().toUpperCase();
      if (!supplierName) {
        showAlert("Enter supplier name", "error");
        return;
      }
      if (allSuppliers.includes(supplierName)) {
        showAlert("Supplier already exists", "error");
        return;
      }
      allSuppliers.push(supplierName);
      document.getElementById("newSupplierName").value = "";
      openConfigureSuppliersModal();
      showAlert("✅ Supplier added!", "success");
    };
  }

  if (document.getElementById("saveSuppliersBtn")) {
    document.getElementById("saveSuppliersBtn").onclick = () => {
      saveSuppliers();
      document.getElementById("configureSuppliersModal").style.display = "none";
      showAlert("✅ Suppliers saved!", "success");
    };
  }

  if (document.getElementById("addMaterialColumnBtn")) {
    document.getElementById("addMaterialColumnBtn").onclick = () => {
      const columnName = (document.getElementById("newMaterialColumnName").value || "").trim();
      if (!columnName) {
        showAlert("Enter column name", "error");
        return;
      }
      materialColumns.push({ id: Date.now(), name: columnName });
      document.getElementById("newMaterialColumnName").value = "";
      renderMaterialColumnsConfig();
    };
  }

  if (document.getElementById("saveColumnsBtn")) {
    document.getElementById("saveColumnsBtn").onclick = () => {
      if (configuringColumnsFor === "schedule") {
        saveScheduleColumns();
        renderScheduleColumnsConfig();
        window.renderScheduleTable(allScheduleRecords);
      } else {
        saveDeliveryColumns();
        renderColumnsConfig();
        renderDeliveryForm();
        renderDeliveryTable();
      }
      document.getElementById("configureColumnsModal").style.display = "none";
      showAlert("✅ Columns saved!", "success");
    };
  }

  if (document.getElementById("saveMaterialColumnsBtn")) {
    document.getElementById("saveMaterialColumnsBtn").onclick = () => {
      saveMaterialColumns();
      renderMaterialTable();
      loadMaterials();
      document.getElementById("configureMaterialColumnsModal").style.display = "none";
      showAlert("✅ Columns saved!", "success");
    };
  }

  if (document.getElementById("cancelColumnsBtn")) {
    document.getElementById("cancelColumnsBtn").onclick = () => {
      document.getElementById("configureColumnsModal").style.display = "none";
    };
  }

  if (document.getElementById("cancelMaterialColumnsBtn")) {
    document.getElementById("cancelMaterialColumnsBtn").onclick = () => {
      document.getElementById("configureMaterialColumnsModal").style.display = "none";
    };
  }

  if (document.getElementById("closeMaterialColumnsModalBtn2")) {
    document.getElementById("closeMaterialColumnsModalBtn2").onclick = () => {
      document.getElementById("configureMaterialColumnsModal2").style.display = "none";
    };
  }

  if (document.getElementById("cancelMaterialColumnsBtn2")) {
    document.getElementById("cancelMaterialColumnsBtn2").onclick = () => {
      document.getElementById("configureMaterialColumnsModal2").style.display = "none";
    };
  }

  if (document.getElementById("addMaterialColumnBtn2")) {
    document.getElementById("addMaterialColumnBtn2").onclick = () => {
      const columnName = (document.getElementById("newMaterialColumnName2").value || "").trim();
      if (!columnName) {
        showAlert("Enter column name", "error");
        return;
      }
      materialColumns2.push({ id: Date.now(), name: columnName });
      document.getElementById("newMaterialColumnName2").value = "";
      renderMaterialColumnsConfig2();
    };
  }

  if (document.getElementById("saveMaterialColumnsBtn2")) {
    document.getElementById("saveMaterialColumnsBtn2").onclick = async () => {
      await saveMaterialColumnsForCategory(selectedCategory);
      // After columns are saved and loaded, rebuild the table
      renderMaterialTable2();
      renderMaterials2("all");
      document.getElementById("configureMaterialColumnsModal2").style.display = "none";
      showAlert("✅ Columns saved!", "success");
    };
  }

  // DELIVERY SCHEDULE BUTTONS
  if (document.getElementById("addScheduleBtn")) {
    document.getElementById("addScheduleBtn").onclick = () => {
      editingScheduleId = null;
      document.getElementById("deliveryModalTitle").textContent = "Add Schedule Record";
      document.getElementById("deliveryForm").reset();
      renderScheduleForm();
      document.getElementById("deliveryModal").style.display = "flex";
    };
  }

  if (document.getElementById("moreScheduleBtn")) {
    document.getElementById("moreScheduleBtn").onclick = () => {
      const dropdown = document.getElementById("moreScheduleDropdown");
      dropdown.style.display = dropdown.style.display === "none" ? "flex" : "none";
      dropdown.style.flexDirection = "column";
    };
  }

  if (document.getElementById("configureScheduleColumnsOption")) {
    document.getElementById("configureScheduleColumnsOption").onclick = () => {
      configuringColumnsFor = "schedule";
      renderScheduleColumnsConfig();
      document.getElementById("configureColumnsModal").style.display = "flex";
      document.getElementById("moreScheduleDropdown").style.display = "none";
    };
  }

  if (document.getElementById("exportScheduleOption")) {
    document.getElementById("exportScheduleOption").onclick = () => {
      openExportDeliveryModal();
      document.getElementById("moreScheduleDropdown").style.display = "none";
    };
  }
  if (document.getElementById("addDeliveryBtn")) {
    document.getElementById("addDeliveryBtn").onclick = () => {
      editingDeliveryId = null;
      document.getElementById("deliveryModalTitle").textContent = "Add Delivery Receipt";
      
      // Complete form reset
      const form = document.getElementById("deliveryForm");
      if (form) form.reset();
      
      // Reset all form fields explicitly
      document.getElementById("drWarehouse").value = "";
      document.getElementById("drLocation").value = "";
      document.getElementById("drClientPO").value = "";
      document.getElementById("drControlNo").value = "";
      document.getElementById("drFromWarehouse").value = "";
      document.getElementById("drMRNo").value = "";
      
      // Set today's date
      const today = new Date().toISOString().split('T')[0];
      document.getElementById("drDate").value = today;
      
      // Initialize items array
      window.drCurrentItems = [];
      renderDeliveryReceiptItems();
      
      // Show modal and set up the form
      renderDeliveryForm();
      openDeliveryReceiptModal();
      document.getElementById("deliveryModal").style.display = "flex";
    };
  }

  if (document.getElementById("addMRBtn")) {
    document.getElementById("addMRBtn").onclick = () => {
      document.getElementById("mrModalTitle").textContent = "Create Material Request";
      document.getElementById("mrForm").reset();
      document.getElementById("mrType").value = "new-project";
      document.getElementById("borrowWarehouseDiv").style.display = "none";
      window.mrCurrentItems = [];
      renderMRItems();
      
      // Populate warehouses
      const whSelect = document.getElementById("mrWarehouse");
      const borrowSelect = document.getElementById("mrBorrowFromWarehouse");
      whSelect.innerHTML = '<option value="">Select Project</option>';
      borrowSelect.innerHTML = '<option value="">Select Source Project</option>';
      
      if (allWarehouses && allWarehouses.length > 0) {
        allWarehouses.forEach(wh => {
          whSelect.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
          borrowSelect.innerHTML += `<option value="${wh.id}">${wh.name}</option>`;
        });
      }
      
      // Setup searchable material dropdown
      const materialInput = document.getElementById("mrAddMaterialSelect");
      const materialDropdown = document.getElementById("mrMaterialDropdown");
      
      materialInput.value = "";
      materialInput.oninput = function() {
        const searchText = this.value.toLowerCase();
        materialDropdown.innerHTML = "";
        
        if (searchText.length === 0) {
          materialDropdown.style.display = "none";
          return;
        }
        
        const filtered = (allMaterials || []).filter(mat => {
          const matName = (mat.material || mat.materialName || mat.name || "").toLowerCase();
          const itemCode = (mat.itemCode || mat.code || "").toLowerCase();
          const spec = (mat.specification || mat.specs || "").toLowerCase();
          const brand = (mat.brand || "").toLowerCase();
          return matName.includes(searchText) || itemCode.includes(searchText) || spec.includes(searchText) || brand.includes(searchText);
        }).sort((a, b) => {
          // Sort by relevance: prioritize exact prefix matches
          const aItemCode = (a.itemCode || a.code || "").toLowerCase();
          const bItemCode = (b.itemCode || b.code || "").toLowerCase();
          const aMatName = (a.material || a.materialName || a.name || "").toLowerCase();
          const bMatName = (b.material || b.materialName || b.name || "").toLowerCase();
          
          // Priority 1: Item Code starts with search text (best match)
          const aItemCodePrefix = aItemCode.startsWith(searchText) ? 0 : 1;
          const bItemCodePrefix = bItemCode.startsWith(searchText) ? 0 : 1;
          if (aItemCodePrefix !== bItemCodePrefix) return aItemCodePrefix - bItemCodePrefix;
          
          // Priority 2: Material Name starts with search text
          const aMatNamePrefix = aMatName.startsWith(searchText) ? 0 : 1;
          const bMatNamePrefix = bMatName.startsWith(searchText) ? 0 : 1;
          if (aMatNamePrefix !== bMatNamePrefix) return aMatNamePrefix - bMatNamePrefix;
          
          // Priority 3: Item code position in string (earlier position = better)
          const aItemCodePos = aItemCode.indexOf(searchText);
          const bItemCodePos = bItemCode.indexOf(searchText);
          if (aItemCodePos !== bItemCodePos) return aItemCodePos - bItemCodePos;
          
          // Default: sort by item code alphabetically
          return aItemCode.localeCompare(bItemCode);
        });
        
        // 🔍 DEDUPLICATE: Show only unique materials (by itemCode + material name), not warehouse copies
        const seenMaterials = new Map();
        const uniqueFiltered = filtered.filter(mat => {
          const matName = mat.material || mat.materialName || mat.name || "";
          const itemCode = mat.itemCode || mat.code || "";
          const uniqueKey = `${itemCode}_${matName}`;
          
          if (seenMaterials.has(uniqueKey)) {
            return false; // Skip duplicate
          }
          seenMaterials.set(uniqueKey, true);
          return true;
        });
        
        if (uniqueFiltered.length > 0) {
          uniqueFiltered.slice(0, 20).forEach(mat => {
            const matName = mat.material || mat.materialName || mat.name;
            const itemCode = mat.itemCode || mat.code || "";
            const spec = mat.specification || mat.specs || "-";
            const brand = mat.brand || "-";
            
            // 💰 Extract price from multiple sources (supplierprices JSON, cost field, unitPrice, or price)
            let bestSupplier = "-";
            let bestPrice = 0;
            
            // First, try to get from supplierprices JSON
            if (mat.supplierprices) {
              try {
                const prices = JSON.parse(mat.supplierprices);
                const suppliers = Object.keys(prices);
                if (suppliers.length > 0) {
                  bestSupplier = suppliers[0];
                  bestPrice = parseFloat(prices[bestSupplier]) || 0;
                  // Find lowest price
                  suppliers.forEach(sup => {
                    const price = parseFloat(prices[sup]) || 0;
                    if (price > 0 && (bestPrice === 0 || price < bestPrice)) {
                      bestPrice = price;
                      bestSupplier = sup;
                    }
                  });
                }
              } catch (e) {
                console.log("⚠️ Error parsing supplierprices for", matName, e);
              }
            }
            
            // If no price found from supplierprices, try direct cost/price fields
            if (bestPrice === 0) {
              bestPrice = parseFloat(mat.cost || mat.unitPrice || mat.price || 0) || 0;
              if (mat.supplier) bestSupplier = mat.supplier;
            }
            
            const div = document.createElement("div");
            div.style.cssText = "padding:10px;border-bottom:1px solid rgba(10,155,3,.2);cursor:pointer;color:#e0e0e0;font-size:12px;";
            div.innerHTML = `<div style="font-weight:600;color:#0a9b03;">${itemCode ? '[' + itemCode + '] ' : ''}${matName}</div><div style="font-size:11px;color:#a0a0a0;">Spec: ${spec} | Brand: ${brand} | Supplier: ${bestSupplier} | Price: ₱${bestPrice > 0 ? bestPrice.toLocaleString('en-US', {minimumFractionDigits:2}) : '0.00'}</div>`;
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
                itemCode: itemCode,
                cost: bestPrice,
                supplier: bestSupplier
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
      
      // Clear quantity input
      const qtyInput = document.getElementById("mrAddQty");
      if (qtyInput) {
        qtyInput.value = "";
      }
      
      document.getElementById("mrModal").style.display = "flex";
    };
  }

  if (document.getElementById("closeMRModalBtn")) {
    document.getElementById("closeMRModalBtn").onclick = () => {
      document.getElementById("mrModal").style.display = "none";
    };
  }

  if (document.getElementById("cancelMRBtn")) {
    document.getElementById("cancelMRBtn").onclick = () => {
      document.getElementById("mrModal").style.display = "none";
    };
  }

  if (document.getElementById("mrType")) {
    document.getElementById("mrType").onchange = () => {
      const val = document.getElementById("mrType").value;
      document.getElementById("borrowWarehouseDiv").style.display = val === "borrow" ? "block" : "none";
    };
  }

  // Project autocomplete for Material Request
  if (document.getElementById("mrProject")) {
    let allProjectsList = [];
    let projectsLoaded = false;
    
    const mrProjectInput = document.getElementById("mrProject");
    
    mrProjectInput.onfocus = async () => {
      // Load projects on focus if not already loaded
      if (!projectsLoaded) {
        try {
          const projectsSnapshot = await getDocs(collection(db, "projects"));
          allProjectsList = projectsSnapshot.docs.map(doc => ({
            id: doc.id,
            projectName: doc.data().projectName || doc.data().projectID || '',
            projectID: doc.data().projectID || '',
            client_name: doc.data().client_name || doc.data().client || '',
            location: doc.data().location || '',
            trade: doc.data().trade || ''
          }));
          projectsLoaded = true;
          console.log('✅ Projects loaded for autocomplete:', allProjectsList.length, 'projects');
        } catch (err) {
          console.error('Error loading projects:', err);
        }
      }
    };
    
    mrProjectInput.oninput = function() {
      const inputVal = this.value.toLowerCase().trim();
      const dropdown = document.getElementById("mrProjectDropdown");
      
      if (!inputVal) {
        dropdown.style.display = "none";
        return;
      }
      
      // Filter matching projects
      const filtered = allProjectsList.filter(proj => {
        const name = (proj.projectName + ' ' + proj.projectID + ' ' + proj.client_name).toLowerCase();
        return name.includes(inputVal);
      });
      
      if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:10px;color:#ff6b6b;font-size:12px;text-align:center;">No matching projects found</div>';
        dropdown.style.display = "block";
        return;
      }
      
      // Display matching projects
      let html = '';
      filtered.slice(0, 10).forEach(proj => {
        html += `
          <div onclick="selectMRProject('${proj.projectName.replace(/'/g, "\\'")}', '${proj.projectID.replace(/'/g, "\\'")}', '${proj.client_name.replace(/'/g, "\\'")}')" 
            style="padding:10px;border-bottom:1px solid rgba(10,155,3,.1);cursor:pointer;color:#e0e0e0;font-size:13px;transition:all 0.2s;background:rgba(10,155,3,0);"
            onmouseover="this.style.background='rgba(10,155,3,0.2)'"
            onmouseout="this.style.background='rgba(10,155,3,0)'">
            <div style="color:#15c524;font-weight:600;">${proj.projectName} (${proj.projectID})</div>
            <div style="color:#a0a0a0;font-size:11px;margin-top:3px;">Client: ${proj.client_name}${proj.location ? ' | Location: ' + proj.location : ''}</div>
          </div>
        `;
      });
      
      dropdown.innerHTML = html;
      dropdown.style.display = "block";
    };
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target.id !== 'mrProject') {
        const dropdown = document.getElementById("mrProjectDropdown");
        if (dropdown) dropdown.style.display = "none";
      }
    });
  }

  if (document.getElementById("saveMRBtn")) {
    document.getElementById("saveMRBtn").onclick = async () => {
      const type = document.getElementById("mrType").value;
      const warehouse = document.getElementById("mrWarehouse").value;
      
      if (!warehouse) {
        showAlert("Please select requesting warehouse", "error");
        return;
      }
      
      if (type === "borrow" && !document.getElementById("mrBorrowFromWarehouse").value) {
        showAlert("Please select source warehouse for borrow request", "error");
        return;
      }
      
      if (!window.mrCurrentItems || window.mrCurrentItems.length === 0) {
        showAlert("Please add at least one material to request", "error");
        return;
      }
      
      try {
        const mrNo = await getNextMRNumber();
        const mrData = {
          mrNo: mrNo,
          type: type,
          warehouse: warehouse,
          borrowFromWarehouse: document.getElementById("mrBorrowFromWarehouse").value || "",
          project: "",
          items: window.mrCurrentItems,
          status: "Pending",
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.email || "unknown"
        };
        
        await addDoc(collection(db, "materialRequests"), mrData);
        await logActivity("mr", "create", `Created material request ${mrNo}`);
        
        showAlert(`✅ Material Request ${mrNo} submitted!`, "success");
        document.getElementById("mrModal").style.display = "none";
        loadMaterialRequests();
      } catch (err) {
        showAlert("Error saving MR: " + err.message, "error");
      }
    };
  }

  if (document.getElementById("addPOBtn")) {
    document.getElementById("addPOBtn").onclick = async () => {
      // Load all pending MRs and projects
      if (!allMaterialRequests || allMaterialRequests.length === 0) {
        await loadMaterialRequests();
      }
      
      const pendingMRs = allMaterialRequests.filter(mr => mr.status === "Pending");
      
      if (pendingMRs.length === 0) {
        showAlert("No pending Material Requests to create POs from", "info");
        return;
      }
      
      // Load projects from Firebase
      let allProjects = [];
      try {
        const projectsSnapshot = await getDocs(collection(db, "projects"));
        allProjects = projectsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (err) {
        console.error("Error loading projects:", err);
      }
      
      // Create dialog to select MR first
      const dialog = document.createElement("div");
      dialog.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
        display:flex;justify-content:center;align-items:center;z-index:10000;
      `;
      
      let mrSelectionHtml = `
        <div style="background:#1a2332;border-radius:8px;padding:30px;max-width:900px;max-height:80vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
          <h2 style="margin:0 0 20px 0;color:#0a9b03;">Create Purchase Orders from Material Requests</h2>
          <p style="color:#a0a0a0;font-size:13px;margin-bottom:20px;">Select a Material Request to view its items and assign suppliers. Project will be automatically determined based on the MR and cannot be changed:</p>
          
          <div style="margin-bottom:20px;">
            <label style="color:#0a9b03;font-weight:600;display:block;margin-bottom:10px;">Select Material Request:</label>
            <select id="selectMRForPO" style="width:100%;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:4px;box-sizing:border-box;font-size:13px;">
              <option value="">Choose an MR...</option>
              ${pendingMRs.map(mr => {
                const warehouseName = allWarehouses?.find(w => w.id === mr.warehouse)?.name || mr.warehouse;
                return `<option value="${mr.id}">${mr.mrNo} - ${warehouseName} (${mr.items?.length || 0} items)</option>`;
              }).join('')}
            </select>
          </div>
          <div id="resolvedProjectInfo" style="color:#a0a0a0;font-size:13px;margin-bottom:20px;"></div>
          <div id="mrItemsContainer" style="display:none;">
            <h3 style="margin:20px 0 10px 0;color:#0a9b03;font-size:13px;font-weight:600;">Items from Selected MR:</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid rgba(10,155,3,0.2);">
              <thead style="background:rgba(10,155,3,0.1);">
                <tr>
                  <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">No.</th>
                  <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Material</th>
                  <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Qty</th>
                  <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Unit</th>
                  <th style="padding:10px;text-align:left;color:#0a9b03;font-size:12px;border-bottom:1px solid rgba(10,155,3,0.3);">Select Supplier</th>
                </tr>
              </thead>
              <tbody id="poCreationTable">
              </tbody>
            </table>
          </div>
          
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="cancelPODlg" style="background:rgba(255,107,107,0.2);color:#ff6b6b;border:1px solid #ff6b6b;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;">Cancel</button>
            <button id="createPOsBtn" style="background:linear-gradient(135deg, #0a9b03 0%, #15c524 100%);color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-weight:600;display:none;">Create PO</button>
          </div>
        </div>
      `;
      
      dialog.innerHTML = mrSelectionHtml;
      document.body.appendChild(dialog);
      
      let selectedMRId = null;
      // actual project code/id extracted from MR - no manual selection allowed
      let selectedProjectActualId = null;  
      const mrSelect = document.getElementById("selectMRForPO");
      const tableBody = document.getElementById("poCreationTable");
      const itemsContainer = document.getElementById("mrItemsContainer");
      const createPoBtn = document.getElementById("createPOsBtn");
      
      // Project is now auto-selected from MR - no new project creation allowed
      // Handle MR selection
      mrSelect.onchange = function() {
        selectedMRId = this.value;
        
        if (!selectedMRId) {
          itemsContainer.style.display = "none";
          createPoBtn.style.display = "none";
          tableBody.innerHTML = "";
          selectedProjectActualId = null;
          const infoDiv = document.getElementById('resolvedProjectInfo');
          if (infoDiv) infoDiv.textContent = '';
          return;
        }
        
        // Find selected MR
        const selectedMR = pendingMRs.find(mr => mr.id === selectedMRId);
        if (!selectedMR) return;
        
        // AUTO-SELECT PROJECT FROM MR (no user input)
        // First try the old project field (now mostly empty), then fall back to warehouse
        if (selectedMR.project) {
          console.log('📋 MR project field:', selectedMR.project);
          
          // Extract project ID from MR (e.g., "MARSU_MARAWI (MARAWI)" -> "MARAWI" or just "MARAWI")
          let mrProjectId = selectedMR.project;
          
          // Try to extract short ID if format is "NAME (ID)" or "NAME_ID"
          if (mrProjectId.includes('(') && mrProjectId.includes(')')) {
            const match = mrProjectId.match(/\(([^)]+)\)/);
            if (match && match[1]) {
              mrProjectId = match[1];
            }
          } else if (mrProjectId.includes('_')) {
            mrProjectId = mrProjectId.split('_').pop();
          }
          
          console.log('🔍 Extracted project ID from MR:', mrProjectId);
          
          // Find matching project in allProjects
          const matchingProject = allProjects.find(proj => 
            proj.projectID === mrProjectId || 
            proj.id === mrProjectId ||
            proj.projectName === mrProjectId
          );
          
          if (matchingProject) {
            console.log('✅ Found matching project:', matchingProject.projectID);
            selectedProjectActualId = matchingProject.projectID;  // store actual project ID only
            const infoDiv = document.getElementById('resolvedProjectInfo');
            if (infoDiv) infoDiv.textContent = 'Project → ' + matchingProject.projectID;
          } else {
            console.warn('⚠️ No matching project found for:', mrProjectId);
            selectedProjectActualId = null;
            const infoDiv = document.getElementById('resolvedProjectInfo');
            if (infoDiv) infoDiv.textContent = '⚠️ No project detected';
          }
        } else if (selectedMR.warehouse) {
          // use warehouse field to find the project and get its human-readable ID
          let warehouseId = selectedMR.warehouse;

          // look up project by matching warehouse ID to find the actual project ID
          let displayName = warehouseId;
          let actualProjectId = null;
          
          if (allProjects) {
            const proj = allProjects.find(p => p.id === warehouseId);
            if (proj) {
              actualProjectId = proj.projectID;  // Get human-readable project ID (e.g., "EVSU")
              displayName = proj.projectName || proj.projectID || warehouseId;
            }
          }
          if (allWarehouses && !actualProjectId) {
            const wh = allWarehouses.find(w => w.id === warehouseId);
            if (wh) displayName = wh.name;
          }
          
          selectedProjectActualId = actualProjectId || warehouseId;  // Prefer human-readable ID
          const infoDiv = document.getElementById('resolvedProjectInfo');
          if (infoDiv) infoDiv.textContent = 'Project → ' + displayName + ' (from warehouse)';
          console.log('🔁 Fallback to warehouse as project:', selectedProjectActualId, '(', displayName, ')');
        } else {
          selectedProjectActualId = null;
        }
        
        // Populate table with this MR's items only
        tableBody.innerHTML = "";
        selectedMR.items.forEach((item, idx) => {
          // Try to find material master record; if missing, still render using item data
          const material = allMaterials.find(m => m.id === item.materialId) || null;

          // Get suppliers for this material or fallback to any supplier info in the saved item
          let suppliers = [];
          if (material && material.supplierprices) {
            try {
              const supplierPrices = JSON.parse(material.supplierprices);
              suppliers = Object.keys(supplierPrices);
            } catch (e) {
              suppliers = [];
            }
          }

          // Try item-level supplier info (if the MR item saved any) - use 'supplierPrices' or 'suppliers'
          if ((!suppliers || suppliers.length === 0) && item.supplierPrices) {
            try {
              const sp = typeof item.supplierPrices === 'string' ? JSON.parse(item.supplierPrices) : item.supplierPrices;
              if (typeof sp === 'object') suppliers = Object.keys(sp);
            } catch (e) {
              // ignore
            }
          }

          if (!suppliers || suppliers.length === 0) {
            suppliers = ["Default Supplier"];
          }

          const supplierId = `supplier_${selectedMRId}_${item.id}`;
          const qtyFieldId = `qty_${selectedMRId}_${item.id}`;
          const optionsHtml = suppliers.map((s, sidx) => 
            `<option value="${s}" ${sidx === 0 ? 'selected' : ''}>${s}</option>`
          ).join('');

          const row = `
            <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
              <td style="padding:10px;color:#d0d0d0;font-size:12px;">${idx + 1}</td>
              <td style="padding:10px;color:#d0d0d0;font-size:12px;">${item.materialName || item.material} | Spec: ${item.specification || '-'} | Brand: ${item.brand || '-'}</td>
              <td style="padding:10px;">
                <input type="number" id="${qtyFieldId}" value="${item.quantity || 0}" min="0" step="1" style="width:80px;padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#0a9b03;border-radius:3px;text-align:center;font-weight:600;" />
              </td>
              <td style="padding:10px;color:#d0d0d0;font-size:12px;">${item.unit}</td>
              <td style="padding:10px;">
                <select id="${supplierId}" style="padding:6px;background:rgba(255,255,255,.08);border:1px solid rgba(10,155,3,.3);color:#e0e0e0;border-radius:3px;width:100%;">
                  ${optionsHtml}
                </select>
              </td>
            </tr>
          `;
          tableBody.innerHTML += row;
        });
        
        itemsContainer.style.display = "block";
        createPoBtn.style.display = "block";
      };
      
      // Handle cancel button
      document.getElementById("cancelPODlg").onclick = () => {
        dialog.remove();
      };
      
      // Handle create PO button
      document.getElementById("createPOsBtn").onclick = async () => {
        try {
          if (!selectedMRId) {
            showAlert("Please select a Material Request", "error");
            return;
          }
          
          // Validate that a project has been determined from the MR
          if (!selectedProjectActualId) {
            showAlert("No project associated with this Material Request. Please choose an MR that contains a project or warehouse.", "error");
            return;
          }
          
          const selectedMR = pendingMRs.find(mr => mr.id === selectedMRId);
          if (!selectedMR) {
            showAlert("Material Request not found", "error");
            return;
          }
          
          // Gather supplier selections for this MR only
          const poGroups = {}; // Group by supplier
          
          selectedMR.items.forEach(item => {
            const supplierId = `supplier_${selectedMRId}_${item.id}`;
            const qtyFieldId = `qty_${selectedMRId}_${item.id}`;
            const suppSelect = document.getElementById(supplierId);
            const qtyInput = document.getElementById(qtyFieldId);
            if (suppSelect) {
              const supplier = suppSelect.value;
              // Get edited quantity from input field, or fallback to original quantity
              const editedQty = qtyInput ? parseFloat(qtyInput.value) || item.quantity : item.quantity;
              if (!poGroups[supplier]) {
                poGroups[supplier] = [];
              }
              poGroups[supplier].push({
                mrId: selectedMR.id,
                mrNo: selectedMR.mrNo,
                materialId: item.materialId,
                itemCode: item.itemCode || "-",
                materialName: item.materialName || item.material,
                specification: item.specification || "-",
                brand: item.brand || "-",
                quantity: editedQty,
                unit: item.unit,
                cost: item.cost || item.unitPrice || 0
              });
            }
          });
          
          // Create PO for the selected MR
          for (const supplier in poGroups) {
            const poNo = await getNextPONumber();
            const poData = {
              poNo: poNo,
              supplier: supplier,
              items: poGroups[supplier],
              status: "Pending",
              createdAt: new Date().toISOString(),
              createdBy: currentUser?.email || "unknown",
              linkedMRs: [selectedMR.mrNo],
              mrId: selectedMR.id
            };
            
            // Add projectId using ACTUAL project ID (not Firestore doc ID)
            try {
              let actualProjectId = selectedProjectActualId;
              // As a safety net, fall back to MR text parsing if above failed
              if (!actualProjectId && selectedMR.project) {
                let mrProjectId = selectedMR.project;
                if (mrProjectId.includes('(') && mrProjectId.includes(')')) {
                  const match = mrProjectId.match(/\(([^)]+)\)/);
                  if (match && match[1]) actualProjectId = match[1];
                } else if (mrProjectId.includes('_')) {
                  actualProjectId = mrProjectId.split('_').pop();
                } else {
                  actualProjectId = mrProjectId;
                }
              }
              if (actualProjectId) {
                poData.projectId = actualProjectId;
                console.log('💾 PO will be stored with projectId:', actualProjectId);
              }
            } catch (e) {
              console.warn('Could not determine projectId for PO, proceeding without it', e);
            }
            
            const docRef = await addDoc(collection(db, "purchaseOrders"), poData);
            // include id for downstream consumers
            poData.id = docRef.id;
            console.log('✅ PO created (dashboard) - stored in purchaseOrders collection:', poData);
            console.log('📌 PO will appear in Add PO modal after user explicitly clicks "Add PO to Project"');
            // ⚠️ DO NOT auto-sync to project - user must manually select it from "Add PO to Project" modal
            await logActivity("po", "create", `Created PO ${poNo} for supplier ${supplier} from MR ${selectedMR.mrNo}${selectedProjectActualId ? ' for project ' + selectedProjectActualId : ''}`);
          }
          
          // Update this MR status to "Ordered"
          await updateDoc(doc(db, "materialRequests", selectedMRId), {
            status: "Ordered"
          });
          
          showAlert(`✅ PO(s) created successfully for ${selectedMR.mrNo}!`, "success");
          // remember which project we just generated POs for so the "View in Purchasing" button
          // will open the correct project even if the dashboard is still showing another.
          try {
            localStorage.setItem('lastPOProjectId', selectedProjectActualId);
          } catch (e) { /* ignore storage errors */ }

          dialog.remove();
          loadMaterialRequests();
          loadPurchaseOrders();
        } catch (err) {
          showAlert("Error creating PO: " + err.message, "error");
          console.error("PO creation error:", err);
        }
      };
      
      // Close dialog when clicking outside
      dialog.onclick = (e) => {
        if (e.target === dialog) dialog.remove();
      };
    };
  }

  if (document.getElementById("addMRItemBtn")) {
    document.getElementById("addMRItemBtn").onclick = () => {
      const materialInput = document.getElementById("mrAddMaterialSelect");
      const qtyInput = document.getElementById("mrAddQty");
      
      if (!materialInput || !materialInput.value || !materialInput.dataset.selectedId) {
        showAlert("Please select a material from the dropdown", "error");
        return;
      }
      
      if (!qtyInput || !qtyInput.value || parseInt(qtyInput.value) <= 0) {
        showAlert("Please enter valid quantity", "error");
        return;
      }
      
      // Prefer dataset-selected material info (includes itemCode and unitPrice), fallback to full material record
      const selectedMatData = materialInput.dataset.selectedMat ? JSON.parse(materialInput.dataset.selectedMat) : null;
      const material = allMaterials.find(m => m.id === materialInput.dataset.selectedId) || {};

      // Ensure cost is properly extracted from multiple possible fields
      let itemCost = 0;
      let itemSupplier = "-";
      let supplierPrices = "";
      
      if (selectedMatData && selectedMatData.cost) {
        itemCost = parseFloat(selectedMatData.cost);
        itemSupplier = selectedMatData.supplier || "-";
      } else if (selectedMatData && selectedMatData.supplier) {
        itemSupplier = selectedMatData.supplier;
      } else if (material.cost) {
        itemCost = parseFloat(material.cost);
      } else if (material.unitPrice) {
        itemCost = parseFloat(material.unitPrice);
      } else if (material.price) {
        itemCost = parseFloat(material.price);
      }
      
      // Store supplier pricing info for PO dialog
      if (material.supplierprices) {
        supplierPrices = material.supplierprices;
      }

      const newItem = {
        id: Date.now(),
        materialId: material.id || (selectedMatData && selectedMatData.id) || "",
        materialName: material.material || material.materialName || (selectedMatData && selectedMatData.material) || "",
        itemCode: (selectedMatData && (selectedMatData.itemCode || selectedMatData.code)) || material.itemCode || material.code || "",
        specification: material.specification || material.specs || material.specsbrand || (selectedMatData && selectedMatData.specification) || "-",
        brand: material.brand || (selectedMatData && selectedMatData.brand) || "-",
        cost: itemCost,
        supplier: itemSupplier,
        supplierPrices: supplierPrices,
        quantity: qtyInput.value,
        unit: material.unit || (selectedMatData && selectedMatData.unit) || "PCS"
      };
      
      console.log('💾 MR Item added with cost & supplier:', { materialName: newItem.materialName, cost: newItem.cost, supplier: newItem.supplier, itemCode: newItem.itemCode });
      
      if (!window.mrCurrentItems) window.mrCurrentItems = [];
      window.mrCurrentItems.push(newItem);
      
      window.renderMRItems();
      materialInput.value = "";
      materialInput.dataset.selectedId = "";
      materialInput.dataset.selectedMat = "";
      qtyInput.value = "";
      
      showAlert("✅ Material added to request!", "success");
    };
  }

  if (document.getElementById("closeDeliveryModalBtn")) {
    document.getElementById("closeDeliveryModalBtn").onclick = () => {
      document.getElementById("deliveryModal").style.display = "none";
    };
  }

  if (document.getElementById("addDRItemBtn")) {
    document.getElementById("addDRItemBtn").onclick = (e) => {
      e.preventDefault();
      window.addDeliveryReceiptItem();
    };
  }

  if (document.getElementById("cancelDeliveryBtn")) {
    document.getElementById("cancelDeliveryBtn").onclick = () => {
      document.getElementById("deliveryModal").style.display = "none";
    };
  }

  if (document.getElementById("saveDeliveryBtn")) {
    document.getElementById("saveDeliveryBtn").onclick = async () => {
      // Validate required headers
      const warehouse = document.getElementById("drWarehouse").value;
      const date = document.getElementById("drDate").value;
      
      if (!warehouse || !date) {
        showAlert("Please fill in Warehouse and Date fields", "error");
        return;
      }
      
      if (!window.drCurrentItems || window.drCurrentItems.length === 0) {
        showAlert("Please add at least one item to the delivery", "error");
        return;
      }
      
      try {
        const deliveryData = {
          warehouse: warehouse,
          location: document.getElementById("drLocation").value || "",
          clientPO: document.getElementById("drClientPO").value || "",
          date: date,
          controlNo: document.getElementById("drControlNo").value || "",
          fromWarehouse: document.getElementById("drFromWarehouse").value || "",
          mrId: document.getElementById("drMRNo").value || "",  // Link to Material Request
          mrNo: "",  // Will be populated from MR items if available
          items: window.drCurrentItems.map(item => ({
            materialId: item.materialId,
            itemCode: item.itemCode || "",
            materialName: item.materialName,
            specification: item.specification,
            brand: item.brand,
            quantity: item.quantity,
            unit: item.unit,
            mrNo: item.mrNo,
            poNo: item.poNo,
            remarks: item.remarks || ""
          })),
          itemsCount: window.drCurrentItems.length,
          type: document.getElementById("drFromWarehouse").value ? "Transfer" : "Stock In",
          status: "Complete",
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.email || "unknown"
        };

        // If MR was selected, capture its MR number for easier reference
        if (deliveryData.mrId) {
          const selectedMR = allMaterialRequests.find(mr => mr.id === deliveryData.mrId);
          if (selectedMR) {
            deliveryData.mrNo = selectedMR.mrNo;
            // Also update the MR status to "Delivered"
            await updateDoc(doc(db, "materialRequests", deliveryData.mrId), {
              status: "Delivered"
            });
          }
        }
        
        // Save to Firestore
        await addDoc(collection(db, "deliveries"), deliveryData);
        
        // Update stock quantities
        await updateStockAfterDelivery(deliveryData);
        
        // Log activity
        const type = deliveryData.type === "Transfer" ? "transfer" : "stock-in";
        const mrInfo = deliveryData.mrNo ? ` (From MR: ${deliveryData.mrNo})` : "";
        await logActivity("delivery", "create", `Created delivery receipt - ${deliveryData.type}${mrInfo} (${deliveryData.itemsCount} items)`);
        
        showAlert(`✅ Delivery receipt saved! (${deliveryData.type})`, "success");
        document.getElementById("deliveryModal").style.display = "none";
        loadDeliveries();
        loadMaterialRequests();
      } catch (err) {
        showAlert("Error saving delivery: " + err.message, "error");
        console.error("Delivery save error:", err);
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

  const searchActivityLog = document.getElementById("searchActivityLog");
  const filterActivityType = document.getElementById("filterActivityType");
  const filterActivityMonth = document.getElementById("filterActivityMonth");
  const filterActivityYear = document.getElementById("filterActivityYear");

  if (searchActivityLog) {
    searchActivityLog.addEventListener("input", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, filterActivityType.value, filterActivityMonth.value, filterActivityYear.value, e.target.value);
    });
  }

  if (filterActivityType) {
    filterActivityType.addEventListener("change", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, e.target.value, filterActivityMonth.value, filterActivityYear.value, (searchActivityLog?.value || ""));
    });
  }

  if (filterActivityMonth) {
    filterActivityMonth.addEventListener("change", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, filterActivityType.value, e.target.value, filterActivityYear.value, (searchActivityLog?.value || ""));
    });
  }

  if (filterActivityYear) {
    filterActivityYear.addEventListener("change", async (e) => {
      const snap = await getDocs(collection(db, "activityLog"));
      const activities = [];
      snap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      renderActivityLog(activities, filterActivityType.value, filterActivityMonth.value, e.target.value, (searchActivityLog?.value || ""));
    });
  }

  const roleSelect = document.getElementById("userRole");
  if (roleSelect) {
    roleSelect.onchange = () => {
      const warehouseGroup = document.getElementById("warehouseGroup");
      warehouseGroup.style.display = roleSelect.value === "admin" ? "none" : "block";
    };
  }

  // initially load warehouses and projects so settings list is ready immediately
  loadWarehouses().then(() => {
    initMaterialColumns();
    loadMaterials();
  });
  // fetch projects early so they are cached and can render instantly when switching settings
  loadProjects().then(() => {
    // Populate warehouseFilter dropdown with ACTUAL PROJECTS (not warehouses)
    const warehouseFilter = document.getElementById("warehouseFilter");
    if (warehouseFilter && allProjects.length > 0) {
      warehouseFilter.innerHTML = '<option value="all">All Projects</option>';
      allProjects.forEach(proj => {
        const label = `${proj.name} (${proj.projectId})`;
        warehouseFilter.innerHTML += `<option value="${proj.id}">${label}</option>`;
      });
      
      // Add change listener to filter materials by project
      warehouseFilter.addEventListener("change", (e) => {
        const selectedProjectId = e.target.value;
        const searchQuery = document.getElementById("searchMaterial")?.value.trim() || "";
        const statusFilter = document.getElementById("materialFilterStatus")?.value || "";
        
        // Convert project ID to warehouse value if needed
        const warehouseValue = selectedProjectId === "all" ? "all" : selectedProjectId;
        renderMaterialsWithFilter(warehouseValue, searchQuery, statusFilter);
      });
    }
  }).catch(err => console.error('Error loading projects:', err));

  document.addEventListener("click", (e) => {
    if (e.target === userModal) userModal.style.display = "none";
    if (e.target === materialModal) materialModal.style.display = "none";
    if (e.target === warehouseModal) warehouseModal.style.display = "none";
    if (e.target === deliveryModal) deliveryModal.style.display = "none";
    const configureMaterialColumnsModal = document.getElementById("configureMaterialColumnsModal");
    if (e.target === configureMaterialColumnsModal) configureMaterialColumnsModal.style.display = "none";
  });
});

  // ==================== SEARCH FUNCTIONALITY ====================
  const searchMaterialInput = document.getElementById("searchMaterial");
  if (searchMaterialInput) {
    searchMaterialInput.addEventListener("input", (e) => {
      const searchQuery = e.target.value.trim();
      const activeWarehouse = document.querySelector(".warehouses-row .tab.active")?.dataset.warehouse || "all";
      renderMaterials(activeWarehouse, searchQuery);
    });
  }

  // ==================== MATERIAL FILTER FUNCTIONALITY ====================
  const materialFilterStatus = document.getElementById("materialFilterStatus");
  if (materialFilterStatus) {
    materialFilterStatus.addEventListener("change", (e) => {
      const searchQuery = searchMaterialInput ? searchMaterialInput.value.trim() : "";
      const activeWarehouse = document.querySelector(".warehouses-row .tab.active")?.dataset.warehouse || "all";
      renderMaterialsWithFilter(activeWarehouse, searchQuery, e.target.value);
    });
  }

  // ==================== SEARCH FUNCTIONALITY FOR MATERIALS TAB 2 ====================
  const searchMaterialInput2 = document.getElementById("searchMaterial2");
  if (searchMaterialInput2) {
    searchMaterialInput2.addEventListener("input", (e) => {
      const searchQuery = e.target.value.trim();
      renderMaterials2("all", searchQuery);
    });
  }

  // ==================== MATERIAL FILTER FUNCTIONALITY FOR MATERIALS TAB 2 ====================
  const materialFilterStatus2 = document.getElementById("materialFilterStatus2");
  if (materialFilterStatus2) {
    materialFilterStatus2.addEventListener("change", (e) => {
      const searchQuery = searchMaterialInput2 ? searchMaterialInput2.value.trim() : "";
      renderMaterialsWithFilter2("all", searchQuery, e.target.value);
    });
  }

  const searchDeliveryInput = document.getElementById("searchDelivery");
  const filterDeliveryMonth = document.getElementById("filterDeliveryMonth");
  const filterDeliveryYear = document.getElementById("filterDeliveryYear");

  if (searchDeliveryInput) {
    searchDeliveryInput.addEventListener("input", (e) => {
      window.renderDeliveriesTableWithPagination(allDeliveries, filterDeliveryMonth.value, filterDeliveryYear.value, e.target.value);
    });
  }

  if (filterDeliveryMonth) {
    filterDeliveryMonth.addEventListener("change", (e) => {
      window.renderDeliveriesTableWithPagination(allDeliveries, e.target.value, filterDeliveryYear.value, searchDeliveryInput?.value || "");
    });
  }

  if (filterDeliveryYear) {
    filterDeliveryYear.addEventListener("change", (e) => {
      window.renderDeliveriesTableWithPagination(allDeliveries, filterDeliveryMonth.value, e.target.value, searchDeliveryInput?.value || "");
    });
  }

  // Low Stock Modal handlers
  if (document.getElementById("closeLowStockModalBtn")) {
    document.getElementById("closeLowStockModalBtn").onclick = () => {
      document.getElementById("lowStockModal").style.display = "none";
    };
  }

  // Near to Expire Modal handlers
  if (document.getElementById("closeNearExpireModalBtn")) {
    document.getElementById("closeNearExpireModalBtn").onclick = () => {
      document.getElementById("nearExpireModal").style.display = "none";
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
          await addDoc(collection(db, "materials"), {
            itemCode: material.itemCode,
            material: material.material,
            description: material.description || "",
            quantity: quantity,
            warehouse: toWarehouseId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
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
        
        await logActivity("transfer", "stock_transfer", `TRANSFERRED Stock - Material: ${material.material} (${material.itemCode}), Quantity: ${quantity} units, From: ${fromWh?.name || fromWarehouseId}, To: ${toWh?.name || toWarehouseId}, Notes: ${notes || 'None'}`);
        
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

  // Close modal when clicking outside
  if (transferModal) {
    transferModal.addEventListener("click", (e) => {
      if (e.target === transferModal) {
        transferModal.style.display = "none";
      }
    });
  }

  // ==================== MATERIAL FORM TOGGLE ====================
  const materialModal = document.getElementById("materialModal");
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
            document.getElementById("matTransferMaterial").value = `${material.itemCode} - ${material.material}`;
            document.getElementById("matTransferFromWarehouse").value = warehouse?.name || material.warehouse;
            document.getElementById("matTransferAvailableQty").value = material.quantity;
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
          await addDoc(collection(db, "materials"), {
            itemCode: material.itemCode,
            material: material.material,
            description: material.description || "",
            quantity: quantity,
            warehouse: toWarehouseId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
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

  // ===========================
  // MONTHLY REPORT FUNCTIONALITY
  // ===========================
  
  // Populate year dropdown
  const reportYear = document.getElementById("reportYear");
  if (reportYear) {
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 5; i--) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      reportYear.appendChild(option);
    }
  }

  // Generate monthly report
  window.generateMonthlyReport = async function() {
    const month = document.getElementById("reportMonth")?.value;
    const year = document.getElementById("reportYear")?.value;
    const warehouse = document.getElementById("reportWarehouse")?.value;

    if (!month || !year) {
      showAlert("❌ Please select month and year", "error");
      return;
    }

    try {
      // Get all materials
      const materialsSnap = await getDocs(collection(db, "materials"));
      const materials = [];
      materialsSnap.forEach(doc => {
        materials.push({ id: doc.id, ...doc.data() });
      });

      // Get all stock movements for tracking
      const movementsSnap = await getDocs(collection(db, "stock_movements"));
      const movements = [];
      movementsSnap.forEach(doc => {
        movements.push({ id: doc.id, ...doc.data() });
      });

      // Generate report
      const reportData = [];
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      // Get unique materials that have EVER had movements (in stock tab)
      const materialIdsWithMovements = new Set();
      movements.forEach(m => {
        if (m.materialId) {
          materialIdsWithMovements.add(m.materialId);
        }
      });

      // Group materials by warehouse and item code - ONLY for materials with movements
      const materialsByWH = {};
      materials.forEach(mat => {
        // ONLY include materials that have stock movements
        if (!materialIdsWithMovements.has(mat.id)) {
          return;
        }
        
        const whId = mat.warehouse || "Unknown";
        // Get warehouse name from ID
        let whName = whId;
        if (whId !== "Unknown") {
          const whObj = allWarehouses.find(w => w.id === whId);
          whName = whObj ? whObj.name : whId;
        }
        const key = `${whId}-${mat.itemCode}`;
        
        if (!materialsByWH[key]) {
          materialsByWH[key] = {
            itemCode: mat.itemCode,
            material: mat.material,
            warehouseId: whId,
            warehouseName: whName,
            materialId: mat.id,
            currentQty: parseInt(mat.quantity) || 0
          };
        }
      });

      // Define month boundaries
      const startOfMonth = new Date(yearNum, monthNum - 1, 1);
      const endOfMonth = new Date(yearNum, monthNum, 0, 23, 59, 59);

      // Calculate movements for each item
      for (const key in materialsByWH) {
        const item = materialsByWH[key];
        
        // Filter warehouse if selected
        if (warehouse && warehouse !== "All Warehouses" && item.warehouseId !== warehouse) {
          continue;
        }

        // 1. BEGINNING QUANTITY: Sum of all movements BEFORE the start of the month
        let beginningQty = 0;
        movements.forEach(m => {
          const movementDate = new Date(m.date || "");
          
          // Include only movements before the start of the month
          if (movementDate < startOfMonth &&
              m.materialId === item.materialId &&
              m.warehouseId === item.warehouseId) {
            
            const qty = parseInt(m.quantity) || 0;
            const typeStr = (m.type || "").toLowerCase();
            
            // Classify as IN or OUT
            if (typeStr.includes("add") || typeStr.includes("in") || typeStr === "in") {
              beginningQty += qty;
            } else if (typeStr.includes("delete") || typeStr.includes("out") || typeStr === "out") {
              beginningQty -= qty;
            }
          }
        });
        beginningQty = Math.max(0, beginningQty);

        // Get all movements for this material and warehouse DURING the month
        const monthMovements = movements.filter(m => {
          const movementDate = new Date(m.date || "");
          
          return movementDate >= startOfMonth && 
                 movementDate <= endOfMonth &&
                 m.materialId === item.materialId &&
                 m.warehouseId === item.warehouseId;
        });

        // 2. QUANTITY IN: Sum of all IN movements during the month
        let qtyIn = 0;
        monthMovements.forEach(m => {
          const qty = parseInt(m.quantity) || 0;
          const typeStr = (m.type || "").toLowerCase();
          
          if (typeStr.includes("add") || typeStr.includes("in") || typeStr === "in") {
            qtyIn += qty;
          }
        });

        // 3. QUANTITY OUT: Sum of all OUT movements during the month
        let qtyOut = 0;
        monthMovements.forEach(m => {
          const qty = parseInt(m.quantity) || 0;
          const typeStr = (m.type || "").toLowerCase();
          
          if (typeStr.includes("delete") || typeStr.includes("out") || typeStr === "out") {
            qtyOut += qty;
          }
        });

        // 4. ENDING QUANTITY: BeginningQty + QtyIn - QtyOut
        const endingQty = beginningQty + qtyIn - qtyOut;

        reportData.push({
          itemCode: item.itemCode,
          material: item.material,
          warehouse: item.warehouseName,
          warehouseId: item.warehouseId,
          beginningQty: beginningQty,
          qtyIn: qtyIn,
          qtyOut: qtyOut,
          endingQty: Math.max(0, endingQty),
          movements: monthMovements // Include movement details
        });
      }

      // Sort by item code
      reportData.sort((a, b) => a.itemCode.localeCompare(b.itemCode));

      // Render report table with transaction details
      const reportBody = document.getElementById("reportBody");
      if (!reportBody) return;

      if (reportData.length === 0) {
        reportBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#a0a0a0;">No data found for selected period. Only materials with stock tab activities are shown.</td></tr>`;
        return;
      }

      let html = "";
      reportData.forEach((row, idx) => {
        // Add main row
        html += `
          <tr style="background:rgba(10,155,3,.08);cursor:pointer;" onclick="document.getElementById('movements-${idx}').style.display = document.getElementById('movements-${idx}').style.display === 'none' ? 'table-row' : 'none'">
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;font-weight:600;">${row.itemCode}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;">${row.material}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#d0d0d0;text-align:center;">${row.warehouse}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#1dd1a1;text-align:center;font-weight:600;">${row.beginningQty}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#15c524;text-align:center;font-weight:600;">${row.qtyIn}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#ff6b6b;text-align:center;font-weight:600;">${row.qtyOut}</td>
            <td style="padding:12px;border-bottom:1px solid rgba(10,155,3,.1);color:#1dd1a1;text-align:center;font-weight:600;">${row.endingQty}</td>
          </tr>
        `;

        // Add transaction details row (hidden by default)
        if (row.movements.length > 0) {
          html += `
            <tr id="movements-${idx}" style="display:none;">
              <td colspan="7" style="padding:15px;background:rgba(10,155,3,.03);">
                <div style="margin:10px 0;padding:10px;background:rgba(15,30,53,0.8);border-radius:6px;border-left:3px solid #0a9b03;">
                  <div style="color:#0a9b03;font-weight:600;margin-bottom:8px;">📋 Transactions for this item:</div>
                  <table style="width:100%;border-collapse:collapse;margin-top:8px;">
                    <thead>
                      <tr style="border-bottom:1px solid rgba(10,155,3,.2);">
                        <th style="padding:8px;text-align:left;color:#0a9b03;font-size:12px;">Date</th>
                        <th style="padding:8px;text-align:left;color:#0a9b03;font-size:12px;">Type</th>
                        <th style="padding:8px;text-align:center;color:#0a9b03;font-size:12px;">Quantity</th>
                        <th style="padding:8px;text-align:left;color:#0a9b03;font-size:12px;">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${row.movements.map(m => {
                        const moveDate = new Date(m.date || "");
                        const dateStr = moveDate.toLocaleDateString('en-US', {year:'numeric',month:'2-digit',day:'2-digit'});
                        const typeStr = (m.type || "").toLowerCase();
                        let typeLabel = "UNKNOWN";
                        let typeColor = "#a0a0a0";
                        
                        if (typeStr.includes("add") || typeStr.includes("in") || typeStr === "in") {
                          typeLabel = "IN";
                          typeColor = "#15c524";
                        } else if (typeStr.includes("delete") || typeStr.includes("out") || typeStr === "out") {
                          typeLabel = "OUT";
                          typeColor = "#ff6b6b";
                        }
                        
                        return `
                          <tr style="border-bottom:1px solid rgba(10,155,3,.1);">
                            <td style="padding:8px;color:#a0a0a0;font-size:12px;">${dateStr}</td>
                            <td style="padding:8px;color:${typeColor};font-weight:600;font-size:12px;">${typeLabel}</td>
                            <td style="padding:8px;text-align:center;color:${typeColor};font-weight:600;font-size:12px;">${m.quantity}</td>
                            <td style="padding:8px;color:#a0a0a0;font-size:12px;">${m.details || "-"}</td>
                          </tr>
                        `;
                      }).join("")}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          `;
        }
      });

      reportBody.innerHTML = html;
      showAlert("✅ Report generated successfully! Click rows to view transactions.", "success");
    } catch (err) {
      console.error("Error generating report:", err);
      showAlert("❌ Error generating report: " + err.message, "error");
    }
  };

  // Export report to Excel
  window.exportMonthlyReport = function() {
    const month = document.getElementById("reportMonth")?.value;
    const year = document.getElementById("reportYear")?.value;
    
    if (!month || !year) {
      showAlert("❌ Generate a report first", "error");
      return;
    }

    const reportBody = document.getElementById("reportBody");
    const rows = reportBody.querySelectorAll("tr");
    
    if (rows.length === 0 || rows[0].innerHTML.includes("No data found")) {
      showAlert("❌ No data to export", "error");
      return;
    }

    const data = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length > 0) {
        data.push({
          "Item Code": cells[0]?.textContent || "",
          "Material": cells[1]?.textContent || "",
          "Warehouse": cells[2]?.textContent || "",
          "Beginning Qty": parseInt(cells[3]?.textContent) || 0,
          "Qty Out": parseInt(cells[4]?.textContent) || 0,
          "Qty In": parseInt(cells[5]?.textContent) || 0,
          "Ending Qty": parseInt(cells[6]?.textContent) || 0
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Report");

    worksheet["!cols"] = [
      { wch: 15 }, { wch: 20 }, { wch: 15 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    const filename = `Monthly_Report_${month}-${year}.xlsx`;
    XLSX.writeFile(workbook, filename);
    showAlert("✅ Report exported successfully!", "success");
  };

  // Setup event listeners for monthly report
  if (document.getElementById("generateReportBtn")) {
    document.getElementById("generateReportBtn").onclick = window.generateMonthlyReport;
  }

  if (document.getElementById("exportReportBtn")) {
    document.getElementById("exportReportBtn").onclick = window.exportMonthlyReport;
  }

  // Load warehouses when page loads
  populateReportWarehouses();

  // ==================== PROJECT CONFIGURATION MENU ====================
  // Global variables for project configuration
  let allTrades = [];
  let allProjectColumns = [];

  // Load Trades
  async function loadTrades() {
    try {
      const snap = await getDocs(collection(db, "trades"));
      allTrades = [];
      
      snap.forEach(s => {
        const trade = { id: s.id, ...s.data() };
        allTrades.push(trade);
      });
      
      // Display trade dropdown
      displayTradeDropdown();
      updateTradeDisplay();
    } catch (e) {
      console.error("loadTrades error:", e);
    }
  }

  // Display Trade Dropdown
  function displayTradeDropdown() {
    const dropdown = document.getElementById("whTradeDropdown");
    if (!dropdown) return;
    
    const currentValue = document.getElementById("whTrade").value;
    const selectedTrades = currentValue ? currentValue.split(",") : [];
    
    dropdown.innerHTML = "";
    
    if (allTrades.length === 0) {
      dropdown.innerHTML = '<div style="color:#a0a0a0;padding:12px;text-align:center;">No trades available</div>';
      return;
    }
    
    allTrades.forEach(trade => {
      if (trade.name) {
        const isChecked = selectedTrades.includes(trade.name);
        dropdown.innerHTML += `
          <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;transition:all 0.2s;border-bottom:1px solid rgba(10,155,3,0.1);background:${isChecked ? 'rgba(10,155,3,0.2)' : 'transparent'};" onmouseover="this.style.background='rgba(10,155,3,0.15)'" onmouseout="this.style.background='${isChecked ? 'rgba(10,155,3,0.2)' : 'transparent'}'">
            <input type="checkbox" value="${trade.name}" ${isChecked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:#0a9b03;" onchange="window.toggleTradeSelection('${trade.name}')">
            <span style="color:#e0e0e0;user-select:none;flex:1;">${trade.name}</span>
          </label>
        `;
      }
    });
  }
  
  // Update display field with selected trades
  function updateTradeDisplay() {
    const tradeValue = document.getElementById("whTrade").value;
    const display = document.getElementById("whTradeDisplay");
    if (display) {
      if (tradeValue) {
        const trades = tradeValue.split(",");
        display.value = trades.join(", ");
      } else {
        display.value = "";
      }
    }
  }

  // Load Project Columns
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

  // Display Trades in modal
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
          <button type="button" onclick="window.deleteTradeFromDash('${trade.id}')" style="background:#ff6b6b;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.opacity='0.8'" onmouseout="this.opacity='1'">
            Delete
          </button>
        </div>
      `;
    });
  }

  // Display Project Columns in modal
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
            <button type="button" onclick="window.deleteProjectColumnFromDash('${col.id}')" style="background:#ff6b6b;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.opacity='0.8'" onmouseout="this.opacity='1'">
              Delete
            </button>
          </div>
        `;
      });
    }
  }

  // Toggle Trade Dropdown
  window.toggleTradeDropdown = (event) => {
    event.stopPropagation();
    const dropdown = document.getElementById("whTradeDropdown");
    if (dropdown) {
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    }
  };

  // Toggle Trade Selection
  window.toggleTradeSelection = (tradeName) => {
    const input = document.getElementById("whTrade");
    const currentValue = input.value;
    const selectedTrades = currentValue ? currentValue.split(",") : [];
    
    const index = selectedTrades.indexOf(tradeName);
    if (index > -1) {
      selectedTrades.splice(index, 1);
    } else {
      selectedTrades.push(tradeName);
    }
    
    input.value = selectedTrades.join(",");
    updateTradeDisplay();
    displayTradeDropdown();
  };

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("whTradeDropdown");
    const display = document.getElementById("whTradeDisplay");
    if (dropdown && display && !dropdown.contains(e.target) && !display.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // Delete Trade
  window.deleteTradeFromDash = async (tradeId) => {
    const trade = allTrades.find(t => t.id === tradeId);
    if (!confirm(`Delete trade "${trade?.name || "Unknown"}"?`)) return;
    try {
      await deleteDoc(doc(db, "trades", tradeId));
      showAlert("✅ Trade deleted!", "success");
      await loadTrades();
      displayTrades();
    } catch (e) {
      console.error("deleteTradeFromDash error:", e);
      showAlert("Error deleting trade", "error");
    }
  };

  // Delete Project Column
  window.deleteProjectColumnFromDash = async (columnId) => {
    const col = allProjectColumns.find(c => c.id === columnId);
    if (!confirm(`Delete column "${col?.name || "Unknown"}"?`)) return;
    try {
      await deleteDoc(doc(db, "projectColumns", columnId));
      showAlert("✅ Column deleted!", "success");
      await loadProjectColumns();
      displayProjectColumns();
    } catch (e) {
      console.error("deleteProjectColumnFromDash error:", e);
      showAlert("Error deleting column", "error");
    }
  };

  // 3-Dot Button Click Handler
  const moreProjectBtn = document.getElementById("moreProjectBtn");
  const moreProjectDropdown = document.getElementById("moreProjectDropdown");
  
  if (moreProjectBtn && moreProjectDropdown) {
    console.log("Project Configuration Menu: Found elements");
    
    moreProjectBtn.addEventListener("click", (e) => {
      console.log("3-dot button clicked!");
      e.stopPropagation();
      e.preventDefault();
      const isHidden = moreProjectDropdown.style.display === "none" || moreProjectDropdown.style.display === "";
      moreProjectDropdown.style.display = isHidden ? "block" : "none";
      console.log("Dropdown display:", moreProjectDropdown.style.display);
    });
  } else {
    console.log("Could not find moreProjectBtn or moreProjectDropdown elements");
  }
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (moreProjectDropdown && moreProjectBtn && !moreProjectBtn.contains(e.target) && !moreProjectDropdown.contains(e.target)) {
      moreProjectDropdown.style.display = "none";
    }
  });

  // Configure Project Columns Modal
  const configureProjectColumnsOption = document.getElementById("configureProjectColumnsOption");
  const configureProjectColumnsModal = document.getElementById("configureProjectColumnsModal");
  const closeProjectColumnsModalBtn = document.getElementById("closeProjectColumnsModalBtn");
  const saveProjectColumnsBtn = document.getElementById("saveProjectColumnsBtn");
  const cancelProjectColumnsBtn = document.getElementById("cancelProjectColumnsBtn");
  const addProjectColumnBtn = document.getElementById("addProjectColumnBtn");

  if (configureProjectColumnsOption) {
    configureProjectColumnsOption.addEventListener("click", async (e) => {
      e.preventDefault();
      if (moreProjectDropdown) moreProjectDropdown.style.display = "none";
      await loadProjectColumns();
      displayProjectColumns();
      if (configureProjectColumnsModal) {
        configureProjectColumnsModal.classList.add("active");
      }
    });
  }

  if (closeProjectColumnsModalBtn) {
    closeProjectColumnsModalBtn.addEventListener("click", () => {
      if (configureProjectColumnsModal) {
        configureProjectColumnsModal.classList.remove("active");
      }
    });
  }

  if (cancelProjectColumnsBtn) {
    cancelProjectColumnsBtn.addEventListener("click", () => {
      if (configureProjectColumnsModal) {
        configureProjectColumnsModal.classList.remove("active");
      }
    });
  }

  if (addProjectColumnBtn) {
    addProjectColumnBtn.addEventListener("click", async () => {
      const name = (document.getElementById("newProjectColumnName").value || "").trim();
      if (!name) {
        showAlert("Enter column name", "error");
        return;
      }
      try {
        await addDoc(collection(db, "projectColumns"), {
          name,
          createdAt: new Date().toISOString()
        });
        if (document.getElementById("newProjectColumnName")) {
          document.getElementById("newProjectColumnName").value = "";
        }
        await loadProjectColumns();
        displayProjectColumns();
        showAlert("Column added!", "success");
      } catch (e) {
        showAlert("Error adding column: " + e.message, "error");
      }
    });
  }

  if (saveProjectColumnsBtn) {
    saveProjectColumnsBtn.addEventListener("click", () => {
      if (configureProjectColumnsModal) {
        configureProjectColumnsModal.classList.remove("active");
      }
      showAlert("Columns saved!", "success");
    });
  }

  // Configure Trade Modal
  const configureTradeOption = document.getElementById("configureTradeOption");
  const configureTradeModal = document.getElementById("configureTradeModal");
  const closeTradeModalBtn = document.getElementById("closeTradeModalBtn");
  const saveTradeBtn = document.getElementById("saveTradeBtn");
  const cancelTradeBtn = document.getElementById("cancelTradeBtn");
  const addTradeBtn = document.getElementById("addTradeBtn");

  if (configureTradeOption) {
    configureTradeOption.addEventListener("click", async (e) => {
      e.preventDefault();
      if (moreProjectDropdown) moreProjectDropdown.style.display = "none";
      await loadTrades();
      displayTrades();
      if (configureTradeModal) {
        configureTradeModal.classList.add("active");
      }
    });
  }

  if (closeTradeModalBtn) {
    closeTradeModalBtn.addEventListener("click", () => {
      if (configureTradeModal) {
        configureTradeModal.classList.remove("active");
      }
    });
  }

  if (cancelTradeBtn) {
    cancelTradeBtn.addEventListener("click", () => {
      if (configureTradeModal) {
        configureTradeModal.classList.remove("active");
      }
    });
  }

  if (addTradeBtn) {
    addTradeBtn.addEventListener("click", async () => {
      const name = (document.getElementById("newTradeName").value || "").trim();
      if (!name) {
        showAlert("Enter trade name", "error");
        return;
      }
      try {
        await addDoc(collection(db, "trades"), {
          name,
          createdAt: new Date().toISOString()
        });
        document.getElementById("newTradeName").value = "";
        await loadTrades();
        displayTrades();
        showAlert("Trade added!", "success");
      } catch (e) {
        showAlert("Error adding trade: " + e.message, "error");
      }
    });
  }

  if (saveTradeBtn) {
    saveTradeBtn.addEventListener("click", () => {
      if (configureTradeModal) {
        configureTradeModal.classList.remove("active");
      }
      showAlert("Trades saved!", "success");
    });
  }

  // Initialize on load
  loadTrades();
  loadProjectColumns();
  loadProjects();
