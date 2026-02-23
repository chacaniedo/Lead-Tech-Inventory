//When adding an item in the Purchasing module, the system should require the user to enter a PO (Purchase Order) number.

//Once the PO number is entered, the system should automatically fetch and display the corresponding PO details in the Material Processing tab.

//Since the workflow is Material Request → Purchase Order → Material Processing, the Purchase Order in the Material Processing module must be linked to the Purchasing module. This is important so we can track the Purchase Order with complete and accurate details.

//Additionally, when adding an item inside the project and entering the PO number, the system should auto-populate the following information:

//Material Request (MR) Number

//PO Date

//Material Description / Specifications

//Quantity


// ============================================================
// PURCHASING APPLICATION - MAIN JAVASCRIPT FILE
// ============================================================

console.log('🚀 Purchasing.js module loading...');

// Import Firebase functions
import {
    auth,
    db,
    getUserSession,
    clearUserSession,
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    getTrackingRecords,
    addTrackingRecord,
    updateTrackingRecord,
    deleteTrackingRecord,
    getPriceList,
    updatePriceListItem,
    getProjects,
    addProjectRecord,
    updateProjectRecord,
    deleteProjectRecord,
    getActivityLogs,
    addActivityLog,
    deleteAllActivityLogs,
    deleteActivityLogById,
    saveColumnConfiguration,
    loadColumnConfiguration,
    collection,
    getDocs,
    addDoc,
    query,
    where,
    getDoc,
    doc,
    deleteDoc
} from "./firebase.js";
import { onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// EARLY WINDOW FUNCTION SETUP (Accessible from HTML immediately)
// ============================================================
// These are placeholder functions that will be replaced by actual implementations
// This ensures HTML onclick handlers can find these functions

const windowFunctions = {};

// Mark that module is still loading
window.__MODULE_LOADING = true;

// Expose a manager for delayed function binding
window.__bindFunction = function(name, func) {
    windowFunctions[name] = func;
    window[name] = func;
};

// Pre-declare all window functions as error-catching proxies
const functionNames = [
    'toggleSidebar', 'closeSidebar', 'switchTab', 'toggleSubmenu',
    'showDashboardPage', 'showPurchaseTrackingPage', 'showOngoingOrdersPage', 'showProjectsPage', 'closeProjectsModal', 'loadProjectsPage', 'searchProjectsPage', 'searchProjectsModal', 'showSettingsPage', 'switchSettingsTab', 'viewProjectDetails',
    'showMRToPOMonitoringPage', 'searchMRToPOMonitoring', 'showPOToDRMonitoringPage', 'searchPOToDRMonitoring',
    'openAddProjectModal', 'closeAddProjectModal',
    'saveProjectRecord', 'deleteProject', 'confirmDelete', 'cancelDelete', 'searchProjects',
    'loadActivityLogsPage', 'searchActivityLogs', 'filterActivityLogsByType', 'filterActivityLogsByMonth', 'filterActivityLogsByYear', 'clearAllActivityLogs', 'prevActivityLogsPage', 'nextActivityLogsPage',
    'openAddItemModal', 'closeAddItemModal', 'closeAddPOModal', 'openSelectPOModal', 'closeSelectPOModal', 'addPOToProjectDirectly', 'fetchPODetailsFromNumber', 'handlePONumberLookup', 'handleEditPONumberLookup', 'calculateItemTotal', 'calculateEditItemTotal',
    'calculatePOBalanceQtyItem', 'calculateItemPaidAmount', 'calculateEditItemPaidAmount', 'calculateItemRemainingPayable',
    'editProjectItem', 'openEditItemModal', 'closeEditItemModal', 'calculateEditPaymentAmount',
    'autoUpdateDeliveryStatus', 'calculateEditPOBalanceQtyItem', 'calculateEditItemRemainingPayable',
    'saveEditItemRecord', 'deleteProjectItem', 'confirmDeleteProjectItem', 'cancelDeleteProjectItem',
    'saveItemRecord', 'calculatePOBalanceQty', 'calculateRemainingPayable', 'preLoadAllData',
    'loadMaterialsForAutocomplete', 'initializeItemAutocomplete', 'initializePartsDescriptionAutocomplete', 'handleItemInput', 'handlePartsDescriptionInput', 'selectMaterialForField', 'removeMaterialDropdown',
    'loadProjects', 'updateTotalProjectsCount', 'calculateTotalMaterialsSpent', 'updateProjectsTradeChart',
    'updateTopSuppliersChart', 'renderTopSuppliersChart', 'filterBySupplier', 'toggleSuppliersTimeDropdown', 'selectSuppliersTimeScope',
    'cacheChartData', 'renderCachedChart', 'initializeChartFromCache', 'renderProjectsTableFast', 'syncProjectsTableStructure',
    'loadTrackingRecords', 'refreshTrackingTableData', 'getAllProjectItems', 'renderTrackingTableFast',
    'renderProjectsTable', 'renderTrackingTable', 'filterTrackingByStatus', 'changeDeliveryStatus',
    'searchTracking', 'editTrackingRecord', 'closeEditTrackingModal', 'deleteTrackingRecordConfirm',
    'confirmDeleteTracking', 'cancelDeleteTracking', 'updateStatusOnAmountChange', 'saveTrackingEdit',
    'getMonthText', 'openAddTrackingModal', 'closeAddTrackingModal', 'saveTrackingRecord',
    'openEditModal', 'closeEditModal', 'handleLogout', 'saveNewPassword', 'resetPasswordForm',
    'openProjectPOItemsModal', 'openPOSheetForProject',
    'openProjectPOItemsModal', 'openPOSheetForProject', 'openPOCardForProject',
    'toggleExportDropdown', 'exportTrackingDataAsExcel', 'exportTrackingDataAsPDF', 'showNotification',
    'openPaymentDetailsModal', 'closePaymentDetailsModal', 'togglePaymentHistoryList'
    , 'showPODetailsCard', 'loadLinkedPOs', 'syncPOToProject', 'redirectToPurchasingWithPO', 'addPOToProjectDetails'
];

functionNames.forEach(name => {
    window[name] = function(...args) {
        if (windowFunctions[name]) {
            return windowFunctions[name](...args);
        } else {
            console.warn(`⚠️ Function ${name} not yet initialized. Module still loading...`);
        }
    };
});

// ============================================================
// PAGINATION STATE VARIABLES
// ============================================================
let trackingTablePaginationState = {
    currentPage: 1,
    rowsPerPage: 20,
    totalRows: 0,
    allRecords: []
};

let projectsTablePaginationState = {
    currentPage: 1,
    rowsPerPage: 20,
    totalRows: 0,
    allProjects: []
};

// -----------------------------------------------------------------------------
// Helper state/functions for manually‑added purchasing projects
// -----------------------------------------------------------------------------
// Cache for main project-management records (used for autocomplete only)
let mainProjectsCache = null;

// Fetch up-to-date list of all projects; the optional `force` flag causes a fresh
// load even if we already have cached data.  We also update all datalist elements
// so that autocomplete suggestions stay current.
async function fetchMainProjects(force = false) {
    if (force || !mainProjectsCache) {
        try {
            mainProjectsCache = await getProjects();
            // once we have data we can populate the datalist elements
            updateProjectDatalists(mainProjectsCache);
        } catch (e) {
            console.error('Error fetching main projects for autocomplete', e);
            mainProjectsCache = [];
        }
    } else {
        // data already cached; do not refresh datalists automatically here.  The
        // only callers that need the options to be rebuilt should explicitly call
        // updateProjectDatalists or pass `force=true`.  This prevents the
        // recursive input-dispatch loop that was causing RangeErrors.
    }
    return mainProjectsCache;
}

// populate datalist options for project id/name
function updateProjectDatalists(projects) {
    const idsList = document.getElementById('projectIdsList');
    const namesList = document.getElementById('projectNamesList');
    if (!projects) return;
    console.log('🔄 updating project datalists (', projects.length, 'entries )');
    if (idsList) {
        idsList.innerHTML = '';
        projects.forEach(p => {
            // primary ID may be stored in several possible fields
            const pid = p.projectID || p.projectId || p.project_id || p.code || '';
            if (pid) {
                const opt = document.createElement('option');
                opt.value = pid;
                idsList.appendChild(opt);
            }
        });
    }
    if (namesList) {
        // second field is "Project" – we should show the value that the
        // dashboard considers the code (p.code) but fall back to other fields
        // for compatibility.  Display text will include the name if available.
        namesList.innerHTML = '';
        projects.forEach(p => {
            const codeVal = p.code || p.projectName || p.project_name || '';
            const nameVal = p.name || p.projectName || p.project_name || '';
            if (codeVal) {
                const opt = document.createElement('option');
                opt.value = codeVal;
                // show both code and name to help user pick
                if (nameVal && nameVal !== codeVal) {
                    opt.textContent = `${codeVal} - ${nameVal}`;
                }
                namesList.appendChild(opt);
            }
        });
    }

    // if the form fields already have values (user typed before the list was ready),
    // re-trigger an input event so that the datalist dropdown can pop up again with the
    // new options present (some browsers don't refresh automatically).
    ['addProjectID', 'addProjectProjectName'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) {
            const ev = new Event('input', { bubbles: true });
            el.dispatchEvent(ev);
        }
    });
}

// Auto‑populate add/edit project modal fields when user types an ID or name
async function autoFillProjectFields() {
    const idEl = document.getElementById('addProjectID');
    const nameEl = document.getElementById('addProjectProjectName');
    if (!idEl || !nameEl) return;

    const idVal = idEl.value.trim().toLowerCase();
    const nameVal = nameEl.value.trim().toLowerCase();
    if (!idVal && !nameVal) return;

    let projects;
    if (mainProjectsCache) {
        projects = mainProjectsCache;
    } else {
        projects = await fetchMainProjects();
    }

    const match = (projects || []).find(p => {
        const pid = (p.projectID || p.projectId || p.project_id || p.code || '').toString().toLowerCase();
        const pname = (p.projectName || p.project_name || p.name || '').toString().toLowerCase();
        const pcode = (p.code || '').toString().toLowerCase();
        // consider both project name and code when matching against the second field
        const combinedName = pname + ' ' + pcode;
        return (idVal && pid === idVal) ||
               (nameVal && combinedName.includes(nameVal)) ||
               (idVal && combinedName.includes(idVal)) ||
               (nameVal && pid === nameVal);
    });

    if (match) {
        // fill primary ID field
        idEl.value = match.projectID || match.projectId || match.project_id || match.code || '';
        // fill code/name field with whichever is conventionally used as code
        nameEl.value = match.code || match.projectName || match.project_name || match.name || '';
        document.getElementById('addProjectClient').value = match.client || match.client_name || '';
        document.getElementById('addProjectLocation').value = match.location || '';
        // support both single trade string and array of trades
        const tradeVal = Array.isArray(match.trades) ? match.trades.join(', ') : (match.trade || '');
        document.getElementById('addProjectTrade').value = tradeVal;
        document.getElementById('addProjectBudget').value = match.budget || '';
        document.getElementById('addProjectStatus').value = match.status || 'On-going';
    }
}

let projectDetailsTablePaginationState = {
    currentPage: 1,
    rowsPerPage: 20,
    totalRows: 0,
    allItems: [],
    projectBudget: 0  // Store project budget for remaining budget calculation
};

// ----------------------
// Helper utilities
// ----------------------
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(val) {
    const n = parseFloat(val || 0);
    if (isNaN(n)) return '';
    return '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Short date formatter used across tables and exports (YYYY-MM-DD)
function formatDateShort(dateStr) {
    if (!dateStr && dateStr !== 0) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toISOString().split('T')[0];
    } catch (e) {
        return String(dateStr);
    }
}

// Simple function to populate the visible project details table
async function populateProjectDetailsTable(projectId) {
    try {
        const projects = await getProjects();
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        
        const items = project.items || [];
        const tbody = document.getElementById('project-details-data-body');
        if (!tbody) return;

        // Populate pagination state so Payment Details Modal can access items
        projectDetailsTablePaginationState.allItems = items;
        projectDetailsTablePaginationState.totalRows = items.length;
        projectDetailsTablePaginationState.projectBudget = parseFloat(project.budget || 0);
        
        tbody.innerHTML = '';
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:#a0a0a0;">No data available</td></tr>';
            return;
        }
        
        items.forEach((it, idx) => {
            // Format dates properly
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                try {
                    const date = new Date(dateStr);
                    return date.toISOString().split('T')[0];
                } catch (e) {
                    return dateStr || '';
                }
            };

            // Payment terms countdown info (for Terms of Payment column)
            const termsSource = it.paymentTerms || it.termsOfPayment || '';
            const paidAmt = parseFloat(it.paidAmount || 0);
            
            // Calculate colors for Remaining Qty and Remaining Payable
            const remainingQtyValue = parseFloat(it.remainingQty || 0);
            const remainingQtyColor = remainingQtyValue > 0 ? '#ff1744' : '#0a9b03';
            const remainingPayableValue = parseFloat(it.remainingPayable || 0);
            const remainingPayableColor = remainingPayableValue > 0 ? '#ff1744' : '#0a9b03';
            
            const deliveryDate = formatDate(it.deliveryDate || it.expectedDeliveryDate);
            const termsInfo = calculatePaymentTermsCountdown(deliveryDate, termsSource, paidAmt, true);
            const termsDisplay = termsInfo && termsInfo.status ? termsInfo.status : (termsSource || '');
            const termsColor = termsInfo && termsInfo.color ? termsInfo.color : '#e0e0e0';

            const monthNames = [
                '', 'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const monthText = it.month ? (monthNames[parseInt(it.month, 10)] || it.month) : '';

            const statusDisplay = it.status || 'On-going';
            const statusClass = `status-${statusDisplay.toLowerCase().replace(/[\s-]/g, '')}` || 'status-ongoing';

            const html = `<tr style="border-bottom:1px solid rgba(10,155,3,0.1)">
                <td style="padding:8px 12px;color:#e0e0e0;">${it.itemCode || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${monthText}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.material || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.specification || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.brand || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.bestSupplier || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;text-align:center;">₱${it.cost ? parseFloat(it.cost).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '0.00'}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.mrNo || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${formatDate(it.mrDate)}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${it.poNumber || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${formatDate(it.poDate)}</td>
                <td style="padding:8px 12px;color:#e0e0e0;">${deliveryDate}</td>
                <td style="padding:8px 12px;color:#e0e0e0;text-align:center;">${it.quantity || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;text-align:center;">${it.receivedQty || '0'}</td>
                <td style="padding:8px 12px;color:#e0e0e0;text-align:center;">${it.remainingQty || ''}</td>
                <td style="padding:8px 12px;color:#e0e0e0;text-align:right;">${it.totalAmount ? '₱' + parseFloat(it.totalAmount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}</td>
                <td style="padding:8px 12px;cursor:pointer;color:white;font-weight:700;text-decoration:underline;text-align:right;" onclick="event.stopPropagation(); openPaymentDetailsModal(${idx}); return false;">${it.paidAmount ? '₱' + parseFloat(it.paidAmount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '₱0.00'}</td>
                <td style="padding:8px 12px;color:${remainingPayableColor};font-weight:600;text-align:right;">${it.remainingPayable && it.remainingPayable !== '' ? '₱' + parseFloat(it.remainingPayable).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}</td>
                <td style="padding:8px 12px;color:${termsColor};font-weight:600;">${termsDisplay}</td>
                <td style="padding:8px 12px;color:#e0e0e0;"><span class="status-badge ${statusClass}">${statusDisplay}</span></td>
                <td style="padding:8px 12px;display:flex;gap:6px;"><button onclick="editProjectDetailsItem('${projectId}', ${idx})" style="padding:6px 8px;background:#0a9b03;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Edit</button><button onclick="removeProjectItem('${projectId}', ${idx})" style="padding:6px 8px;background:#d32f2f;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Remove</button></td>
            </tr>`;
            tbody.innerHTML += html;
        });
    } catch (e) {
        console.error('Error populating table:', e);
    }
}

// Edit an item in a project - NEW VERSION for Project Details table
async function editProjectDetailsItem(projectId, itemIndex) {
    try {
        const projects = await getProjects();
        const project = projects.find(p => p.id === projectId);
        if (!project || !project.items || !project.items[itemIndex]) {
            showNotification('Item not found', 'error');
            return;
        }
        
        const item = project.items[itemIndex];
        
        // Create edit modal
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);backdrop-filter:blur(2px);z-index:2000;display:flex;align-items:center;justify-content:center;';
        modal.id = 'editProjectDetailsItemModal';
        
        const content = document.createElement('div');
        content.style.cssText = 'background:#1a3a52;border:1px solid rgba(10,155,3,0.3);border-radius:8px;padding:25px;max-width:900px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
        
        const title = document.createElement('h2');
        title.textContent = '✏️ Edit Project Item';
        title.style.cssText = 'color:#0a9b03;margin:0 0 20px 0;font-size:18px;';
        content.appendChild(title);
        
        // Define all columns in table order
        const allFields = [
            { label: 'Item Code', key: 'itemCode', type: 'text', editable: false },
            { label: 'Month', key: 'month', type: 'text', editable: false },
            { label: 'Material', key: 'material', type: 'text', editable: false },
            { label: 'Specification', key: 'specification', type: 'text', editable: false },
            { label: 'Brand', key: 'brand', type: 'text', editable: false },
            { label: 'Best Supplier', key: 'bestSupplier', type: 'text', editable: false },
            { label: 'Cost', key: 'cost', type: 'number', editable: false },
            { label: 'MR No', key: 'mrNo', type: 'text', editable: false },
            { label: 'MR Date', key: 'mrDate', type: 'text', editable: false },
            { label: 'PO Number', key: 'poNumber', type: 'text', editable: false },
            { label: 'PO Date', key: 'poDate', type: 'text', editable: false },
            { label: 'Delivery Date', key: 'deliveryDate', type: 'date', editable: true },
            { label: 'Quantity (PO)', key: 'quantity', type: 'number', editable: false },
            { label: 'Received Qty', key: 'receivedQty', type: 'number', editable: true },
            { label: 'Received Date', key: 'receivedDate', type: 'date', editable: true },
            { label: 'Remaining Qty', key: 'remainingQty', type: 'number', editable: true },
            { label: 'Total Amount', key: 'totalAmount', type: 'number', editable: false },
            { label: 'Paid Amount', key: 'paidAmount', type: 'number', editable: true },
            { label: 'Remaining Payable', key: 'remainingPayable', type: 'number', editable: true },
            { label: 'Terms of Payment', key: 'termsOfPayment', type: 'select', editable: true, options: ['COD', 'Net 15', 'Net 30', 'Net 60', 'Net 90'] },
            { label: 'Status', key: 'status', type: 'select', editable: true, options: ['On-going', 'Completed', 'Hold', 'Cancelled'] }
        ];
        
        const formInputs = {};
        
        // Create 4-column grid container
        const gridContainer = document.createElement('div');
        gridContainer.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px;';
        
        allFields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.style.cssText = 'margin-bottom:0px;';
            
            const label = document.createElement('label');
            label.textContent = field.label + ':';
            label.style.cssText = 'display:block;color:#0a9b03;font-weight:600;margin-bottom:5px;font-size:13px;';
            fieldDiv.appendChild(label);
            
            let input;
            if (field.type === 'select') {
                input = document.createElement('select');
                // Match select appearance to other input boxes (dark background, light text, subtle green border)
                const selBg = field.editable ? 'rgba(10,155,3,0.08)' : 'rgba(80,80,80,0.2)';
                input.style.cssText = `width:100%;padding:8px;background:${selBg};border:1px solid rgba(10,155,3,0.3);border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;`;
                if (!field.editable) input.disabled = true;
                field.options.forEach(opt => {
                    const optEl = document.createElement('option');
                    optEl.value = opt;
                    optEl.textContent = opt;
                    // Style options to match dark theme where possible
                    optEl.style.cssText = 'background: #0f2b33; color: #e0e0e0;';
                    if (item[field.key] === opt) optEl.selected = true;
                    input.appendChild(optEl);
                });
            } else {
                input = document.createElement('input');
                input.type = field.type;
                // Provide proper formatting for date fields
                if (field.type === 'date') {
                    try {
                        const raw = item[field.key];
                        if (raw) {
                            const d = new Date(raw);
                            if (!isNaN(d.getTime())) {
                                input.value = d.toISOString().split('T')[0];
                            } else {
                                input.value = raw;
                            }
                        } else {
                            input.value = '';
                        }
                    } catch (e) {
                        input.value = item[field.key] || '';
                    }
                } else {
                    input.value = item[field.key] || '';
                }
                const bgColor = field.editable ? 'rgba(10,155,3,0.1)' : 'rgba(80,80,80,0.2)';
                input.style.cssText = `width:100%;padding:8px;background:${bgColor};border:1px solid rgba(10,155,3,0.3);border-radius:6px;color:#e0e0e0;font-size:13px;box-sizing:border-box;`;
                if (!field.editable) input.disabled = true;
            }
            
            // Add event listener for Received Qty to auto-calculate Remaining Qty
            if (field.key === 'receivedQty' && field.editable) {
                input.addEventListener('input', (e) => {
                    const receivedQty = parseFloat(e.target.value) || 0;
                    const quantity = parseFloat(item.quantity) || 0;
                    const remaining = quantity - receivedQty;
                    if (formInputs['remainingQty']) {
                        formInputs['remainingQty'].value = remaining >= 0 ? remaining : 0;
                    }
                });
            }
            
            // Add event listener for Paid Amount to auto-calculate Remaining Payable
            if (field.key === 'paidAmount' && field.editable) {
                input.addEventListener('input', (e) => {
                    const paidAmount = parseFloat(e.target.value) || 0;
                    const totalAmount = parseFloat(item.totalAmount) || 0;
                    const remaining = totalAmount - paidAmount;
                    if (formInputs['remainingPayable']) {
                        formInputs['remainingPayable'].value = remaining >= 0 ? remaining : 0;
                    }
                });
            }
            
            formInputs[field.key] = input;
            fieldDiv.appendChild(input);
            gridContainer.appendChild(fieldDiv);
        });
        
        content.appendChild(gridContainer);

        // Add payment countdown preview for edit modal and attach listeners
        try {
            const previewEl = document.createElement('div');
            previewEl.id = 'editPaymentCountdownPreview';
            previewEl.style.cssText = 'margin-top:6px;color:#e0e0e0;font-size:12px;grid-column:span 1;';
            // Append preview next to Terms of Payment field if present
            if (formInputs['termsOfPayment'] && formInputs['termsOfPayment'].parentElement) {
                formInputs['termsOfPayment'].parentElement.appendChild(previewEl);
            } else {
                content.appendChild(previewEl);
            }

            const updatePreviewEdit = () => {
                const terms = (formInputs['termsOfPayment'] && formInputs['termsOfPayment'].value) || '';
                const paid = parseFloat((formInputs['paidAmount'] && formInputs['paidAmount'].value) || 0);
                const info = calculatePaymentTermsCountdown(null, terms, paid);
                if (info && info.status) {
                    previewEl.textContent = info.status;
                    previewEl.style.color = info.color || '#e0e0e0';
                } else {
                    previewEl.textContent = '';
                }
            };

            // Attach listeners
            if (formInputs['paidAmount']) formInputs['paidAmount'].addEventListener('input', updatePreviewEdit);
            if (formInputs['termsOfPayment']) formInputs['termsOfPayment'].addEventListener('change', updatePreviewEdit);

            // Initialize preview
            setTimeout(updatePreviewEdit, 100);
        } catch (e) {
            console.warn('⚠️ Could not attach edit-item payment preview listeners:', e);
        }
        
        // Buttons
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = 'display:flex;gap:10px;margin-top:25px;';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.cssText = 'flex:1;padding:12px;background:linear-gradient(135deg,#0a9b03 0%,#15c524 100%);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
        saveBtn.onclick = async () => {
            try {
                // Store old status for reference
                const oldStatus = item.status;
                const oldPaidAmount = parseFloat(item.paidAmount || 0);
                const oldPaymentHistory = Array.isArray(item.paymentHistory) ? [...item.paymentHistory] : [];
                
                // IMPORTANT: Get the received qty difference BEFORE updating the item
                const oldReceivedQty = parseFloat(item.receivedQty || 0);
                const newReceivedQty = parseFloat(formInputs['receivedQty']?.value) || 0;
                const quantityDifference = newReceivedQty - oldReceivedQty;
                
                console.log('💾 Saving item:', { 
                    oldReceivedQty, 
                    newReceivedQty, 
                    quantityDifference,
                    shouldCreateDelivery: quantityDifference > 0
                });
                
                // Update only editable fields
                const editableFields = [
                    'deliveryDate', 'receivedQty', 'receivedDate', 'remainingQty', 'paidAmount', 'remainingPayable', 'termsOfPayment', 'status'
                ];
                
                editableFields.forEach(key => {
                    if (formInputs[key]) {
                        item[key] = formInputs[key].value;
                    }
                });

                // Track payment history when paid amount is updated
                const newPaidAmount = parseFloat(item.paidAmount || 0);
                if (!item.paymentHistory || !Array.isArray(item.paymentHistory)) {
                    item.paymentHistory = [];
                }

                if (item.paymentHistory.length === 0 && oldPaymentHistory.length > 0) {
                    item.paymentHistory = [...oldPaymentHistory];
                }

                const paymentDelta = newPaidAmount - oldPaidAmount;
                if (paymentDelta > 0) {
                    if (item.paymentHistory.length === 0 && oldPaidAmount > 0) {
                        const initialPaymentDate = item.paymentDate || item.paidDate || item.mrDate || item.poDate || new Date().toISOString().split('T')[0];
                        item.paymentHistory.push({
                            date: initialPaymentDate,
                            amount: oldPaidAmount,
                            timestamp: new Date(initialPaymentDate).toISOString()
                        });
                    }

                    const today = new Date();
                    item.paymentHistory.push({
                        date: today.toISOString().split('T')[0],
                        amount: paymentDelta,
                        timestamp: today.toISOString()
                    });
                } else if (item.paymentHistory.length === 0 && newPaidAmount > 0) {
                    const today = new Date();
                    item.paymentHistory.push({
                        date: today.toISOString().split('T')[0],
                        amount: newPaidAmount,
                        timestamp: today.toISOString()
                    });
                }
                
                const newStatus = item.status;
                console.log('📝 Item updated:', { oldStatus, newStatus, _sourcePOId: item._sourcePOId });
                
                // Update project in Firebase
                await updateProjectRecord(projectId, project);
                
                // If status changed, also update the source PO's status in Material Processing
                if (item._sourcePOId && oldStatus !== newStatus) {
                    try {
                        console.log('🔄 Status changed - Syncing to PO:', { poId: item._sourcePOId, oldStatus, newStatus });
                        
                        const poRef = doc(db, 'purchaseOrders', item._sourcePOId);
                        await updateDoc(poRef, { status: newStatus });
                        console.log('✅ PO status updated in Firebase:', { poId: item._sourcePOId, newStatus });
                        
                        showNotification('✅ Status synced to Material Processing', 'success');
                        
                        // Wait for Firebase to sync, then refresh the Material Processing PO list
                        setTimeout(async () => {
                            if (typeof window.loadPurchaseOrders === 'function') {
                                try {
                                    console.log('🔄 Refreshing Material Processing PO list...');
                                    await window.loadPurchaseOrders();
                                    console.log('✅ Material Processing PO list refreshed');
                                } catch (refreshErr) {
                                    console.warn('⚠️ Could not refresh PO list:', refreshErr);
                                }
                            }
                        }, 1000);
                    } catch (poErr) {
                        console.error('❌ Error syncing status to PO:', poErr);
                        showNotification('❌ Error syncing status: ' + poErr.message, 'error');
                    }
                } else if (!item._sourcePOId) {
                    console.warn('⚠️ Item has no _sourcePOId - cannot sync status');
                }
                
                // Refresh table
                populateProjectDetailsTable(projectId);
                
                // Check if received qty was updated - if so, auto-create delivery receipt
                // NOTE: quantityDifference was already calculated before item was updated
                // PREVENT DUPLICATES: Only create if we haven't already created a DR for this received qty
                const lastDeliveryReceiptQty = item.lastDeliveryReceiptCreatedQty || 0;
                const shouldCreateDelivery = quantityDifference > 0 && newReceivedQty > lastDeliveryReceiptQty;
                
                if (shouldCreateDelivery) {
                    console.log('📦 Received qty updated - auto-creating delivery receipt:', {
                        material: item.material,
                        oldReceivedQty: oldReceivedQty,
                        newReceivedQty: newReceivedQty,
                        quantityToDeliver: quantityDifference,
                        lastDeliveryQty: lastDeliveryReceiptQty,
                        receivedDate: item.receivedDate
                    });
                    
                    // Create delivery receipt directly in Firestore
                    try {
                        const deliveryData = {
                            type: 'Stock In',
                            warehouse: projectId || '',
                            fromWarehouse: '',
                            location: item.location || '',
                            clientPO: item.poNumber || '',
                            controlNo: 'DR-' + Date.now(),
                            items: [{
                                id: Date.now(),
                                materialId: item.materialId || '',
                                itemCode: item.itemCode || '',
                                materialName: item.material || '',
                                specification: item.specification || '-',
                                brand: item.brand || '-',
                                quantity: quantityDifference,
                                unit: item.unit || 'PCS',
                                mrNo: item.mrNo || '',
                                poNo: item.poNumber || '',
                                remarks: 'Received: ' + (item.receivedDate || new Date().toISOString().split('T')[0])
                            }],
                            date: item.receivedDate || new Date().toISOString().split('T')[0],
                            createdAt: new Date().toISOString(),
                            createdBy: (auth.currentUser?.email || 'unknown').toString(),
                            status: 'Received',
                            itemsCount: 1
                        };
                        
                        console.log('📦 Creating delivery receipt:', deliveryData);
                        
                        // Save to Firestore deliveries collection
                        const docRef = await addDoc(collection(db, 'deliveries'), deliveryData);
                        console.log('✅ Delivery receipt created successfully:', docRef.id);
                        
                        // Mark this received qty as having a DR created
                        item.lastDeliveryReceiptCreatedQty = newReceivedQty;
                        item.lastDRCreatedAt = new Date().toISOString();
                        
                        showNotification('✅ Delivery receipt created automatically!', 'success');
                        
                        // If Material Processing tab is already loaded, refresh the deliveries list
                        if (typeof window.loadDeliveries === 'function') {
                            setTimeout(() => {
                                try {
                                    window.loadDeliveries();
                                    console.log('🔄 Refreshed delivery receipts in Material Processing tab');
                                } catch (refreshErr) {
                                    console.warn('⚠️ Could not refresh deliveries:', refreshErr);
                                }
                            }, 500);
                        }
                    } catch (drErr) {
                        console.error('⚠️ Error creating delivery receipt:', drErr.message, drErr);
                        showNotification('⚠️ Item updated but could not create delivery receipt: ' + drErr.message, 'warning');
                    }
                } else {
                    console.log('⏸️ No delivery receipt created', { 
                        quantityDifference, 
                        lastDeliveryReceiptQty,
                        newReceivedQty
                    });
                }
                
                // Close modal
                modal.remove();
                
                showNotification('Item updated successfully', 'success');
            } catch (e) {
                console.error('Error saving item:', e);
                showNotification('Error saving changes: ' + e.message, 'error');
            }
        };
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'flex:1;padding:12px;background:#666;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
        cancelBtn.onclick = () => modal.remove();
        
        buttonGroup.appendChild(saveBtn);
        buttonGroup.appendChild(cancelBtn);
        content.appendChild(buttonGroup);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    } catch (e) {
        console.error('Error editing project item:', e);
        showNotification('Could not open edit dialog', 'error');
    }
}

// Remove an item from a project's items array and update the record
async function removeProjectItem(projectId, itemIndex) {
    try {
        // Store pending values for confirmation
        window.pendingRemoveItemProjectId = projectId;
        window.pendingRemoveItemIndex = itemIndex;

        // Get item name for the message
        const projects = await getProjects();
        const pIndex = projects.findIndex(p => p.id === projectId);
        if (pIndex === -1) {
            showNotification('Project not found', 'error');
            return;
        }

        const project = projects[pIndex];
        if (!Array.isArray(project.items) || itemIndex < 0 || itemIndex >= project.items.length) {
            showNotification('Item not found', 'error');
            return;
        }

        const itemName = project.items[itemIndex].itemNumber || project.items[itemIndex].material || 'this item';
        
        // Show confirmation modal with custom message
        const confirmationMessage = `Remove "${itemName}" from this project? It will remain available in the main project management area.`;
        document.getElementById('confirmationMessage').textContent = confirmationMessage;
        document.getElementById('deleteConfirmationModal').style.display = 'flex';

        // Set up button handlers for removal
        const yesBtn = document.querySelector('.btn-yes');
        const noBtn = document.querySelector('.btn-no');

        // Remove old event listeners and add new ones
        const newYesBtn = yesBtn.cloneNode(true);
        const newNoBtn = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        noBtn.parentNode.replaceChild(newNoBtn, noBtn);

        newYesBtn.onclick = function() {
            confirmRemoveProjectItem();
        };
        newNoBtn.onclick = function() {
            cancelRemoveProjectItem();
        };
    } catch (e) {
        console.error('Error preparing to remove project item', e);
        showNotification('Could not prepare removal', 'error');
    }
}

// Confirm removal of project item
async function confirmRemoveProjectItem() {
    const projectId = window.pendingRemoveItemProjectId;
    const itemIndex = window.pendingRemoveItemIndex;

    if (!projectId || itemIndex === undefined) {
        document.getElementById('deleteConfirmationModal').style.display = 'none';
        return;
    }

    try {
        const projects = await getProjects();
        const pIndex = projects.findIndex(p => p.id === projectId);
        if (pIndex === -1) {
            showNotification('Project not found', 'error');
            document.getElementById('deleteConfirmationModal').style.display = 'none';
            return;
        }

        const project = projects[pIndex];
        if (!Array.isArray(project.items) || itemIndex < 0 || itemIndex >= project.items.length) {
            showNotification('Item not found', 'error');
            document.getElementById('deleteConfirmationModal').style.display = 'none';
            return;
        }

        project.items.splice(itemIndex, 1);
        await updateProjectRecord(projectId, project);
        showNotification('Item removed from project', 'success');

        // Hide modal and refresh view
        document.getElementById('deleteConfirmationModal').style.display = 'none';
        if (typeof viewProjectDetails === 'function') viewProjectDetails(projectId);
    } catch (e) {
        console.error('Error removing project item', e);
        showNotification('Could not remove item', 'error');
    } finally {
        window.pendingRemoveItemProjectId = null;
        window.pendingRemoveItemIndex = undefined;
    }
}

// Cancel removal of project item
function cancelRemoveProjectItem() {
    window.pendingRemoveItemProjectId = null;
    window.pendingRemoveItemIndex = undefined;
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}



// ============================================================
// INITIALIZATION & AUTHENTICATION
// ============================================================

// Check authentication on page load
window.addEventListener('DOMContentLoaded', function() {
    try {
        onAuthStateChanged(auth, (user) => {
            try {
                if (!user) {
                    window.location.href = "index.html";
                } else {
                    const session = getUserSession();
                    console.log("✅ User authenticated:", session);

                    // START PRE-LOADING DATA IN BACKGROUND IMMEDIATELY
                    console.log('🚀 Starting background data pre-load...');
                    try {
                        preLoadAllData();
                    } catch (e) {
                        console.warn('⚠️ Error during data preload:', e);
                    }

                    // Always show Dashboard page on module load - this redirects to purchasing dashboard
                    console.log('📍 Redirecting to Purchasing Dashboard with user session:', session);
                    showDashboardPage();
                    
                    // Also load the dashboard data to ensure charts and stats are populated
                    try {
                        updateTopSuppliersChart();
                    } catch (e) {
                        console.warn('⚠️ Error updating suppliers chart:', e);
                    }
                }
            } catch (e) {
                console.error('❌ Auth state change error:', e);
            }
        });
    } catch (e) {
        console.error('❌ DOMContentLoaded error:', e);
    }
});

// Global logout handler
window.handleLogout = async function() {
    try {
        await clearUserSession();
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        window.location.href = "index.html";
    }
};

// Expose Firestore functions globally so they can be called from HTML
window.addTrackingRecord = addTrackingRecord;
window.getTrackingRecords = getTrackingRecords;
window.updateTrackingRecord = updateTrackingRecord;
window.deleteTrackingRecord = deleteTrackingRecord;
window.addProduct = addProduct;
window.getProducts = getProducts;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.getPriceList = getPriceList;
window.updatePriceListItem = updatePriceListItem;
window.addProjectRecord = addProjectRecord;
window.getProjects = getProjects;
window.updateProjectRecord = updateProjectRecord;
window.deleteProjectRecord = deleteProjectRecord;

// Bind payment modal functions to window for onclick handlers
window.openPaymentDetailsModal = openPaymentDetailsModal;
window.closePaymentDetailsModal = closePaymentDetailsModal;
window.togglePaymentHistoryList = togglePaymentHistoryList;
window.populatePaymentHistory = populatePaymentHistory;
window.addPaymentRecord = addPaymentRecord;
window.refreshPaymentDetailsDisplay = refreshPaymentDetailsDisplay;
window.updateProjectItems = updateProjectItems;
window.showNotification = showNotification;

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================

function showNotification(message, type = 'success', duration = 4000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#0a9b03' : type === 'error' ? '#d32f2f' : '#ff9800';
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    
    notification.style.cssText = `
        background: ${bgColor};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
        display: flex;
        align-items: center;
        gap: 12px;
        pointer-events: auto;
        max-width: 400px;
    `;
    
    notification.innerHTML = `
        <span style="font-size: 18px; font-weight: bold;">${icon}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    
    // Add animation
    const style = document.createElement('style');
    if (!document.getElementById('notificationStyles')) {
        style.id = 'notificationStyles';
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Auto remove after duration
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

// Ensure the project-linked area points to PO Storage on initial load
// REMOVED: This was clearing the table we hardcoded into the HTML

// ============================================================
// PAYMENT DETAILS MODAL FUNCTIONS
// ============================================================

function openPaymentDetailsModal(itemIndex) {
    console.log('🔔 openPaymentDetailsModal called with itemIndex:', itemIndex);
    
    // Get the pagination state
    const state = projectDetailsTablePaginationState;
    console.log('📊 Current pagination state - Total items:', state.allItems ? state.allItems.length : 0, ', Current page:', state.currentPage);
    
    // Validation
    if (!state || !state.allItems) {
        console.error('❌ No pagination state or items array found');
        showNotification('Error: Unable to load item data', 'error');
        return;
    }
    
    if (itemIndex < 0 || itemIndex >= state.allItems.length) {
        console.error('❌ Invalid item index:', itemIndex, 'Total items:', state.allItems.length);
        showNotification('Error: Item not found', 'error');
        return;
    }

    const item = state.allItems[itemIndex];
    console.log('✅ Item data retrieved:', item);
    console.log('🔍 Item payment history:', item.paymentHistory ? JSON.stringify(item.paymentHistory, null, 2) : 'NOT FOUND');

    // Handle multiple property name formats (normalize data)
    const itemNumber = item.itemNumber || item.itemCode || item.itemId || '-';
    const poNumber = item.poNumber || item.poNo || '-';
    const vendor = item.vendor || item.itemVendor || item.bestSupplier || item.supplier || '-';
    const mrNumber = item.mrNumber || item.mrNo || item.materialRequestNumber || '-';
    const material = item.material || item.materialDescription || item.description || '-';
    const quantity = parseFloat(item.quantity || 0);
    const totalAmount = parseFloat(item.totalAmount || item.cost || item.price || (quantity * parseFloat(item.unitPrice || 0)) || 0);
    const paidAmount = parseFloat(item.paidAmount || 0);
    const remainingPayable = totalAmount - paidAmount;

    console.log('💰 Payment calculations:', {
        itemNumber,
        poNumber,
        vendor,
        mrNumber,
        material,
        quantity,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        remainingPayable: remainingPayable.toFixed(2)
    });

    // Populate item information
    const itemEl = document.getElementById('paymentDetailItem');
    const poEl = document.getElementById('paymentDetailPONumber');
    const vendorEl = document.getElementById('paymentDetailVendor');
    if (itemEl) itemEl.textContent = itemNumber;
    if (poEl) poEl.textContent = poNumber;
    if (vendorEl) vendorEl.textContent = vendor;

    // Populate payment summary with accurate totals
    const totalEl = document.getElementById('paymentDetailTotalAmount');
    const paidEl = document.getElementById('paymentDetailTotalPaidAmount');
    const remainingEl = document.getElementById('paymentDetailRemainingPayable');

    if (totalEl) totalEl.textContent = '₱' + totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (paidEl) paidEl.textContent = '₱' + paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Set color for remaining payable based on value
    if (remainingEl) {
        const remainingColor = remainingPayable > 0 ? '#ff6b6b' : '#0a9b03';
        remainingEl.textContent = '₱' + remainingPayable.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        remainingEl.style.color = remainingColor;
    }

    // Store current context for payment operations
    currentPaymentDetailsContext = {
        itemIndex: itemIndex,
        itemNumber: itemNumber,
        poNumber: poNumber,
        item: item,
        state: state
    };

    // Populate payment history
    populatePaymentHistory(item);

    // Show modal - ensure element exists and is visible
    const modal = document.getElementById('paymentDetailsModal');
    console.log('🎯 Modal element found:', !!modal);
    
    if (modal) {
        // Force visibility
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.display = 'flex';
        modal.style.pointerEvents = 'auto';
        
        console.log('✅ Modal opened successfully - visibility: visible, opacity: 1');
        
        // Small delay to ensure rendering
        setTimeout(() => {
            showNotification('Payment details loaded', 'success');
        }, 100);
    } else {
        console.error('❌ Modal element paymentDetailsModal not found in DOM');
        showNotification('Error: Payment details modal not found', 'error');
    }
}

function closePaymentDetailsModal() {
    const modal = document.getElementById('paymentDetailsModal');
    console.log('🔔 Closing Payment Details Modal');
    
    if (modal) {
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
        console.log('✅ Modal closed - visibility: hidden, opacity: 0');
    } else {
        console.error('❌ Modal element not found');
    }
}

function populatePaymentHistory(item) {
    const tableBody = document.getElementById('paymentHistoryTableBody');
    if (!tableBody) return;

    const paidAmount = parseFloat(item.paidAmount || 0);
    
    console.log('🔍 populatePaymentHistory - Item data:', {
        paidAmount,
        paymentHistory: item.paymentHistory ? item.paymentHistory.length + ' records' : 'NONE - undefined or null',
        paymentHistoryArray: item.paymentHistory ? JSON.stringify(item.paymentHistory, null, 2) : 'N/A',
        paymentDate: item.paymentDate,
        paidDate: item.paidDate,
        mrDate: item.mrDate,
        poDate: item.poDate
    });
    
    // Clear existing rows
    tableBody.innerHTML = '';

    if (item.paymentHistory && Array.isArray(item.paymentHistory) && item.paymentHistory.length > 0) {
        console.log('✅ Found', item.paymentHistory.length, 'payment records');
        // Display payment history records
        item.paymentHistory.forEach((record, idx) => {
            console.log(`  Record ${idx + 1}:`, record);
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid rgba(29, 209, 161, 0.1)';
            
            const date = new Date(record.date || record.timestamp);
            const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            
            row.innerHTML = `
                <td style="padding: 12px 16px; color: #e0e0e0; font-size: 13px;">${formattedDate}</td>
                <td style="padding: 12px 16px; text-align: right; color: #1dd1a1; font-weight: 600; font-size: 13px;">₱${parseFloat(record.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            `;
            tableBody.appendChild(row);
        });
    } else if (paidAmount > 0) {
        // Try multiple date fields as fallback for existing paid amount
        let paymentDate = item.paymentDate || item.paidDate || item.mrDate || item.poDate || '-';
        
        // Format date if it's not '-'
        if (paymentDate && paymentDate !== '-') {
            try {
                const dateObj = new Date(paymentDate);
                if (!isNaN(dateObj.getTime())) {
                    paymentDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                }
            } catch(e) {
                console.log('Date parsing error:', e);
            }
        }
        
        // Create payment history row showing existing paid amount
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(29, 209, 161, 0.1)';
        row.innerHTML = `
            <td style="padding: 12px 16px; color: #e0e0e0; font-size: 13px;">${paymentDate}</td>
            <td style="padding: 12px 16px; text-align: right; color: #1dd1a1; font-weight: 600; font-size: 13px;">₱${paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
        `;
        tableBody.appendChild(row);
    } else {
        // No payment yet
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="2" style="padding: 16px; text-align: center; color: #a0a0a0; font-size: 13px;">No payments recorded yet</td>
        `;
        tableBody.appendChild(row);
    }
}

function togglePaymentHistoryList() {
    const tableContainer = document.getElementById('paymentHistoryTableContainer');
    const hideBtn = document.getElementById('hidePaymentHistoryBtn');
    
    if (tableContainer.style.display === 'none') {
        tableContainer.style.display = '';
        hideBtn.textContent = 'Hide Lists';
    } else {
        tableContainer.style.display = 'none';
        hideBtn.textContent = 'Show Lists';
    }
}

// Store current payment details context
let currentPaymentDetailsContext = null;

// Add Payment Record Function
async function addPaymentRecord() {
    const paidAmountInput = document.getElementById('updatePaidAmountInput');
    const paidAmount = parseFloat(paidAmountInput.value.trim() || 0);
    
    if (paidAmount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    try {
        // Use stored context from the modal for faster lookup
        if (!currentPaymentDetailsContext) {
            showNotification('Error: Item context not found', 'error');
            return;
        }

        const { itemIndex, item, state } = currentPaymentDetailsContext;
        
        // Initialize payment history if it doesn't exist
        if (!item.paymentHistory) {
            item.paymentHistory = [];
        }
        
        // Add new payment record
        const today = new Date();
        const paymentRecord = {
            date: today.toISOString().split('T')[0],
            amount: paidAmount,
            timestamp: today.toISOString()
        };
        
        item.paymentHistory.push(paymentRecord);
        
        // Update total paid amount
        const totalPaid = item.paymentHistory.reduce((sum, record) => sum + parseFloat(record.amount || 0), 0);
        item.paidAmount = totalPaid;
        
        // Calculate remaining payable - use totalAmount if stored, else calculate
        const totalAmount = parseFloat(item.totalAmount || item.cost || (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)) || 0);
        item.remainingPayable = totalAmount - totalPaid;
        
        // Update the item in place in allItems
        state.allItems[itemIndex] = item;
        
        console.log('✅ Payment record added:', {
            itemIndex,
            amount: paidAmount,
            newTotal: totalPaid,
            remainingPayable: item.remainingPayable
        });
        
        // Refresh the payment details modal display
        refreshPaymentDetailsDisplay(item);
        
        // Clear input
        paidAmountInput.value = '';
        
        showNotification('Payment record added successfully', 'success');
        
    } catch (error) {
        console.error('Error adding payment record:', error);
        showNotification('Error adding payment record: ' + error.message, 'error');
    }
}

// Refresh Payment Details Display
function refreshPaymentDetailsDisplay(item) {
    // Update totals - use totalAmount if stored, else calculate
    const totalAmount = parseFloat(item.totalAmount || item.cost || (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)) || 0);
    const paidAmount = parseFloat(item.paidAmount || 0);
    const remainingPayable = totalAmount - paidAmount;
    
    const totalEl = document.getElementById('paymentDetailTotalAmount');
    const paidEl = document.getElementById('paymentDetailTotalPaidAmount');
    const remainingEl = document.getElementById('paymentDetailRemainingPayable');
    
    if (totalEl) totalEl.textContent = '₱' + totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (paidEl) paidEl.textContent = '₱' + paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    if (remainingEl) {
        remainingEl.textContent = '₱' + remainingPayable.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        remainingEl.style.color = remainingPayable > 0 ? '#ff6b6b' : '#1dd1a1';
    }
    
    // Refresh payment history table
    const tableBody = document.getElementById('paymentHistoryTableBody');
    if (tableBody && item.paymentHistory && item.paymentHistory.length > 0) {
        tableBody.innerHTML = '';
        item.paymentHistory.forEach(record => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid rgba(29, 209, 161, 0.1)';
            
            const date = new Date(record.date);
            const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            
            row.innerHTML = `
                <td style="padding: 12px 16px; color: #e0e0e0; font-size: 13px;">${formattedDate}</td>
                <td style="padding: 12px 16px; text-align: right; color: #1dd1a1; font-weight: 600; font-size: 13px;">₱${parseFloat(record.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            `;
            tableBody.appendChild(row);
        });
    }
}

// Update Project Items in Firebase
async function updateProjectItems(projectId, items) {
    try {
        const db = firebase.firestore();
        const projectRef = db.collection('projects').doc(projectId);
        
        await projectRef.update({
            items: items,
            lastUpdated: new Date().toISOString()
        });
        
        console.log('✅ Project items updated in Firebase');
    } catch (error) {
        console.error('Error updating project items:', error);
        throw error;
    }
}

// ============================================================
// SIDEBAR & NAVIGATION FUNCTIONS
// ============================================================

// Sidebar Toggle Function
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    const dashboard = document.querySelector('.dashboard');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.classList.toggle('active');
    if (dashboard) dashboard.classList.toggle('sidebar-open');
}

// Close Sidebar Function
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    const dashboard = document.querySelector('.dashboard');
    
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    if (hamburger) hamburger.classList.remove('active');
    if (dashboard) dashboard.classList.remove('sidebar-open');
}

// Tab Switching Function
function switchTab(index) {
    const links = document.querySelectorAll('.menu-link');
    links.forEach(link => link.classList.remove('active'));
    links[index].classList.add('active');
}

// Submenu Toggle Function
function toggleSubmenu(button) {
    const menuItem = button.parentElement;
    const submenu = menuItem.querySelector('.submenu');

    menuItem.classList.toggle('active');
    if (submenu.style.maxHeight) {
        submenu.style.maxHeight = null;
    } else {
        submenu.style.maxHeight = submenu.scrollHeight + 'px';
    }
}

// ============================================================
// PAGE DISPLAY FUNCTIONS
// ============================================================

// Show Dashboard Page
function showDashboardPage() {
    // Hide all page sections
    document.getElementById('dashboardPage').style.display = 'block';
    document.getElementById('purchaseTrackingPage').style.display = 'none';
    const settingsPage = document.getElementById('settingsPage');
    if (settingsPage) {
        settingsPage.style.display = 'none';
    }
    
    // Hide project-details-page and projects-page
    const projectDetailsPage = document.getElementById('project-details-page');
    if (projectDetailsPage) {
        projectDetailsPage.style.display = 'none';
    }
    
    const projectsPage = document.getElementById('projects-page');
    if (projectsPage) {
        projectsPage.style.display = 'none';
    }
    
    // Hide monitoring pages
    const mrToPOPage = document.getElementById('mrToPOPage');
    if (mrToPOPage) {
        mrToPOPage.style.display = 'none';
    }
    const poToDRPage = document.getElementById('poToDRPage');
    if (poToDRPage) {
        poToDRPage.style.display = 'none';
    }
    
    // Hide old page-content divs
    const allPages = document.querySelectorAll('.page-content');
    allPages.forEach(page => page.style.display = 'none');
    
    // Save current page to localStorage
    localStorage.setItem('currentPage', 'dashboard');
    console.log('📌 Saved page state: dashboard');  
    
    // Chart should already be initialized from page load
    const cachedChartData = localStorage.getItem('cachedChartData');
    if (cachedChartData && !window.projectsTradeChartInstance) {
        try {
            const chartData = JSON.parse(cachedChartData);
            console.log('⚡ Initializing chart instantly');
            initializeChartFromCache(chartData);
        } catch (error) {
            console.warn('⚠️ Chart initialization error:', error);
        }
    }

    // Refresh top suppliers chart when viewing dashboard
    updateTopSuppliersChart();
    
    // Load projects data to refresh and update the total count
    // REMOVED: loadProjects() - This was causing continuous auto-refresh
    // Use preLoadAllData() on initial page load instead
    
    // Close sidebar on mobile
    closeSidebar();
}

// Show Purchase Tracking Page
function showPurchaseTrackingPage(filterStatus = 'all') {
    // Hide all page sections
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('purchaseTrackingPage').style.display = 'block';
    const settingsPage = document.getElementById('settingsPage');
    if (settingsPage) {
        settingsPage.style.display = 'none';
    }
    
    // Hide projects page
    const projectsPage = document.getElementById('projectsPage');
    if (projectsPage) {
        projectsPage.style.display = 'none';
    }
    
    // Hide monitoring pages
    const mrToPOPage = document.getElementById('mrToPOPage');
    if (mrToPOPage) {
        mrToPOPage.style.display = 'none';
    }
    const poToDRPage = document.getElementById('poToDRPage');
    if (poToDRPage) {
        poToDRPage.style.display = 'none';
    }
    
    // Hide old page-content divs
    const allPages = document.querySelectorAll('.page-content');
    allPages.forEach(page => page.style.display = 'none');

    // Set status filter dropdown to the specified filter
    const statusDropdown = document.getElementById('statusFilterDropdown');
    if (statusDropdown) {
        statusDropdown.value = filterStatus;
    }

    // Project Data columns feature removed

    // Load tracking records from database
    loadTrackingRecords();
    
    // Column visibility loading removed
    
    // Re-initialization of Project Data columns removed
    
    // Apply the specified filter
    filterTrackingByStatus(filterStatus);
    
    // Save current page to localStorage
    localStorage.setItem('currentPage', 'tracking');
    console.log('📌 Saved page state: tracking');
        
    // Close sidebar on mobile
    closeSidebar();
}

// Show On-going Orders Page (with auto-filter)
function showOngoingOrdersPage() {
    // Show purchase tracking page with on-going filter
    showPurchaseTrackingPage('on-going');
}

// Show Settings Page
function showSettingsPage() {
    // Hide all page sections
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('purchaseTrackingPage').style.display = 'none';
    
    // Hide project-related pages
    const projectDetailsPage = document.getElementById('project-details-page');
    if (projectDetailsPage) {
        projectDetailsPage.style.display = 'none';
    }
    
    const projectsPage = document.getElementById('projects-page');
    if (projectsPage) {
        projectsPage.style.display = 'none';
    }
    
    // Hide monitoring pages
    const mrToPOPage = document.getElementById('mrToPOPage');
    if (mrToPOPage) {
        mrToPOPage.style.display = 'none';
    }
    const poToDRPage = document.getElementById('poToDRPage');
    if (poToDRPage) {
        poToDRPage.style.display = 'none';
    }
    
    // Hide all .page-content divs
    const allPages = document.querySelectorAll('.page-content');
    allPages.forEach(page => {
        if (page) page.style.display = 'none';
    });
    
    const settingsPage = document.getElementById('settingsPage');
    if (settingsPage) {
        settingsPage.style.display = 'block';
        settingsPage.style.visibility = 'visible';
    }
    
    // Save current page to localStorage
    localStorage.setItem('currentPage', 'settings');
    console.log('📌 Saved page state: settings');
    
    // Close sidebar on mobile
    closeSidebar();
    
    // Initialize default tab (Account Management)
    switchSettingsTab('account');
}

// Switch between settings tabs
function switchSettingsTab(tab) {
    const accountContent = document.getElementById('accountManagementTabContent');
    const activityContent = document.getElementById('activityLogTabContent');
    const accountTab = document.getElementById('accountManagementTab');
    const activityTab = document.getElementById('activityLogTab');
    
    if (accountContent && activityContent && accountTab && activityTab) {
        if (tab === 'account') {
            accountContent.style.display = 'block';
            activityContent.style.display = 'none';
            accountTab.style.color = '#0a9b03';
            accountTab.style.borderBottomColor = '#0a9b03';
            activityTab.style.color = '#a0a0a0';
            activityTab.style.borderBottomColor = 'transparent';
        } else if (tab === 'activityLog') {
            accountContent.style.display = 'none';
            activityContent.style.display = 'block';
            accountTab.style.color = '#a0a0a0';
            accountTab.style.borderBottomColor = 'transparent';
            activityTab.style.color = '#0a9b03';
            activityTab.style.borderBottomColor = '#0a9b03';
            // Load activity logs data
            loadActivityLogsPage();
        }
    }
}

// Reset password form
function resetPasswordForm() {
    document.getElementById('changePasswordForm').reset();
    const errorDiv = document.getElementById('passwordError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
    }
}

// Show Projects Page
function showProjectsPage() {
    // Hide all other pages
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('purchaseTrackingPage').style.display = 'none';
    document.getElementById('settingsPage').style.display = 'none';
    
    // Hide project details page if visible
    const projectDetailsPage = document.getElementById('project-details-page');
    if (projectDetailsPage) {
        projectDetailsPage.style.display = 'none';
    }
    
    // Hide monitoring pages
    const mrToPOPage = document.getElementById('mrToPOPage');
    if (mrToPOPage) {
        mrToPOPage.style.display = 'none';
    }
    const poToDRPage = document.getElementById('poToDRPage');
    if (poToDRPage) {
        poToDRPage.style.display = 'none';
    }
    
    // Show projects page
    const projectsPage = document.getElementById('projects-page');
    if (projectsPage) {
        projectsPage.style.display = 'block';
        projectsPage.style.visibility = 'visible';
    }
    
    // Load column settings before rendering
    loadProjectsTableColumnSettings();
    loadProjectsPage();
    closeSidebar();
    localStorage.setItem('currentPage', 'projects');
    console.log('📌 Switched to Projects page');
}

function loadProjectsPage() {
    const tbody = document.getElementById('projectsTableBody');
    if (!tbody) return;
    
    // First, apply column visibility to rebuild the table header
    applyProjectsTableColumnVisibility();
    
    // Get all projects from Firestore using the proper Firebase function
    getProjects().then(projects => {
        // only show records that have been explicitly added in this module
        projects = (projects || []).filter(p => p.purchasingIncluded);
        if (!projects || projects.length === 0) {
            const visibleColumnCount = Object.values(projectsTableColumnSettings).filter(col => col.visible).length + 1;
            tbody.innerHTML = `<tr><td colspan="${visibleColumnCount}" style="padding: 20px; text-align: center; color: #a0a0a0;">No projects found</td></tr>`;
            const pageInfo = document.getElementById('projectsPageInfo');
            if (pageInfo) pageInfo.textContent = 'Page 1 of 1';
            return;
        }

        // Sort projects by Project ID
        projects.sort((a, b) => {
            const idA = (a.projectID || a.projectId || 'Z').toString().toLowerCase();
            const idB = (b.projectID || b.projectId || 'Z').toString().toLowerCase();
            return idA.localeCompare(idB);
        });

        // Update pagination state
        projectsTablePaginationState.allProjects = projects;
        projectsTablePaginationState.totalRows = projects.length;
        projectsTablePaginationState.currentPage = 1;
        
        const totalPages = Math.ceil(projects.length / projectsTablePaginationState.rowsPerPage) || 1;
        const pageInfo = document.getElementById('projectsPageInfo');
        if (pageInfo) {
            pageInfo.textContent = `Page 1 of ${totalPages}`;
        }
        
        renderProjectsTablePage(1);
    }).catch(error => {
        console.error('Error loading projects:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #ff6b6b;">Error loading projects</td></tr>';
    });
}

// Render specific page of projects table
function renderProjectsTablePage(pageNum) {
    const state = projectsTablePaginationState;
    const totalPages = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    
    if (pageNum < 1 || pageNum > totalPages) return;
    
    state.currentPage = pageNum;
    const tbody = document.getElementById('projectsTableBody');
    if (!tbody) return;
    
    const startIdx = (pageNum - 1) * state.rowsPerPage;
    const endIdx = startIdx + state.rowsPerPage;
    const pageProjects = state.allProjects.slice(startIdx, endIdx);
    
    // Clear table
    tbody.innerHTML = '';
    
    if (pageProjects.length === 0) {
        const visibleColumnCount = Object.values(projectsTableColumnSettings).filter(col => col.visible).length + 1; // +1 for Actions
        tbody.innerHTML = `<tr><td colspan="${visibleColumnCount}" style="text-align:center; padding:20px; color:#a0a0a0;">No projects found</td></tr>`;
        return;
    }
    
    // Render page projects
    pageProjects.forEach(project => {
        const projectId = project.projectID || project.projectId || 'N/A';
        const clientName = project.client || project.client_name || 'N/A';
        const projectName = project.name || project.projectName || project.project_name || 'N/A';
        const location = project.location || 'N/A';
        const trade = Array.isArray(project.trades) ? project.trades.join(', ') : (project.trade || 'N/A');
        const budget = project.budget ? '₱' + parseFloat(project.budget).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '₱0.00';
        const status = project.status || 'On-going';
        
        const statusClass = status ? `status-${status.toLowerCase().replace('-', '')}` : 'status-ongoing';
        
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(10,155,3,0.2)';
        
        let rowHTML = '';
        
        // Add visible columns in order (using projectsTableColumnOrder)
        projectsTableColumnOrder.forEach(fieldName => {
            if (fieldName in projectsTableColumnSettings) {
                const column = projectsTableColumnSettings[fieldName];
                if (column.visible) {
                    let cellContent = '';
                    
                    if (fieldName === 'projectID') {
                        cellContent = projectId;
                    } else if (fieldName === 'client') {
                        cellContent = clientName;
                    } else if (fieldName === 'projectName') {
                        // Display the project name from Inventory's Project Management
                        cellContent = projectName;
                    } else if (fieldName === 'location') {
                        cellContent = location;
                    } else if (fieldName === 'trade') {
                        cellContent = trade;
                    } else if (fieldName === 'budget') {
                        cellContent = budget;
                    } else if (fieldName === 'remainingBudget') {
                        // Calculate remaining budget: Project Budget - Sum of all paid amounts
                        const projectBudgetValue = parseFloat(project.budget || 0);
                        let totalPaidAmount = 0;
                        
                        if (project.items && Array.isArray(project.items)) {
                            totalPaidAmount = project.items.reduce((sum, item) => {
                                return sum + parseFloat(item.paidAmount || 0);
                            }, 0);
                        }
                        
                        const remainingBudgetValue = projectBudgetValue - totalPaidAmount;
                        const budgetColor = remainingBudgetValue < 0 ? '#ff1744' : '#0a9b03';  // Red if negative, green if positive
                        cellContent = `<span style="color: ${budgetColor}; font-weight: 600;">₱${remainingBudgetValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>`;
                    } else if (fieldName === 'poLink') {
                        // Generate P.O Link with project data (will be populated asynchronously)
                        cellContent = `<a id="polink-${projectId}" href="#" style="color:#0a9b03;text-decoration:none;font-weight:bold;" onclick="return false;">📄 Loading...</a>`;
                    } else if (fieldName === 'status') {
                        cellContent = `<span class="status-badge ${statusClass}">${status}</span>`;
                    } else {
                        // For custom columns, try to get the data from the project object
                        cellContent = project[fieldName] || '-';
                        
                        // If it looks like a URL, make it clickable
                        if (cellContent && cellContent !== '-' && (cellContent.startsWith('http://') || cellContent.startsWith('https://'))) {
                            cellContent = `<a href="${cellContent}" target="_blank" style="color:#0a9b03;text-decoration:none;">View Link</a>`;
                        }
                    }
                    
                    rowHTML += `<td style="padding: 8px 12px; color: #e0e0e0;">${cellContent}</td>`;
                }
            }
        });
        
        // Add Actions column at the end (always)
        rowHTML += `
            <td style="padding: 8px 12px; white-space: nowrap;">
                <button onclick="viewProjectDetails('${project.id}')" style="padding: 6px 10px; background: linear-gradient(135deg, #0a9b03 0%, #15c524 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">View</button>
                <button onclick="editProject('${project.id}')" style="padding: 6px 10px; background: linear-gradient(135deg, #0a9b03 0%, #15c524 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-right: 4px;">Edit</button>
                <button onclick="deleteProject('${project.id}', '${projectName}')" style="padding: 6px 10px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Delete</button>
            </td>
        `;
        
        row.innerHTML = rowHTML;
        tbody.appendChild(row);
        
        // Generate P.O Link asynchronously for this project
        const poLinkField = projectsTableColumnSettings['poLink'];
        if (poLinkField && poLinkField.visible) {
            generateProjectPOLink(project).then(poLink => {
                const linkElement = document.getElementById(`polink-${project.projectID || project.projectId}`);
                if (linkElement) {
                    const pId = project.projectID || project.projectId;
                    linkElement.href = '#';
                    linkElement.textContent = '📄 View P.O';
                    linkElement.onclick = () => {
                        openProjectPOItemsModal(pId);
                        return false;
                    };
                }
            }).catch(error => {
                console.warn('Error updating P.O Link for project:', error);
            });
        }
    });
    
    // Update page info
    const totalPagesProjects = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    const pageInfo = document.getElementById('projectsPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${pageNum} of ${totalPagesProjects}`;
    }
}

// Pagination navigation for projects table
function nextPageProjectsTable() {
    const state = projectsTablePaginationState;
    const totalPagesProjects = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    if (state.currentPage < totalPagesProjects) {
        renderProjectsTablePage(state.currentPage + 1);
    }
}

function previousPageProjectsTable() {
    const state = projectsTablePaginationState;
    if (state.currentPage > 1) {
        renderProjectsTablePage(state.currentPage - 1);
    }
}

// Render specific page of project details table
function renderProjectDetailsTablePage(pageNum) {
    const state = projectDetailsTablePaginationState;
    const totalPagesDetails = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    
    if (pageNum < 1 || pageNum > totalPagesDetails) return;
    
    state.currentPage = pageNum;
    const tbody = document.getElementById('projectDetailsTableBody');
    if (!tbody) return;
    
    const startIdx = (pageNum - 1) * state.rowsPerPage;
    const endIdx = startIdx + state.rowsPerPage;
    const pageItems = state.allItems.slice(startIdx, endIdx);
    
    // Clear table
    tbody.innerHTML = '';
    
    if (pageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="19" style="text-align:center; padding:20px; color:#a0a0a0;">No items found</td></tr>';
        return;
    }
    
    // Calculate total paid amount from ALL items in the project (not just current page)
    // This ensures accurate remaining budget calculation across all pages
    let totalPaidAmount = 0;
    state.allItems.forEach(item => {
        totalPaidAmount += parseFloat(item.paidAmount || 0);
    });
    
    // Calculate remaining budget: Project Budget - Total Paid Amount
    const projectBudget = state.projectBudget || 0;
    const remainingBudgetValue = projectBudget - totalPaidAmount;
    const remainingBudgetColor = remainingBudgetValue < 0 ? '#ff1744' : '#0a9b03';  // Red if negative, green if positive
    const remainingBudgetStyle = `style="color: ${remainingBudgetColor}; font-weight: 600;"`;
    
    console.log(`💰 Budget Calculation: ₱${projectBudget.toFixed(2)} - ₱${totalPaidAmount.toFixed(2)} = ₱${remainingBudgetValue.toFixed(2)}`);
    
    // Create a function to get cell data by column name
    const getCellData = (item, columnName, index) => {
        const totalAmount = (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)).toFixed(2);
        const statusBadge = item.status ? `<span class="status-badge status-${item.status.toLowerCase()}">${item.status}</span>` : '-';
        const poBalanceQtyValue = parseFloat(item.poBalanceQty || 0);
        const poBalanceQtyColor = poBalanceQtyValue > 0 ? '#ff1744' : '#0a9b03';
        const poBalanceQtyStyle = `style="color: ${poBalanceQtyColor}; font-weight: 600;"`;
        const remainingQtyValue = parseFloat(item.remainingQty || 0);
        const remainingQtyColor = remainingQtyValue > 0 ? '#ff1744' : '#0a9b03';
        const remainingQtyStyle = `style="color: ${remainingQtyColor}; font-weight: 600;"`;
        const remainingPayableValue = parseFloat(item.remainingPayable || 0);
        const remainingPayableColor = remainingPayableValue > 0 ? '#ff1744' : '#0a9b03';
        const remainingPayableStyle = `style="color: ${remainingPayableColor}; font-weight: 600;"`;
        
        // Convert month number to month name
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthDisplay = item.month ? monthNames[parseInt(item.month)] || item.month : (item.itemDescription || '-');
        
        // Return cell data based on column name
        const cellDataMap = {
            'Item Code': `<td>${item.itemNumber || '-'}</td>`,
            'Month': `<td>${monthDisplay}</td>`,
            'MR #': `<td>${item.mrNumber || '-'}</td>`,
            'MR Date': `<td>${item.mrDate || '-'}</td>`,
            'Material': `<td>${item.specification || '-'}</td>`,
            'Best Supplier': `<td>${item.vendor || item.itemVendor || '-'}</td>`,
            'Brand': `<td>${item.brand || '-'}</td>`,
            'Specification': `<td>${item.specDetail || '-'}</td>`,
            'P.O No.': `<td>${item.poNumber || item.unitOfMeasure || '-'}</td>`,
            'Cost': `<td>₱${parseFloat(item.unitPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'P.O. Date': `<td>${formatDateShort(item.poDate) || '-'}</td>`,
            'Delivery Date': `<td>${formatDateShort(item.deliveryDate) || '-'}</td>`,
            'P.O Qty': `<td>${parseFloat(item.quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Received Qty': `<td>${parseFloat(item.receivedQty || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'P.O Balance Qty': `<td ${poBalanceQtyStyle}>${poBalanceQtyValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Remaining Qty': `<td ${remainingQtyStyle}>${remainingQtyValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Total Amount': `<td>₱${totalAmount}</td>`,
            'Paid Amount': `<td style="cursor: pointer; color: white; font-weight: 700; text-decoration: underline;" onclick="event.stopPropagation(); openPaymentDetailsModal(${startIdx + index}); return false;">₱${parseFloat(item.paidAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Remaining Payable': `<td ${remainingPayableStyle}>₱${remainingPayableValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Terms of Payment': (() => {
                if (parseFloat(item.paidAmount || 0) > 0 && item.paymentTerms) {
                    const termsInfo = calculatePaymentTermsCountdown(null, item.paymentTerms, parseFloat(item.paidAmount || 0));
                    return `<td style="color: ${termsInfo.color}; font-weight: 600;">${termsInfo.status}</td>`;
                } else {
                    return `<td style="color: #a0a0a0;">-</td>`;
                }
            })(),
            'Status': `<td>${item.status || '-'}</td>`,
            'Remaining Budget': `<td ${remainingBudgetStyle}>₱${remainingBudgetValue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>`,
            'Status': `<td>${statusBadge}</td>`,
            'Actions': `<td class="actions-cell">
                <button class="btn-actions-edit" onclick="editProjectItem(${startIdx + index})">Edit</button>
                <button class="btn-actions-delete" onclick="deleteProjectItem(${startIdx + index})">Delete</button>
            </td>`
        };
        
        // Return predefined cell data or empty cell for custom columns
        if (cellDataMap[columnName]) {
            return cellDataMap[columnName];
        } else {
            // For custom columns (like 'link'), return an empty cell that can be populated later
            const customValue = item[columnName] || item[columnName.toLowerCase()] || '';
            return `<td>${customValue}</td>`;
        }
    };
    
    // Render page items IN THE CORRECT COLUMN ORDER - INCLUDING HIDDEN COLUMNS
    pageItems.forEach((item, index) => {
        const row = document.createElement('tr');
        
        // Build cells in columnOrder sequence, including ALL columns (visible and hidden)
        // The visibility will be handled by applyColumnVisibility()
        let cellsHTML = '';
        columnOrder.forEach(columnName => {
            // Include ALL columns - visibility is applied separately
            cellsHTML += getCellData(item, columnName, index);
        });
        
        row.innerHTML = cellsHTML;
        tbody.appendChild(row);
    });
    
    // Update page info
    const pageInfo = document.getElementById('projectDetailsPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${pageNum} of ${totalPagesDetails}`;
    }
}

// Pagination navigation for project details table
function nextPageProjectDetailsTable() {
    const state = projectDetailsTablePaginationState;
    const totalPagesDetails = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    if (state.currentPage < totalPagesDetails) {
        renderProjectDetailsTablePage(state.currentPage + 1);
    }
}

function previousPageProjectDetailsTable() {
    const state = projectDetailsTablePaginationState;
    if (state.currentPage > 1) {
        renderProjectDetailsTablePage(state.currentPage - 1);
    }
}

function searchProjectsPage() {
    const searchInput = document.getElementById('projectSearchInputPage');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const tbody = document.getElementById('projectsPageTableBody');
    
    getProjects().then(projects => {
        tbody.innerHTML = '';
        let found = false;
        
        projects.forEach(project => {
            const projectId = project.projectID || project.projectId || '';
            const clientName = project.client || project.client_name || '';
            const projectName = project.name || project.projectName || project.project_name || '';
            const location = project.location || '';
            
            const searchableText = `${projectId} ${clientName} ${projectName} ${location}`.toLowerCase();
            
            if (searchableText.includes(query)) {
                found = true;
                const row = `
                    <tr style="border-bottom: 1px solid rgba(10,155,3,0.2);">
                        <td style="padding: 8px 12px; color: #e0e0e0;">${projectId}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${clientName}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${projectName}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${location}</td>
                        <td style="padding: 8px 12px;">
                            <button onclick="viewProjectDetails('${project.id}')" style="padding: 6px 12px; background: linear-gradient(135deg, #0a9b03 0%, #15c524 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;">View</button>
                            <button onclick="editProject('${project.id}')" style="padding: 6px 12px; background: linear-gradient(135deg, #0a9b03 0%, #15c524 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;">Edit</button>
                            <button onclick="deleteProject('${project.id}', '${projectName}')" style="padding: 6px 12px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            }
        });
        
        if (!found) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #a0a0a0;">No projects match your search</td></tr>';
        }
    }).catch(error => {
        console.error('Error searching projects:', error);
    });
}

function closeProjectsModal() {
    const modal = document.getElementById('projectsModal');
    if (modal) {
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
    }
}

function searchProjectsModal() {
    const searchInput = document.getElementById('projectSearchInputModal');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const tbody = document.getElementById('projectsModalTableBody');
    
    // use our helper which returns all projects then filter by flag
    getProjects().then(all => {
        tbody.innerHTML = '';
        let found = false;
        const projects = (all || []).filter(p => p.purchasingIncluded);
        projects.forEach(project => {
            const searchableText = `${project.projectID || project.projectId || ''} ${project.client || project.client_name || ''} ${project.projectName || project.project_name || ''} ${project.location || ''}`.toLowerCase();
            
            if (searchableText.includes(query)) {
                found = true;
                const row = `
                    <tr style="border-bottom: 1px solid rgba(10,155,3,0.2);" data-id="${project.id}">
                        <td style="padding: 8px 12px; color: #e0e0e0;">${project.projectID || project.projectId || 'N/A'}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${project.client || project.client_name || 'N/A'}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${project.projectName || project.project_name || 'N/A'}</td>
                        <td style="padding: 8px 12px; color: #e0e0e0;">${project.location || 'N/A'}</td>
                        <td style="padding: 8px 12px;">
                            <button onclick="viewProjectDetails('${project.id}')" style="padding: 6px 12px; background: linear-gradient(135deg, #0a9b03 0%, #15c524 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;">View</button>
                            <button onclick="deleteProject('${project.id}')" style="padding: 6px 12px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            }
        });
        
        if (!found) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #a0a0a0;">No projects match your search</td></tr>';
        }
    }).catch(error => {
        console.error('Error searching projects:', error);
    });
}

// View Project Details
function viewProjectDetails(projectId) {
    (async function() {
        try {
            // Get all projects
            const projects = await getProjects();

            // Find the project with matching ID
            const project = projects.find(p => p.id === projectId);

            if (!project) {
                alert('❌ Project not found');
                return;
            }

            // Hide ALL main pages/sections FIRST
            const dashboardPage = document.getElementById('dashboardPage');
            if (dashboardPage) dashboardPage.style.display = 'none';
            
            const purchaseTrackingPage = document.getElementById('purchaseTrackingPage');
            if (purchaseTrackingPage) purchaseTrackingPage.style.display = 'none';
            
            const settingsPage = document.getElementById('settingsPage');
            if (settingsPage) settingsPage.style.display = 'none';
            
            const projectsPage = document.getElementById('projectsPage');
            if (projectsPage) projectsPage.style.display = 'none';

            // Hide all .page-content divs
            const allPages = document.querySelectorAll('.page-content');
            allPages.forEach(page => {
                if (page) page.style.display = 'none';
            });

            // Show ONLY project details page
            const projectDetailsPage = document.getElementById('project-details-page');
            if (projectDetailsPage) {
                projectDetailsPage.style.display = 'block';
                projectDetailsPage.style.visibility = 'visible';
            }
            
            // Store current project ID for item operations
            localStorage.setItem('currentProjectId', projectId);
            // DISABLED: renderProjectDetailColumnsTable causes container to be replaced
            // try { renderProjectDetailColumnsTable(projectId); } catch(e) { console.warn('Could not render project detail columns table', e); }

            // Populate Project Information Container - Safe with null checks
            const detailProjectID = document.getElementById('detailProjectID');
            const detailClient = document.getElementById('detailClient');
            const detailProjectName = document.getElementById('detailProjectProjectName');
            const detailBudget = document.getElementById('detailProjectBudget');
            const detailLocation = document.getElementById('detailLocation');
            const detailTrade = document.getElementById('detailTrade');

            // Get client name from either field (backward compatibility)
            const clientName = project.client_name || project.client || '-';     
            if (detailProjectID) detailProjectID.textContent = project.projectID || '-';
            if (detailClient) detailClient.textContent = clientName;
            if (detailProjectName) detailProjectName.textContent = project.projectName || '-';
            if (detailBudget) detailBudget.textContent = project.budget ? '₱' + parseFloat(project.budget).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-';
            if (detailLocation) detailLocation.textContent = project.location || '-';
            if (detailTrade) detailTrade.textContent = Array.isArray(project.trades) ? project.trades.join(', ') : (project.trade || '-');

            // ⚠️ CRITICAL: Load column settings FIRST before rendering table
            // This ensures data is rendered in the correct column order
            try {
                const session = getUserSession();
                const defaultOrder = getDefaultColumnOrder();
                
                console.log('🔄 Pre-loading column settings before rendering table...');
                console.log('📋 Default column order from HTML:', defaultOrder);
                
                // Column configuration loading removed (feature deleted)
                // Use default columns only
                const columnOrder = defaultOrder;
            } catch (e) {
                console.warn('⚠️ Error loading column settings:', e);
            }

            // Populate Hidden Data Table (15 Columns)
            // Note: Columns excluded - Client, Project ID, Project Name, Location, Trade
            const projectItems = project.items || [];
            console.log('🔍 viewProjectDetails - projectItems loaded:', projectItems);
            console.log('📊 Total items count:', projectItems.length);
            const tableBody = document.getElementById('projectDetailsTableBody');

            if (tableBody) {
                // Initialize pagination state
                projectDetailsTablePaginationState.allItems = projectItems;
                projectDetailsTablePaginationState.totalRows = projectItems.length;
                projectDetailsTablePaginationState.currentPage = 1;
                projectDetailsTablePaginationState.projectBudget = parseFloat(project.budget || 0);
                
                const totalPages = Math.ceil(projectItems.length / projectDetailsTablePaginationState.rowsPerPage) || 1;
                const pageInfo = document.getElementById('projectDetailsPageInfo');
                if (pageInfo) {
                    pageInfo.textContent = `Page 1 of ${totalPages}`;
                }
                
                // Project Data columns feature DISABLED - use hardcoded table instead
                // try {
                //     const defaultColumns = ['Item Code', 'Material', 'Quantity', 'Unit Price', 'Total Cost', 'Supplier', 'Status'];
                //     buildProjectDataTable(defaultColumns);
                // } catch (e) {
                //     console.warn('⚠️ buildProjectDataTable failed:', e);
                // }
                
                if (projectItems.length > 0) {
                    // ALL helper functions disabled - they only cause problems with hardcoded table
                    // Just skip them entirely
                } else {
                    tableBody.innerHTML = '';
                    const emptyRow = document.createElement('tr');
                    emptyRow.innerHTML = '<td colspan="19" style="text-align: center; padding: 20px;">No items added to this project yet</td>';
                    tableBody.appendChild(emptyRow);
                }

                // RENDER VISIBLE TABLE - SIMPLE & DIRECT
                populateProjectDetailsTable(projectId);
            }

            // Close sidebar on mobile - wrapped in try-catch for safety
            try {
                closeSidebar();
            } catch (e) {
                console.warn('⚠️ Sidebar close warning:', e);
            }
            
            // Apply visibility and reorder to ensure correct display
            try {
                applyColumnVisibility();
                console.log('✅ Column settings applied after render');
                
                // SAFETY: Save the current layout to ensure it persists when navigating away and back
                (async function() {
                    try {
                        await autoSaveColumnSettings();
                        console.log('✅ Current layout saved for persistence');
                    } catch (e) {
                        console.warn('⚠️ Could not save layout:', e);
                    }
                })();
            } catch (e) {
                console.warn('⚠️ Error applying column settings:', e);
            }
            // Load and display project details in table
            try {
                populateProjectDetailsTable(projectId);
            } catch (e) {
                console.warn('⚠️ Could not populate project table:', e);
            }
            
            console.log('✅ Project details loaded:', project);
        } catch (error) {
            console.error('❌ Error loading project details:', error);
            alert('❌ Error loading project details: ' + error.message);
        }
    })();
}

// ============================================================
// REDIRECT FROM MATERIAL PROCESSING TO PURCHASING
// ============================================================

/**
 * Called from Material Processing/Inventory module when a PO is created.
 * Redirects to Purchasing module and opens PO Storage for the specific project.
 */
function redirectToPurchasingWithPO(projectId, poData = null) {
    try {
        if (!projectId) {
            console.error('❌ projectId is required for redirect');
            alert('Error: Project ID is missing');
            return;
        }
        
        // Store the project ID and redirect flag in localStorage
        localStorage.setItem('currentProjectId', projectId);
        localStorage.setItem('autoOpenPOStorage', 'true');
        
        // If PO data is provided, cache it
        if (poData) {
            localStorage.setItem('recentPOData', JSON.stringify(poData));
        }
        
        console.log(`✅ Redirecting to Purchasing module for project: ${projectId}`);
        
        // Redirect to purchasing module
        window.location.href = 'purchasing.html';
        
    } catch (error) {
        console.error('❌ Error redirecting to Purchasing:', error);
        alert(`Error: ${error.message}`);
    }
}

// ============================================================
// LOAD AND DISPLAY LINKED PURCHASE ORDERS
// ============================================================
async function loadLinkedPOs(projectId) {
    // COMPLETELY DISABLED - using new openSelectPOModal() instead
    console.log('⚠️ OLD loadLinkedPOs() disabled - use openSelectPOModal() instead');
    return;
}

/**
 * Display PO details in a modal card with item information including cost and item code fetched from materials
 */
async function showPODetailsCard(poId) {
    if (!window.linkedPOsData) return;
    
    const po = window.linkedPOsData.find(p => p.id === poId);
    if (!po) {
        console.error('❌ PO not found:', poId);
        return;
    }
    
    const itemCount = po.items ? po.items.length : 0;
    const poDate = po.createdAt ? new Date(po.createdAt).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '-';
    const totalQty = po.items ? po.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0) : 0;
    
    // Create modal with loading state
    const modal = document.createElement('div');
    modal.id = 'poDetailsModal';
    modal.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);
        display:flex;justify-content:center;align-items:center;z-index:5000;
    `;
    
    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(26,35,50,0.95) 0%,rgba(15,25,40,0.95) 100%);border:1px solid rgba(10,155,3,0.3);border-radius:12px;padding:30px;max-width:900px;color:#e0e0e0;">
            <div style="text-align:center;color:#0a9b03;font-size:16px;padding:40px;">⏳ Fetching material details...</div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Store modal reference for close handlers
    window.currentPOModal = modal;
    
    try {
        // Fetch material details for each item from the materials database
        let enrichedItems = [];
        if (po.items && po.items.length > 0) {
            enrichedItems = await Promise.all(po.items.map(async (item) => {
                try {
                    // Try fetching material by document ID (most reliable). Fall back to query only if needed.
                    try {
                        if (item.materialId) {
                            const matRef = doc(db, 'materials', item.materialId);
                            const matSnap = await getDoc(matRef);
                            if (matSnap && matSnap.exists()) {
                                const materialData = matSnap.data();
                                return {
                                    ...item,
                                    fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                                    fetchedBrand: materialData.brand || item.brand || '-',
                                    fetchedPrice: materialData.cost || materialData.price || item.unitPrice
                                };
                            }
                        }
                    } catch (e) {
                        console.log('⚠️ Could not fetch material by ID for', item.materialId, e);
                    }
                    // As a last resort, try matching by itemCode field in the materials collection
                    try {
                        if (item.itemCode) {
                            const materialQuery = query(collection(db, 'materials'), where('itemCode', '==', item.itemCode));
                            const materialDocs = await getDocs(materialQuery);
                            if (!materialDocs.empty) {
                                const materialData = materialDocs.docs[0].data();
                                return {
                                    ...item,
                                    fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                                    fetchedBrand: materialData.brand || item.brand || '-',
                                    fetchedPrice: materialData.cost || materialData.price || item.unitPrice
                                };
                            }
                        }
                    } catch (e) {
                        console.log('⚠️ Could not query material by itemCode for', item.itemCode, e);
                    }
                } catch (e) {
                    console.log('⚠️ Could not fetch material for', item.materialId);
                }
                return {...item, fetchedItemCode: item.itemCode || item.materialId, fetchedBrand: item.brand || '-', fetchedPrice: item.unitPrice};
            }));
        }
        
        let itemsHtml = '';
        if (enrichedItems && enrichedItems.length > 0) {
            itemsHtml = '<div style="margin-top:15px;"><h4 style="color:#0a9b03;margin:0 0 10px 0;font-size:13px;">Order Items with Material Details:</h4>';
            itemsHtml += '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:rgba(10,155,3,0.2);border-bottom:1px solid rgba(10,155,3,0.3);">';
            itemsHtml += '<th style="padding:8px;text-align:left;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">NO.</th>';
            itemsHtml += '<th style="padding:8px;text-align:left;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">ITEM CODE</th>';
            itemsHtml += '<th style="padding:8px;text-align:left;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">MATERIAL NAME</th>';
            itemsHtml += '<th style="padding:8px;text-align:left;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">BRAND</th>';
            itemsHtml += '<th style="padding:8px;text-align:left;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">SPECIFICATION</th>';
            itemsHtml += '<th style="padding:8px;text-align:center;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">QTY</th>';
            itemsHtml += '<th style="padding:8px;text-align:center;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">UNIT</th>';
            itemsHtml += '<th style="padding:8px;text-align:right;color:#0a9b03;font-size:11px;border-right:1px solid rgba(10,155,3,0.3);">COST</th>';
            itemsHtml += '<th style="padding:8px;text-align:right;color:#0a9b03;font-size:11px;">TOTAL COST</th>';
            itemsHtml += '</tr></thead><tbody>';
            
            enrichedItems.forEach((item, idx) => {
                const itemCode = item.fetchedItemCode || item.itemCode || item.materialId || '-';
                const brand = item.fetchedBrand || item.brand || '-';
                const qty = parseFloat(item.quantity || 0);
                const unitPrice = parseFloat(item.fetchedPrice || item.unitPrice || 0);
                const totalCost = qty * unitPrice;
                
                itemsHtml += `
                    <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
                        <td style="padding:8px;color:#e0e0e0;font-size:12px;border-right:1px solid rgba(10,155,3,0.1);">${idx + 1}</td>
                        <td style="padding:8px;color:#15c524;font-size:12px;font-weight:600;border-right:1px solid rgba(10,155,3,0.1);">${itemCode}</td>
                        <td style="padding:8px;color:#e0e0e0;font-size:12px;border-right:1px solid rgba(10,155,3,0.1);">${item.materialName || item.material || '-'}</td>
                        <td style="padding:8px;color:#ffa500;font-size:12px;font-weight:600;border-right:1px solid rgba(10,155,3,0.1);">${brand}</td>
                        <td style="padding:8px;color:#e0e0e0;font-size:12px;border-right:1px solid rgba(10,155,3,0.1);">${item.specification || '-'}</td>
                        <td style="padding:8px;text-align:center;color:#e0e0e0;font-size:12px;border-right:1px solid rgba(10,155,3,0.1);">${parseFloat(qty).toLocaleString()}</td>
                        <td style="padding:8px;text-align:center;color:#e0e0e0;font-size:12px;border-right:1px solid rgba(10,155,3,0.1);">${item.unit || '-'}</td>
                        <td style="padding:8px;text-align:right;color:#0a9b03;font-size:12px;font-weight:600;border-right:1px solid rgba(10,155,3,0.1);">₱${unitPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding:8px;text-align:right;color:#15c524;font-size:12px;font-weight:600;">₱${totalCost.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    </tr>
                `;
            });
            
            itemsHtml += '</tbody></table></div>';
        }
        
        // Update modal with actual content
        modal.innerHTML = `
            <div style="background:linear-gradient(135deg,rgba(26,35,50,0.95) 0%,rgba(15,25,40,0.95) 100%);border:1px solid rgba(10,155,3,0.3);border-radius:12px;padding:30px;max-width:900px;max-height:85vh;overflow-y:auto;color:#e0e0e0;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                    <h2 style="margin:0;color:#0a9b03;font-size:24px;">Purchase Order Details</h2>
                    <button onclick="window.currentPOModal && window.currentPOModal.remove()" style="background:none;border:none;color:#a0a0a0;font-size:28px;cursor:pointer;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">×</button>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:25px;">
                    <div style="background:rgba(10,155,3,0.1);border:1px solid rgba(10,155,3,0.3);border-radius:8px;padding:15px;">
                        <div style="color:#a0a0a0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">PO Number</div>
                        <div style="color:#15c524;font-weight:600;font-size:18px;">${po.poNo}</div>
                    </div>
                    <div style="background:rgba(10,155,3,0.1);border:1px solid rgba(10,155,3,0.3);border-radius:8px;padding:15px;">
                        <div style="color:#a0a0a0;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Status</div>
                        <div style="color:#${po.status === 'Completed' ? '0a9b03' : po.status === 'Pending' ? 'ffa500' : 'd32f2f'};font-weight:600;font-size:14px;">${po.status || 'Pending'}</div>
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:25px;">
                    <div>
                        <div style="color:#a0a0a0;font-size:11px;font-weight:600;margin-bottom:5px;">Supplier</div>
                        <div style="color:#e0e0e0;font-size:14px;padding:10px;background:rgba(10,155,3,0.1);border-radius:4px;">${po.supplier || '-'}</div>
                    </div>
                    <div>
                        <div style="color:#a0a0a0;font-size:11px;font-weight:600;margin-bottom:5px;">Date</div>
                        <div style="color:#e0e0e0;font-size:14px;padding:10px;background:rgba(10,155,3,0.1);border-radius:4px;">${poDate}</div>
                    </div>
                    <div>
                        <div style="color:#a0a0a0;font-size:11px;font-weight:600;margin-bottom:5px;">Total Items</div>
                        <div style="color:#e0e0e0;font-size:14px;padding:10px;background:rgba(10,155,3,0.1);border-radius:4px;">${itemCount}</div>
                    </div>
                    <div>
                        <div style="color:#a0a0a0;font-size:11px;font-weight:600;margin-bottom:5px;">Total Quantity</div>
                        <div style="color:#e0e0e0;font-size:14px;padding:10px;background:rgba(10,155,3,0.1);border-radius:4px;">${totalQty.toLocaleString()} units</div>
                    </div>
                </div>
                
                ${itemsHtml}
                
                <div style="display:flex;gap:10px;margin-top:25px;justify-content:flex-end;">
                    <button onclick="window.currentPOModal && window.currentPOModal.remove()" style="padding:10px 20px;background:rgba(160,160,160,0.2);color:#a0a0a0;border:1px solid rgba(160,160,160,0.4);border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.2s;">Close</button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('❌ Error loading PO details:', error);
        modal.innerHTML = `
            <div style="background:linear-gradient(135deg,rgba(26,35,50,0.95) 0%,rgba(15,25,40,0.95) 100%);border:1px solid rgba(255,107,107,0.3);border-radius:12px;padding:30px;max-width:400px;text-align:center;">
                <div style="color:#ff6b6b;font-size:18px;margin-bottom:20px;">⚠️ Error Loading Details</div>
                <div style="color:#a0a0a0;margin-bottom:20px;">There was an error fetching the material details.</div>
                <button onclick="window.currentPOModal && window.currentPOModal.remove()" style="padding:10px 20px;background:rgba(160,160,160,0.2);color:#a0a0a0;border:1px solid rgba(160,160,160,0.4);border-radius:6px;cursor:pointer;">Close</button>
            </div>
        `;
    }
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

/**
 * Add PO items to Project Details table and remove from PO Storage
 * Maps PO data to Project Details columns
 */
async function addPOToProjectDetails(poId, projectId) {
    try {
        console.log('🔄 addPOToProjectDetails called:', { poId, projectId });
        
        // Get the PO data from linked POs cache
        if (!window.linkedPOsData) {
            showNotification('PO data not available', 'error');
            return;
        }
        
        const po = window.linkedPOsData.find(p => p.id === poId);
        if (!po) {
            showNotification('Purchase Order not found', 'error');
            return;
        }
        
        if (!po.items || po.items.length === 0) {
            showNotification('No items in this PO', 'error');
            return;
        }
        
        // Show loading state
        showNotification('⏳ Processing PO items...', 'info');
        
        // Get current project data
        const projects = await getProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex === -1) {
            showNotification('Project not found', 'error');
            return;
        }
        
        const project = projects[projectIndex];
        if (!project.items) {
            project.items = [];
        }
        
        // Get today's date for date fields
        const today = new Date();
        const yyyymmdd = today.toISOString().split('T')[0];
        const monthYear = today.toISOString().substr(0, 7);
        
        // Convert and fetch material details for each PO item
        let convertedItems = [];
        
        for (const poItem of po.items) {
            try {
                // Get material details if available
                let enrichedData = {
                    fetchedItemCode: poItem.itemCode || poItem.materialId || '-',
                    fetchedBrand: poItem.brand || '-',
                    fetchedMaterialName: poItem.materialName || poItem.material || '-',
                    fetchedSpec: poItem.specification || ''
                };
                
                // Try to fetch additional material data from database
                try {
                    if (poItem.materialId) {
                        const matRef = doc(db, 'materials', poItem.materialId);
                        const matSnap = await getDoc(matRef);
                        if (matSnap && matSnap.exists()) {
                            const materialData = matSnap.data();
                            enrichedData.fetchedItemCode = materialData.itemCode || poItem.itemCode || poItem.materialId;
                            enrichedData.fetchedBrand = materialData.brand || poItem.brand || '-';
                            enrichedData.fetchedMaterialName = materialData.name || materialData.materialName || poItem.materialName || '-';
                            enrichedData.fetchedSpec = materialData.specifications || materialData.specs || poItem.specification || '';
                        }
                    } else if (poItem.itemCode) {
                        const materialQuery = query(collection(db, 'materials'), where('itemCode', '==', poItem.itemCode));
                        const materialDocs = await getDocs(materialQuery);
                        if (!materialDocs.empty) {
                            const materialData = materialDocs.docs[0].data();
                            enrichedData.fetchedItemCode = materialData.itemCode || poItem.itemCode;
                            enrichedData.fetchedBrand = materialData.brand || poItem.brand || '-';
                            enrichedData.fetchedMaterialName = materialData.name || materialData.materialName || poItem.materialName || '-';
                            enrichedData.fetchedSpec = materialData.specifications || materialData.specs || poItem.specification || '';
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Could not fetch material details for', poItem.itemCode, ':', e);
                }
                
                // Calculate total amount
                const qty = parseFloat(poItem.quantity || 0);
                const unitPrice = parseFloat(poItem.unitPrice || poItem.fetchedPrice || 0);
                const totalAmount = qty * unitPrice;
                
                // Create project item with mapping to Project Details columns
                const projectItem = {
                    itemCode: enrichedData.fetchedItemCode,
                    month: monthYear, // Month column
                    material: enrichedData.fetchedMaterialName,
                    specification: enrichedData.fetchedSpec,
                    brand: enrichedData.fetchedBrand,
                    bestSupplier: po.vendor || po.supplier || poItem.vendor || '-',
                    cost: unitPrice,
                    mrNo: poItem.mrNo || '-',
                    mrDate: poItem.mrDate || '-',
                    poNumber: po.poNo || po.poNumber || po.po || '-',
                    poDate: po.createdAt ? new Date(po.createdAt).toISOString().split('T')[0] : yyyymmdd,
                    quantity: qty,
                    receivedQty: 0, // Empty as per requirement
                    remainingQty: qty, // Initially same as quantity
                    totalAmount: totalAmount,
                    paidAmount: 0, // Empty as per requirement
                    remainingPayable: totalAmount, // Initially total amount
                    termsOfPayment: poItem.termsOfPayment || '-',
                    status: 'Pending',
                    unit: poItem.unit || 'pcs',
                    _sourcePOId: poId // Track which PO this came from (internal use only)
                };
                
                console.log('✅ Created projectItem:', projectItem);
                convertedItems.push(projectItem);
                
            } catch (itemError) {
                console.warn('⚠️ Error processing item:', itemError);
                // Continue with next item even if one fails
            }
        }
        
        if (convertedItems.length === 0) {
            showNotification('No valid items to add', 'error');
            return;
        }
        
        // Add converted items to project
        project.items.push(...convertedItems);
        console.log('✅ After adding to project.items, project.items now:', project.items);
        console.log('✅ First item sample:', project.items[0]);
        
        // Update project in Firebase
        await updateProjectRecord(projectId, project);
        
        console.log('✅ Items added to project:', convertedItems.length);
        
        // Populate the visible table immediately
        await populateProjectDetailsTable(projectId);
        
        // DO NOT DELETE PO from purchaseOrders - it stays in Material Processing records
        // PO Storage will filter it out automatically since it's now in project.items
        console.log('✅ PO items moved to Project Details (PO record kept in Material Processing)');
        
        // Reload PO list to refresh UI - DISABLED (using new modal instead)
        // await loadLinkedPOs(projectId);
        
        // Refresh project details view if open
        try {
            console.log('🔄 Calling viewProjectDetails to refresh view...');
            if (typeof viewProjectDetails === 'function') {
                await viewProjectDetails(projectId);
                console.log('✅ Project details view refreshed');
            }
        } catch (e) {
            console.warn('⚠️ Error refreshing project details view:', e);
        }
        
        showNotification(`✅ ${convertedItems.length} item(s) added to Project Details! PO kept in Material Processing.`, 'success');
        
        
    } catch (error) {
        console.error('❌ Error adding PO to project details:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// ============================================================
// AUTO-POPULATE ITEMS FROM PURCHASE ORDERS
// ============================================================

/**
 * WORKFLOW: PO (Material Processing) → Project (Purchasing)
 * 
 * FLOW:
 * 1. PO is created in Material Processing with: item code, qty, supplier, PO date, cost
 * 2. syncPOToProject() is called with the new PO data
 * 3. autoPopulateProjectItemsFromPO() enriches PO data with materials from inventory database
 * 4. Project items are automatically populated with combined data
 * 5. Items appear in project > Project Details Data table
 * 
 * DATA SOURCES:
 * - PO Data (from Material Processing):
 *   • itemCode, quantity, unitPrice, supplier, poNo, poDate, items[]
 * - Material Data (from products/inventory DB):
 *   • name, specifications, brand, cost (joined by itemCode)
 * - Result (Project Item):
 *   • itemCode, quantity, unitPrice, supplier
 *   • materialName, specs, brand (from inventory)
 *   • All combined into a complete project item
 * 
 * INTEGRATION POINTS:
 * 1. Call window.syncPOToProject(poData) when a PO is created in Material Processing
 * 2. The function automatically fetches material enrichment data
 * 3. Items are added to the project linked to the PO
 * 4. No "Add Item" modal needed - all handled automatically
 */

/**
 * Fetch material data from inventory database for enrichment
 * Looks for: item code, material name, specs, brand, cost
 */
async function fetchMaterialData(itemCode) {
    try {
        // Query products/materials database
        const materialsSnapshot = await getDocs(query(collection(db, "products"), where("itemCode", "==", itemCode)));
        
        if (materialsSnapshot.empty) {
            console.warn(`⚠️ No material data found for item code: ${itemCode}`);
            return null;
        }
        
        const materialData = materialsSnapshot.docs[0].data();
        console.log(`✅ Material data fetched for ${itemCode}:`, materialData);
        
        return {
            itemCode: materialData.itemCode || itemCode,
            materialName: materialData.name || materialData.materialName || '',
            specs: materialData.specifications || materialData.specs || '',
            brand: materialData.brand || '',
            unitCost: parseFloat(materialData.cost || materialData.unitCost || 0)
        };
    } catch (error) {
        console.warn(`⚠️ Error fetching material data for ${itemCode}:`, error);
        return null;
    }
}

/**
 * Auto-populate project items from Purchase Order data
 * Called when a PO is linked to a project or when viewing project details
 */
async function autoPopulateProjectItemsFromPO(projectId, poData) {
    try {
        console.log('📦 Starting auto-population of project items from PO:', { projectId, poNo: poData.poNo });
        
        // Get the project
        const projects = await getProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            console.error(`❌ Project not found: ${projectId}`);
            throw new Error('Project not found');
        }
        
        // Initialize items array if it doesn't exist
        if (!project.items) {
            project.items = [];
        }
        
        // Track new items added
        let itemsAdded = 0;
        
        // Process each item from the PO
        if (poData.items && Array.isArray(poData.items)) {
            for (const poItem of poData.items) {
                try {
                    // Check if item already exists in project
                    const itemExists = project.items.some(item => item.poNumber === poData.poNo && item.itemNumber === poItem.itemCode);
                    
                    if (itemExists) {
                        console.log(`⏭️ Item already exists in project: ${poItem.itemCode}`);
                        continue;
                    }
                    
                    // Fetch enriched material data from inventory database
                    let materialData = {};
                    if (poItem.itemCode) {
                        const fetched = await fetchMaterialData(poItem.itemCode);
                        if (fetched) {
                            materialData = fetched;
                        }
                    }
                    
                    // Combine PO data with material inventory data
                    const projectItem = {
                        itemNumber: poItem.itemCode || poItem.itemNumber || `ITEM-${itemsAdded + 1}`,
                        poNumber: poData.poNo || '',
                        poDate: poData.poDate || poData.createdAt || '',
                        mrNumber: poItem.mrNumber || '',
                        mrDate: poItem.mrDate || '',
                        specification: materialData.materialName || poItem.description || poItem.specification || '',
                        itemCode: poItem.itemCode || '',
                        material: materialData.materialName || '',
                        brand: materialData.brand || poItem.brand || '',
                        specs: materialData.specs || poItem.specs || '',
                        quantity: parseFloat(poItem.quantity || 0),
                        unitPrice: parseFloat(materialData.unitCost || poItem.unitPrice || 0),
                        vendor: poData.supplier || poItem.vendor || '',
                        itemVendor: poData.supplier || poItem.vendor || '',
                        receivedQty: 0,
                        paidAmount: 0,
                        paymentTerms: poData.paymentTerms || 'COD',
                        status: 'On-going',
                        month: new Date().getMonth().toString().padStart(2, '0'),
                        // Calculate totals
                        totalAmount: parseFloat(poItem.quantity || 0) * parseFloat(materialData.unitCost || poItem.unitPrice || 0),
                        poBalanceQty: parseFloat(poItem.quantity || 0),
                        remainingPayable: (parseFloat(poItem.quantity || 0) * parseFloat(materialData.unitCost || poItem.unitPrice || 0))
                    };
                    
                    // Add to project items
                    project.items.push(projectItem);
                    itemsAdded++;
                    
                    console.log(`✅ Item added to project: ${projectItem.itemNumber}`, projectItem);
                    
                } catch (itemError) {
                    console.warn(`⚠️ Error processing PO item ${poItem.itemCode}:`, itemError);
                    // Continue with next item even if one fails
                }
            }
        }
        
        // Save updated project to database
        if (itemsAdded > 0) {
            await updateProjectRecord(projectId, project);
            console.log(`✅ Project updated with ${itemsAdded} new items from PO: ${poData.poNo}`);
            
            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'MATERIAL',
                    action: 'CREATE',
                    details: `Auto-populated ${itemsAdded} item(s) from PO: ${poData.poNo}`,
                    moduleName: 'PURCHASING',
                    recordId: projectId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }
            
            return {
                success: true,
                itemsAdded: itemsAdded,
                message: `Successfully added ${itemsAdded} item(s) from PO to project`
            };
        } else {
            console.log('ℹ️ No new items to add - all items already exist in project');
            return {
                success: true,
                itemsAdded: 0,
                message: 'All items from this PO already exist in the project'
            };
        }
        
    } catch (error) {
        console.error('❌ Error auto-populating project items from PO:', error);
        throw error;
    }
}

/**
 * Sync POs to Projects - Call this when a new PO is created in Material Processing
 * This function should be called from the PO creation endpoint
 */
window.syncPOToProject = async function(poData) {
    try {
        if (!poData || !poData.poNo) {
            throw new Error('Invalid PO data: poNo is required');
        }
        
        // Determine the project ID from the PO data
        // The PO should have a projectId field when created from a project
        const projectId = poData.projectId;
        
        if (!projectId) {
            console.warn('⚠️ PO does not have a projectId - manual linking may be required');
            return {
                success: false,
                message: 'PO is not linked to a project. Please link it manually.'
            };
        }
        
        // Auto-populate the project with items from this PO
        const result = await autoPopulateProjectItemsFromPO(projectId, poData);
        
        showNotification(result.message, result.success ? 'success' : 'info');
        
        // Refresh the project details view if it's currently open
        const currentProjectId = localStorage.getItem('currentProjectId');
        if (currentProjectId === projectId) {
            // Give a moment for the database to update
            setTimeout(() => {
                viewProjectDetails(projectId);
            }, 500);
        }
        // Also refresh linked POs listing (if PO Storage is open)
        try {
            if (typeof window.loadLinkedPOs === 'function') {
                setTimeout(() => {
                    // DISABLED - using new modal instead
                    // try { window.loadLinkedPOs(projectId); } catch (e) { console.warn('loadLinkedPOs refresh failed', e); }
                }, 700);
            }
        } catch (e) { console.warn('Could not trigger loadLinkedPOs', e); }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error syncing PO to project:', error);
        showNotification(`Error: ${error.message}`, 'error');
        throw error;
    }
};


async function getCurrentUserNameForActivityLog() {
    try {
        const user = auth.currentUser;
        if (!user) {
            return 'Unknown User';
        }
        
        // Check all collections in order: admin_user, admin_users, inventory_users, warehouse_users, purchasing_users, attendance_users
        const collectionsToCheck = ['admin_user', 'admin_users', 'inventory_users', 'warehouse_users', 'purchasing_users', 'attendance_users'];
        
        for (const collName of collectionsToCheck) {
            try {
                const userRef = doc(db, collName, user.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    if (userData && userData.name) {
                        console.log(`✅ User name retrieved from ${collName}: ${userData.name}`);
                        return userData.name;
                    }
                }
            } catch (err) {
                // Continue to next collection if this one fails
                continue;
            }
        }
        
        // Fallback: query by email in all collections
        for (const collName of collectionsToCheck) {
            try {
                const q = query(collection(db, collName), where("email", "==", user.email));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    const userData = qSnap.docs[0].data();
                    if (userData && userData.name) {
                        console.log(`✅ User name retrieved from ${collName} by email: ${userData.name}`);
                        return userData.name;
                    }
                }
            } catch (err) {
                // Continue to next collection if this one fails
                continue;
            }
        }
        
        // Last resort: use display name from session
        const session = getUserSession();
        if (session && session.display_name) {
            return session.display_name;
        }
        
        return user.email || 'Unknown User';
    } catch (error) {
        console.warn('⚠️ Error getting user name:', error);
        return 'Unknown User';
    }
}

// ============================================================
// PROJECT MODAL FUNCTIONS
// ============================================================

// Open Add Project Modal
function openAddProjectModal() {
    // make sure the cache is up-to-date; this will also re-populate the datalists
    // in case the user has just added/edited a project in the management page.
    fetchMainProjects(true).catch(e => console.warn('autocomplete preload failed', e));

    document.getElementById('addProjectForm').reset();
    document.getElementById('addProjectModal').style.display = 'block';
    console.log('➕ Add Project modal opened');
}

// Close Add Project Modal
function closeAddProjectModal() {
    document.getElementById('addProjectModal').style.display = 'none';
    document.getElementById('addProjectForm').reset();
    
    // Reset modal to "Add" mode
    localStorage.removeItem('editingProjectId');
    document.querySelector('#addProjectModal .modal-title').textContent = '➕ Add Project';
    document.querySelector('#addProjectForm button[type="submit"]').textContent = 'Add Project';
    
    console.log('❌ Add Project modal closed');
}

// Store current editing project ID
let currentEditingProjectId = null;


// Save Project Record
function saveProjectRecord(event) {
    event.preventDefault();

    // Get form values
    const projectID = document.getElementById('addProjectID').value.trim();
    const clientName = document.getElementById('addProjectClient').value.trim();
    const projectName = document.getElementById('addProjectProjectName').value.trim();
    const location = document.getElementById('addProjectLocation').value.trim();
    const trade = document.getElementById('addProjectTrade').value.trim();
    const budget = parseFloat(document.getElementById('addProjectBudget').value);
    const status = document.getElementById('addProjectStatus').value.trim();

    if (!clientName) {
        alert('❌ Client name is required!');
        return;
    }

    // Log the form values for debugging
    console.log('✅ Form values captured:', {
        projectID, clientName, projectName, location, trade, budget
    });

    // Disable submit button to prevent double submission
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    // Save to Firebase
    (async function() {
        try {
            // include purchasing flag so this record will be shown in the
            // Purchasing module but not automatically when new projects are
            // created elsewhere
            const projectData = {
                projectID: projectID,
                client_name: clientName,
                client: clientName,  // Save in both fields for compatibility
                projectName: projectName,
                location: location,
                trade: trade,
                budget: budget,
                status: status,
                items: [],  // Initialize empty items array
                purchasingIncluded: true
            };

            console.log('💾 Saving to Firebase:', projectData);

            // Check if this is an edit or new project
            const editingProjectId = localStorage.getItem('editingProjectId');
            const isEditing = editingProjectId !== null && editingProjectId !== '';
            
            let docId;
            let actionType = 'CREATE';

            if (isEditing) {
                // Update existing project
                docId = editingProjectId;
                const projects = await getProjects();
                const projectIndex = projects.findIndex(p => p.id === docId);
                
                if (projectIndex !== -1) {
                    // Preserve items array from existing project
                    if (projects[projectIndex].items) {
                        projectData.items = projects[projectIndex].items;
                    }
                    // ensure flag stays true in case someone cleared it elsewhere
                    projectData.purchasingIncluded = true;
                    
                    await updateProjectRecord(docId, projectData);
                    console.log('✅ Project updated in Firebase with ID:', docId);
                    actionType = 'UPDATE';
                }
            } else {
                // Before creating we try to find an existing project with the
                // same ID or name so we don't end up with duplicates.  If one
                // exists we treat it as an edit and simply set the flag.
                const projects = await getProjects();
                const duplicate = projects.find(p => {
                    const pid = (p.projectID || p.projectId || '').toString();
                    const pname = (p.projectName || p.project_name || '').toString();
                    return (pid && pid === projectID) ||
                           (pname && pname.toLowerCase() === projectName.toLowerCase());
                });
                if (duplicate) {
                    docId = duplicate.id;
                    // carry over any existing items
                    projectData.items = duplicate.items || [];
                    const wasFlagged = duplicate.purchasingIncluded === true;
                    projectData.purchasingIncluded = true;
                    await updateProjectRecord(docId, projectData);
                    console.log('✅ Project updated in Firebase with ID:', docId);
                    // if the record existed but wasn't previously flagged, then
                    // from the perspective of the purchasing module we just
                    // "added" it, so we'll increment accordingly
                    actionType = wasFlagged ? 'UPDATE' : 'CREATE';
                } else {
                    docId = await addProjectRecord(projectData);
                    console.log('✅ Project saved to Firebase with ID:', docId);
                }
            }

            console.log('✅ Client name saved:', clientName);

            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'PROJECT',
                    action: actionType,
                    details: `${actionType === 'UPDATE' ? 'Updated' : 'Created'} project: ${projectName} (Client: ${clientName})`,
                    moduleName: 'PURCHASING',
                    recordId: docId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            if (actionType === 'CREATE') {
                // Only add new row if we actually created a new record
                const newProject = {
                    id: docId,
                    ...projectData
                };

                // Add to table immediately (optimistic update)
                const table = document.querySelector('#projects-page .data-table');
                if (table) {
                    const tbody = table.querySelector('tbody');
                    const newRow = document.createElement('tr');
                    newRow.setAttribute('data-id', docId);

                    const statusClass = `status-${projectData.status.toLowerCase().replace('-', '')}`;      
                    newRow.innerHTML = `
                        <td>${projectData.projectID || ''}</td>
                        <td>${clientName}</td>
                        <td><strong>${projectData.projectName || ''}</strong></td>
                        <td>${projectData.location || ''}</td>
                        <td>${projectData.trade || ''}</td>
                        <td>₱${parseFloat(projectData.budget || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td><span class="status-badge ${statusClass}">${projectData.status}</span></td>
                        <td>
                            <button class="btn-edit" onclick="viewProjectDetails('${docId}')">View</button>
                            <button class="btn-delete" onclick="deleteProject('${docId}', '${projectData.projectName}')">Delete</button>
                        </td>
                    `;

                    // If there's a "no projects" message, remove it first
                    const emptyMsg = tbody.querySelector('tr td[colspan="8"]');
                    if (emptyMsg) {
                        tbody.innerHTML = '';
                    }

                    tbody.appendChild(newRow);
                    console.log('✅ Project added to table immediately');
                }

                // Update total projects count (only for new projects)
                const totalCount = document.getElementById('totalProjectsCount');
                if (totalCount) {
                    const currentCount = parseInt(totalCount.textContent || 0);
                    totalCount.textContent = currentCount + 1;
                    localStorage.setItem('cachedProjectCount', (currentCount + 1).toString());
                }
            }

            // Update cache
            projectsCache = null;
            cacheTimestamp = 0;

            const message = isEditing ? 'Project updated successfully!' : 'Project added successfully!';
            showNotification(message, 'success');

            // Reset form and close modal
            document.getElementById('addProjectForm').reset();
            localStorage.removeItem('editingProjectId');
            closeAddProjectModal();

            // Reload projects table to show updated data
            loadProjectsPage();

            // also refresh autocomplete cache/datalists in case this project
            // should now appear when typing in the modal
            mainProjectsCache = null;
            fetchMainProjects(true).catch(e => console.warn('refresh autocomplete failed', e));

        } catch (error) {
            console.error('❌ Error:', error);
            showNotification('Error saving project: ' + error.message, 'error');
        } finally {
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    })();
}

// Edit Project - Opens an editable modal or details page
function editProject(projectId) {
    (async function() {
        try {
            console.log('✏️ Opening edit mode for project:', projectId);
            
            // Get the project data
            const projects = await getProjects();
            const project = projects.find(p => p.id === projectId);

            if (!project) {
                showNotification('Project not found', 'error');
                return;
            }

            // Store the project ID for update operation
            localStorage.setItem('editingProjectId', projectId);

            // Populate the form with project data
            document.getElementById('addProjectID').value = project.projectID || project.projectId || '';
            document.getElementById('addProjectClient').value = project.client || project.client_name || '';
            document.getElementById('addProjectProjectName').value = project.name || project.projectName || project.project_name || '';
            document.getElementById('addProjectLocation').value = project.location || '';
            // Set trade value for edit
            const tradeInput = document.getElementById('addProjectTrade');
            if (tradeInput) {
              // Handle both old 'trade' (string) and new 'trades' (array) formats
              if (Array.isArray(project.trades)) {
                tradeInput.value = project.trades.join(', ') || '';
              } else {
                tradeInput.value = project.trade || '';
              }
            }
            document.getElementById('addProjectBudget').value = project.budget || '';
            document.getElementById('addProjectStatus').value = project.status || 'On-going';

            // Update modal title and button text
            document.querySelector('#addProjectModal .modal-title').textContent = '✏️ Edit Project';
            document.querySelector('#addProjectForm button[type="submit"]').textContent = 'Save Changes';

            // Open the modal
            document.getElementById('addProjectModal').style.display = 'flex';

        } catch (error) {
            console.error('❌ Error editing project:', error);
            showNotification('Error opening project: ' + error.message, 'error');
        }
    })();
}

// Delete Project
function deleteProject(projectId, projectName) {
    // Store the project ID and name for confirmation
    window.pendingDeleteProjectId = projectId;
    window.pendingDeleteProjectName = projectName;

    // Show confirmation modal
    const confirmationMessage = `Remove project "${projectName}" from the Purchasing list?  It will remain available in the main project management area.`;
    document.getElementById('confirmationMessage').textContent = confirmationMessage;
    document.getElementById('deleteConfirmationModal').style.display = 'flex';
}

// Confirm delete
function confirmDelete() {
    // Handle column deletion if column name is pending
    if (window.pendingDeleteColumnName) {
        confirmDeleteColumn();
        return;
    }

    const projectId = window.pendingDeleteProjectId;
    const projectName = window.pendingDeleteProjectName;

    if (!projectId) return;
    // Find and remove the row from the table immediately (optimistic delete)
    const table = document.querySelector('#projects-page .data-table');
    if (table) {
       const row = table.querySelector(`tr[data-id="${projectId}"]`);
       if (row) {
            row.style.opacity = '0.5';
            row.style.pointerEvents = 'none';
            console.log('⏳ Row marked for deletion:', projectId);
        }
    }

    // Delete from database
    (async function() {
        try {
            console.log('🗑️ Removing project from Purchasing list (flagging) :', projectId);
            // instead of deleting the entire record we just clear the flag so
            // it no longer shows in this module but the project remains in the
            // main "projects" collection
            await updateProjectRecord(projectId, { purchasingIncluded: false });
            console.log('✅ Project un‑flagged for Purchasing');

            // Remove the row from table
            const table = document.querySelector('#projects-page .data-table');
            if (table) {
                const row = table.querySelector(`tr[data-id="${projectId}"]`);
                if (row) {
                    row.style.transition = 'all 0.3s ease';
                    row.style.opacity = '0';
                    row.style.height = '0';

                    // Remove from DOM immediately
                    if (row.parentNode) {
                        row.parentNode.removeChild(row);
                        console.log('✅ Project row removed from table');

                        // Check if table is now empty
                        const tbody = table.querySelector('tbody');
                        if (tbody.children.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No projects yet. Add one to get started.</td></tr>';
                        }
                    }
                }
            }

            // Update total projects count
            const totalCount = document.getElementById('totalProjectsCount');
            if (totalCount) {
                const currentCount = parseInt(totalCount.textContent || 0);
                const newCount = Math.max(0, currentCount - 1);
                totalCount.textContent = newCount;
                localStorage.setItem('cachedProjectCount', newCount.toString());
                console.log('✅ Project count updated:', newCount);
            }

            // Clear cache to refresh data on next load
            projectsCache = null;
            cacheTimestamp = 0;

            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'PROJECT',
                    action: 'DELETE',
                    details: `Deleted project: ${projectName}`,
                    moduleName: 'PURCHASING',
                    recordId: projectId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            document.getElementById('deleteConfirmationModal').style.display = 'none';
            
            // Show success notification
            showNotification(`Project "${projectName}" deleted successfully!`, 'success');

        } catch (error) {
            console.error('❌ Error deleting project:', error);
            showNotification('Error deleting project: ' + error.message, 'error');

            // Restore the row if deletion failed
            const table = document.querySelector('#projects-page .data-table');
            if (table) {
                const row = table.querySelector(`tr[data-id="${projectId}"]`);
                if (row) {
                    row.style.opacity = '1';
                    row.style.pointerEvents = 'auto';
                }
            }

            document.getElementById('deleteConfirmationModal').style.display = 'none';
        }
    })();
}

// Cancel delete
function cancelDelete() {
    window.pendingDeleteProjectId = null;
    window.pendingDeleteProjectName = null;
    window.pendingDeleteColumnName = null;
    window.pendingDeleteColumnType = null;
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}

// Search Projects
function searchProjects() {
    const searchInput = document.getElementById('projectSearchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const table = document.querySelector('#projects-page .data-table');
    const rows = table.querySelectorAll('tbody tr');

    if (searchTerm === '') {
        // If search is empty, show all rows
        rows.forEach(row => row.style.display = '');
        return;
    }
    let foundCount = 0;
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes(searchTerm)) {
            row.style.display = '';
            foundCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Show message if no results found
    if (foundCount === 0) {
        alert('No projects found matching your search.');
    }
}

// Allow Enter key to trigger search
// Also wire up autocomplete on the add/edit project modal fields
document.addEventListener('DOMContentLoaded', function() {
    const projectSearchInput = document.getElementById('projectSearchInput');
    if (projectSearchInput) {
        projectSearchInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                searchProjects();
            }
        });
    }

    // when user types into ID or Name fields in add-project modal, attempt to
    // auto-fill the rest of the form from main project management data
    const idEl = document.getElementById('addProjectID');
    const nameEl = document.getElementById('addProjectProjectName');
    if (idEl) idEl.addEventListener('input', autoFillProjectFields);
    if (nameEl) nameEl.addEventListener('input', autoFillProjectFields);

    // preload project list so datalists are ready immediately
    fetchMainProjects().catch(e => {/* swallow */});
});

// ============================================================
// ITEM MODAL FUNCTIONS
// ============================================================

// Material Autocomplete Functions
let allMaterials = [];

// Load all materials from Firestore
async function loadMaterialsForAutocomplete() {
    try {
        const materialsSnapshot = await getDocs(collection(db, 'materials'));
        allMaterials = [];
        materialsSnapshot.forEach(doc => {
            allMaterials.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log('✅ Loaded', allMaterials.length, 'materials for autocomplete');
    } catch (error) {
        console.error('❌ Error loading materials:', error);
    }
}

// Initialize material autocomplete for Item field
function initializeItemAutocomplete() {
    const itemInput = document.getElementById('addItemNumber');
    if (!itemInput) return;
    
    itemInput.addEventListener('input', handleItemInput);
    itemInput.addEventListener('focus', handleItemFocus);
    itemInput.addEventListener('keydown', handleMaterialKeydown);
}

// Initialize material autocomplete for Parts Description field
function initializePartsDescriptionAutocomplete() {
    const specInput = document.getElementById('addItemSpecification');
    if (!specInput) return;
    
    specInput.addEventListener('input', handlePartsDescriptionInput);
    specInput.addEventListener('focus', handlePartsDescriptionFocus);
    specInput.addEventListener('keydown', handleMaterialKeydown);
}

// Handle item input
function handleItemInput(event) {
    const input = event.target;
    const value = input.value.toLowerCase();
    
    if (value.length === 0) {
        removeMaterialDropdown('itemDropdown');
        return;
    }
    
    const filtered = allMaterials.filter(m => 
        (m.itemCode && m.itemCode.toLowerCase().includes(value)) ||
        (m.material && m.material.toLowerCase().includes(value))
    );
    
    showMaterialDropdownForField('itemDropdown', filtered, 'item', input);
}

// Handle item focus
function handleItemFocus(event) {
    const input = event.target;
    if (input.value.length === 0 && allMaterials.length > 0) {
        showMaterialDropdownForField('itemDropdown', allMaterials.slice(0, 10), 'item', input);
    }
}

// Handle parts description input
function handlePartsDescriptionInput(event) {
    const input = event.target;
    const value = input.value.toLowerCase();
    
    if (value.length === 0) {
        removeMaterialDropdown('specDropdown');
        return;
    }
    
    const filtered = allMaterials.filter(m => 
        (m.specification && m.specification.toLowerCase().includes(value)) ||
        (m.description && m.description.toLowerCase().includes(value)) ||
        (m.material && m.material.toLowerCase().includes(value))
    );
    
    showMaterialDropdownForField('specDropdown', filtered, 'spec', input);
}

// Handle parts description focus
function handlePartsDescriptionFocus(event) {
    const input = event.target;
    if (input.value.length === 0 && allMaterials.length > 0) {
        showMaterialDropdownForField('specDropdown', allMaterials.slice(0, 10), 'spec', input);
    }
}

// Show material dropdown for specific field
function showMaterialDropdownForField(dropdownId, materials, fieldType, inputElement) {
    removeMaterialDropdown(dropdownId);
    
    if (materials.length === 0) return;
    
    const dropdown = document.createElement('div');
    dropdown.id = dropdownId;
    dropdown.style.cssText = `
        position: absolute;
        background: rgba(20, 25, 35, 0.95);
        border: 1px solid rgba(10, 155, 3, 0.3);
        border-radius: 6px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 1001;
        min-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        margin-top: 4px;
    `;
    
    dropdown.innerHTML = materials.map((mat, idx) => {
        const displayText = fieldType === 'item' 
            ? `${mat.itemCode || ''} - ${mat.material || ''}`.trim()
            : `${mat.specification || mat.description || mat.material || ''}`;
        
        return `
            <div onclick="selectMaterialForField('${fieldType}', ${idx})" style="
                padding: 10px 12px;
                border-bottom: 1px solid rgba(10,155,3,0.1);
                cursor: pointer;
                font-size: 13px;
                color: #e0e0e0;
                transition: all 0.2s;
            " onmouseover="this.style.background='rgba(10,155,3,0.15)'" onmouseout="this.style.background=''">
                <div style="font-weight: 600; color: #15c524;">${escapeHtml(displayText)}</div>
                <div style="font-size: 12px; color: #a0a0a0; margin-top: 4px;">
                    Price: ₱${parseFloat(mat.unitPrice || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} | 
                    Stock: ${parseFloat(mat.quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </div>
            </div>
        `;
    }).join('');
    
    inputElement.parentElement.style.position = 'relative';
    inputElement.parentElement.appendChild(dropdown);
}

// Select material for specific field
function selectMaterialForField(fieldType, index) {
    if (!allMaterials[index]) return;
    
    const material = allMaterials[index];
    
    if (fieldType === 'item') {
        document.getElementById('addItemNumber').value = material.itemCode || material.material || '';
        document.getElementById('addItemUnitPrice').value = parseFloat(material.unitPrice || 0).toFixed(2);
        removeMaterialDropdown('itemDropdown');
        document.getElementById('addItemQuantity').focus();
    } else if (fieldType === 'spec') {
        document.getElementById('addItemSpecification').value = material.specification || material.description || material.material || '';
        document.getElementById('addItemUnitPrice').value = parseFloat(material.unitPrice || 0).toFixed(2);
        removeMaterialDropdown('specDropdown');
        document.getElementById('addItemQuantity').focus();
    }
    
    calculateItemTotal();
}

// Handle keyboard navigation
function handleMaterialKeydown(event) {
    const itemDropdown = document.getElementById('itemDropdown');
    const specDropdown = document.getElementById('specDropdown');
    const activeDropdown = itemDropdown || specDropdown;
    
    if (!activeDropdown) return;
    
    if (event.key === 'Escape') {
        removeMaterialDropdown(itemDropdown ? 'itemDropdown' : 'specDropdown');
        event.preventDefault();
    } else if (event.key === 'ArrowDown') {
        // Highlight first item or next item
        event.preventDefault();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
    }
}

// Remove material dropdown
function removeMaterialDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.remove();
    }
}

// Escape HTML to prevent XSS - REMOVED (duplicate defined earlier)

// ============================================================
// DYNAMIC FORM FIELD SYNC WITH COLUMN CONFIGURATION
// ============================================================

/**
 * This section ensures that Add/Edit item modal forms stay synchronized
 * with the table column configuration. When you configure which columns
 * are visible and in what order, the form fields update automatically.
 */

/**
 * CRITICAL: Show/Hide form fields to match column configuration
 * This ensures the form displays ONLY the configured columns
 */
function applyFormFieldVisibility(isEditMode = false) {
    console.log('🔍 applyFormFieldVisibility called - editMode:', isEditMode);
    console.log('📊 columnOrder:', columnOrder);
    console.log('⚙️ projectColumnSettings:', projectColumnSettings);
    
    const enabledFields = getEnabledFormFields(isEditMode);
    console.log('✅ Enabled fields:', enabledFields.map(f => f.columnName));
    
    const allFields = Object.keys(columnFieldMapping);
    
    // Hide all fields first
    allFields.forEach(columnName => {
        const config = columnFieldMapping[columnName];
        if (!config) return;
        
        const fieldId = isEditMode ? config.editFieldId : config.fieldId;
        const fieldElement = document.getElementById(fieldId);
        if (fieldElement) {
            // Hide the parent form-group div
            const formGroup = fieldElement.closest('.form-group');
            if (formGroup) {
                formGroup.style.cssText = 'display: none !important;';
                console.log('🔒 Hidden field:', columnName, '(' + fieldId + ')');
            }
        }
    });
    
    // Show only enabled fields
    enabledFields.forEach((field, index) => {
        const config = field.config;
        const fieldId = isEditMode ? config.editFieldId : config.fieldId;
        const fieldElement = document.getElementById(fieldId);
        if (fieldElement) {
            // Show the parent form-group div
            const formGroup = fieldElement.closest('.form-group');
            if (formGroup) {
                formGroup.style.cssText = 'display: block !important;';
                console.log('🔓 Shown field:', field.columnName, '(' + fieldId + ')');
            }
        }
    });
    
    console.log('✅ Form field visibility applied successfully');
}

// Mapping of column names to form field configurations
const columnFieldMapping = {
    'Item Code': { fieldId: 'addItemNumber', editFieldId: 'editItemNumber', type: 'text', placeholder: 'Enter item code', required: true },
    'Month': { fieldId: 'addItemDescription', editFieldId: 'editItemDescription', type: 'select', required: true },
    'MR #': { fieldId: 'addItemMR', editFieldId: 'editMRNumber', type: 'text', readonly: true, autoPopulate: true },
    'MR Date': { fieldId: 'addItemMRDate', editFieldId: 'editMRDate', type: 'date', readonly: true, autoPopulate: true },
    'Material': { fieldId: 'addItemSpecification', editFieldId: 'editItemSpecification', type: 'text', autoPopulate: true },
    'Best Supplier': { fieldId: 'addItemVendor', editFieldId: 'editItemVendor', type: 'text', readonly: true, autoPopulate: true },
    'Brand': { fieldId: 'addItemBrand', editFieldId: 'editItemBrand', type: 'text' },
    'Specification': { fieldId: 'addItemSpecDetail', editFieldId: 'editItemSpecDetail', type: 'text' },
    'P.O No.': { fieldId: 'addItemPONumber', editFieldId: 'editPONumber', type: 'text', required: true, lookup: 'po' },
    'Cost': { fieldId: 'addItemUnitPrice', editFieldId: 'editUnitPrice', type: 'number', step: '0.01', required: true },
    'P.O. Date': { fieldId: 'addItemPODate', editFieldId: 'editPODate', type: 'date', readonly: true, autoPopulate: true },
    // Delivery Date field removed
    'P.O Qty': { fieldId: 'addItemQuantity', editFieldId: 'editQuantity', type: 'number', step: '0.01', readonly: true, autoPopulate: true },
    'Received Qty': { fieldId: 'addReceivedItemQty', editFieldId: 'editReceivedQuantity', type: 'number', step: '0.01', required: true },
    'P.O Balance Qty': { fieldId: 'addPOBalanceQtyItem', editFieldId: 'editPOBalanceQty', type: 'number', step: '0.01', readonly: true },
    'Total Amount': { fieldId: 'addItemTotalAmount', editFieldId: 'editItemTotalAmount', type: 'number', step: '0.01', readonly: true },
    'Paid Amount': { fieldId: 'addItemPaidAmount', editFieldId: 'editPaymentAmount', type: 'number', step: '0.01', required: true },
    'Remaining Payable': { fieldId: 'addItemRemainingPayable', editFieldId: 'editBalance', type: 'number', step: '0.01', readonly: true },
    'Terms of Payment': { fieldId: 'addItemPaymentTerms', editFieldId: 'editTermsOfPayment', type: 'select', required: true },
    'Status': { fieldId: 'addItemStatus', editFieldId: 'editStatus', type: 'select', required: true }
};

/**
 * Get visible and enabled form fields based on ACTUAL visible table columns
 * Reads directly from the table header to see which columns are actually displayed
 * Returns array of {columnName, config} in column order
 */
function getEnabledFormFields(isEditMode = false) {
    const enabledFields = [];
    
    // Read ACTUAL visible columns from the table header
    const tableHeader = document.querySelector('.hidden-data-table thead tr');
    const visibleColumnsInTable = [];
    
    if (tableHeader) {
        // Get all visible column headers from the actual table
        tableHeader.querySelectorAll('th[data-column]').forEach(th => {
            // Check if the column header is visible (not hidden by CSS)
            const isVisible = th.offsetParent !== null && th.style.display !== 'none';
            const columnName = th.getAttribute('data-column');
            
            if (isVisible && columnName && columnName !== 'Actions') {
                visibleColumnsInTable.push(columnName);
            }
        });
        console.log('📊 ACTUAL visible columns in table:', visibleColumnsInTable);
    }
    
    // Use visible columns from table. If table can't be read, fall back to settings
    const columnsToUse = visibleColumnsInTable.length > 0 ? visibleColumnsInTable : 
        columnOrder.filter(col => col !== 'Actions' && projectColumnSettings[col]);
    
    console.log('✅ Columns to display in edit form:', columnsToUse);
    
    // Map columns to form fields
    columnsToUse.forEach(columnName => {
        if (columnFieldMapping[columnName]) {
            enabledFields.push({
                columnName: columnName,
                config: columnFieldMapping[columnName]
            });
        }
    });
    
    console.log('🎯 Final enabled form fields:', enabledFields.map(f => f.columnName));
    return enabledFields;
}

/**
 * Validate form fields before submission - only check enabled/visible fields
 */
function validateDynamicFormFields() {
    // Determine if we're in edit mode by checking if we have an editing item index
    const isEditMode = localStorage.getItem('editingItemIndex') !== null;
    console.log('🔍 validateDynamicFormFields - Edit mode:', isEditMode);
    
    const enabledFields = getEnabledFormFields(isEditMode);
    console.log('📋 Validating', enabledFields.length, 'fields');
    
    for (const field of enabledFields) {
        const config = field.config;
        // Use the correct field ID based on edit mode
        const fieldId = isEditMode ? config.editFieldId : config.fieldId;
        const element = document.getElementById(fieldId);
        
        console.log(`📌 Checking field: ${field.columnName} (ID: ${fieldId}) - Element exists: ${!!element}, Required: ${config.required}`);
        
        if (!element) {
            console.warn(`⚠️ Field element not found: ${fieldId} for column ${field.columnName}`);
            continue;
        }
        
        // Check if field is required and empty
        if (config.required) {
            const value = element.value?.trim() || '';
            console.log(`   Value: "${value}"`);
            if (!value) {
                console.error(`❌ Required field empty: ${field.columnName}`);
                showNotification(`❌ ${field.columnName} is required but was not filled`, 'error');
                element.focus();
                element.style.borderColor = '#ff6b6b';
                setTimeout(() => { element.style.borderColor = ''; }, 2000);
                return false;
            }
        }
    }
    
    console.log('✅ All validations passed');
    return true;
}

/**
 * Collect form data from enabled fields only
 * This ensures only visible/configured fields are saved
 */
function collectDynamicFormData(isEditMode = false) {
    const enabledFields = getEnabledFormFields(isEditMode);
    const itemData = {};
    
    enabledFields.forEach(field => {
        // Use the correct field ID based on edit mode
        const fieldId = isEditMode ? field.config.editFieldId : field.config.fieldId;
        const element = document.getElementById(fieldId);
        
        if (!element) {
            console.warn(`⚠️ Field not found: ${fieldId} for column ${field.columnName}`);
            return;
        }
        
        const columnName = field.columnName;
        const value = element.value;
        
        // Map column name to data property name (matching saveItemRecord structure)
        const propertyMap = {
            'Item Code': 'itemNumber',
            'Month': 'month',
            'MR #': 'mrNumber',
            'MR Date': 'mrDate',
            'Material': 'specification',
            'Best Supplier': 'vendor',
            'Brand': 'brand',
            'Specification': 'specDetail',
            'P.O No.': 'poNumber',
            'Cost': 'unitPrice',
            'P.O. Date': 'poDate',
            // 'Delivery Date': removed
            'P.O Qty': 'quantity',
            'Received Qty': 'receivedQty',
            'P.O Balance Qty': 'poBalanceQty',
            'Total Amount': 'totalAmount',
            'Paid Amount': 'paidAmount',
            'Remaining Payable': 'remainingPayable',
            'Terms of Payment': 'paymentTerms',
            'Status': 'status'
        };
        
        const propertyName = propertyMap[columnName];
        if (propertyName) {
            // Convert numeric values
            if (field.config.type === 'number') {
                itemData[propertyName] = parseFloat(value) || 0;
            } else {
                itemData[propertyName] = value;
            }
        }
    });
    
    // Add missing required defaults
    if (!itemData.unitOfMeasure) itemData.unitOfMeasure = 'item';
    
    // Calculate totals if needed
    if (itemData.quantity !== undefined && itemData.unitPrice !== undefined) {
        itemData.totalAmount = (itemData.quantity || 0) * (itemData.unitPrice || 0);
    }
    
    if (itemData.totalAmount !== undefined && itemData.paidAmount !== undefined) {
        itemData.remainingPayable = (itemData.totalAmount || 0) - (itemData.paidAmount || 0);
    }
    
    return itemData;
}

// Open Add Item Modal
function openAddItemModal() {
    document.getElementById('addItemForm').reset();
    // Reset calculation fields
    document.getElementById('addPOBalanceQtyItem').value = '0';
    document.getElementById('addItemRemainingPayable').value = '0';
    
    // CRITICAL: Apply form field visibility to match columns
    applyFormFieldVisibility(false);
    
    document.getElementById('addItemModal').style.display = 'block';
    
    // Load materials and initialize autocomplete
    (async function() {
        await loadMaterialsForAutocomplete();
        initializeItemAutocomplete();
        initializePartsDescriptionAutocomplete();
    })();
    
    // Add event listener for PO number lookup
    const poNumberInput = document.getElementById('addItemPONumber');
    if (poNumberInput) {
        poNumberInput.addEventListener('blur', handlePONumberLookup);
        poNumberInput.addEventListener('change', handlePONumberLookup);
    }

    // Add payment countdown preview and listeners for Add Item modal
    try {
        const previewId = 'addPaymentCountdownPreview';
        let previewEl = document.getElementById(previewId);
        if (!previewEl) {
            previewEl = document.createElement('div');
            previewEl.id = previewId;
            previewEl.style.cssText = 'margin-top:6px;color:#e0e0e0;font-size:12px;';
            const termsEl = document.getElementById('addItemPaymentTerms');
            if (termsEl && termsEl.parentElement) termsEl.parentElement.appendChild(previewEl);
        }

        const updatePreviewAdd = () => {
            const terms = document.getElementById('addItemPaymentTerms')?.value;
            const paid = parseFloat(document.getElementById('addItemPaidAmount')?.value || 0);
            const info = calculatePaymentTermsCountdown(null, terms, paid);
            if (info && info.status) {
                previewEl.textContent = info.status;
                previewEl.style.color = info.color || '#e0e0e0';
            } else {
                previewEl.textContent = '';
            }
        };

        const paidAddEl = document.getElementById('addItemPaidAmount');
        if (paidAddEl) paidAddEl.addEventListener('input', updatePreviewAdd);
        const termsAddEl = document.getElementById('addItemPaymentTerms');
        if (termsAddEl) termsAddEl.addEventListener('change', updatePreviewAdd);
    } catch (e) {
        console.warn('⚠️ Could not attach add-item payment preview listeners:', e);
    }
}

// Close Add Item Modal
function closeAddItemModal() {
    document.getElementById('addItemModal').style.display = 'none';
    document.getElementById('addItemForm').reset();
    
    // Remove material dropdowns
    removeMaterialDropdown('itemDropdown');
    removeMaterialDropdown('specDropdown');

    // Reset button text and clear editing flag
    const submitBtn = document.querySelector('#addItemForm button[type="submit"]');
    submitBtn.textContent = 'Add Item';
    localStorage.removeItem('editingItemIndex');
}

function closeAddPOModal() {
    document.getElementById('addPOModal').style.display = 'none';
}

// ============================================================
// SELECT PO MODAL FUNCTIONS
// ============================================================
function openSelectPOModal() {
    // Get the Firestore document ID from localStorage (set by viewProjectDetails)
    let projectId = localStorage.getItem('currentProjectId');
    
    if (!projectId) {
        alert('⚠️ No project selected');
        return;
    }
    
    const modal = document.getElementById('selectPOModal');
    if (!modal) return;
    
    const projName = document.getElementById('detailProjectProjectName')?.textContent || 'Unknown';
    const infoSpan = document.getElementById('selectPOProjectInfo');
    if (infoSpan) infoSpan.textContent = projName + ' (' + (projectId || 'n/a') + ')';
    
    modal.style.display = 'block';
    loadAvailablePOsForSelection(projectId);
}

function closeSelectPOModal() {
    document.getElementById('selectPOModal').style.display = 'none';
}

async function loadAvailablePOsForSelection(projectId) {
    try {
        const container = document.getElementById('selectPOContainer');
        if (!container) return;
        
        // Fetch all projects to get the current project's items
        const projects = await getProjects();
        const currentProject = projects.find(p => p.id === projectId);
        const addedPOIds = currentProject?.items?.map(item => item._sourcePOId).filter(Boolean) || [];
        
        // Get the human-readable project ID to match with PO.projectId field
        const humanReadableProjectId = currentProject?.projectID || projectId;
        
        // Fetch only POs for this project using Firebase directly
        let allPOs = [];
        try {
            // Query POs filtered by projectId (human-readable ID stored when PO is created)
            const q = query(
                collection(db, 'purchaseOrders'),
                where('projectId', '==', humanReadableProjectId)
            );
            const snap = await getDocs(q);
            snap.forEach(docSnap => allPOs.push({ id: docSnap.id, ...docSnap.data() }));
            console.log(`📦 Loaded ${allPOs.length} POs for project ${humanReadableProjectId} (doc ID: ${projectId})`);
        } catch (err) {
            console.error('❌ Error querying purchase orders for project:', err);
            container.innerHTML = '<div style="color:#ff6b6b;font-size:13px;padding:15px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center;">Error loading POs</div>';
            return;
        }
        
        // Filter POs that haven't been added yet to this project's items
        const availablePOs = allPOs.filter(po => !addedPOIds.includes(po.id));
        
        if (availablePOs.length === 0) {
            container.innerHTML = '<div style="color:#a0a0a0;font-size:13px;padding:15px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center;">All POs have been added to this project</div>';
            return;
        }
        
        // Create PO cards
        container.innerHTML = availablePOs.map(po => {
            // Calculate total amount from all items (cost × quantity)
            const totalAmount = (po.items || []).reduce((sum, item) => {
                return sum + ((item.quantity || 0) * (item.cost || 0));
            }, 0);
            
            return `
            <div style="border:1px solid rgba(10,155,3,0.3);border-radius:6px;padding:14px;background:rgba(15,30,53,0.6);cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(10,155,3,0.15)';this.style.borderColor='rgba(10,155,3,0.6)'" onmouseout="this.style.background='rgba(15,30,53,0.6)';this.style.borderColor='rgba(10,155,3,0.3)'" onclick="addPOToProjectDirectly('${po.id}', '${projectId}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <h4 style="margin:0 0 4px 0;color:#0a9b03;font-weight:700;font-size:14px;">PO: ${escapeHtml(po.poNo || 'N/A')}</h4>
                        <p style="margin:0;color:#a0a0a0;font-size:12px;">Supplier: ${escapeHtml(po.vendor || po.supplier || 'N/A')}</p>
                    </div>
                    <span style="color:#0a9b03;font-weight:700;font-size:14px;">${formatNumber(totalAmount)}</span>
                </div>
                <div style="font-size:12px;color:#d0d0d0;margin-bottom:6px;">
                    <span style="background:rgba(10,155,3,0.2);padding:2px 6px;border-radius:3px;margin-right:6px;">${po.items?.length || 0} items</span>
                    <span style="color:#0a9b03;">${po.status || 'Pending'}</span>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        console.error('❌ Error loading available POs:', err);
        const container = document.getElementById('selectPOContainer');
        if (container) container.innerHTML = '<div style="color:#ff6b6b;font-size:13px;padding:15px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center;">Error loading POs</div>';
    }
}

// Helper function to extract month from date string
function getMonthFromDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1; // getMonth returns 0-11, so add 1
        return String(month).padStart(2, '0'); // Return as 2-digit string like "01", "02", "03"
    } catch (e) {
        return '';
    }
}

async function addPOToProjectDirectly(poId, projectId) {
    try {
        // Try to get PO from cache first
        let po = null;
        if (window.linkedPOsData && Array.isArray(window.linkedPOsData)) {
            po = window.linkedPOsData.find(p => p.id === poId);
        }
        
        // If not in cache, fetch from Firebase
        if (!po) {
            const poRef = doc(db, 'purchaseOrders', poId);
            const poSnap = await getDoc(poRef);
            if (!poSnap.exists()) {
                alert('PO not found');
                return;
            }
            po = { id: poSnap.id, ...poSnap.data() };
        }
        
        // Get the project
        const projects = await getProjects();
        const project = projects.find(p => p.id === projectId);
        if (!project) {
            console.warn('⚠️ Project lookup returned null, but proceeding with PO item creation...');
        }
        
        // Convert PO items to project items with proper column mapping
        if (project && !project.items) project.items = [];
        if (project) {
        
        // Get MR and PO dates from the PO
        const mrDate = po.linkedMRDateCreated || po.createdAt || '';
        const poDate = po.createdAt || '';
        
        console.log('🔍 PO data being added:', po);
        console.log('📦 PO supplier field:', po.supplier, 'vendor field:', po.vendor);
        console.log('📦 PO items count:', po.items?.length);
        
        po.items?.forEach((poItem, idx) => {
            console.log(`📍 Item ${idx}:`, { itemCode: poItem.itemCode, cost: poItem.cost, quantity: poItem.quantity });
            
            const projectItem = {
                itemCode: poItem.itemCode || '',
                month: getMonthFromDate(poDate),
                material: poItem.materialName || poItem.itemDescription || poItem.material || '',
                specification: poItem.specification || '',
                brand: poItem.brand || '',
                bestSupplier: po.supplier || po.vendor || 'Unknown',  // Make sure to use supplier from PO
                cost: parseFloat(poItem.cost || 0),  // Ensure it's a number
                mrNo: po.linkedMRs?.[0] || po.mrNo || '',  // Get MR number from PO
                mrDate: mrDate,  // Use PO's date as MR date
                poNumber: po.poNo,
                poDate: poDate,
                deliveryDate: poItem.expectedDeliveryDate || poItem.deliveryDate || '',  // Fetch from PO if available
                quantity: parseFloat(poItem.quantity || 0),
                receivedQty: '',  // Leave blank for user to fill
                remainingQty: '',  // Leave blank for user to fill
                totalAmount: (parseFloat(poItem.quantity || 0) * parseFloat(poItem.cost || 0)),
                paidAmount: 0,
                remainingPayable: '',  // Leave blank for user to fill
                termsOfPayment: '',
                status: 'On-going',
                _sourcePOId: poId
            };
            console.log('✅ Project item created:', projectItem);
            project.items.push(projectItem);
        });
        
        // Update the project in Firebase
        await updateProjectRecord(projectId, project);
        } else {
            console.log('✅ PO created but project not found locally - checking Firestore...');
            // Project wasn't found locally, but the PO framework is ready
            // The PO will be linked when the project is next loaded
        }
        
        // Show success message using app notification component
        showNotification('✅ PO added to project successfully!', 'success');
        
        // Refresh the display
        populateProjectDetailsTable(projectId);
        closeSelectPOModal();
    } catch (err) {
        console.error('❌ Error adding PO to project:', err);
        alert('Error: ' + err.message);
    }
}

// ============================================================
// PO NUMBER LOOKUP FUNCTIONALITY
// ============================================================

/**
 * DATA MAPPING REFERENCE
 * ======================
 * This section handles syncing data from Purchase Orders (created in Material Processing)
 * to the Purchasing module when adding/editing items.
 * 
 * AVAILABLE DATA FROM PO (Auto-Populated):
 * ✅ MR Number - From po.linkedMRs[0] or po.mrNo
 * ✅ MR Date - From po.createdAt (converted to date)
 * ✅ PO Date - From po.createdAt (converted to date)
 * ✅ Parts Description/Specification - From po.items[0].specification
 * ✅ Quantity - From po.items[0].quantity
 * ✅ Vendor/Supplier - From po.supplier
 * ✅ Delivery Date - From poItem.expectedDeliveryDate or poItem.deliveryDate (if available)
 * 
 * DATA NOT IN PO (Manual Entry Required):
 * ❌ Month - Not stored in PO
 * ❌ Unit Price - Not stored in PO (critical for pricing)
 * ❌ Received Qty - Not applicable at PO creation
 * ❌ Paid Amount - Not applicable at PO creation
 * ❌ Payment Terms - Not stored in PO
 * 
 * RECOMMENDATION TO IMPROVE DATA SYNC:
 * To populate more fields automatically, update Material Processing's
 * PO creation to store additional fields:
 *   - unitPrice: Get from material pricing or supplier agreement
 *   - paymentTerms: Get from supplier master data or allow selection
 * 
 * NOTE: Delivery Date is now fetched from PO if available. Users can edit
 * it in the Project Details table if needed.
 * 
 * See dashboard.js line ~6540 where PO is created in Material Processing
 */

/**
 * Fetch Purchase Order details from Material Processing module
 * based on the PO number entered in the purchasing form
 */
async function fetchPODetailsFromNumber(poNumber) {
    if (!poNumber || poNumber.trim() === '') {
        return null;
    }
    
    try {
        console.log('🔍 Searching for PO Number:', poNumber);
        
        // Query Firebase purchaseOrders collection for the PO number
        const poSnapshot = await getDocs(
            collection(db, 'purchaseOrders')
        );
        
        let foundPO = null;
        poSnapshot.forEach(doc => {
            const po = doc.data();
            if (po.poNo && po.poNo.toString().trim() === poNumber.toString().trim()) {
                foundPO = {
                    id: doc.id,
                    ...po
                };
            }
        });
        
        if (!foundPO) {
            console.warn('⚠️ PO not found:', poNumber);
            showNotification(`❌ PO ${poNumber} not found in Material Processing`, 'error');
            return null;
        }
        
        console.log('✅ Found PO:', foundPO);
        return foundPO;
        
    } catch (error) {
        console.error('❌ Error fetching PO details:', error);
        showNotification('Error fetching PO details: ' + error.message, 'error');
        return null;
    }
}

/**
 * Handle PO number input - auto-populate form fields when PO is found
 * Note: Some fields may not be available in the PO and need manual entry
 */
function handlePONumberLookup(event) {
    const poNumberInput = event.target;
    const poNumber = poNumberInput.value.trim();
    
    if (!poNumber) {
        // Clear auto-populated fields if PO number is cleared
        document.getElementById('addItemMR').value = '';
        document.getElementById('addItemMRDate').value = '';
        document.getElementById('addItemSpecification').value = '';
        document.getElementById('addItemQuantity').value = '';
        document.getElementById('addItemVendor').value = '';
        document.getElementById('addItemPODate').value = '';
        return;
    }
    
    // Fetch PO details asynchronously
    (async function() {
        const po = await fetchPODetailsFromNumber(poNumber);
        
        if (!po) {
            return; // Error already shown by fetchPODetailsFromNumber
        }
        
        // Auto-populate form fields from PO data
        try {
            // 1. MR Number - get from linkedMRs array or mrNo field
            const mrNumber = po.linkedMRs && po.linkedMRs.length > 0 
                ? po.linkedMRs[0] 
                : (po.mrNo || '');
            
            document.getElementById('addItemMR').value = mrNumber;
            console.log('✅ MR Number populated:', mrNumber);
            
            // 2. PO Date - convert from createdAt
            if (po.createdAt) {
                const poDate = new Date(po.createdAt).toISOString().split('T')[0];
                document.getElementById('addItemPODate').value = poDate;
                // Also use as MR Date since MR Date is not available in PO
                document.getElementById('addItemMRDate').value = poDate;
                console.log('✅ PO Date & MR Date populated:', poDate);
            }
            
            // 3. Supplier/Vendor - get vendor name
            if (po.supplier) {
                document.getElementById('addItemVendor').value = po.supplier;
                console.log('✅ Vendor populated:', po.supplier);
            }
            
            // 4. Items details - populate from first item in PO
            if (po.items && po.items.length > 0) {
                const firstItem = po.items[0];
                
                // Parts Description / Specification
                if (firstItem.specification) {
                    document.getElementById('addItemSpecification').value = firstItem.specification;
                    console.log('✅ Specification populated:', firstItem.specification);
                } else if (firstItem.materialName) {
                    document.getElementById('addItemSpecification').value = firstItem.materialName;
                    console.log('✅ Specification (from materialName) populated:', firstItem.materialName);
                }
                
                // Quantity
                if (firstItem.quantity) {
                    document.getElementById('addItemQuantity').value = firstItem.quantity;
                    console.log('✅ Quantity populated:', firstItem.quantity);
                    // Trigger calculation
                    calculateItemTotal();
                    calculatePOBalanceQtyItem();
                }
            }
            
            console.log('✅ Form auto-populated with PO details');
            console.log('⚠️ Note: Unit Price, Delivery Date, Received Qty, and Paid Amount must be entered manually');
            showNotification(`✅ PO ${poNumber} loaded! Please fill in Unit Price, Delivery Date, Received Qty, and Payment info.`, 'success', 5000);
            
        } catch (error) {
            console.error('❌ Error auto-populating form:', error);
            showNotification('Error auto-populating form: ' + error.message, 'error');
        }
    })();
}

/**
 * Handle PO number lookup in edit form - auto-populate form fields when PO is found
 * Note: Some fields may not be available in the PO and need manual entry
 */
function handleEditPONumberLookup(event) {
    const poNumberInput = event.target;
    const poNumber = poNumberInput.value.trim();
    
    if (!poNumber) {
        // Clear auto-populated fields if PO number is cleared
        document.getElementById('editMRNumber').value = '';
        document.getElementById('editMRDate').value = '';
        document.getElementById('editItemSpecification').value = '';
        document.getElementById('editQuantity').value = '';
        document.getElementById('editItemVendor').value = '';
        document.getElementById('editPODate').value = '';
        return;
    }
    
    // Fetch PO details asynchronously
    (async function() {
        const po = await fetchPODetailsFromNumber(poNumber);
        
        if (!po) {
            return; // Error already shown by fetchPODetailsFromNumber
        }
        
        // Auto-populate edit form fields from PO data
        try {
            // 1. MR Number - get from linkedMRs array or mrNo field
            const mrNumber = po.linkedMRs && po.linkedMRs.length > 0 
                ? po.linkedMRs[0] 
                : (po.mrNo || '');
            
            document.getElementById('editMRNumber').value = mrNumber;
            console.log('✅ Edit: MR Number populated:', mrNumber);
            
            // 2. PO Date - convert from createdAt
            if (po.createdAt) {
                const poDate = new Date(po.createdAt).toISOString().split('T')[0];
                document.getElementById('editPODate').value = poDate;
                // Also use as MR Date since MR Date is not available in PO
                document.getElementById('editMRDate').value = poDate;
                console.log('✅ Edit: PO Date & MR Date populated:', poDate);
            }
            
            // 3. Supplier/Vendor - get vendor name
            if (po.supplier) {
                document.getElementById('editItemVendor').value = po.supplier;
                console.log('✅ Edit: Vendor populated:', po.supplier);
            }
            
            // 4. Items details - populate from first item in PO
            if (po.items && po.items.length > 0) {
                const firstItem = po.items[0];
                
                // Parts Description / Specification
                if (firstItem.specification) {
                    document.getElementById('editItemSpecification').value = firstItem.specification;
                    console.log('✅ Edit: Specification populated:', firstItem.specification);
                } else if (firstItem.materialName) {
                    document.getElementById('editItemSpecification').value = firstItem.materialName;
                    console.log('✅ Edit: Specification (from materialName) populated:', firstItem.materialName);
                }
                
                // Quantity
                if (firstItem.quantity) {
                    document.getElementById('editQuantity').value = firstItem.quantity;
                    console.log('✅ Edit: Quantity populated:', firstItem.quantity);
                }
            }
            
            console.log('✅ Edit form auto-populated with PO details');
            console.log('⚠️ Note: Unit Price, Delivery Date, Received Qty, and Paid Amount must be entered manually');
            showNotification(`✅ PO ${poNumber} loaded! Please fill in Unit Price, Delivery Date, Received Qty, and Payment info.`, 'success', 5000);
            
        } catch (error) {
            console.error('❌ Error auto-populating edit form:', error);
            showNotification('Error auto-populating form: ' + error.message, 'error');
        }
    })();
}

// Calculate Item Total Amount
function calculateItemTotal() {
    const quantity = parseFloat(document.getElementById('addItemQuantity').value || 0);
    const unitPrice = parseFloat(document.getElementById('addItemUnitPrice').value || 0);
    const total = quantity * unitPrice;
    document.getElementById('addItemTotalAmount').value = total.toFixed(2);
}

// Calculate Edit Item Total Amount
function calculateEditItemTotal() {
    const quantity = parseFloat(document.getElementById('editQuantity').value || 0);
    const unitPrice = parseFloat(document.getElementById('editUnitPrice').value || 0);
    const total = quantity * unitPrice;
    // Note: Total Amount field may not exist in edit form, attempting to set if available
    const totalField = document.getElementById('editItemTotalAmount');
    if (totalField) {
        totalField.value = total.toFixed(2);
    }
}

function calculatePOBalanceQtyItem() {
    const quantity = parseFloat(document.getElementById('addItemQuantity').value || 0);
    const receivedQty = parseFloat(document.getElementById('addReceivedItemQty').value || 0);
    const balance = quantity - receivedQty;
    document.getElementById('addPOBalanceQtyItem').value = balance.toFixed(2);
}

// Calculate Item Paid Amount (Received Qty × Unit Price)
function calculateItemPaidAmount() {
    const receivedQty = parseFloat(document.getElementById('addReceivedItemQty').value || 0);
    const unitPrice = parseFloat(document.getElementById('addItemUnitPrice').value || 0);
    const paidAmount = receivedQty * unitPrice;
    document.getElementById('addItemPaidAmount').value = paidAmount.toFixed(2);
}

// Calculate Edit Item Paid Amount (Received Qty × Unit Price)
function calculateEditItemPaidAmount() {
    const receivedQty = parseFloat(document.getElementById('editReceivedQuantity').value || 0);
    const unitPrice = parseFloat(document.getElementById('editUnitPrice').value || 0);
    const paidAmount = receivedQty * unitPrice;
    document.getElementById('editPaymentAmount').value = paidAmount.toFixed(2);
}

// Calculate Item Remaining Payable (Total Amount - Paid Amount)
function calculateItemRemainingPayable() {
    const totalAmount = parseFloat(document.getElementById('addItemTotalAmount').value || 0);
    const paidAmount = parseFloat(document.getElementById('addItemPaidAmount').value || 0);
    const remaining = totalAmount - paidAmount;
    document.getElementById('addItemRemainingPayable').value = remaining.toFixed(2);
}

// Calculate Edit Item Remaining Payable
function calculateEditItemRemainingPayable() {
    try {
        const totalAmountEl = document.getElementById('editQuantity');
        const unitPriceEl = document.getElementById('editUnitPrice');
        const paymentAmountEl = document.getElementById('editPaymentAmount');
        const balanceEl = document.getElementById('editBalance');
        
        if (totalAmountEl && unitPriceEl && paymentAmountEl && balanceEl) {
            // Calculate total amount from quantity × unit price
            const totalAmount = parseFloat(totalAmountEl.value || 0) * parseFloat(unitPriceEl.value || 0);
            const paymentAmount = parseFloat(paymentAmountEl.value || 0);
            const remaining = totalAmount - paymentAmount;
            balanceEl.value = remaining.toFixed(2);
            console.log('✅ Edit item remaining payable calculated:', remaining.toFixed(2));
        }
    } catch (e) {
        console.warn('⚠️ Could not calculate edit item remaining payable:', e);
    }
}

// Edit Project Item
function editProjectItem(index) {
    const currentProjectId = localStorage.getItem('currentProjectId');

    console.log('🔍 editProjectItem called with index:', index, 'type:', typeof index);
    console.log('📌 Current Project ID:', currentProjectId);
    if (!currentProjectId) {
        alert('❌ No project selected');
        return;
    }

    // Convert index to integer if it's a string
    const itemIndex = parseInt(index, 10);
    (async function() {
        try {
            // Get current project
            const projects = await getProjects();
            console.log('📊 Total projects loaded:', projects.length);
            const project = projects.find(p => p.id === currentProjectId);

            if (!project) {
                console.error('❌ Project not found with ID:', currentProjectId);
                alert('❌ Project not found');
                return;
            }

            console.log('📦 Project found:', project.projectName);
            console.log('📋 Total items in project:', project.items ? project.items.length : 0);
            console.log('🔎 Looking for item at index:', itemIndex);
            
            if (!project.items || !project.items[itemIndex]) {
                console.error('❌ Item not found at index:', itemIndex);
                console.error('Items array:', project.items);
                alert('❌ Item not found at index ' + itemIndex);
                return;
            }
            const item = project.items[itemIndex];
            console.log('✅ Item found:', item);
            console.log('📅 ITEM DATE FIELDS:');
            console.log('  - mrDate:', item.mrDate);
            console.log('  - poDate:', item.poDate);
            console.log('🔍 ALL ITEM PROPERTIES:');
            console.log(JSON.stringify(item, null, 2));

            // First, open the modal to ensure DOM elements exist
            openEditItemModal();

            // Wait for DOM to be ready, then populate form
            setTimeout(() => {
                try {
                    // Helper function to convert date formats
                    const formatDateForInput = (dateValue) => {
                        console.log('📅 formatDateForInput - Input:', dateValue, 'Type:', typeof dateValue);
                        
                        if (!dateValue) {
                            console.log('📅 formatDateForInput - Empty value, returning ""');
                            return '';
                        }

                        // Handle Firebase Timestamp objects
                        if (typeof dateValue === 'object' && dateValue.seconds) {
                            try {
                                const firebaseDate = new Date(dateValue.seconds * 1000).toISOString().split('T')[0];
                                console.log('📅 formatDateForInput - Firebase timestamp converted to:', firebaseDate);
                                return firebaseDate;
                            } catch (e) {
                                console.error('📅 Error converting Firebase timestamp:', e);
                                return '';
                            }
                        }

                        // Handle Date objects
                        if (dateValue instanceof Date) {
                            try {
                                const dateObjStr = dateValue.toISOString().split('T')[0];
                                console.log('📅 formatDateForInput - Date object converted to:', dateObjStr);
                                return dateObjStr;
                            } catch (e) {
                                console.error('📅 Error converting Date object:', e);
                                return '';
                            }
                        }

                        // Convert to string and trim
                        let dateStr = String(dateValue).trim();

                        // If already in YYYY-MM-DD format, return as is
                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                            console.log('📅 formatDateForInput - Already YYYY-MM-DD:', dateStr);
                            return dateStr;
                        }

                        // If in ISO format with time (YYYY-MM-DDTHH:mm:ss), extract date part
                        if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
                            const result = dateStr.split('T')[0];
                            console.log('📅 formatDateForInput - ISO with time converted to:', result);
                            return result;
                        }

                        // If in mm/dd/yyyy or dd/mm/yyyy format
                        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
                            const parts = dateStr.split('/');
                            const first = parseInt(parts[0]);
                            const second = parseInt(parts[1]);
                            const year = parts[2];
                            
                            // If first part > 12, it's definitely day (dd/mm/yyyy)
                            if (first > 12) {
                                const month = String(second).padStart(2, '0');
                                const day = String(first).padStart(2, '0');
                                const result = `${year}-${month}-${day}`;
                                console.log('📅 formatDateForInput - dd/mm/yyyy converted to:', result);
                                return result;
                            } else {
                                // Assume mm/dd/yyyy (more common)
                                const month = String(first).padStart(2, '0');
                                const day = String(second).padStart(2, '0');
                                const result = `${year}-${month}-${day}`;
                                console.log('📅 formatDateForInput - mm/dd/yyyy converted to:', result);
                                return result;
                            }
                        }

                        console.warn('📅 formatDateForInput - Unknown format, returning as-is:', dateStr);
                        return dateStr;
                    };

                    const fields = {
                        'editItemNumber': item.itemNumber,
                        'editItemDescription': item.month || item.itemDescription || '',
                        'editMRDate': formatDateForInput(item.mrDate),
                        'editMRNumber': item.mrNumber,
                        'editItemSpecification': item.specification || '',
                        'editItemVendor': item.vendor || '',
                        'editItemBrand': item.brand || '',
                        'editItemSpecDetail': item.specDetail || '',
                        'editPODate': formatDateForInput(item.poDate),
                        'editPONumber': item.poNumber || item.unitOfMeasure || '',
                        'editQuantity': item.quantity,
                        'editUnitPrice': item.unitPrice,
                        'editReceivedQuantity': item.receivedQty,
                        'editPaymentAmount': item.paidAmount,
                        'editBalance': item.remainingPayable,
                        'editTermsOfPayment': item.paymentTerms || '',
                        'editStatus': item.status || 'On-going'
                    };

                    // Get enabled fields to know which ones should exist
                    const enabledFields = getEnabledFormFields(true);
                    const enabledFieldIds = new Set(enabledFields.map(f => f.config.editFieldId));

                    let failedFields = [];
                    for (const [fieldId, value] of Object.entries(fields)) {
                        try {
                            const element = document.getElementById(fieldId);
                            if (!element) {
                                // Only log as missing if this field is expected to be in the form
                                if (enabledFieldIds.has(fieldId)) {
                                    console.error('❌ MISSING FIELD:', fieldId);
                                    failedFields.push(fieldId);
                                } else {
                                    console.log('ℹ️ Field not in current form:', fieldId);
                                }
                                continue;
                            }
                            element.value = value || '';
                            console.log('✅ Populated', fieldId, ':', value || '(empty)');
                        } catch (fieldErr) {
                            console.error('❌ Error setting field', fieldId, ':', fieldErr);
                            failedFields.push(fieldId);
                        }
                    }

                    if (failedFields.length > 0) {
                        console.error('❌ Failed to populate fields:', failedFields);
                        showNotification('⚠️ Warning: Could not populate some fields: ' + failedFields.join(', '), 'warning');
                    }
                } catch (err) {
                    console.error('❌ Error populating form fields:', err);
                    alert('❌ Error loading form fields: ' + err.message);
                    return;
                }

                // Try to calculate remaining payable after field population
                try {
                    calculateEditItemRemainingPayable();
                    console.log('✅ Calculated remaining payable');
                } catch (calcErr) {
                    console.warn('⚠️ Could not calculate remaining payable:', calcErr);
                }

                // Store the index for update
                localStorage.setItem('editingItemIndex', itemIndex);
                localStorage.setItem('editingProjectId', currentProjectId);
                console.log('✏️ Edit item modal opened for index:', itemIndex);
            }, 100);  // Wait for modal to render

        } catch (error) {
            console.error('❌ Error loading item for edit:', error);
            alert('❌ Error loading item: ' + error.message);
        }
    })();
}

// Open Edit Item Modal
function openEditItemModal() {
    // Get visible columns from the table
    const visibleColumns = getVisibleTableColumns();
    console.log('🔍 Rebuilding modal with visible columns:', visibleColumns);
    
    // Dynamically rebuild the form to show ONLY visible columns
    rebuildEditFormForVisibleColumns(visibleColumns);
    
    document.getElementById('editItemModal').style.display = 'block';
    console.log('✏️ Edit Item modal opened with dynamic fields');
    
    // Add event listener for PO number lookup in edit form
    const editPONumberInput = document.getElementById('editPONumber');
    if (editPONumberInput) {
        editPONumberInput.addEventListener('blur', handleEditPONumberLookup);
        editPONumberInput.addEventListener('change', handleEditPONumberLookup);
    }
}

/**
 * Get all VISIBLE columns from the Project Details Data table
 * Only returns columns that are actually displayed (not hidden)
 */
function getVisibleTableColumns() {
    const visibleColumns = [];
    const tableHeader = document.querySelector('.hidden-data-table thead tr');
    
    if (tableHeader) {
        tableHeader.querySelectorAll('th[data-column]').forEach(th => {
            const columnName = th.getAttribute('data-column');
            // Check if column is actually visible (offsetParent !== null means not display:none)
            const isVisible = th.offsetParent !== null && getComputedStyle(th).display !== 'none';
            
            if (isVisible && columnName && columnName !== 'Actions') {
                visibleColumns.push(columnName);
            }
        });
    }
    
    console.log('📊 Visible table columns detected:', visibleColumns);
    return visibleColumns;
}

/**
 * Rebuild the Edit Item form to show ONLY the visible table columns
 * Dynamically recreates form content
 */
function rebuildEditFormForVisibleColumns(visibleColumns) {
    const formContainer = document.getElementById('editItemForm');
    if (!formContainer) return;
    
    // Clear existing form fields
    const formGroups = formContainer.querySelectorAll('.form-group');
    formGroups.forEach(group => group.remove());
    
    console.log('🔄 Rebuilding form with columns:', visibleColumns);
    
    // Recreate form groups for each visible column
    visibleColumns.forEach(columnName => {
        const config = columnFieldMapping[columnName];
        if (!config) {
            console.warn('⚠️ No config found for column:', columnName);
            return;
        }
        
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', config.editFieldId);
        label.textContent = columnName + ':';
        formGroup.appendChild(label);
        
        if (config.type === 'select') {
            // Create select element
            const select = document.createElement('select');
            select.id = config.editFieldId;
            select.required = config.required || false;
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `-- Select ${columnName} --`;
            select.appendChild(defaultOption);
            
            // Add options based on column type
            let options = [];
            
            if (columnName === 'Month') {
                options = [
                    { value: '01', text: 'January' }, { value: '02', text: 'February' },
                    { value: '03', text: 'March' }, { value: '04', text: 'April' },
                    { value: '05', text: 'May' }, { value: '06', text: 'June' },
                    { value: '07', text: 'July' }, { value: '08', text: 'August' },
                    { value: '09', text: 'September' }, { value: '10', text: 'October' },
                    { value: '11', text: 'November' }, { value: '12', text: 'December' }
                ];
            } else if (columnName === 'Status') {
                options = ['On-going', 'Completed', 'Hold', 'Cancelled'].map(opt => ({ value: opt, text: opt }));
            } else if (columnName === 'Payment Terms' || columnName === 'Terms of Payment') {
                options = ['COD', 'Net 15', 'Net 30', 'Net 60', 'Net 90'].map(opt => ({ value: opt, text: opt }));
            }
            
            // Add all options to select
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = typeof opt === 'string' ? opt : opt.value;
                option.textContent = typeof opt === 'string' ? opt : opt.text;
                select.appendChild(option);
            });
            
            formGroup.appendChild(select);
            console.log('✅ Added SELECT field:', columnName, '(' + config.editFieldId + ') with', options.length, 'options');
        } else {
            // Create input element
            const input = document.createElement('input');
            input.id = config.editFieldId;
            input.type = config.type || 'text';
            if (config.step) input.step = config.step;
            if (config.readonly) input.readOnly = true;
            if (config.required) input.required = true;
            formGroup.appendChild(input);
            console.log('✅ Added INPUT field:', columnName, '(' + config.editFieldId + ') type=' + input.type);
        }
        
        formContainer.appendChild(formGroup);
    });
    
    console.log('✅ Form rebuild complete');
}

// Close Edit Item Modal
function closeEditItemModal() {
    document.getElementById('editItemModal').style.display = 'none';
    document.getElementById('editItemForm').reset();
    localStorage.removeItem('editingItemIndex');
    localStorage.removeItem('editingProjectId');
    console.log('❌ Edit Item modal closed');
}

// Calculate Payment Terms Countdown
function calculatePaymentTermsCountdown(deliveryDate, paymentTerms, paidAmount, forceCountdown = false) {
    // Extract number of days from payment terms (e.g., "Net 30" -> 30)
    // First check if any payment has been made
    if (!forceCountdown && (paidAmount === 0 || paidAmount === undefined)) {
        return { daysRemaining: null, status: 'Not Yet Paid', color: '#a0a0a0' };
    }
    
    // If payment is made but no delivery date, show payment status
    if (!deliveryDate || !paymentTerms) {
        if (forceCountdown) {
            return { daysRemaining: null, status: '-', color: '#a0a0a0' };
        }
        return { daysRemaining: null, status: 'Payment received', color: '#1dd1a1' };
    }
    
    let daysToAdd = 0;
    
    if (paymentTerms === 'COD') {
        // Cash on Delivery - due on delivery date
        daysToAdd = 0;
    } else if (paymentTerms.includes('Net')) {
        const match = paymentTerms.match(/\d+/);
        daysToAdd = match ? parseInt(match[0]) : 0;
    }
    
    try {
        const delivery = new Date(deliveryDate);
        const dueDate = new Date(delivery);
        dueDate.setDate(dueDate.getDate() + daysToAdd);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        
        const timeDiff = dueDate - today;
        const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        let status = '';
        let color = '';
        
        if (daysRemaining > 7) {
            status = `${daysRemaining} days remaining`;
            color = '#1dd1a1'; // Green - plenty of time
        } else if (daysRemaining > 0) {
            status = `${daysRemaining} days remaining`;
            color = '#ffa500'; // Orange - due soon
        } else if (daysRemaining === 0) {
            status = 'Due Today';
            color = '#ff6b6b'; // Red - due today
        } else {
            status = `${Math.abs(daysRemaining)} days Overdue`;
            color = '#ff1744'; // Dark red - overdue
        }
        
        return { daysRemaining, status, color };
    } catch (e) {
        console.warn('⚠️ Could not calculate payment terms countdown:', e);
        return { daysRemaining: null, status: 'Invalid Date', color: '#a0a0a0' };
    }
}

// Calculate Edit Payment Amount (Received Quantity × Unit Price)
function calculateEditPaymentAmount() {
    try {
        const receivedQtyEl = document.getElementById('editReceivedQuantity');
        const unitPriceEl = document.getElementById('editUnitPrice');
        const paymentAmountEl = document.getElementById('editPaymentAmount');
        
        if (receivedQtyEl && unitPriceEl && paymentAmountEl) {
            const receivedQty = parseFloat(receivedQtyEl.value || 0);
            const unitPrice = parseFloat(unitPriceEl.value || 0);
            const paymentAmount = receivedQty * unitPrice;
            paymentAmountEl.value = paymentAmount.toFixed(2);
            console.log('✅ Payment Amount calculated:', paymentAmount.toFixed(2));
            
            // Recalculate remaining payable after payment amount changes
            calculateEditItemRemainingPayable();
            
            // Auto-update delivery status based on received quantity
            autoUpdateDeliveryStatus();
        }
    } catch (e) {
        console.warn('⚠️ Could not calculate payment amount:', e);
    }
}

// Auto-update delivery status based on received quantity
function autoUpdateDeliveryStatus() {
    try {
        const quantityEl = document.getElementById('editQuantity');
        const receivedQtyEl = document.getElementById('editReceivedQuantity');
        const statusEl = document.getElementById('editStatus');
        
        if (quantityEl && receivedQtyEl && statusEl) {
            const quantity = parseFloat(quantityEl.value || 0);
            const receivedQty = parseFloat(receivedQtyEl.value || 0);
            
            // Only auto-update delivery status if status is not "Cancelled"
            if (statusEl.value.toLowerCase() !== 'cancelled') {
                let autoDeliveryStatus = 'PENDING';
                
                if (receivedQty > 0) {
                    if (receivedQty >= quantity && quantity > 0) {
                        autoDeliveryStatus = 'FULLY RECEIVED';
                    } else if (receivedQty < quantity) {
                        autoDeliveryStatus = 'PARTIALLY RECEIVED';
                    }
                }
                
                console.log(`📦 Auto-updating delivery status: Qty=${quantity}, Received=${receivedQty} => ${autoDeliveryStatus}`);
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not auto-update delivery status:', e);
    }
}

// Save Edit Item Record
function saveEditItemRecord(event) {
    event.preventDefault();

    // CRITICAL: Validate dynamic form fields
    if (!validateDynamicFormFields()) {
        return;
    }

    const itemIndex = localStorage.getItem('editingItemIndex');
    const projectId = localStorage.getItem('editingProjectId');
    const currentProjectId = localStorage.getItem('currentProjectId');

    if (itemIndex === null && !currentProjectId) {
        alert('❌ No item selected for editing');
        return;
    }

    // Collect data from enabled/visible form fields only
    const itemData = collectDynamicFormData(true);
    console.log('📝 Saving item data:', itemData);

    // Automatically calculate Remaining Payable = Total Amount - Paid Amount
    itemData.remainingPayable = itemData.totalAmount - itemData.paidAmount;

    // Disable submit button to prevent double submission
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    (async function() {
        try {
            // Get existing projects
            const projects = await getProjects();
            const actualProjectId = projectId || currentProjectId;
            const projectIndex = projects.findIndex(p => p.id === actualProjectId);

            if (projectIndex === -1) {
                alert('❌ Project not found');
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
                return;
            }

            const project = projects[projectIndex];
            const actualItemIndex = parseInt(itemIndex);

            // Get the old item data for comparison
            const oldItemData = project.items[actualItemIndex];
            const oldReceivedQty = parseFloat(oldItemData?.receivedQty || 0);
            const oldPaidAmount = parseFloat(oldItemData?.paidAmount || 0);
            const newPaidAmount = parseFloat(itemData.paidAmount || 0);
            const oldStatus = oldItemData?.status || 'On-going';
            const oldDeliveryStatus = oldItemData?.deliveryStatus || 'PENDING';
            const oldPaymentStatus = oldItemData?.paymentStatus || 'UNPAID';

            // **NEW: Track payment history if paid amount changed**
            // First, initialize or preserve existing payment history from oldItemData
            if (!itemData.paymentHistory) {
                itemData.paymentHistory = [];
            }
            
            // Copy existing payment history from oldItemData if present
            if (oldItemData?.paymentHistory && Array.isArray(oldItemData.paymentHistory) && oldItemData.paymentHistory.length > 0) {
                // Only copy if we don't already have history (preserve what might be in itemData)
                if (itemData.paymentHistory.length === 0) {
                    itemData.paymentHistory = [...oldItemData.paymentHistory];
                    console.log('📋 Preserved payment history from old item:', itemData.paymentHistory.length, 'records');
                }
            }

            // Now add a NEW payment record if the paid amount changed
            if (newPaidAmount !== oldPaidAmount) {
                // Only add record if new paid amount is different and greater than 0
                if (newPaidAmount > 0) {
                    // Add new payment record for the paid amount
                    const today = new Date();
                    const paymentRecord = {
                        date: today.toISOString().split('T')[0],
                        amount: newPaidAmount,
                        timestamp: today.toISOString()
                    };
                    
                    itemData.paymentHistory.push(paymentRecord);
                    
                    console.log('✅ Payment history updated:', {
                        oldPaidAmount: oldPaidAmount,
                        newPaidAmount: newPaidAmount,
                        paymentRecord: paymentRecord,
                        totalHistoryRecords: itemData.paymentHistory.length,
                        allRecords: JSON.stringify(itemData.paymentHistory)
                    });
                }
            }

            // Update the item in array
            projects[projectIndex].items[actualItemIndex] = itemData;

            console.log('💾 Item before update:', JSON.stringify(projects[projectIndex].items[actualItemIndex]));
            console.log('💾 Updating item in database:', itemIndex);
            console.log('💾 P.O Date being saved:', itemData.poDate);

            // Update the project in database
            const updateResult = await updateProjectRecord(actualProjectId, project);
            console.log('✅ Item updated in database, result:', updateResult);
            console.log('✅ Verification - Item after update:', JSON.stringify(projects[projectIndex].items[actualItemIndex]));

            // Refresh the project details table
            viewProjectDetails(actualProjectId);

            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'MATERIAL',
                    action: 'UPDATE',
                    details: `Updated material: ${itemData.specification} (P.O: ${itemData.poNumber})`,
                    moduleName: 'PURCHASING',
                    recordId: actualProjectId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            // Refresh tracking table if it's visible
            refreshTrackingTableData();

            showNotification('Item updated successfully!', 'success');
            closeEditItemModal();
            localStorage.removeItem('editingItemIndex');
            localStorage.removeItem('editingProjectId');

        } catch (error) {
            console.error('❌ Error updating item:', error);
            showNotification('Error updating item: ' + error.message, 'error');
        } finally {
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    })();
}

// Delete Project Item
function deleteProjectItem(index) {
    const currentProjectId = localStorage.getItem('currentProjectId');
    if (!currentProjectId) {
        alert('❌ No project selected');
        return;
    }

    // Store the index for confirmation
    window.pendingDeleteItemIndex = index;
    window.pendingDeleteItemProjectId = currentProjectId;

    // Show confirmation modal
    const confirmationMessage = 'Are you sure you want to delete this item?';
    document.getElementById('confirmationMessage').textContent = confirmationMessage;
    document.getElementById('deleteConfirmationModal').style.display = 'flex';

    // Change button actions for item delete
    const yesBtn = document.querySelector('.btn-yes');
    const noBtn = document.querySelector('.btn-no');

    // Remove old event listeners and add new ones
    const newYesBtn = yesBtn.cloneNode(true);
    const newNoBtn = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    noBtn.parentNode.replaceChild(newNoBtn, noBtn);

    newYesBtn.onclick = function() {
        confirmDeleteProjectItem();
    };
    newNoBtn.onclick = function() {
        cancelDeleteProjectItem();
    };
}

// Confirm delete project item
function confirmDeleteProjectItem() {
    const itemIndex = window.pendingDeleteItemIndex;
    const projectId = window.pendingDeleteItemProjectId;

    if (itemIndex === undefined || !projectId) {
        document.getElementById('deleteConfirmationModal').style.display = 'none';
        return;
    }

    // Get the table row and fade it out immediately (optimistic delete)
    const tableBody = document.getElementById('projectDetailsTableBody');
    if (tableBody && tableBody.children[itemIndex]) {
        const row = tableBody.children[itemIndex];
        row.style.opacity = '0.5';
        row.style.pointerEvents = 'none';
        console.log('⏳ Item row marked for deletion:', itemIndex);
    }

    // Delete from database
    (async function() {
        try {
            // Get current project
            const projects = await getProjects();
            const projectIndex = projects.findIndex(p => p.id === projectId);

            if (projectIndex === -1) {
                alert('❌ Project not found');
                document.getElementById('deleteConfirmationModal').style.display = 'none';
                return;
            }

            const project = projects[projectIndex];
            if (!project.items || !project.items[itemIndex]) {
                showNotification('Item not found', 'error');
                document.getElementById('deleteConfirmationModal').style.display = 'none';
                return;
            }

            // Get item name for logging
            const itemName = project.items[itemIndex].itemNumber || 'Unknown Item';
            console.log('🗑️ Deleting item from database:', itemName);

            // Remove item from array
            project.items.splice(itemIndex, 1);

            // Update project in database
            await updateProjectRecord(projectId, project);
            console.log('✅ Item deleted from database');

            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'MATERIAL',
                    action: 'DELETE',
                    details: `Deleted material: ${itemName}`,
                    moduleName: 'PURCHASING',
                    recordId: projectId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            // Remove the row from table with animation
            const tableBody = document.getElementById('projectDetailsTableBody');
            if (tableBody && tableBody.children[itemIndex]) {
                const row = tableBody.children[itemIndex];
                row.style.transition = 'all 0.3s ease';
                row.style.opacity = '0';
                row.style.height = '0';

                // Actually remove from DOM after animation
                setTimeout(() => {
                    if (row.parentNode) {
                        row.parentNode.removeChild(row);
                        console.log('✅ Item row removed from table');
                    }
                }, 300);
            }

            document.getElementById('deleteConfirmationModal').style.display = 'none';

            // Refresh tracking table if it's visible
            refreshTrackingTableData();
            
            showNotification('Item deleted successfully!', 'success');

        } catch (error) {
            console.error('❌ Error deleting item:', error);
            showNotification('Error deleting item: ' + error.message, 'error');

            // Restore the row if deletion failed
            const tableBody = document.getElementById('projectDetailsTableBody');
            if (tableBody && tableBody.children[itemIndex]) {
                const row = tableBody.children[itemIndex];
                row.style.opacity = '1';
                row.style.pointerEvents = 'auto';
            }

            document.getElementById('deleteConfirmationModal').style.display = 'none';
        }

        // Clear pending values
        window.pendingDeleteItemIndex = undefined;
        window.pendingDeleteItemProjectId = null;
    })();
}

// Cancel delete project item
function cancelDeleteProjectItem() {
    window.pendingDeleteItemIndex = undefined;
    window.pendingDeleteItemProjectId = null;
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}

// Save Item Record
function saveItemRecord(event) {
    event.preventDefault();

    // CRITICAL: Validate dynamic form fields
    if (!validateDynamicFormFields()) {
        return;
    }

    const currentProjectId = localStorage.getItem('currentProjectId');
    const editingItemIndex = localStorage.getItem('editingItemIndex');

    if (!currentProjectId) {
        alert('❌ No project selected');
        return;
    }

    // CHANGED: Collect data from enabled/visible form fields only
    const itemData = collectDynamicFormData(false);

    // Delivery Date field removed; no fallback required

    console.log('📝 Item data being saved:', itemData);
    // Automatically calculate Remaining Payable = Total Amount - Paid Amount
    itemData.remainingPayable = itemData.totalAmount - itemData.paidAmount;

    // **NEW: Initialize payment history for new items**
    // If this is a new item (not editing) and has a paid amount, create initial payment record
    if (!editingItemIndex && parseFloat(itemData.paidAmount || 0) > 0) {
        if (!itemData.paymentHistory) {
            itemData.paymentHistory = [];
        }
        const today = new Date();
        const initialPaymentRecord = {
            date: today.toISOString().split('T')[0],
            amount: parseFloat(itemData.paidAmount),
            timestamp: today.toISOString()
        };
        itemData.paymentHistory.push(initialPaymentRecord);
        console.log('✅ Initial payment history created for new item:', initialPaymentRecord);
    }

    console.log('📝 Item data to be saved:', JSON.stringify(itemData));
    console.log('🔍 P.O Date in itemData:', itemData.poDate);
    (async function() {
        try {
            // Get existing projects
            const projects = await getProjects();
            const projectIndex = projects.findIndex(p => p.id === currentProjectId);

            if (projectIndex === -1) {
                showNotification('Project not found', 'error');
                return;
            }

            // Initialize items array if it doesn't exist
            if (!projects[projectIndex].items) {
                projects[projectIndex].items = [];
            }

            // Add or update the item
            if (editingItemIndex !== null && editingItemIndex !== undefined && editingItemIndex !== '') {

                // Update existing item
                projects[projectIndex].items[parseInt(editingItemIndex)] = itemData;
                localStorage.removeItem('editingItemIndex');
            } else {
                // Add new item
                projects[projectIndex].items.push(itemData);
            }

            // Update the project
            await updateProjectRecord(currentProjectId, projects[projectIndex]);

            // Log activity
            try {
                const actionType = editingItemIndex ? 'UPDATE' : 'CREATE';
                const actionText = editingItemIndex ? 'Updated' : 'Added';
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'MATERIAL',
                    action: actionType,
                    details: `${actionText} material: ${itemData.specification} (P.O: ${itemData.poNumber})`,
                    moduleName: 'PURCHASING',
                    recordId: currentProjectId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            // Refresh the project details table
            viewProjectDetails(currentProjectId);

            // Refresh tracking table if it's visible
            refreshTrackingTableData();

            const message = editingItemIndex ? 'Item updated successfully!' : 'Item added successfully!';
            showNotification(message, 'success');
            closeAddItemModal();

        } catch (error) {
            console.error('❌ Error saving item:', error);
            showNotification('Error saving item: ' + error.message, 'error');
        }
    })();
}

// Calculate P.O Balance Qty automatically
function calculatePOBalanceQty() {
    const poQtyInput = document.getElementById('addPOQty');
    const receivedQtyInput = document.getElementById('addReceivedQty');
    const balanceQtyInput = document.getElementById('addPOBalanceQty');

    const poQty = parseFloat(poQtyInput.value) || 0;
    const receivedQty = parseFloat(receivedQtyInput.value) || 0;
    const balanceQty = poQty - receivedQty;

    // Set the balance qty value
    balanceQtyInput.value = balanceQty.toFixed(2);

    console.log(`📊 P.O Balance Qty calculated: ${poQty} - ${receivedQty} = ${balanceQty.toFixed(2)}`);
}

// Calculate Remaining Payable automatically
function calculateRemainingPayable() {
    const poAmountInput = document.getElementById('addPOAmount');
    const paidAmountInput = document.getElementById('addPaidAmount');
    const remainingPayableInput = document.getElementById('addRemainingPayable');

    const poAmount = parseFloat(poAmountInput.value) || 0;
    const paidAmount = parseFloat(paidAmountInput.value) || 0;
    const remainingPayable = poAmount - paidAmount;

    // Set the remaining payable value
    remainingPayableInput.value = remainingPayable.toFixed(2);

    console.log(`💰 Remaining Payable calculated: ${poAmount} - ${paidAmount} = ${remainingPayable.toFixed(2)}`);
}

// ============================================================
// CACHING & DATA LOADING
// ============================================================

// Cache for projects and tracking data
let projectsCache = null;
let trackingCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 20000; // 20 seconds cache
let paymentAlertsData = []; // Store alert data for modal display
let paymentAlertsFilter = 'all'; // Current filter in modal

// Pre-load data on page load for instant display
async function preLoadAllData() {
    console.log('⚡ Pre-loading all data in background...');

    // Load projects table column settings
    loadProjectsTableColumnSettings();

    // Display cached project count IMMEDIATELY if available
    const cachedProjectCount = localStorage.getItem('cachedProjectCount');
    if (cachedProjectCount) {
        const totalProjectsElement = document.getElementById('totalProjectsCount');
        if (totalProjectsElement) {
            totalProjectsElement.textContent = cachedProjectCount;
            console.log('⚡ Displaying cached project count:', cachedProjectCount);
        }
    }

    // Try to restore chart from cache if available
    const cachedChartData = localStorage.getItem('cachedChartData');
    if (cachedChartData) {
        try {
            const chartData = JSON.parse(cachedChartData);
            console.log('⚡ Restoring chart from cache');
            renderCachedChart(chartData);
        } catch (error) {
            console.warn('⚠️ Could not parse cached chart data:', error);
        }
    }

    // Pre-load projects and tracking records in parallel and wait for both to complete
    try {
        await Promise.all([
            // Load projects
            (async function() {
                try {
                    console.log('📊 Loading projects from Firebase...');
                    const projects = await getProjects();
                    console.log('✅ Projects loaded:', projects.length);
                    projectsCache = projects;
                    cacheTimestamp = Date.now();
                    console.log('✅ Projects pre-loaded:', projects.length);

                    // Cache the count in localStorage for next page load
                    localStorage.setItem('cachedProjectCount', projects.length.toString());

                    // Cache chart data for instant display on next load
                    cacheChartData(projects);

                    // Update Total Projects count on dashboard (only projects added via Purchases)
                    updateTotalProjectsCount(projects.filter(p => p.purchasingIncluded));
                } catch (error) {
                    console.error('❌ Error pre-loading projects:', error);
                }
            })(),

            // Load tracking records
            (async function() {
                try {
                    console.log('📊 Loading tracking records...');
                    const records = await getAllProjectItems();
                    trackingCache = records;
                    cacheTimestamp = Date.now();
                    console.log('✅ Tracking records pre-loaded:', records.length);
                    
                    // Render top suppliers chart with tracking data
                    renderTopSuppliersChart(records);
                } catch (error) {
                    console.error('❌ Error pre-loading tracking:', error);
                }
            })()
        ]);
        console.log('✅ All critical data pre-loaded - ready to display dashboard');
    } catch (error) {
        console.error('❌ Error during data pre-loading:', error);
    }
}

// Load Projects from Database with caching and fast rendering
function loadProjects() {
    (async function() {
        try {
            console.log('📊 Loading projects from Firebase...');
            const now = Date.now();

            // Load column settings at startup
            loadProjectsTableColumnSettings();

            // Use cache immediately
            if (projectsCache) {
                console.log('⚡⚡ Using cached projects - rendering instantly');
                renderProjectsTableFast(projectsCache);
                updateTotalProjectsCount(projectsCache.filter(p => p.purchasingIncluded));

                // Refresh cache in background if expired
                if ((now - cacheTimestamp) >= CACHE_DURATION) {
                    console.log('🔄 Refreshing projects cache in background...');
                    const projects = await getProjects();
                    projectsCache = projects;
                    cacheTimestamp = now;
                    updateTotalProjectsCount(projects.filter(p => p.purchasingIncluded));
                }
            } else {
                // First load - fetch and render
                const projects = await getProjects();
                projectsCache = projects;
                cacheTimestamp = now;
                renderProjectsTableFast(projects);
                updateTotalProjectsCount(projects.filter(p => p.purchasingIncluded));
            }
            
            // Apply column visibility after rendering
            applyProjectsTableColumnVisibility();
        } catch (error) {
            console.error('❌ Error loading projects:', error);
        }
    })();
}

// Update Total Projects Count on Dashboard
function updateTotalProjectsCount(projects) {
    const totalProjectsElement = document.getElementById('totalProjectsCount');
    if (totalProjectsElement) {
        const projectCount = projects.length;
        totalProjectsElement.textContent = projectCount;
        console.log(`✅ Dashboard: Total Projects updated to ${projectCount}`);
    }

    // Update materials spent
    calculateTotalMaterialsSpent(projects);

    // Update pie chart with new data
    updateProjectsTradeChart(projects);

    // Update top suppliers chart
    updateTopSuppliersChart();

    // Update payment alerts
    updatePaymentAlerts(projects);
}

// Update Payment Alerts with items that have payment terms ending soon or overdue
function updatePaymentAlerts(projects) {
    const alertsCountElement = document.getElementById('paymentAlertsCount');
    const alertsListElement = document.getElementById('paymentAlertsList');
    
    if (!alertsCountElement || !alertsListElement) {
        console.warn('⚠️ Payment alerts elements not found');
        return;
    }

    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Scan all projects and items for payment alerts
    if (projects && Array.isArray(projects)) {
        projects.forEach(project => {
            if (!project.items || !Array.isArray(project.items)) return;

            project.items.forEach((item, itemIdx) => {
                const itemNumber = item.itemNumber || item.itemCode || `Item ${itemIdx + 1}`;
                const deliveryDate = item.deliveryDate ? new Date(item.deliveryDate) : null;
                const paymentTerms = item.paymentTerms || item.paymentTermsString || 'COD';
                const paidAmount = parseFloat(item.paidAmount || 0);
                const remainingPayable = parseFloat(item.remainingPayable || item.totalAmount - paidAmount || 0);
                const totalAmount = parseFloat(item.totalAmount || 0);
                const vendor = item.vendor || item.bestSupplier || 'Unknown';
                const poNumber = item.poNumber || item.poNo || '-';

                // Skip if fully paid or no delivery date
                if (remainingPayable <= 0 || !deliveryDate) return;

                // Calculate due date based on payment terms
                let daysToAdd = 0;
                if (paymentTerms === 'COD') {
                    daysToAdd = 0;
                } else if (paymentTerms.includes('Net')) {
                    const match = paymentTerms.match(/\d+/);
                    daysToAdd = match ? parseInt(match[0]) : 0;
                }

                const dueDate = new Date(deliveryDate);
                dueDate.setDate(dueDate.getDate() + daysToAdd);
                dueDate.setHours(0, 0, 0, 0);

                // Calculate days remaining
                const timeDiff = dueDate - today;
                const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

                // Create alert if payment terms ending soon (within 7 days) or overdue
                if (daysRemaining <= 7) {
                    const status = daysRemaining < 0 ? 'overdue' : 'dueSoon';
                    const daysText = daysRemaining < 0 
                        ? `${Math.abs(daysRemaining)} days overdue`
                        : `${daysRemaining} days remaining`;

                    alerts.push({
                        projectId: project.id,
                        projectName: project.projectName || '-',
                        itemNumber: itemNumber,
                        itemIndex: itemIdx,
                        poNumber: poNumber,
                        vendor: vendor,
                        deliveryDate: deliveryDate,
                        daysRemaining: daysRemaining,
                        remainingPayable: remainingPayable,
                        totalAmount: totalAmount,
                        paidAmount: paidAmount,
                        status: status,
                        daysText: daysText
                    });
                }
            });
        });
    }

    // Store alerts globally for modal use
    paymentAlertsData = alerts;

    // Sort alerts by days remaining (overdue first)
    alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Update count
    alertsCountElement.textContent = alerts.length;

    // Clear previous alerts
    alertsListElement.innerHTML = '';

    // Do not display alert items in the card - only show count
    // Users can view details in the modal by clicking the card

    console.log(`✅ Payment Alerts updated: ${alerts.length} alerts found`);
}

// Open Payment Alerts Modal
function openPaymentAlertsModal() {
    const modal = document.getElementById('paymentAlertsDetailsModal');
    if (!modal) {
        console.error('❌ Payment alerts modal not found');
        return;
    }

    // Reset filter to 'all'
    paymentAlertsFilter = 'all';

    // Update tab counts
    updateAlertTabCounts();

    // Render all alerts initially
    renderPaymentAlertsInModal();

    // Show modal
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';

    console.log('✅ Payment Alerts Modal opened');
}

// Close Payment Alerts Modal
function closePaymentAlertsModal() {
    const modal = document.getElementById('paymentAlertsDetailsModal');
    if (modal) {
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
}

// Update alert tab counts
function updateAlertTabCounts() {
    const allAlerts = paymentAlertsData.length;
    const overdueAlerts = paymentAlertsData.filter(a => a.status === 'overdue').length;
    const dueSoonAlerts = paymentAlertsData.filter(a => a.status === 'dueSoon').length;

    const countAllEl = document.getElementById('countAllAlerts');
    const countOverdueEl = document.getElementById('countOverdue');
    const countDueSoonEl = document.getElementById('countDueSoon');

    if (countAllEl) countAllEl.textContent = allAlerts;
    if (countOverdueEl) countOverdueEl.textContent = overdueAlerts;
    if (countDueSoonEl) countDueSoonEl.textContent = dueSoonAlerts;
}

// Filter Payment Alerts
function filterPaymentAlerts(filterType) {
    paymentAlertsFilter = filterType;

    // Update tab highlights
    document.getElementById('alertTabAll').style.background = filterType === 'all' ? 'rgba(10, 155, 3, 0.35)' : 'rgba(10, 155, 3, 0.2)';
    document.getElementById('alertTabOverdue').style.background = filterType === 'overdue' ? 'rgba(255, 27, 68, 0.25)' : 'rgba(255, 27, 68, 0.15)';
    document.getElementById('alertTabDueSoon').style.background = filterType === 'dueSoon' ? 'rgba(255, 149, 0, 0.25)' : 'rgba(255, 149, 0, 0.15)';

    // Re-render modal
    renderPaymentAlertsInModal();
}

// Render Payment Alerts in Modal
function renderPaymentAlertsInModal() {
    const container = document.getElementById('paymentAlertsListContainer');
    const emptyState = document.getElementById('alertsEmptyState');

    if (!container || !emptyState) {
        console.error('❌ Alert modal container elements not found');
        return;
    }

    // Filter alerts based on selected filter
    let filteredAlerts = paymentAlertsData;
    if (paymentAlertsFilter === 'overdue') {
        filteredAlerts = paymentAlertsData.filter(a => a.status === 'overdue');
    } else if (paymentAlertsFilter === 'dueSoon') {
        filteredAlerts = paymentAlertsData.filter(a => a.status === 'dueSoon');
    }

    // Clear container
    container.innerHTML = '';

    if (filteredAlerts.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    container.style.display = 'flex';
    emptyState.style.display = 'none';

    // Render each alert as a card
    filteredAlerts.forEach(alert => {
        const alertCard = document.createElement('div');
        alertCard.className = 'alert-item-card';

        const statusBadgeClass = alert.status === 'overdue' ? 'alert-status-overdue' : 'alert-status-dueSoon';
        const statusText = alert.status === 'overdue' ? 'OVERDUE' : 'DUE SOON';

        alertCard.innerHTML = `
            <div class="alert-item-header">
                <div>
                    <h3 class="alert-item-title">${alert.itemNumber}</h3>
                    <p class="alert-item-subtitle">Item 1, P.O. ${alert.poNumber}</p>
                </div>
                <span class="alert-status-badge ${statusBadgeClass}">${statusText}</span>
            </div>

            <div class="alert-item-info">
                <div class="alert-info-section">
                    <label class="alert-info-label">Days Remaining</label>
                    <div class="alert-info-value warning">${alert.daysText}</div>
                </div>
                <div class="alert-info-section">
                    <label class="alert-info-label">Amount Remaining</label>
                    <div class="alert-info-value amount">₱${alert.remainingPayable.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                </div>
                <div class="alert-info-section">
                    <label class="alert-info-label">Vendor</label>
                    <div class="alert-info-value">${alert.vendor.toUpperCase()}</div>
                </div>
            </div>

            <div class="alert-item-actions">
                <button class="alert-action-btn btn-primary" onclick="handleViewProjectFromAlert('${alert.projectId}')">
                    <i class="fa-solid fa-eye"></i>View Project
                </button>
                <button class="alert-action-btn btn-secondary" onclick="handlePaymentDetailsFromAlert(${alert.itemIndex}, '${alert.projectId}')">
                    <i class="fa-solid fa-credit-card"></i>Payment Details
                </button>
            </div>
        `;

        container.appendChild(alertCard);
    });

    console.log(`✅ Rendered ${filteredAlerts.length} alerts in modal`);
}

// Handle View Project from Alert
function handleViewProjectFromAlert(projectId) {
    console.log('📌 Viewing project:', projectId);
    viewProjectDetails(projectId);
    closePaymentAlertsModal();
}

// Handle Payment Details from Alert
function handlePaymentDetailsFromAlert(itemIndex, projectId) {
    console.log('💳 Opening payment details for item:', itemIndex, 'in project:', projectId);
    localStorage.setItem('currentProjectId', projectId);
    
    // Fetch the project and get the item
    (async function() {
        try {
            const projects = await getProjects();
            const project = projects.find(p => p.id === projectId);
            
            if (project && project.items && project.items[itemIndex]) {
                // Set up the pagination state for the modal
                projectDetailsTablePaginationState.allItems = project.items;
                projectDetailsTablePaginationState.totalRows = project.items.length;
                
                // Open payment details modal
                openPaymentDetailsModal(itemIndex);
                closePaymentAlertsModal();
            }
        } catch (error) {
            console.error('❌ Error fetching project for payment details:', error);
        }
    })();
}

// Calculate Total Materials Spent from all projects
function calculateTotalMaterialsSpent(projects) {
    let totalSpent = 0;

    if (projects && Array.isArray(projects)) {
        projects.forEach(project => {
            // Sum all items' paid amounts in each project
            if (project.items && Array.isArray(project.items)) {
                project.items.forEach(item => {
                    const paidAmount = parseFloat(item.paidAmount || 0);
                    totalSpent += paidAmount;
                });
            }
        });
    }

    // Update the dashboard card
    const materialSpentElement = document.getElementById('materialSpentAmount');
    if (materialSpentElement) {
        materialSpentElement.textContent = '₱' + totalSpent.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        console.log(`✅ Dashboard: Materials Spent updated to ₱${totalSpent.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    }
}

// Update Projects by Trade Pie Chart
function updateProjectsTradeChart(projects) {
    const ctx = document.getElementById('projectsTradeChart');
    if (!ctx) {
        console.log('⚠️ Chart canvas not found - will initialize on next dashboard load');
        return;
    }

    // Count projects by trade
    const tradeData = {};
    const tradeColors = {
        'Civil Structure': '#FF6384',
        'Architectural': '#36A2EB',
        'Electrical': '#FFCE56',
        'MEFPS': '#4BC0C0',
        'Auxillary': '#9966FF',
        'Fabrication': '#FF9F40',
        'Labor': '#C9CBCF',
        'GENREQ': '#FF6384'
    };

    // Aggregate projects by trade
    projects.forEach(project => {
        const projectTrades = Array.isArray(project.trades) ? project.trades : (project.trade ? [project.trade] : ['Unassigned']);
        projectTrades.forEach(trade => {
            const tradeName = trade || 'Unassigned';
            tradeData[tradeName] = (tradeData[tradeName] || 0) + 1;
        });
    });

    const trades = Object.keys(tradeData);
    const counts = Object.values(tradeData);
    const colors = trades.map(trade => tradeColors[trade] || '#' + Math.floor(Math.random()*16777215).toString(16));

    console.log('📊 Chart data:', { trades, counts, colors });
    // Destroy existing chart if it exists
    if (window.projectsTradeChartInstance) {
        window.projectsTradeChartInstance.destroy();
        console.log('🗑️ Destroyed previous chart');
    }

    // Create new pie chart
    window.projectsTradeChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: trades.length > 0 ? trades : ['No Data'],
            datasets: [{
                label: 'Projects by Trade',
                data: counts.length > 0 ? counts : [1],
                backgroundColor: colors,
                borderColor: 'rgba(0, 0, 0, 0.2)',
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e0e0e0',
                        font: {
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                            size: 12,
                            weight: '500'
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#0a9b03',
                    bodyColor: '#e0e0e0',
                    borderColor: '#0a9b03',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    console.log('✅ Projects by Trade pie chart updated');
}

// Cache chart data to localStorage for instant display on next load
function cacheChartData(projects) {
    try {
        // Count projects by trade
        const tradeData = {};
        projects.forEach(project => {
            const trade = Array.isArray(project.trades) ? project.trades.join(', ') : (project.trade || 'Unassigned');
            tradeData[trade] = (tradeData[trade] || 0) + 1;
        });
        const chartData = {
            trades: Object.keys(tradeData),
            counts: Object.values(tradeData),
            timestamp: Date.now()
        };
        localStorage.setItem('cachedChartData', JSON.stringify(chartData));
        console.log('💾 Chart data cached to localStorage');
    } catch (error) {
        console.warn('⚠️ Could not cache chart data:', error);
    }
}

// Render chart immediately from cached data (no async wait)
function renderCachedChart(chartData) {
    const ctx = document.getElementById('projectsTradeChart');
    if (!ctx) {
        console.log('⚠️ Chart canvas not yet available');
        return;
    }

    initializeChartFromCache(chartData);
}

// Initialize chart from cache (fastest possible rendering)
function initializeChartFromCache(chartData) {
    const ctx = document.getElementById('projectsTradeChart');
    if (!ctx) {
        console.log('⚠️ Chart canvas element not found');
        return;
    }

    // Pre-defined colors for trades
    const tradeColors = {
        'Civil Structure': '#FF6384',
        'Architectural': '#36A2EB',
        'Electrical': '#FFCE56',
        'MEFPS': '#4BC0C0',
        'Auxillary': '#9966FF',
        'Fabrication': '#FF9F40',
        'Labor': '#C9CBCF',
        'GENREQ': '#FF6384',
        'Unassigned': '#95a5a6'
    };  

    const trades = chartData.trades || [];
    const counts = chartData.counts || [];
    const colors = trades.map(trade => tradeColors[trade] || '#' + Math.floor(Math.random()*16777215).toString(16));

    console.log('⚡⚡ Rendering chart from cache instantly');

    // Destroy existing chart if it exists (non-blocking)
    if (window.projectsTradeChartInstance) {
        try {
            window.projectsTradeChartInstance.destroy();
        } catch (e) {
            // Ignore destruction errors
        }
    }       

    // Create chart with cached data
    try {
        window.projectsTradeChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: trades.length > 0 ? trades : ['No Data'],
                datasets: [{
                    label: 'Projects by Trade',
                    data: counts.length > 0 ? counts : [1],
                    backgroundColor: colors,
                    borderColor: 'rgba(0, 0, 0, 0.2)',
                    borderWidth: 2,
                    hoverOffset: 10
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300  // Faster animation
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e0e0e0',
                            font: {
                                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                                size: 12,
                                weight: '500'
                            },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#0a9b03',
                        bodyColor: '#e0e0e0',
                        borderColor: '#0a9b03',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });   
        console.log('✅ Chart rendered from cache at maximum speed');
    } catch (error) {
        console.error('⚠️ Error creating chart:', error);
    }
}

// ============================================================
// TOP SUPPLIERS CHART FUNCTIONS
// ============================================================

function updateTopSuppliersChart(projects = null) {
    // If projects not provided, get from tracking records cache first (fastest)
    if (!projects) {
        // Try to use cached data first - this is instant
        if (trackingCache && trackingCache.length > 0) {
            console.log('⚡ Using cached tracking records for suppliers chart - INSTANT');
            renderTopSuppliersChart(trackingCache);
            return;  // Return immediately, don't fetch fresh data
        } else {
            // Only fetch fresh data if cache is empty
            // This is done in background and won't block UI
            (async function() {
                try {
                    console.log('📊 Fetching tracking records for suppliers chart...');
                    const records = await getAllProjectItems();
                    trackingCache = records;  // Update cache
                    console.log('📊 Fetched tracking records for suppliers chart:', records.length);
                    renderTopSuppliersChart(records);
                } catch (error) {
                    console.error('❌ Error fetching tracking records:', error);
                }
            })();
            return;
        }
    } else {
        renderTopSuppliersChart(projects);
    }
}

function renderTopSuppliersChart(trackingRecords) {
    const ctx = document.getElementById('topSuppliersChart');
    if (!ctx) {
        console.log('⚠️ Top Suppliers chart canvas not found');
        return;
    }

    // Validate data
    if (!trackingRecords || !Array.isArray(trackingRecords) || trackingRecords.length === 0) {
        console.log('⚠️ No tracking records available for suppliers chart');
        console.log('trackingRecords:', trackingRecords);
        // Show empty state
        if (window.topSuppliersChartInstance) {
            window.topSuppliersChartInstance.destroy();
        }
        return;
    }

    console.log('📊 Rendering Top Suppliers with', trackingRecords.length, 'records');
    console.log('📋 Sample record:', trackingRecords[0]);

    // Get time scope filter from button text
    const timeScopeBtn = document.getElementById('suppliersTimeBtnText');
    const timeScope = timeScopeBtn ? timeScopeBtn.textContent.trim() : 'All-Time';
    
    // Filter records by time scope
    const filteredRecords = trackingRecords.filter(record => {
        if (timeScope === 'All-Time') {
            return true; // all-time includes all records
        }
        
        // Check if timeScope is a year (2025-2030)
        const selectedYear = parseInt(timeScope);
        if (!isNaN(selectedYear) && selectedYear >= 2025 && selectedYear <= 2030) {
            const recordYear = record.poDate ? new Date(record.poDate).getFullYear() : null;
            return recordYear === selectedYear;
        }
        
        return true;
    });

    console.log('📊 Filtered records by time scope:', filteredRecords.length);

    // Calculate top suppliers by total PO amount
    const supplierData = {};
    
    filteredRecords.forEach(record => {
        // Handle different vendor field names from the data structure
        const vendor = record.vendors || record.vendor || record.Vendors || '';
        const poAmount = parseFloat(record.poAmount || record.totalAmount || 0) || 0;
        
        // Only include valid vendors with valid amounts
        if (vendor && vendor.trim() !== '' && poAmount > 0) {
            if (!supplierData[vendor]) {
                supplierData[vendor] = {
                    totalAmount: 0,
                    count: 0
                };
            }
            
            supplierData[vendor].totalAmount += poAmount;
            supplierData[vendor].count += 1;
        }
    });

    console.log('📊 Supplier Data Aggregated:', supplierData);

    // Sort suppliers by total amount and get top 5
    const sortedSuppliers = Object.entries(supplierData)
        .map(([supplier, data]) => ({
            name: supplier,
            totalAmount: data.totalAmount,
            count: data.count
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 5);

    const suppliers = sortedSuppliers.map(s => s.name);
    const amounts = sortedSuppliers.map(s => s.totalAmount);

    console.log('📊 Top Suppliers Data:', { suppliers, amounts, count: suppliers.length });
    
    // Check if we have actual data
    if (suppliers.length === 0) {
        console.warn('⚠️ No valid suppliers found in data');
        // Show empty message
        if (window.topSuppliersChartInstance) {
            window.topSuppliersChartInstance.destroy();
        }
        return;
    }

    // Destroy existing chart if it exists
    if (window.topSuppliersChartInstance) {
        window.topSuppliersChartInstance.destroy();
        console.log('🗑️ Destroyed previous top suppliers chart');
    }

    // Color gradient for bar chart
    const barColors = [
        '#0a9b03',
        '#15c524',
        '#1dd1a1',
        '#26ddc7',
        '#36A2EB',
        '#4BC0C0',
        '#9966FF',
        '#FF9F40'
    ];

    // Create new bar chart
    window.topSuppliersChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: suppliers.length > 0 ? suppliers : ['No Data'],
            datasets: [{
                label: 'Total PO Amount (₱)',
                data: amounts.length > 0 ? amounts : [0],
                backgroundColor: barColors.slice(0, suppliers.length),
                borderColor: 'rgba(10, 155, 3, 0.3)',
                borderWidth: 1,
                borderRadius: 8,
                hoverBackgroundColor: '#0a9b03',
                hoverBorderColor: '#1dd1a1',
                barPercentage: 0.7,
                categoryPercentage: 0.8
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#e0e0e0',
                        font: {
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                            size: 12,
                            weight: '500'
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#0a9b03',
                    bodyColor: '#e0e0e0',
                    borderColor: '#0a9b03',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const amount = context.parsed.x;
                            return `Amount: ₱${amount.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(10, 155, 3, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#a0a0a0',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return '₱' + value.toLocaleString('en-PH', {maximumFractionDigits: 0});
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#e0e0e0',
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                }
            }
        }
    });

    console.log('✅ Top Suppliers bar chart updated with', suppliers.length, 'suppliers');

    // Make bars clickable to filter purchase tracking by supplier
    const canvas = ctx;
    canvas.onclick = function(evt) {
        const canvasPosition = Chart.helpers.getRelativePosition(evt, window.topSuppliersChartInstance);
        const dataX = window.topSuppliersChartInstance.scales.y.getValueForPixel(canvasPosition.y);
        const datasetIndex = 0;

        // Find the clicked supplier
        const clickedSupplier = suppliers[Math.round(dataX)];
        if (clickedSupplier && clickedSupplier !== 'Unknown') {
            console.log('🔍 Filtering by supplier:', clickedSupplier);
            filterBySupplier(clickedSupplier);
        }
    };
}

function filterBySupplier(supplierName) {
    // Switch to purchase tracking page
    showPurchaseTrackingPage();
    
    // Set the search input to supplier name
    setTimeout(() => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = supplierName;
            searchTracking();
        }
    }, 300);
}

// Synchronize table structure to ensure Actions column is always last
function syncProjectsTableStructure() {
    const table = document.querySelector('#projects-page .data-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    // Get the current header structure to know how many columns we should have
    const headerRow = table.querySelector('thead tr');
    const expectedColumnCount = headerRow.querySelectorAll('th').length;

    // Fix each row to have the correct number of cells
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const currentCellCount = cells.length;

        // If row has fewer cells than headers, add empty cells
        if (currentCellCount < expectedColumnCount - 1) {
            // expectedColumnCount - 1 because we don't count the Actions header separately
            const cellsToAdd = expectedColumnCount - 1 - currentCellCount;
            for (let i = 0; i < cellsToAdd; i++) {
                const newCell = document.createElement('td');
                newCell.style.padding = '12px 16px';
                newCell.style.color = '#e0e0e0';
                newCell.style.fontSize = '14px';
                newCell.innerHTML = '';
                // Insert before the last cell (Actions)
                row.insertBefore(newCell, row.lastChild);
            }
        }
    });

    console.log('✅ Table structure synchronized - Actions at end');
}

// Function to open P.O items modal for a project
function openProjectPOItemsModal(projectId) {
    // Find the project in the cached data
    const project = projectsCache.find(p => (p.projectID || p.projectId) === projectId);
    
    if (!project) {
        showNotification('Project not found', 'error');
        return;
    }
    
    const projectName = project.projectName || project.project_name || 'Unknown Project';
    const items = project.items || [];
    
    if (items.length === 0) {
        showNotification(`No items found for ${projectName}`, 'info');
        return;
    }
    
    // Show loading state
    let modal = document.getElementById('poItemsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'poItemsModal';
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '3000';
    modal.style.overflow = 'auto';
    modal.style.padding = '20px';
    
    modal.innerHTML = `
        <div id="poItemsTable" style="background:#1a3a52;border-radius:12px;padding:20px;margin-top:50px;margin-bottom:50px;text-align:center;">
            <div style="color:#0a9b03;font-size:16px;padding:40px;">⏳ Fetching material details...</div>
        </div>
    `;
    
    // Fetch material details asynchronously
    (async () => {
        try {
            // Enrich items with material data
            let enrichedItems = await Promise.all(items.map(async (item) => {
                try {
                    // Try fetching material by document ID
                    if (item.materialId) {
                        const matRef = doc(db, 'materials', item.materialId);
                        const matSnap = await getDoc(matRef);
                        if (matSnap && matSnap.exists()) {
                            const materialData = matSnap.data();
                            return {
                                ...item,
                                fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                                fetchedCost: materialData.cost || materialData.price || item.unitPrice
                            };
                        }
                    }
                } catch (e) {
                    console.log('⚠️ Could not fetch material by ID for', item.materialId, e);
                }
                
                // Try matching by itemCode field
                try {
                    if (item.itemCode) {
                        const materialQuery = query(collection(db, 'materials'), where('itemCode', '==', item.itemCode));
                        const materialDocs = await getDocs(materialQuery);
                        if (!materialDocs.empty) {
                            const materialData = materialDocs.docs[0].data();
                            return {
                                ...item,
                                fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                                fetchedCost: materialData.cost || materialData.price || item.unitPrice
                            };
                        }
                    }
                } catch (e) {
                    console.log('⚠️ Could not query material by itemCode for', item.itemCode, e);
                }
                
                // Fallback values
                return {
                    ...item,
                    fetchedItemCode: item.itemCode || item.materialId || '-',
                    fetchedCost: item.unitPrice || 0
                };
            }));
            
            // Create modal content with fetched data
            let itemsHTML = `
                <div style="max-width:1400px;margin:0 auto;padding:20px;background:#1a3a52;border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                        <h2 style="color:#0a9b03;margin:0;font-size:18px;">📦 P.O Items: ${projectName}</h2>
                        <button onclick="document.getElementById('poItemsModal').style.display='none'" style="background:#ff4444;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;">Close</button>
                    </div>
                    
                    <div style="overflow-x:auto;background:#0f2a3f;border-radius:6px;border:1px solid rgba(10,155,3,0.3);margin-bottom:20px;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr style="background:rgba(10,155,3,0.2);border-bottom:2px solid rgba(10,155,3,0.5);">
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Item #</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Item Code</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Description</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">P.O No.</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Quantity</th>
                                    <th style="padding:12px;text-align:right;color:#0a9b03;font-weight:600;">Cost</th>
                                    <th style="padding:12px;text-align:right;color:#0a9b03;font-weight:600;">Total Amount</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Vendor</th>
                                    <th style="padding:12px;text-align:left;color:#0a9b03;font-weight:600;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            // Add items to table with fetched data
            enrichedItems.forEach((item, index) => {
                const itemCode = item.fetchedItemCode || '-';
                const qty = parseFloat(item.quantity || 0);
                const cost = parseFloat(item.fetchedCost || 0);
                const totalAmount = qty * cost;
                const vendor = item.vendor || item.itemVendor || 'N/A';
                const description = item.specification || item.itemDescription || '-';
                const poNo = item.poNumber || '-';
                const status = item.status || 'Pending';
                
                const statusColor = status.toLowerCase() === 'completed' ? '#0a9b03' : 
                                   status.toLowerCase() === 'pending' ? '#ff9800' : '#2196F3';
                
                itemsHTML += `
                    <tr style="border-bottom:1px solid rgba(10,155,3,0.1);">
                        <td style="padding:12px;color:#e0e0e0;">${item.itemNumber || (index + 1)}</td>
                        <td style="padding:12px;color:#15c524;font-weight:600;">${itemCode}</td>
                        <td style="padding:12px;color:#e0e0e0;max-width:200px;word-wrap:break-word;">${description}</td>
                        <td style="padding:12px;color:#e0e0e0;">${poNo}</td>
                        <td style="padding:12px;color:#e0e0e0;text-align:right;">${qty.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td style="padding:12px;color:#0a9b03;font-weight:600;text-align:right;">₱${cost.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td style="padding:12px;color:#15c524;font-weight:600;text-align:right;">₱${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td style="padding:12px;color:#e0e0e0;">${vendor}</td>
                        <td style="padding:12px;"><span style="color:${statusColor};font-weight:600;">${status}</span></td>
                    </tr>
                `;
            });
            
            const totalAmount = enrichedItems.reduce((sum, item) => {
                return sum + ((parseFloat(item.quantity || 0) * parseFloat(item.fetchedCost || 0)));
            }, 0);
            
            itemsHTML += `
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="background:rgba(10,155,3,0.1);padding:15px;border-radius:6px;margin-bottom:20px;border:1px solid rgba(10,155,3,0.3);">
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;">
                            <div>
                                <p style="color:#a0a0a0;margin:0 0 5px 0;font-size:12px;">Total Items:</p>
                                <p style="color:#0a9b03;margin:0;font-size:18px;font-weight:bold;">${enrichedItems.length}</p>
                            </div>
                            <div>
                                <p style="color:#a0a0a0;margin:0 0 5px 0;font-size:12px;">Total Quantity:</p>
                                <p style="color:#0a9b03;margin:0;font-size:18px;font-weight:bold;">${enrichedItems.reduce((sum, i) => sum + parseFloat(i.quantity || 0), 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                            </div>
                            <div>
                                <p style="color:#a0a0a0;margin:0 0 5px 0;font-size:12px;">Total Amount:</p>
                                <p style="color:#0a9b03;margin:0;font-size:18px;font-weight:bold;">₱${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button data-action="sheets" style="padding:10px 20px;background:linear-gradient(135deg,#2196F3 0%,#1976D2 100%);color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">📊 Open in Sheets</button>
                    </div>
                </div>
            `;
            
            // Update modal with actual content
            modal.innerHTML = `
                <div id="poItemsTable" style="background:#1a3a52;border-radius:12px;padding:20px;margin-top:50px;margin-bottom:50px;">
                    ${itemsHTML}
                </div>
            `;
            
            // Attach event listeners to action buttons
            setTimeout(() => {
                const sheetsBtn = modal.querySelector('button[data-action="sheets"]');
                if (sheetsBtn) {
                    sheetsBtn.addEventListener('click', () => openPOSheetForProject(projectId));
                }
            }, 0);
        } catch (error) {
            console.error('❌ Error loading PO item details:', error);
            modal.innerHTML = `
                <div id="poItemsTable" style="background:#1a3a52;border-radius:12px;padding:20px;margin-top:50px;margin-bottom:50px;text-align:center;">
                    <div style="color:#ff6b6b;font-size:16px;padding:40px;">⚠️ Error Loading Item Details</div>
                    <button onclick="document.getElementById('poItemsModal').style.display='none'" style="padding:10px 20px;background:rgba(160,160,160,0.2);color:#a0a0a0;border:1px solid rgba(160,160,160,0.4);border-radius:4px;cursor:pointer;">Close</button>
                </div>
            `;
        }
    })();
    
    // Close modal when clicking outside
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
}

// Function to open P.O sheet for project
async function openPOSheetForProject(projectId) {
    const baseUrl = 'https://docs.google.com/spreadsheets/d/1037rZd5AVpjTYHWYhMq0PkuznYHMcjkkx0Orj670f-Q/edit?gid=0#gid=0';
    const project = projectsCache.find(p => (p.projectID || p.projectId) === projectId);
    
    if (!project) {
        showNotification('Project not found', 'error');
        return;
    }
    
    const projectName = project.projectName || project.project_name || 'Unknown Project';
    const items = project.items || [];
    
    // Fetch material details for items
    let enrichedItems = await Promise.all(items.map(async (item) => {
        try {
            if (item.materialId) {
                const matRef = doc(db, 'materials', item.materialId);
                const matSnap = await getDoc(matRef);
                if (matSnap && matSnap.exists()) {
                    const materialData = matSnap.data();
                    return {
                        ...item,
                        fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                        fetchedCost: materialData.cost || materialData.price || item.unitPrice
                    };
                }
            }
        } catch (e) {
            console.log('⚠️ Could not fetch material by ID for', item.materialId);
        }
        
        try {
            if (item.itemCode) {
                const materialQuery = query(collection(db, 'materials'), where('itemCode', '==', item.itemCode));
                const materialDocs = await getDocs(materialQuery);
                if (!materialDocs.empty) {
                    const materialData = materialDocs.docs[0].data();
                    return {
                        ...item,
                        fetchedItemCode: materialData.itemCode || item.itemCode || item.materialId,
                        fetchedCost: materialData.cost || materialData.price || item.unitPrice
                    };
                }
            }
        } catch (e) {
            console.log('⚠️ Could not query material by itemCode for', item.itemCode);
        }
        
        return {
            ...item,
            fetchedItemCode: item.itemCode || item.materialId || '-',
            fetchedCost: item.unitPrice || 0
        };
    }));
    
    // Build tab-separated data for Google Sheets with Item Code and Cost columns
    let sheetData = `Item #\tItem Code\tDescription\tP.O No.\tQuantity\tCost\tTotal Amount\tVendor\tStatus\n`;
    
    enrichedItems.forEach((item, index) => {
        const itemCode = item.fetchedItemCode || '-';
        const qty = parseFloat(item.quantity || 0);
        const cost = parseFloat(item.fetchedCost || 0);
        const totalAmount = qty * cost;
        const description = (item.specification || item.itemDescription || '-').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const vendor = (item.vendor || item.itemVendor || 'N/A').replace(/\t/g, ' ');
        
        sheetData += `${item.itemNumber || (index + 1)}\t${itemCode}\t${description}\t${item.poNumber || '-'}\t${qty}\t₱${cost.toFixed(2)}\t₱${totalAmount.toFixed(2)}\t${vendor}\t${item.status || 'Pending'}\n`;
    });
    
    // Add summary section
    const totalQty = enrichedItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
    const totalAmount = enrichedItems.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.fetchedCost || 0)), 0);
    
    sheetData += `\n\nSUMMARY\n`;
    sheetData += `Total Items:\t${enrichedItems.length}\n`;
    sheetData += `Total Quantity:\t${totalQty}\n`;
    sheetData += `Total Amount:\t₱${totalAmount.toFixed(2)}\n`;
    sheetData += `Project:\t${projectName}\n`;
    sheetData += `Project ID:\t${projectId}\n`;
    sheetData += `Generated:\t${new Date().toLocaleString()}\n`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(sheetData).then(() => {
        // Open the Google Sheet
        const params = new URLSearchParams({
            project: projectId,
            projectName: projectName
        });
        window.open(baseUrl + '?' + params.toString(), '_blank');
        showNotification('✅ Sheet opened! Items data copied to clipboard - paste it into the sheet (Ctrl+V)', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Still open the sheet even if copy fails
        const params = new URLSearchParams({
            project: projectId,
            projectName: projectName
        });
        window.open(baseUrl + '?' + params.toString(), '_blank');
        showNotification('Google Sheets opened. Please manually add project items.', 'info');
    });
}

// Helper function to generate P.O Link with project details data
async function generateProjectPOLink(project) {
    try {
        const projectId = project.projectID || project.projectId || 'N/A';
        const projectName = project.projectName || project.project_name || 'N/A';
        const baseUrl = 'https://docs.google.com/spreadsheets/d/1037rZd5AVpjTYHWYhMq0PkuznYHMcjkkx0Orj670f-Q/edit?gid=0#gid=0';
        
        // Collect project details data
        let totalAmount = 0;
        let totalQuantity = 0;
        let poNumbers = [];
        let vendors = [];
        let itemCount = 0;
        
        // Get project items if available
        if (project.items && Array.isArray(project.items)) {
            itemCount = project.items.length;
            project.items.forEach(item => {
                // Sum total amounts
                if (item.quantity && item.unitPrice) {
                    totalAmount += parseFloat(item.quantity) * parseFloat(item.unitPrice);
                }
                // Sum quantities
                if (item.quantity) {
                    totalQuantity += parseFloat(item.quantity);
                }
                // Collect P.O numbers
                if (item.poNumber && !poNumbers.includes(item.poNumber)) {
                    poNumbers.push(item.poNumber);
                }
                // Collect unique vendors
                if (item.vendor && !vendors.includes(item.vendor)) {
                    vendors.push(item.vendor);
                } else if (item.itemVendor && !vendors.includes(item.itemVendor)) {
                    vendors.push(item.itemVendor);
                }
            });
        }
        
        // Build URL with encoded project data
        const params = new URLSearchParams({
            project: projectId,
            projectName: projectName,
            items: itemCount,
            totalAmount: totalAmount.toFixed(2),
            totalQty: totalQuantity.toFixed(2),
            poNumbers: poNumbers.join(','),
            vendors: vendors.join(','),
            timestamp: new Date().toISOString()
        });
        
        const poLink = baseUrl + '?' + params.toString();
        console.log('📄 Generated P.O Link for', projectId, ':', { items: itemCount, totalAmount, vendors: vendors.length });
        return poLink;
        
    } catch (error) {
        console.warn('⚠️ Error generating P.O Link:', error);
        const baseUrl = 'https://docs.google.com/spreadsheets/d/1037rZd5AVpjTYHWYhMq0PkuznYHMcjkkx0Orj670f-Q/edit?gid=0#gid=0';
        const fallbackParams = new URLSearchParams({
            project: project.projectID || project.projectId || 'N/A'
        });
        return baseUrl + '?' + fallbackParams.toString();
    }
}

// Ultra-fast table rendering using batch processing
function renderProjectsTableFast(projects) {
    const table = document.querySelector('#projects-page .data-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const BATCH_SIZE = 20; // Render 20 rows at a time
    let index = 0;

    // Show loading state
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Loading...</td></tr>';

    // Get visible column field names in order, excluding 'Actions'
    const visibleFields = [];
    // Use projectsTableColumnOrder to preserve the order
    projectsTableColumnOrder.forEach(fieldName => {
        if (fieldName in projectsTableColumnSettings) {
            const column = projectsTableColumnSettings[fieldName];
            if (column.visible) {
                visibleFields.push(fieldName);
            }
        }
    });

    // Map field names to data properties
    const fieldDataMap = {
        'projectID': 'projectID',
        'client': 'client_name',
        'projectName': 'projectName',
        'location': 'location',
        'trade': 'trade',
        'budget': 'budget',
        'status': 'status'
    };

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(index + BATCH_SIZE, projects.length);

        for (let i = index; i < endIndex; i++) {
            const project = projects[i];
            const newRow = document.createElement('tr');
            newRow.setAttribute('data-id', project.id);

            // Build cells for visible columns in correct order
            visibleFields.forEach(fieldName => {
                const td = document.createElement('td');
                td.style.padding = '12px 16px';
                td.style.color = '#e0e0e0';
                td.style.fontSize = '14px';

                // Get data from project based on field name
                const dataProperty = fieldDataMap[fieldName];
                let cellContent = '';

                if (fieldName === 'projectID') {
                    cellContent = project.projectID || '';
                } else if (fieldName === 'client') {
                    cellContent = project.client_name || project.client || '';
                } else if (fieldName === 'projectName') {
                    cellContent = `<strong>${project.projectName || ''}</strong>`;
                } else if (fieldName === 'location') {
                    cellContent = project.location || '';
                } else if (fieldName === 'trade') {
                    cellContent = Array.isArray(project.trades) ? project.trades.join(', ') : (project.trade || '');
                } else if (fieldName === 'budget') {
                    cellContent = `₱${parseFloat(project.budget || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                } else if (fieldName === 'poLink') {
                    // Generate P.O Link with project data (will be populated asynchronously)
                    const projectId = project.projectID || project.projectId || 'N/A';
                    cellContent = `<a id="polink-${projectId}" href="#" target="_blank" style="color:#0a9b03;text-decoration:none;font-weight:bold;" onclick="return false;">📄 Loading...</a>`;
                    
                    // Generate link asynchronously and update when ready
                    generateProjectPOLink(project).then(poLink => {
                        const linkElement = document.getElementById(`polink-${projectId}`);
                        if (linkElement) {
                            linkElement.href = '#';
                            linkElement.textContent = '📄 View P.O';
                            linkElement.onclick = () => {
                                openProjectPOItemsModal(projectId);
                                return false;
                            };
                        }
                    }).catch(error => {
                        console.warn('Error updating P.O Link:', error);
                        const linkElement = document.getElementById(`polink-${projectId}`);
                        if (linkElement) {
                            linkElement.textContent = '📄 Failed to Load';
                        }
                    });
                } else if (fieldName === 'status') {
                    const statusClass = project.status ? `status-${project.status.toLowerCase().replace('-', '')}` : 'status-ongoing';
                    const statusDisplay = project.status || 'On-going';
                    cellContent = `<span class="status-badge ${statusClass}">${statusDisplay}</span>`;
                } else {
                    // Custom column - try to get data from project object
                    // First try the exact field name, then try camelCase variations
                    cellContent = project[fieldName] || 
                                 project[fieldName.charAt(0).toLowerCase() + fieldName.slice(1)] || 
                                 project[fieldName.toLowerCase()] || 
                                 '';
                    
                    // If it looks like a URL or link, make it clickable
                    if (cellContent && (cellContent.startsWith('http://') || cellContent.startsWith('https://'))) {
                        cellContent = `<a href="${cellContent}" target="_blank" style="color:#0a9b03;text-decoration:none;">View Link</a>`;
                    }
                }

                td.innerHTML = cellContent;
                newRow.appendChild(td);
            });

            // Always add Actions cell at the end
            const actionsTd = document.createElement('td');
            actionsTd.style.padding = '12px 16px';
            actionsTd.innerHTML = `
                <button class="btn-edit" onclick="viewProjectDetails('${project.id}')">View</button>
                <button class="btn-edit" onclick="editProject('${project.id}')">Edit</button>
                <button class="btn-delete" onclick="deleteProject('${project.id}', '${project.projectName}')">Delete</button>
            `;
            newRow.appendChild(actionsTd);

            fragment.appendChild(newRow);
        }

        // First batch - clear and insert
        if (index === 0) {
            tbody.innerHTML = '';
        }
        tbody.appendChild(fragment);

        index = endIndex;

        // Schedule next batch
        if (index < projects.length) {
            requestAnimationFrame(renderBatch);
        } else {
            console.log('⚡ Projects table rendered - FAST!');
            // Apply column visibility after rendering
            applyProjectsTableColumnVisibility();
        }
    }

    renderBatch();
}

// Sort tracking records by P.O Number
function sortTrackingByPONumber(records) {
    if (!records || !Array.isArray(records)) return records;
    
    return records.sort((a, b) => {
        const poA = (a.poNo || '').toString().trim();
        const poB = (b.poNo || '').toString().trim();
        
        // Try to extract numeric part if PO numbers have format like "PO001", "PO002", etc.
        const numA = parseInt(poA.replace(/\D/g, '')) || 0;
        const numB = parseInt(poB.replace(/\D/g, '')) || 0;
        
        // If both have numeric parts, sort numerically
        if (numA !== 0 || numB !== 0) {
            return numA - numB;
        }
        
        // Otherwise sort alphabetically
        return poA.localeCompare(poB);
    });
}

// Load Tracking Records from Database with caching and fast rendering
function loadTrackingRecords() {
    (async function() {
        try {
            console.log('📊 Loading tracking records from projects...');
            const now = Date.now();

            // Use cache immediately
            if (trackingCache) {
                console.log('⚡⚡ Using cached tracking - rendering instantly');
                // Sort by P.O number before rendering
                const sortedRecords = sortTrackingByPONumber(trackingCache);
                renderTrackingTableFast(sortedRecords);

                // Refresh cache in background if expired
                if ((now - cacheTimestamp) >= CACHE_DURATION) {
                    console.log('🔄 Refreshing tracking cache in background...');
                    const records = await getAllProjectItems();
                    trackingCache = records;
                    cacheTimestamp = now;
                }
            } else {
                // First load - fetch and render
                const records = await getAllProjectItems();
                trackingCache = records;
                cacheTimestamp = now;
                // Sort by P.O number before rendering
                const sortedRecords = sortTrackingByPONumber(records);
                renderTrackingTableFast(sortedRecords);
            }
        } catch (error) {
            console.error('❌ Error loading tracking records:', error);
        }
    })();
}

// Refresh tracking table data when items are added or updated
function refreshTrackingTableData() {
    const trackingPage = document.getElementById('purchasing-tracking-page');
    
    // Only refresh if tracking page is visible
    if (trackingPage && trackingPage.style.display !== 'none') {
        console.log('🔄 Refreshing tracking table data...');
        
        // Clear cache to force fresh fetch
        trackingCache = null;
        cacheTimestamp = 0;
        
        // Reload tracking records
        loadTrackingRecords();
    } else {
        console.log('⚡ Tracking page not visible - clearing cache for next load');
        // Clear cache anyway so fresh data loads when page is shown
        trackingCache = null;
        cacheTimestamp = 0;
    }
}

// Get all items from all projects
async function getAllProjectItems() {
    try {
        const projects = await getProjects();
        const allItems = [];
        
        projects.forEach(project => {
            if (project.items && Array.isArray(project.items)) {
                project.items.forEach(item => {
                    // Skip items with 'Cancelled' status
                    if (project.status === 'Cancelled' || project.status === 'cancelled') {
                        console.log('⏭️ Skipping item from cancelled project:', project.id);
                        return;
                    }
                    
                    // Calculate delivery status automatically based on received quantity
                    const quantity = parseFloat(item.quantity || item.poQty || 0);
                    const receivedQty = parseFloat(item.receivedQty || item.received || 0);
                    let autoDeliveryStatus = item.deliveryStatus || 'PENDING';
                    
                    if (receivedQty > 0) {
                        if (receivedQty >= quantity && quantity > 0) {
                            // All items received
                            autoDeliveryStatus = 'FULLY RECEIVED';
                        } else if (receivedQty < quantity) {
                            // Some items received but not all
                            autoDeliveryStatus = 'PARTIALLY RECEIVED';
                        }
                    } else {
                        // No items received yet
                        autoDeliveryStatus = 'PENDING';
                    }
                    
                    allItems.push({
                        id: `${project.id}_${item.itemNumber}`,
                        item: item.itemNumber || '',
                        month: item.month || item.monthOfExpense || item.itemDescription || '',
                        client: project.client_name || project.client || '',
                        projectName: project.projectName || '',
                        trade: Array.isArray(project.trades) ? project.trades.join(', ') : (project.trade || ''),
                        mr: item.mrNumber || item.materialRequestNo || item.mrNo || '',
                        mrDate: item.mrDate || item.materialRequestDate || '',
                        poDate: item.poDate || item.purchaseOrderDate || '',
                        deliveryDate: item.deliveryDate || item.expectedDeliveryDate || '',
                        poNo: item.poNumber || item.purchaseOrderNo || item.poNo || '',
                        vendors: item.bestSupplier || item.vendor || item.itemVendor || item.supplierName || '',
                        poAmount: item.totalAmount || item.poAmount || item.total || 0,
                        paidAmount: item.paidAmount || item.paymentAmount || 0,
                        status: item.status || 'On-going',
                        deliveryStatus: autoDeliveryStatus,
                        receivedQty: receivedQty,
                        quantity: quantity,
                        partDescription: item.specification || item.materialDescription || item.itemDescription || ''
                    });
                });
            }
        });
        
        console.log('✅ Loaded', allItems.length, 'items from projects (excluding cancelled)');
        return allItems;
    } catch (error) {
        console.error('❌ Error getting all project items:', error);
        return [];
    }
}

// Ultra-fast tracking table rendering using batch processing
function renderTrackingTableFast(records) {
    const table = document.getElementById('materials-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const BATCH_SIZE = 25; // Render 25 rows at a time
    let index = 0;

    // Show loading state
    tbody.innerHTML = '<tr><td colspan="18" style="text-align:center; padding:20px;">Loading...</td></tr>';

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(index + BATCH_SIZE, records.length);

        for (let i = index; i < endIndex; i++) {
            const record = records[i];
            const newRow = document.createElement('tr');
            newRow.setAttribute('data-id', record.id);
            const isCancelled = (record.status || 'On-going').toLowerCase() === 'cancelled';

            // Calculate Payment Status based on Paid Amount vs P.O Amount
            const poAmount = parseFloat(record.poAmount || 0);
            const paidAmount = parseFloat(record.paidAmount || 0);
            let paymentStatus = 'UNPAID';
            let paymentStatusColor = '#ff1744'; // Red for unpaid

            if (paidAmount >= poAmount && poAmount > 0) {
                paymentStatus = 'FULLY PAID';
                paymentStatusColor = '#0a9b03'; // Green for fully paid
            } else if (paidAmount > 0 && paidAmount < poAmount) {
                paymentStatus = 'PARTIALLY PAID';
                paymentStatusColor = '#ffa500'; // Orange for partially paid
            }

            // Calculate Delivery Status based on Delivery Status field or default
            let deliveryStatus = record.deliveryStatus || 'PENDING';
            let deliveryStatusColor = '#ff1744'; // Red for pending/not received

            if (deliveryStatus === 'FULLY RECEIVED') {
                deliveryStatusColor = '#0a9b03'; // Green for fully received
            } else if (deliveryStatus === 'PARTIALLY RECEIVED') {
                deliveryStatusColor = '#ffa500'; // Orange for partially received
            }

            // Calculate Balance Due
            const balanceDue = poAmount - paidAmount;
            const balanceDueColor = balanceDue > 0 ? '#ff1744' : '#0a9b03'; // Red if balance due, green if paid

            // Check if status is HOLD to make delivery status clickable
            const statusLower = ((record.status === 'pending' ? 'on-going' : record.status) || 'on-going').toLowerCase();
            const isHold = statusLower === 'hold';
            const deliveryStatusCell = isHold 
                ? `<td style="color: ${deliveryStatusColor}; font-weight: 600; cursor: pointer;" onclick="changeDeliveryStatus('${record.id}', '${deliveryStatus}', this);" title="Click to change delivery status">${deliveryStatus}</td>`
                : `<td style="color: ${deliveryStatusColor}; font-weight: 600;">${deliveryStatus}</td>`;

            const paymentStatusCell = isHold
                ? `<td style="color: ${paymentStatusColor}; font-weight: 600; cursor: pointer;" onclick="changePaymentStatus('${record.id}', '${paymentStatus}', this);" title="Click to change payment status">${paymentStatus}</td>`
                : `<td style="color: ${paymentStatusColor}; font-weight: 600;">${paymentStatus}</td>`;

            newRow.innerHTML = `
                <td>${i + 1}</td>
                <td>${getMonthText(record.month)}</td>
                <td>${record.client || ''}</td>
                <td>${record.projectName || ''}</td>
                <td>${record.trade || ''}</td>
                <td>${record.mr || ''}</td>
                <td>${formatDateShort(record.mrDate) || ''}</td>
                <td>${formatDateShort(record.poDate) || ''}</td>
                <td>${formatDateShort(record.deliveryDate) || ''}</td>
                <td>${record.poNo || ''}</td>
                <td>${record.vendors || ''}</td>
                <td>₱${poAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>₱${paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="color: ${balanceDueColor}; font-weight: 600;">₱${balanceDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                ${paymentStatusCell}
                ${deliveryStatusCell}
                <td><span class="status-badge status-${statusLower}">${(record.status === 'pending' ? 'On-going' : record.status) || 'On-going'}</span></td>
            `;

            fragment.appendChild(newRow);
        }

        // First batch - clear and insert
        if (index === 0) {
            tbody.innerHTML = '';
        }
        tbody.appendChild(fragment);
        index = endIndex;

        // Schedule next batch using requestAnimationFrame for smooth rendering
        if (index < records.length) {
            requestAnimationFrame(renderBatch);
        } else {
            console.log('⚡ Tracking table rendered - FAST!');
            // Update pagination after rendering all records
            updateTrackingTablePagination(records);
        }
    }
    renderBatch();
}

// Update pagination state and controls for tracking table
function updateTrackingTablePagination(records) {
    trackingTablePaginationState.allRecords = records;
    trackingTablePaginationState.totalRows = records.length;
    trackingTablePaginationState.currentPage = 1;
    
    const totalPagesInit = Math.ceil(records.length / trackingTablePaginationState.rowsPerPage) || 1;
    const pageInfo = document.getElementById('trackingPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${trackingTablePaginationState.currentPage} of ${totalPagesInit}`;
    }
    
    renderTrackingTablePage(trackingTablePaginationState.currentPage);
}

// Render specific page of tracking table
function renderTrackingTablePage(pageNum) {
    const state = trackingTablePaginationState;
    const totalPagesRender = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    
    if (pageNum < 1 || pageNum > totalPagesRender) return;
    
    state.currentPage = pageNum;
    const tbody = document.getElementById('tracking-data-body');
    if (!tbody) return;
    
    const startIdx = (pageNum - 1) * state.rowsPerPage;
    const endIdx = startIdx + state.rowsPerPage;
    const pageRecords = state.allRecords.slice(startIdx, endIdx);
    
    // Clear table
    tbody.innerHTML = '';
    
    if (pageRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" style="text-align:center; padding:20px; color:#a0a0a0;">No records found</td></tr>';
        return;
    }
    
    // Render page records
    pageRecords.forEach((record, index) => {
        const newRow = document.createElement('tr');
        newRow.setAttribute('data-id', record.id);
        newRow.style.borderBottom = '1px solid rgba(10,155,3,0.2)';
        
        // Calculate continuous item number across all pages
        const continuousItemNumber = (pageNum - 1) * state.rowsPerPage + index + 1;
        
        const poAmount = parseFloat(record.poAmount || 0);
        const paidAmount = parseFloat(record.paidAmount || 0);
        let paymentStatus = 'UNPAID';
        let paymentStatusColor = '#ff1744';
        
        if (paidAmount >= poAmount && poAmount > 0) {
            paymentStatus = 'FULLY PAID';
            paymentStatusColor = '#0a9b03';
        } else if (paidAmount > 0 && paidAmount < poAmount) {
            paymentStatus = 'PARTIALLY PAID';
            paymentStatusColor = '#ffa500';
        }
        
        let deliveryStatus = record.deliveryStatus || 'PENDING';
        let deliveryStatusColor = '#ff1744';
        
        if (deliveryStatus === 'FULLY RECEIVED') {
            deliveryStatusColor = '#0a9b03';
        } else if (deliveryStatus === 'PARTIALLY RECEIVED') {
            deliveryStatusColor = '#ffa500';
        }
        
        const balanceDue = poAmount - paidAmount;
        const balanceDueColor = balanceDue > 0 ? '#ff1744' : '#0a9b03';
        
        const statusLower = ((record.status === 'pending' ? 'on-going' : record.status) || 'on-going').toLowerCase();
        const isHold = statusLower === 'hold';
        const deliveryStatusCell = isHold 
            ? `<td style="color: ${deliveryStatusColor}; font-weight: 600; cursor: pointer;" onclick="changeDeliveryStatus('${record.id}', '${deliveryStatus}', this);" title="Click to change delivery status">${deliveryStatus}</td>`
            : `<td style="color: ${deliveryStatusColor}; font-weight: 600;">${deliveryStatus}</td>`;
        
        const paymentStatusCell = isHold
            ? `<td style="padding: 8px 12px; color: ${paymentStatusColor}; font-weight: 600; cursor: pointer;" onclick="changePaymentStatus('${record.id}', '${paymentStatus}', this);" title="Click to change payment status">${paymentStatus}</td>`
            : `<td style="padding: 8px 12px; color: ${paymentStatusColor}; font-weight: 600;">${paymentStatus}</td>`;
        
        newRow.innerHTML = `
            <td style="padding: 8px 12px; color: #e0e0e0;">${continuousItemNumber}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${getMonthText(record.month)}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.client || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.projectName || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.trade || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.mr || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${formatDateShort(record.mrDate) || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${formatDateShort(record.poDate) || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${formatDateShort(record.deliveryDate) || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.poNo || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">${record.vendors || ''}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">₱${poAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="padding: 8px 12px; color: #e0e0e0;">₱${paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="padding: 8px 12px; color: ${balanceDueColor}; font-weight: 600;">₱${balanceDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            ${paymentStatusCell}
            ${deliveryStatusCell}
            <td style="padding: 8px 12px;"><span class="status-badge status-${statusLower}">${(record.status === 'pending' ? 'On-going' : record.status) || 'On-going'}</span></td>
        `;
        
        tbody.appendChild(newRow);
    });
    
    // Update page info
    const totalPagesUpdate = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    const pageInfo = document.getElementById('trackingPageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${pageNum} of ${totalPagesUpdate}`;
    }
}

// Pagination navigation for tracking table
function nextPageTrackingTable() {
    const state = trackingTablePaginationState;
    const totalPagesNav = Math.ceil(state.totalRows / state.rowsPerPage) || 1;
    if (state.currentPage < totalPagesNav) {
        renderTrackingTablePage(state.currentPage + 1);
    }
}

function previousPageTrackingTable() {
    const state = trackingTablePaginationState;
    if (state.currentPage > 1) {
        renderTrackingTablePage(state.currentPage - 1);
    }
}

// Optimized function to render projects table using DocumentFragment
function renderProjectsTable(projects) {
    renderProjectsTableFast(projects);
}

// Optimized function to render tracking table using DocumentFragment
function renderTrackingTable(records) {
    renderTrackingTableFast(records);
}

// ============================================================
// TRACKING FUNCTIONS
// ============================================================

// Filter Tracking by Status
function filterTrackingByStatus(status) {
    const table = document.getElementById('materials-table');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        // Get status from the 17th column which contains the status badge
        const statusCell = row.querySelector('td:nth-child(17)');
        const statusBadge = statusCell ? statusCell.querySelector('.status-badge') : null;
        const statusText = statusBadge ? statusBadge.textContent.trim().toLowerCase() : '';
        if (status === 'completed') {
            row.style.display = statusText === 'completed' ? '' : 'none';
        } else if (status === 'on-going') {
            row.style.display = statusText === 'on-going' ? '' : 'none';
        } else if (status === 'hold') {
            row.style.display = statusText === 'hold' ? '' : 'none';
        } else if (status === 'cancelled') {
            row.style.display = statusText === 'cancelled' ? '' : 'none';
        } else {
            // For 'all' status, show all records except cancelled ones
            row.style.display = statusText === 'cancelled' ? 'none' : '';
        }
    });

    // Update container highlight
    const allContainer = document.querySelector('.all-container');
    const completedContainer = document.querySelector('.completed-container');
    const onGoingContainer = document.querySelector('.on-going-container');
    const holdContainer = document.querySelector('.hold-container');
    const cancelledContainer = document.querySelector('.cancelled-container');

     if (status === 'completed') {
        if (allContainer) allContainer.classList.remove('active');
        completedContainer.classList.add('active');
        onGoingContainer.classList.remove('active');
        if (holdContainer) holdContainer.classList.remove('active');
        if (cancelledContainer) cancelledContainer.classList.remove('active');
    } else if (status === 'on-going') {
        if (allContainer) allContainer.classList.remove('active');
        onGoingContainer.classList.add('active');
        completedContainer.classList.remove('active');
        if (holdContainer) holdContainer.classList.remove('active');
        if (cancelledContainer) cancelledContainer.classList.remove('active');
    } else if (status === 'hold') {
        if (allContainer) allContainer.classList.remove('active');
        if (holdContainer) holdContainer.classList.add('active');
        completedContainer.classList.remove('active');
        onGoingContainer.classList.remove('active');
        if (cancelledContainer) cancelledContainer.classList.remove('active');
    } else if (status === 'cancelled') {
        if (allContainer) allContainer.classList.remove('active');
        if (cancelledContainer) cancelledContainer.classList.add('active');
        completedContainer.classList.remove('active');
        onGoingContainer.classList.remove('active');
        if (holdContainer) holdContainer.classList.remove('active');
    } else {
        if (allContainer) allContainer.classList.add('active');
        completedContainer.classList.remove('active');
        onGoingContainer.classList.remove('active');
        if (holdContainer) holdContainer.classList.remove('active');
        if (cancelledContainer) cancelledContainer.classList.remove('active');
    }
}

// Filter by status using dropdown
function filterTrackingByStatusDropdown(status) {
    filterTrackingByStatus(status);
}

// Generate Tracking Report based on selected filter
function generateTrackingReport() {
    const selectedStatus = document.getElementById('statusFilterDropdown').value;
    
    // Use ALL cached data, not just visible rows
    let reportData = trackingCache || [];
    
    // Filter data based on selected status
    if (selectedStatus !== 'all') {
        reportData = reportData.filter(record => {
            const recordStatus = record.status?.toLowerCase() || '';
            const filterStatus = selectedStatus.toLowerCase() || '';
            return recordStatus === filterStatus;
        });
    }

    // Calculate balance due for each record
    const processedData = reportData.map(record => {
        const poAmount = parseFloat(record.poAmount || 0);
        const paidAmount = parseFloat(record.paidAmount || 0);
        const balanceDue = poAmount - paidAmount;
        
        return {
            item: record.item || '',
            month: record.month || '',
            client: record.client || '',
            projectName: record.projectName || '',
            trade: record.trade || '',
            mrNo: record.mr || '',
            mrDate: record.mrDate || '',
            poDate: record.poDate || '',
            poNo: record.poNo || '',
            vendors: record.vendors || '',
            poAmount: `₱${poAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
            paidAmount: `₱${paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
            balanceDue: `₱${balanceDue.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
            paymentStatus: balanceDue === 0 ? 'FULLY PAID' : 'UNPAID',
            deliveryStatus: record.deliveryStatus || 'PENDING',
            status: record.status || 'On-going'
        };
    });

    // Generate CSV content
    const headers = ['Item', 'Month', 'Client', 'Project Name', 'Trade', 'MR #', 'MR Date', 'P.O Date', 'P.O No.', 'Vendors', 'P.O Amount', 'Paid Amount', 'Balance Due', 'Payment Status', 'Delivery Status', 'Status'];
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += headers.join(',') + '\n';
    
    processedData.forEach(row => {
        const values = [
            `"${row.item}"`,
            `"${row.month}"`,
            `"${row.client}"`,
            `"${row.projectName}"`,
            `"${row.trade}"`,
            `"${row.mrNo}"`,
            `"${row.mrDate}"`,
            `"${row.poDate}"`,
            `"${row.poNo}"`,
            `"${row.vendors}"`,
            `"${row.poAmount}"`,
            `"${row.paidAmount}"`,
            `"${row.balanceDue}"`,
            `"${row.paymentStatus}"`,
            `"${row.deliveryStatus}"`,
            `"${row.status}"`
        ];
        csvContent += values.join(',') + '\n';
    });

    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    
    // Set filename based on selected filter
    const dateStr = new Date().toISOString().slice(0, 10);
    const statusLabel = selectedStatus === 'all' ? 'All' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
    link.setAttribute('download', `Purchase_Tracking_Report_${statusLabel}_${dateStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Show success notification - DEPRECATED: Use export functions instead
    // showNotification(`Report generated successfully! (${processedData.length} records)`, 'success', 5000);
}

// Toggle Export Dropdown
function toggleExportDropdown() {
    const dropdown = document.getElementById('exportDropdown');
    if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

// Toggle suppliers time filter dropdown
function toggleSuppliersTimeDropdown() {
    const dropdown = document.getElementById('suppliersTimeDropdown');
    if (dropdown) {
        if (dropdown.style.display === 'none' || dropdown.style.display === '') {
            dropdown.style.display = 'block';
            console.log('✅ Suppliers dropdown opened');
        } else {
            dropdown.style.display = 'none';
            console.log('✅ Suppliers dropdown closed');
        }
    } else {
        console.error('❌ Suppliers dropdown element not found');
    }
}


// Toggle Project Details three-dots dropdown
function toggleProjectPOColumnsDropdown(event) {
    const dropdown = document.getElementById('projectPOColumnsDropdown');
    const btn = document.getElementById('projectPOColumnsBtn');
    if (!dropdown || !btn) {
        console.warn('Project PO columns dropdown or button not found');
        return;
    }

    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    btn.setAttribute('aria-expanded', String(!isOpen));

    // Close when clicking outside
    if (!isOpen) {
        setTimeout(() => {
            const onDocClick = (e) => {
                if (!dropdown.contains(e.target) && e.target !== btn) {
                    dropdown.style.display = 'none';
                    btn.setAttribute('aria-expanded', 'false');
                    document.removeEventListener('click', onDocClick);
                }
            };
            document.addEventListener('click', onDocClick);
        }, 10);
    }
}

// Open the Configure Columns modal
function openConfigureColumns() {
    try {
        const modal = document.getElementById('configureColumnsModal');
        if (!modal) return console.warn('Configure columns modal not found');

        // determine project id context
        // Prefer the internal document id stored in localStorage (set by viewProjectDetails)
        const storedDocId = localStorage.getItem('currentProjectId');
        const pidEl = document.getElementById('detailProjectID');
        const displayedId = (pidEl && pidEl.textContent && pidEl.textContent.trim() !== '-') ? pidEl.textContent.trim() : null;
        const pid = storedDocId || displayedId || 'global';
        modal.dataset.projectId = pid;

        loadProjectDetailColumns(pid);
        modal.style.display = 'flex';
    } catch (e) {
        console.error('Error opening configure columns modal', e);
    }
}

function closeConfigureColumnsModal() {
    const modal = document.getElementById('configureColumnsModal');
    if (modal) modal.style.display = 'none';
}

function addNewProjectDetailColumn() {
    const input = document.getElementById('newProjectDetailColumnName');
    if (!input) return;
    const name = (input.value || '').trim();
    if (!name) {
        showNotification('Column name cannot be empty', 'error');
        return;
    }

    const modal = document.getElementById('configureColumnsModal');
    // Prefer internal doc id for stable keys
    const pid = (localStorage.getItem('currentProjectId')) || (modal && modal.dataset.projectId) || 'global';
    const key = `projectDetailColumns_${pid}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');

    // Prevent duplicates
    if (existing.find(c => c.toLowerCase() === name.toLowerCase())) {
        showNotification('Column already exists', 'error');
        input.value = '';
        return;
    }

    existing.push(name);
    try { localStorage.setItem(key, JSON.stringify(existing)); } catch (e) { console.error('Could not save column settings', e); }
    input.value = '';
    loadProjectDetailColumns(pid);
    showNotification('Column added', 'success');
}

function loadProjectDetailColumns(pid) {
    // Resolve keys: prefer document id stored in currentProjectId
    const docId = localStorage.getItem('currentProjectId') || pid;
    const displayId = (document.getElementById('detailProjectID') && document.getElementById('detailProjectID').textContent) ? document.getElementById('detailProjectID').textContent.trim() : pid;

    const docKey = `projectDetailColumns_${docId}`;
    const displayKey = `projectDetailColumns_${displayId}`;

    let cols = JSON.parse(localStorage.getItem(docKey) || 'null');
    if (!Array.isArray(cols)) {
        // try displayKey as fallback (migrate legacy saved under displayed project ID)
        const legacy = JSON.parse(localStorage.getItem(displayKey) || 'null');
        if (Array.isArray(legacy)) {
            cols = legacy;
            try { localStorage.setItem(docKey, JSON.stringify(legacy)); } catch (e) { console.warn('Could not migrate legacy column config', e); }
        } else {
            cols = JSON.parse(localStorage.getItem(docKey) || '[]');
        }
    }

    renderProjectDetailColumnsList(cols, docId);
    renderProjectDetailColumnsTable(docId);
}

function renderProjectDetailColumnsTable(pid) {
    // DISABLED - using hardcoded table in HTML instead
    return;
    try {
        const container = document.getElementById('projectLinkedPOsContainer');
        if (!container) return console.warn('Project linked POs container not found');

        const key = `projectDetailColumns_${pid}`;
        const cols = JSON.parse(localStorage.getItem(key) || '[]');

        // Build table wrapper
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.overflowX = 'auto';
        wrapper.style.marginTop = '12px';

        if (!Array.isArray(cols) || cols.length === 0) {
            // DISABLED - container has hardcoded table now
            // container.innerHTML = '<div style="color:#a0a0a0;font-size:13px;padding:18px;background:rgba(0,0,0,0.04);border-radius:6px;text-align:center;">No columns configured. Use Configure Columns to add fields for this project.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'data-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.id = 'projectDetailsTable';

        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        tr.id = 'projectDetailsTableHead';
        cols.forEach(colName => {
            const th = document.createElement('th');
            th.style.padding = '10px 12px';
            th.style.textAlign = 'left';
            th.style.color = '#0a9b03';
            th.style.fontWeight = '600';
            th.style.borderBottom = '2px solid rgba(10,155,3,0.2)';
            th.textContent = colName;
            tr.appendChild(th);
        });

        // Actions column
        const thAct = document.createElement('th');
        thAct.style.padding = '10px 12px';
        thAct.style.textAlign = 'left';
        thAct.style.color = '#0a9b03';
        thAct.style.fontWeight = '600';
        thAct.style.borderBottom = '2px solid rgba(10,155,3,0.2)';
        thAct.textContent = 'Actions';
        tr.appendChild(thAct);

        thead.appendChild(tr);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.id = 'projectDetailsTableBody';
        tbody.innerHTML = '<tr><td colspan="' + (cols.length + 1) + '" style="padding:18px;text-align:center;color:#a0a0a0;">No rows yet. Use PO Storage or Add Item to populate data.</td></tr>';
        table.appendChild(tbody);

        wrapper.appendChild(table);

        container.innerHTML = '';
        container.appendChild(wrapper);
    } catch (e) {
        console.error('Error rendering project detail columns table', e);
    }
}

function renderProjectDetailColumnsList(cols, pid) {
    const list = document.getElementById('projectDetailColumnsList');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(cols) || cols.length === 0) {
        const el = document.createElement('div');
        el.style.color = '#a0a0a0';
        el.style.padding = '12px';
        el.style.borderRadius = '6px';
        el.style.background = 'rgba(0,0,0,0.04)';
        el.textContent = 'No custom columns yet.';
        list.appendChild(el);
        return;
    }

    cols.forEach((col, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '8px';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '8px';

        const drag = document.createElement('span');
        drag.innerHTML = '⋮⋮';
        drag.style.opacity = '0.6';
        drag.style.cursor = 'grab';

        const name = document.createElement('div');
        name.textContent = col;
        name.style.fontWeight = '600';
        name.style.color = '#d0d0d0';

        left.appendChild(drag);
        left.appendChild(name);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.style.background = 'transparent';
        del.style.border = '1px solid rgba(255,255,255,0.06)';
        del.style.color = '#ff6b6b';
        del.style.padding = '6px 10px';
        del.style.borderRadius = '6px';
        del.style.cursor = 'pointer';
        del.onclick = () => deleteProjectDetailColumn(pid, idx);

        actions.appendChild(del);

        row.appendChild(left);
        row.appendChild(actions);

        list.appendChild(row);
    });
}

function deleteProjectDetailColumn(pid, index) {
    // Prefer internal doc id for stable keys
    const docId = localStorage.getItem('currentProjectId') || pid;
    const key = `projectDetailColumns_${docId}`;
    const cols = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(cols) || index < 0 || index >= cols.length) return;
    cols.splice(index, 1);
    try { localStorage.setItem(key, JSON.stringify(cols)); } catch (e) { console.error('Could not save column settings', e); }
    loadProjectDetailColumns(docId);
    showNotification('Column removed', 'success');
}

function saveProjectDetailColumns() {
    const modal = document.getElementById('configureColumnsModal');
    if (!modal) return;
    const pid = (localStorage.getItem('currentProjectId')) || modal.dataset.projectId || 'global';
    // currently columns already saved on add/delete; this step re-loads and closes
    loadProjectDetailColumns(pid);
    closeConfigureColumnsModal();
    showNotification('Columns configuration saved (local)', 'success');
}

// Select suppliers time scope
function selectSuppliersTimeScope(scope) {
    console.log('🔍 Supplier scope selected:', scope);
    
    const dropdown = document.getElementById('suppliersTimeDropdown');
    const btnText = document.getElementById('suppliersTimeBtnText');
    
    if (!btnText) {
        console.error('❌ suppliersTimeBtnText element not found');
        return;
    }
    
    // Update button text based on scope
    if (scope === 'all-time') {
        btnText.textContent = 'All-Time';
        console.log('✅ Filter set to All-Time');
    } else if (/^\d{4}$/.test(scope)) {
        // It's a year
        btnText.textContent = scope;
        console.log('✅ Filter set to year:', scope);
    } else {
        btnText.textContent = scope;
        console.log('✅ Filter set to:', scope);
    }
    
    // Close dropdown
    if (dropdown) {
        dropdown.style.display = 'none';
        console.log('✅ Dropdown closed');
    }
    
    // Update chart with new filter
    console.log('📊 Updating chart with new filter...');
    updateTopSuppliersChart();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const exportDropdown = document.getElementById('exportDropdown');
    const exportBtn = event.target.closest('.btn-actions');
    if (exportDropdown && !exportBtn && !event.target.closest('#exportDropdown')) {
        exportDropdown.style.display = 'none';
    }
    
    const suppliersDropdown = document.getElementById('suppliersTimeDropdown');
    const suppliersBtn = event.target.closest('.suppliers-time-btn');
    const suppliersDropdownBtn = event.target.closest('#suppliersTimeDropdown button');
    
    // Only close if clicking outside the dropdown and the button
    if (suppliersDropdown && !suppliersBtn && !suppliersDropdownBtn) {
        suppliersDropdown.style.display = 'none';
    }
});

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

// Export as EXCEL with proper formatting
function exportTrackingDataAsExcel() {
    const selectedStatus = document.getElementById('statusFilterDropdown').value;
    
    // Use ALL cached data
    let exportData = trackingCache || [];
    
    // Filter data based on selected status
    if (selectedStatus !== 'all') {
        exportData = exportData.filter(record => {
            const recordStatus = record.status?.toLowerCase() || '';
            const filterStatus = selectedStatus.toLowerCase() || '';
            return recordStatus === filterStatus;
        });
    }

    if (exportData.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    // Sort by P.O number (same as table)
    exportData = sortTrackingByPONumber(exportData);

    try {
        // Check if XLSX is available
        const XLSX = window.XLSX;
        if (!XLSX) {
            console.log('📄 XLSX not available, using CSV fallback');
            exportToCSV(exportData, selectedStatus);
            return;
        }

        // Prepare data for Excel
        const excelData = exportData.map((record, index) => {
            const poAmount = parseFloat(record.poAmount || 0);
            const paidAmount = parseFloat(record.paidAmount || 0);
            const balanceDue = poAmount - paidAmount;
            
            return {
                'Item': index + 1,
                'Month': getMonthText(record.month) || '',
                'Client': record.client || '',
                'Project Name': record.projectName || '',
                'Trade': record.trade || '',
                'MR #': record.mr || '',
                'MR Date': formatDateShort(record.mrDate) || '',
                'P.O Date': formatDateShort(record.poDate) || '',
                'Delivery Date': formatDateShort(record.deliveryDate) || '',
                'P.O No.': record.poNo || '',
                'Best Supplier': record.vendors || record.bestSupplier || '',
                'P.O Amount': poAmount,
                'Paid Amount': paidAmount,
                'Balance Due': balanceDue,
                'Payment Status': balanceDue === 0 ? 'FULLY PAID' : (paidAmount > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
                'Delivery Status': record.deliveryStatus || 'PENDING',
                'Status': record.status || 'On-going'
            };
        });

        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths (professional sizing)
        worksheet['!cols'] = [
            { wch: 6 },   // Item
            { wch: 12 },  // Month
            { wch: 14 },  // Client
            { wch: 18 },  // Project Name
            { wch: 14 },  // Trade
            { wch: 10 },  // MR #
            { wch: 12 },  // MR Date
            { wch: 12 },  // P.O Date
            { wch: 12 },  // Delivery Date
            { wch: 10 },  // P.O No.
            { wch: 18 },  // Best Supplier
            { wch: 14 },  // P.O Amount
            { wch: 14 },  // Paid Amount
            { wch: 14 },  // Balance Due
            { wch: 15 },  // Payment Status
            { wch: 15 },  // Delivery Status
            { wch: 12 }   // Status
        ];
        
        // Set row height for header
        worksheet['!rows'] = [{ hpx: 25 }];
        
        // Professional styling - matching website design
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        
        // Header styling (Dark navy background with green text - matching website)
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_col(C) + '1';
            if (!worksheet[address]) continue;
            worksheet[address].s = {
                font: { 
                    bold: true, 
                    color: { rgb: '0a9b03' }, // Green text
                    name: 'Calibri',
                    sz: 11
                },
                fill: { fgColor: { rgb: '1a3a52' } }, // Dark navy background
                alignment: { 
                    horizontal: 'center', 
                    vertical: 'center',
                    wrapText: true
                },
                border: {
                    left: { style: 'thin', color: { rgb: '0a9b03' } },
                    right: { style: 'thin', color: { rgb: '0a9b03' } },
                    top: { style: 'thin', color: { rgb: '0a9b03' } },
                    bottom: { style: 'thin', color: { rgb: '0a9b03' } }
                }
            };
        }
        
        // Data row styling with color-coded badge backgrounds for status columns
        for (let R = 1; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const address = XLSX.utils.encode_col(C) + (R + 1);
                if (!worksheet[address]) continue;
                
                const record = excelData[R - 1];
                const poAmount = record['P.O Amount'];
                const paidAmount = record['Paid Amount'];
                const balanceDue = poAmount - paidAmount;
                
                let cellColor = 'FFFFFF'; // Default white
                let fontColor = '000000'; // Default black text
                
                // Apply color coding based on column and status
                const colIndex = C;
                
                // Balance Due column (index 13) - Red for unpaid, Green for fully paid
                if (colIndex === 13) {
                    if (balanceDue > 0) {
                        fontColor = 'C41E3A'; // Red for unpaid balance
                    } else {
                        fontColor = '0a9b03'; // Green for fully paid
                    }
                }
                
                // Payment Status column (index 14) - Colored badge background
                if (colIndex === 14) {
                    if (record['Payment Status'] === 'FULLY PAID') {
                        cellColor = '0a9b03'; // Green background
                        fontColor = 'FFFFFF'; // White text
                    } else if (record['Payment Status'] === 'PARTIALLY PAID') {
                        cellColor = 'FFB81C'; // Gold/Orange background
                        fontColor = 'FFFFFF'; // White text
                    } else {
                        cellColor = 'C41E3A'; // Red background
                        fontColor = 'FFFFFF'; // White text
                    }
                }
                
                // Delivery Status column (index 15) - Colored badge background
                if (colIndex === 15) {
                    if (record['Delivery Status'] === 'FULLY RECEIVED') {
                        cellColor = '0a9b03'; // Green background
                        fontColor = 'FFFFFF'; // White text
                    } else if (record['Delivery Status'] === 'PARTIALLY RECEIVED') {
                        cellColor = 'FFB81C'; // Gold/Orange background
                        fontColor = 'FFFFFF'; // White text
                    } else {
                        cellColor = 'C41E3A'; // Red background
                        fontColor = 'FFFFFF'; // White text
                    }
                }
                
                // Status column (index 16) - Colored badge background
                if (colIndex === 16) {
                    const statusValue = record['Status']?.toLowerCase() || '';
                    if (statusValue === 'completed' || statusValue === 'delivered') {
                        cellColor = '0a9b03'; // Green
                        fontColor = 'FFFFFF';
                    } else if (statusValue === 'on-going') {
                        cellColor = 'FFB81C'; // Gold/Orange
                        fontColor = 'FFFFFF';
                    } else {
                        cellColor = 'C41E3A'; // Red
                        fontColor = 'FFFFFF';
                    }
                }
                
                worksheet[address].s = {
                    font: {
                        name: 'Calibri',
                        sz: 10,
                        color: { rgb: fontColor },
                        bold: false
                    },
                    fill: { fgColor: { rgb: cellColor } },
                    alignment: {
                        horizontal: (C >= 11 && C <= 13) ? 'right' : 'center', // Right align for amounts, center for status
                        vertical: 'center',
                        wrapText: true
                    },
                    border: {
                        left: { style: 'thin', color: { rgb: 'BFBFBF' } },
                        right: { style: 'thin', color: { rgb: 'BFBFBF' } },
                        top: { style: 'thin', color: { rgb: 'BFBFBF' } },
                        bottom: { style: 'thin', color: { rgb: 'BFBFBF' } }
                    }
                };
                
                // Format currency columns (P.O Amount, Paid Amount, Balance Due)
                if ((C === 11 || C === 12 || C === 13) && worksheet[address].v !== undefined) {
                    worksheet[address].z = '₱#,##0.00'; // Currency format
                }
            }
        }
        
        // Freeze header row
        worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
        
        // Format as table
        const tableName = 'PurchaseTrackingTable';
        const tableRef = XLSX.utils.encode_range(range);
        worksheet.table = {
            ref: tableRef,
            name: tableName,
            displayName: tableName,
            tableStyleInfo: {
                name: 'TableStyleMedium2',
                showFirstColumn: false,
                showLastColumn: false,
                showRowStripes: true,
                showColumnStripes: false
            }
        };
        
        // Add sheet and export
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Tracking');
        
        const dateStr = new Date().toISOString().slice(0, 10);
        const statusLabel = selectedStatus === 'all' ? 'All' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
        const filename = `Purchase_Tracking_${statusLabel}_${dateStr}.xlsx`;
        
        XLSX.writeFile(workbook, filename);
        
        // Close dropdown and show success
        const dropdown = document.getElementById('exportDropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        showNotification(`✅ Exported to EXCEL successfully! (${excelData.length} records)`, 'success', 5000);
        console.log('✅ Excel export successful:', filename);
        
    } catch (error) {
        console.error('❌ Error in Excel export:', error);
        // Fallback to CSV
        exportToCSV(exportData, selectedStatus);
    }
}

// CSV Export Fallback
function exportToCSV(exportData, selectedStatus) {
    try {
        const csvData = exportData.map(record => {
            const poAmount = parseFloat(record.poAmount || 0);
            const paidAmount = parseFloat(record.paidAmount || 0);
            const balanceDue = poAmount - paidAmount;
            
            return {
                Item: record.item || '',
                Month: getMonthText(record.month) || record.month || '',
                Client: record.client || '',
                'Project Name': record.projectName || '',
                Trade: record.trade || '',
                'MR #': record.mr || '',
                'MR Date': record.mrDate || '',
                'P.O Date': record.poDate || '',
                'Delivery Date': record.deliveryDate || '',
                'P.O No.': record.poNo || '',
                'Best Supplier': record.vendors || record.bestSupplier || '',
                'P.O Amount': `₱${poAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
                'Paid Amount': `₱${paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
                'Balance Due': `₱${balanceDue.toLocaleString('en-US', {minimumFractionDigits: 2})}`,
                'Payment Status': balanceDue === 0 ? 'FULLY PAID' : (paidAmount > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
                'Delivery Status': record.deliveryStatus || 'PENDING',
                Status: record.status || 'On-going'
            };
        });

        // Create CSV headers
        const headers = Object.keys(csvData[0]);
        let csvContent = headers.join(',') + '\n';
        
        // Add data rows
        csvData.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvContent += values.join(',') + '\n';
        });

        // Create download link
        const link = document.createElement('a');
        link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
        
        const dateStr = new Date().toISOString().slice(0, 10);
        const statusLabel = selectedStatus === 'all' ? 'All' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
        link.download = `Purchase_Tracking_${statusLabel}_${dateStr}.csv`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Close dropdown and show success
        const dropdown = document.getElementById('exportDropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        showNotification(`✅ Exported to CSV successfully! (${csvData.length} records) - Open with Excel`, 'success', 5000);
        console.log('✅ CSV export successful');
        
    } catch (error) {
        console.error('❌ Error in CSV export:', error);
        showNotification('Error exporting data: ' + error.message, 'error', 5000);
    }
}

// Export as PDF
function exportTrackingDataAsPDF() {
    const selectedStatus = document.getElementById('statusFilterDropdown').value;
    
    // Use ALL cached data
    let exportData = trackingCache || [];
    
    // Filter data based on selected status
    if (selectedStatus !== 'all') {
        exportData = exportData.filter(record => {
            const recordStatus = record.status?.toLowerCase() || '';
            const filterStatus = selectedStatus.toLowerCase() || '';
            return recordStatus === filterStatus;
        });
    }

    if (exportData.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    // Sort by P.O number (same as table)
    exportData = sortTrackingByPONumber(exportData);

    // Calculate balance due for each record
    const processedData = exportData.map((record, index) => {
        const poAmount = parseFloat(record.poAmount || 0);
        const paidAmount = parseFloat(record.paidAmount || 0);
        const balanceDue = poAmount - paidAmount;
        
        return {
            item: index + 1, // Continuous numbering like the table
            month: getMonthText(record.month) || '',
            client: record.client || '',
            projectName: record.projectName || '',
            trade: record.trade || '',
            mrNo: record.mr || '',
            mrDate: formatDateShort(record.mrDate) || '',
            poDate: formatDateShort(record.poDate) || '',
            deliveryDate: formatDateShort(record.deliveryDate) || '',
            poNo: record.poNo || '',
            bestSupplier: record.vendors || record.bestSupplier || '',
            poAmount: poAmount,
            paidAmount: paidAmount,
            balanceDue: balanceDue,
            paymentStatus: balanceDue === 0 ? 'FULLY PAID' : (paidAmount > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
            deliveryStatus: record.deliveryStatus || 'PENDING',
            status: record.status || 'On-going'
        };
    });

    // Create HTML table for PDF with styling that matches the web table
    let htmlContent = `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Purchase Tracking Report</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    color: #333;
                    padding: 0.5in;
                    background-color: white;
                }
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                    border-bottom: 3px solid #0a9b03;
                    padding-bottom: 15px;
                }
                h1 {
                    color: #0a9b03;
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }
                .generated-date {
                    color: #666;
                    font-size: 11px;
                    margin-bottom: 5px;
                }
                .record-count {
                    color: #999;
                    font-size: 10px;
                    font-weight: 600;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                    font-size: 10px;
                    line-height: 1.4;
                }
                thead {
                    background-color: #0a9b03;
                    color: white;
                    position: relative;
                }
                th {
                    padding: 10px 8px;
                    text-align: left;
                    font-weight: 700;
                    font-size: 9px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border: 1px solid #0a9b03;
                    word-wrap: break-word;
                    max-width: 100px;
                }
                td {
                    padding: 8px;
                    border: 1px solid #ddd;
                    font-size: 10px;
                    vertical-align: top;
                    word-wrap: break-word;
                    max-width: 100px;
                }
                tbody tr:nth-child(odd) {
                    background-color: #f9f9f9;
                }
                tbody tr:nth-child(even) {
                    background-color: #f0f8f0;
                }
                tbody tr:hover {
                    background-color: #e8f5e9;
                }
                /* Column widths */
                th:nth-child(1), td:nth-child(1) { width: 5%; }
                th:nth-child(2), td:nth-child(2) { width: 6%; }
                th:nth-child(3), td:nth-child(3) { width: 9%; }
                th:nth-child(4), td:nth-child(4) { width: 12%; }
                th:nth-child(5), td:nth-child(5) { width: 7%; }
                th:nth-child(6), td:nth-child(6) { width: 6%; }
                th:nth-child(7), td:nth-child(7) { width: 7%; }
                th:nth-child(8), td:nth-child(8) { width: 7%; }
                th:nth-child(9), td:nth-child(9) { width: 7%; }
                th:nth-child(10), td:nth-child(10) { width: 7%; }
                th:nth-child(11), td:nth-child(11) { width: 10%; }
                th:nth-child(12), td:nth-child(12) { width: 8%; }
                th:nth-child(13), td:nth-child(13) { width: 8%; }
                th:nth-child(14), td:nth-child(14) { width: 8%; }
                th:nth-child(15), td:nth-child(15) { width: 9%; }
                th:nth-child(16), td:nth-child(16) { width: 9%; }
                th:nth-child(17), td:nth-child(17) { width: 8%; }
                
                .amount-cell {
                    text-align: right;
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                }
                .balance-due-positive {
                    color: #c41e3a;
                    font-weight: bold;
                }
                .balance-due-zero {
                    color: #0a9b03;
                    font-weight: bold;
                }
                .payment-fully-paid {
                    color: #0a9b03;
                    font-weight: bold;
                }
                .payment-unpaid {
                    color: #c41e3a;
                    font-weight: bold;
                }
                .payment-partial {
                    color: #ff9800;
                    font-weight: bold;
                }
                .delivery-pending {
                    color: #c41e3a;
                }
                .delivery-received {
                    color: #0a9b03;
                }
                .delivery-partial {
                    color: #ff9800;
                }
                .footer {
                    margin-top: 20px;
                    padding-top: 15px;
                    border-top: 2px solid #ddd;
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                }
                @page {
                    size: landscape;
                    margin: 0.5in;
                }
                @media print {
                    body {
                        padding: 0;
                    }
                    table {
                        page-break-inside: avoid;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tr {
                        page-break-inside: avoid;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Purchase Tracking Report</h1>
                <p class="generated-date">Generated on ${new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit'
                })}</p>
                <p class="record-count">Total Records: ${processedData.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Month</th>
                        <th>Client</th>
                        <th>Project Name</th>
                        <th>Trade</th>
                        <th>MR #</th>
                        <th>MR Date</th>
                        <th>P.O Date</th>
                        <th>Delivery Date</th>
                        <th>P.O No.</th>
                        <th>Best Supplier</th>
                        <th>P.O Amount</th>
                        <th>Paid Amount</th>
                        <th>Balance Due</th>
                        <th>Payment Status</th>
                        <th>Delivery Status</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>`;

    processedData.forEach(row => {
        // Determine color classes for Payment Status and Delivery Status
        let paymentClass = 'payment-unpaid';
        if (row.paymentStatus === 'FULLY PAID') {
            paymentClass = 'payment-fully-paid';
        } else if (row.paymentStatus === 'PARTIALLY PAID') {
            paymentClass = 'payment-partial';
        }
        
        let deliveryClass = 'delivery-pending';
        if (row.deliveryStatus === 'FULLY RECEIVED') {
            deliveryClass = 'delivery-received';
        } else if (row.deliveryStatus === 'PARTIALLY RECEIVED') {
            deliveryClass = 'delivery-partial';
        }
        
        let balanceDueClass = row.balanceDue > 0 ? 'balance-due-positive' : 'balance-due-zero';
        
        htmlContent += `
                    <tr>
                        <td style="text-align: center;">${row.item}</td>
                        <td>${row.month}</td>
                        <td>${row.client}</td>
                        <td>${row.projectName}</td>
                        <td>${row.trade}</td>
                        <td style="text-align: center;">${row.mrNo}</td>
                        <td style="text-align: center;">${row.mrDate}</td>
                        <td style="text-align: center;">${row.poDate}</td>
                        <td style="text-align: center;">${row.deliveryDate}</td>
                        <td style="text-align: center;font-weight:bold;">${row.poNo}</td>
                        <td>${row.bestSupplier}</td>
                        <td class="amount-cell">₱${row.poAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td class="amount-cell">₱${row.paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td class="amount-cell ${balanceDueClass}">₱${row.balanceDue.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td class="${paymentClass}" style="text-align: center;">${row.paymentStatus}</td>
                        <td class="${deliveryClass}" style="text-align: center;">${row.deliveryStatus}</td>
                        <td style="text-align: center;">${row.status}</td>
                    </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>
            <div class="footer">
                <p>End of Report</p>
            </div>
        </body>
        </html>
    `;

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load, then print with landscape orientation
    printWindow.onload = function() {
        const dateStr = new Date().toISOString().slice(0, 10);
        const statusLabel = selectedStatus === 'all' ? 'All' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
        printWindow.document.title = `Purchase_Tracking_${statusLabel}_${dateStr}`;
        
        // Add comprehensive print styles to ensure perfect print output
        const printStyles = `
            @page {
                size: landscape;
                margin: 0.5in;
                @bottom-center {
                    content: "Page " counter(page) " of " counter(pages);
                    font-size: 10px;
                    color: #999;
                }
            }
            
            @media print {
                * {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    color-adjust: exact;
                }
                
                body {
                    margin: 0;
                    padding: 0;
                    background: white;
                    color: black;
                    font-size: 10px;
                }
                
                .header {
                    page-break-after: avoid;
                    margin-bottom: 10px;
                    padding-bottom: 10px;
                    border-bottom: 3px solid #0a9b03;
                }
                
                h1 {
                    color: #0a9b03;
                    margin: 0 0 8px 0;
                    font-size: 20px;
                }
                
                .generated-date, .record-count {
                    margin: 2px 0;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    page-break-inside: avoid;
                    margin: 0;
                }
                
                thead {
                    display: table-header-group;
                    background: #0a9b03;
                    color: white;
                    page-break-inside: avoid;
                }
                
                th {
                    background: #0a9b03 !important;
                    color: white !important;
                    padding: 8px;
                    text-align: left;
                    font-weight: 700;
                    font-size: 9px;
                    border: 1px solid #0a9b03;
                    page-break-inside: avoid;
                }
                
                tbody {
                    page-break-inside: avoid;
                }
                
                tr {
                    page-break-inside: avoid;
                    page-break-after: auto;
                }
                
                td {
                    padding: 6px;
                    border: 1px solid #ddd;
                    font-size: 10px;
                    vertical-align: top;
                }
                
                tbody tr:nth-child(odd) {
                    background-color: #f9f9f9;
                }
                
                tbody tr:nth-child(even) {
                    background-color: #f0f8f0;
                }
                
                .amount-cell {
                    text-align: right;
                    font-family: 'Courier New', monospace;
                    font-weight: 600;
                }
                
                .balance-due-positive {
                    color: #c41e3a;
                    font-weight: bold;
                }
                
                .balance-due-zero {
                    color: #0a9b03;
                    font-weight: bold;
                }
                
                .payment-fully-paid {
                    color: #0a9b03;
                    font-weight: bold;
                }
                
                .payment-unpaid {
                    color: #c41e3a;
                    font-weight: bold;
                }
                
                .payment-partial {
                    color: #ff9800;
                    font-weight: bold;
                }
                
                .delivery-pending {
                    color: #c41e3a;
                }
                
                .delivery-received {
                    color: #0a9b03;
                }
                
                .delivery-partial {
                    color: #ff9800;
                }
                
                .footer {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #ddd;
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                    page-break-before: avoid;
                }
            }
        `;
        
        // Create and append style for print
        const styleElement = printWindow.document.createElement('style');
        styleElement.innerHTML = printStyles;
        printWindow.document.head.appendChild(styleElement);
        
        // Trigger print after a short delay to ensure styles are loaded
        setTimeout(() => {
            printWindow.print();
        }, 500);
    };

    // Close dropdown
    document.getElementById('exportDropdown').style.display = 'none';
    
    // Show success notification
    showNotification(`PDF export opened! (${processedData.length} records)`, 'success', 5000);
}

// Change Delivery Status for HOLD items
function changeDeliveryStatus(recordId, currentStatus, cellElement) {
    const deliveryOptions = ['PENDING', 'PARTIALLY RECEIVED', 'FULLY RECEIVED'];
    
    // Store the context for later use
    window.pendingDeliveryStatusChange = {
        recordId: recordId,
        currentStatus: currentStatus,
        cellElement: cellElement,
        deliveryOptions: deliveryOptions
    };

    // Show the modal
    document.getElementById('changeDeliveryStatusModal').style.display = 'block';
}

function closeChangeDeliveryStatusModal() {
    document.getElementById('changeDeliveryStatusModal').style.display = 'none';
    window.pendingDeliveryStatusChange = null;
}

function selectDeliveryStatus(optionIndex) {
    const context = window.pendingDeliveryStatusChange;
    if (!context) {s
        showNotification('Error: Status change context lost', 'error');
        return;
    }

    const selectedOption = context.deliveryOptions[optionIndex];
    
    // Close modal immediately
    closeChangeDeliveryStatusModal();
    
    // Update UI immediately (visual feedback)
    const statusColors = {
        'PENDING': '#ff1744',
        'PARTIALLY RECEIVED': '#ffa500',
        'FULLY RECEIVED': '#0a9b03'
    };
    
    context.cellElement.textContent = selectedOption;
    context.cellElement.style.color = statusColors[selectedOption];
    
    showNotification(`Updating delivery status to: ${selectedOption}...`, 'info');

    // Save to database in background
    (async function() {
        try {
            console.log('🔄 Updating delivery status for record:', context.recordId);
            
            // Parse recordId to get project ID and item number
            const [projectId, itemNumber] = context.recordId.split('_');
            
            // Get all projects
            const projects = await getProjects();
            const project = projects.find(p => p.id === projectId);
            
            if (!project) {
                showNotification('Error: Project not found', 'error');
                return;
            }

            // Find and update the item
            const item = project.items.find(i => i.itemNumber === itemNumber);
            if (!item) {
                showNotification('Error: Item not found', 'error');
                return;
            }

            // Get the old delivery status
            const oldDeliveryStatus = item.deliveryStatus || 'PENDING';

            // Update the delivery status
            item.deliveryStatus = selectedOption;

            // Save to database
            await updateProjectRecord(projectId, project);
            console.log('✅ Delivery status updated successfully');

            // Log activity with detailed change
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'PURCHASE_ORDER',
                    action: 'UPDATE',
                    details: `Updated delivery status for item ${itemNumber} (${item.specification}) - Changed from: ${oldDeliveryStatus} → ${selectedOption}`,
                    moduleName: 'PURCHASING',
                    recordId: context.recordId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            showNotification('Delivery Status updated to: ' + selectedOption, 'success');

            // Refresh tracking table data
            refreshTrackingTableData();

        } catch (error) {
            console.error('❌ Error updating delivery status:', error);
            showNotification('Error updating delivery status: ' + error.message, 'error');
        } finally {
            window.pendingDeliveryStatusChange = null;
        }
    })();
}

function changePaymentStatus(recordId, currentStatus, cellElement) {
    const paymentOptions = ['UNPAID', 'PARTIALLY PAID', 'FULLY PAID'];
    
    // Store the context for later use
    window.pendingPaymentStatusChange = {
        recordId: recordId,
        currentStatus: currentStatus,
        cellElement: cellElement,
        paymentOptions: paymentOptions
    };

    // Show the modal
    document.getElementById('changePaymentStatusModal').style.display = 'block';
}

function closeChangePaymentStatusModal() {
    document.getElementById('changePaymentStatusModal').style.display = 'none';
    window.pendingPaymentStatusChange = null;
}

function selectPaymentStatus(optionIndex) {
    const context = window.pendingPaymentStatusChange;
    if (!context) {
        showNotification('Error: Status change context lost', 'error');
        return;
    }

    const selectedOption = context.paymentOptions[optionIndex];
    
    // Close modal immediately
    closeChangePaymentStatusModal();
    
    // Update UI immediately (visual feedback)
    const statusColors = {
        'UNPAID': '#ff1744',
        'PARTIALLY PAID': '#ffa500',
        'FULLY PAID': '#0a9b03'
    };
    
    context.cellElement.textContent = selectedOption;
    context.cellElement.style.color = statusColors[selectedOption];
    
    showNotification(`Updating payment status to: ${selectedOption}...`, 'info');

    // Save to database in background
    (async function() {
        try {
            console.log('🔄 Updating payment status for record:', context.recordId);
            
            // Parse recordId to get project ID and item number
            const [projectId, itemNumber] = context.recordId.split('_');
            
            // Get all projects
            const projects = await getProjects();
            const project = projects.find(p => p.id === projectId);
            
            if (!project) {
                showNotification('Error: Project not found', 'error');
                return;
            }

            // Find and update the item
            const item = project.items.find(i => i.itemNumber === itemNumber);
            if (!item) {
                showNotification('Error: Item not found', 'error');
                return;
            }

            // Get the old payment status
            const oldPaymentStatus = item.paymentStatus || 'UNPAID';

            // Update the payment status
            item.paymentStatus = selectedOption;

            // Save to database
            await updateProjectRecord(projectId, project);
            console.log('✅ Payment status updated successfully');

            // Log activity with detailed change
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'PAYMENT',
                    action: 'UPDATE',
                    details: `Updated payment status for item ${itemNumber} (${item.specification}) - Changed from: ${oldPaymentStatus} → ${selectedOption}`,
                    moduleName: 'PURCHASING',
                    recordId: context.recordId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            showNotification('Payment Status updated to: ' + selectedOption, 'success');

            // Refresh tracking table data
            refreshTrackingTableData();

        } catch (error) {
            console.error('❌ Error updating payment status:', error);
            showNotification('Error updating payment status: ' + error.message, 'error');
        } finally {
            window.pendingPaymentStatusChange = null;
        }
    })();
}

// Search Tracking
function searchTracking() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const table = document.getElementById('materials-table');
    const rows = table.querySelectorAll('tbody tr');

    if (searchTerm === '') {
        // If search is empty, show all rows
        rows.forEach(row => row.style.display = '');
        return;
    }

    let foundCount = 0;
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes(searchTerm)) {
            row.style.display = '';
            foundCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Show message if no results found
    if (foundCount === 0) {
        alert('No purchase tracking records found matching your search.');
    }
}

// Allow Enter key to trigger search
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                searchTracking();
            }
        });
    }
});

// Search Project Details Items
function searchProjectDetails() {
    const searchInput = document.getElementById('projectDetailsSearchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const table = document.querySelector('#project-details-page .hidden-data-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');

    if (searchTerm === '') {
        // If search is empty, show all rows
        rows.forEach(row => row.style.display = '');
        return;
    }

    let foundCount = 0;
    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes(searchTerm)) {
            row.style.display = '';
            foundCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Show message if no results found
    if (foundCount === 0) {
        alert('No project details found matching your search.');
    }
}

// Allow Enter key to trigger project details search
document.addEventListener('DOMContentLoaded', function() {
    const projectDetailsSearchInput = document.getElementById('projectDetailsSearchInput');
    if (projectDetailsSearchInput) {
        projectDetailsSearchInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                searchProjectDetails();
            }
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('projectDetailsDropdown');
        const toggle = document.querySelector('.dropdown-toggle');
        if (dropdown && toggle && !dropdown.contains(event.target) && !toggle.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
});

// Toggle Project Details Dropdown
function toggleProjectDetailsDropdown() {
    // Project Details dropdown removed — no-op to avoid runtime errors
    return;
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('projectDetailsDropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    if (dropdown && dropdownMenu && !dropdownMenu.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

// Column functions removed (feature deleted)
let columnOrder = [];

// NOTE: legacy configure-columns no-op functions removed to avoid duplication.

// Projects table column settings
const projectsTableColumnSettings = {
    'projectID': { name: 'Project ID', visible: true },
    'client': { name: 'Client', visible: true },
    // renamed column that previously showed name; now display code instead
    'projectName': { name: 'Project', visible: true },
    'location': { name: 'Location', visible: true },
    'trade': { name: 'Trade', visible: true },
    'budget': { name: 'Project Budget', visible: true },
    'remainingBudget': { name: 'Remaining Budget', visible: true },
    'poLink': { name: 'P.O Link', visible: true },
    'status': { name: 'Status', visible: true }
    // Note: Actions column is handled separately and always stays at the end
};

// Projects table column order (preserves the order of columns)
let projectsTableColumnOrder = ['projectID', 'client', 'projectName', 'location', 'trade', 'budget', 'remainingBudget', 'poLink', 'status'];

// Open Configure Projects Table Columns Modal
function openConfigureProjectsTableColumnsModal() {
    // projects table columns modal removed — no-op to avoid runtime errors
    console.log('ℹ️ openConfigureProjectsTableColumnsModal() called but modal was removed; no action taken');
}

// Close Configure Projects Table Columns Modal
function closeConfigureProjectsTableColumnsModal() {
    // projects table columns modal removed — no-op
    console.log('ℹ️ closeConfigureProjectsTableColumnsModal() called but modal was removed; no action taken');
}

// Populate projects table column checkboxes
function populateProjectsTableColumnCheckboxes() {
    // projects table columns UI removed — no-op
    console.log('ℹ️ populateProjectsTableColumnCheckboxes() called but UI was removed; no action taken');
}

// Delete a projects table column
function deleteProjectsTableColumn(columnName) {
    // Store pending column name and type for confirmation
    window.pendingDeleteColumnName = columnName;
    window.pendingDeleteColumnType = 'projectsTable';
    
    // Show confirmation modal
    const modal = document.getElementById('deleteConfirmationModal');
    const confirmationMessage = document.getElementById('confirmationMessage');
    confirmationMessage.textContent = `Are you sure you want to delete the "${columnName}" column from the projects table?`;
    
    modal.style.display = 'block';
}

// Toggle configure details visibility for projects table modal
function toggleConfigureDetailsProjects() {
    const contentDiv = document.getElementById('configureDetailsContent');
    const btn = document.getElementById('toggleDetailsBtn');
    
    if (contentDiv.style.display === 'none' || contentDiv.style.display === '') {
        contentDiv.style.display = 'block';
        btn.textContent = 'Hide Details';
    } else {
        contentDiv.style.display = 'none';
        btn.textContent = 'Show Details';
    }
}

function toggleConfigureDetailsProjectDetails() {
    const contentDiv = document.getElementById('configureDetailsContentProjectDetails');
    const btn = document.getElementById('toggleDetailsBtnProjectDetails');
    
    if (contentDiv.style.display === 'none' || contentDiv.style.display === '') {
        contentDiv.style.display = 'block';
        btn.textContent = 'Hide Details';
    } else {
        contentDiv.style.display = 'none';
        btn.textContent = 'Show Details';
    }
}

// Handle toggle for projects table column
function handleProjectsTableColumnToggle(fieldName) {
    projectsTableColumnSettings[fieldName].visible = document.getElementById(`projects_col_${fieldName}`).checked;
    autoSaveProjectsTableColumnSettings();
    applyProjectsTableColumnVisibility();
    console.log('✅ Column toggled:', fieldName, projectsTableColumnSettings[fieldName].visible);
}

// Handle renaming for projects table column
function handleProjectsTableColumnRename(fieldName, newName) {
    if (newName && newName.trim()) {
        projectsTableColumnSettings[fieldName].name = newName.trim();
        autoSaveProjectsTableColumnSettings();
        applyProjectsTableColumnVisibility();
        console.log('✅ Column renamed:', fieldName, 'to', newName);
    }
}

// Drag and drop handlers for projects table columns
let projectsColumnDraggedElement = null;

function handleProjectsTableColumnDragStart(e) {
    projectsColumnDraggedElement = e.target.closest('.projects-column-item');
    if (projectsColumnDraggedElement) {
        projectsColumnDraggedElement.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        console.log('🎯 Started dragging column:', projectsColumnDraggedElement.dataset.column);
    }
}

function handleProjectsTableColumnDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.projects-column-item');
    const container = document.getElementById('projectsTableColumnsCheckboxList');
    
    // Clear all highlights
    document.querySelectorAll('.projects-column-item').forEach(item => {
        item.style.borderTop = 'none';
        item.style.background = 'rgba(255,255,255,0.05)';
    });
    
    if (target && target !== projectsColumnDraggedElement) {
        target.style.borderTop = '3px solid #0a9b03';
        target.style.background = 'rgba(10,155,3,0.2)';
        console.log('🎯 Dragging over:', target.dataset.column);
    }
}

function handleProjectsTableColumnDrop(e) {
    e.preventDefault();
    const target = e.target.closest('.projects-column-item');
    if (target && target !== projectsColumnDraggedElement) {
        const container = document.getElementById('projectsTableColumnsCheckboxList');
        target.style.borderTop = 'none';
        container.insertBefore(projectsColumnDraggedElement, target);
        
        // Rebuild projectsTableColumnOrder with new order based on DOM
        const oldOrder = [...projectsTableColumnOrder];
        projectsTableColumnOrder = [];
        
        container.querySelectorAll('.projects-column-item').forEach(item => {
            const column = item.dataset.column;
            if (column && column.trim()) {
                projectsTableColumnOrder.push(column);
            }
        });
        
        console.log('🔄 Projects table column order changed:', { oldOrder, newOrder: projectsTableColumnOrder });
        console.log('📊 Column settings present:', Object.keys(projectsTableColumnSettings));
        
        // Rebuild table headers with new column order to prevent misalignment
        try {
            applyProjectsTableColumnVisibility();
            console.log('✅ Table headers rebuilt in new column order');
        } catch (error) {
            console.warn('⚠️ Error rebuilding table headers:', error);
        }
        
        // Re-render the projects table with new column order
        try {
            // Check if we have data in pagination state
            if (projectsTablePaginationState.allProjects && projectsTablePaginationState.allProjects.length > 0) {
                // Use pagination render if data is loaded
                const currentPage = projectsTablePaginationState.currentPage || 1;
                renderProjectsTablePage(currentPage);
                console.log('✅ Projects table re-rendered with new column order (pagination mode)');
            } else if (projectsCache && projectsCache.length > 0) {
                // Use fast render if cache is available
                renderProjectsTableFast(projectsCache);
                applyProjectsTableColumnVisibility();
                console.log('✅ Projects table re-rendered with new column order (cache mode)');
            } else {
                // Reload projects completely
                console.log('📊 Reloading projects to apply column reordering...');
                loadProjects();
            }
        } catch (error) {
            console.warn('⚠️ Error re-rendering projects table:', error);
        }
        
        // Auto-save to database
        autoSaveProjectsTableColumnSettings();
    }
}

function handleProjectsTableColumnDragEnd(e) {
    if (projectsColumnDraggedElement) {
        projectsColumnDraggedElement.style.opacity = '1';
        projectsColumnDraggedElement.style.borderTop = 'none';
    }
    document.querySelectorAll('.projects-column-item').forEach(item => {
        item.style.borderTop = 'none';
        item.style.background = 'rgba(255,255,255,0.05)';
    });
    console.log('✅ Drag ended - all styles cleaned up');
}

// Handle container drop (for dropping at the end of the list)
function handleProjectsTableContainerDrop(e) {
    e.preventDefault();
    const container = document.getElementById('projectsTableColumnsCheckboxList');
    
    // Check if a column item is being dragged to the container
    if (projectsColumnDraggedElement && projectsColumnDraggedElement.parentElement === container) {
        // If no target item was found, append to the end of the container
        const lastItem = container.lastElementChild;
        if (lastItem && lastItem !== projectsColumnDraggedElement && lastItem.classList.contains('projects-column-item')) {
            // Check if the dragged element is at the end; if not, move it there
            if (projectsColumnDraggedElement.nextElementSibling !== null) {
                container.appendChild(projectsColumnDraggedElement);
                
                // Rebuild projectsTableColumnOrder with new order based on DOM
                const oldOrder = [...projectsTableColumnOrder];
                projectsTableColumnOrder = [];
                
                container.querySelectorAll('.projects-column-item').forEach(item => {
                    const column = item.dataset.column;
                    if (column && column.trim()) {
                        projectsTableColumnOrder.push(column);
                    }
                });
                
                console.log('🔄 Projects table column order changed (container drop):', { oldOrder, newOrder: projectsTableColumnOrder });
                
                // Rebuild table headers
                try {
                    applyProjectsTableColumnVisibility();
                    console.log('✅ Table headers rebuilt');
                } catch (error) {
                    console.warn('⚠️ Error rebuilding headers:', error);
                }
                
                // Re-render table
                try {
                    if (projectsTablePaginationState.allProjects && projectsTablePaginationState.allProjects.length > 0) {
                        const currentPage = projectsTablePaginationState.currentPage || 1;
                        renderProjectsTablePage(currentPage);
                    } else if (projectsCache && projectsCache.length > 0) {
                        renderProjectsTableFast(projectsCache);
                        applyProjectsTableColumnVisibility();
                    } else {
                        loadProjects();
                    }
                } catch (error) {
                    console.warn('⚠️ Error re-rendering table:', error);
                }
                
                // Auto-save
                autoSaveProjectsTableColumnSettings();
            }
        }
    }
}

// Apply visibility to projects table
function applyProjectsTableColumnVisibility() {
    const table = document.querySelector('#projects-page .data-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    // Rebuild header based on current column settings
    headerRow.innerHTML = '';
    
    // Get visible fields in order using projectsTableColumnOrder
    const visibleFields = [];
    projectsTableColumnOrder.forEach(fieldName => {
        if (fieldName in projectsTableColumnSettings) {
            const column = projectsTableColumnSettings[fieldName];
            if (column.visible) {
                visibleFields.push(fieldName);
                const th = document.createElement('th');
                th.textContent = column.name;
                th.style.padding = '8px 12px';
                th.style.textAlign = 'left';
                th.style.color = '#0a9b03';
                th.style.fontWeight = '600';
                th.style.fontSize = '12px';
                th.style.textTransform = 'uppercase';
                th.style.letterSpacing = '0.5px';
                th.style.borderBottom = '2px solid rgba(10,155,3,0.3)';
                headerRow.appendChild(th);
            }
        }
    });
    
    // Always add Actions header at the end
    const actionsTh = document.createElement('th');
    actionsTh.textContent = 'Actions';
    actionsTh.style.padding = '8px 12px';
    actionsTh.style.textAlign = 'left';
    actionsTh.style.color = '#0a9b03';
    actionsTh.style.fontWeight = '600';
    actionsTh.style.fontSize = '12px';
    actionsTh.style.textTransform = 'uppercase';
    actionsTh.style.letterSpacing = '0.5px';
    actionsTh.style.borderBottom = '2px solid rgba(10,155,3,0.3)';
    headerRow.appendChild(actionsTh);
    
    console.log('✅ Projects table headers rebuilt with column names');
}

// Save projects table column settings
function saveProjectsTableColumnSettings() {
    // Projects table columns UI was removed; save settings locally only
    try {
        const settings = {
            columnVisibility: projectsTableColumnSettings,
            columnOrder: projectsTableColumnOrder,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('projectsTableColumnSettings', JSON.stringify(settings));
        console.log('ℹ️ saveProjectsTableColumnSettings() persisted locally');
    } catch (e) {
        console.warn('⚠️ saveProjectsTableColumnSettings() failed to save locally:', e);
        return false;
    }
    return true;
}

// Auto-save projects table column settings
function autoSaveProjectsTableColumnSettings() {
    try {
        const settings = {
            columnVisibility: projectsTableColumnSettings,
            columnOrder: projectsTableColumnOrder,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('projectsTableColumnSettings', JSON.stringify(settings));
        
        // Save to Firebase with user ID
        const userSession = getUserSession();
        if (userSession && userSession.user_id && typeof saveColumnConfiguration === 'function') {
            try {
                saveColumnConfiguration(userSession.user_id, settings);
                console.log('⚡ Projects table column settings auto-saved to Firebase for user:', userSession.user_id);
            } catch (fbError) {
                console.warn('⚠️ Could not auto-save to Firebase:', fbError);
            }
        } else {
            console.log('ℹ️ No user session available - auto-save to localStorage only');
        }
        
        console.log('⚡ Projects table column settings auto-saved');
    } catch (e) {
        console.warn('⚠️ Failed to auto-save projects table settings:', e);
    }
}

// Load projects table column settings
function loadProjectsTableColumnSettings() {
    // projects table load: best-effort local-only
    try {
        const saved = localStorage.getItem('projectsTableColumnSettings');
        if (saved) {
            const config = JSON.parse(saved);
            if (config.columnOrder && Array.isArray(config.columnOrder)) projectsTableColumnOrder = config.columnOrder;
            if (config.columnVisibility) projectsTableColumnSettings = config.columnVisibility;
            console.log('ℹ️ loadProjectsTableColumnSettings() loaded from localStorage');
        }
    } catch (e) {
        console.warn('⚠️ loadProjectsTableColumnSettings() failed:', e);
    }
}

// Add new column to projects table
function addNewProjectsTableColumn() {
    // projects table column UI removed — no-op
    console.log('ℹ️ addNewProjectsTableColumn() called but UI was removed; no action taken');
}

// Populate column checkboxes for project details table
function populateColumnCheckboxes() {
    const container = document.getElementById('projectColumnsCheckboxList');
    if (!container) return;
    
    container.innerHTML = '';

    // Iterate through columnOrder to preserve the current order
    columnOrder.forEach((column, index) => {
        if (!(column in projectColumnSettings)) return; // Skip if not in settings
        const isChecked = projectColumnSettings[column];
        // Get display name from localStorage if available, otherwise use column name
        const displayName = getColumnDisplayName(column) || column;
        
        const itemHTML = `
            <div 
                class="column-item"
                data-column="${column}"
                data-index="${index}"
                draggable="true"
                style="
                    display:flex;
                    align-items:center;
                    gap:12px;
                    padding:12px;
                    background:rgba(255,255,255,0.05);
                    border:1px solid rgba(10,155,3,0.2);
                    border-radius:6px;
                    cursor:move;
                    transition:all 0.2s;
                    user-select:none;
                "
                ondragstart="handleColumnDragStart(event)"
                ondragover="handleColumnDragOver(event)"
                ondrop="handleColumnDrop(event)"
                ondragend="handleColumnDragEnd(event)"
                onmouseover="this.style.background='rgba(10,155,3,0.1)';this.style.borderColor='rgba(10,155,3,0.5)'"
                onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(10,155,3,0.2)'"
            >
                <i class="fa-solid fa-grip-vertical" style="color:#0a9b03;font-size:14px;opacity:0.6;"></i>
                <input 
                    type="checkbox" 
                    id="col_${column}" 
                    ${isChecked ? 'checked' : ''} 
                    onchange="handleColumnToggle('${column}')"
                    style="cursor:pointer;width:18px;height:18px;accent-color:#0a9b03;flex-shrink:0;">
                <input 
                    type="text" 
                    id="colName_${column}" 
                    value="${displayName}" 
                    onchange="saveColumnDisplayName('${column}', this.value)"
                    style="flex:1;padding:6px 8px;background:rgba(255,255,255,0.08);border:1px solid rgba(10,155,3,0.2);border-radius:4px;color:#e0e0e0;font-size:13px;cursor:text;"
                    onfocus="this.style.background='rgba(10,155,3,0.15)';this.style.borderColor='rgba(10,155,3,0.5)'"
                    onblur="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='rgba(10,155,3,0.2)'"
                    title="Click to rename this column header"
                >
                <button 
                    onclick="deleteColumn('${column}')" 
                    style="background:none;border:none;color:#ff4444;cursor:pointer;font-size:16px;padding:4px 8px;transition:all 0.2s;flex-shrink:0;"
                    title="Delete this column"
                    onmouseover="this.style.color='#ff1744';this.style.transform='scale(1.2)';"
                    onmouseout="this.style.color='#ff4444';this.style.transform='scale(1)';"
                >
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        container.innerHTML += itemHTML;
    });
}

// Display name functions removed (feature deleted).

function handleColumnDragEnd(e) {
    draggedElement.style.opacity = '1';
    draggedElement = null;
    const container = document.getElementById('projectColumnsCheckboxList');
    Array.from(container.querySelectorAll('.column-item')).forEach(item => {
        item.style.borderTop = 'none';
    });
}

// Handle column toggle with auto-save
function handleColumnToggle(column) {
    const checkbox = document.getElementById(`col_${column}`);
    projectColumnSettings[column] = checkbox.checked;
    
    console.log(`📌 Column visibility changed - ${column}: ${checkbox.checked}`);
    
    // Auto-save to database - WAIT for it
    (async function() {
        try {
            await autoSaveColumnSettings();
            console.log('✅ Column toggle saved to Firebase');
        } catch (error) {
            console.error('❌ Failed to save column toggle:', error);
        }
    })();
    
    // Apply visibility changes immediately
    applyColumnVisibility();
}

// Add new column function
// Add new column function removed (feature deleted).

// Add column to the table dynamically
function addColumnToTable(columnName) {
    const table = document.querySelector('.hidden-data-table');
    if (!table) return;
    
    // Add header
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
        const newHeader = document.createElement('th');
        newHeader.setAttribute('data-column', columnName);
        newHeader.textContent = columnName;
        newHeader.style.display = '';
        headerRow.appendChild(newHeader);
    }
    
    // Add cells to all rows
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
        const newCell = document.createElement('td');
        newCell.textContent = '';
        newCell.style.display = '';
        row.appendChild(newCell);
    });
    
    console.log('✅ Column added to table:', columnName);
}

// Auto-save column settings to database
async function autoSaveColumnSettings() {
    try {
        const session = getUserSession();
        if (!session || !session.user_id) {
            console.warn('⚠️ User session not found, saving locally only');
            localStorage.setItem('projectColumnSettings', JSON.stringify({ 
                columnOrder: columnOrder, 
                columnVisibility: projectColumnSettings,
                updatedAt: new Date().toISOString()
            }));
            return { success: true, message: 'Saved locally only' };
        }

        // Prepare data for Firebase
        const columnConfig = {
            columnOrder: columnOrder,
            columnVisibility: projectColumnSettings,
            updatedAt: new Date().toISOString(),
            userId: session.user_id
        };

        // Save to localStorage first (for offline support)
        localStorage.setItem('projectColumnSettings', JSON.stringify(columnConfig));
        console.log('💾 Settings saved to localStorage');

        // Save to Firebase (Firestore) - WAIT for it
        try {
            const result = await saveColumnConfiguration(session.user_id, columnConfig);
            console.log('✅ Column settings SUCCESSFULLY saved to Firebase:', columnConfig);
            return { success: true, message: 'Saved to Firebase', result: result };
        } catch (dbError) {
            console.error('❌ FAILED to save to Firebase:', dbError);
            throw new Error(`Firebase save failed: ${dbError.message}`);
        }

    } catch (error) {
        console.error('❌ Error auto-saving column settings:', error);
        // Try to at least save to localStorage
        try {
            localStorage.setItem('projectColumnSettings', JSON.stringify({ 
                columnOrder: columnOrder, 
                columnVisibility: projectColumnSettings 
            }));
            console.warn('⚠️ Saved to localStorage only (Firebase failed)');
            throw error;
        } catch (storageErr) {
            console.error('❌ CRITICAL: Could not save to localStorage either:', storageErr);
            throw error;
        }
    }
}

// Save column settings (manual save - called from modal "Save" button)
function saveProjectColumnSettings() {
    try {
        // Get all checkboxes and update settings from modal UI
        Object.keys(projectColumnSettings).forEach(column => {
            const checkbox = document.getElementById(`col_${column}`);
            if (checkbox) {
                projectColumnSettings[column] = checkbox.checked;
            }
        });

        console.log('💾 SAVING column settings from modal:', { columnOrder, projectColumnSettings });

        // Show saving notification
        showNotification('💾 Saving column configuration...', 'info', 10000);

        // Auto-save to database (async)
        (async function() {
            try {
                console.log('⏳ Waiting for Firebase save...');
                const saveResult = await autoSaveColumnSettings();
                console.log('✅ Firebase save completed:', saveResult);
                
                // Verify data was saved by loading it back
                const session = getUserSession();
                if (session && session.user_id) {
                    try {
                        const verifyConfig = await loadColumnConfiguration(session.user_id);
                        console.log('✅ VERIFIED - Data saved in Firebase:', verifyConfig);
                        if (!verifyConfig || !verifyConfig.columnOrder) {
                            console.error('❌ VERIFICATION FAILED - columnOrder is missing!');
                        }
                    } catch (verifyError) {
                        console.warn('⚠️ Could not verify Firebase save:', verifyError);
                    }
                }
                
                // Apply column visibility and reorder to table
                applyColumnVisibility();
                reorderTableColumns();
                
                // Re-render the table with current data to ensure columns display correctly with data
                const currentPage = projectDetailsTablePaginationState.currentPage || 1;
                renderProjectDetailsTablePage(currentPage);
                
                // Close modal
                closeConfigureColumnsModal();
                
                // Show success notification
                showNotification('✅ Column configuration SAVED and applied!', 'success', 3000);
                console.log('✅ Complete - Settings saved, applied, and modal closed');
            } catch (error) {
                console.error('❌ ERROR saving column settings:', error);
                showNotification('❌ FAILED to save column settings: ' + error.message, 'error', 5000);
            }
        })();
    } catch (error) {
        console.error('❌ Error in saveProjectColumnSettings:', error);
        showNotification('❌ Error processing column settings', 'error', 2000);
    }
}

// Reconstruct table headers to include custom columns from columnOrder
// Reconstruct headers function removed (feature deleted).

// Reorder table columns based on columnOrder array
// Reorder columns function removed (feature deleted).

// Apply visibility function removed (feature deleted).

// Load column settings on page load
async function loadProjectColumnSettings() {
    try {
        const session = getUserSession();
        const defaultOrder = getDefaultColumnOrder();
        
        // First, check localStorage for quick access
        const savedLocal = localStorage.getItem('projectColumnSettings');
        if (savedLocal) {
            try {
                const config = JSON.parse(savedLocal);
                
                // Load column order if available and valid
                if (config.columnOrder && Array.isArray(config.columnOrder) && config.columnOrder.length > 0) {
                    columnOrder = config.columnOrder;
                    console.log('⚡ Column order loaded from localStorage:', columnOrder);
                }
                
                // Load column visibility if available
                if (config.columnVisibility) {
                    Object.assign(projectColumnSettings, config.columnVisibility);
                    console.log('⚡ Column visibility loaded from localStorage');
                } else if (config.visibility) {
                    // Fallback for old format
                    Object.assign(projectColumnSettings, config.visibility);
                }
            } catch (e) {
                console.warn('⚠️ Could not parse localStorage settings:', e);
            }
        }
        
        // Then, try to load from Firebase (for persistence across devices/browsers)
        if (session && session.user_id) {
            try {
                console.log('🔄 Loading column settings from Firebase for user:', session.user_id);
                const firebaseConfig = await loadColumnConfiguration(session.user_id);
                
                if (firebaseConfig) {
                    // Update from Firebase (overrides localStorage if it exists)
                    if (firebaseConfig.columnOrder && Array.isArray(firebaseConfig.columnOrder) && firebaseConfig.columnOrder.length > 0) {
                        columnOrder = firebaseConfig.columnOrder;
                        console.log('✅ Column order loaded from Firebase:', columnOrder);
                    }
                    
                    if (firebaseConfig.columnVisibility) {
                        Object.assign(projectColumnSettings, firebaseConfig.columnVisibility);
                        console.log('✅ Column visibility loaded from Firebase');
                    }
                    
                    // Sync Firebase data to localStorage
                    localStorage.setItem('projectColumnSettings', JSON.stringify({
                        columnOrder: columnOrder,
                        columnVisibility: projectColumnSettings,
                        updatedAt: firebaseConfig.updatedAt || new Date().toISOString()
                    }));
                } else {
                    console.log('ℹ️ No column settings found in Firebase (first time user)');
                }
            } catch (e) {
                console.warn('⚠️ Could not load from Firebase (offline?):', e.message);
            }
        }
        
        // Fallback: ensure columnOrder has valid columns
        if (!columnOrder || columnOrder.length === 0 || !Array.isArray(columnOrder)) {
            console.warn('⚠️ Column order invalid, using default order');
            columnOrder = defaultOrder;
        }
        
        // Ensure all visibility settings exist
        defaultOrder.forEach(column => {
            if (!(column in projectColumnSettings)) {
                projectColumnSettings[column] = true;
            }
        });
        
        console.log('✅ Final column settings loaded:', { columnOrder, projectColumnSettings });
        
        // Apply with small delay to ensure table is ready
        setTimeout(() => {
            applyColumnVisibility();
            reorderTableColumns();
            populateColumnCheckboxes(); // Update the modal UI
        }, 50);
        
    } catch (error) {
        console.error('❌ Error loading column settings:', error);
        // Last resort: apply defaults
        columnOrder = getDefaultColumnOrder();
        setTimeout(() => {
            applyColumnVisibility();
            reorderTableColumns();
        }, 50);
    }
}

// Store current row being edited for tracking
let currentTrackingRow = null;

// Open Edit Tracking Modal
function editTrackingRecord(button) {
    try {
        console.log('🔍 Edit Tracking Record button clicked');

        currentTrackingRow = button.closest('tr');

        if (!currentTrackingRow) {
            console.error('❌ Could not find table row for edit button');
            return;
        }

        console.log('🔍 Found tracking row:', currentTrackingRow);

        // Get the record ID from the row's data attribute or cell
        let recordId = currentTrackingRow.getAttribute('data-id');

        const cells = currentTrackingRow.querySelectorAll('td');
        console.log('🔍 Total cells in row:', cells.length);

        if (cells.length < 16) {
            console.error('❌ Expected at least 16 columns, but found:', cells.length);
            return;
        }

        // Store record ID in a hidden field for later use
        if (!recordId && cells.length > 0) {
            // If no data-id, try to extract from first visible cell or generate
            recordId = cells[0].textContent.trim() + '_' + Date.now();
        }

        console.log('🔍 Record ID:', recordId);
        // Populate form with current row data - Updated indices for new columns
        // Columns: Item(0) | Month(1) | Client(2) | Project Name(3) | Trade(4) | MR #(5) | MR Date(6) | P.O Date(7) | P.O No(8) | Vendors(9) | P.O Amount(10) | Paid Amount(11) | Balance Due(12) | Payment Status(13) | Delivery Status(14) | Status(15) | Actions(16)

        document.getElementById('editItem').value = cells[0].textContent.trim();
        document.getElementById('editMonth').value = cells[1].textContent.trim();
        document.getElementById('editClient').value = cells[2].textContent.trim();
        document.getElementById('editProjectName').value = cells[3].textContent.trim();
        document.getElementById('editTrade').value = cells[4].textContent.trim();
        document.getElementById('editMR').value = cells[5].textContent.trim();
        document.getElementById('editMRDate').value = cells[6].textContent.trim();
        document.getElementById('editPODate').value = cells[7].textContent.trim();
        document.getElementById('editPONo').value = cells[8].textContent.trim();
        document.getElementById('editVendors').value = cells[9].textContent.trim();

        // Extract numeric value from currency formatted text
        const poAmountText = cells[10].textContent.trim().replace('₱', '').replace(/,/g, '');
        document.getElementById('editPOAmount').value = parseFloat(poAmountText);
        console.log('🔍 P.O Amount populated:', parseFloat(poAmountText));

        const paidAmountText = cells[11].textContent.trim().replace('₱', '').replace(/,/g, '');
        document.getElementById('editPaidAmount').value = parseFloat(paidAmountText);
        console.log('🔍 Paid Amount populated:', parseFloat(paidAmountText));

        // Try to get payment date from item data if available
        // For now, we'll leave it empty so user can enter it when editing
        const projectDetailsTable = projectDetailsTablePaginationState?.allItems || [];
        const matchingItem = projectDetailsTable.find(itm => itm.itemNumber == cells[0].textContent.trim());
        if (matchingItem && matchingItem.paymentDate) {
            document.getElementById('editPaymentDate').value = matchingItem.paymentDate;
            console.log('🔍 Payment Date loaded:', matchingItem.paymentDate);
        }

        // Extract status from badge (now at index 15)
        const statusBadge = cells[15].querySelector('.status-badge');
        if (statusBadge) {
            const statusText = statusBadge.textContent.trim();
            document.getElementById('editStatus').value = statusText;
            console.log('🔍 Status populated:', statusText);
        }

        // Store record ID in the row for later use
        currentTrackingRow.setAttribute('data-id', recordId);

        // Show modal
        const editModal = document.getElementById('editTrackingModal');
        if (!editModal) {
            console.error('❌ Edit Tracking Modal not found');
            return;
        }

        console.log('✅ Opening Edit Tracking Modal');
        editModal.style.display = 'block';
    } catch (error) {
        console.error('❌ Error in editTrackingRecord:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Close Edit Tracking Modal
function closeEditTrackingModal() {
    document.getElementById('editTrackingModal').style.display = 'none';
    currentTrackingRow = null;
}

// Delete Tracking Record with Confirmation
function deleteTrackingRecordConfirm(recordId, itemName) {
    // Store the record ID for later use in confirmDelete
    window.pendingDeleteTrackingId = recordId;
    window.pendingDeleteTrackingItem = itemName;

    // Show confirmation modal
    const confirmationMessage = `Are you sure you want to delete the tracking record? This action cannot be undone.`;
    document.getElementById('confirmationMessage').textContent = confirmationMessage;
    document.getElementById('deleteConfirmationModal').style.display = 'flex';

    // Change button actions for tracking delete
    const yesBtn = document.querySelector('.btn-yes');
    const noBtn = document.querySelector('.btn-no');

    // Remove old event listeners and add new ones
    const newYesBtn = yesBtn.cloneNode(true);
    const newNoBtn = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    noBtn.parentNode.replaceChild(newNoBtn, noBtn);

    newYesBtn.onclick = function() {
        confirmDeleteTracking();
    };
    newNoBtn.onclick = function() {
        cancelDeleteTracking();
    };
}

// Confirm delete tracking record
function confirmDeleteTracking() {
    const recordId = window.pendingDeleteTrackingId;
    const itemName = window.pendingDeleteTrackingItem;

    if (!recordId) return;
    (async function() {
        try {
            // Parse recordId to get project ID and item number
            // Format: ${project.id}_${item.itemNumber}
            const parts = recordId.split('_');
            const projectId = parts[0];
            const itemNumber = parts.slice(1).join('_'); // In case itemNumber contains underscore
            
            console.log('🗑️ Deleting item:', { projectId, itemNumber, recordId });

            // Get the project
            const projects = await getProjects();
            const project = projects.find(p => p.id === projectId);
            
            if (!project) {
                throw new Error('Project not found');
            }

            // Find the item index
            const itemIndex = project.items.findIndex(i => i.itemNumber === itemNumber);
            
            if (itemIndex === -1) {
                throw new Error('Item not found in project');
            }

            // Remove the item from the project
            project.items.splice(itemIndex, 1);

            // Update the project in database
            await updateProjectRecord(projectId, project);
            console.log('✅ Item deleted from project');

            // Log activity
            try {
                const userName = await getCurrentUserNameForActivityLog();
                await addActivityLog({
                    activityType: 'PURCHASE_ORDER',
                    action: 'DELETE',
                    details: `Deleted purchase order item: ${itemName}`,
                    moduleName: 'PURCHASING',
                    recordId: recordId,
                    user: userName
                });
            } catch (logErr) {
                console.warn('⚠️ Could not log activity:', logErr);
            }

            document.getElementById('deleteConfirmationModal').style.display = 'none';

            // Clear cache to force fresh fetch
            trackingCache = null;
            cacheTimestamp = 0;

            // Reload the tracking table
            loadTrackingRecords();

            // Clear pending values
            window.pendingDeleteTrackingId = null;
            window.pendingDeleteTrackingItem = null;
            
            showNotification('Item deleted successfully!', 'success');
        } catch (error) {
            console.error('❌ Error deleting tracking record:', error);
            showNotification('Error deleting item: ' + error.message, 'error');
            document.getElementById('deleteConfirmationModal').style.display = 'none';
        }
    })();
}

// Cancel delete tracking record
function cancelDeleteTracking() {
    window.pendingDeleteTrackingId = null;
    window.pendingDeleteTrackingItem = null;
    document.getElementById('deleteConfirmationModal').style.display = 'none';
}

// Update status when Paid Amount changes
function updateStatusOnAmountChange() {
    const poAmount = parseFloat(document.getElementById('editPOAmount').value);
    const paidAmount = parseFloat(document.getElementById('editPaidAmount').value);
    const statusSelect = document.getElementById('editStatus');

    // If Paid Amount equals P.O Amount, set status to Completed
    if (poAmount === paidAmount && poAmount > 0) {
        statusSelect.value = 'Completed';
    }
}

// Save Tracking Edit
function saveTrackingEdit(event) {
    event.preventDefault();

    if (!currentTrackingRow) {
        console.error('❌ No tracking row selected');
        alert('❌ Error: No tracking record selected');
        return;
    }

    try {
        // Get form values
        const item = document.getElementById('editItem').value.trim();
        const monthInput = document.getElementById('editMonth').value.trim();
        
        // Convert YYYY-MM format to month text if needed
        let month = monthInput;
        if (monthInput && monthInput.includes('-')) {
            const monthNum = parseInt(monthInput.split('-')[1]);
            const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                               'July', 'August', 'September', 'October', 'November', 'December'];
            month = monthNames[monthNum] || monthInput;
        }
        
        const client = document.getElementById('editClient').value.trim();
        const projectName = document.getElementById('editProjectName').value.trim();
        const trade = document.getElementById('editTrade').value.trim();
        const mr = document.getElementById('editMR').value.trim();
        const mrDate = document.getElementById('editMRDate').value.trim();
        const poDate = document.getElementById('editPODate').value.trim();
        const poNo = document.getElementById('editPONo').value.trim();
        const vendors = document.getElementById('editVendors').value.trim();
        const poAmount = parseFloat(document.getElementById('editPOAmount').value);
        const paidAmount = parseFloat(document.getElementById('editPaidAmount').value);
        const paymentDate = document.getElementById('editPaymentDate').value.trim();
        const status = document.getElementById('editStatus').value.trim();
        
        console.log('📝 Form values:', { item, month, client, projectName, trade, mr, mrDate, poDate, poNo, vendors, poAmount, paidAmount, paymentDate, status });

        // Validate required fields
        if (!item || !month || !client || !projectName || !trade || !mr || !mrDate || !poDate || !poNo || !vendors || isNaN(poAmount) || isNaN(paidAmount) || !status) {
            console.error('❌ Missing required fields');
            alert('❌ Please fill in all required fields');
            return;
        }

        // Get the record ID from the row's data attribute FIRST
        const recordId = currentTrackingRow.getAttribute('data-id');
        
        if (!recordId) {
            console.error('❌ Record ID not found in row');
            alert('❌ Error: Record ID not found');
            return;
        }

        console.log('🔍 Record ID:', recordId);

        // Prepare tracking data object
        const trackingData = {
            item,
            month,
            client,
            projectName,
            trade,
            mr,
            mrDate,
            poDate,
            poNo,
            vendors,
            poAmount,
            paidAmount,
            paymentDate,
            status
        };

        console.log('💾 Tracking data to save:', trackingData);
        console.log('📊 Current row cells count:', currentTrackingRow.querySelectorAll('td').length);

        // Save to Firebase FIRST before updating UI
        if (window.updateTrackingRecord) {
            window.updateTrackingRecord(recordId, trackingData)
            .then(async () => {
                console.log('✅ Tracking record saved to Firebase');
                
                // Log activity
                try {
                    const userName = await getCurrentUserNameForActivityLog();
                    await addActivityLog({
                        activityType: 'PURCHASE_ORDER',
                        action: 'UPDATE',
                        details: `Updated purchase order: ${poNo} - ${item} (Vendor: ${vendors})`,
                        moduleName: 'PURCHASING',
                        recordId: recordId,
                        user: userName
                    });
                } catch (logErr) {
                    console.warn('⚠️ Could not log activity:', logErr);
                }
                
                // Update table row AFTER successful save
                try {
                    const cells = currentTrackingRow.querySelectorAll('td');
                    
                    if (cells.length < 13) {
                        console.warn('⚠️ Row has fewer cells than expected. Cells:', cells.length);
                    }
                    
                    // Update cells with validation
                    if (cells[0]) cells[0].textContent = item;
                    if (cells[1]) cells[1].textContent = month;
                    if (cells[2]) cells[2].textContent = client;
                    if (cells[3]) cells[3].textContent = projectName;
                    if (cells[4]) cells[4].textContent = trade;
                    if (cells[5]) cells[5].textContent = mr;
                    if (cells[6]) cells[6].textContent = mrDate;
                    if (cells[7]) cells[7].textContent = poDate;
                    if (cells[8]) cells[8].textContent = poNo;
                    if (cells[9]) cells[9].textContent = vendors;
                    if (cells[10]) cells[10].textContent = '₱' + poAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                    if (cells[11]) cells[11].textContent = '₱' + paidAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

                    // Update status badge
                    if (cells[12]) {
                        const statusBadge = cells[12].querySelector('.status-badge');
                        if (statusBadge) {
                            statusBadge.textContent = status;
                            statusBadge.className = 'status-badge status-' + status.toLowerCase();
                        }
                    }
                    
                    console.log('✅ Table row updated successfully');
                } catch (updateErr) {
                    console.warn('⚠️ Could not update table row immediately:', updateErr);
                }
                
                showNotification('Tracking record updated successfully!', 'success');
                closeEditTrackingModal();

                // Reload tracking records to reflect changes
                if (window.loadTrackingRecordsUpdated) {
                    window.loadTrackingRecordsUpdated();
                }
            })
            .catch(error => {
                console.error('❌ Error saving to Firebase:', error);
                showNotification('Error updating tracking record: ' + error.message, 'error');
            });
        } else {
            console.error('❌ updateTrackingRecord function not available');
            alert('❌ Error: Firebase functions not initialized');
        }
    } catch (error) {
        console.error('❌ Unexpected error in saveTrackingEdit:', error);
        alert('❌ Unexpected error: ' + error.message);
    }
}

// Convert month to text format
function getMonthText(monthValue) {
    if (!monthValue) return '';

    // If it's a date string like "2026-02"
    if (typeof monthValue === 'string' && monthValue.includes('-')) {
        const monthNum = parseInt(monthValue.split('-')[1]);
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        return monthNames[monthNum] || monthValue;
    }

    // If it's already a month name
    if (isNaN(monthValue)) {
        return monthValue;
    }

    // If it's a number
    const monthNum = parseInt(monthValue);
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[monthNum] || monthValue;
}

// ============================================================
// MODAL CLOSE EVENT HANDLERS
// ============================================================

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const editModal = document.getElementById('editModal');
    const editItemModal = document.getElementById('editItemModal');
    const addTrackingModal = document.getElementById('addTrackingModal');
    const editTrackingModal = document.getElementById('editTrackingModal');
    const addProjectModal = document.getElementById('addProjectModal');

    if (editModal && event.target === editModal) {
        closeEditModal();
    }
    if (editItemModal && event.target === editItemModal) {
        closeEditItemModal();
    }
    if (addTrackingModal && event.target === addTrackingModal) {
        closeAddTrackingModal();
    }
    if (editTrackingModal && event.target === editTrackingModal) {
        closeEditTrackingModal();
    }
    if (addProjectModal && event.target === addProjectModal) {
        closeAddProjectModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const editModal = document.getElementById('editModal');
        const editItemModal = document.getElementById('editItemModal');
        const editTrackingModal = document.getElementById('editTrackingModal');

        if (editModal && editModal.classList.contains('active')) {
            closeEditModal();
        }
        if (editItemModal && editItemModal.style.display === 'block') {
            closeEditItemModal();
        }
        if (editTrackingModal && editTrackingModal.style.display === 'block') {
            closeEditTrackingModal();
        }
    }
});

// ============================================================
// LEGACY EDIT MODAL FUNCTIONS (For backwards compatibility)
// ============================================================

// Store current row being edited
let currentEditRow = null;

// Open Edit Modal
function openEditModal(button) {
    currentEditRow = button.closest('tr');
    const cells = currentEditRow.querySelectorAll('td');

    // Populate form with current row data
    document.getElementById('editCategory').value = cells[0].textContent.trim();
    document.getElementById('editItemCode').value = cells[1].textContent.trim();
    document.getElementById('editItemName').value = cells[2].textContent.trim();
    document.getElementById('editQuantity').value = cells[3].textContent.trim();
    document.getElementById('editPrice').value = cells[4].textContent.trim();

    // Show modal
    const modal = document.getElementById('editModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
}

// Close Edit Modal
function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('active');
    modal.style.display = 'none';
    currentEditRow = null;
}

// ============================================================
// TRACKING MODAL FUNCTIONS
// ============================================================

// Open Add Tracking Modal
function openAddTrackingModal() {
    document.getElementById('addTrackingForm').reset();
    document.getElementById('addTrackingModal').style.display = 'block';
}

// Close Add Tracking Modal
function closeAddTrackingModal() {
    document.getElementById('addTrackingModal').style.display = 'none';
    document.getElementById('addTrackingForm').reset();
}

// Save Tracking Record
function saveTrackingRecord(event) {
    event.preventDefault();

    // Get form values
    const item = document.getElementById('addItem').value.trim();
    const month = document.getElementById('addMonth').value.trim();
    const client = document.getElementById('addClient').value.trim();
    const projectName = document.getElementById('addProjectName').value.trim();
    const trade = document.getElementById('addTrade').value.trim();
    const mr = document.getElementById('addMR').value.trim();
    const mrDate = document.getElementById('addMRDate').value.trim();
    const poDate = document.getElementById('addPODate').value.trim();
    const poNo = document.getElementById('addPONo').value.trim();
    const vendors = document.getElementById('addVendors').value.trim();
    const poAmount = document.getElementById('addPOAmount').value.trim();
    const paidAmount = document.getElementById('addPaidAmount').value.trim();   

    // Save to Firestore
    (async function() {
        try {
            await addTrackingRecord({
                item: item,
                month: month,
                client: client,
                projectName: projectName,
                trade: trade,
                mr: mr,
                mrDate: mrDate,
                poDate: poDate,
                poNo: poNo,
                vendors: vendors,
                poAmount: parseFloat(poAmount),
                paidAmount: parseFloat(paidAmount),
                status: 'On-going'
            });

            // Log activity
            const userName = await getCurrentUserNameForActivityLog();
            await addActivityLog({
                activityType: 'PURCHASE_ORDER',
                action: 'CREATE',
                details: `Created purchase order: ${poNo} - ${item} (Vendor: ${vendors})`,
                moduleName: 'PURCHASING',
                user: userName
            });

            showNotification('Tracking record added successfully!', 'success');

            // Reload tracking records table
            loadTrackingRecords();

            // Reset form and close modal
            document.getElementById('addTrackingForm').reset();
            closeAddTrackingModal();
        } catch (error) {
            console.error('Error:', error);
            showNotification('Error adding tracking record: ' + error.message, 'error');
        }
    })();
}

// ============================================================
// LEGACY TRACKING FUNCTIONS
// ============================================================

// TRACKING RECORDS MANAGEMENT
window.loadTrackingRecordsUpdated = async function() {
    try {
        const records = await getAllProjectItems();
        const tbody = document.getElementById('trackingTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            records.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${record.purchase_order}</td>
                    <td>${record.status}</td>
                    <td>${record.date_received || 'N/A'}</td>
                    <td>${record.remarks || 'N/A'}</td>
                    <td>
                        <button class="btn-edit" onclick="editTrackingItem('${record.id}')">Edit</button>
                        <button class="btn-delete" onclick="deleteTrackingItem('${record.id}')">Delete</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading tracking records:', error);
    }
};

window.saveTrackingRecordUpdated = async function(event) {
    if (event) event.preventDefault();

    const purchaseOrder = document.getElementById('purchaseOrder')?.value;
    const status = document.getElementById('trackingStatus')?.value;
    const dateReceived = document.getElementById('dateReceived')?.value;
    const remarks = document.getElementById('remarks')?.value;

    if (!purchaseOrder || !status) {
        showNotification('Please fill in required fields', 'error');
        return;
    }

    try {
        await addTrackingRecord({
            purchase_order: purchaseOrder,
            status: status,
            date_received: dateReceived || null,
            remarks: remarks || ''
        });

        showNotification('Tracking record added!', 'success');
        document.querySelector('#addTrackingForm')?.reset();
        loadTrackingRecordsUpdated();
    } catch (error) {
        showNotification('Error saving tracking record: ' + error.message, 'error');
    }
};  

window.deleteTrackingItem = async function(trackingId) {
    if (confirm('Are you sure you want to delete this tracking record?')) {
        try {
            await deleteTrackingRecord(trackingId);
            showNotification('Tracking record deleted successfully!', 'success');
            loadTrackingRecordsUpdated();
        } catch (error) {
            showNotification('Error deleting tracking record: ' + error.message, 'error');
        }
    }
};

window.editTrackingItem = function(trackingId) {
    alert('Edit functionality: Update form with tracking ID ' + trackingId);
};

// PRICE LIST MANAGEMENT
window.loadPriceListUpdated = async function() {
    try {
        const items = await getPriceList();
        const tbody = document.getElementById('priceListTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            items.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.item_name}</td>
                    <td>${item.category}</td>
                    <td>${item.price}</td>
                    <td>
                        <button class="btn-edit" onclick="editPriceItem('${item.id}')">Edit</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading price list:', error);
    }
};

window.editPriceItem = function(itemId) {
    alert('Edit price item: ' + itemId);
    // Implementation depends on your form structure
};

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================

// Make all functions available globally for HTML event handlers
// Bind all functions to window object using the early proxy system
window.__bindFunction('toggleSidebar', toggleSidebar);
window.__bindFunction('closeSidebar', closeSidebar);
window.__bindFunction('switchTab', switchTab);
window.__bindFunction('toggleSubmenu', toggleSubmenu);
window.__bindFunction('showDashboardPage', showDashboardPage);
window.__bindFunction('showPurchaseTrackingPage', showPurchaseTrackingPage);
window.__bindFunction('showOngoingOrdersPage', showOngoingOrdersPage);
window.__bindFunction('showMRToPOMonitoringPage', showMRToPOMonitoringPage);
window.__bindFunction('searchMRToPOMonitoring', searchMRToPOMonitoring);
window.__bindFunction('showPOToDRMonitoringPage', showPOToDRMonitoringPage);
window.__bindFunction('searchPOToDRMonitoring', searchPOToDRMonitoring);
window.__bindFunction('showSettingsPage', showSettingsPage);
window.__bindFunction('switchSettingsTab', switchSettingsTab);
window.__bindFunction('showProjectsPage', showProjectsPage);
window.__bindFunction('loadProjectsPage', loadProjectsPage);
window.__bindFunction('searchProjectsPage', searchProjectsPage);
window.__bindFunction('searchProjectsModal', searchProjectsModal);
window.__bindFunction('closeProjectsModal', closeProjectsModal);
window.__bindFunction('viewProjectDetails', viewProjectDetails);
window.__bindFunction('editProject', editProject);
window.__bindFunction('openAddProjectModal', openAddProjectModal);
window.__bindFunction('closeAddProjectModal', closeAddProjectModal);
window.__bindFunction('saveProjectRecord', saveProjectRecord);
window.__bindFunction('deleteProject', deleteProject);
window.__bindFunction('confirmDelete', confirmDelete);
window.__bindFunction('cancelDelete', cancelDelete);
window.__bindFunction('searchProjects', searchProjects);
window.__bindFunction('openAddItemModal', openAddItemModal);
window.__bindFunction('closeAddItemModal', closeAddItemModal);
window.__bindFunction('closeAddPOModal', closeAddPOModal);
window.__bindFunction('openSelectPOModal', openSelectPOModal);
window.__bindFunction('closeSelectPOModal', closeSelectPOModal);
window.__bindFunction('addPOToProjectDirectly', addPOToProjectDirectly);
window.__bindFunction('fetchPODetailsFromNumber', fetchPODetailsFromNumber);
window.__bindFunction('handlePONumberLookup', handlePONumberLookup);
window.__bindFunction('handleEditPONumberLookup', handleEditPONumberLookup);
window.__bindFunction('calculateItemTotal', calculateItemTotal);
window.__bindFunction('calculateEditItemTotal', calculateEditItemTotal);
window.__bindFunction('calculatePOBalanceQtyItem', calculatePOBalanceQtyItem);
window.__bindFunction('calculateItemPaidAmount', calculateItemPaidAmount);
window.__bindFunction('calculateEditItemPaidAmount', calculateEditItemPaidAmount);
window.__bindFunction('calculateItemRemainingPayable', calculateItemRemainingPayable);
window.__bindFunction('loadMaterialsForAutocomplete', loadMaterialsForAutocomplete);
window.__bindFunction('initializeItemAutocomplete', initializeItemAutocomplete);
window.__bindFunction('initializePartsDescriptionAutocomplete', initializePartsDescriptionAutocomplete);
window.__bindFunction('handleItemInput', handleItemInput);
window.__bindFunction('handlePartsDescriptionInput', handlePartsDescriptionInput);
window.__bindFunction('selectMaterialForField', selectMaterialForField);
window.__bindFunction('removeMaterialDropdown', removeMaterialDropdown);
window.__bindFunction('editProjectItem', editProjectItem);
window.__bindFunction('openEditItemModal', openEditItemModal);
window.__bindFunction('closeEditItemModal', closeEditItemModal);
window.__bindFunction('calculateEditPaymentAmount', calculateEditPaymentAmount);
window.__bindFunction('autoUpdateDeliveryStatus', autoUpdateDeliveryStatus);
window.__bindFunction('calculateEditPOBalanceQtyItem', calculateEditPOBalanceQtyItem);
window.__bindFunction('calculateEditItemRemainingPayable', calculateEditItemRemainingPayable);
window.__bindFunction('saveEditItemRecord', saveEditItemRecord);
window.__bindFunction('deleteProjectItem', deleteProjectItem);
window.__bindFunction('confirmDeleteProjectItem', confirmDeleteProjectItem);
window.__bindFunction('cancelDeleteProjectItem', cancelDeleteProjectItem);
window.__bindFunction('editProjectDetailsItem', editProjectDetailsItem);
window.__bindFunction('removeProjectItem', removeProjectItem);
window.__bindFunction('populateProjectDetailsTable', populateProjectDetailsTable);
window.__bindFunction('saveItemRecord', saveItemRecord);
window.__bindFunction('calculatePOBalanceQty', calculatePOBalanceQty);
window.__bindFunction('calculateRemainingPayable', calculateRemainingPayable);
window.__bindFunction('preLoadAllData', preLoadAllData);
window.__bindFunction('loadProjects', loadProjects);
window.__bindFunction('updateTotalProjectsCount', updateTotalProjectsCount);
window.__bindFunction('calculateTotalMaterialsSpent', calculateTotalMaterialsSpent);
window.__bindFunction('updateProjectsTradeChart', updateProjectsTradeChart);
window.__bindFunction('cacheChartData', cacheChartData);
window.__bindFunction('renderCachedChart', renderCachedChart);
window.__bindFunction('initializeChartFromCache', initializeChartFromCache);
window.__bindFunction('renderProjectsTableFast', renderProjectsTableFast);
window.__bindFunction('syncProjectsTableStructure', syncProjectsTableStructure);
window.__bindFunction('loadTrackingRecords', loadTrackingRecords);
window.__bindFunction('refreshTrackingTableData', refreshTrackingTableData);
window.__bindFunction('getAllProjectItems', getAllProjectItems);
window.__bindFunction('renderTrackingTableFast', renderTrackingTableFast);
try{ window.__bindFunction('nextPageTrackingTable', nextPageTrackingTable); }catch(e){console.warn('bind nextPageTrackingTable failed',e)}
try{ window.__bindFunction('previousPageTrackingTable', previousPageTrackingTable); }catch(e){console.warn('bind previousPageTrackingTable failed',e)}
try{ window.__bindFunction('renderTrackingTablePage', renderTrackingTablePage); }catch(e){console.warn('bind renderTrackingTablePage failed',e)}
try{ window.__bindFunction('updateTrackingTablePagination', updateTrackingTablePagination); }catch(e){console.warn('bind updateTrackingTablePagination failed',e)}
try{ window.__bindFunction('nextPageProjectsTable', nextPageProjectsTable); }catch(e){console.warn('bind nextPageProjectsTable failed',e)}
try{ window.__bindFunction('previousPageProjectsTable', previousPageProjectsTable); }catch(e){console.warn('bind previousPageProjectsTable failed',e)}
try{ window.__bindFunction('renderProjectsTablePage', renderProjectsTablePage); }catch(e){console.warn('bind renderProjectsTablePage failed',e)}
try{ window.__bindFunction('nextPageProjectDetailsTable', nextPageProjectDetailsTable); }catch(e){console.warn('bind nextPageProjectDetailsTable failed',e)}
try{ window.__bindFunction('previousPageProjectDetailsTable', previousPageProjectDetailsTable); }catch(e){console.warn('bind previousPageProjectDetailsTable failed',e)}
try{ window.__bindFunction('renderProjectDetailsTablePage', renderProjectDetailsTablePage); }catch(e){console.warn('bind renderProjectDetailsTablePage failed',e)}
try{ window.__bindFunction('renderProjectsTable', renderProjectsTable); }catch(e){console.warn('bind renderProjectsTable failed',e)}
try{ window.__bindFunction('renderTrackingTable', renderTrackingTable); }catch(e){console.warn('bind renderTrackingTable failed',e)}
try{ window.__bindFunction('filterTrackingByStatus', filterTrackingByStatus); }catch(e){console.warn('bind filterTrackingByStatus failed',e)}
try{ window.__bindFunction('filterTrackingByStatusDropdown', filterTrackingByStatusDropdown); }catch(e){console.warn('bind filterTrackingByStatusDropdown failed',e)}
try{ window.__bindFunction('exportTrackingDataAsExcel', exportTrackingDataAsExcel); }catch(e){console.warn('bind exportTrackingDataAsExcel failed',e)}
try{ window.__bindFunction('exportTrackingDataAsPDF', exportTrackingDataAsPDF); }catch(e){console.warn('bind exportTrackingDataAsPDF failed',e)}
try{ window.__bindFunction('toggleExportDropdown', toggleExportDropdown); }catch(e){console.warn('bind toggleExportDropdown failed',e)}
try{ window.__bindFunction('showNotification', showNotification); }catch(e){console.warn('bind showNotification failed',e)}
try{ window.__bindFunction('openPaymentDetailsModal', openPaymentDetailsModal); }catch(e){console.warn('bind openPaymentDetailsModal failed',e)}
try{ window.__bindFunction('closePaymentDetailsModal', closePaymentDetailsModal); }catch(e){console.warn('bind closePaymentDetailsModal failed',e)}
try{ window.__bindFunction('openPaymentAlertsModal', openPaymentAlertsModal); }catch(e){console.warn('bind openPaymentAlertsModal failed',e)}
try{ window.__bindFunction('closePaymentAlertsModal', closePaymentAlertsModal); }catch(e){console.warn('bind closePaymentAlertsModal failed',e)}
try{ window.__bindFunction('filterPaymentAlerts', filterPaymentAlerts); }catch(e){console.warn('bind filterPaymentAlerts failed',e)}
try{ window.__bindFunction('handleViewProjectFromAlert', handleViewProjectFromAlert); }catch(e){console.warn('bind handleViewProjectFromAlert failed',e)}
try{ window.__bindFunction('handlePaymentDetailsFromAlert', handlePaymentDetailsFromAlert); }catch(e){console.warn('bind handlePaymentDetailsFromAlert failed',e)}
try{ window.__bindFunction('togglePaymentHistoryList', togglePaymentHistoryList); }catch(e){console.warn('bind togglePaymentHistoryList failed',e)}
try{ window.__bindFunction('populatePaymentHistory', populatePaymentHistory); }catch(e){console.warn('bind populatePaymentHistory failed',e)}
try{ window.__bindFunction('changeDeliveryStatus', changeDeliveryStatus); }catch(e){console.warn('bind changeDeliveryStatus failed',e)}
try{ window.__bindFunction('closeChangeDeliveryStatusModal', closeChangeDeliveryStatusModal); }catch(e){console.warn('bind closeChangeDeliveryStatusModal failed',e)}
try{ window.__bindFunction('selectDeliveryStatus', selectDeliveryStatus); }catch(e){console.warn('bind selectDeliveryStatus failed',e)}
try{ window.__bindFunction('changePaymentStatus', changePaymentStatus); }catch(e){console.warn('bind changePaymentStatus failed',e)}
try{ window.__bindFunction('closeChangePaymentStatusModal', closeChangePaymentStatusModal); }catch(e){console.warn('bind closeChangePaymentStatusModal failed',e)}
try{ window.__bindFunction('selectPaymentStatus', selectPaymentStatus); }catch(e){console.warn('bind selectPaymentStatus failed',e)}
try{ window.__bindFunction('loadActivityLogsPage', loadActivityLogsPage); }catch(e){console.warn('bind loadActivityLogsPage failed',e)}
try{ window.__bindFunction('searchActivityLogs', searchActivityLogs); }catch(e){console.warn('bind searchActivityLogs failed',e)}
try{ window.__bindFunction('filterActivityLogsByType', filterActivityLogsByType); }catch(e){console.warn('bind filterActivityLogsByType failed',e)}
try{ window.__bindFunction('filterActivityLogsByMonth', filterActivityLogsByMonth); }catch(e){console.warn('bind filterActivityLogsByMonth failed',e)}
try{ window.__bindFunction('filterActivityLogsByYear', filterActivityLogsByYear); }catch(e){console.warn('bind filterActivityLogsByYear failed',e)}
try{ window.__bindFunction('clearAllActivityLogs', clearAllActivityLogs); }catch(e){console.warn('bind clearAllActivityLogs failed',e)}
try{ window.__bindFunction('closeClearActivityLogsConfirmModal', closeClearActivityLogsConfirmModal); }catch(e){console.warn('bind closeClearActivityLogsConfirmModal failed',e)}
try{ window.__bindFunction('confirmClearAllActivityLogs', confirmClearAllActivityLogs); }catch(e){console.warn('bind confirmClearAllActivityLogs failed',e)}
try{ window.__bindFunction('prevActivityLogsPage', prevActivityLogsPage); }catch(e){console.warn('bind prevActivityLogsPage failed',e)}
try{ window.__bindFunction('nextActivityLogsPage', nextActivityLogsPage); }catch(e){console.warn('bind nextActivityLogsPage failed',e)}
try{ window.__bindFunction('searchTracking', searchTracking); }catch(e){console.warn('bind searchTracking failed',e)}
try{ window.__bindFunction('searchProjectDetails', searchProjectDetails); }catch(e){console.warn('bind searchProjectDetails failed',e)}
try{ window.__bindFunction('toggleProjectDetailsDropdown', toggleProjectDetailsDropdown); }catch(e){console.warn('bind toggleProjectDetailsDropdown failed',e)}
try{ window.__bindFunction('editTrackingRecord', editTrackingRecord); }catch(e){console.warn('bind editTrackingRecord failed',e)}
try{ window.__bindFunction('closeEditTrackingModal', closeEditTrackingModal); }catch(e){console.warn('bind closeEditTrackingModal failed',e)}
try{ window.__bindFunction('deleteTrackingRecordConfirm', deleteTrackingRecordConfirm); }catch(e){console.warn('bind deleteTrackingRecordConfirm failed',e)}
try{ window.__bindFunction('confirmDeleteTracking', confirmDeleteTracking); }catch(e){console.warn('bind confirmDeleteTracking failed',e)}
try{ window.__bindFunction('cancelDeleteTracking', cancelDeleteTracking); }catch(e){console.warn('bind cancelDeleteTracking failed',e)}
try{ window.__bindFunction('updateStatusOnAmountChange', updateStatusOnAmountChange); }catch(e){console.warn('bind updateStatusOnAmountChange failed',e)}
try{ window.__bindFunction('saveTrackingEdit', saveTrackingEdit); }catch(e){console.warn('bind saveTrackingEdit failed',e)}
try{ window.__bindFunction('getMonthText', getMonthText); }catch(e){console.warn('bind getMonthText failed',e)}
try{ window.__bindFunction('openAddTrackingModal', openAddTrackingModal); }catch(e){console.warn('bind openAddTrackingModal failed',e)}
try{ window.__bindFunction('closeAddTrackingModal', closeAddTrackingModal); }catch(e){console.warn('bind closeAddTrackingModal failed',e)}
try{ window.__bindFunction('saveTrackingRecord', saveTrackingRecord); }catch(e){console.warn('bind saveTrackingRecord failed',e)}
try{ window.__bindFunction('openEditModal', openEditModal); }catch(e){console.warn('bind openEditModal failed',e)}
try{ window.__bindFunction('closeEditModal', closeEditModal); }catch(e){console.warn('bind closeEditModal failed',e)}
try{ window.__bindFunction('openChangePasswordModal', openChangePasswordModal); }catch(e){console.warn('bind openChangePasswordModal failed',e)}
try{ window.__bindFunction('closeChangePasswordModal', closeChangePasswordModal); }catch(e){console.warn('bind closeChangePasswordModal failed',e)}
try{ window.__bindFunction('saveNewPassword', saveNewPassword); }catch(e){console.warn('bind saveNewPassword failed',e)}
try{ window.__bindFunction('resetPasswordForm', resetPasswordForm); }catch(e){console.warn('bind resetPasswordForm failed',e)}
try{ window.__bindFunction('handleLogout', handleLogout); }catch(e){console.warn('bind handleLogout failed',e)}
try{ window.__bindFunction('openConfigureProjectsTableColumnsModal', openConfigureProjectsTableColumnsModal); }catch(e){console.warn('bind openConfigureProjectsTableColumnsModal failed',e)}
try{ window.__bindFunction('closeConfigureProjectsTableColumnsModal', closeConfigureProjectsTableColumnsModal); }catch(e){console.warn('bind closeConfigureProjectsTableColumnsModal failed',e)}
try{ window.__bindFunction('saveProjectsTableColumnSettings', saveProjectsTableColumnSettings); }catch(e){console.warn('bind saveProjectsTableColumnSettings failed',e)}
try{ window.__bindFunction('loadProjectDetailColumns', loadProjectDetailColumns); }catch(e){console.warn('bind loadProjectDetailColumns failed',e)}
try{ window.__bindFunction('renderProjectDetailColumnsTable', renderProjectDetailColumnsTable); }catch(e){console.warn('bind renderProjectDetailColumnsTable failed',e)}
try{ window.__bindFunction('addNewProjectDetailColumn', addNewProjectDetailColumn); }catch(e){console.warn('bind addNewProjectDetailColumn failed',e)}
try{ window.__bindFunction('deleteProjectDetailColumn', deleteProjectDetailColumn); }catch(e){console.warn('bind deleteProjectDetailColumn failed',e)}
try{ window.__bindFunction('openConfigureColumns', openConfigureColumns); }catch(e){console.warn('bind openConfigureColumns failed',e)}
try{ window.__bindFunction('closeConfigureColumnsModal', closeConfigureColumnsModal); }catch(e){console.warn('bind closeConfigureColumnsModal failed',e)}
try{ window.__bindFunction('loadProjectsTableColumnSettings', loadProjectsTableColumnSettings); }catch(e){console.warn('bind loadProjectsTableColumnSettings failed',e)}
try{ window.__bindFunction('addNewProjectsTableColumn', addNewProjectsTableColumn); }catch(e){console.warn('bind addNewProjectsTableColumn failed',e)}
try{ window.__bindFunction('deleteProjectsTableColumn', deleteProjectsTableColumn); }catch(e){console.warn('bind deleteProjectsTableColumn failed',e)}
try{ window.__bindFunction('toggleConfigureDetailsProjects', toggleConfigureDetailsProjects); }catch(e){console.warn('bind toggleConfigureDetailsProjects failed',e)}
try{ window.__bindFunction('toggleConfigureDetailsProjectDetails', toggleConfigureDetailsProjectDetails); }catch(e){console.warn('bind toggleConfigureDetailsProjectDetails failed',e)}
try{ window.__bindFunction('handleProjectsTableColumnToggle', handleProjectsTableColumnToggle); }catch(e){console.warn('bind handleProjectsTableColumnToggle failed',e)}
try{ window.__bindFunction('handleProjectsTableColumnDragStart', handleProjectsTableColumnDragStart); }catch(e){console.warn('bind handleProjectsTableColumnDragStart failed',e)}
try{ window.__bindFunction('handleProjectsTableColumnDragOver', handleProjectsTableColumnDragOver); }catch(e){console.warn('bind handleProjectsTableColumnDragOver failed',e)}
try{ window.__bindFunction('handleProjectsTableColumnDrop', handleProjectsTableColumnDrop); }catch(e){console.warn('bind handleProjectsTableColumnDrop failed',e)}
try{ window.__bindFunction('handleProjectsTableColumnDragEnd', handleProjectsTableColumnDragEnd); }catch(e){console.warn('bind handleProjectsTableColumnDragEnd failed',e)}
try{ window.__bindFunction('populateColumnCheckboxes', populateColumnCheckboxes); }catch(e){console.warn('bind populateColumnCheckboxes failed',e)}
try{ window.__bindFunction('deleteColumn', deleteColumn); }catch(e){console.warn('bind deleteColumn failed',e)}
try{ window.__bindFunction('confirmDeleteColumn', confirmDeleteColumn); }catch(e){console.warn('bind confirmDeleteColumn failed',e)}
try{ window.__bindFunction('cancelDeleteColumn', cancelDeleteColumn); }catch(e){console.warn('bind cancelDeleteColumn failed',e)}
try{ window.__bindFunction('applyColumnVisibility', applyColumnVisibility); }catch(e){console.warn('bind applyColumnVisibility failed',e)}
try{ window.__bindFunction('reorderTableColumns', reorderTableColumns); }catch(e){console.warn('bind reorderTableColumns failed',e)}
try{ window.__bindFunction('handleColumnToggle', handleColumnToggle); }catch(e){console.warn('bind handleColumnToggle failed',e)}
try{ window.__bindFunction('autoSaveColumnSettings', autoSaveColumnSettings); }catch(e){console.warn('bind autoSaveColumnSettings failed',e)}
try{ window.__bindFunction('handleColumnDragStart', handleColumnDragStart); }catch(e){console.warn('bind handleColumnDragStart failed',e)}
try{ window.__bindFunction('handleColumnDragOver', handleColumnDragOver); }catch(e){console.warn('bind handleColumnDragOver failed',e)}
try{ window.__bindFunction('handleColumnDrop', handleColumnDrop); }catch(e){console.warn('bind handleColumnDrop failed',e)}
try{ window.__bindFunction('handleColumnDragEnd', handleColumnDragEnd); }catch(e){console.warn('bind handleColumnDragEnd failed',e)}
try{ window.__bindFunction('addNewColumn', addNewColumn); }catch(e){console.warn('bind addNewColumn failed',e)}
try{ window.__bindFunction('updateTopSuppliersChart', updateTopSuppliersChart); }catch(e){console.warn('bind updateTopSuppliersChart failed',e)}
try{ window.__bindFunction('renderTopSuppliersChart', renderTopSuppliersChart); }catch(e){console.warn('bind renderTopSuppliersChart failed',e)}
try{ window.__bindFunction('filterBySupplier', filterBySupplier); }catch(e){console.warn('bind filterBySupplier failed',e)}
try{ window.__bindFunction('toggleSuppliersTimeDropdown', toggleSuppliersTimeDropdown); }catch(e){console.warn('bind toggleSuppliersTimeDropdown failed',e)}
try{ window.__bindFunction('selectSuppliersTimeScope', selectSuppliersTimeScope); }catch(e){console.warn('bind selectSuppliersTimeScope failed',e)}
try{ window.__bindFunction('toggleProjectPOColumnsDropdown', toggleProjectPOColumnsDropdown); }catch(e){console.warn('bind toggleProjectPOColumnsDropdown failed',e)}
try{ window.__bindFunction('openConfigureColumns', openConfigureColumns); }catch(e){console.warn('bind openConfigureColumns failed',e)}
try{ window.__bindFunction('closeConfigureColumnsModal', closeConfigureColumnsModal); }catch(e){console.warn('bind closeConfigureColumnsModal failed',e)}
try{ window.__bindFunction('addNewProjectDetailColumn', addNewProjectDetailColumn); }catch(e){console.warn('bind addNewProjectDetailColumn failed',e)}
try{ window.__bindFunction('loadProjectDetailColumns', loadProjectDetailColumns); }catch(e){console.warn('bind loadProjectDetailColumns failed',e)}
try{ window.__bindFunction('deleteProjectDetailColumn', deleteProjectDetailColumn); }catch(e){console.warn('bind deleteProjectDetailColumn failed',e)}
try{ window.__bindFunction('saveProjectDetailColumns', saveProjectDetailColumns); }catch(e){console.warn('bind saveProjectDetailColumns failed',e)}
try{ window.__bindFunction('autoPopulateProjectItemsFromPO', autoPopulateProjectItemsFromPO); }catch(e){console.warn('bind autoPopulateProjectItemsFromPO failed',e)}
try{ window.__bindFunction('fetchMaterialData', fetchMaterialData); }catch(e){console.warn('bind fetchMaterialData failed',e)}
try{ window.__bindFunction('syncPOToProject', syncPOToProject); }catch(e){console.warn('bind syncPOToProject failed',e)}
try{ window.__bindFunction('redirectToPurchasingWithPO', redirectToPurchasingWithPO); }catch(e){console.warn('bind redirectToPurchasingWithPO failed',e)}
try{ window.__bindFunction('addPOToProjectDetails', addPOToProjectDetails); }catch(e){console.warn('bind addPOToProjectDetails failed',e)}
// Expose key functions directly on window for callers from inline HTML or other modules
try{
    window.loadLinkedPOs = loadLinkedPOs;
    window.showPODetailsCard = showPODetailsCard;
    window.addPOToProjectDetails = addPOToProjectDetails;
}catch(e){ console.warn('Could not attach global functions:', e); }
window.__bindFunction('loadLinkedPOs', loadLinkedPOs);
window.__bindFunction('showPODetailsCard', showPODetailsCard);
window.__bindFunction('addPOToProjectDetails', addPOToProjectDetails);

// Process any pending PO syncs persisted by other modules while this module was loading
window.addEventListener('DOMContentLoaded', function(){
    try {
        const pendingKey = 'pendingPOSyncs';
        const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        if (Array.isArray(pending) && pending.length > 0) {
            console.log('Processing', pending.length, 'pending PO sync(s)');
            pending.forEach(async (po) => {
                try {
                    if (typeof window.syncPOToProject === 'function') {
                        await window.syncPOToProject(po);
                    } else {
                        console.warn('syncPOToProject not ready while processing pending POS');
                    }
                } catch (e) { console.warn('Error processing pending PO sync', e); }
            });
            // Clear pending queue after attempting
            localStorage.removeItem(pendingKey);
        }
    } catch (e) { console.warn('Error reading pending POSyncs', e); }
});



// ============================================================
// CHANGE PASSWORD FUNCTIONS
// ============================================================

function openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('passwordError').textContent = '';
        document.getElementById('changePasswordForm').reset();
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('passwordError').textContent = '';
        document.getElementById('changePasswordForm').reset();
    }
}

async function saveNewPassword(event) {
    event.preventDefault();
    
    // Determine which form is being submitted and get the appropriate elements
    const form = event.target;
    const isModalForm = form.id === 'changePasswordModalForm';
    
    const currentPasswordId = isModalForm ? 'modalCurrentPassword' : 'currentPassword';
    const newPasswordId = isModalForm ? 'modalNewPassword' : 'newPassword';
    const confirmPasswordId = isModalForm ? 'modalConfirmPassword' : 'confirmPassword';
    const errorDivId = isModalForm ? 'modalPasswordError' : 'passwordError';
    
    const errorDiv = document.getElementById(errorDivId);
    errorDiv.textContent = '';

    const currentPassword = document.getElementById(currentPasswordId).value;
    const newPassword = document.getElementById(newPasswordId).value;
    const confirmPassword = document.getElementById(confirmPasswordId).value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.textContent = '❌ All fields are required';
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = '❌ New passwords do not match';
        return;
    }

    if (newPassword.length < 6) {
        errorDiv.textContent = '❌ Password must be at least 6 characters';
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) {
            errorDiv.textContent = '❌ User not found';
            return;
        }

        // Reauthenticate user with current password
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // Update password
        await updatePassword(user, newPassword);

        errorDiv.style.color = '#1dd1a1';
        errorDiv.textContent = '✅ Password changed successfully!';
        
        // Close modal/form after 2 seconds
        setTimeout(() => {
            if (isModalForm) {
                closeChangePasswordModal();
            } else {
                resetPasswordForm();
            }
        }, 1500);

    } catch (error) {
        console.error('Password change error:', error);
        if (error.code === 'auth/wrong-password') {
            errorDiv.textContent = '❌ Current password is incorrect';
        } else if (error.code === 'auth/requires-recent-login') {
            errorDiv.textContent = '❌ Please log in again to change password';
        } else {
            errorDiv.textContent = '❌ ' + error.message;
        }
    }
}

// Initialize projects table column settings from localStorage on module load
loadProjectsTableColumnSettings();

window.__MODULE_LOADING = false;
console.log('✅ Purchasing.js module fully loaded - all functions are available!');

// ============================================================
// SIDEBAR & MENU EVENT LISTENERS
// ============================================================

// Initialize sidebar toggle on load
document.addEventListener('DOMContentLoaded', function() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const backBtn = document.getElementById('backBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const navLinks = document.querySelectorAll('.nav-link');

    // Toggle sidebar on menu icon click
    if (menuBtn) {
        menuBtn.addEventListener('click', function() {
            sidebar.classList.toggle('active');
        });
    }

    // Go back to modules
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'modules.html';
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            handleLogout();
        });
    }

    // Close sidebar when clicking on nav links
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            sidebar.classList.remove('active');
            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', function(event) {
        if (!sidebar.contains(event.target) && !menuBtn.contains(event.target)) {
            sidebar.classList.remove('active');
        }
    });
}, { once: true });

// ============================================================
// ACTIVITY LOGS FUNCTIONALITY
// ============================================================
let allActivityLogs = [];
let filteredActivityLogsData = [];
let activityLogsCurrentPage = 1;
const activityLogsItemsPerPage = 20;
let activityLogsFilters = {
    type: '',
    month: '',
    year: ''
};

async function loadActivityLogsPage() {
    try {
        console.log('📥 Loading activity logs...');
        
        // Get activity logs from Firebase
        allActivityLogs = await getActivityLogs();
        console.log('📊 Retrieved logs count:', allActivityLogs.length);
        console.log('📊 Retrieved logs data:', allActivityLogs);
        
        // Sort by timestamp (newest first)
        allActivityLogs.sort((a, b) => {
            let timeA = 0;
            let timeB = 0;
            
            // Handle Firestore Timestamp objects
            if (a.timestamp?.toDate) {
                timeA = a.timestamp.toDate().getTime();
            } else if (a.timestamp?.seconds) {
                timeA = a.timestamp.seconds * 1000;
            } else if (typeof a.timestamp === 'number') {
                timeA = a.timestamp;
            } else if (typeof a.timestamp === 'string') {
                timeA = new Date(a.timestamp).getTime();
            }
            
            if (b.timestamp?.toDate) {
                timeB = b.timestamp.toDate().getTime();
            } else if (b.timestamp?.seconds) {
                timeB = b.timestamp.seconds * 1000;
            } else if (typeof b.timestamp === 'number') {
                timeB = b.timestamp;
            } else if (typeof b.timestamp === 'string') {
                timeB = new Date(b.timestamp).getTime();
            }
            
            return timeB - timeA;  // Newest first
        });
        
        console.log(`✅ Loaded ${allActivityLogs.length} activity logs`);
        
        // Apply initial filter and render
        applyActivityLogsFilters();
        renderActivityLogsTable();
        updateActivityLogsPaginationButtons();
    } catch (error) {
        console.error('❌ Error loading activity logs:', error);
        showNotification('Error loading activity logs', 'error');
    }
}

function searchActivityLogs() {
    const searchTerm = document.getElementById('activitySearchInput')?.value.toLowerCase() || '';
    
    filteredActivityLogsData = allActivityLogs.filter(log => {
        const matchesSearch = !searchTerm || 
            log.user?.toLowerCase().includes(searchTerm) ||
            log.activityType?.toLowerCase().includes(searchTerm) ||
            log.action?.toLowerCase().includes(searchTerm) ||
            log.details?.toLowerCase().includes(searchTerm) ||
            (log.timestamp && formatActivityDateTime(log.timestamp).toLowerCase().includes(searchTerm));
        
        return matchesSearch && applyActivityLogFilters(log);
    });
    
    activityLogsCurrentPage = 1;
    renderActivityLogsTable();
    updateActivityLogsPaginationButtons();
}

function filterActivityLogsByType() {
    const type = document.getElementById('activityTypeFilterSelect')?.value;
    if (type !== undefined) {
        activityLogsFilters.type = type;
        applyActivityLogsFilters();
    }
}

function filterActivityLogsByMonth() {
    const month = document.getElementById('activityMonthFilterSelect')?.value;
    if (month !== undefined) {
        activityLogsFilters.month = month;
        applyActivityLogsFilters();
    }
}

function filterActivityLogsByYear() {
    const year = document.getElementById('activityYearFilterSelect')?.value;
    if (year !== undefined) {
        activityLogsFilters.year = year;
        applyActivityLogsFilters();
    }
}

function applyActivityLogFilters(log) {
    if (activityLogsFilters.type && log.activityType !== activityLogsFilters.type) {
        return false;
    }
    
    if (activityLogsFilters.month || activityLogsFilters.year) {
        let logDate;
        
        // Handle different timestamp formats
        if (log.timestamp?.toDate) {
            // Firestore Timestamp object
            logDate = log.timestamp.toDate();
        } else if (log.timestamp?.seconds) {
            // Firestore Timestamp object with seconds property
            logDate = new Date(log.timestamp.seconds * 1000);
        } else if (typeof log.timestamp === 'number') {
            // Unix timestamp in milliseconds
            logDate = new Date(log.timestamp);
        } else if (typeof log.timestamp === 'string') {
            // ISO string
            logDate = new Date(log.timestamp);
        } else {
            logDate = new Date(0);
        }
        
        if (activityLogsFilters.month && logDate.getMonth() + 1 !== parseInt(activityLogsFilters.month)) {
            return false;
        }
        
        if (activityLogsFilters.year && logDate.getFullYear() !== parseInt(activityLogsFilters.year)) {
            return false;
        }
    }
    
    return true;
}

function applyActivityLogsFilters() {
    const searchTerm = document.getElementById('activitySearchInput')?.value.toLowerCase() || '';
    
    filteredActivityLogsData = allActivityLogs.filter(log => {
        const matchesSearch = !searchTerm || 
            log.user?.toLowerCase().includes(searchTerm) ||
            log.activityType?.toLowerCase().includes(searchTerm) ||
            log.action?.toLowerCase().includes(searchTerm) ||
            log.details?.toLowerCase().includes(searchTerm) ||
            (log.timestamp && formatActivityDateTime(log.timestamp).toLowerCase().includes(searchTerm));
        
        return matchesSearch && applyActivityLogFilters(log);
    });
    
    activityLogsCurrentPage = 1;
    renderActivityLogsTable();
    updateActivityLogsPaginationButtons();
}

function renderActivityLogsTable() {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;
    
    if (filteredActivityLogsData.length === 0) {
        tbody.innerHTML = '<tr style="text-align: center; color: #a0a0a0;"><td colspan="5">No activity logs found</td></tr>';
        return;
    }
    
    // Calculate pagination
    const startIndex = (activityLogsCurrentPage - 1) * activityLogsItemsPerPage;
    const endIndex = startIndex + activityLogsItemsPerPage;
    const pageItems = filteredActivityLogsData.slice(startIndex, endIndex);
    
    // Render rows
    tbody.innerHTML = pageItems.map(log => `
        <tr>
            <td>${formatActivityDateTime(log.timestamp)}</td>
            <td>${escapeActivityHtml(log.user || 'Unknown')}</td>
            <td>
                <span class="activity-type-badge ${getActivityTypeBadgeClass(log.activityType)}">
                    ${escapeActivityHtml(log.activityType || 'N/A')}
                </span>
            </td>
            <td>
                <span class="action-badge ${getActionBadgeClass(log.action)}">
                    ${escapeActivityHtml(log.action || 'N/A')}
                </span>
            </td>
            <td>${escapeActivityHtml(log.details || '-')}</td>
        </tr>
    `).join('');
}

function getActivityTypeBadgeClass(type) {
    const map = {
        'MATERIAL': 'material',
        'PURCHASE_ORDER': 'purchase-order',
        'PAYMENT': 'payment',
        'PROJECT': 'project'
    };
    return map[type] || 'material';
}

function getActionBadgeClass(action) {
    const map = {
        'CREATE': 'create',
        'UPDATE': 'update',
        'DELETE': 'delete',
        'COMPLETE': 'complete'
    };
    return map[action] || 'create';
}

function updateActivityLogsPaginationButtons() {
    const totalPages = Math.ceil(filteredActivityLogsData.length / activityLogsItemsPerPage);
    
    const prevBtn = document.getElementById('prevActivityPageBtn');
    const nextBtn = document.getElementById('nextActivityPageBtn');
    const pageIndicator = document.getElementById('activityPageIndicator');
    
    if (prevBtn) prevBtn.disabled = activityLogsCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = activityLogsCurrentPage >= totalPages;
    if (pageIndicator) pageIndicator.textContent = `Page ${activityLogsCurrentPage} of ${Math.max(1, totalPages)}`;
}

function prevActivityLogsPage() {
    if (activityLogsCurrentPage > 1) {
        activityLogsCurrentPage--;
        renderActivityLogsTable();
        updateActivityLogsPaginationButtons();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function nextActivityLogsPage() {
    const totalPages = Math.ceil(filteredActivityLogsData.length / activityLogsItemsPerPage);
    if (activityLogsCurrentPage < totalPages) {
        activityLogsCurrentPage++;
        renderActivityLogsTable();
        updateActivityLogsPaginationButtons();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function clearAllActivityLogs() {
    // Show the confirmation modal instead of using browser confirm
    document.getElementById('clearActivityLogsConfirmModal').style.display = 'block';
}

function closeClearActivityLogsConfirmModal() {
    document.getElementById('clearActivityLogsConfirmModal').style.display = 'none';
}

function confirmClearAllActivityLogs() {
    // Close the modal
    closeClearActivityLogsConfirmModal();
    
    // Disable the Clear Logs button to prevent multiple clicks
    const clearButton = document.getElementById('clearActivityLogsBtn');
    if (clearButton) {
        clearButton.disabled = true;
        clearButton.style.opacity = '0.5';
        clearButton.style.cursor = 'not-allowed';
    }
    
    // Clear UI immediately (visual feedback to user)
    allActivityLogs = [];
    filteredActivityLogsData = [];
    activityLogsCurrentPage = 1;
    renderActivityLogsTable();
    updateActivityLogsPaginationButtons();
    showNotification('Clearing activity logs...', 'info');
    
    // Delete all logs from Firebase database in background
    (async () => {
        try {
            const deleteCount = await deleteAllActivityLogs();
            
            // Show success notification
            showNotification(`Activity logs cleared successfully (${deleteCount} logs deleted)`, 'success');
        } catch (error) {
            console.error('❌ Error clearing activity logs:', error);
            showNotification('Error clearing activity logs', 'error');
        } finally {
            // Re-enable the Clear Logs button
            if (clearButton) {
                clearButton.disabled = false;
                clearButton.style.opacity = '1';
                clearButton.style.cursor = 'pointer';
            }
        }
    })();
}

function formatActivityDateTime(timestamp) {
    if (!timestamp) return '-';
    
    try {
        let date;
        
        // Handle Firestore Timestamp objects
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
            // Alternative Firestore timestamp format
            date = new Date(timestamp.seconds * 1000);
        } else if (typeof timestamp === 'number') {
            // Unix timestamp in milliseconds
            date = new Date(timestamp);
        } else if (typeof timestamp === 'string') {
            // ISO string or other string format
            date = new Date(timestamp);
        } else {
            return '-';
        }
        
        // Validate the date
        if (isNaN(date.getTime())) {
            return '-';
        }
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.warn('Error formatting timestamp:', error);
        return '-';
    }
}

function escapeActivityHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// PROJECT DATA COLUMNS: feature removed. Stubs left in place so any lingering calls won't break.

function initializeProjectDataColumns() {
    // feature removed
}

function toggleProjectDataDropdown() {
    // feature removed
}

function openConfigureProjectDataColumnsModal() {
    // feature removed
}

function closeConfigureProjectDataColumnsModal() {
    // feature removed
}

function toggleConfigureDetailsProjectData() {
    // feature removed
}

async function loadProjectDataColumnSettings() {
    return null; // feature removed
}

function enableProjectDataColumnRename() {
    // feature removed
}

function deleteProjectDataColumn() {
    // feature removed
}

function addNewProjectDataColumn() {
    // feature removed
}

/**
 * Navigate to Material Processing tab (Delivery Receipt page)
 */
window.goToMaterialProcessing = function() {
  // Navigate to Material Processing tab and show MR by default
  const navLink = document.querySelector('[data-page="delivery-receipt"]');
  if (navLink) {
    navLink.click();
  } else {
    // Fallback: manually show the page and switch to MR tab
    document.querySelectorAll(".page").forEach(p => p.style.display = "none");
    const target = document.getElementById("delivery-receipt");
    if (target) {
      target.style.display = "block";
      loadDeliveryColumns();
      loadDeliveries();
      window.switchProcurementTab('mr');
    } else {
      // If not found in current page, navigate to dashboard
      window.location.href = 'dashboard.html#delivery-receipt';
    }
  }
};

function buildProjectDataTable(columns) {
    // project data feature removed - minimal stub to avoid runtime errors
    try {
        const tr = document.getElementById('projectDataTableHead');
        if (!tr) return;
        tr.innerHTML = '';
    } catch (e) {
        // swallow
    }
}

/**
 * Handle Drag & Drop for Project Data Columns
 */
function handleProjectDataColumnContainerDrop(event) {
    event.preventDefault();
}
