// Import Firebase functions
import { auth, db } from './firebase.js';
import { 
    getDoc, doc, collection, getDocs, setDoc, updateDoc, addDoc, deleteDoc, 
    query, where, serverTimestamp, Timestamp, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updateEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ===========================
// UTILITY FUNCTIONS
// ===========================

/**
 * Format name with proper capitalization (capitalize first letter of each word)
 * @param {string} name - The name to format
 * @returns {string} - Formatted name
 */
function formatName(name) {
    if (!name || name === 'Unknown') return name || 'Unknown';
    return name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function formatFormalText(text) {
    if (!text || text === 'Unknown') return text || 'Unknown';

    return text
        .trim()
        .toLowerCase()
        .split(/(\s+)/)
        .map(segment => {
            if (/^\s+$/.test(segment)) return segment;
            return segment
                .split(/([-\/])/)
                .map(part => {
                    if (part === '-' || part === '/') return part;
                    return part ? part.charAt(0).toUpperCase() + part.slice(1) : part;
                })
                .join('');
        })
        .join('');
}

// ===========================
// EMPLOYEE NAME CACHE
// ===========================
const employeeNameCache = {};

/**
 * Get employee name by userId - fetches from cache or database
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - The employee name or "Unknown"
 */
async function getEmployeeName(userId) {
    if (!userId) return 'Unknown';
    
    // Return from cache if available
    if (employeeNameCache[userId]) {
        return employeeNameCache[userId];
    }
    
    try {
        // Try to fetch from users collection
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            const fullName = formatName(userDoc.data().fullName || 'Unknown');
            employeeNameCache[userId] = fullName;
            return fullName;
        }
        
        // Try to fetch from employees collection
        const empDoc = await getDoc(doc(db, 'employees', userId));
        if (empDoc.exists()) {
            const fullName = formatName(empDoc.data().name || 'Unknown');
            employeeNameCache[userId] = fullName;
            return fullName;
        }
    } catch (error) {
        console.warn('Error fetching employee name:', error);
    }
    
    // Cache the "Unknown" result to avoid repeated lookups
    employeeNameCache[userId] = 'Unknown';
    return 'Unknown';
}

/**
 * Get complete employee data by userId - fetches from cache or database
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} - Employee data object
 */
async function getEmployeeData(userId) {
    if (!userId) return { name: 'Unknown', site: '', designation: '', tagging: '' };
    
    try {
        // Try to fetch from employees collection first (should have more complete data)
        let userDoc = await getDoc(doc(db, 'employees', userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return {
                name: formatName(userData.name || 'Unknown'),
                site: userData.department || userData.site || '',
                designation: userData.designation || '',
                tagging: userData.tagging || ''
            };
        }
        
        // Try to fetch from users collection as fallback
        userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return {
                name: formatName(userData.fullName || 'Unknown'),
                site: userData.site || userData.department || '',
                designation: userData.designation || '',
                tagging: userData.tagId || userData.tagging || ''
            };
        }
    } catch (error) {
        console.warn('Error fetching employee data:', error);
    }
    
    return { name: 'Unknown', site: '', designation: '', tagging: '' };
}

// ===========================
// EMPLOYEE MANAGEMENT
// ===========================

async function loadEmployeesData() {
    try {
        console.log('Loading employees data...');
        const employeesRef = collection(db, 'employees');
        const designationsRef = collection(db, 'designations');
        
        const [employeesSnapshot, designationsSnapshot] = await Promise.all([
            getDocs(employeesRef),
            getDocs(designationsRef)
        ]);
        
        console.log('Employees snapshot size:', employeesSnapshot.size);
        console.log('Snapshot docs:', employeesSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const tableBody = document.getElementById('usersTableBody');
        tableBody.innerHTML = '';
        
        if (employeesSnapshot.empty) {
            console.log('No employees found in database');
            tableBody.innerHTML = '<tr class="no-data"><td colspan="8" style="text-align:center;">No employees found. Click "+ Add Employee" to create one.</td></tr>';
        } else {
            employeesSnapshot.forEach((doc) => {
                const employee = doc.data();
                console.log('Rendering employee:', employee);
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatName(employee.name || 'Unknown')}</td>
                    <td>${employee.tagging || '-'}</td>
                    <td>${employee.email || '-'}</td>
                    <td>${employee.contact || '-'}</td>
                    <td>${employee.department || '-'}</td>
                    <td>${employee.designation || '-'}</td>
                    <td><span class="status-badge ${employee.status}">${employee.status || 'Unknown'}</span></td>
                    <td>
                        <button class="action-btn edit-btn" onclick="editEmployee('${doc.id}')" title="Edit">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="action-btn delete-btn" onclick="deleteEmployee('${doc.id}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
        
        console.log('Employees table updated successfully');
        
        // ===== POPULATE FILTER DROPDOWNS =====
        // Populate designation filter dropdown
        const designationFilterSelect = document.getElementById('userDesignationFilter');
        if (designationFilterSelect) {
            console.log('Populating designation filter dropdown');
            designationFilterSelect.innerHTML = '<option value="">All Designations</option>';
            designationsSnapshot.forEach((doc) => {
                const designation = doc.data();
                const designName = designation.designationName || designation.name || 'Unknown';
                const option = document.createElement('option');
                option.value = designName;
                option.textContent = designName;
                designationFilterSelect.appendChild(option);
            });
            console.log('Designation filter dropdown populated');
        }
        
        // Collect unique departments/sites from employees data
        const departmentsSet = new Set();
        employeesSnapshot.forEach((doc) => {
            const employee = doc.data();
            const dept = employee.department || employee.site || '';
            if (dept) {
                departmentsSet.add(dept);
            }
        });
        
        // Populate department filter dropdown
        const departmentFilterSelect = document.getElementById('userDepartmentFilter');
        if (departmentFilterSelect) {
            console.log('Populating department filter dropdown');
            departmentFilterSelect.innerHTML = '<option value="">All Departments/Sites</option>';
            Array.from(departmentsSet).sort().forEach((dept) => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                departmentFilterSelect.appendChild(option);
            });
            console.log('Department filter dropdown populated with ' + departmentsSet.size + ' departments');
        }
        
    } catch (error) {
        console.error('Error loading employees:', error);
    }
}


async function showAddEmployeeModal() {
    const modal = document.getElementById('addEmployeeModal');
    if (!modal) return;
    
    try {
        // Load sites for department dropdown
        const sitesRef = collection(db, 'sites');
        const sitesSnapshot = await getDocs(sitesRef);
        const departmentSelect = document.getElementById('employeeDepartment');
        departmentSelect.innerHTML = '<option value="">Select Department/Site</option>';
        
        sitesSnapshot.forEach((doc) => {
            const site = doc.data();
            const option = document.createElement('option');
            option.value = site.siteName || site.name;
            option.textContent = site.siteName || site.name;
            departmentSelect.appendChild(option);
        });
        
        // Load designations for designation dropdown
        const designationsRef = collection(db, 'designations');
        const designationsSnapshot = await getDocs(designationsRef);
        const designationSelect = document.getElementById('employeeDesignation');
        designationSelect.innerHTML = '<option value="">Select Designation</option>';
        
        designationsSnapshot.forEach((doc) => {
            const designation = doc.data();
            const option = document.createElement('option');
            option.value = designation.designationName || doc.id;
            option.textContent = designation.designationName || doc.id;
            designationSelect.appendChild(option);
        });
        
        // Clear form
        document.getElementById('addEmployeeForm').reset();
        modal.classList.add('active');
    } catch (error) {
        console.error('Error preparing employee modal:', error);
    }
}

async function submitAddEmployee(e) {
    e.preventDefault();
    
    try {
        // Save current admin user to restore session later
        const adminUser = auth.currentUser;
        console.log('Admin user before creating employee:', adminUser?.email);
        
        // CRITICAL: Prevent detectAndShowUserInterface from redirecting during employee creation
        window.skipUserDetectRedirect = true;
        
        const fullName = document.getElementById('employeeName').value;
        const firstName = fullName.trim().split(' ')[0]; // Get only first name
        const email = document.getElementById('employeeEmail').value;
        const employeeTagging = document.getElementById('employeeTagging').value.trim();
        
        // Auto-generate password as "firstname123" (lowercase)
        const password = firstName.toLowerCase() + '123';
        
        console.log('Creating employee:', { fullName, firstName, email, password });
        
        // Create Firebase Auth account
        const authResult = await createUserWithEmailAndPassword(auth, email, password);
        const employeeAuthId = authResult.user.uid;
        console.log('Employee auth created with ID:', employeeAuthId);
        
        // Save employee data to Firestore
        const employeeData = {
            uid: employeeAuthId,
            name: fullName,
            ...(employeeTagging ? { tagging: employeeTagging } : {}),
            email: email,
            contact: document.getElementById('employeeContact').value,
            department: document.getElementById('employeeDepartment').value,
            designation: document.getElementById('employeeDesignation').value,
            status: document.getElementById('employeeStatus').value || 'active',
            role: 'employee',  // Required for login page
            createdAt: new Date().toISOString()
        };
        
        console.log('Employee data:', employeeData);
        
        await setDoc(doc(db, 'employees', employeeAuthId), employeeData);
        console.log('Employee data saved to Firestore');
        
        logActivity('Employee Added', `Added employee: ${fullName} (${email})`);
        
        // Restore admin user session immediately
        console.log('Restoring admin session for:', adminUser?.email);
        await auth.updateCurrentUser(adminUser);
        console.log('Admin session restored');
        
        // NOW allow detectAndShowUserInterface to work normally
        window.skipUserDetectRedirect = false;
        
        // Close modal and reset
        document.getElementById('addEmployeeModal').classList.remove('active');
        document.getElementById('addEmployeeForm').reset();
        
        // Add small delay to ensure modal closes and data is committed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload table
        await loadEmployeesData();
        
        showMessage('Success', `Employee ${fullName} created successfully!`);
        
    } catch (error) {
        console.error('Error adding employee:', error);
        // Make sure flag is cleared even on error
        window.skipUserDetectRedirect = false;
        
        // Close modal before showing error message
        document.getElementById('addEmployeeModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (error.code === 'auth/email-already-in-use') {
            showMessage('Error', 'This email is already registered');
        } else {
            showMessage('Error', 'Failed to add employee: ' + error.message);
        }
    }
}

async function deleteEmployee(employeeId) {
    const confirmed = await showConfirm('Delete Employee', 'Are you sure you want to delete this employee? This action cannot be undone.');
    if (confirmed) {
        try {
            console.log('Deleting employee:', employeeId);
            await deleteDoc(doc(db, 'employees', employeeId));
            console.log('Employee deleted from Firestore');
            logActivity('Employee Deleted', `Deleted employee ID: ${employeeId}`);
            await loadEmployeesData();
            showMessage('Success', 'Employee deleted successfully!');
        } catch (error) {
            console.error('Error deleting employee:', error);
            showMessage('Error', 'Failed to delete employee: ' + error.message);
        }
    }
}

window.deleteEmployee = deleteEmployee;

async function editEmployee(employeeId) {
    try {
        console.log('=== EDIT EMPLOYEE CALLED ===');
        console.log('Employee ID:', employeeId);
        
        if (!employeeId) {
            showMessage('Error', 'Invalid employee ID');
            return;
        }
        
        // Load employee data from Firestore
        const employeeDoc = await getDoc(doc(db, 'employees', employeeId));
        if (!employeeDoc.exists()) {
            showMessage('Error', 'Employee not found');
            return;
        }
        
        const employee = employeeDoc.data();
        console.log('Employee data loaded:', employee);
        
        // Populate form with employee data
        document.getElementById('editEmployeeName').value = employee.name || '';
        document.getElementById('editEmployeeTagging').value = employee.tagging || '';
        document.getElementById('editEmployeeEmail').value = employee.email || '';
        document.getElementById('editEmployeeContact').value = employee.contact || '';
        document.getElementById('editEmployeeStatus').value = employee.status || 'active';
        
        // Store the employee ID for later use in submit
        document.getElementById('editEmployeeForm').dataset.employeeId = employeeId;
        
        // Load departments and designations for dropdowns
        try {
            // Load departments
            const sitesRef = collection(db, 'sites');
            const sitesSnapshot = await getDocs(sitesRef);
            const departmentSelect = document.getElementById('editEmployeeDepartment');
            departmentSelect.innerHTML = '<option value="">Select Department/Site</option>';
            
            sitesSnapshot.forEach((doc) => {
                const option = document.createElement('option');
                option.value = doc.data().siteName || doc.id;
                option.textContent = doc.data().siteName || doc.id;
                departmentSelect.appendChild(option);
            });
            
            // Set selected department
            departmentSelect.value = employee.department || '';
            
            // Load designations
            const designationsRef = collection(db, 'designations');
            const designationsSnapshot = await getDocs(designationsRef);
            const designationSelect = document.getElementById('editEmployeeDesignation');
            designationSelect.innerHTML = '<option value="">Select Designation</option>';
            
            designationsSnapshot.forEach((doc) => {
                const option = document.createElement('option');
                option.value = doc.data().designationName || doc.id;
                option.textContent = doc.data().designationName || doc.id;
                designationSelect.appendChild(option);
            });
            
            // Set selected designation
            designationSelect.value = employee.designation || '';
            
        } catch (error) {
            console.error('Error loading dropdown data:', error);
        }
        
        // Open modal
        const editModal = document.getElementById('editEmployeeModal');
        console.log('Edit modal element:', editModal);
        editModal.classList.add('active');
        console.log('Modal opened, active class added');
        
    } catch (error) {
        console.error('=== ERROR IN EDIT EMPLOYEE ===', error);
        showMessage('Error', 'Failed to load employee data: ' + error.message);
    }
}

window.editEmployee = editEmployee;

async function submitEditEmployee(e) {
    e.preventDefault();
    
    try {
        const employeeId = document.getElementById('editEmployeeForm').dataset.employeeId;
        
        const updatedData = {
            name: document.getElementById('editEmployeeName').value,
            tagging: document.getElementById('editEmployeeTagging').value,
            contact: document.getElementById('editEmployeeContact').value,
            department: document.getElementById('editEmployeeDepartment').value,
            designation: document.getElementById('editEmployeeDesignation').value,
            status: document.getElementById('editEmployeeStatus').value
        };
        
        console.log('Updating employee:', employeeId, updatedData);
        
        await updateDoc(doc(db, 'employees', employeeId), updatedData);
        console.log('Employee updated successfully');
        
        logActivity('Employee Updated', `Updated employee ID: ${employeeId}`);
        
        // Close modal and reset
        document.getElementById('editEmployeeModal').classList.remove('active');
        document.getElementById('editEmployeeForm').reset();
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Reload table
        await loadEmployeesData();
        
        showMessage('Success', 'Employee updated successfully!');
        
    } catch (error) {
        console.error('Error updating employee:', error);
        
        // Close modal before showing error message
        document.getElementById('editEmployeeModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        showMessage('Error', 'Failed to update employee: ' + error.message);
    }
}

window.submitEditEmployee = submitEditEmployee;

// ===========================
// ROLE-BASED UI SWITCHING
// ===========================

async function detectAndShowUserInterface(user) {
    try {
        // Skip redirect if we're in the middle of employee creation
        if (window.skipUserDetectRedirect) {
            console.log('Skipping user redirect during employee creation');
            return;
        }
        
        // Check if user is an employee (employees are separate from attendance users)
        const employeeDoc = await getDoc(doc(db, 'employees', user.uid));
        const isEmployee = employeeDoc.exists();
        
        // If employee, redirect to employee-dashboard page
        if (isEmployee) {
            window.location.href = 'employee-dashboard.html';
            return;
        }
        
        // If not employee, check if attendance user (has access to attendance module)
        const hasAccess = await checkUserAttendanceAccess(user.uid);
        
        if (!hasAccess) {
            await showMessage('Access Denied', 'You do not have access to the Attendance Module. Please contact your administrator.');
            window.location.href = 'modules.html';
            return;
        }
        
        // Show attendance user UI
        const attendanceUserSidebar = document.getElementById('attendanceUserSidebar');
        const employeeSidebar = document.getElementById('employeeSidebar');
        
        if (attendanceUserSidebar) attendanceUserSidebar.style.display = 'block';
        if (employeeSidebar) employeeSidebar.style.display = 'none';
        
        // Hide employee modules
        document.querySelectorAll('.employee-module').forEach(el => el.classList.remove('active'));
        
        // Show attendance dashboard as default
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.classList.add('active');
        }
        
        await loadDashboardData();
        document.getElementById('currentUserRole').textContent = 'Admin';
        
    } catch (error) {
        console.error('Error detecting user interface:', error);
        await showMessage('Error', 'An error occurred while loading the interface. Please refresh the page.');
    }
}

async function loadEmployeeProfile(employeeData, user) {
    try {
        document.getElementById('empProfileName').textContent = employeeData.name || 'Unknown';
        document.getElementById('empProfileTagging').textContent = employeeData.tagging || '-';
        document.getElementById('empProfileEmail').textContent = employeeData.email || user?.email || '-';
        document.getElementById('empProfileDepartment').textContent = employeeData.department || '-';
        document.getElementById('empProfileDesignation').textContent = employeeData.designation || '-';
        document.getElementById('empProfileStatus').textContent = (employeeData.status || 'active').toUpperCase();
        
        document.getElementById('empGreeting').textContent = `Hi, ${(employeeData.name || 'Employee').split(' ')[0]}! Welcome back to your attendance dashboard`;
    } catch (error) {
        console.error('Error loading employee profile:', error);
    }
}

async function loadEmployeeStats(userId) {
    try {
        const attendanceRef = collection(db, 'attendance');
        const snapshot = await getDocs(query(attendanceRef, where('employeeId', '==', userId)));
        
        let presentDays = 0;
        let absentDays = 0;
        let lateArrivals = 0;
        let totalHours = 0;
        
        snapshot.forEach((doc) => {
            const record = doc.data();
            if (record.status === 'Present' || record.status === 'On Time') presentDays++;
            if (record.status === 'Absent') absentDays++;
            if (record.status === 'Late') lateArrivals++;
            
            if (record.clockIn && record.clockOut) {
                const inMinutes = parseTimeToMinutes(record.clockIn);
                const outMinutes = parseTimeToMinutes(record.clockOut);
                const diffMinutes = Math.max(outMinutes - inMinutes, 0);
                totalHours += diffMinutes / 60;
            }
        });
        
        document.getElementById('empPresentDays').textContent = presentDays;
        document.getElementById('empAbsentDays').textContent = absentDays;
        document.getElementById('empLateArrivals').textContent = lateArrivals;
        document.getElementById('empTotalHours').textContent = totalHours.toFixed(2) + 'h';
        
        // Load employee records
        await loadEmployeeAttendanceRecords(userId);
    } catch (error) {
        console.error('Error loading employee stats:', error);
    }
}

async function loadEmployeeAttendanceRecords(userId) {
    try {
        const attendanceRef = collection(db, 'attendance');
        const snapshot = await getDocs(query(attendanceRef, where('employeeId', '==', userId), orderBy('date', 'desc')));
        
        const tableBody = document.getElementById('empRecordsTableBody');
        tableBody.innerHTML = '';
        
        if (snapshot.empty) {
            tableBody.innerHTML = '<tr class="no-data"><td colspan="6" style="text-align:center;">No attendance records found</td></tr>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const record = doc.data();
            const date = new Date(record.date);
            const dayName = date.toLocaleString('en-US', { weekday: 'short' });
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.date || '-'}</td>
                <td>${dayName}</td>
                <td>${formatTimeToAMPM(record.clockIn) || 'N/A'}</td>
                <td>${formatTimeToAMPM(record.clockOut) || 'N/A'}</td>
                <td>${record.hoursWorked || 'N/A'}</td>
                <td><span class="status-badge ${record.status?.toLowerCase().replace(/\s+/g, '-')}">${record.status || 'Unknown'}</span></td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading employee attendance records:', error);
    }
}

function setupEmployeeNavigation() {
    const employeeNavItems = document.querySelectorAll('#employeeSidebar .nav-item');
    const employeeModules = document.querySelectorAll('.employee-module');
    
    employeeNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            const moduleId = item.getAttribute('data-module');
            
            // Remove active class from all items and modules
            employeeNavItems.forEach(ni => ni.classList.remove('active'));
            employeeModules.forEach(mc => mc.classList.remove('active'));
            
            // Add active class to clicked item and corresponding module
            item.classList.add('active');
            const module = document.getElementById(moduleId);
            if (module) module.classList.add('active');
        });
    });
    
    // Add listeners for module navigation buttons in dashboard
    const moduleNavBtns = document.querySelectorAll('.emp-module-nav-btn');
    moduleNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleId = btn.getAttribute('data-module');
            
            // Remove active class from all items and modules
            employeeNavItems.forEach(ni => ni.classList.remove('active'));
            employeeModules.forEach(mc => mc.classList.remove('active'));
            
            // Find and activate the correct nav item and module
            const navItem = document.querySelector(`#employeeSidebar .nav-item[data-module="${moduleId}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
            
            const module = document.getElementById(moduleId);
            if (module) module.classList.add('active');
        });
    });
}

// ===========================
// ROLE-BASED ACCESS CONTROL
// ===========================

async function checkUserAttendanceAccess(userId) {
    try {
        // Check if user has attendance role
        const userDocRef = doc(db, 'attendance_users', userId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            return true; // User has attendance access
        }
        
        // Also check if user is an admin
        const adminDocRef = doc(db, 'admin_users', userId);
        const adminDoc = await getDoc(adminDocRef);
        
        if (adminDoc.exists()) {
            return true; // Admin has access to all modules
        }
        
        return false; // No access
    } catch (error) {
        console.error('Error checking attendance access:', error);
        return false;
    }
}

// ===========================
// HELPER FUNCTIONS FOR MODALS
// ===========================

function showMessage(title, message) {
    return new Promise((resolve) => {
        const messageModal = document.getElementById('messageModal');
        const messageTitle = document.getElementById('messageTitle');
        const messageText = document.getElementById('messageText');
        const messageOkBtn = document.getElementById('messageOkBtn');
        const closeMessageModal = document.getElementById('closeMessageModal');

        messageTitle.textContent = title;
        messageText.textContent = message;
        messageModal.classList.add('active');

        const handleClose = () => {
            messageModal.classList.remove('active');
            resolve();
        };

        messageOkBtn.addEventListener('click', handleClose);
        closeMessageModal.addEventListener('click', handleClose);
        window.addEventListener('click', (event) => {
            if (event.target === messageModal) handleClose();
        });
    });
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmYesBtn = document.getElementById('confirmYesBtn');
        const confirmNoBtn = document.getElementById('confirmNoBtn');
        const closeConfirmModal = document.getElementById('closeConfirmModal');

        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmModal.classList.add('active');

        const handleYes = () => {
            cleanup();
            confirmModal.classList.remove('active');
            resolve(true);
        };

        const handleNo = () => {
            cleanup();
            confirmModal.classList.remove('active');
            resolve(false);
        };

        const cleanup = () => {
            confirmYesBtn.removeEventListener('click', handleYes);
            confirmNoBtn.removeEventListener('click', handleNo);
            closeConfirmModal.removeEventListener('click', handleNo);
        };

        confirmYesBtn.addEventListener('click', handleYes);
        confirmNoBtn.addEventListener('click', handleNo);
        closeConfirmModal.addEventListener('click', handleNo);
        window.addEventListener('click', (event) => {
            if (event.target === confirmModal) handleNo();
        });
    });
}

// ===========================
// ACTIVITY LOGGER MODULE
// ===========================

function logActivity(activity, details = '', status = 'success') {
    try {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const timestamp = new Date().toISOString();
                const date = timestamp.split('T')[0];
                
                try {
                    await addDoc(collection(db, 'activityLogs'), {
                        userId: user.uid,
                        userEmail: user.email,
                        activity: activity,
                        details: details,
                        status: status,
                        timestamp: serverTimestamp(),
                        date: date
                    });
                } catch (error) {
                    console.error('Error logging activity:', error);
                }
            }
        });
    } catch (error) {
        console.error('Error in logActivity:', error);
    }
}

// ===========================
// ATTENDANCE RULES & VALIDATION
// ===========================

const AttendanceRules = {
    TIME_IN: {
        LATEST_ON_TIME: '08:15',
        LATE_START: '08:16',
        TIMEZONE: 'Asia/Manila'
    },
    
    TIME_OUT: {
        EARLIEST: '17:00',
        LATEST: '18:00',
        AUTO_TIMEOUT: '18:00',
        TIMEZONE: 'Asia/Manila'
    },

    LUNCH: {
        START: '12:00',
        END: '13:00'
    },
    
    STATUS: {
        ON_TIME: 'On Time',
        LATE: 'Late',
        PRESENT: 'Present',
        FORGOT_TO_OUT: 'Forgot to Clock Out',
        AUTO_TIMED_OUT: 'Auto Timed Out',
        NORMAL: 'Normal',
        LATE_FORGOT_TO_OUT: 'Late & Forgot to Clock Out',
        LATE_AUTO_TIMED_OUT: 'Late & Auto Timed Out'
    }
};

function updateAttendanceRulesFromSettings(settings) {
    if (settings) {
        if (settings.lateTimeThreshold) AttendanceRules.TIME_IN.LATEST_ON_TIME = settings.lateTimeThreshold;
        if (settings.earliestClockOut) AttendanceRules.TIME_OUT.EARLIEST = settings.earliestClockOut;
        if (settings.latestClockOut) AttendanceRules.TIME_OUT.LATEST = settings.latestClockOut;
        if (settings.autoTimeout) AttendanceRules.TIME_OUT.AUTO_TIMEOUT = settings.autoTimeout;
    }
}

// ===========================
// ADMIN SETTINGS FUNCTIONS
// ===========================

async function openAdminSettings() {
    try {
        const adminModal = document.getElementById('adminSettingsModal');
        if (!adminModal) return;

        const user = auth.currentUser;
        if (!user) return;

        const profileInfo = await getAttendanceAdminProfileInfo(user.uid);
        const profile = profileInfo.data || {};

        document.getElementById('adminFullName').value = profile.fullName || profile.name || user.displayName || 'Admin User';
        document.getElementById('adminEmail').value = profile.email || user.email || '';
        document.getElementById('adminRole').value = 'Admin';
        document.getElementById('adminDepartment').value = profile.department || profile.site || 'Headquarters';
        document.getElementById('adminStatus').value = (profile.status || 'Active').toString().toUpperCase();
        document.getElementById('adminLastLogin').value = user.metadata?.lastSignInTime
            ? new Date(user.metadata.lastSignInTime).toLocaleDateString()
            : new Date().toLocaleDateString();

        await loadActivityLogs();
        adminModal.classList.add('active');
    } catch (error) {
        console.error('Error opening admin settings:', error);
    }
}

async function getAttendanceAdminProfileInfo(userId) {
    const profileCollections = ['admin_users', 'attendance_users', 'users'];

    for (const collectionName of profileCollections) {
        try {
            const profileRef = doc(db, collectionName, userId);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
                return { ref: profileRef, collection: collectionName, data: profileSnap.data() };
            }
        } catch (error) {
            console.warn(`Error checking ${collectionName}:`, error);
        }
    }

    return {
        ref: doc(db, 'admin_users', userId),
        collection: 'admin_users',
        data: {}
    };
}

async function populateEditDepartmentOptions(selectedDepartment = '') {
    const departmentSelect = document.getElementById('editDepartment');
    if (!departmentSelect) return;

    departmentSelect.innerHTML = '<option value="">Select Department/Site</option>';

    try {
        const sitesSnap = await getDocs(collection(db, 'sites'));
        const siteNames = [];

        sitesSnap.forEach((siteDoc) => {
            const siteData = siteDoc.data();
            const siteName = (siteData.siteName || siteData.name || '').trim();
            if (siteName) siteNames.push(siteName);
        });

        const uniqueSiteNames = Array.from(new Set(siteNames)).sort((a, b) => a.localeCompare(b));

        uniqueSiteNames.forEach((siteName) => {
            const option = document.createElement('option');
            option.value = siteName;
            option.textContent = siteName;
            departmentSelect.appendChild(option);
        });
    } catch (error) {
        console.warn('Unable to load department/site options:', error);
    }

    if (selectedDepartment) {
        const hasOption = Array.from(departmentSelect.options).some((opt) => opt.value === selectedDepartment);
        if (!hasOption) {
            const fallbackOption = document.createElement('option');
            fallbackOption.value = selectedDepartment;
            fallbackOption.textContent = selectedDepartment;
            departmentSelect.appendChild(fallbackOption);
        }
        departmentSelect.value = selectedDepartment;
    }
}

async function openEditAttendanceAdminProfileModal() {
    const editProfileModal = document.getElementById('editProfileModal');
    if (!editProfileModal) return;

    const user = auth.currentUser;
    if (!user) {
        await showMessage('Error', 'No authenticated admin user found. Please login again.');
        return;
    }

    const profileInfo = await getAttendanceAdminProfileInfo(user.uid);
    const profile = profileInfo.data || {};

    const currentName = profile.fullName || profile.name || user.displayName || '';
    const currentEmail = profile.email || user.email || '';
    const currentDepartment = profile.department || profile.site || 'Headquarters';

    document.getElementById('editFullName').value = currentName;
    document.getElementById('editEmail').value = currentEmail;
    await populateEditDepartmentOptions(currentDepartment);

    editProfileModal.classList.add('active');
}

async function submitAttendanceAdminProfileUpdate(e) {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        await showMessage('Error', 'No authenticated admin user found. Please login again.');
        return;
    }

    const fullName = (document.getElementById('editFullName')?.value || '').trim();
    const email = (document.getElementById('editEmail')?.value || '').trim();
    const department = (document.getElementById('editDepartment')?.value || '').trim();

    if (!fullName || !email || !department) {
        await showMessage('Validation Error', 'Please complete all profile fields.');
        return;
    }

    try {
        const profileInfo = await getAttendanceAdminProfileInfo(user.uid);
        await setDoc(profileInfo.ref, {
            fullName,
            name: fullName,
            email,
            department,
            site: department,
            updatedAt: serverTimestamp()
        }, { merge: true });

        let emailUpdateWarning = '';
        if (user.email && user.email !== email) {
            try {
                await updateEmail(user, email);
            } catch (emailError) {
                console.warn('Unable to update auth email:', emailError);
                emailUpdateWarning = ' Profile saved, but Auth email was not updated (please re-login and try again).';
            }
        }

        const adminFullName = document.getElementById('adminFullName');
        const adminEmail = document.getElementById('adminEmail');
        const adminDepartment = document.getElementById('adminDepartment');
        if (adminFullName) adminFullName.value = fullName;
        if (adminEmail) adminEmail.value = email;
        if (adminDepartment) adminDepartment.value = department;

        document.getElementById('editProfileModal')?.classList.remove('active');
        logActivity('Profile Updated', `Attendance admin profile updated for ${email}`);
        await showMessage('Success', `Profile updated successfully.${emailUpdateWarning}`);
    } catch (error) {
        console.error('Error updating attendance admin profile:', error);
        logActivity('Profile Updated', `Failed: ${error.message}`, 'failed');
        await showMessage('Error', 'Failed to update profile: ' + error.message);
    }
}

async function submitAttendanceAdminPasswordChange(e) {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || !user.email) {
        await showMessage('Error', 'No authenticated admin account found. Please login again.');
        return;
    }

    const currentPassword = (document.getElementById('currentPassword')?.value || '').trim();
    const newPassword = (document.getElementById('newPassword')?.value || '').trim();
    const confirmPassword = (document.getElementById('confirmPassword')?.value || '').trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
        await showMessage('Validation Error', 'Please fill in all password fields.');
        return;
    }

    if (newPassword !== confirmPassword) {
        await showMessage('Validation Error', 'New password and confirm password do not match.');
        return;
    }

    if (newPassword.length < 6) {
        await showMessage('Validation Error', 'New password must be at least 6 characters long.');
        return;
    }

    if (newPassword === currentPassword) {
        await showMessage('Validation Error', 'New password must be different from current password.');
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);

        const profileInfo = await getAttendanceAdminProfileInfo(user.uid);
        await setDoc(profileInfo.ref, {
            passwordUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        document.getElementById('changePasswordForm')?.reset();
        document.getElementById('changePasswordModal')?.classList.remove('active');
        logActivity('Password Changed', 'Attendance admin password updated successfully');
        await showMessage('Success', 'Password changed successfully.');
    } catch (error) {
        console.error('Error changing attendance admin password:', error);

        let errorMessage = 'Failed to change password: ' + error.message;
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = 'Current password is incorrect. Please try again.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'New password is too weak. Please choose a stronger password.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Session expired. Please logout and login again before changing password.';
        }

        logActivity('Password Changed', `Failed: ${error.code || error.message}`, 'failed');
        await showMessage('Error', errorMessage);
    }
}

async function loadActivityLogs(filterActivity = '', searchQuery = '') {
    try {
        const activityLogsRef = collection(db, 'activityLogs');
        let q = query(
            activityLogsRef,
            orderBy('timestamp', 'desc'),
            limit(50)
        );

        const snapshot = await getDocs(q);
        const tableBody = document.getElementById('activityLogsTableBody');
        tableBody.innerHTML = '';

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr class="no-data"><td colspan="5" style="text-align:center;">No activity logs found</td></tr>';
            return;
        }

        snapshot.forEach((doc) => {
            const log = doc.data();
            
            // Apply filters
            if (filterActivity && log.activity !== filterActivity) return;
            if (searchQuery && !log.userEmail.toLowerCase().includes(searchQuery.toLowerCase())) return;

            const timestamp = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : 'N/A';
            const statusColor = log.status === 'success' ? '#0a9b03' : '#ff6b6b';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${log.userEmail || 'Unknown'}</td>
                <td>${log.activity || 'Unknown'}</td>
                <td>${log.details || '-'}</td>
                <td><span style="color:${statusColor}; font-weight:700; text-transform:uppercase;">${log.status || 'Unknown'}</span></td>
                <td>${timestamp}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading activity logs:', error);
    }
}

// ===========================
// TIME HELPER FUNCTIONS
// ===========================

function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    
    timeStr = timeStr.trim();
    const is12Hour = /[AaPp][Mm]/.test(timeStr);
    
    if (is12Hour) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
        if (match) {
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const period = match[3].toUpperCase();
            
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            return hours * 60 + minutes;
        }
    } else {
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            if (!isNaN(hours) && !isNaN(minutes)) return hours * 60 + minutes;
        }
    }
    return 0;
}

function calculateOverlappingMinutes(rangeStart, rangeEnd, windowStart, windowEnd) {
    const overlapStart = Math.max(rangeStart, windowStart);
    const overlapEnd = Math.min(rangeEnd, windowEnd);
    return Math.max(overlapEnd - overlapStart, 0);
}

function minutesToTimeString(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

function validateTimeIn(clockInTime) {
    const clockInMinutes = parseTimeToMinutes(clockInTime);
    const onTimeMinutes = parseTimeToMinutes(AttendanceRules.TIME_IN.LATEST_ON_TIME);
    const lateStartMinutes = parseTimeToMinutes(AttendanceRules.TIME_IN.LATE_START);

    if (clockInMinutes <= onTimeMinutes) {
        return { isLate: false, status: AttendanceRules.STATUS.ON_TIME, message: 'On time' };
    } else {
        return { isLate: true, status: AttendanceRules.STATUS.LATE, message: 'Late arrival' };
    }
}

function validateTimeOut(clockOutTime) {
    const clockOutMinutes = parseTimeToMinutes(clockOutTime);
    const earliestMinutes = parseTimeToMinutes(AttendanceRules.TIME_OUT.EARLIEST);
    const latestMinutes = parseTimeToMinutes(AttendanceRules.TIME_OUT.LATEST);

    if (clockOutMinutes < earliestMinutes) {
        return { isValid: false, message: `Cannot clock out before ${AttendanceRules.TIME_OUT.EARLIEST}` };
    } else if (clockOutMinutes > latestMinutes) {
        return { isValid: true, message: `Clocked out at ${clockOutTime} (after ${AttendanceRules.TIME_OUT.LATEST})` };
    }
    return { isValid: true, message: 'Valid clock out time' };
}

function checkAutoTimeout(clockInDate) {
    const autoTimeoutTime = parseTimeToMinutes(AttendanceRules.TIME_OUT.AUTO_TIMEOUT);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (nowMinutes >= autoTimeoutTime) {
        return {
            shouldAutoTimeout: true,
            timeoutTime: AttendanceRules.TIME_OUT.AUTO_TIMEOUT,
            reason: 'Auto timeout reached'
        };
    }

    return {
        shouldAutoTimeout: false,
        timeoutTime: null,
        reason: null
    };
}

function calculateHoursWorked(clockInTime, clockOutTime, lunchOutTime = null, lunchInTime = null) {
    try {
        const clockInMinutes = parseTimeToMinutes(clockInTime);
        const clockOutMinutes = parseTimeToMinutes(clockOutTime);
        
        if (clockInMinutes === 0 || clockOutMinutes === 0) return null;
        
        let diffMinutes = clockOutMinutes - clockInMinutes;
        if (diffMinutes < 0) diffMinutes += 24 * 60;

        const lunchStart = parseTimeToMinutes(AttendanceRules.LUNCH.START);
        const lunchEnd = parseTimeToMinutes(AttendanceRules.LUNCH.END);
        let lunchDeduction = calculateOverlappingMinutes(clockInMinutes, clockOutMinutes, lunchStart, lunchEnd);

        if (lunchOutTime && lunchInTime) {
            const lunchOutMinutes = parseTimeToMinutes(lunchOutTime);
            const lunchInMinutes = parseTimeToMinutes(lunchInTime);
            if (lunchOutMinutes > 0 && lunchInMinutes > 0 && lunchInMinutes >= lunchOutMinutes) {
                lunchDeduction = calculateOverlappingMinutes(lunchOutMinutes, lunchInMinutes, lunchStart, lunchEnd);
            }
        }

        diffMinutes = Math.max(diffMinutes - Math.min(lunchDeduction, diffMinutes), 0);
        
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        
        return {
            hours: hours,
            minutes: minutes,
            totalMinutes: diffMinutes,
            lunchDeduction,
            formatted: `${hours}h ${minutes}m`
        };
    } catch (error) {
        console.error('Error calculating hours worked:', error);
        return null;
    }
}

function getAttendanceSummary(record) {
    const summary = {
        date: record.date,
        clockIn: record.clockIn,
        clockOut: record.clockOut,
        status: record.status || AttendanceRules.STATUS.PRESENT,
        isLate: false,
        forgotToClockOut: false,
        hoursWorked: null,
        remarks: []
    };

    if (record.clockIn) {
        const validation = validateTimeIn(record.clockIn);
        summary.isLate = validation.isLate;
        if (validation.isLate) summary.remarks.push('Arrived late');
    }

    if (record.clockIn && !record.clockOut && 
        (record.status === AttendanceRules.STATUS.FORGOT_TO_OUT || 
         record.status === AttendanceRules.STATUS.AUTO_TIMED_OUT)) {
        summary.forgotToClockOut = true;
        summary.remarks.push('Did not clock out');
    }

    if (record.status !== AttendanceRules.STATUS.LATE_FORGOT_TO_OUT && 
        record.status !== AttendanceRules.STATUS.LATE_AUTO_TIMED_OUT) {
        if (summary.isLate && summary.forgotToClockOut) {
            summary.status = AttendanceRules.STATUS.LATE_FORGOT_TO_OUT;
        } else if (summary.isLate) {
            summary.status = AttendanceRules.STATUS.LATE;
        } else if (summary.forgotToClockOut) {
            summary.status = AttendanceRules.STATUS.FORGOT_TO_OUT;
        }
    }

    if (record.clockIn && record.clockOut) {
        summary.hoursWorked = calculateHoursWorked(record.clockIn, record.clockOut, record.lunchOut, record.lunchIn);
    }

    return summary;
}

function formatTimeToAMPM(timeStr) {
    if (!timeStr || timeStr === 'N/A') return 'N/A';

    try {
        timeStr = timeStr.trim();
        const is12Hour = /[AaPp][Mm]/.test(timeStr);
        
        if (is12Hour) return timeStr;
        
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        
        let hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    } catch (error) {
        console.error('Error formatting time:', error);
        return timeStr;
    }
}

// ===========================
// ATTENDANCE SETTINGS FUNCTIONS
// ===========================

async function showAttendanceSettingsModal() {
    const attendanceSettingsModal = document.getElementById('attendanceSettingsModal');
    attendanceSettingsModal.classList.add('active');
    await loadAttendanceSettings();
}

async function loadAttendanceSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, 'attendanceSettings', 'default'));
        if (settingsDoc.exists()) {
            const settings = settingsDoc.data();
            document.getElementById('settingsLateTimeThreshold').value = settings.lateTimeThreshold || '08:15';
            document.getElementById('settingsEarliestClockOut').value = settings.earliestClockOut || '17:00';
            document.getElementById('settingsLatestClockOut').value = settings.latestClockOut || '18:00';
            document.getElementById('settingsAutoTimeoutTime').value = settings.autoTimeout || '18:00';
            
            updateAttendanceRulesFromSettings(settings);
        }
    } catch (error) {
        console.error('Error loading attendance settings:', error);
    }
}

async function saveAttendanceSettings(settings) {
    try {
        await setDoc(doc(db, 'attendanceSettings', 'default'), settings, { merge: true });
        updateAttendanceRulesFromSettings(settings);
        logActivity('Update Attendance Settings', JSON.stringify(settings));
        await showMessage('Success', 'Attendance settings updated successfully');
    } catch (error) {
        console.error('Error saving settings:', error);
        await showMessage('Error', 'Failed to save settings: ' + error.message);
    }
}

// ===========================
// ATTENDANCE MANAGEMENT FUNCTIONS
// ===========================

async function loadAllAttendanceRecords() {
    try {
        const attendanceRef = collection(db, 'attendance');
        const q = query(attendanceRef, orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        
        const tbody = document.getElementById('attendanceTableBody');
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="10" style="text-align:center;">No attendance records found</td></tr>';
            return;
        }
        
        // Build rows with employee names
        const rows = [];
        for (const doc of snapshot.docs) {
            const record = doc.data();
            const summary = getAttendanceSummary(record);
            
            // Get employee name, fetching if not available
            const employeeName = formatName(record.employeeName || await getEmployeeName(record.userId));
            
            // Generate photo display HTML
            let photoHTML = '<div style="display:flex; gap:4px; justify-content:center;">';
            if (record.checkInPhotoURL) {
                const escapedCheckInURL = record.checkInPhotoURL.replace(/'/g, "\\'");
                photoHTML += `<img src="${record.checkInPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckInURL}', 'Check-In Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #1dd1a1;" title="View Check-In Photo" />`;
            }
            if (record.checkOutPhotoURL) {
                const escapedCheckOutURL = record.checkOutPhotoURL.replace(/'/g, "\\'");
                photoHTML += `<img src="${record.checkOutPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckOutURL}', 'Check-Out Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #ffa502;" title="View Check-Out Photo" />`;
            }
            if (!record.checkInPhotoURL && !record.checkOutPhotoURL) {
                photoHTML += '-';
            }
            photoHTML += '</div>';
            
            const lunchOutDisplay = formatTimeToAMPM(record.lunchOut) || '-';
            const lunchInDisplay = record.lunchIn
                ? `${formatTimeToAMPM(record.lunchIn)}${record.lunchLateReturn ? ' (Late)' : ''}`
                : '-';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${employeeName}</td>
                <td>${record.date || '-'}</td>
                <td style="text-align:center;">${formatTimeToAMPM(record.clockIn) || '-'}</td>
                <td style="text-align:center;">${formatTimeToAMPM(record.clockOut) || '-'}</td>
                <td style="text-align:center;">${lunchOutDisplay}</td>
                <td style="text-align:center;">${lunchInDisplay}</td>
                <td style="text-align:center;">${summary.hoursWorked ? summary.hoursWorked.formatted : '-'}</td>
                <td style="text-align:center;">${photoHTML}</td>
                <td style="text-align:center;"><span class="status-badge ${summary.status.toLowerCase().replace(/\s+/g, '-')}">${summary.status}</span></td>
                <td style="text-align:center; display:flex; gap:8px; justify-content:center; align-items:center;">
                    <button onclick="openEditAttendanceModal('${doc.id}', '${record.userId}')" title="Edit" style="padding:6px 8px; background:transparent; color:#1dd1a1; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-pen"></i></button>
                </td>
            `;
            rows.push(row);
        }
        
        // Append all rows
        rows.forEach(row => tbody.appendChild(row));
    } catch (error) {
        console.error('Error loading attendance records:', error);
        document.getElementById('attendanceTableBody').innerHTML = '<tr class="no-data"><td colspan="10">Error loading records</td></tr>';
    }
}

async function filterAttendanceRecords() {
    try {
        const searchInput = document.getElementById('attendanceSearchInput').value.toLowerCase();
        const dateFilter = document.getElementById('attendanceDateFilter').value;
        const statusFilter = document.getElementById('attendanceStatusFilter').value;
        
        const attendanceRef = collection(db, 'attendance');
        let q = query(attendanceRef, orderBy('timestamp', 'desc'));
        
        if (dateFilter) {
            q = query(attendanceRef, where('date', '==', dateFilter), orderBy('timestamp', 'desc'));
        }
        
        const snapshot = await getDocs(q);
        const tbody = document.getElementById('attendanceTableBody');
        tbody.innerHTML = '';
        
        let filteredRecords = [];
        for (const doc of snapshot.docs) {
            const record = doc.data();
            const summary = getAttendanceSummary(record);
            
            // Get employee name, fetching if not available and format it
            const employeeName = formatName(record.employeeName || await getEmployeeName(record.userId));
            
            const matchesSearch = !searchInput || 
                (employeeName && employeeName.toLowerCase().includes(searchInput.toLowerCase())) ||
                (record.employeeEmail && record.employeeEmail.toLowerCase().includes(searchInput));
            
            const matchesStatus = !statusFilter || summary.status === statusFilter;
            
            if (matchesSearch && matchesStatus) {
                filteredRecords.push({id: doc.id, record, summary, employeeName});
            }
        }
        
        if (filteredRecords.length === 0) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="10" style="text-align:center;">No records match your filter</td></tr>';
            return;
        }
        
        filteredRecords.forEach(({id, record, summary, employeeName}) => {
            // Generate photo display HTML
            let photoHTML = '<div style="display:flex; gap:4px; justify-content:center;">';
            if (record.checkInPhotoURL) {
                const escapedCheckInURL = record.checkInPhotoURL.replace(/'/g, "\\'");
                photoHTML += `<img src="${record.checkInPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckInURL}', 'Check-In Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #1dd1a1;" title="View Check-In Photo" />`;
            }
            if (record.checkOutPhotoURL) {
                const escapedCheckOutURL = record.checkOutPhotoURL.replace(/'/g, "\\'");
                photoHTML += `<img src="${record.checkOutPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckOutURL}', 'Check-Out Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #ffa502;" title="View Check-Out Photo" />`;
            }
            if (!record.checkInPhotoURL && !record.checkOutPhotoURL) {
                photoHTML += '-';
            }
            photoHTML += '</div>';
            
            const lunchOutDisplay = formatTimeToAMPM(record.lunchOut) || '-';
            const lunchInDisplay = record.lunchIn
                ? `${formatTimeToAMPM(record.lunchIn)}${record.lunchLateReturn ? ' (Late)' : ''}`
                : '-';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${employeeName}</td>
                <td>${record.date || '-'}</td>
                <td style="text-align:center;">${formatTimeToAMPM(record.clockIn) || '-'}</td>
                <td style="text-align:center;">${formatTimeToAMPM(record.clockOut) || '-'}</td>
                <td style="text-align:center;">${lunchOutDisplay}</td>
                <td style="text-align:center;">${lunchInDisplay}</td>
                <td style="text-align:center;">${summary.hoursWorked ? summary.hoursWorked.formatted : '-'}</td>
                <td style="text-align:center;">${photoHTML}</td>
                <td style="text-align:center;"><span class="status-badge ${summary.status.toLowerCase().replace(/\s+/g, '-')}">${summary.status}</span></td>
                <td style="text-align:center; display:flex; gap:8px; justify-content:center; align-items:center;">
                    <button onclick="openEditAttendanceModal('${id}', '${record.userId}')" title="Edit" style="padding:6px 8px; background:transparent; color:#1dd1a1; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-pen"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error filtering records:', error);
    }
}

function setupAttendanceFilterListeners() {
    try {
        const attendanceFilterBtn = document.getElementById('attendanceFilterBtn');
        const attendanceClearFilterBtn = document.getElementById('attendanceClearFilterBtn');
        
        if (attendanceFilterBtn) {
            attendanceFilterBtn.addEventListener('click', filterAttendanceRecords);
        }
        
        if (attendanceClearFilterBtn) {
            attendanceClearFilterBtn.addEventListener('click', function() {
                document.getElementById('attendanceSearchInput').value = '';
                document.getElementById('attendanceDateFilter').value = '';
                document.getElementById('attendanceStatusFilter').value = '';
                filterAttendanceRecords();
            });
        }
        
        document.getElementById('attendanceSearchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') filterAttendanceRecords();
        });
    } catch (error) {
        console.error('Error setting up filter listeners:', error);
    }
}

async function openEditAttendanceModal(attendanceId, userId) {
    try {
        const attendanceDoc = await getDoc(doc(db, 'attendance', attendanceId));
        if (!attendanceDoc.exists()) {
            await showMessage('Error', 'Attendance record not found');
            return;
        }
        
        const record = attendanceDoc.data();
        
        // Get employee name, fetching if not available and format it
        const employeeName = formatName(record.employeeName || await getEmployeeName(userId));
        
        document.getElementById('editingAttendanceId').value = attendanceId;
        document.getElementById('editingUserId').value = userId;
        document.getElementById('editEmployeeName').value = employeeName;
        document.getElementById('editAttendanceDate').value = record.date || '';
        document.getElementById('editClockInTime').value = record.clockIn || '';
        document.getElementById('editClockOutTime').value = record.clockOut || '';
        document.getElementById('editStatus').value = record.status || 'Present';
        document.getElementById('editRemarks').value = record.remarks || '';
        
        if (record.clockIn && record.clockOut) {
            const hoursWorked = calculateHoursWorked(record.clockIn, record.clockOut, record.lunchOut, record.lunchIn);
            document.getElementById('editHoursWorked').value = hoursWorked ? hoursWorked.formatted : '-';
        } else {
            document.getElementById('editHoursWorked').value = '-';
        }
        
        document.getElementById('editAttendanceModal').classList.add('active');
    } catch (error) {
        console.error('Error opening edit modal:', error);
        await showMessage('Error', 'Failed to open attendance record');
    }
}

async function saveAttendanceAdjustment(attendanceId, userId, adjustedData) {
    try {
        await updateDoc(doc(db, 'attendance', attendanceId), {
            date: adjustedData.date,
            clockIn: adjustedData.clockIn || null,
            clockOut: adjustedData.clockOut || null,
            status: adjustedData.status,
            remarks: adjustedData.remarks || '',
            updatedAt: serverTimestamp()
        });
        
        logActivity('Edit Attendance Record', `Record ID: ${attendanceId}, User: ${userId}`);
        
        document.getElementById('editAttendanceModal').classList.remove('active');
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Success', 'Attendance record updated successfully');
        await loadAllAttendanceRecords();
    } catch (error) {
        console.error('Error saving adjustment:', error);
        
        // Close modal before showing error message
        document.getElementById('editAttendanceModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Error', 'Failed to update record: ' + error.message);
    }
}

// ===========================
// MANUAL ATTENDANCE FUNCTIONS
// ===========================

async function loadActiveUsersForManualAttendance(dateStr) {
    try {
        const targetDate = dateStr || new Date().toISOString().split('T')[0];
        const attendanceRef = collection(db, 'attendance');
        const existingSnap = await getDocs(query(attendanceRef, where('date', '==', targetDate)));
        const alreadyAttended = new Set();

        existingSnap.forEach((doc) => {
            const record = doc.data();
            const recordUserId = record.userId || record.employeeId;
            if (recordUserId) {
                alreadyAttended.add(recordUserId);
            }
        });

        const usersMap = {};
        
        // Fetch from employees collection
        const employeesRef = collection(db, 'employees');
        const employeesSnapshot = await getDocs(employeesRef);
        employeesSnapshot.forEach((doc) => {
            const emp = doc.data();
            if (emp.status !== 'inactive' && !alreadyAttended.has(doc.id)) {
                usersMap[doc.id] = {
                    name: emp.name,
                    email: emp.email,
                    site: emp.department,
                    designation: emp.designation,
                    tagging: emp.tagging
                };
            }
        });
        
        // Fetch from users collection and merge
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        
        snapshot.forEach((doc) => {
            if (!usersMap[doc.id] && !alreadyAttended.has(doc.id)) {  // Only add if not already in employees
                const user = doc.data();
                usersMap[doc.id] = {
                    name: user.fullName || user.email,
                    email: user.email,
                    site: user.site,
                    designation: user.designation,
                    tagging: user.tagId
                };
            }
        });
        
        const select = document.getElementById('manualAttendanceEmployee');
        select.innerHTML = '<option value="">Select an employee</option>';
        
        Object.entries(usersMap).forEach(([userId, user]) => {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = user.name || user.email || 'Unknown';
            option.dataset.email = user.email || '';
            option.dataset.site = user.site || 'Not Assigned';
            option.dataset.designation = user.designation || '';
            option.dataset.tagging = user.tagging || '';
            select.appendChild(option);
        });

        if (select.options.length === 1) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No available employees for this date';
            option.disabled = true;
            select.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading active users:', error);
    }
}

async function showManualAttendanceModal() {
    try {
        const dateInput = document.getElementById('manualAttendanceDate');
        dateInput.value = new Date().toISOString().split('T')[0];
        await loadActiveUsersForManualAttendance(dateInput.value);
        document.getElementById('addManualAttendanceModal').classList.add('active');
    } catch (error) {
        console.error('Error showing manual attendance modal:', error);
    }
}

function updateEmployeeDetailsDisplay() {
    const select = document.getElementById('manualAttendanceEmployee');
    const selectedOption = select.options[select.selectedIndex];
    
    if (selectedOption && selectedOption.value) {
        const email = selectedOption.dataset.email || '-';
        const site = selectedOption.dataset.site || 'Not Assigned';
        const designation = selectedOption.dataset.designation || '-';
        const tagging = selectedOption.dataset.tagging || '-';
        
        document.getElementById('employeeNameDisplay').innerHTML = `<strong>Name:</strong> ${formatName(selectedOption.text)}`;
        document.getElementById('employeeEmailDisplay').innerHTML = `<strong>Email:</strong> ${email}`;
        document.getElementById('employeeSiteDisplay').innerHTML = `<strong>Site:</strong> ${site}`;
        
        // Add designation and tagging display if elements exist
        const designationEl = document.getElementById('employeeDesignationDisplay');
        const taggingEl = document.getElementById('employeeTaggingDisplay');
        if (designationEl) {
            designationEl.innerHTML = `<strong>Designation:</strong> ${designation}`;
        }
        if (taggingEl) {
            taggingEl.innerHTML = `<strong>Tagging:</strong> ${tagging}`;
        }
    } else {
        document.getElementById('employeeNameDisplay').innerHTML = '<strong>Name:</strong> -';
        document.getElementById('employeeEmailDisplay').innerHTML = '<strong>Email:</strong> -';
        document.getElementById('employeeSiteDisplay').innerHTML = '<strong>Site:</strong> -';
        
        const designationEl = document.getElementById('employeeDesignationDisplay');
        const taggingEl = document.getElementById('employeeTaggingDisplay');
        if (designationEl) {
            designationEl.innerHTML = '<strong>Designation:</strong> -';
        }
        if (taggingEl) {
            taggingEl.innerHTML = '<strong>Tagging:</strong> -';
        }
    }
}

async function submitManualAttendance(e) {
    e.preventDefault();

    try {
        const employeeSelect = document.getElementById('manualAttendanceEmployee');
        const selectedOption = employeeSelect.options[employeeSelect.selectedIndex];
        
        if (!selectedOption || !selectedOption.value) {
            await showMessage('Validation Error', 'Please select an employee');
            return;
        }
        
        const attendanceDate = document.getElementById('manualAttendanceDate').value;
        const clockInTime = document.getElementById('manualClockInTime').value;
        const clockOutTime = document.getElementById('manualClockOutTime').value;
        const status = document.getElementById('manualAttendanceStatus').value;
        const remarks = document.getElementById('manualAttendanceRemarks').value;
        
        if (!attendanceDate || !clockInTime || !status) {
            await showMessage('Validation Error', 'Please fill in all required fields');
            return;
        }
        
        const attendanceData = {
            userId: selectedOption.value,
            employeeName: selectedOption.text,
            employeeEmail: selectedOption.dataset.email,
            employeeSite: selectedOption.dataset.site,
            employeeDesignation: selectedOption.dataset.designation,
            employeeTagging: selectedOption.dataset.tagging,
            date: attendanceDate,
            clockIn: clockInTime,
            clockOut: clockOutTime || null,
            status: status,
            remarks: remarks,
            timestamp: serverTimestamp()
        };
        
        await addDoc(collection(db, 'attendance'), attendanceData);
        
        logActivity('Add Manual Attendance', `Employee: ${selectedOption.text}, Date: ${attendanceDate}`);
        
        document.getElementById('addManualAttendanceForm').reset();
        document.getElementById('addManualAttendanceModal').classList.remove('active');
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Success', 'Attendance record added successfully');
        await loadAllAttendanceRecords();
    } catch (error) {
        console.error('Error submitting manual attendance:', error);
        
        // Close modal before showing error message
        document.getElementById('addManualAttendanceModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Error', 'Failed to add attendance: ' + error.message);
    }
}

// ===========================
// DASHBOARD LOADING FUNCTIONS
// ===========================

async function loadDashboardData() {
    try {
        // Load all attendance for today
        const today = new Date().toISOString().split('T')[0];
        const attendanceRef = collection(db, 'attendance');
        const q = query(attendanceRef, where('date', '==', today));
        const snapshot = await getDocs(q);
        
        let presentCount = 0;
        
        // Count employees with clockIn
        snapshot.forEach((doc) => {
            const record = doc.data();
            if (record.clockIn) {
                presentCount++;
            }
        });
        
        // Load total employees
        const usersRef = collection(db, 'employees');
        const usersSnapshot = await getDocs(usersRef);
        const totalEmployees = usersSnapshot.size;
        
        // Calculate absent count
        const absentCount = totalEmployees - presentCount;
        
        // Load active sites count
        const sitesSnapshot = await getDocs(query(
            collection(db, 'sites'),
            where('status', '==', 'active')
        ));
        const activeSitesCount = sitesSnapshot.size;
        
        // Update dashboard stats
        document.getElementById('totalEmployeesStat').textContent = totalEmployees;
        document.getElementById('presentTodayStat').textContent = presentCount;
        document.getElementById('absentTodayStat').textContent = absentCount;
        document.getElementById('activeSitesStat').textContent = activeSitesCount;
        
        // Load recent attendance logs
        const recentQ = query(attendanceRef, where('date', '==', today));
        const recentSnapshot = await getDocs(recentQ);
        
        // Sort by timestamp descending and limit to 10
        const sortedDocs = recentSnapshot.docs
            .sort((a, b) => (b.data().timestamp?.toMillis?.() || 0) - (a.data().timestamp?.toMillis?.() || 0))
            .slice(0, 10);
        
        const tbody = document.getElementById('recentAttendanceBody');
        tbody.innerHTML = '';
        
        if (sortedDocs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No attendance records today</td></tr>';
        } else {
            for (const doc of sortedDocs) {
                const record = doc.data();
                console.log('=== RECENT ATTENDANCE RECORD DEBUG ===');
                console.log('Employee:', record.employeeName);
                console.log('checkInPhotoURL:', record.checkInPhotoURL);
                console.log('checkOutPhotoURL:', record.checkOutPhotoURL);
                
                const summary = getAttendanceSummary(record);
                
                // Get employee name, fetching if not available
                const employeeName = formatName(record.employeeName || await getEmployeeName(record.userId));
                
                // Get all employee data to ensure we have tagging and site
                const empData = await getEmployeeData(record.userId);
                
                // Prioritize record data, fall back to fetched data
                const employeeSite = (record.employeeSite && record.employeeSite.trim()) ? record.employeeSite : empData.site;
                
                // Get location address from clockInLocation
                let locationDisplay = '-';
                let locationHTML = '-';
                
                if (record.clockInLocation && record.clockInLocation.address) {
                    locationDisplay = record.clockInLocation.address;
                    // Use data attributes instead of inline onclick with JSON
                    const lat = record.clockInLocation.latitude || 0;
                    const lon = record.clockInLocation.longitude || 0;
                    const addr = record.clockInLocation.address || '';
                    const time = record.clockIn || '';
                    const site = employeeSite || '';
                    const uid = record.userId || '';
                    
                    locationHTML = `<span class="view-location-btn" data-lat="${lat}" data-lon="${lon}" data-address="${addr.replace(/"/g, '&quot;')}" data-time="${time}" data-site="${site}" data-userid="${uid}" data-empname="${employeeName.replace(/"/g, '&quot;')}" style="color: #1dd1a1; cursor: pointer; text-decoration: underline;"><i class="fa-solid fa-map-location-dot"></i> ${locationDisplay}</span>`;
                }
                
                // Generate photo display HTML for recent attendance
                let photoHTML = '<div style="display:flex; gap:4px; justify-content:center;">';
                if (record.checkInPhotoURL) {
                    const escapedCheckInURL = record.checkInPhotoURL.replace(/'/g, "\\'");
                    photoHTML += `<img src="${record.checkInPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckInURL}', 'Check-In Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #1dd1a1;" title="View Check-In Photo" />`;
                }
                if (record.checkOutPhotoURL) {
                    const escapedCheckOutURL = record.checkOutPhotoURL.replace(/'/g, "\\'");
                    photoHTML += `<img src="${record.checkOutPhotoURL}" onclick="viewAttendancePhoto('${escapedCheckOutURL}', 'Check-Out Photo')" style="width:30px; height:30px; border-radius:4px; object-fit:cover; cursor:pointer; border:1px solid #ffa502;" title="View Check-Out Photo" />`;
                }
                if (!record.checkInPhotoURL && !record.checkOutPhotoURL) {
                    photoHTML += '-';
                }
                photoHTML += '</div>';

                const lunchOutLabel = record.lunchOut ? formatTimeToAMPM(record.lunchOut) : 'Not recorded';
                const lunchInLabel = record.lunchIn ? formatTimeToAMPM(record.lunchIn) : 'Not recorded';
                const lunchBadgeText = record.lunchIn
                    ? (record.lunchLateReturn ? 'L!' : 'L✓')
                    : (record.lunchOut ? 'L…' : '');
                const lunchBadgeTitle = `Lunch Out: ${lunchOutLabel}\nLunch In: ${lunchInLabel}`;
                const lunchBadge = lunchBadgeText
                    ? `<span style="margin-left:6px; padding:2px 6px; font-size:10px; border-radius:8px; background:#1a3a5c; color:#b0c4de; border:1px solid #3a6aaa;" title="${lunchBadgeTitle.replace(/"/g, '&quot;')}">${lunchBadgeText}</span>`
                    : '';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${employeeName}</td>
                    <td>${employeeSite || '-'}</td>
                    <td>${record.date || '-'}</td>
                    <td>${formatTimeToAMPM(record.clockIn) || 'N/A'}</td>
                    <td>${formatTimeToAMPM(record.clockOut) || 'N/A'}</td>
                    <td>${locationHTML}</td>
                    <td>${photoHTML}</td>
                    <td><span class="status-badge ${summary.status.toLowerCase().replace(/\s+/g, '-')}">${summary.status}</span>${lunchBadge}</td>
                `;
                tbody.appendChild(row);
            }
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadUsersData() {
    try {
        // Load designations list
        const designationsRef = collection(db, 'designations');
        const designationsSnapshot = await getDocs(designationsRef);
        
        const designationsContainer = document.getElementById('designationsList');
        if (designationsContainer) {
            designationsContainer.innerHTML = '';
            designationsSnapshot.forEach((doc) => {
                const designation = doc.data();
                const item = document.createElement('div');
                item.style.cssText = 'padding:8px 12px; background:#0f1e35; border:1px solid #1a3a5c; border-radius:4px; margin-bottom:8px; color:#a0a0a0;';
                item.innerHTML = `${designation.designationName || 'Unknown'} <span style="color:#1dd1a1; float:right;">${designation.count || 0}</span>`;
                designationsContainer.appendChild(item);
            });
        }
        
        // Load users table
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        
        if (usersSnapshot.empty) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="9" style="text-align:center;">No users found</td></tr>';
            return;
        }
        
        usersSnapshot.forEach((doc) => {
            const user = doc.data();
            const row = document.createElement('tr');
            const userId = doc.id;
            row.innerHTML = `
                <td>${user.fullName || 'Unknown'}</td>
                <td>${user.tagId || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${user.contactNumber || '-'}</td>
                <td>${user.site || '-'}</td>
                <td>${user.designation || '-'}</td>
                <td><span class="status-badge ${user.status === 'active' ? 'present' : 'absent'}">${user.status || 'inactive'}</span></td>
                <td style="text-align: center; white-space: nowrap;">
                    <button onclick="editUser('${userId}')" style="padding: 4px 8px; margin: 0 2px; background: #254a72; color: #1dd1a1; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600;"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteUser('${userId}')" style="padding: 4px 8px; margin: 0 2px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Populate designation filter dropdown
        const designationFilterSelect = document.getElementById('userDesignationFilter');
        if (designationFilterSelect) {
            designationFilterSelect.innerHTML = '<option value="">All Designations</option>';
            designationsSnapshot.forEach((doc) => {
                const designation = doc.data();
                const designName = designation.designationName || designation.name || 'Unknown';
                const option = document.createElement('option');
                option.value = designName;
                option.textContent = designName;
                designationFilterSelect.appendChild(option);
            });
        }
        
        // Collect unique departments/sites for department filter
        const departmentsSet = new Set();
        usersSnapshot.forEach((doc) => {
            const user = doc.data();
            const dept = user.site || user.department || user.Site || user.Department;
            if (dept) {
                departmentsSet.add(dept);
            }
        });
        
        // Populate department filter dropdown
        const departmentFilterSelect = document.getElementById('userDepartmentFilter');
        if (departmentFilterSelect) {
            departmentFilterSelect.innerHTML = '<option value="">All Departments/Sites</option>';
            Array.from(departmentsSet).sort().forEach((dept) => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                departmentFilterSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTableBody').innerHTML = '<tr class="no-data"><td colspan="9">Error loading users</td></tr>';
    }
}

// Edit user function
window.editUser = async function(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            await showMessage('Error', 'User not found');
            return;
        }
        
        const userData = userDoc.data();
        
        // Populate modal with user data
        document.getElementById('editEmployeeName').value = userData.fullName || '';
        document.getElementById('editEmployeeTagging').value = userData.tagId || '';
        document.getElementById('editEmployeeEmail').value = userData.email || '';
        document.getElementById('editEmployeeContact').value = userData.contactNumber || '';
        document.getElementById('editEmployeeDepartment').value = userData.site || '';
        document.getElementById('editEmployeeDesignation').value = userData.designation || '';
        document.getElementById('editEmployeeStatus').value = userData.status || 'active';
        document.getElementById('editingUserId').value = userId;
        
        // Show modal
        document.getElementById('editEmployeeModal').classList.add('active');
    } catch (error) {
        console.error('Error editing user:', error);
        await showMessage('Error', 'Failed to load user data: ' + error.message);
    }
};

// Delete user function
window.deleteUser = async function(userId) {
    try {
        const confirmed = await showConfirmation('Delete User', 'Are you sure you want to delete this user? This action cannot be undone.');
        if (!confirmed) return;
        
        await deleteDoc(doc(db, 'users', userId));
        await showMessage('Success', 'User deleted successfully');
        await loadUsersData();
    } catch (error) {
        console.error('Error deleting user:', error);
        await showMessage('Error', 'Failed to delete user: ' + error.message);
    }
};

async function loadSitesData() {
    try {
        // Load cities/provinces snapshot for filter options
        const citiesRef = collection(db, 'cities');
        const citiesSnapshot = await getDocs(citiesRef);
        
        // Load sites table
        const sitesRef = collection(db, 'sites');
        const sitesSnapshot = await getDocs(sitesRef);
        
        const tbody = document.getElementById('sitesTableBody');
        tbody.innerHTML = '';
        
        if (sitesSnapshot.empty) {
            tbody.innerHTML = '<tr class="no-data"><td colspan="6" style="text-align:center;">No sites found</td></tr>';
            return;
        }
        
        sitesSnapshot.forEach((doc) => {
            const site = doc.data();
            const row = document.createElement('tr');
            const statusClass = site.status === 'active' ? 'present' : 'absent';
            row.innerHTML = `
                <td>${formatFormalText(site.siteName || 'Unknown')}</td>
                <td>${site.location || '-'}</td>
                <td>${formatFormalText(site.city || '-')}</td>
                <td>${site.manager || '-'}</td>
                <td><span class="status-badge ${statusClass}">${site.status || 'inactive'}</span></td>
                <td style="text-align: center; display:flex; gap:8px; justify-content:center; align-items:center;">
                    <button class="btn-view" onclick="viewSiteLocation('${doc.id}')" title="View Location" style="padding: 6px 8px; font-size: 14px; margin: 0; background: transparent; color: #3498db; border: none; border-radius: 3px; cursor: pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-map-location-dot"></i></button>
                    <button class="btn-edit" onclick="editSite('${doc.id}')" title="Edit" style="padding: 6px 8px; font-size: 14px; margin: 0; background: transparent; color: #1dd1a1; border: none; border-radius: 3px; cursor: pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete" onclick="deleteSite('${doc.id}')" title="Delete" style="padding: 6px 8px; font-size: 14px; margin: 0; background: transparent; color: #e74c3c; border: none; border-radius: 3px; cursor: pointer; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Now populate cities filter after data loads
        try {
            const citiesFilterSelect = document.getElementById('sitesCityFilter');
            if (citiesFilterSelect) {
                citiesFilterSelect.innerHTML = '<option value="">All Cities</option>';
                citiesSnapshot.forEach((doc) => {
                    const city = doc.data();
                    const option = document.createElement('option');
                    option.value = city.cityName || city.name || '';
                    option.textContent = formatFormalText(city.cityName || city.name || 'Unknown');
                    citiesFilterSelect.appendChild(option);
                });
            }
        } catch (filterError) {
            console.warn('Warning: Could not populate cities filter:', filterError);
        }
        
        // Initialize collapse states from localStorage
        initializeCollapseStates();
    } catch (error) {
        console.error('Error loading sites:', error);
        document.getElementById('sitesTableBody').innerHTML = '<tr class="no-data"><td colspan="6">Error loading sites</td></tr>';
    }
}

// Global variable to store report data for export
window.reportData = [];

// Setup Data Report event listeners
function setupDataReportListeners() {
    console.log('🔵 Setting up data report listeners...');
    
    // Get all button elements
    const reportGenerateBtn = document.getElementById('reportGenerateBtn');
    const reportClearBtn = document.getElementById('reportClearBtn');
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    const exportPDFBtn = document.getElementById('exportPDFBtn');

    console.log('🔵 Button elements found:', {
        reportGenerateBtn: !!reportGenerateBtn,
        reportClearBtn: !!reportClearBtn,
        exportCSVBtn: !!exportCSVBtn,
        exportPDFBtn: !!exportPDFBtn
    });

    // Setup Generate Report button - attach listener directly with proper cleanup
    if (reportGenerateBtn) {
        // Remove any existing listeners by cloning and replacing
        const newGenerateBtn = reportGenerateBtn.cloneNode(true);
        reportGenerateBtn.parentNode.replaceChild(newGenerateBtn, reportGenerateBtn);
        
        // Get the new element and add listener
        const freshGenerateBtn = document.getElementById('reportGenerateBtn');
        freshGenerateBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🟢 Generate Report button clicked');
            generateDataReport();
        });
        console.log('🟢 Generate Report listener attached');
    } else {
        console.error('❌ reportGenerateBtn not found!');
    }

    // Setup Clear Filters button
    if (reportClearBtn) {
        const newClearBtn = reportClearBtn.cloneNode(true);
        reportClearBtn.parentNode.replaceChild(newClearBtn, reportClearBtn);
        
        const freshClearBtn = document.getElementById('reportClearBtn');
        freshClearBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🟢 Clear Filters button clicked');
            clearDataReportFilters();
        });
        console.log('🟢 Clear Filters listener attached');
    } else {
        console.error('❌ reportClearBtn not found!');
    }

    // Setup Export CSV button
    if (exportCSVBtn) {
        const newCSVBtn = exportCSVBtn.cloneNode(true);
        exportCSVBtn.parentNode.replaceChild(newCSVBtn, exportCSVBtn);
        
        const freshCSVBtn = document.getElementById('exportCSVBtn');
        freshCSVBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🟢 Export CSV button clicked');
            exportToCSV();
        });
        console.log('🟢 Export CSV listener attached');
    } else {
        console.error('❌ exportCSVBtn not found!');
    }

    // Setup Export PDF button
    if (exportPDFBtn) {
        const newPDFBtn = exportPDFBtn.cloneNode(true);
        exportPDFBtn.parentNode.replaceChild(newPDFBtn, exportPDFBtn);
        
        const freshPDFBtn = document.getElementById('exportPDFBtn');
        freshPDFBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🟢 Export PDF button clicked');
            exportReportToPDF();
        });
        console.log('🟢 Export PDF listener attached');
    } else {
        console.error('❌ exportPDFBtn not found!');
    }

    // Populate department filter dropdown from database
    console.log('🔵 Populating report filters...');
    populateReportFilters().then(() => {
        console.log('🟢 Department filters populated');
    }).catch(error => {
        console.error('❌ Error populating filters:', error);
    });

    console.log('🟢 Data Report listeners setup complete');
}

function closeSiteLocationModal() {
    const locationModal = document.getElementById('siteLocationModal');
    if (locationModal) {
        locationModal.classList.remove('active');
    }
}

window.viewSiteLocation = async function(siteId) {
    try {
        const siteDoc = await getDoc(doc(db, 'sites', siteId));
        if (!siteDoc.exists()) {
            await showMessage('Error', 'Site not found');
            return;
        }

        const site = siteDoc.data();
        const latitude = parseFloat(site.geofence?.latitude);
        const longitude = parseFloat(site.geofence?.longitude);

        if (isNaN(latitude) || isNaN(longitude)) {
            await showMessage('Error', 'No valid coordinates found for this site');
            return;
        }

        const siteNameEl = document.getElementById('siteLocationSiteName');
        const cityEl = document.getElementById('siteLocationCity');
        const addressEl = document.getElementById('siteLocationAddress');
        const coordinatesEl = document.getElementById('siteLocationCoordinates');
        const mapFrame = document.getElementById('siteLocationMapFrame');
        const mapsLink = document.getElementById('openSiteLocationInMaps');
        const locationModal = document.getElementById('siteLocationModal');

        if (!locationModal || !mapFrame || !mapsLink) {
            await showMessage('Error', 'Location viewer is not available');
            return;
        }

        const mapQuery = `${latitude},${longitude}`;
        const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed`;
        const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}`;

        if (siteNameEl) siteNameEl.textContent = formatFormalText(site.siteName || 'Unknown');
        if (cityEl) cityEl.textContent = formatFormalText(site.city || '-');
        if (addressEl) addressEl.textContent = site.location || '-';
        if (coordinatesEl) coordinatesEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        mapFrame.src = embedUrl;
        mapsLink.href = mapsUrl;

        locationModal.classList.add('active');
    } catch (error) {
        console.error('Error viewing site location:', error);
        await showMessage('Error', 'Failed to load site location: ' + error.message);
    }
};

// Generate Data Report based on filters
async function generateDataReport() {
    try {
        console.log('🔵 === GENERATE DATA REPORT STARTED ===');
        console.log('🔵 Button clicked successfully, function executing...');
        
        const reportTbody = document.getElementById('reportTableBody');
        if (!reportTbody) {
            console.error('❌ reportTableBody element not found!');
            return;
        }
        
        reportTbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#7a8fa6;">⏳ Loading report data...</td></tr>';
        console.log('🔵 Loading message displayed');

        // Get filter values
        const employeeFilter = document.getElementById('reportEmployeeFilter')?.value.toLowerCase() || '';
        const departmentFilter = document.getElementById('reportDepartmentFilter')?.value || '';
        const fromDate = document.getElementById('reportFromDate')?.value || '';
        const toDate = document.getElementById('reportToDate')?.value || '';
        const statusFilter = document.getElementById('reportStatusFilter')?.value || '';

        console.log('🔵 Filter values:', { employeeFilter, departmentFilter, fromDate, toDate, statusFilter });

        // Fetch all attendance records
        console.log('🔵 Fetching attendance records from Firestore...');
        const attendanceSnapshot = await getDocs(collection(db, 'attendance'));
        console.log(`🟢 Found ${attendanceSnapshot.size} TOTAL attendance records in database`);
        
        if (attendanceSnapshot.size === 0) {
            console.error('❌ CRITICAL: Attendance collection is EMPTY! No records found.');
            reportTbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#e74c3c;">❌ No attendance data in database</td></tr>';
            return;
        }
        
        // Show sample of raw attendance data
        console.log('🔵 SAMPLE RAW ATTENDANCE RECORDS:');
        let sampleCount = 0;
        attendanceSnapshot.forEach(doc => {
            if (sampleCount < 3) {
                const data = doc.data();
                console.log(`  Record ${sampleCount + 1}: ID=${doc.id}, Data=`, data);
                sampleCount++;
            }
        });
        
        // Fetch all users and employees for enhanced data
        console.log('🔵 Fetching users and employees...');
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const employeesSnapshot = await getDocs(collection(db, 'employees'));
        console.log(`🟢 Found ${usersSnapshot.size} users and ${employeesSnapshot.size} employees in database`);
        
        if (usersSnapshot.size === 0) {
            console.warn('⚠️ Users collection is empty');
        } else {
            console.log('🔵 SAMPLE RAW USER RECORDS:');
            let userSampleCount = 0;
            usersSnapshot.forEach(doc => {
                if (userSampleCount < 3) {
                    const data = doc.data();
                    console.log(`  User ${userSampleCount + 1}: ID=${doc.id}, Data=`, data);
                    userSampleCount++;
                }
            });
        }
        
        // Build combined map from both users and employees collections
        const usersMap = {};
        
        // First, add all employees (takes priority)
        employeesSnapshot.forEach(doc => {
            usersMap[doc.id] = {
                fullName: doc.data().name,
                email: doc.data().email,
                site: doc.data().department,
                designation: doc.data().designation,
                tagId: doc.data().tagging
            };
        });
        
        // Then, merge in users data (fills gaps)
        usersSnapshot.forEach(doc => {
            if (!usersMap[doc.id]) {
                usersMap[doc.id] = doc.data();
            }
        });
        
        console.log(`🟢 Built combined map with ${Object.keys(usersMap).length} total records`);

        // Build records array using attendance data + user enhancements
        let records = [];
        console.log('🔵 Starting to build records from attendance data...');
        
        attendanceSnapshot.forEach((doc, index) => {
            try {
                const attendance = doc.data();
                const user = usersMap[attendance.userId] || {};
                
                // Ensure date field exists and is valid
                let recordDate = attendance.date;
                if (!recordDate) {
                    // Try to extract from timestamp
                    if (attendance.timestamp) {
                        const ts = attendance.timestamp.toDate ? attendance.timestamp.toDate() : new Date(attendance.timestamp);
                        recordDate = ts.toISOString().split('T')[0];
                    } else {
                        console.warn(`⚠️ Skipping record ${index} - no date found`);
                        return; // Skip records without dates
                    }
                }
                
                // Use available data from both sources (prioritize attendance record data)
                const record = {
                    id: doc.id,
                    ...attendance,
                    date: recordDate, // Ensure date is properly set
                    // Use fullName from attendance if available, otherwise from user, finally unknown
                    fullName: formatName(attendance.employeeName || user.fullName || 'Unknown'),
                    // Use email from attendance if available, otherwise from user
                    email: attendance.employeeEmail || user.email || '',
                    // Use site/department from attendance if available, otherwise from user
                    department: attendance.employeeSite || user.site || 'Unknown',
                    // Use designation from attendance if available, otherwise from user
                    designation: attendance.employeeDesignation || user.designation || '',
                    // Include tagging/tagId
                    tagging: attendance.employeeTagging || user.tagId || '',
                    // Keep userId for tracking
                    userId: attendance.userId || ''
                };
                
                records.push(record);
                if (index < 3) {
                    console.log(`🔵 Record ${index + 1}: ${record.fullName} on ${record.date}`);
                }
            } catch (e) {
                console.error(`❌ Error building record ${index}:`, e);
            }
        });
        
        console.log(`🟢 Built ${records.length} combined records from ${attendanceSnapshot.size} attendance entries`);

        // Apply filters
        console.log('🔵 Starting to apply filters...');
        const originalCount = records.length;
        
        records = records.filter((record, idx) => {
            // Employee filter (name or email)
            const matchesEmployee = employeeFilter === '' || 
                record.fullName.toLowerCase().includes(employeeFilter) ||
                record.email.toLowerCase().includes(employeeFilter);

            // Department filter
            const matchesDepartment = departmentFilter === '' ||
                record.department === departmentFilter;

            // Date range filter
            let matchesDateRange = true;
            if (fromDate || toDate) {
                // Handle date as YYYY-MM-DD string format
                const recordDateStr = typeof record.date === 'string' 
                    ? record.date 
                    : new Date(record.date).toISOString().split('T')[0];
                    
                if (fromDate && recordDateStr < fromDate) {
                    matchesDateRange = false;
                }
                if (toDate && recordDateStr > toDate) {
                    matchesDateRange = false;
                }
            }

            // Status filter
            const matchesStatus = statusFilter === '' ||
                (record.status && record.status.includes(statusFilter));

            const passes = matchesEmployee && matchesDepartment && matchesDateRange && matchesStatus;
            
            if (idx < 3 && !passes) {
                console.log(`⚠️ Filtered out: ${record.fullName} - Emp: ${matchesEmployee}, Dept: ${matchesDepartment}, Date: ${matchesDateRange}, Status: ${matchesStatus}`);
            }

            return passes;
        });

        console.log(`🟢 Filtered from ${originalCount} to ${records.length} records`);

        // Sort by date descending
        records.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Store for export functions
        window.reportData = records;

        // Calculate summary stats
        console.log('🔵 Calculating summary statistics...');
        let totalRecords = records.length;
        let presentDays = 0;
        let absentDays = 0;
        let lateArrivals = 0;
        let totalHours = 0;

        records.forEach((record, idx) => {
            // Count present days (has clock in)
            if (record.clockIn) {
                presentDays++;
            }
            
            // Count absent days (no clock in or status is Absent)
            if (!record.clockIn || record.status === 'Absent') {
                absentDays++;
            }
            
            // Count late arrivals
            if (record.status === 'Late' || record.status?.includes('Late')) {
                lateArrivals++;
            }
            
            // Calculate hours worked - handle both calculated and stored hours
            if (record.clockIn && record.clockOut) {
                try {
                    const hoursData = calculateHoursWorked(record.clockIn, record.clockOut, record.lunchOut, record.lunchIn);
                    if (hoursData && hoursData.totalMinutes) {
                        totalHours += hoursData.totalMinutes / 60;
                    }
                } catch (e) {
                    console.warn('⚠️ Error calculating hours:', e);
                    // Fallback for stored hours
                    if (record.hoursWorked && typeof record.hoursWorked === 'number') {
                        totalHours += record.hoursWorked / 60;
                    }
                }
            } else if (record.hoursWorked && typeof record.hoursWorked === 'number' && record.hoursWorked > 0) {
                // Use stored hours if available
                if (record.hoursWorked > 1000) {
                    totalHours += record.hoursWorked / 60; // Convert minutes to hours
                } else {
                    totalHours += record.hoursWorked; // Already in hours
                }
            }
        });

        console.log(`🟢 Summary stats: Total=${totalRecords}, Present=${presentDays}, Absent=${absentDays}, Late=${lateArrivals}, Hours=${totalHours.toFixed(1)}h`);

        // Update summary cards
        const totalRecordsEl = document.getElementById('reportTotalRecords');
        const presentDaysEl = document.getElementById('reportPresentDays');
        const absentDaysEl = document.getElementById('reportAbsentDays');
        const lateArrivalsEl = document.getElementById('reportLateArrivals');
        const totalHoursEl = document.getElementById('reportTotalHours');

        if (totalRecordsEl) totalRecordsEl.textContent = totalRecords;
        if (presentDaysEl) presentDaysEl.textContent = presentDays;
        if (absentDaysEl) absentDaysEl.textContent = absentDays;
        if (lateArrivalsEl) lateArrivalsEl.textContent = lateArrivals;
        if (totalHoursEl) totalHoursEl.textContent = totalHours.toFixed(1) + 'h';

        // Populate table
        console.log('🔵 Populating report table with records...');
        reportTbody.innerHTML = '';
        
        if (records.length === 0) {
            console.log('⚠️ No records found after filtering');
            reportTbody.innerHTML = '<tr class="no-data"><td colspan="10" style="text-align:center; padding:40px; color:#7a8fa6;">No records match your filters</td></tr>';
            return;
        }

        records.forEach((record, rowIdx) => {
            try {
                // Safely handle date parsing
                let date = 'N/A';
                try {
                    if (record.date) {
                        const dateObj = typeof record.date === 'string' 
                            ? new Date(record.date) 
                            : new Date(record.date);
                        if (!isNaN(dateObj.getTime())) {
                            date = dateObj.toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Error parsing date for record ${rowIdx}:`, record.date, e);
                }
                
                const status = record.status || 'Present';
                const statusColor = status === 'Late' || status?.includes('Late') ? '#e74c3c' : 
                                   status === 'Absent' ? '#e74c3c' : '#1dd1a1';
                
                // Format location data - show address from location service
                let locationDisplay = '-';
                let locationColor = '#b0c4de';
                if (record.clockInLocation && record.clockInLocation.address) {
                    locationDisplay = record.clockInLocation.address;
                    locationColor = '#1dd1a1';
                }
                
                const computedHours = (record.clockIn && record.clockOut)
                    ? calculateHoursWorked(record.clockIn, record.clockOut, record.lunchOut, record.lunchIn)
                    : null;

                const hoursDisplay = computedHours
                    ? computedHours.formatted
                    : (record.hoursWorked
                        ? (typeof record.hoursWorked === 'number'
                            ? (record.hoursWorked / 60).toFixed(1) + 'h'
                            : record.hoursWorked)
                        : 'N/A');

                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid #1a3a5c';
                row.innerHTML = `
                    <td style="padding: 12px; color: #1dd1a1;">${formatName(record.fullName)}</td>
                    <td style="padding: 12px; color: #e0e0e0;">${record.email}</td>
                    <td style="padding: 12px; color: #b0c4de;">${record.department}</td>
                    <td style="padding: 12px; color: #b0c4de;">${record.designation}</td>
                    <td style="padding: 12px; color: #e0e0e0;">${date}</td>
                    <td style="padding: 12px; color: #e0e0e0;">${record.clockIn ? formatTimeToAMPM(record.clockIn) : 'N/A'}</td>
                    <td style="padding: 12px; color: #e0e0e0;">${record.clockOut ? formatTimeToAMPM(record.clockOut) : 'N/A'}</td>
                    <td style="padding: 12px; color: #e0e0e0;">${hoursDisplay}</td>
                    <td style="padding: 12px; color: ${locationColor}; font-size: 11px; font-weight: 600;">${locationDisplay}</td>
                    <td style="padding: 12px;">
                        <span class="status-badge" style="background-color: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                            ${status}
                        </span>
                    </td>
                `;
                reportTbody.appendChild(row);
            } catch (e) {
                console.error(`❌ Error creating row ${rowIdx}:`, e);
            }
        });

        console.log(`🟢 === GENERATE DATA REPORT COMPLETED: ${records.length} records displayed ===`);
    } catch (error) {
        console.error('❌ === ERROR in generateDataReport ===');
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Full error object:', error);
        
        const reportTbody = document.getElementById('reportTableBody');
        if (reportTbody) {
            reportTbody.innerHTML = `<tr class="no-data"><td colspan="10" style="text-align:center; padding:20px; color:#e74c3c;">❌ Error loading report: ${error.message}</td></tr>`;
        }
        showMessage('Error', `Failed to generate report: ${error.message}`);
    }
}

// Clear all report filters
function clearDataReportFilters() {
    // Clear input fields
    const employeeFilter = document.getElementById('reportEmployeeFilter');
    const departmentFilter = document.getElementById('reportDepartmentFilter');
    const fromDateFilter = document.getElementById('reportFromDate');
    const toDateFilter = document.getElementById('reportToDate');
    const statusFilter = document.getElementById('reportStatusFilter');

    if (employeeFilter) employeeFilter.value = '';
    if (departmentFilter) departmentFilter.value = '';
    if (fromDateFilter) fromDateFilter.value = '';
    if (toDateFilter) toDateFilter.value = '';
    if (statusFilter) statusFilter.value = '';

    // Reset stats
    const totalRecords = document.getElementById('reportTotalRecords');
    const presentDays = document.getElementById('reportPresentDays');
    const absentDays = document.getElementById('reportAbsentDays');
    const lateArrivals = document.getElementById('reportLateArrivals');
    const totalHours = document.getElementById('reportTotalHours');

    if (totalRecords) totalRecords.textContent = '0';
    if (presentDays) presentDays.textContent = '0';
    if (absentDays) absentDays.textContent = '0';
    if (lateArrivals) lateArrivals.textContent = '0';
    if (totalHours) totalHours.textContent = '0h';

    // Clear table
    const reportTbody = document.getElementById('reportTableBody');
    if (reportTbody) {
        reportTbody.innerHTML = `
            <tr class="no-data">
                <td colspan="10" style="text-align:center; padding:40px; color:#7a8fa6;">
                    Click "Generate Report" to load data
                </td>
            </tr>
        `;
    }

    window.reportData = [];
    console.log('Report filters cleared');
}

// Export report to CSV
function exportToCSV() {
    if (!window.reportData || window.reportData.length === 0) {
        showMessage('Error', 'No data to export. Please generate a report first.');
        return;
    }

    try {
        const headers = ['Employee Name', 'Email', 'Department/Site', 'Designation', 'Date', 'Clock In', 'Clock Out', 'Hours Worked', 'Location', 'Status'];
        
        const rows = window.reportData.map(record => {
            const date = new Date(record.date).toLocaleDateString('en-US');
            const clockIn = record.clockIn ? formatTimeToAMPM(record.clockIn) : 'N/A';
            const clockOut = record.clockOut ? formatTimeToAMPM(record.clockOut) : 'N/A';
            const hours = record.hoursWorked ? (typeof record.hoursWorked === 'number' ? (record.hoursWorked / 60).toFixed(1) + 'h' : record.hoursWorked) : 'N/A';
            const status = record.status || 'Present';
            
            // Format location data - show address from location service
            let locationDisplay = '-';
            if (record.clockInLocation && record.clockInLocation.address) {
                locationDisplay = record.clockInLocation.address;
            }

            return [
                `"${record.fullName || ''}"`,
                `"${record.email || ''}"`,
                `"${record.department || ''}"`,
                `"${record.designation || ''}"`,
                date,
                clockIn,
                clockOut,
                hours,
                `"${locationDisplay}"`,
                status
            ];
        });

        let csvContent = headers.join(',') + '\n';
        rows.forEach(row => {
            csvContent += row.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        logActivity('Report Exported', `Exported attendance data to CSV (${window.reportData.length} records)`, 'success');
        showMessage('Success', `CSV exported successfully with ${window.reportData.length} records!`);
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        showMessage('Error', 'Failed to export CSV: ' + error.message);
    }
}

// PDF Template Generator - Grid-based layout with days as columns
function buildAttendancePDFTemplate(employeeRecords, globalUniqueDays, overallFirstDate, overallLastDate) {
    const formatTimeNoPeriod = (timeValue) => {
        if (!timeValue || timeValue === '-') return '-';
        const formatted = formatTimeToAMPM(timeValue);
        if (!formatted || formatted === 'N/A') return '-';
        const match = formatted.match(/^(.*?)(?:\s*)(AM|PM)$/i);
        if (!match) return formatted;
        const baseTime = match[1].trim();
        const meridiem = match[2].toLowerCase();
        return `<span style="white-space: nowrap;">${baseTime}<span style="font-size: 6px; font-weight: 600; letter-spacing: 0.2px;"> ${meridiem}</span></span>`;
    };
    const startMonth = String(overallFirstDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(overallFirstDate.getDate()).padStart(2, '0');
    const endMonth = String(overallLastDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(overallLastDate.getDate()).padStart(2, '0');

    const overallDateRangeText =
        `Date: ${overallFirstDate.getFullYear()} - ${startMonth} - ${startDay} - ${overallLastDate.getFullYear()} - ${endMonth} - ${endDay}`;

    // Fixed 31 day columns for full month view
    const dayColumnCount = 31;
    const colWidthNum = 100 / dayColumnCount;
    const colWidth = colWidthNum.toFixed(2);
    const nameStartCol = 14;
    const deptStartCol = 27;
    const idColspan = 1;
    const leftSpacerColspan = nameStartCol - 1 - idColspan;
    const nameColspan = deptStartCol - nameStartCol;
    const deptColspan = dayColumnCount - deptStartCol + 1;
    const colGroupHtml = Array.from({ length: dayColumnCount })
        .map(() => `<col style="width:${colWidth}%;">`)
        .join('');

    const usersPerPage = 10;
    const employeeEntries = Object.keys(employeeRecords)
        .map((userId) => {
            const employee = employeeRecords[userId];
            return {
                ...employee,
                records: employee.records.sort((a, b) => new Date(a.date) - new Date(b.date))
            };
        })
        .filter(employee => employee.records.length > 0);

    let htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 10px; color: #333; background: white;">
    `;

    for (let start = 0; start < employeeEntries.length; start += usersPerPage) {
        const pageEmployees = employeeEntries.slice(start, start + usersPerPage);
        const isLastPage = start + usersPerPage >= employeeEntries.length;
        const isFirstPage = start === 0;

        htmlContent += `
            <div style="margin-bottom: 2px; ${!isLastPage ? 'page-break-after: always;' : ''}">
                <table style="width: 100%; border-collapse: collapse; font-size: 7px; border: 1px solid #999; table-layout: fixed;">
                    <colgroup>
                        ${colGroupHtml}
                    </colgroup>
                    ${isFirstPage ? `
                    <tr>
                        <td colspan="${dayColumnCount}" style="padding: 2px 2px; border: 1px solid #999; font-weight: bold; background-color: #d3d3d3; text-align: center; word-wrap: break-word; font-size: 7px; line-height: 1.15;">
                            <div style="font-size: 8px; letter-spacing: 0.4px;">ATTENDANCE REPORT</div>
                            <div style="font-size: 7px; margin-top: 0;">${overallDateRangeText}</div>
                        </td>
                    </tr>
                    ` : ''}
        `;

        pageEmployees.forEach((employee) => {
            const records = employee.records;

            htmlContent += `
                    <tbody style="page-break-inside: avoid; break-inside: avoid;">
                    <tr style="background-color: #ADD8E6; border: 1px solid #999; page-break-inside: avoid;">
                        <td colspan="${idColspan}" style="padding: 1px 1px; border: 1px solid #999; border-right: none; font-weight: bold; width: ${colWidth}%; text-align: left; word-wrap: break-word; font-size: 7px; line-height: 1.05;">
                            <strong>ID: ${employee.employeeId}</strong>
                        </td>
                        <td colspan="${leftSpacerColspan}" style="padding: 1px 1px; border-top: 1px solid #999; border-bottom: 1px solid #999; font-weight: bold; text-align: center; word-wrap: break-word; font-size: 7px; line-height: 1.05;">
                            <strong>&nbsp;</strong>
                        </td>
                        <td colspan="${nameColspan}" style="padding: 1px 1px; border-top: 1px solid #999; border-bottom: 1px solid #999; font-weight: bold; text-align: left; word-wrap: break-word; font-size: 7px; line-height: 1.05;">
                            <strong>NAME: ${employee.fullName.toUpperCase()}</strong>
                        </td>
                        <td colspan="${deptColspan}" style="padding: 1px 1px; border: 1px solid #999; border-left: none; font-weight: bold; text-align: left; word-wrap: break-word; font-size: 7px; line-height: 1.05;">
                            <strong>DEPT.: ${employee.department.toUpperCase()}</strong>
                        </td>
                    </tr>
                    <tr style="background-color: #e8f4e8; border: 1px solid #999; page-break-inside: avoid;">
            `;

            // Generate all day columns
            for (let day = 1; day <= dayColumnCount; day++) {
                const record = records.find(r => new Date(r.date).getDate() === day);
                const clockInTime = record?.clockIn ? formatTimeNoPeriod(record.clockIn) : '-';
                const lunchOutTime = record?.lunchOut ? formatTimeNoPeriod(record.lunchOut) : '-';
                const lunchInTime = record?.lunchIn ? formatTimeNoPeriod(record.lunchIn) : '-';
                const clockOutTime = record?.clockOut ? formatTimeNoPeriod(record.clockOut) : '-';

                const timeInLine = `${clockInTime}`;
                const lunchOutLine = `${lunchOutTime}`;
                const lunchInLine = `${lunchInTime}`;
                const timeOutLine = `${clockOutTime}`;

                htmlContent += `
                    <td style="padding: 1px 1px; border: 1px solid #999; text-align: center; font-size: 7px; width: ${colWidth}%; word-wrap: break-word; line-height: 1.05;">
                        ${timeInLine}<br/>${lunchOutLine}<br/>${lunchInLine}<br/>${timeOutLine}
                    </td>
                `;
            }

            htmlContent += `</tr><tr style="background-color: #f5f5f5; border: 1px solid #999; page-break-inside: avoid;">`;

            // Day row for all day columns
            for (let day = 1; day <= dayColumnCount; day++) {
                htmlContent += `
                    <td style="padding: 1px 1px; border: 1px solid #999; font-weight: bold; text-align: center; width: ${colWidth}%; word-wrap: break-word; font-size: 7px; line-height: 1.05;">
                        ${day}
                    </td>
                `;
            }

            htmlContent += `</tr></tbody>`;
        });

        htmlContent += `
                </table>
            </div>
        `;
    }

    htmlContent += `
        <div style="text-align: center; color: #999; font-size: 10px; margin-top: 15px;">
            Generated: ${new Date().toLocaleString()} | LTISC Attendance Management System
        </div>
        </div>
    `;

    return htmlContent;
}

// Export report to PDF with grid-based layout
function exportReportToPDF() {
    if (!window.reportData || window.reportData.length === 0) {
        showMessage('Error', 'No data to export. Please generate a report first.');
        return;
    }

    try {
        // Group records by userId (employee)
        const employeeRecords = {};
        let employeeIndex = 1;
        
        window.reportData.forEach(record => {
            if (!employeeRecords[record.userId]) {
                employeeRecords[record.userId] = {
                    userId: record.userId,
                    employeeId: employeeIndex,
                    fullName: record.fullName || 'Unknown',
                    email: record.email || '',
                    department: record.department || 'Unknown',
                    designation: record.designation || '',
                    records: []
                };
                employeeIndex++;
            }
            employeeRecords[record.userId].records.push(record);
        });

        // Get ALL unique days across ALL employees
        const globalDaySet = new Set();
        Object.keys(employeeRecords).forEach(userId => {
            employeeRecords[userId].records.forEach(record => {
                const date = new Date(record.date);
                const day = date.getDate();
                globalDaySet.add(day);
            });
        });
        const globalUniqueDays = Array.from(globalDaySet).sort((a, b) => a - b);

        // Get overall date range from all records
        let overallFirstDate = null;
        let overallLastDate = null;
        Object.keys(employeeRecords).forEach(userId => {
            const records = employeeRecords[userId].records.sort((a, b) => new Date(a.date) - new Date(b.date));
            if (records.length > 0) {
                const firstDate = new Date(records[0].date);
                const lastDate = new Date(records[records.length - 1].date);
                if (!overallFirstDate || firstDate < overallFirstDate) overallFirstDate = firstDate;
                if (!overallLastDate || lastDate > overallLastDate) overallLastDate = lastDate;
            }
        });

        // Handle null date values
        if (!overallFirstDate || !overallLastDate) {
            console.warn('No date range found in records');
            showMessage('Error', 'No valid date data found in selected records');
            return;
        }

        // Build PDF content using template
        const htmlContent = buildAttendancePDFTemplate(employeeRecords, globalUniqueDays, overallFirstDate, overallLastDate);

        // Generate PDF using html2pdf
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        
        const opt = {
            margin: 8,
            filename: `attendance-report-${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
        };

        html2pdf().set(opt).from(element).save();

        logActivity('Report Exported', `Exported attendance data to PDF (${window.reportData.length} records)`, 'success');
        showMessage('Success', `PDF exported successfully with ${window.reportData.length} records!`);
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        showMessage('Error', 'Failed to export PDF: ' + error.message);
    }
}

// Populate report filter dropdowns
async function populateReportFilters() {
    try {
        // Get unique departments/sites from users collection
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const departments = new Set();
        
        usersSnapshot.forEach((doc) => {
            const user = doc.data();
            // Collect the site values that users actually have
            if (user.site) {
                departments.add(user.site);
            }
        });
        
        // Also load from sites collection to ensure all registered sites are available
        try {
            const sitesRef = collection(db, 'sites');
            const sitesSnapshot = await getDocs(sitesRef);
            sitesSnapshot.forEach((doc) => {
                const site = doc.data();
                if (site.siteName) {
                    departments.add(site.siteName);
                }
            });
        } catch (e) {
            console.warn('Could not load from sites collection:', e);
        }
        
        // Populate department dropdown
        const departmentFilter = document.getElementById('reportDepartmentFilter');
        if (departmentFilter) {
            const currentValue = departmentFilter.value;
            departmentFilter.innerHTML = '<option value="">All Departments</option>';
            
            Array.from(departments).sort().forEach((dept) => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                departmentFilter.appendChild(option);
            });
            
            departmentFilter.value = currentValue;
        }
    } catch (error) {
        console.error('Error populating report filters:', error);
    }
}

// ===========================
// ANNOUNCEMENTS MANAGEMENT
// ===========================

async function loadAnnouncements() {
    try {
        const announcementsRef = collection(db, 'announcements');
        const q = query(announcementsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        const announcementsList = document.getElementById('announcementsList');
        if (!announcementsList) return;
        
        announcementsList.innerHTML = '';
        
        if (snapshot.empty) {
            announcementsList.innerHTML = '<div style="text-align:center; padding:40px; color:#7a8fa6;">No announcements yet</div>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const announcement = doc.data();
            const createdAtValue = announcement.createdAt?.toDate?.() || announcement.createdAt;
            const updatedAtValue = announcement.updatedAt?.toDate?.() || announcement.updatedAt;

            const createdAtDate = createdAtValue ? new Date(createdAtValue) : null;
            const updatedAtDate = updatedAtValue ? new Date(updatedAtValue) : null;

            const hasValidCreatedAt = createdAtDate && !isNaN(createdAtDate.getTime());
            const hasValidUpdatedAt = updatedAtDate && !isNaN(updatedAtDate.getTime());

            const date = hasValidCreatedAt ? createdAtDate.toLocaleDateString() : 'No date';
            const updatedAtText = hasValidUpdatedAt
                ? updatedAtDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                })
                : '';
            const isEdited = hasValidUpdatedAt;
            const priority = announcement.priority || 'normal';
            const category = announcement.category || 'general';
            
            const item = document.createElement('div');
            item.className = 'announcement-item';
            item.innerHTML = `
                <div class="announcement-header">
                    <div>
                        <div class="announcement-title-row">
                            <h4 class="announcement-title">${announcement.title || 'Untitled'}</h4>
                            ${isEdited ? '<span class="announcement-edited-badge">EDITED</span>' : ''}
                        </div>
                    </div>
                    <div class="announcement-actions">
                        <button class="announcement-edit-btn" onclick="editAnnouncement('${doc.id}')" title="Edit">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="announcement-delete-btn" onclick="deleteAnnouncement('${doc.id}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <p class="announcement-text">${announcement.message || ''}</p>
                <div class="announcement-meta">
                    <span class="announcement-date">
                        ${date}
                        ${updatedAtText ? `<span class="announcement-updated">Updated: ${updatedAtText}</span>` : ''}
                    </span>
                    <div>
                        <span class="announcement-category ${category}">${category.toUpperCase()}</span>
                        <span class="announcement-priority ${priority}">${priority.toUpperCase()}</span>
                    </div>
                </div>
            `;
            announcementsList.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

window.editAnnouncement = async function(docId) {
    try {
        const docSnap = await getDoc(doc(db, 'announcements', docId));
        if (docSnap.exists()) {
            const announcement = docSnap.data();
            document.getElementById('editingAnnouncementId').value = docId;
            document.getElementById('announcementTitle').value = announcement.title || '';
            document.getElementById('announcementCategory').value = announcement.category || 'general';
            document.getElementById('announcementMessage').value = announcement.message || '';
            document.getElementById('announcementPriority').value = announcement.priority || 'normal';
            document.getElementById('addAnnouncementModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading announcement:', error);
    }
};

window.deleteAnnouncement = async function(docId) {
    const confirmed = await showConfirm('Delete Announcement', 'Are you sure you want to delete this announcement?');
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'announcements', docId));
            logActivity('Announcement Deleted', `Deleted announcement ID: ${docId}`);
            await loadAnnouncements();
            await showMessage('Success', 'Announcement deleted successfully');
        } catch (error) {
            console.error('Error deleting announcement:', error);
            await showMessage('Error', 'Failed to delete announcement');
        }
    }
};

// ===========================
// DESIGNATIONS MANAGEMENT
// ===========================

async function displayDesignations() {
    try {
        const designationsRef = collection(db, 'designations');
        const snapshot = await getDocs(designationsRef);
        const designationsList = document.getElementById('designationsList');
        
        if (!designationsList) return;
        
        designationsList.innerHTML = '';
        
        if (snapshot.empty) {
            designationsList.innerHTML = '<p style="color:#7a8fa6;">No designations added yet</p>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const designation = doc.data();
            const item = document.createElement('div');
            item.style.cssText = 'display:inline-block; padding:8px 12px; background:#1a3a5c; border:1px solid #1dd1a1; border-radius:20px; margin:5px; gap:10px;';
            item.innerHTML = `
                <span style="color:#e0e0e0; margin-right:10px;">${designation.designationName || 'Unknown'}</span>
                <button onclick="editDesignation('${doc.id}', '${designation.designationName}')" style="padding:2px 6px; background:#254a72; color:#1dd1a1; border:none; border-radius:3px; cursor:pointer; font-size:10px;">Edit</button>
                <button onclick="deleteDesignation('${doc.id}')" style="padding:2px 6px; background:#e74c3c; color:white; border:none; border-radius:3px; cursor:pointer; font-size:10px;">Delete</button>
            `;
            designationsList.appendChild(item);
        });
    } catch (error) {
        console.error('Error displaying designations:', error);
    }
}

async function showAddDesignationModal() {
    const modal = document.getElementById('addDesignationModal');
    if (!modal) return;
    
    document.getElementById('designationNameInput').value = '';
    document.getElementById('editingDesignationId').value = '';
    modal.classList.add('active');
}

window.editDesignation = async function(docId, designationName) {
    const modal = document.getElementById('addDesignationModal');
    if (!modal) return;
    
    document.getElementById('designationNameInput').value = designationName;
    document.getElementById('editingDesignationId').value = docId;
    modal.classList.add('active');
};

window.deleteDesignation = async function(docId) {
    const confirmed = await showConfirm('Delete Designation', 'Are you sure you want to delete this designation?');
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'designations', docId));
            logActivity('Designation Deleted', `Deleted designation ID: ${docId}`);
            await displayDesignations();
            await showMessage('Success', 'Designation deleted successfully');
        } catch (error) {
            console.error('Error deleting designation:', error);
            await showMessage('Error', 'Failed to delete designation');
        }
    }
};

async function submitAddDesignation(e) {
    e.preventDefault();
    
    try {
        const designationName = document.getElementById('designationNameInput').value;
        const editingDesignationId = document.getElementById('editingDesignationId').value;
        
        if (!designationName.trim()) {
            await showMessage('Error', 'Please enter a designation name');
            return;
        }
        
        if (editingDesignationId) {
            // Update existing
            await updateDoc(doc(db, 'designations', editingDesignationId), {
                designationName: designationName
            });
        } else {
            // Add new
            await addDoc(collection(db, 'designations'), {
                designationName: designationName,
                createdAt: new Date()
            });
        }
        
        // Close modal before showing success message
        document.getElementById('addDesignationModal').classList.remove('active');
        document.getElementById('addDesignationForm').reset();
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (editingDesignationId) {
            await showMessage('Success', 'Designation updated successfully');
        } else {
            await showMessage('Success', 'Designation added successfully');
        }
        
        await displayDesignations();
    } catch (error) {
        console.error('Error:', error);
        
        // Close modal before showing error message
        document.getElementById('addDesignationModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Error', 'Operation failed: ' + error.message);
    }
}

// ===========================
// CITIES/PROVINCES MANAGEMENT
// ===========================

async function displayCities() {
    try {
        const citiesRef = collection(db, 'cities');
        const snapshot = await getDocs(citiesRef);
        const citiesList = document.getElementById('citiesList');
        
        if (!citiesList) return;
        
        // Update count in header
        const citiesCount = document.getElementById('citiesCount');
        if (citiesCount) {
            citiesCount.textContent = `(${snapshot.size})`;
        }
        
        citiesList.innerHTML = '';
        
        if (snapshot.empty) {
            citiesList.innerHTML = '<tr><td colspan="2" style="padding:12px; text-align:center; color:#7a8fa6;">No cities added yet</td></tr>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const city = doc.data();
            const formattedCityName = formatFormalText(city.cityName || 'Unknown');
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom:1px solid #1a3a5c;';
            row.innerHTML = `
                <td style="padding:6px 8px; color:#e0e0e0;">${formattedCityName}</td>
                <td style="padding:6px 8px; display:flex; gap:8px; justify-content:center; align-items:center;">
                    <button onclick="editCity('${doc.id}', '${formattedCityName.replace(/'/g, "\\'")}')" title="Edit" style="padding:6px 8px; background:transparent; color:#1dd1a1; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteCity('${doc.id}')" title="Delete" style="padding:6px 8px; background:transparent; color:#e74c3c; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            citiesList.appendChild(row);
        });
    } catch (error) {
        console.error('Error displaying cities:', error);
    }
}

window.editCity = async function(docId, cityName) {
    const modal = document.getElementById('addCityModal');
    if (!modal) return;
    
    document.getElementById('cityName').value = cityName;
    document.getElementById('editingCityId').value = docId;
    document.getElementById('cityModalTitle').textContent = 'Edit City/Province';
    modal.classList.add('active');
};

window.deleteCity = async function(docId) {
    const confirmed = await showConfirm('Delete City', 'Are you sure you want to delete this city/province?');
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'cities', docId));
            logActivity('City Deleted', `Deleted city ID: ${docId}`);
            await displayCities();
            await showMessage('Success', 'City deleted successfully');
        } catch (error) {
            console.error('Error deleting city:', error);
            await showMessage('Error', 'Failed to delete city');
        }
    }
};

async function submitAddCity(e) {
    e.preventDefault();
    
    try {
        const cityName = formatFormalText(document.getElementById('cityName').value);
        const editingCityId = document.getElementById('editingCityId').value;
        
        if (!cityName.trim()) {
            await showMessage('Error', 'Please enter a city name');
            return;
        }
        
        if (editingCityId) {
            await updateDoc(doc(db, 'cities', editingCityId), {
                cityName: cityName
            });
        } else {
            await addDoc(collection(db, 'cities'), {
                cityName: cityName,
                createdAt: new Date()
            });
        }
        
        // Close modal before showing success message
        document.getElementById('addCityModal').classList.remove('active');
        document.getElementById('addCityForm').reset();
        document.getElementById('editingCityId').value = '';
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (editingCityId) {
            await showMessage('Success', 'City updated successfully');
        } else {
            await showMessage('Success', 'City added successfully');
        }
        
        await displayCities();
    } catch (error) {
        console.error('Error:', error);
        
        // Close modal before showing error message
        document.getElementById('addCityModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Error', 'Operation failed: ' + error.message);
    }
}

// ===========================
// SITE NAMES & CODES MANAGEMENT
// ===========================

async function displaySiteNames() {
    try {
        const siteNamesRef = collection(db, 'siteNamesCodes');
        const snapshot = await getDocs(siteNamesRef);
        const siteNamesList = document.getElementById('siteNamesList');
        
        if (!siteNamesList) return;
        
        // Update count in header
        const siteNamesCount = document.getElementById('siteNamesCount');
        if (siteNamesCount) {
            siteNamesCount.textContent = `(${snapshot.size})`;
        }
        
        siteNamesList.innerHTML = '';
        
        if (snapshot.empty) {
            siteNamesList.innerHTML = '<tr><td colspan="2" style="padding:12px; text-align:center; color:#7a8fa6;">No site names added yet</td></tr>';
            return;
        }
        
        snapshot.forEach((doc) => {
            const siteName = doc.data();
            const formattedSiteName = formatFormalText(siteName.siteName || 'Unknown');
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom:1px solid #1a3a5c;';
            row.innerHTML = `
                <td style="padding:6px 8px; color:#e0e0e0;">${formattedSiteName}</td>
                <td style="padding:6px 8px; display:flex; gap:8px; justify-content:center; align-items:center;">
                    <button onclick="editSiteName('${doc.id}', '${formattedSiteName.replace(/'/g, "\\'")}')" title="Edit" style="padding:6px 8px; background:transparent; color:#1dd1a1; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteSiteName('${doc.id}')" title="Delete" style="padding:6px 8px; background:transparent; color:#e74c3c; border:none; border-radius:3px; cursor:pointer; font-size:14px; margin:0; display:inline-flex; align-items:center; justify-content:center; transition:all 0.2s ease;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            siteNamesList.appendChild(row);
        });
    } catch (error) {
        console.error('Error displaying site names:', error);
    }
}

window.editSiteName = async function(docId, siteName) {
    const modal = document.getElementById('addSiteNameModal');
    if (!modal) return;
    
    document.getElementById('siteNameInput').value = siteName;
    document.getElementById('editingSiteNameId').value = docId;
    document.getElementById('siteNameModalTitle').textContent = 'Edit Site Name';
    modal.classList.add('active');
};

window.deleteSiteName = async function(docId) {
    const confirmed = await showConfirm('Delete Site Name', 'Are you sure you want to delete this site name & code?');
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'siteNamesCodes', docId));
            logActivity('Site Name Deleted', `Deleted site name ID: ${docId}`);
            await displaySiteNames();
            await showMessage('Success', 'Site name deleted successfully');
        } catch (error) {
            console.error('Error deleting site name:', error);
            await showMessage('Error', 'Failed to delete site name');
        }
    }
};

async function submitAddSiteName(e) {
    e.preventDefault();
    
    try {
        const siteName = formatFormalText(document.getElementById('siteNameInput').value);
        const editingSiteNameId = document.getElementById('editingSiteNameId').value;
        
        if (!siteName.trim()) {
            await showMessage('Error', 'Please enter a site name');
            return;
        }
        
        if (editingSiteNameId) {
            await updateDoc(doc(db, 'siteNamesCodes', editingSiteNameId), {
                siteName: siteName
            });
        } else {
            await addDoc(collection(db, 'siteNamesCodes'), {
                siteName: siteName,
                createdAt: new Date()
            });
        }
        
        // Close modal before showing success message
        document.getElementById('addSiteNameModal').classList.remove('active');
        document.getElementById('addSiteNameForm').reset();
        document.getElementById('editingSiteNameId').value = '';
        
        // Add small delay to ensure modal closes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (editingSiteNameId) {
            await showMessage('Success', 'Site name updated successfully');
        } else {
            await showMessage('Success', 'Site name added successfully');
        }
        
        await displaySiteNames();
    } catch (error) {
        console.error('Error:', error);
        
        // Close modal before showing error message
        document.getElementById('addSiteNameModal').classList.remove('active');
        
        // Add delay to ensure modal closes before showing message
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await showMessage('Error', 'Operation failed: ' + error.message);
    }
}

// ===========================
// DASHBOARD STATISTICS MODAL FUNCTIONS
// ===========================

async function showTotalEmployeesModal() {
    try {
        const totalEmployeesModal = document.getElementById('totalEmployeesModal');
        if (!totalEmployeesModal) return;
        
        totalEmployeesModal.classList.add('active');
        await displayAllEmployees();
    } catch (error) {
        console.error('Error showing employees modal:', error);
    }
}

async function displayAllEmployees(searchTerm = '') {
    try {
        const usersSnapshot = await getDocs(collection(db, 'employees'));
        let employees = [];
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            employees.push({
                id: doc.id,
                ...data
            });
        });
        
        // Filter by search term
        if (searchTerm) {
            employees = employees.filter(emp =>
                (emp.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Sort by name
        employees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        let html = '';
        if (employees.length === 0) {
            html = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #7a8fa6;">No employees found</td></tr>';
        } else {
            employees.forEach(emp => {
                html += `
                    <tr style="border-bottom: 1px solid #1a3a5c;">
                        <td style="padding: 12px; color: #1dd1a1;">${emp.name || '-'}</td>
                        <td style="padding: 12px; color: #e0e0e0;">${emp.email || '-'}</td>
                        <td style="padding: 12px; color: #b0c4de;">${emp.department || '-'}</td>
                        <td style="padding: 12px; color: #b0c4de;">${emp.designation || '-'}</td>
                    </tr>
                `;
            });
        }
        
        document.getElementById('employeesList').innerHTML = html;
    } catch (error) {
        console.error('Error displaying employees:', error);
    }
}

async function showPresentTodayModal() {
    try {
        const presentTodayModal = document.getElementById('presentTodayModal');
        if (!presentTodayModal) return;
        
        presentTodayModal.classList.add('active');
        await displayAttendanceMetrics();
    } catch (error) {
        console.error('Error showing present modal:', error);
    }
}

async function displayAttendanceMetrics() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Display the date in the modal header (formatted for display)
        const metricsDate = document.getElementById('metricsDate');
        if (metricsDate) {
            metricsDate.textContent = new Date().toLocaleDateString();
        }
        
        const usersSnapshot = await getDocs(collection(db, 'employees'));
        const attendanceSnapshot = await getDocs(query(
            collection(db, 'attendance'),
            where('date', '==', today)
        ));
        
        let totalEmployees = 0;
        let presentCount = 0;
        let onTimeCount = 0;
        const departmentStats = {};
        
        // Create a map of users for quick lookup by ID
        const usersMap = {};
        usersSnapshot.forEach(doc => {
            usersMap[doc.id] = doc.data();
        });
        
        // Count total employees
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            totalEmployees++;
            const dept = data.department || 'Unknown';
            if (!departmentStats[dept]) {
                departmentStats[dept] = { total: 0, present: 0 };
            }
            departmentStats[dept].total++;
        });
        
        // Count attendance
        attendanceSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.clockIn) {
                presentCount++;
                // Get department from user data using the map
                const userData = usersMap[data.userId];
                const dept = userData?.department || 'Unknown';
                if (departmentStats[dept]) {
                    departmentStats[dept].present++;
                }
                // Only count as on-time if status is explicitly "On Time"
                if (data.status === 'On Time') {
                    onTimeCount++;
                }
            }
        });
        
        const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;
        document.getElementById('attendanceRate').textContent = attendanceRate + '%';
        document.getElementById('onTimeCount').textContent = onTimeCount;
        
        // Department breakdown
        let deptHtml = '';
        for (const [dept, stats] of Object.entries(departmentStats)) {
            const deptRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
            deptHtml += `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(29, 209, 161, 0.1);">
                    <span style="color: #e0e0e0;">${dept}</span>
                    <span style="color: #1dd1a1; font-weight: 600;">${stats.present}/${stats.total} (${deptRate}%)</span>
                </div>
            `;
        }
        document.getElementById('departmentAttendance').innerHTML = deptHtml || '<div style="color: #7a8fa6;">No data</div>';
    } catch (error) {
        console.error('Error displaying attendance metrics:', error);
    }
}

async function showAbsentTodayModal() {
    try {
        const absentTodayModal = document.getElementById('absentTodayModal');
        if (!absentTodayModal) return;
        
        absentTodayModal.classList.add('active');
        await displayAbsentEmployees();
    } catch (error) {
        console.error('Error showing absent modal:', error);
    }
}

async function displayAbsentEmployees() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const usersSnapshot = await getDocs(collection(db, 'employees'));
        const attendanceSnapshot = await getDocs(query(
            collection(db, 'attendance'),
            where('date', '==', today)
        ));
        
        const presentIds = new Set();
        attendanceSnapshot.forEach(doc => {
            if (doc.data().clockIn) {
                presentIds.add(doc.data().userId);
            }
        });
        
        let absentEmployees = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (!presentIds.has(doc.id)) {
                absentEmployees.push({
                    id: doc.id,
                    ...data
                });
            }
        });
        
        absentEmployees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        let html = '';
        if (absentEmployees.length === 0) {
            html = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #7a8fa6;">All employees are present!</td></tr>';
        } else {
            absentEmployees.forEach(emp => {
                html += `
                    <tr style="border-bottom: 1px solid #1a3a5c;">
                        <td style="padding: 12px; color: #e74c3c; font-weight: 600;">${emp.name || '-'}</td>
                        <td style="padding: 12px; color: #e0e0e0;">${emp.email || '-'}</td>
                        <td style="padding: 12px; color: #b0c4de;">${emp.department || '-'}</td>
                        <td style="padding: 12px; color: #b0c4de;">${emp.designation || '-'}</td>
                    </tr>
                `;
            });
        }
        
        document.getElementById('absentEmployeesList').innerHTML = html;
    } catch (error) {
        console.error('Error displaying absent employees:', error);
    }
}

async function showActiveSitesModal() {
    try {
        const activeSitesModal = document.getElementById('activeSitesModal');
        if (!activeSitesModal) return;
        
        activeSitesModal.classList.add('active');
        await displayActiveSites();
    } catch (error) {
        console.error('Error showing sites modal:', error);
    }
}

async function displayActiveSites() {
    try {
        const sitesSnapshot = await getDocs(query(
            collection(db, 'sites'),
            where('status', '==', 'active')
        ));
        const usersSnapshot = await getDocs(collection(db, 'employees'));
        
        let sites = [];
        sitesSnapshot.forEach(doc => {
            sites.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        sites.sort((a, b) => (a.siteName || '').localeCompare(b.siteName || ''));
        
        let html = '';
        if (sites.length === 0) {
            html = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #7a8fa6;">No active sites</td></tr>';
        } else {
            sites.forEach(site => {
                // Count employees in this site
                let empCount = 0;
                usersSnapshot.forEach(doc => {
                    const user = doc.data();
                    if (user.department === site.siteName) {
                        empCount++;
                    }
                });
                
                html += `
                    <tr style="border-bottom: 1px solid #1a3a5c;">
                        <td style="padding: 12px; color: #1dd1a1; font-weight: 600;">${site.siteName || '-'}</td>
                        <td style="padding: 12px; color: #e0e0e0;">-</td>
                        <td style="padding: 12px; color: #b0c4de;">${site.location || '-'}</td>
                        <td style="padding: 12px; color: #b0c4de;">${site.manager || '-'}</td>
                        <td style="padding: 12px; color: #f1c40f; font-weight: 600;">${empCount}</td>
                    </tr>
                `;
            });
        }
        
        document.getElementById('sitesList').innerHTML = html;
    } catch (error) {
        console.error('Error displaying sites:', error);
    }
}

// ===========================
// USER FILTER FUNCTIONS
// ===========================

let allUsersData = []; // Store all users data for filtering

function setupUserFilterListeners() {
    try {
        console.log('🔵 Setting up user filter listeners...');
        
        const userFilterBtn = document.getElementById('userFilterBtn');
        const userClearFilterBtn = document.getElementById('userClearFilterBtn');
        const userDepartmentFilter = document.getElementById('userDepartmentFilter');
        const userDesignationFilter = document.getElementById('userDesignationFilter');

        console.log('Button elements found:', {
            userFilterBtn: !!userFilterBtn,
            userClearFilterBtn: !!userClearFilterBtn,
            userDepartmentFilter: !!userDepartmentFilter,
            userDesignationFilter: !!userDesignationFilter
        });

        // Remove existing listeners by cloning and replacing
        if (userFilterBtn) {
            const newUserFilterBtn = userFilterBtn.cloneNode(true);
            userFilterBtn.parentNode.replaceChild(newUserFilterBtn, userFilterBtn);
            
            newUserFilterBtn.addEventListener('click', function() {
                console.log('🟢 User filter button clicked');
                const selectedDept = userDepartmentFilter?.value || '';
                const selectedDesignation = userDesignationFilter?.value || '';
                console.log('Filtering with:', { selectedDept, selectedDesignation });
                filterUsersTable(selectedDept, selectedDesignation);
            });
            console.log('✓ User filter button listener attached');
        } else {
            console.warn('⚠️ userFilterBtn not found');
        }

        if (userClearFilterBtn) {
            const newUserClearFilterBtn = userClearFilterBtn.cloneNode(true);
            userClearFilterBtn.parentNode.replaceChild(newUserClearFilterBtn, userClearFilterBtn);
            
            newUserClearFilterBtn.addEventListener('click', function() {
                console.log('🟢 User clear filter button clicked');
                if (userDepartmentFilter) userDepartmentFilter.value = '';
                if (userDesignationFilter) userDesignationFilter.value = '';
                filterUsersTable('', '');
            });
            console.log('✓ User clear filter button listener attached');
        } else {
            console.warn('⚠️ userClearFilterBtn not found');
        }

        console.log('✓ User filter listeners setup complete');
    } catch (error) {
        console.error('Error setting up user filter listeners:', error);
    }
}

function filterUsersTable(department, designation) {
    try {
        console.log('🟢 filterUsersTable called with:', { department, designation });
        
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) {
            console.warn('⚠️ usersTableBody not found');
            return;
        }

        const rows = tbody.querySelectorAll('tr');
        console.log('Found ' + rows.length + ' total rows in table');
        
        let visibleCount = 0;
        let noDataRowExists = false;

        rows.forEach((row, index) => {
            // Check if this is the "no data" row
            if (row.classList.contains('no-data')) {
                console.log('Row ' + index + ': no-data row found');
                noDataRowExists = true;
                row.style.display = 'none'; // Hide no-data row initially
                return;
            }

            const rowDept = row.cells[4]?.textContent.trim() || '';
            const rowDesignation = row.cells[5]?.textContent.trim() || '';
            
            console.log('Row ' + index + ': dept="' + rowDept + '", desig="' + rowDesignation + '"');

            let matches = true;

            if (department && rowDept !== department) {
                matches = false;
            }

            if (designation && rowDesignation !== designation) {
                matches = false;
            }

            if (matches) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Show "no data" message if no rows match
        if (visibleCount === 0) {
            console.log('No matching rows found, showing no-data message');
            if (noDataRowExists) {
                // Find and show existing no-data row
                const noDataRow = tbody.querySelector('tr.no-data');
                if (noDataRow) {
                    noDataRow.innerHTML = '<td colspan="8" style="text-align:center;">No employees match the selected filters</td>';
                    noDataRow.style.display = '';
                }
            } else {
                // Create new no-data row if it doesn't exist
                const noDataRow = document.createElement('tr');
                noDataRow.className = 'no-data';
                noDataRow.innerHTML = '<td colspan="8" style="text-align:center;">No employees match the selected filters</td>';
                tbody.appendChild(noDataRow);
            }
        }

        console.log('✓ Filtered users table - ' + visibleCount + ' rows visible');
    } catch (error) {
        console.error('Error filtering users table:', error);
    }
}


// ===========================
// SITE FILTER FUNCTIONS
// ===========================

function setupSiteFilterListeners() {
    try {
        console.log('🔵 Setting up site filter listeners...');
        
        const siteFilterBtn = document.getElementById('siteFilterBtn');
        const siteClearFilterBtn = document.getElementById('siteClearFilterBtn');
        const sitesCityFilter = document.getElementById('sitesCityFilter');

        console.log('Button elements found:', {
            siteFilterBtn: !!siteFilterBtn,
            siteClearFilterBtn: !!siteClearFilterBtn,
            sitesCityFilter: !!sitesCityFilter
        });

        // Remove existing listeners by cloning and replacing
        if (siteFilterBtn) {
            const newSiteFilterBtn = siteFilterBtn.cloneNode(true);
            siteFilterBtn.parentNode.replaceChild(newSiteFilterBtn, siteFilterBtn);
            
            newSiteFilterBtn.addEventListener('click', function() {
                console.log('🟢 Site filter button clicked');
                const selectedCity = sitesCityFilter?.value || '';
                console.log('Filtering with:', { selectedCity });
                filterSitesTable(selectedCity);
            });
            console.log('✓ Site filter button listener attached');
        } else {
            console.warn('⚠️ siteFilterBtn not found');
        }

        if (siteClearFilterBtn) {
            const newSiteClearFilterBtn = siteClearFilterBtn.cloneNode(true);
            siteClearFilterBtn.parentNode.replaceChild(newSiteClearFilterBtn, siteClearFilterBtn);
            
            newSiteClearFilterBtn.addEventListener('click', function() {
                console.log('🟢 Site clear filter button clicked');
                if (sitesCityFilter) sitesCityFilter.value = '';
                filterSitesTable('');
            });
            console.log('✓ Site clear filter button listener attached');
        } else {
            console.warn('⚠️ siteClearFilterBtn not found');
        }

        console.log('✓ Site filter listeners setup complete');
    } catch (error) {
        console.error('Error setting up site filter listeners:', error);
    }
}

function filterSitesTable(city) {
    try {
        const tbody = document.getElementById('sitesTableBody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;
        let noDataRowExists = false;

        rows.forEach(row => {
            // Check if this is the "no data" row
            if (row.classList.contains('no-data')) {
                noDataRowExists = true;
                row.style.display = 'none'; // Hide no-data row initially
                return;
            }

            const rowCity = (row.cells[2]?.textContent || '').trim().toLowerCase();
            const selectedCity = (city || '').trim().toLowerCase();

            let matches = true;

            if (selectedCity && rowCity !== selectedCity) {
                matches = false;
            }

            if (matches) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Show "no data" message if no rows match
        if (visibleCount === 0) {
            if (noDataRowExists) {
                // Find and show existing no-data row
                const noDataRow = tbody.querySelector('tr.no-data');
                if (noDataRow) {
                    noDataRow.innerHTML = '<td colspan="6" style="text-align:center;">No sites match the selected filters</td>';
                    noDataRow.style.display = '';
                }
            } else {
                // Create new no-data row if it doesn't exist
                const noDataRow = document.createElement('tr');
                noDataRow.className = 'no-data';
                noDataRow.innerHTML = '<td colspan="6" style="text-align:center;">No sites match the selected filters</td>';
                tbody.appendChild(noDataRow);
            }
        }

        console.log(`✓ Filtered sites table - ${visibleCount} rows visible`);
    } catch (error) {
        console.error('Error filtering sites table:', error);
    }
}

// ===========================
// QUICK ACTIONS
// ===========================

function switchModule(moduleId) {
    try {
        const navItems = document.querySelectorAll('#attendanceUserSidebar .nav-item');
        const moduleContents = document.querySelectorAll('.module-content');
        
        // Remove active class from all items and contents
        navItems.forEach(ni => ni.classList.remove('active'));
        moduleContents.forEach(mc => mc.classList.remove('active'));
        
        // Find and activate the nav item with matching data-module
        const targetNavItem = document.querySelector(`#attendanceUserSidebar .nav-item[data-module="${moduleId}"]`);
        if (targetNavItem) {
            targetNavItem.classList.add('active');
        }
        
        // Activate the module content
        const module = document.getElementById(moduleId);
        if (module) {
            module.classList.add('active');
            
            // Load data for specific modules
            if (moduleId === 'dashboard') {
                loadDashboardData();
                loadAnnouncements();
            } else if (moduleId === 'attendance-management') {
                loadAllAttendanceRecords();
            } else if (moduleId === 'users') {
                loadEmployeesData();
                displayDesignations();
                setupUserFilterListeners();
            } else if (moduleId === 'sites') {
                loadSitesData();
                displayCities();
                displaySiteNames();
                setupSiteFilterListeners();
            } else if (moduleId === 'data-report') {
                setupDataReportListeners();
            }
        }
    } catch (error) {
        console.error('Error switching module:', error);
    }
}

function quickActionViewAllEmployees() {
    try {
        switchModule('users');
    } catch (error) {
        console.error('Error viewing employees:', error);
    }
}

function quickActionAddManualAttendance() {
    try {
        showManualAttendanceModal();
    } catch (error) {
        console.error('Error opening manual attendance modal:', error);
    }
}

function quickActionViewReports() {
    try {
        switchModule('data-report');
    } catch (error) {
        console.error('Error viewing reports:', error);
    }
}

function quickActionConfigure() {
    try {
        showAttendanceSettingsModal();
    } catch (error) {
        console.error('Error opening settings:', error);
    }
}

// ===========================
// MODULE NAVIGATION
// ===========================

function setupModuleNavigation() {
    // Only setup for attendance user sidebar nav items (not employee sidebar)
    const navItems = document.querySelectorAll('#attendanceUserSidebar .nav-item');
    const moduleContents = document.querySelectorAll('.module-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const moduleId = item.getAttribute('data-module');
            
            // Remove active class from all items and contents
            navItems.forEach(ni => ni.classList.remove('active'));
            moduleContents.forEach(mc => mc.classList.remove('active'));
            
            // Add active class to clicked item and corresponding content
            item.classList.add('active');
            const module = document.getElementById(moduleId);
            if (module) {
                module.classList.add('active');
                
                // Load data for specific modules
                if (moduleId === 'dashboard') {
                    loadDashboardData();
                    await loadAnnouncements();
                } else if (moduleId === 'attendance-management') {
                    loadAllAttendanceRecords();
                } else if (moduleId === 'users') {
                    loadEmployeesData();
                    await displayDesignations();
                    setupUserFilterListeners();
                } else if (moduleId === 'sites') {
                    loadSitesData();
                    await displayCities();
                    await displaySiteNames();
                    setupSiteFilterListeners();
                } else if (moduleId === 'data-report') {
                    setupDataReportListeners();
                }
            }
        });
    });
}

// ===========================
// EVENT LISTENERS & INITIALIZATION
// ===========================

// Flag to track if site form is in edit mode (global scope)
let isEditMode = false;

document.addEventListener('DOMContentLoaded', async function() {
    // Setup module navigation
    setupModuleNavigation();
    
    // Setup attendance filter
    setupAttendanceFilterListeners();
    
    // ===========================
    // STAT CARDS CLICK HANDLERS
    // ===========================
    
    const totalEmployeesCard = document.getElementById('totalEmployeesCard');
    const presentTodayCard = document.getElementById('presentTodayCard');
    const absentTodayCard = document.getElementById('absentTodayCard');
    const activeSitesCard = document.getElementById('activeSitesCard');
    
    if (totalEmployeesCard) {
        totalEmployeesCard.addEventListener('click', showTotalEmployeesModal);
    }
    
    if (presentTodayCard) {
        presentTodayCard.addEventListener('click', showPresentTodayModal);
    }
    
    if (absentTodayCard) {
        absentTodayCard.addEventListener('click', showAbsentTodayModal);
    }
    
    if (activeSitesCard) {
        activeSitesCard.addEventListener('click', showActiveSitesModal);
    }
    
    // ===========================
    // MODAL CLOSE HANDLERS
    // ===========================
    
    // Total Employees Modal
    const totalEmployeesModal = document.getElementById('totalEmployeesModal');
    const closeTotalEmployeesModal = document.getElementById('closeTotalEmployeesModal');
    const employeeSearchFilter = document.getElementById('employeeSearchFilter');
    
    if (closeTotalEmployeesModal) {
        closeTotalEmployeesModal.addEventListener('click', function() {
            totalEmployeesModal.classList.remove('active');
        });
    }
    
    if (employeeSearchFilter) {
        employeeSearchFilter.addEventListener('input', function() {
            displayAllEmployees(this.value);
        });
    }
    
    // Present Today Modal
    const presentTodayModal = document.getElementById('presentTodayModal');
    const closePresentTodayModal = document.getElementById('closePresentTodayModal');
    
    if (closePresentTodayModal) {
        closePresentTodayModal.addEventListener('click', function() {
            presentTodayModal.classList.remove('active');
        });
    }
    
    // Absent Today Modal
    const absentTodayModal = document.getElementById('absentTodayModal');
    const closeAbsentTodayModal = document.getElementById('closeAbsentTodayModal');
    
    if (closeAbsentTodayModal) {
        closeAbsentTodayModal.addEventListener('click', function() {
            absentTodayModal.classList.remove('active');
        });
    }
    
    // Active Sites Modal
    const activeSitesModal = document.getElementById('activeSitesModal');
    const closeActiveSitesModal = document.getElementById('closeActiveSitesModal');
    
    if (closeActiveSitesModal) {
        closeActiveSitesModal.addEventListener('click', function() {
            activeSitesModal.classList.remove('active');
        });
    }
    
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === totalEmployeesModal) {
            totalEmployeesModal?.classList.remove('active');
        }
        if (event.target === presentTodayModal) {
            presentTodayModal?.classList.remove('active');
        }
        if (event.target === absentTodayModal) {
            absentTodayModal?.classList.remove('active');
        }
        if (event.target === activeSitesModal) {
            activeSitesModal?.classList.remove('active');
        }
    });
    
    // Admin settings
    document.getElementById('currentUserRole')?.addEventListener('click', openAdminSettings);
    
    document.getElementById('closeAdminSettingsModal')?.addEventListener('click', function() {
        document.getElementById('adminSettingsModal').classList.remove('active');
    });
    
    // Activity logs filters
    document.getElementById('refreshActivityLogsBtn')?.addEventListener('click', async function() {
        const filterActivity = document.getElementById('activityLogsFilter')?.value || '';
        const searchQuery = document.getElementById('activityLogsSearch')?.value || '';
        await loadActivityLogs(filterActivity, searchQuery);
    });
    
    document.getElementById('activityLogsFilter')?.addEventListener('change', async function() {
        const filterActivity = this.value || '';
        const searchQuery = document.getElementById('activityLogsSearch')?.value || '';
        await loadActivityLogs(filterActivity, searchQuery);
    });
    
    document.getElementById('activityLogsSearch')?.addEventListener('keyup', async function() {
        const filterActivity = document.getElementById('activityLogsFilter')?.value || '';
        const searchQuery = this.value || '';
        await loadActivityLogs(filterActivity, searchQuery);
    });
    
    // Edit Profile button
    document.getElementById('editProfileBtn')?.addEventListener('click', async function() {
        await openEditAttendanceAdminProfileModal();
    });
    
    // Change Password button
    document.getElementById('changePasswordBtn')?.addEventListener('click', function() {
        document.getElementById('changePasswordForm')?.reset();
        document.getElementById('changePasswordModal')?.classList.add('active');
    });

    // Edit profile modal controls
    document.getElementById('closeEditProfileModal')?.addEventListener('click', function() {
        document.getElementById('editProfileModal')?.classList.remove('active');
    });

    document.getElementById('cancelEditProfileBtn')?.addEventListener('click', function() {
        document.getElementById('editProfileModal')?.classList.remove('active');
    });

    document.getElementById('editProfileForm')?.addEventListener('submit', submitAttendanceAdminProfileUpdate);

    // Change password modal controls
    document.getElementById('closeChangePasswordModal')?.addEventListener('click', function() {
        document.getElementById('changePasswordModal')?.classList.remove('active');
    });

    document.getElementById('cancelChangePasswordBtn')?.addEventListener('click', function() {
        document.getElementById('changePasswordModal')?.classList.remove('active');
    });

    document.getElementById('changePasswordForm')?.addEventListener('submit', submitAttendanceAdminPasswordChange);
    
    // Modal controls
    document.getElementById('closeAttendanceSettingsModal')?.addEventListener('click', function() {
        document.getElementById('attendanceSettingsModal').classList.remove('active');
    });
    
    document.getElementById('closeAddManualAttendanceModal')?.addEventListener('click', function() {
        document.getElementById('addManualAttendanceModal').classList.remove('active');
    });
    
    document.getElementById('closeEditAttendanceModal')?.addEventListener('click', function() {
        document.getElementById('editAttendanceModal').classList.remove('active');
    });
    
    // Manual attendance form
    document.getElementById('manualAttendanceEmployee')?.addEventListener('change', updateEmployeeDetailsDisplay);
    document.getElementById('manualAttendanceDate')?.addEventListener('change', async function() {
        await loadActiveUsersForManualAttendance(this.value);
        updateEmployeeDetailsDisplay();
    });
    
    document.getElementById('addManualAttendanceForm')?.addEventListener('submit', submitManualAttendance);
    
    document.getElementById('cancelManualAttendanceBtn')?.addEventListener('click', function() {
        document.getElementById('addManualAttendanceModal').classList.remove('active');
    });
    
    // Edit attendance form
    document.getElementById('editAttendanceForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const attendanceId = document.getElementById('editingAttendanceId').value;
        const userId = document.getElementById('editingUserId').value;
        
        const adjustedData = {
            date: document.getElementById('editAttendanceDate').value,
            clockIn: document.getElementById('editClockInTime').value || null,
            clockOut: document.getElementById('editClockOutTime').value || null,
            status: document.getElementById('editStatus').value,
            remarks: document.getElementById('editRemarks').value
        };
        
        await saveAttendanceAdjustment(attendanceId, userId, adjustedData);
    });
    
    document.getElementById('cancelEditBtn')?.addEventListener('click', function() {
        document.getElementById('editAttendanceModal').classList.remove('active');
    });
    
    // View Attendance Location Modal
    document.getElementById('closeViewLocationModal')?.addEventListener('click', closeAttendanceLocationModal);
    
    document.getElementById('closeLocationViewBtn')?.addEventListener('click', closeAttendanceLocationModal);
    
    // Close location modal when clicking outside
    window.addEventListener('click', function(event) {
        const locationModal = document.getElementById('viewAttendanceLocationModal');
        if (event.target === locationModal) {
            closeAttendanceLocationModal();
        }

        const adminSettingsModal = document.getElementById('adminSettingsModal');
        const editProfileModal = document.getElementById('editProfileModal');
        const changePasswordModal = document.getElementById('changePasswordModal');

        if (event.target === adminSettingsModal) {
            adminSettingsModal.classList.remove('active');
        }
        if (event.target === editProfileModal) {
            editProfileModal.classList.remove('active');
        }
        if (event.target === changePasswordModal) {
            changePasswordModal.classList.remove('active');
        }
    });
    
    // Event delegation for view location buttons in Recent Attendance Logs
    document.addEventListener('click', function(event) {
        const btn = event.target.closest('.view-location-btn');
        if (btn) {
            console.log('=== LOCATION BUTTON CLICKED ===');
            console.log('Button element:', btn);
            console.log('Data attributes:', {
                lat: btn.dataset.lat,
                lon: btn.dataset.lon,
                address: btn.dataset.address,
                time: btn.dataset.time,
                site: btn.dataset.site,
                userid: btn.dataset.userid,
                empname: btn.dataset.empname
            });
            
            const recordData = {
                clockInLocation: {
                    latitude: parseFloat(btn.dataset.lat),
                    longitude: parseFloat(btn.dataset.lon),
                    address: btn.dataset.address
                },
                clockInTime: btn.dataset.time,
                employeeName: btn.dataset.empname,
                employeeSite: btn.dataset.site,
                userId: btn.dataset.userid
            };
            
            console.log('Calling viewAttendanceLocation with:', recordData);
            viewAttendanceLocation(recordData);
        }
    });
    
    // Settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async function() {
        const settings = {
            lateTimeThreshold: document.getElementById('lateTimeThreshold').value,
            earliestClockOut: document.getElementById('earliestClockOut').value,
            latestClockOut: document.getElementById('latestClockOut').value,
            autoTimeout: document.getElementById('autoTimeoutTime').value
        };
        await saveAttendanceSettings(settings);
    });
    
    // Quick Action buttons on dashboard
    document.getElementById('viewAllEmployeesBtn')?.addEventListener('click', quickActionViewAllEmployees);
    document.getElementById('addManualAttendanceBtn')?.addEventListener('click', quickActionAddManualAttendance);
    document.getElementById('addManualAttendanceBtn2')?.addEventListener('click', quickActionAddManualAttendance);
    document.getElementById('attendanceReportBtn')?.addEventListener('click', quickActionViewReports);
    document.getElementById('settingsBtn')?.addEventListener('click', quickActionConfigure);
    
    // New module buttons
    document.getElementById('addUserBtn')?.addEventListener('click', showAddEmployeeModal);
    
    // Toggle Designations Panel
    document.getElementById('toggleDesignationPanelBtn')?.addEventListener('click', function() {
        const panel = document.getElementById('designationsPanel');
        const hiddenSection = document.getElementById('designationsPanelHidden');
        if (panel && hiddenSection) {
            panel.style.display = 'none';
            hiddenSection.style.display = 'block';
        }
    });

    // Show Designations Panel and open add modal
    document.getElementById('showDesignationPanelBtn')?.addEventListener('click', function() {
        const panel = document.getElementById('designationsPanel');
        const hiddenSection = document.getElementById('designationsPanelHidden');
        if (panel && hiddenSection) {
            panel.style.display = 'grid';
            hiddenSection.style.display = 'none';
        }
        // Also open the add designation modal
        showAddDesignationModal();
    });
    
    // Designation modal
    document.getElementById('addDesignationBtn')?.addEventListener('click', showAddDesignationModal);
    document.getElementById('addDesignationForm')?.addEventListener('submit', submitAddDesignation);
    document.getElementById('closeDesignationModal')?.addEventListener('click', function() {
        const modal = document.getElementById('addDesignationModal');
        if (modal) modal.classList.remove('active');
    });
    document.getElementById('cancelDesignationBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addDesignationModal');
        if (modal) modal.classList.remove('active');
    });
    
    // City/Province modal
    document.getElementById('addCityBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addCityModal');
        if (modal) {
            document.getElementById('cityName').value = '';
            document.getElementById('editingCityId').value = '';
            document.getElementById('cityModalTitle').textContent = 'Add City/Province';
            modal.classList.add('active');
        }
    });
    document.getElementById('addCityForm')?.addEventListener('submit', submitAddCity);
    document.getElementById('closeCityModal')?.addEventListener('click', function() {
        const modal = document.getElementById('addCityModal');
        if (modal) modal.classList.remove('active');
    });
    document.getElementById('cancelCityBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addCityModal');
        if (modal) modal.classList.remove('active');
    });
    
    // Site Name modal
    document.getElementById('addSiteNameBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addSiteNameModal');
        if (modal) {
            document.getElementById('siteNameInput').value = '';
            document.getElementById('editingSiteNameId').value = '';
            document.getElementById('siteNameModalTitle').textContent = 'Add Site Name';
            modal.classList.add('active');
        }
    });
    document.getElementById('addSiteNameForm')?.addEventListener('submit', submitAddSiteName);
    document.getElementById('closeSiteNameModal')?.addEventListener('click', function() {
        const modal = document.getElementById('addSiteNameModal');
        if (modal) modal.classList.remove('active');
    });
    document.getElementById('cancelSiteNameBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addSiteNameModal');
        if (modal) modal.classList.remove('active');
    });
    
    // Announcements modal
    document.getElementById('addAnnouncementBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addAnnouncementModal');
        if (modal) {
            document.getElementById('editingAnnouncementId').value = '';
            document.getElementById('announcementTitle').value = '';
            document.getElementById('announcementCategory').value = 'general';
            document.getElementById('announcementMessage').value = '';
            document.getElementById('announcementPriority').value = 'normal';
            modal.classList.add('active');
        }
    });
    document.getElementById('addAnnouncementForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        try {
            const title = document.getElementById('announcementTitle').value;
            const category = document.getElementById('announcementCategory').value;
            const message = document.getElementById('announcementMessage').value;
            const priority = document.getElementById('announcementPriority').value;
            const editingId = document.getElementById('editingAnnouncementId').value;
            
            if (!title.trim() || !message.trim()) {
                await showMessage('Error', 'Please fill in all required fields');
                return;
            }
            
            if (editingId) {
                await updateDoc(doc(db, 'announcements', editingId), {
                    title, category, message, priority,
                    updatedAt: new Date()
                });
            } else {
                await addDoc(collection(db, 'announcements'), {
                    title, category, message, priority,
                    createdAt: new Date(),
                    createdBy: auth.currentUser?.email
                });
            }
            
            // Close modal before showing success message
            document.getElementById('addAnnouncementModal').classList.remove('active');
            document.getElementById('addAnnouncementForm').reset();
            
            // Add small delay to ensure modal closes
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (editingId) {
                await showMessage('Success', 'Announcement updated successfully');
            } else {
                await showMessage('Success', 'Announcement added successfully');
            }
            
            await loadAnnouncements();
        } catch (error) {
            console.error('Error:', error);
            
            // Close modal before showing error message
            document.getElementById('addAnnouncementModal').classList.remove('active');
            
            // Add delay to ensure modal closes before showing message
            await new Promise(resolve => setTimeout(resolve, 300));
            
            await showMessage('Error', 'Operation failed: ' + error.message);
        }
    });
    document.getElementById('closeAnnouncementModal')?.addEventListener('click', function() {
        const modal = document.getElementById('addAnnouncementModal');
        if (modal) modal.classList.remove('active');
    });
    document.getElementById('cancelAnnouncementBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addAnnouncementModal');
        if (modal) modal.classList.remove('active');
    });
    
    // Employee modal
    document.getElementById('closeAddEmployeeModal')?.addEventListener('click', function() {
        document.getElementById('addEmployeeModal').classList.remove('active');
    });
    
    document.getElementById('cancelAddEmployeeBtn')?.addEventListener('click', function() {
        document.getElementById('addEmployeeModal').classList.remove('active');
    });
    
    // Auto-generate password based on employee first name only
    document.getElementById('employeeName')?.addEventListener('input', function() {
        const fullName = this.value.trim();
        const firstName = fullName.split(' ')[0]; // Get only first name
        const generatedPassword = firstName ? firstName.toLowerCase() + '123' : '';
        const passwordField = document.getElementById('employeePassword');
        if (passwordField) {
            passwordField.value = generatedPassword;
        }
    });
    
    document.getElementById('addEmployeeForm')?.addEventListener('submit', submitAddEmployee);
    
    // Edit Employee modal
    document.getElementById('closeEditEmployeeModal')?.addEventListener('click', function() {
        document.getElementById('editEmployeeModal').classList.remove('active');
    });
    
    document.getElementById('cancelEditEmployeeBtn')?.addEventListener('click', function() {
        document.getElementById('editEmployeeModal').classList.remove('active');
    });
    
    document.getElementById('editEmployeeForm')?.addEventListener('submit', submitEditEmployee);
    
    document.getElementById('addSiteBtn')?.addEventListener('click', async function() {
        try {
            const modal = document.getElementById('addSiteModal');
            if (!modal) return;
            
            // Reset edit mode flag (ensure we're in add mode, not edit mode)
            isEditMode = false;
            
            // Set modal title to Add mode
            const modalTitle = document.getElementById('siteModalTitle');
            if (modalTitle) modalTitle.textContent = 'Add New Site';
            
            // Reset form
            const form = document.getElementById('addSiteForm');
            if (form) {
                form.reset();
                document.getElementById('siteName').value = '';
                document.getElementById('siteLocation').value = '';
                document.getElementById('siteCity').value = '';
                document.getElementById('siteManager').value = '';
                document.getElementById('siteStatus').value = 'active';
            }
            
            // Load site names dropdown
            const siteNamesRef = collection(db, 'siteNamesCodes');
            const siteNamesSnapshot = await getDocs(siteNamesRef);
            const siteNameSelect = document.getElementById('siteName');
            if (siteNameSelect) {
                siteNameSelect.innerHTML = '<option value="">Select Site Name</option>';
                siteNamesSnapshot.forEach((doc) => {
                    const siteName = doc.data();
                    const option = document.createElement('option');
                    option.value = siteName.siteName;
                    option.textContent = formatFormalText(siteName.siteName || 'Unknown');
                    siteNameSelect.appendChild(option);
                });
            }
            
            // Load cities dropdown
            const citiesRef = collection(db, 'cities');
            const citiesSnapshot = await getDocs(citiesRef);
            const citySelect = document.getElementById('siteCity');
            if (citySelect) {
                citySelect.innerHTML = '<option value="">Select City/Province</option>';
                citiesSnapshot.forEach((doc) => {
                    const city = doc.data();
                    const option = document.createElement('option');
                    option.value = city.cityName;
                    option.textContent = formatFormalText(city.cityName || 'Unknown');
                    citySelect.appendChild(option);
                });
            }
            
            // Show modal
            modal.classList.add('active');
        } catch (error) {
            console.error('Error opening add site modal:', error);
            await showMessage('Error', 'Failed to open site modal: ' + error.message);
        }
    });
    
    // Close site modal
    document.getElementById('closeSiteModal')?.addEventListener('click', function() {
        const modal = document.getElementById('addSiteModal');
        if (modal) {
            modal.classList.remove('active');
            // Reset edit mode flag when closing modal
            isEditMode = false;
            // Reset modal title
            const modalTitle = document.getElementById('siteModalTitle');
            if (modalTitle) modalTitle.textContent = 'Add New Site';
            document.getElementById('addSiteForm')?.reset();
        }
    });
    
    document.getElementById('cancelSiteBtn')?.addEventListener('click', function() {
        const modal = document.getElementById('addSiteModal');
        if (modal) {
            modal.classList.remove('active');
            // Reset edit mode flag when closing modal
            isEditMode = false;
            // Reset modal title
            const modalTitle = document.getElementById('siteModalTitle');
            if (modalTitle) modalTitle.textContent = 'Add New Site';
            document.getElementById('addSiteForm')?.reset();
        }
    });

    // Site location modal
    document.getElementById('closeSiteLocationModal')?.addEventListener('click', closeSiteLocationModal);
    document.getElementById('closeSiteLocationBtn')?.addEventListener('click', closeSiteLocationModal);
    document.getElementById('siteLocationModal')?.addEventListener('click', function(e) {
        if (e.target === this) {
            closeSiteLocationModal();
        }
    });
    
    // Add site form submit
    document.getElementById('addSiteForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Skip this handler if in edit mode (edit handler will run instead)
        if (isEditMode) {
            return;
        }
        
        try {
            const siteName = document.getElementById('siteName').value;
            const siteLocation = document.getElementById('siteLocation').value;
            const siteCity = document.getElementById('siteCity').value;
            const siteManager = document.getElementById('siteManager').value;
            const siteStatus = document.getElementById('siteStatus').value;
            const latitude = parseFloat(document.getElementById('siteLatitude').value);
            const longitude = parseFloat(document.getElementById('siteLongitude').value);
            const radius = parseInt(document.getElementById('siteRadius').value) || 100;
            
            if (!siteName || !siteLocation || !siteCity || !siteManager) {
                await showMessage('Error', 'Please fill in all required fields');
                return;
            }
            
            if (isNaN(latitude) || isNaN(longitude)) {
                await showMessage('Error', 'Please provide valid latitude and longitude coordinates');
                return;
            }
            
            if (radius < 10 || radius > 1000) {
                await showMessage('Error', 'Radius must be between 10 and 1000 meters');
                return;
            }
            
            // Add site to Firestore
            await addDoc(collection(db, 'sites'), {
                siteName: siteName,
                location: siteLocation,
                city: siteCity,
                manager: siteManager,
                status: siteStatus,
                geofence: {
                    latitude: latitude,
                    longitude: longitude,
                    radius: radius
                },
                createdAt: new Date()
            });
            
            logActivity('Site Added', `Added new site: ${siteName}`);
            
            // Close modal and reload
            document.getElementById('addSiteModal').classList.remove('active');
            document.getElementById('addSiteForm').reset();
            
            // Add small delay to ensure modal closes
            await new Promise(resolve => setTimeout(resolve, 300));
            
            await showMessage('Success', 'Site added successfully!');
            await loadSitesData();
        } catch (error) {
            console.error('Error adding site:', error);
            
            // Close modal before showing error message
            document.getElementById('addSiteModal').classList.remove('active');
            
            // Add delay to ensure modal closes before showing message
            await new Promise(resolve => setTimeout(resolve, 300));
            
            await showMessage('Error', 'Failed to add site: ' + error.message);
        }
    });
    
    // Get Current Location button handler
    document.getElementById('getSiteLocationBtn')?.addEventListener('click', function() {
        if (!navigator.geolocation) {
            showMessage('Error', 'Geolocation is not supported by your browser');
            return;
        }
        
        const button = this;
        const originalText = button.textContent;
        button.textContent = 'Getting location...';
        button.disabled = true;
        
        navigator.geolocation.getCurrentPosition(
            function(position) {
                document.getElementById('siteLatitude').value = position.coords.latitude.toFixed(6);
                document.getElementById('siteLongitude').value = position.coords.longitude.toFixed(6);
                button.textContent = originalText;
                button.disabled = false;
                showMessage('Success', 'Location captured successfully!');
            },
            function(error) {
                button.textContent = originalText;
                button.disabled = false;
                let errorMessage = 'Unable to get location';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location permission denied. Please allow location access.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out.';
                        break;
                }
                showMessage('Error', errorMessage);
            }
        );
    });
    
    // Site Name dropdown change - removed automatic code population
    // Since site codes are no longer part of this form
    
    // Populate site name and city dropdowns on modal open
    document.getElementById('addSiteModal')?.addEventListener('click', async function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
    
    // Populate site name and city dropdowns - NOTE: this is defined at global scope below
    
    document.getElementById('addSiteBtn')?.addEventListener('click', async function() {
        document.getElementById('addSiteForm').reset();
        document.getElementById('siteName').innerHTML = '<option value="">Select Site Name</option>';
        document.getElementById('siteCity').innerHTML = '<option value="">Select City/Province</option>';
        await populateDropdowns();
    });
    
    // Go Back button
    document.getElementById('goBackBtn')?.addEventListener('click', function() {
        window.location.href = 'modules.html';
    });
    
    // Load initial data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Detect user type and show appropriate UI
            await detectAndShowUserInterface(user);
            
            // Setup employee navigation if needed
            setupEmployeeNavigation();
            
            // Load admin dashboard data for attendance module
            if (document.getElementById('attendanceUserSidebar')?.style.display !== 'none') {
                // Load initial admin dashboard data
                await Promise.all([
                    loadDashboardData(),
                    loadAnnouncements(),
                    displayDesignations(),
                    displayCities(),
                    displaySiteNames()
                ]).catch(err => console.error('Error loading initial data:', err));
            }
            
            document.getElementById('dashboardUserName').textContent = 'Admin';
            document.getElementById('currentUserRole').title = 'Click for settings';
        } else {
            window.location.href = 'login.html';
        }
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async function() {
        const confirmed = await showConfirm('Confirm Logout', 'Are you sure you want to logout?');
        if (confirmed) {
            await auth.signOut();
            window.location.href = 'login.html';
        }
    });
    
    // Employee Logout
    document.getElementById('logoutBtnEmployee')?.addEventListener('click', async function() {
        const confirmed = await showConfirm('Confirm Logout', 'Are you sure you want to logout?');
        if (confirmed) {
            await auth.signOut();
            window.location.href = 'login.html';
        }
    });
    
    // Menu toggle for sidebar - Must be after all elements are loaded
    setTimeout(() => {
        const menuBtn = document.getElementById('menuBtn');
        const attendanceSidebar = document.getElementById('attendanceUserSidebar');
        const employeeSidebar = document.getElementById('employeeSidebar');

        const syncSidebarForViewport = () => {
            const isMobileView = window.innerWidth <= 768;

            [attendanceSidebar, employeeSidebar].forEach((sidebar) => {
                if (!sidebar) return;
                if (isMobileView) {
                    sidebar.classList.add('closed');
                } else {
                    sidebar.classList.remove('closed');
                }
            });
        };

        syncSidebarForViewport();
        window.addEventListener('resize', syncSidebarForViewport);
        
        if (menuBtn) {
            menuBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Toggle whichever sidebar is visible
                if (attendanceSidebar && attendanceSidebar.style.display !== 'none') {
                    attendanceSidebar.classList.toggle('closed');
                } else if (employeeSidebar && employeeSidebar.style.display !== 'none') {
                    employeeSidebar.classList.toggle('closed');
                }
            });
            
            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', function(e) {
                if (window.innerWidth <= 768) {
                    if (attendanceSidebar && attendanceSidebar.style.display !== 'none') {
                        if (!attendanceSidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                            attendanceSidebar.classList.add('closed');
                        }
                    }
                    if (employeeSidebar && employeeSidebar.style.display !== 'none') {
                        if (!employeeSidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                            employeeSidebar.classList.add('closed');
                        }
                    }
                }
            });
        }
    }, 100);
});

// Populate site name and city dropdowns on modal open
async function populateDropdowns() {
    try {
        // Load site names
        const siteNamesRef = collection(db, 'siteNamesCodes');
        const siteNamesSnapshot = await getDocs(siteNamesRef);
        const siteNameSelect = document.getElementById('siteName');
        if (siteNameSelect) {
            const currentValue = siteNameSelect.value;
            siteNameSelect.innerHTML = '<option value="">Select Site Name</option>';
            siteNamesSnapshot.forEach((doc) => {
                const siteName = doc.data();
                const option = document.createElement('option');
                option.value = siteName.siteName;
                option.textContent = formatFormalText(siteName.siteName || 'Unknown');
                siteNameSelect.appendChild(option);
            });
            siteNameSelect.value = currentValue;
        }
        
        // Load cities
        const citiesRef = collection(db, 'cities');
        const citiesSnapshot = await getDocs(citiesRef);
        const citySelect = document.getElementById('siteCity');
        if (citySelect) {
            const currentValue = citySelect.value;
            citySelect.innerHTML = '<option value="">Select City/Province</option>';
            citiesSnapshot.forEach((doc) => {
                const city = doc.data();
                const option = document.createElement('option');
                option.value = city.cityName;
                option.textContent = formatFormalText(city.cityName || 'Unknown');
                citySelect.appendChild(option);
            });
            citySelect.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading dropdowns:', error);
    }
}

// Make functions globally available
window.openEditAttendanceModal = openEditAttendanceModal;
window.updateEmployeeDetailsDisplay = updateEmployeeDetailsDisplay;
window.editSite = editSite;
window.deleteSite = deleteSite;

// Edit Site Function
async function editSite(siteId) {
    try {
        const siteDoc = await getDoc(doc(db, 'sites', siteId));
        if (!siteDoc.exists()) {
            await showMessage('Error', 'Site not found');
            return;
        }
        
        const site = siteDoc.data();
        
        // Populate dropdowns first
        await populateDropdowns();
        
        // Change modal title to Edit mode
        const modalTitle = document.getElementById('siteModalTitle');
        if (modalTitle) modalTitle.textContent = 'Edit Site';
        
        // Populate modal with existing data
        document.getElementById('siteName').value = site.siteName || '';
        document.getElementById('siteLocation').value = site.location || '';
        document.getElementById('siteCity').value = site.city || '';
        document.getElementById('siteManager').value = site.manager || '';
        document.getElementById('siteStatus').value = site.status || 'active';
        document.getElementById('siteLatitude').value = site.geofence?.latitude || '';
        document.getElementById('siteLongitude').value = site.geofence?.longitude || '';
        document.getElementById('siteRadius').value = site.geofence?.radius || 100;
        
        // Set edit mode flag to prevent duplicate submission
        isEditMode = true;
        
        // Change form to update mode
        const form = document.getElementById('addSiteForm');
        const oldSubmitHandler = form.onsubmit;
        
        form.onsubmit = async function(e) {
            e.preventDefault();
            
            try {
                const latitudeVal = document.getElementById('siteLatitude').value?.trim();
                const longitudeVal = document.getElementById('siteLongitude').value?.trim();
                const radiusVal = document.getElementById('siteRadius').value?.trim();
                
                // Only require geofencing if BOTH latitude and longitude are provided
                const hasGeofencing = latitudeVal && longitudeVal;
                
                // If both latitude and longitude are provided, validate them
                if (hasGeofencing) {
                    const latitude = parseFloat(latitudeVal);
                    const longitude = parseFloat(longitudeVal);
                    const radius = parseInt(radiusVal) || 100;
                    
                    if (isNaN(latitude) || isNaN(longitude)) {
                        await showMessage('Error', 'Please provide valid latitude and longitude coordinates for geofencing');
                        return;
                    }
                    
                    if (radius < 10 || radius > 1000) {
                        await showMessage('Error', 'Radius must be between 10 and 1000 meters');
                        return;
                    }
                }
                
                const updatedData = {
                    siteName: document.getElementById('siteName').value,
                    location: document.getElementById('siteLocation').value,
                    city: document.getElementById('siteCity').value,
                    manager: document.getElementById('siteManager').value,
                    status: document.getElementById('siteStatus').value,
                    updatedAt: new Date()
                };
                
                // Only update geofencing if user provided latitude and longitude
                if (hasGeofencing) {
                    const latitude = parseFloat(latitudeVal);
                    const longitude = parseFloat(longitudeVal);
                    const radius = parseInt(radiusVal) || 100;
                    updatedData.geofence = {
                        latitude: latitude,
                        longitude: longitude,
                        radius: radius
                    };
                }
                
                await updateDoc(doc(db, 'sites', siteId), updatedData);
                logActivity('Site Updated', `Updated site: ${updatedData.siteName}`);
                
                document.getElementById('addSiteModal').classList.remove('active');
                form.onsubmit = oldSubmitHandler;
                form.reset();
                
                // Reset edit mode flag and modal title
                isEditMode = false;
                const modalTitle = document.getElementById('siteModalTitle');
                if (modalTitle) modalTitle.textContent = 'Add New Site';
                
                // Add small delay to ensure modal closes
                await new Promise(resolve => setTimeout(resolve, 300));
                
                await showMessage('Success', 'Site updated successfully!');
                await loadSitesData();
            } catch (error) {
                console.error('Error updating site:', error);
                await showMessage('Error', 'Failed to update site: ' + error.message);
                // Reset edit mode flag and modal title on error
                isEditMode = false;
                const modalTitle = document.getElementById('siteModalTitle');
                if (modalTitle) modalTitle.textContent = 'Add New Site';
            }
        };
        
        document.getElementById('addSiteModal').classList.add('active');
    } catch (error) {
        console.error('Error loading site for edit:', error);
        await showMessage('Error', 'Failed to load site data: ' + error.message);
    }
}

// Delete Site Function
async function deleteSite(siteId) {
    try {
        const siteDoc = await getDoc(doc(db, 'sites', siteId));
        if (!siteDoc.exists()) {
            await showMessage('Error', 'Site not found');
            return;
        }
        
        const site = siteDoc.data();
        const confirmed = await showConfirm('Delete Site', `Are you sure you want to delete "${site.siteName}"? This action cannot be undone.`);
        
        if (!confirmed) return;
        
        await deleteDoc(doc(db, 'sites', siteId));
        logActivity('Site Deleted', `Deleted site: ${site.siteName}`);
        await showMessage('Success', 'Site deleted successfully!');
        await loadSitesData();
    } catch (error) {
        console.error('Error deleting site:', error);
        await showMessage('Error', 'Failed to delete site: ' + error.message);
    }
}

// ===========================
// COLLAPSIBLE SECTION FUNCTIONS
// ===========================

/**
 * Toggle Cities/Provinces section collapse/expand with smooth animation
 */
window.toggleCitiesSection = function() {
    const container = document.getElementById('citiesListContainer');
    const chevron = document.getElementById('citiesChevron');
    
    if (!container || !chevron) return;
    
    const isCollapsed = container.getAttribute('data-collapsed') === 'true';
    
    if (isCollapsed) {
        // Expand - use actual content height
        container.style.maxHeight = container.scrollHeight + 'px';
        container.style.opacity = '1';
        chevron.style.transform = 'rotate(180deg)';
        container.setAttribute('data-collapsed', 'false');
        localStorage.setItem('citiesSectionCollapsed', 'false');
    } else {
        // Collapse
        container.style.maxHeight = '0';
        container.style.opacity = '0';
        chevron.style.transform = 'rotate(0deg)';
        container.setAttribute('data-collapsed', 'true');
        localStorage.setItem('citiesSectionCollapsed', 'true');
    }
};

/**
 * Toggle Site Names section collapse/expand with smooth animation
 */
window.toggleSiteNamesSection = function() {
    const container = document.getElementById('siteNamesListContainer');
    const chevron = document.getElementById('siteNamesChevron');
    
    if (!container || !chevron) return;
    
    const isCollapsed = container.getAttribute('data-collapsed') === 'true';
    
    if (isCollapsed) {
        // Expand - use actual content height
        container.style.maxHeight = container.scrollHeight + 'px';
        container.style.opacity = '1';
        chevron.style.transform = 'rotate(180deg)';
        container.setAttribute('data-collapsed', 'false');
        localStorage.setItem('siteNamesSectionCollapsed', 'false');
    } else {
        // Collapse
        container.style.maxHeight = '0';
        container.style.opacity = '0';
        chevron.style.transform = 'rotate(0deg)';
        container.setAttribute('data-collapsed', 'true');
        localStorage.setItem('siteNamesSectionCollapsed', 'true');
    }
};

/**
 * Initialize collapse states from localStorage on page load
 */
function initializeCollapseStates() {
    // Initialize Cities section
    const citiesContainer = document.getElementById('citiesListContainer');
    const citiesChevron = document.getElementById('citiesChevron');
    const citiesCollapsed = localStorage.getItem('citiesSectionCollapsed') === 'true';
    
    if (citiesContainer && citiesChevron) {
        citiesContainer.setAttribute('data-collapsed', citiesCollapsed ? 'true' : 'false');
        if (citiesCollapsed) {
            citiesContainer.style.maxHeight = '0';
            citiesContainer.style.opacity = '0';
            citiesChevron.style.transform = 'rotate(0deg)';
        } else {
            // Expand to full content height
            citiesContainer.style.maxHeight = citiesContainer.scrollHeight + 'px';
            citiesContainer.style.opacity = '1';
            citiesChevron.style.transform = 'rotate(180deg)';
        }
    }
    
    // Initialize Site Names section
    const siteNamesContainer = document.getElementById('siteNamesListContainer');
    const siteNamesChevron = document.getElementById('siteNamesChevron');
    const siteNamesCollapsed = localStorage.getItem('siteNamesSectionCollapsed') === 'true';
    
    if (siteNamesContainer && siteNamesChevron) {
        siteNamesContainer.setAttribute('data-collapsed', siteNamesCollapsed ? 'true' : 'false');
        if (siteNamesCollapsed) {
            siteNamesContainer.style.maxHeight = '0';
            siteNamesContainer.style.opacity = '0';
            siteNamesChevron.style.transform = 'rotate(0deg)';
        } else {
            // Expand to full content height
            siteNamesContainer.style.maxHeight = siteNamesContainer.scrollHeight + 'px';
            siteNamesContainer.style.opacity = '1';
            siteNamesChevron.style.transform = 'rotate(180deg)';
        }
    }
}

/**
 * View attendance photo in full size modal
 * @param {string} photoURL - The Cloudinary URL of the photo
 * @param {string} title - Title to display (e.g., "Check-In Photo")
 */
window.viewAttendancePhoto = function(photoURL, title) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('photoViewerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'photoViewerModal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="closePhotoViewer()"></div>
            <div class="photo-viewer-content">
                <div class="photo-viewer-header">
                    <h3 id="photoViewerTitle">Photo</h3>
                    <button onclick="closePhotoViewer()" class="close-btn">&times;</button>
                </div>
                <div class="photo-viewer-body">
                    <img id="photoViewerImage" src="" alt="Attendance Photo" />
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #photoViewerModal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
            }
            #photoViewerModal.active {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #photoViewerModal .modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
            }
            #photoViewerModal .photo-viewer-content {
                position: relative;
                background: #1a2332;
                border-radius: 12px;
                max-width: 90vw;
                max-height: 90vh;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #photoViewerModal .photo-viewer-header {
                padding: 15px 20px;
                background: #0f1a29;
                border-bottom: 1px solid #2a3f5f;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #photoViewerModal .photo-viewer-header h3 {
                margin: 0;
                color: #1dd1a1;
                font-size: 18px;
            }
            #photoViewerModal .photo-viewer-header .close-btn {
                background: transparent;
                border: none;
                color: #e0e0e0;
                font-size: 28px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s;
            }
            #photoViewerModal .photo-viewer-header .close-btn:hover {
                color: #ff6b6b;
            }
            #photoViewerModal .photo-viewer-body {
                padding: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: auto;
            }
            #photoViewerModal .photo-viewer-body img {
                max-width: 100%;
                max-height: 70vh;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Update modal content
    document.getElementById('photoViewerTitle').textContent = title || 'Photo';
    document.getElementById('photoViewerImage').src = photoURL;
    
    // Show modal
    modal.classList.add('active');
};

/**
 * Close photo viewer modal
 */
window.closePhotoViewer = function() {
    const modal = document.getElementById('photoViewerModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

/**
 * View attendance location on map using Google Maps embed
 * @param {object} recordData - Record data containing location info
 */
window.viewAttendanceLocation = async function(recordData) {
    try {
        console.log('=== VIEW ATTENDANCE LOCATION DEBUG ===');
        console.log('Record Data:', recordData);
        
        // Handle both string (legacy) and object formats
        if (typeof recordData === 'string') {
            recordData = JSON.parse(recordData);
        }
        
        console.log('Parsed Record Data:', recordData);
        
        if (!recordData.clockInLocation || !recordData.clockInLocation.latitude) {
            console.warn('Missing location data');
            showMessage('Location Information', 'Location data is not available for this record.');
            return;
        }
        
        // Open the location modal
        const modal = document.getElementById('viewAttendanceLocationModal');
        console.log('Modal element:', modal);
        
        if (!modal) {
            console.error('Location modal not found');
            showMessage('Error', 'Modal not found in the page.');
            return;
        }
        
        console.log('Adding active class to modal');
        modal.classList.add('active');
        
        // Update modal content
        document.getElementById('locationModalTitle').textContent = 'Check-In Location';
        document.getElementById('locationModalEmployeeName').textContent = recordData.employeeName || 'Unknown';
        document.getElementById('locationModalTime').textContent = 
            recordData.clockInTime ? formatTimeToAMPM(recordData.clockInTime) : 'N/A';
        document.getElementById('locationModalAddress').textContent = 
            recordData.clockInLocation.address || 'Address not available';
        
        // Setup Google Maps embed and link
        const mapQuery = `${recordData.clockInLocation.latitude},${recordData.clockInLocation.longitude}`;
        const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed`;
        const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}`;
        
        // Set map iframe
        const mapFrame = document.getElementById('attendanceLocationMapFrame');
        if (mapFrame) {
            mapFrame.src = embedUrl;
        }
        
        // Set "Open in Google Maps" button
        const mapsLink = document.getElementById('openAttendanceLocationInMaps');
        if (mapsLink) {
            mapsLink.href = mapsUrl;
        }
        
        console.log('Location modal content updated');
        
    } catch (error) {
        console.error('Error viewing attendance location:', error);
        console.error('Stack trace:', error.stack);
        showMessage('Error', 'Failed to load location information: ' + error.message);
    }
};

/**
 * Close attendance location viewer modal
 */
window.closeAttendanceLocationModal = function() {
    const modal = document.getElementById('viewAttendanceLocationModal');
    if (modal) {
        modal.classList.remove('active');
    }
};
