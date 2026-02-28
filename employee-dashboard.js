// Employee Dashboard Module Navigation

import { db, auth } from './firebase.js';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, query, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Helper: Safe activity logging (graceful fallback if admin-dashboard not available)
async function logActivity(action, details, status = 'info') {
    try {
        console.log(`Activity: ${action} - ${details}`);
        // Optionally add to activity log collection
        await addDoc(collection(db, 'activityLog'), {
            action, details, status,
            timestamp: serverTimestamp(),
            userId: auth.currentUser?.uid
        }).catch(() => {}); // Silently fail if not available
    } catch (error) {
        console.log('Activity logging not available');
    }
}

// Helper: format local Date to YYYY-MM-DD (avoids timezone shifts when using toISOString)
function localDateToYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayNum}`;
}

// Helper: Format name with proper capitalization (capitalize first letter of each word)
function formatName(name) {
    if (!name || name === 'Unknown') return name || 'Unknown';
    return name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function getAssignedSiteFromUserData(userData = {}) {
    return (
        userData.assignedSite ||
        userData.site ||
        userData.department ||
        ''
    );
}

async function getMergedEmployeeUserData(userId) {
    const merged = {};

    try {
        const [usersDoc, employeesDoc] = await Promise.all([
            getDoc(doc(db, 'users', userId)),
            getDoc(doc(db, 'employees', userId))
        ]);

        const usersData = usersDoc.exists() ? usersDoc.data() : {};
        const employeesData = employeesDoc.exists() ? employeesDoc.data() : {};

        // Start with users data, then normalize/override with employees assignment fields.
        Object.assign(merged, usersData);

        // Name mapping
        merged.fullName = usersData.fullName || employeesData.name || usersData.name || 'Unknown';

        // Site assignment priority: employees assignment first, then users fallback.
        const assignedSite =
            employeesData.department ||
            employeesData.site ||
            usersData.department ||
            usersData.site ||
            '';

        merged.assignedSite = assignedSite;
        merged.site = assignedSite || usersData.site || '';
        merged.department = assignedSite || usersData.department || '';

        // Other mapped fields
        merged.designation = employeesData.designation || usersData.designation || '';
        merged.tagId = usersData.tagId || employeesData.tagging || '';
        merged.ltisc = usersData.ltisc || usersData.tagId || employeesData.tagging || 'LTISC';
        merged.email = usersData.email || employeesData.email || '';

        // Prefer earliest valid createdAt from either record
        const userCreatedAt = usersData.createdAt?.toDate ? usersData.createdAt.toDate() : (usersData.createdAt ? new Date(usersData.createdAt) : null);
        const employeeCreatedAt = employeesData.createdAt?.toDate ? employeesData.createdAt.toDate() : (employeesData.createdAt ? new Date(employeesData.createdAt) : null);
        if (userCreatedAt && !isNaN(userCreatedAt.getTime()) && employeeCreatedAt && !isNaN(employeeCreatedAt.getTime())) {
            merged.createdAt = userCreatedAt < employeeCreatedAt ? userCreatedAt : employeeCreatedAt;
        } else {
            merged.createdAt = userCreatedAt || employeeCreatedAt || null;
        }
    } catch (error) {
        console.error('Error merging user profile data:', error);
    }

    return merged;
}

// Safe fetch for attendance documents in a timestamp range
async function fetchAttendanceByTimestampRange(userId, startDate, endDate) {
    try {
        const q = query(
            collection(db, 'attendance'),
            where('userId', '==', userId),
            where('timestamp', '>=', startDate),
            where('timestamp', '<=', endDate)
        );
        const snap = await getDocs(q);
        return snap;
    } catch (err) {
        console.warn('Indexed timestamp query failed, falling back to client-side filter:', err.message || err);
        // Fallback: fetch all docs for the user and filter locally
        const q2 = query(collection(db, 'attendance'), where('userId', '==', userId));
        const snap2 = await getDocs(q2);
        // Build a fake snapshot-like array of docs that match the time range
        const filteredDocs = snap2.docs.filter(doc => {
            const data = doc.data();
            const ts = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)) : null;
            if (!ts) return false;
            return ts >= startDate && ts <= endDate;
        });
        // Return an object similar to QuerySnapshot with `empty` and `docs` properties
        return { empty: filteredDocs.length === 0, docs: filteredDocs };
    }
}

// Helper functions for modal dialogs
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
            messageOkBtn.removeEventListener('click', handleClose);
            closeMessageModal.removeEventListener('click', handleClose);
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
            confirmModal.classList.remove('active');
            cleanup();
            resolve(true);
        };

        const handleNo = () => {
            confirmModal.classList.remove('active');
            cleanup();
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
// UTILITY FUNCTIONS
// ===========================

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatTimeToAMPM(timeStr) {
    if (!timeStr) return null;
    try {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        const minute = parseInt(minutes);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
    } catch (e) {
        return timeStr;
    }
}

// Attendance rules and validation
const AttendanceRules = {
    LATEST_ON_TIME: '08:15',
    LATE_START: '08:16',
    END_TIME: '18:00',
    LUNCH_START: '12:00',
    LUNCH_END: '13:00',
    GEOFENCE_RADIUS: 1000,
    STATUS: {
        ON_TIME: 'On Time',
        LATE: 'Late',
        ABSENT: 'Absent',
        AUTO_TIMED_OUT: 'Auto Timed Out',
        LATE_AUTO_TIMED_OUT: 'Late Auto Timed Out'
    }
};

function validateTimeIn(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    const [latestHours, latestMinutes] = AttendanceRules.LATEST_ON_TIME.split(':').map(Number);
    const latestOnTimeMinutes = latestHours * 60 + latestMinutes; // 08:15 AM (495 minutes)
    
    return {
        isLate: timeInMinutes > latestOnTimeMinutes,
        status: timeInMinutes > latestOnTimeMinutes ? AttendanceRules.STATUS.LATE : AttendanceRules.STATUS.ON_TIME,
        message: timeInMinutes > latestOnTimeMinutes 
            ? 'Your arrival is marked as LATE'
            : 'You arrived on time',
        clockInTime: timeString
    };
}

function validateTimeOut(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    const startWindowMinutes = 17 * 60; // 5:00 PM
    
    return {
        isValid: timeInMinutes >= startWindowMinutes,
        message: timeInMinutes < startWindowMinutes 
            ? `It's too early to clock out. Earliest clock-out time is 5:00 PM`
            : 'You may clock out'
    };
}

function calculateOverlappingMinutes(rangeStart, rangeEnd, windowStart, windowEnd) {
    const overlapStart = Math.max(rangeStart, windowStart);
    const overlapEnd = Math.min(rangeEnd, windowEnd);
    return Math.max(overlapEnd - overlapStart, 0);
}

function shouldRequireLunchForShift(clockInTime, clockOutTime) {
    if (!clockInTime || !clockOutTime) return false;

    const inMinutes = parseTimeToMinutes(clockInTime);
    const outMinutes = parseTimeToMinutes(clockOutTime);
    const lunchStart = parseTimeToMinutes(AttendanceRules.LUNCH_START);
    const lunchEnd = parseTimeToMinutes(AttendanceRules.LUNCH_END);

    if (inMinutes < 0 || outMinutes < 0) return false;
    return calculateOverlappingMinutes(inMinutes, outMinutes, lunchStart, lunchEnd) > 0;
}

function isWithinLunchWindow(date = new Date()) {
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    const lunchStart = parseTimeToMinutes(AttendanceRules.LUNCH_START);
    const lunchEnd = parseTimeToMinutes(AttendanceRules.LUNCH_END);
    return currentMinutes >= lunchStart && currentMinutes < lunchEnd;
}

function isLateLunchReturn(timeString) {
    if (!timeString) return false;
    const currentMinutes = parseTimeToMinutes(timeString);
    const lunchEnd = parseTimeToMinutes(AttendanceRules.LUNCH_END);
    return currentMinutes > lunchEnd;
}

// ===========================
// GEOFENCING UTILITIES
// ===========================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} - Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Validate if user is within geofence of their assigned site
 * @param {Object} userLocation - User's current location {latitude, longitude}
 * @param {string} userSiteId - User's assigned site/project name or ID
 * @returns {Promise<Object>} - Validation result
 */
async function validateGeofence(userLocation, userSiteId) {
    try {
        const normalizedSiteId = (userSiteId || '').trim();

        if (!normalizedSiteId) {
            return {
                isValid: false,
                message: 'No site is assigned to your account. Please contact admin to configure your assigned site.'
            };
        }

        // Fetch site data - first check sites collection by name, then projects by ID
        let siteData = null;
        let siteName = normalizedSiteId;
        
        // Try to find site by name in sites collection
        const sitesQuery = query(collection(db, 'sites'), where('siteName', '==', normalizedSiteId));
        const sitesSnapshot = await getDocs(sitesQuery);
        
        if (!sitesSnapshot.empty) {
            siteData = sitesSnapshot.docs[0].data();
            siteName = siteData.siteName;
        } else {
            const normalizedLookup = normalizedSiteId.toLowerCase();

            // Fallback 1: try case-insensitive/trimmed match from all sites
            const allSitesSnapshot = await getDocs(collection(db, 'sites'));
            const fuzzySiteDoc = allSitesSnapshot.docs.find((siteDoc) => {
                const candidate = (siteDoc.data()?.siteName || '').trim().toLowerCase();
                return candidate === normalizedLookup;
            });

            if (fuzzySiteDoc) {
                siteData = fuzzySiteDoc.data();
                siteName = siteData.siteName || normalizedSiteId;
            } else {
                // Fallback 2: try projects collection by ID
                const projectDoc = await getDoc(doc(db, 'projects', normalizedSiteId));
                if (projectDoc.exists()) {
                    siteData = projectDoc.data();
                    siteName = siteData.projectName || siteData.name || normalizedSiteId;
                }
            }
        }
        
        if (!siteData) {
            return {
                isValid: false,
                message: `Assigned site "${normalizedSiteId}" was not found. Please contact admin to sync your site assignment.`
            };
        }
        
        // Check if geofence is configured for this site
        const siteLatitude = getNumericCoordinate(siteData.geofence?.latitude);
        const siteLongitude = getNumericCoordinate(siteData.geofence?.longitude);
        const configuredRadius = getNumericCoordinate(siteData.geofence?.radius);

        if (siteLatitude === null || siteLongitude === null) {
            return {
                isValid: false,
                message: `Geofence location is not configured for ${siteName}. Please contact admin.`
            };
        }

        const siteLocation = {
            latitude: siteLatitude,
            longitude: siteLongitude
        };
        const allowedRadius = configuredRadius && configuredRadius > 0 ? configuredRadius : 100;

        // Calculate distance
        const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            siteLocation.latitude,
            siteLocation.longitude
        );

        const { isWithinGeofence, effectiveAccuracy } = evaluateGeofenceDistance(
            distance,
            allowedRadius,
            userLocation.accuracy
        );

        return {
            isValid: isWithinGeofence,
            distance: Math.round(distance),
            accuracy: Math.round(effectiveAccuracy),
            allowedRadius,
            siteName: siteName,
            message: isWithinGeofence 
                ? `✓ You are at ${siteName} (${Math.round(distance)}m from site center, GPS ±${Math.round(effectiveAccuracy)}m)`
                : `✗ You are ${Math.round(distance)}m away from ${siteName} (GPS ±${Math.round(effectiveAccuracy)}m). You must be within ${allowedRadius}m to check-in.`
        };
    } catch (error) {
        console.error('Geofence validation error:', error);
        return {
            isValid: false,
            message: 'Could not verify your geofence. Check-in is blocked until location can be validated.',
            error: error.message
        };
    }
}


function calculateHoursWorked(clockInTime, clockOutTime, lunchOutTime = null, lunchInTime = null) {
    const [inH, inM] = clockInTime.split(':').map(Number);
    const [outH, outM] = clockOutTime.split(':').map(Number);
    const inMinutes = inH * 60 + inM;
    const outMinutes = outH * 60 + outM;

    const rawTotalMinutes = Math.max(outMinutes - inMinutes, 0);

    const lunchStart = parseTimeToMinutes(AttendanceRules.LUNCH_START);
    const lunchEnd = parseTimeToMinutes(AttendanceRules.LUNCH_END);

    let lunchDeduction = calculateOverlappingMinutes(inMinutes, outMinutes, lunchStart, lunchEnd);

    if (lunchOutTime && lunchInTime) {
        const lunchOutMinutes = parseTimeToMinutes(lunchOutTime);
        const lunchInMinutes = parseTimeToMinutes(lunchInTime);
        if (lunchOutMinutes >= 0 && lunchInMinutes >= 0 && lunchInMinutes >= lunchOutMinutes) {
            lunchDeduction = calculateOverlappingMinutes(lunchOutMinutes, lunchInMinutes, lunchStart, lunchEnd);
        }
    }

    const totalMinutes = Math.max(rawTotalMinutes - Math.min(lunchDeduction, rawTotalMinutes), 0);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return {
        totalMinutes,
        lunchDeduction,
        hours,
        minutes,
        formatted: `${hours}h ${minutes}m`
    };
}

// ===========================
// DASHBOARD MODULE FUNCTIONALITY
// ===========================

async function initializeDashboard() {
    console.log('>>> initializeDashboard called <<<');
    try {
        const user = auth.currentUser;
        console.log('🔍 Current user:', user ? user.uid : 'NO USER');
        
        if (!user) {
            console.warn('❌ No current user in initializeDashboard');
            return;
        }

        console.log('✓ Auth user found:', user.uid);
        console.log('✓ User email:', user.email);
        console.log('✓ User displayName:', user.displayName);

        // Get merged profile data from users + employees collections
        let userData = {};
        try {
            userData = await getMergedEmployeeUserData(user.uid);
            console.log('✓ Merged user profile loaded:', userData);
        } catch (firestoreError) {
            console.error('❌ Firestore fetch error:', firestoreError);
            userData = {};
        }
        
        // Build name with aggressive fallbacks
        let employeeName = 'Employee';
        if (userData.fullName) {
            employeeName = formatName(userData.fullName).split(' ')[0];
            console.log('📝 Name from Firestore fullName:', employeeName);
        } else if (user.displayName) {
            employeeName = formatName(user.displayName).split(' ')[0];
            console.log('📝 Name from Auth displayName:', employeeName);
        } else if (user.email) {
            employeeName = user.email.split('@')[0];
            console.log('📝 Name from email:', employeeName);
        }
        
        const employeeNameEl = document.getElementById('employeeName');
        if (employeeNameEl) {
            employeeNameEl.textContent = employeeName;
            console.log('✓✓✓ Welcome header NAME updated to:', employeeName);
        } else {
            console.error('❌ employeeName element not found!');
        }
        
        // Build LTISC tag
        const ltiscValue = userData.ltisc || 'LTISC';
        const ltiscTagEl = document.getElementById('ltiscTag');
        if (ltiscTagEl) {
            ltiscTagEl.textContent = ltiscValue;
            console.log('✓✓✓ LTIS tag updated to:', ltiscValue);
        } else {
            console.error('❌ ltiscTag element not found!');
        }
        
        // Build site
        let siteValue = getAssignedSiteFromUserData(userData) || 'Main Office';
        const employeeSiteEl = document.getElementById('employeeSite');
        if (employeeSiteEl) {
            employeeSiteEl.textContent = `Site: ${siteValue}`;
            console.log('✓✓✓ Site updated to:', siteValue);
        } else {
            console.error('❌ employeeSite element not found!');
        }

        // Load today's attendance
        try {
            await loadTodayAttendance();
        } catch (err) {
            console.error('Error loading today attendance:', err);
        }

        // Auto-mark absent for yesterday if missing
        try {
            await autoMarkYesterdayAbsent();
        } catch (err) {
            console.error('Error auto-marking absent:', err);
        }

        // Load monthly stats
        try {
            await loadMonthlyStats();
        } catch (err) {
            console.error('Error loading monthly stats:', err);
        }

        // Load weekly hours - ensure canvas exists before rendering
        try {
            const canvas = document.getElementById('weeklyHoursChart');
            if (canvas && canvas.parentElement) {
                await loadWeeklyHours();
            }
        } catch (err) {
            console.error('Error loading weekly hours:', err);
        }

        // Load announcements
        try {
            await loadAnnouncements();
        } catch (err) {
            console.error('Error loading announcements:', err);
        }

        console.log('Dashboard initialized successfully');

    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}

async function getTodayAttendanceRecord(userId = auth.currentUser?.uid) {
    if (!userId) return { docId: null, data: null };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const querySnapshot = await fetchAttendanceByTimestampRange(userId, todayStart, todayEnd);
    if (querySnapshot.empty) {
        return { docId: null, data: null };
    }

    const firstDoc = querySnapshot.docs[0];
    return {
        docId: firstDoc.id,
        data: firstDoc.data()
    };
}

function updateAttendanceActionButtons(todayRecord = attendanceState.todayRecord) {
    const mainClockInBtn = document.getElementById('mainClockInBtn');
    const mainClockOutBtn = document.getElementById('mainClockOutBtn');
    const lunchOutBtn = document.getElementById('lunchOutBtn');
    const lunchInBtn = document.getElementById('lunchInBtn');

    if (mainClockInBtn) {
        mainClockInBtn.disabled = false;
        mainClockInBtn.classList.remove('completed');
    }
    if (mainClockOutBtn) {
        mainClockOutBtn.disabled = true;
        mainClockOutBtn.classList.remove('completed');
    }
    if (lunchOutBtn) {
        lunchOutBtn.disabled = true;
        lunchOutBtn.classList.remove('completed');
    }
    if (lunchInBtn) {
        lunchInBtn.disabled = true;
        lunchInBtn.classList.remove('completed');
    }

    if (!todayRecord || !todayRecord.clockIn) {
        return;
    }

    if (mainClockInBtn) {
        mainClockInBtn.disabled = true;
        mainClockInBtn.classList.add('completed');
    }

    if (todayRecord.clockOut) {
        if (mainClockOutBtn) {
            mainClockOutBtn.disabled = true;
            mainClockOutBtn.classList.add('completed');
        }
        if (lunchOutBtn && todayRecord.lunchOut) {
            lunchOutBtn.classList.add('completed');
        }
        if (lunchInBtn && todayRecord.lunchIn) {
            lunchInBtn.classList.add('completed');
        }
        return;
    }

    if (mainClockOutBtn) {
        mainClockOutBtn.disabled = false;
    }

    if (!lunchOutBtn || !lunchInBtn) {
        return;
    }

    const now = new Date();
    if (!todayRecord.lunchOut) {
        lunchOutBtn.disabled = !isWithinLunchWindow(now);
    } else {
        lunchOutBtn.disabled = true;
        lunchOutBtn.classList.add('completed');
    }

    if (todayRecord.lunchOut && !todayRecord.lunchIn) {
        lunchInBtn.disabled = false;
    } else if (todayRecord.lunchIn) {
        lunchInBtn.disabled = true;
        lunchInBtn.classList.add('completed');
    }
}

function updateAttendanceStatusText(record) {
    const statusEl = document.getElementById('attendanceStatus');
    if (!statusEl) return;

    if (!record?.clockIn) {
        statusEl.textContent = 'Pending';
        return;
    }

    if (record.clockOut) {
        statusEl.textContent = 'Completed';
        return;
    }

    if (record.lunchOut && !record.lunchIn) {
        statusEl.textContent = 'On Lunch';
        return;
    }

    if (record.lunchLateReturn) {
        statusEl.textContent = 'In Progress (Late Return)';
        return;
    }

    statusEl.textContent = record.isLate ? 'Late' : 'In Progress';
}

async function loadTodayAttendance() {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const clockInDisplay = document.getElementById('clockInDisplay');
        const clockOutDisplay = document.getElementById('clockOutDisplay');
        const lunchOutDisplay = document.getElementById('lunchOutDisplay');
        const lunchInDisplay = document.getElementById('lunchInDisplay');
        const hoursWorkedEl = document.getElementById('hoursWorked');

        if (clockInDisplay) clockInDisplay.textContent = '--:--';
        if (clockOutDisplay) clockOutDisplay.textContent = '--:--';
        if (lunchOutDisplay) lunchOutDisplay.textContent = '--:--';
        if (lunchInDisplay) lunchInDisplay.textContent = '--:--';
        if (hoursWorkedEl) hoursWorkedEl.textContent = '0h 0m';

        const { data } = await getTodayAttendanceRecord(user.uid);
        attendanceState.todayRecord = data;

        if (data) {
            
            // Update clock in/out times
            if (clockInDisplay && data.clockIn) {
                clockInDisplay.textContent = formatTimeToAMPM(data.clockIn);
            }
            
            if (clockOutDisplay && data.clockOut) {
                clockOutDisplay.textContent = formatTimeToAMPM(data.clockOut);
            }

            if (lunchOutDisplay && data.lunchOut) {
                lunchOutDisplay.textContent = formatTimeToAMPM(data.lunchOut);
            }

            if (lunchInDisplay && data.lunchIn) {
                lunchInDisplay.textContent = formatTimeToAMPM(data.lunchIn);
            }

            // Update hours today
            const recordMinutes = typeof data.hoursWorked === 'number'
                ? data.hoursWorked
                : (data.clockIn && data.clockOut
                    ? calculateHoursWorked(data.clockIn, data.clockOut, data.lunchOut, data.lunchIn).totalMinutes
                    : 0);
            if (hoursWorkedEl) {
                const hours = Math.floor(recordMinutes / 60);
                const minutes = Math.round(recordMinutes % 60);
                hoursWorkedEl.textContent = `${hours}h ${minutes}m`;
            }

            if (data.clockIn && !data.clockOut) {
                // Restore the clock in time to state so clock out can work
                attendanceState.clockInTime = data.clockIn;
                attendanceState.clockedIn = true;
            } else if (data.clockOut) {
                // Restore both clock in and out times
                attendanceState.clockInTime = data.clockIn;
                attendanceState.clockOutTime = data.clockOut;
                attendanceState.clockedIn = true;
            }

            updateAttendanceStatusText(data);
            updateAttendanceActionButtons(data);
        } else {
            attendanceState.clockedIn = false;
            attendanceState.clockInTime = null;
            attendanceState.clockOutTime = null;
            updateAttendanceStatusText(null);
            updateAttendanceActionButtons(null);
        }
    } catch (error) {
        console.error('Error loading today attendance:', error);
    }
}

async function autoMarkYesterdayAbsent() {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const dateStr = localDateToYMD(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1));

        // Skip only Sundays based on local weekday
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const day = yesterdayDate.getDay();
        if (day === 0) return;

        const attendanceRef = collection(db, 'attendance');
        const q = query(attendanceRef,
            where('userId', '==', user.uid),
            where('date', '==', dateStr)
        );

        let snapshot;
        try {
            snapshot = await getDocs(q);
        } catch (err) {
            console.warn('autoMark: indexed query failed, falling back to user-only fetch', err.message || err);
            const fallbackQ = query(collection(db, 'attendance'), where('userId', '==', user.uid));
            const fallbackSnap = await getDocs(fallbackQ);
            const filtered = fallbackSnap.docs.filter(d => {
                const data = d.data();
                if (typeof data.date === 'string') return data.date === dateStr;
                if (data.timestamp) {
                    const ts = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                    const ds = localDateToYMD(ts);
                    return ds === dateStr;
                }
                return false;
            });
            snapshot = { empty: filtered.length === 0, docs: filtered };
        }

        if (!snapshot.empty) {
            return;
        }

        // Check if user has any attendance records before yesterday
        const historyQ = query(attendanceRef, where('userId', '==', user.uid));
        const historySnapshot = await getDocs(historyQ);
        
        let hasWorkedBefore = false;
        historySnapshot.forEach(doc => {
            const data = doc.data();
            if (data.date && data.date < dateStr) {
                hasWorkedBefore = true;
            }
        });
        
        // Get user creation date
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let userCreatedAt = new Date();
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userCreatedAt = userData.createdAt instanceof Date ? userData.createdAt : (userData.createdAt?.toDate?.() || new Date());
        }
        const yesterdayDateObj = new Date(dateStr + 'T00:00:00');
        
        if (!hasWorkedBefore || userCreatedAt >= yesterdayDateObj) {
            return;
        }

        // Fetch merged employee data to get full name and assigned site consistently
        let employeeName = 'Unknown';
        let employeeSite = '';
        let employeeDesignation = '';
        let employeeTagging = '';

        try {
            const userData = await getMergedEmployeeUserData(user.uid);
            employeeName = userData.fullName || employeeName;
            employeeSite = getAssignedSiteFromUserData(userData) || '';
            employeeDesignation = userData.designation || '';
            employeeTagging = userData.tagId || userData.ltisc || '';
        } catch (e) {
            console.warn('Could not fetch user data for absent marking:', e);
        }

        await addDoc(collection(db, 'attendance'), {
            userId: user.uid,
            date: dateStr,
            status: 'Absent',
            isAbsent: true,
            employeeName: employeeName,
            employeeSite: employeeSite,
            employeeDesignation: employeeDesignation,
            employeeTagging: employeeTagging,
            timestamp: new Date(dateStr + 'T00:00:00'),
            createdAt: serverTimestamp()
        });

    } catch (error) {
        console.error('Error auto-marking absent:', error);
    }
}

async function loadMonthlyStats() {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const now = new Date();
        const userCreatedAt = await getUserCreatedAtDate();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const rangeStart = userCreatedAt > monthStart ? userCreatedAt : monthStart;
        const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (rangeStart > rangeEnd) {
            document.getElementById('dashboardPresentDays').textContent = '0';
            document.getElementById('dashboardAbsentDays').textContent = '0';
            document.getElementById('dashboardLateDays').textContent = '0';
            document.getElementById('dashboardTotalHours').textContent = '0h';
            return;
        }

        const allRecords = await fetchCurrentUserAttendanceRecords();
        const monthlyRecords = buildComputedDailyRecords(allRecords, rangeStart, rangeEnd, userCreatedAt);

        let presentDays = 0;
        let absentDays = 0;
        let lateDays = 0;
        let totalMinutes = 0;

        monthlyRecords.forEach((data) => {
            if (data.clockIn) {
                presentDays++;

                if (data.clockOut) {
                    try {
                        const hoursData = calculateHoursWorked(data.clockIn, data.clockOut, data.lunchOut, data.lunchIn);
                        if (hoursData && hoursData.totalMinutes) {
                            totalMinutes += hoursData.totalMinutes;
                        }
                    } catch (e) {
                        if (typeof data.hoursWorked === 'number' && data.hoursWorked > 0) {
                            totalMinutes += data.hoursWorked;
                        }
                    }
                } else if (typeof data.hoursWorked === 'number' && data.hoursWorked > 0) {
                    totalMinutes += data.hoursWorked;
                }

                if (data.isLate || data.status === 'Late') {
                    lateDays++;
                }
            } else {
                absentDays++;
            }
        });

        document.getElementById('dashboardPresentDays').textContent = presentDays;
        document.getElementById('dashboardAbsentDays').textContent = absentDays;
        document.getElementById('dashboardLateDays').textContent = lateDays;
        
        const totalHours = isNaN(totalMinutes) ? 0 : (totalMinutes / 60);
        const displayHours = isNaN(totalHours) ? '0' : Math.floor(totalHours);
        document.getElementById('dashboardTotalHours').textContent = displayHours + 'h';
        
        const punctualityRate = presentDays > 0 ? Math.round(((presentDays - lateDays) / presentDays) * 100) : 0;
        const punctualityRateElement = document.getElementById('punctualityRate');
        if (punctualityRateElement) {
            punctualityRateElement.textContent = punctualityRate + '%';
            const metricsBar = punctualityRateElement.closest('.metrics-header')?.querySelector('.metrics-bar');
            if (metricsBar) {
                metricsBar.style.setProperty('--rate-width', punctualityRate + '%');
            }
        }
        
        const avgHoursPerDay = presentDays > 0 ? (totalHours / presentDays).toFixed(1) : '0';
        const avgOvertimeElement = document.getElementById('avgOvertime');
        if (avgOvertimeElement) {
            avgOvertimeElement.textContent = avgHoursPerDay + 'h';
        }

    } catch (error) {
        console.error('Error loading monthly stats:', error);
    }
}

async function loadWeeklyHours() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.warn('No current user for loadWeeklyHours');
            return;
        }

        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        const labels = [];
        const hoursData = [];

        const attendanceRef = collection(db, 'attendance');
        const q = query(attendanceRef,
            where('userId', '==', user.uid)
        );
        
        console.log('Fetching weekly attendance for user:', user.uid);
        const snapshot = await getDocs(q);
        console.log('Found', snapshot.size, 'attendance records');
        
        const hoursMap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.date) {
                const recordDate = new Date(data.date);
                const dateStr = localDateToYMD(recordDate);
                let hours = 0;
                
                if (data.clockIn && data.clockOut) {
                    try {
                        const hoursData = calculateHoursWorked(data.clockIn, data.clockOut, data.lunchOut, data.lunchIn);
                        if (hoursData && hoursData.totalMinutes) {
                            hours = Math.round((hoursData.totalMinutes / 60) * 100) / 100;
                        }
                    } catch (e) {
                        console.warn('Error calculating hours for date:', data.date, e);
                    }
                }
                
                if (hours === 0 && data.hoursWorked) {
                    if (data.hoursWorked > 10) {
                        hours = Math.round((data.hoursWorked / 60) * 100) / 100;
                    } else {
                        hours = data.hoursWorked;
                    }
                }
                
                if (hours > 0) {
                    hoursMap[dateStr] = hours;
                }
            }
        });

        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(date.getDate() + i);
            const dateStr = localDateToYMD(date);

            labels.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]);
            hoursData.push(hoursMap[dateStr] || 0);
        }

        console.log('Week labels:', labels);
        console.log('Week hours data:', hoursData);
        renderWeeklyChart(labels, hoursData);

    } catch (error) {
        console.error('Error loading weekly hours:', error);
    }
}

function renderWeeklyChart(labels, data) {
    const canvas = document.getElementById('weeklyHoursChart');
    if (!canvas) {
        console.warn('Canvas element weeklyHoursChart not found');
        return;
    }

    // Ensure canvas has proper context
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Unable to get 2D context from canvas');
        return;
    }

    if (window.weeklyChartInstance) {
        window.weeklyChartInstance.destroy();
    }

    const hoursData = data || [];
    console.log('Rendering chart with labels:', labels, 'and data:', hoursData);

    try {
        window.weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Hours Worked',
                data: hoursData,
                backgroundColor: [
                    '#1dd1a1', '#10ac84', '#0d7d66', '#1dd1a1', 
                    '#10ac84', '#0d7d66', '#1dd1a1'
                ],
                borderColor: '#1dd1a1',
                borderWidth: 2,
                borderRadius: 5,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x',
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#7a8fa6',
                        font: {
                            family: "'Poppins', sans-serif",
                            size: 12
                        },
                        padding: 15
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: Math.max(...hoursData, 8),
                    ticks: {
                        color: '#7a8fa6',
                        font: {
                            family: "'Poppins', sans-serif",
                            size: 11
                        },
                        callback: function(value) {
                            return value.toFixed(1) + 'h';
                        }
                    },
                    grid: {
                        color: '#0a1628',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#7a8fa6',
                        font: {
                            family: "'Poppins', sans-serif",
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        display: false,
                        drawBorder: false
                    }
                }
            }
        }
    });
    } catch (error) {
        console.error('Error rendering weekly chart:', error);
    }
}

async function loadAnnouncements() {
    try {
        const announcementsList = document.getElementById('employeeAnnouncementsList');
        const querySnapshot = await getDocs(collection(db, 'announcements'));

        if (querySnapshot.empty) {
            announcementsList.innerHTML = '<div style="text-align: center; padding: 30px; color: #7a8fa6;"><p>No announcements at the moment</p></div>';
            return;
        }

        let html = '';
        const announcements = [];

        querySnapshot.forEach(doc => {
            announcements.push(doc.data());
        });

        announcements.sort((a, b) => {
            let dateA, dateB;
            
            if (a.createdAt) {
                dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt.toDate?.() || new Date(a.createdAt));
            } else if (a.timestamp) {
                dateA = a.timestamp instanceof Date ? a.timestamp : (a.timestamp.toDate?.() || new Date(a.timestamp));
            } else {
                dateA = new Date(0);
            }
            
            if (b.createdAt) {
                dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt.toDate?.() || new Date(b.createdAt));
            } else if (b.timestamp) {
                dateB = b.timestamp instanceof Date ? b.timestamp : (b.timestamp.toDate?.() || new Date(b.timestamp));
            } else {
                dateB = new Date(0);
            }
            
            return dateB - dateA;
        });

        announcements.slice(0, 5).forEach(announcement => {
            const category = (announcement.category || 'general').toLowerCase();
            const priority = (announcement.priority || 'normal').toLowerCase();
            
            let date;
            if (announcement.createdAt) {
                date = announcement.createdAt instanceof Date ? announcement.createdAt : announcement.createdAt.toDate?.() || new Date(announcement.createdAt);
            } else if (announcement.timestamp) {
                date = announcement.timestamp instanceof Date ? announcement.timestamp : announcement.timestamp.toDate?.() || new Date(announcement.timestamp);
            } else {
                date = new Date();
            }

            let updatedDate = null;
            if (announcement.updatedAt) {
                updatedDate = announcement.updatedAt instanceof Date
                    ? announcement.updatedAt
                    : (announcement.updatedAt.toDate?.() || new Date(announcement.updatedAt));
                if (isNaN(updatedDate.getTime())) {
                    updatedDate = null;
                }
            }

            const isEdited = !!updatedDate;
            
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const formattedUpdatedDate = updatedDate
                ? updatedDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                })
                : '';

            html += `
                <div class="announcement-item">
                    <div class="announcement-header">
                        <div class="announcement-title-row">
                            <h3 class="announcement-title">${announcement.title || 'Announcement'}</h3>
                            ${isEdited ? '<span class="announcement-edited-badge">EDITED</span>' : ''}
                        </div>
                    </div>
                    <div>
                        <span class="announcement-category ${category}">${announcement.category || 'General'}</span>
                        <span class="announcement-priority ${priority}">${announcement.priority ? announcement.priority.toUpperCase() : 'NORMAL'}</span>
                    </div>
                    <p class="announcement-text">${announcement.content || announcement.message || ''}</p>
                    <div class="announcement-meta">
                        <div class="announcement-date">
                            ${formattedDate}
                            ${formattedUpdatedDate ? `<span class="announcement-updated">Updated: ${formattedUpdatedDate}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        announcementsList.innerHTML = html;

    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

function setupQuickActionButtons() {
    const quickViewRecordsBtn = document.getElementById('quickViewRecordsBtn');
    const quickViewProfileBtn = document.getElementById('quickViewProfileBtn');
    const quickRefreshBtn = document.getElementById('quickRefreshBtn');
    const quickLocationBtn = document.getElementById('quickLocationBtn');
    
    if (quickViewRecordsBtn) {
        quickViewRecordsBtn.addEventListener('click', () => {
            const navItem = document.querySelector('[data-module="my-records"]');
            if (navItem) navItem.click();
        });
    }

    if (quickViewProfileBtn) {
        quickViewProfileBtn.addEventListener('click', () => {
            const navItem = document.querySelector('[data-module="my-profile"]');
            if (navItem) navItem.click();
        });
    }

    if (quickRefreshBtn) {
        quickRefreshBtn.addEventListener('click', () => {
            initializeDashboard();
        });
    }

    if (quickLocationBtn) {
        quickLocationBtn.addEventListener('click', () => {
            const navItem = document.querySelector('[data-module="attendance"]');
            if (navItem) navItem.click();
        });
    }
}

// ===========================
// ATTENDANCE MODULE - LOCATION & CLOCK IN/OUT
// ===========================

const DEFAULT_WORK_LOCATION = {
    latitude: 14.092314514602707,
    longitude: 121.15590798456493,
    name: 'LTISC Main Office',
    geofenceRadius: 1000
};

let activeWorkLocation = { ...DEFAULT_WORK_LOCATION };

const LOCATION_ACCURACY_SETTINGS = {
    samples: 2,                     // Reduced from 3 - most improvement in first 2 samples
    sampleDelayMs: 300,              // Slightly faster between samples
    desiredAccuracyM: 50,            // Relaxed from 35m - accept "good enough" earlier
    weakSignalThresholdM: 80,        // Reduced from 120m - warn earlier with adjusted expectations
    maxAccuracyBufferM: 75,
    positionTimeoutMs: 8000,         // Reduced from 15s - fail faster on poor signal
    fallbackTimeoutMs: 15000         // Second attempt with longer timeout if needed
};

let attendanceState = {
    clockedIn: false,
    clockInTime: null,
    clockOutTime: null,
    todayRecord: null,
    employeeLocation: null,
    locationDistance: null,
    isWithinGeofence: false,
    employeeLocationAddress: null,
    pendingClockInType: null, // 'in' or 'out' to track which action triggered camera
    capturedPhotoBlob: null,
    capturedPhotoURL: null
};

function updateWorkLocationLegend(locationName) {
    const legendLabel = document.getElementById('workLocationLegendLabel');
    if (legendLabel) {
        legendLabel.textContent = `${locationName || 'Work'} Location`;
    }
}

function getNumericCoordinate(value) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : null;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCurrentPositionAsync(options = {}) {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
}

function getEffectiveAccuracy(accuracy) {
    const numericAccuracy = getNumericCoordinate(accuracy) || 0;
    return Math.min(Math.max(numericAccuracy, 0), LOCATION_ACCURACY_SETTINGS.maxAccuracyBufferM);
}

function evaluateGeofenceDistance(rawDistance, allowedRadius, accuracy) {
    const radiusBasedAccuracyCap = Math.max(5, allowedRadius * 0.4);
    const effectiveAccuracy = Math.min(getEffectiveAccuracy(accuracy), radiusBasedAccuracyCap);
    const adjustedDistance = Math.max(0, rawDistance - effectiveAccuracy);
    return {
        effectiveAccuracy,
        adjustedDistance,
        isWithinGeofence: adjustedDistance <= allowedRadius
    };
}

async function getBestAvailableLocationPosition() {
    let bestPosition = null;
    let lastError = null;

    // Quick first attempt with short timeout for immediate results
    try {
        const quickPosition = await getCurrentPositionAsync({
            enableHighAccuracy: true,
            timeout: 3000,  // Short 3s timeout for quick attempt
            maximumAge: 0
        });
        
        // If we get good accuracy immediately, use it
        if (quickPosition.coords.accuracy <= LOCATION_ACCURACY_SETTINGS.desiredAccuracyM) {
            return quickPosition;
        }
        
        bestPosition = quickPosition;
    } catch (error) {
        console.log('⚡ Quick location attempt timed out, trying standard samples...');
    }

    // Standard sampling with progressive timeouts
    for (let i = 0; i < LOCATION_ACCURACY_SETTINGS.samples; i++) {
        try {
            // Use shorter timeout on first sample, longer on subsequent
            const timeoutMs = i === 0 
                ? LOCATION_ACCURACY_SETTINGS.positionTimeoutMs 
                : LOCATION_ACCURACY_SETTINGS.fallbackTimeoutMs;
            
            const position = await getCurrentPositionAsync({
                enableHighAccuracy: true,
                timeout: timeoutMs,
                maximumAge: 0
            });

            if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
                bestPosition = position;
            }

            // Exit early if we get desired accuracy
            if (position.coords.accuracy <= LOCATION_ACCURACY_SETTINGS.desiredAccuracyM) {
                console.log(`✓ Achieved desired accuracy: ±${Math.round(position.coords.accuracy)}m`);
                break;
            }

            // Small delay before next sample
            if (i < LOCATION_ACCURACY_SETTINGS.samples - 1) {
                await delay(LOCATION_ACCURACY_SETTINGS.sampleDelayMs);
            }
        } catch (error) {
            lastError = error;
            console.log(`Location sample ${i + 1} failed:`, error.message);
        }
    }

    if (bestPosition) {
        console.log(`📍 Best location accuracy: ±${Math.round(bestPosition.coords.accuracy)}m`);
        return bestPosition;
    }
    
    throw lastError || new Error('Unable to retrieve location');
}

async function resolveActiveWorkLocation() {
    try {
        if (!auth.currentUser) {
            activeWorkLocation = { ...DEFAULT_WORK_LOCATION };
            updateWorkLocationLegend(activeWorkLocation.name);
            return activeWorkLocation;
        }

        const userData = await getMergedEmployeeUserData(auth.currentUser.uid);
        let userSiteId = getAssignedSiteFromUserData(userData);

        if (!userSiteId) {
            activeWorkLocation = { ...DEFAULT_WORK_LOCATION };
            updateWorkLocationLegend(activeWorkLocation.name);
            return activeWorkLocation;
        }

        const sitesQuery = query(collection(db, 'sites'), where('siteName', '==', userSiteId));
        const sitesSnapshot = await getDocs(sitesQuery);

        if (!sitesSnapshot.empty) {
            const siteData = sitesSnapshot.docs[0].data();
            const siteLat = getNumericCoordinate(siteData.geofence?.latitude);
            const siteLon = getNumericCoordinate(siteData.geofence?.longitude);
            const siteRadius = getNumericCoordinate(siteData.geofence?.radius) || 100;

            if (siteLat !== null && siteLon !== null) {
                activeWorkLocation = {
                    latitude: siteLat,
                    longitude: siteLon,
                    name: siteData.siteName || userSiteId,
                    geofenceRadius: siteRadius
                };
                updateWorkLocationLegend(activeWorkLocation.name);
                return activeWorkLocation;
            }
        }

        const projectDoc = await getDoc(doc(db, 'projects', userSiteId));
        if (projectDoc.exists()) {
            const projectData = projectDoc.data();
            const projectLat = getNumericCoordinate(projectData.geofence?.latitude);
            const projectLon = getNumericCoordinate(projectData.geofence?.longitude);
            const projectRadius = getNumericCoordinate(projectData.geofence?.radius) || 100;

            if (projectLat !== null && projectLon !== null) {
                activeWorkLocation = {
                    latitude: projectLat,
                    longitude: projectLon,
                    name: projectData.projectName || projectData.name || userSiteId,
                    geofenceRadius: projectRadius
                };
                updateWorkLocationLegend(activeWorkLocation.name);
                return activeWorkLocation;
            }
        }

        activeWorkLocation = { ...DEFAULT_WORK_LOCATION };
        updateWorkLocationLegend(activeWorkLocation.name);
        return activeWorkLocation;
    } catch (error) {
        console.warn('Could not resolve active work location, falling back to default:', error);
        activeWorkLocation = { ...DEFAULT_WORK_LOCATION };
        updateWorkLocationLegend(activeWorkLocation.name);
        return activeWorkLocation;
    }
}

// ===========================
// CLOUDINARY CONFIGURATION
// ===========================
const CLOUDINARY_CONFIG = {
    cloudName: 'dph9szjbi',
    apiKey: '522921186555831'
};

// ===========================
// CAMERA CAPTURE FUNCTIONS
// ===========================

let cameraStream = null;

async function setupCameraCapture() {
    const startCameraBtn = document.getElementById('startCameraBtn');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    const retakeCameraBtn = document.getElementById('retakeCameraBtn');
    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    const cancelCameraBtn = document.getElementById('cancelCameraBtn');
    const closeCameraModal = document.getElementById('closeCameraModal');
    const cameraPreview = document.getElementById('cameraPreview');
    const cameraModal = document.getElementById('cameraModal');

    if (startCameraBtn) {
        startCameraBtn.addEventListener('click', async () => {
            await openCamera();
        });
    }

    if (capturePhotoBtn) {
        capturePhotoBtn.addEventListener('click', () => {
            capturePhoto();
        });
    }

    if (retakeCameraBtn) {
        retakeCameraBtn.addEventListener('click', async () => {
            await openCamera();
        });
    }

    if (uploadPhotoBtn) {
        uploadPhotoBtn.addEventListener('click', async () => {
            await uploadPhotoToCloudinary();
        });
    }

    if (cancelCameraBtn) {
        cancelCameraBtn.addEventListener('click', () => {
            closeCameraModal();
        });
    }

    if (closeCameraModal) {
        closeCameraModal.addEventListener('click', () => {
            stopCamera();
            cameraModal.classList.remove('active');
        });
    }
}

function openCameraModal(actionType) {
    const cameraModal = document.getElementById('cameraModal');
    const cameraModalTitle = document.getElementById('cameraModalTitle');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const cameraStatus = document.getElementById('cameraStatus');
    
    attendanceState.pendingClockInType = actionType;
    cameraModalTitle.textContent = actionType === 'in' ? '📸 Take Photo for Check-In' : '📸 Take Photo for Check-Out';
    
    document.getElementById('cameraPreviewContainer').style.display = 'none';
    document.getElementById('capturedPhotoContainer').style.display = 'none';
    document.getElementById('capturePhotoBtn').style.display = 'none';
    document.getElementById('retakeCameraBtn').style.display = 'none';
    document.getElementById('uploadPhotoBtn').style.display = 'none';
    startCameraBtn.style.display = 'block';
    cameraStatus.textContent = 'Ready to capture. Click "Open Camera" to begin.';
    
    cameraModal.classList.add('active');
}

async function openCamera() {
    try {
        const cameraPreview = document.getElementById('cameraPreview');
        const cameraStatus = document.getElementById('cameraStatus');
        const startCameraBtn = document.getElementById('startCameraBtn');
        const capturePhotoBtn = document.getElementById('capturePhotoBtn');
        
        cameraStatus.textContent = 'Requesting camera access...';
        
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        
        cameraPreview.srcObject = cameraStream;
        document.getElementById('cameraPreviewContainer').style.display = 'block';
        startCameraBtn.style.display = 'none';
        capturePhotoBtn.style.display = 'block';
        cameraStatus.textContent = 'Camera ready. Click "Take Photo" to capture.';
        
        await new Promise(resolve => {
            cameraPreview.onloadedmetadata = resolve;
        });
    } catch (error) {
        console.error('Camera error:', error);
        document.getElementById('cameraStatus').textContent = 'Camera access denied. Please check permissions.';
        document.getElementById('cameraStatus').style.color = '#ff6b6b';
    }
}

function capturePhoto() {
    const cameraPreview = document.getElementById('cameraPreview');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    canvas.width = cameraPreview.videoWidth;
    canvas.height = cameraPreview.videoHeight;
    context.drawImage(cameraPreview, 0, 0);
    
    canvas.toBlob((blob) => {
        attendanceState.capturedPhotoBlob = blob;
        showCapturedPhoto(canvas.toDataURL('image/jpeg'));
    }, 'image/jpeg', 0.9);
}

function showCapturedPhoto(photoDataURL) {
    const cameraStatus = document.getElementById('cameraStatus');
    document.getElementById('cameraPreviewContainer').style.display = 'none';
    document.getElementById('capturePhotoBtn').style.display = 'none';
    document.getElementById('capturedPhotoContainer').style.display = 'block';
    document.getElementById('capturedPhoto').src = photoDataURL;
    document.getElementById('retakeCameraBtn').style.display = 'block';
    document.getElementById('uploadPhotoBtn').style.display = 'block';
    cameraStatus.textContent = 'Photo captured! Click "Confirm & Continue" to upload.';
    stopCamera();
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

function closeCameraModal(clearCapturedData = true) {
    const cameraModal = document.getElementById('cameraModal');
    stopCamera();
    cameraModal.classList.remove('active');
    if (clearCapturedData) {
        attendanceState.capturedPhotoBlob = null;
        attendanceState.capturedPhotoURL = null;
    }
}

async function uploadPhotoToCloudinary() {
    try {
        const cameraStatus = document.getElementById('cameraStatus');
        
        if (!attendanceState.capturedPhotoBlob) {
            cameraStatus.textContent = 'No photo captured';
            cameraStatus.style.color = '#ff6b6b';
            return;
        }
        
        cameraStatus.textContent = 'Uploading photo...';
        cameraStatus.style.color = '#1dd1a1';
        document.getElementById('uploadPhotoBtn').disabled = true;
        
        const formData = new FormData();
        formData.append('file', attendanceState.capturedPhotoBlob);
        formData.append('upload_preset', 'attendance_photos');
        formData.append('tags', `attendance,${localDateToYMD(new Date())}`);
        formData.append('folder', 'attendance-photos');
        
        const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;
        console.log('=== CLOUDINARY UPLOAD DEBUG ===');
        console.log('Cloud Name:', CLOUDINARY_CONFIG.cloudName);
        console.log('Upload URL:', uploadUrl);
        console.log('Blob size:', attendanceState.capturedPhotoBlob.size, 'bytes');
        console.log('Blob type:', attendanceState.capturedPhotoBlob.type);
        
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        const textData = await response.text();
        console.log('Response status:', response.status);
        console.log('Response text length:', textData.length);
        
        let data;
        try {
            data = JSON.parse(textData);
        } catch(e) {
            console.error('Failed to parse response as JSON');
            console.error('Response:', textData);
            throw new Error('Invalid response from Cloudinary: ' + textData.substring(0, 100));
        }
        
        console.log('Parsed response - Success:', !!data.secure_url, 'Error:', data.error?.message);
        
        if (response.ok && data.secure_url) {
            attendanceState.capturedPhotoURL = data.secure_url;
            cameraStatus.textContent = '✓ Photo uploaded successfully!';
            cameraStatus.style.color = '#1dd1a1';
            console.log('Upload successful! URL:', data.secure_url);
            
            setTimeout(() => {
                closeCameraModal(false);
                if (attendanceState.pendingClockInType === 'in') {
                    completeClockIn();
                } else if (attendanceState.pendingClockInType === 'out') {
                    completeClockOut();
                }
            }, 500);
        } else {
            const errorMsg = data.error?.message || data.message || 'Upload failed';
            console.error('Cloudinary error response:', data);
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error('=== CLOUDINARY UPLOAD FAILED ===');
        console.error('Error:', error.message);
        const cameraStatus = document.getElementById('cameraStatus');
        cameraStatus.textContent = 'Upload failed: ' + error.message;
        cameraStatus.style.color = '#ff6b6b';
        document.getElementById('uploadPhotoBtn').disabled = false;
    }
}

// Reverse geocode coordinates to address using free Nominatim service
async function getAddressFromCoordinates(latitude, longitude) {
    try {
        // Add User-Agent header as required by Nominatim policy
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'LTISC-Attendance-System'
                }
            }
        );
        const data = await response.json();
        
        console.log('🗺️ Raw geocoding data:', data);
        
        // Extract address components with more detail
        const address = data.address || {};
        const parts = [];
        
        // Priority order for locality (most specific first)
        const locality = 
            address.village ||           // Barangay/Village
            address.hamlet ||            // Small village
            address.suburb ||            // Subdivision
            address.neighbourhood ||     // Neighborhood
            address.quarter ||           // District
            address.residential ||       // Residential area
            address.road;                // Street name as last resort
        
        if (locality) {
            parts.push(locality);
            console.log('📍 Locality found:', locality);
        }
        
        // Municipality or City (but avoid duplicating the locality)
        const municipality = address.municipality || address.city || address.town;
        if (municipality && municipality !== locality) {
            parts.push(municipality);
            console.log('🏙️ Municipality:', municipality);
        }
        
        // Province/State
        const province = address.state || address.province || address.county || address.region;
        if (province && province !== municipality) {
            parts.push(province);
            console.log('🗺️ Province:', province);
        }
        
        // Build the address string
        let displayAddress = parts.join(', ');
        
        // If we don't have enough detail, try using the display_name but clean it up
        if (parts.length < 2 && data.display_name) {
            // Parse display_name which often has good detail
            const displayParts = data.display_name.split(',').map(p => p.trim());
            console.log('📝 Display name parts:', displayParts);
            
            // Take first 3 meaningful parts (skip numbers, coordinates)
            const meaningfulParts = displayParts.filter(p => 
                p && !p.match(/^\d+$/) && !p.match(/^\d+\.\d+$/) && p.length > 2
            ).slice(0, 3);
            
            if (meaningfulParts.length > 0) {
                displayAddress = meaningfulParts.join(', ');
            }
        }
        
        // Show coordinates if no address found
        if (!displayAddress) {
            displayAddress = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }
        
        // Log final result
        console.log('✅ Final location:', displayAddress);
        
        return displayAddress;
    } catch (error) {
        console.error('❌ Reverse geocoding error:', error);
        // Fallback to coordinates if geocoding fails
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
}

async function loadAttendanceData() {
    try {
        const attendanceContent = document.getElementById('attendance');
        if (!attendanceContent) return;

        const todayDate = new Date();
        document.getElementById('attendanceDate').textContent = todayDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        startDigitalClock();
        await loadTodayAttendance();
        await loadWeeklyAttendance();
        await loadCalendarView();

        setupAttendanceActions();
        checkLocationAvailability();
        setupRefreshLocationButton();

    } catch (error) {
        console.error('Error loading attendance data:', error);
    }
}

function startDigitalClock() {
    const digitalTimeEl = document.getElementById('digitalTime');
    const canvasEl = document.getElementById('analogClock');

    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        digitalTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

        if (attendanceState?.todayRecord) {
            updateAttendanceActionButtons(attendanceState.todayRecord);
        }

        if (canvasEl) {
            drawAnalogClock(canvasEl, now);
        }
    }

    updateClock();
    setInterval(updateClock, 1000);
}

function drawAnalogClock(canvas, now) {
    const ctx = canvas.getContext('2d');
    const radius = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(radius, radius, radius - 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#1a3a5c';
    ctx.fill();
    ctx.strokeStyle = '#3a6aaa';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
        const angle = (i * 30) * Math.PI / 180;
        const x1 = radius + Math.sin(angle) * (radius - 15);
        const y1 = radius - Math.cos(angle) * (radius - 15);
        const x2 = radius + Math.sin(angle) * (radius - 8);
        const y2 = radius - Math.cos(angle) * (radius - 8);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#3a6aaa';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const hourAngle = (hours * 30 + minutes * 0.5) * Math.PI / 180;
    drawHand(ctx, radius, hourAngle, radius * 0.5, 4, '#00d4ff');

    const minuteAngle = (minutes * 6 + seconds * 0.1) * Math.PI / 180;
    drawHand(ctx, radius, minuteAngle, radius * 0.7, 3, '#00ff88');

    const secondAngle = seconds * 6 * Math.PI / 180;
    drawHand(ctx, radius, secondAngle, radius * 0.8, 1, '#ff6b6b');

    ctx.beginPath();
    ctx.arc(radius, radius, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
}

function drawHand(ctx, radius, angle, length, width, color) {
    const x = radius + Math.sin(angle) * length;
    const y = radius - Math.cos(angle) * length;

    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
}

async function loadWeeklyAttendance() {
    try {
        const weeklyGrid = document.getElementById('weeklyGrid');
        const today = new Date();
        const weekDays = [];

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            weekDays.push(date);
        }

        let html = '';
        for (const day of weekDays) {
            const dateStr = localDateToYMD(day);
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = day.getDate();

            const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
            const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
            const querySnapshot = await fetchAttendanceByTimestampRange(auth.currentUser.uid, dayStart, dayEnd);

            let status = 'empty';
            let icon = 'fa-circle-minus';

            if (!querySnapshot.empty) {
                const record = querySnapshot.docs[0].data();
                if (record.clockIn && record.clockOut) {
                    status = 'complete';
                    icon = 'fa-circle-check';
                } else if (record.clockIn) {
                    status = 'partial';
                    icon = 'fa-circle-half-stroke';
                }
            }

            html += `
                <div class="week-day ${status}">
                    <div class="day-name">${dayName}</div>
                    <div class="day-number">${dayNum}</div>
                    <div class="day-status"><i class="fa-solid ${icon}"></i></div>
                </div>
            `;
        }

        weeklyGrid.innerHTML = html;
    } catch (error) {
        console.error('Error loading weekly attendance:', error);
    }
}

async function loadCalendarView() {
    try {
        const calendarContainer = document.getElementById('calendarContainer');
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, 'users', user.uid));
        let userCreatedAt = new Date();
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userCreatedAt = userData.createdAt instanceof Date ? userData.createdAt : (userData.createdAt?.toDate?.() || new Date());
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        let html = `<div class="calendar"><h4>${monthName}</h4><div class="calendar-grid">`;

        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            html += `<div class="calendar-header">${day}</div>`;
        });

        for (let i = 0; i < startingDayOfWeek; i++) {
            html += '<div class="calendar-empty"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = localDateToYMD(date);
            const isToday = dateStr === localDateToYMD(new Date());

            const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0,0,0,0);
            const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23,59,59,999);
            const querySnapshot = await fetchAttendanceByTimestampRange(auth.currentUser.uid, dayStart, dayEnd);

            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' today';
            if (!querySnapshot.empty) {
                const record = querySnapshot.docs[0].data();
                if (record.clockIn && record.clockOut) dayClass += ' present';
                else if (record.clockIn) dayClass += ' partial';
                else if ((record.status === 'Absent' || record.isAbsent) && date >= userCreatedAt) {
                    dayClass += ' absent';
                }
            } else {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (date < today && date >= userCreatedAt) {
                    dayClass += ' absent';
                }
            }

            html += `<div class="${dayClass}">${day}</div>`;
        }

        html += '</div></div>';
        calendarContainer.innerHTML = html;
    } catch (error) {
        console.error('Error loading calendar:', error);
    }
}

function setupAttendanceActions() {
    const clockInBtn = document.getElementById('mainClockInBtn');
    const clockOutBtn = document.getElementById('mainClockOutBtn');
    const lunchOutBtn = document.getElementById('lunchOutBtn');
    const lunchInBtn = document.getElementById('lunchInBtn');

    if (clockInBtn) {
        clockInBtn.addEventListener('click', async () => {
            await handleClockIn();
        });
    }

    if (clockOutBtn) {
        clockOutBtn.addEventListener('click', async () => {
            await handleClockOut();
        });
    }

    if (lunchOutBtn) {
        lunchOutBtn.addEventListener('click', async () => {
            await handleLunchOut();
        });
    }

    if (lunchInBtn) {
        lunchInBtn.addEventListener('click', async () => {
            await handleLunchIn();
        });
    }

    // Setup camera capture
    setupCameraCapture();
    
    setupCompactTabs();
}

function setupCompactTabs() {
    const tabButtons = document.querySelectorAll('.compact-tab-btn');
    const tabContents = document.querySelectorAll('.compact-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const activeContent = document.getElementById(tabName + 'Tab');
            if (activeContent) {
                activeContent.classList.add('active');
            }
        });
    });
}

async function handleLunchOut() {
    try {
        if (!attendanceState.clockInTime) {
            await showMessage('Lunch Out Blocked', 'Please clock in first before taking lunch out.');
            return;
        }

        if (!isWithinLunchWindow()) {
            await showMessage('Lunch Out Blocked', `Lunch out is only allowed during ${AttendanceRules.LUNCH_START} to ${AttendanceRules.LUNCH_END}.`);
            return;
        }

        const { docId, data } = await getTodayAttendanceRecord();
        if (!docId || !data) {
            await showMessage('Lunch Out Blocked', 'No attendance record found for today. Please clock in first.');
            return;
        }

        if (data.clockOut) {
            await showMessage('Lunch Out Blocked', 'You already clocked out for today.');
            return;
        }

        if (data.lunchOut) {
            await showMessage('Already Recorded', `Lunch out already recorded at ${formatTimeToAMPM(data.lunchOut)}.`);
            return;
        }

        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        await updateDoc(doc(db, 'attendance', docId), {
            lunchOut: timeString,
            lunchOutLocation: attendanceState.employeeLocation ? {
                latitude: attendanceState.employeeLocation.latitude,
                longitude: attendanceState.employeeLocation.longitude,
                accuracy: attendanceState.employeeLocation.accuracy,
                address: attendanceState.employeeLocationAddress || null
            } : null
        });

        attendanceState.todayRecord = {
            ...data,
            lunchOut: timeString
        };

        const lunchOutDisplay = document.getElementById('lunchOutDisplay');
        if (lunchOutDisplay) lunchOutDisplay.textContent = formatTimeToAMPM(timeString);

        updateAttendanceStatusText(attendanceState.todayRecord);
        updateAttendanceActionButtons(attendanceState.todayRecord);

        await showMessage('Lunch Out Recorded', `Lunch out captured at ${formatTimeToAMPM(timeString)}.`);
        await logActivity('Attendance', `Lunch out at ${timeString}`, 'success');
    } catch (error) {
        console.error('Error recording lunch out:', error);
        await showMessage('Error', 'Failed to record lunch out: ' + error.message);
    }
}

async function handleLunchIn() {
    try {
        if (!attendanceState.clockInTime) {
            await showMessage('Lunch In Blocked', 'Please clock in first before lunch in.');
            return;
        }

        const { docId, data } = await getTodayAttendanceRecord();
        if (!docId || !data) {
            await showMessage('Lunch In Blocked', 'No attendance record found for today.');
            return;
        }

        if (!data.lunchOut) {
            await showMessage('Lunch In Blocked', 'Please record lunch out first.');
            return;
        }

        if (data.lunchIn) {
            await showMessage('Already Recorded', `Lunch in already recorded at ${formatTimeToAMPM(data.lunchIn)}.`);
            return;
        }

        if (data.clockOut) {
            await showMessage('Lunch In Blocked', 'You already clocked out for today.');
            return;
        }

        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const lunchOutMinutes = parseTimeToMinutes(data.lunchOut);
        const lunchInMinutes = parseTimeToMinutes(timeString);
        const lunchDurationMinutes = Math.max(lunchInMinutes - lunchOutMinutes, 0);
        const lunchLateReturn = isLateLunchReturn(timeString);

        await updateDoc(doc(db, 'attendance', docId), {
            lunchIn: timeString,
            lunchDurationMinutes,
            lunchLateReturn,
            lunchInLocation: attendanceState.employeeLocation ? {
                latitude: attendanceState.employeeLocation.latitude,
                longitude: attendanceState.employeeLocation.longitude,
                accuracy: attendanceState.employeeLocation.accuracy,
                address: attendanceState.employeeLocationAddress || null
            } : null
        });

        attendanceState.todayRecord = {
            ...data,
            lunchIn: timeString,
            lunchDurationMinutes,
            lunchLateReturn
        };

        const lunchInDisplay = document.getElementById('lunchInDisplay');
        if (lunchInDisplay) lunchInDisplay.textContent = formatTimeToAMPM(timeString);

        updateAttendanceStatusText(attendanceState.todayRecord);
        updateAttendanceActionButtons(attendanceState.todayRecord);

        let lunchInMessage = `Lunch in captured at ${formatTimeToAMPM(timeString)}.`;
        if (lunchLateReturn) {
            lunchInMessage += '\n\n⚠ Return is after 1:00 PM and will be flagged as late lunch return.';
        }

        await showMessage('Lunch In Recorded', lunchInMessage);
        await logActivity('Attendance', `Lunch in at ${timeString}${lunchLateReturn ? ' (late return)' : ''}`, lunchLateReturn ? 'warning' : 'success');
    } catch (error) {
        console.error('Error recording lunch in:', error);
        await showMessage('Error', 'Failed to record lunch in: ' + error.message);
    }
}

async function handleClockIn() {
    try {
        const btn = document.getElementById('mainClockInBtn');
        btn.classList.add('pulse-animation');
        
        // Open camera modal before completing clock in
        openCameraModal('in');
        
    } catch (error) {
        console.error('Error initiating clock in:', error);
        await showMessage('Error', 'Failed to initiate check-in: ' + error.message);
    }
}

// Complete the clock in after photo capture
async function completeClockIn() {
    try {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        const timeInValidation = validateTimeIn(timeString);
        
        let statusMessage = `Clock In Time: ${timeString}\n\n${timeInValidation.message}`;
        if (timeInValidation.isLate) {
            statusMessage += `\n\n⚠ You are marked as LATE (Expected by: ${AttendanceRules.LATEST_ON_TIME}). Please ensure to complete your shift.`;
        } else {
            statusMessage += `\n\n✓ You are on time!`;
        }

        // Fetch merged employee data to get full name and assigned site consistently
        let employeeName = 'Unknown';
        let employeeEmail = auth.currentUser?.email || 'unknown';
        let employeeSite = '';
        let employeeDesignation = '';
        let employeeTagging = '';

        try {
            const userData = await getMergedEmployeeUserData(auth.currentUser.uid);
            employeeName = userData.fullName || employeeName;
            employeeEmail = userData.email || employeeEmail;
            employeeSite = getAssignedSiteFromUserData(userData) || '';
            employeeDesignation = userData.designation || '';
            employeeTagging = userData.tagId || userData.ltisc || '';
        } catch (e) {
            console.warn('Could not fetch user data for clock-in:', e);
        }

        // ========================================
        // GEOFENCE VALIDATION
        // ========================================
        // Validate if user is within the site's geofenced area
        if (attendanceState.employeeLocation && employeeSite) {
            const geofenceResult = await validateGeofence(
                attendanceState.employeeLocation,
                employeeSite
            );

            // Check if GPS accuracy is extremely poor (unreliable)
            const rawAccuracy = attendanceState.employeeLocation.accuracy || 0;
            const isGPSUnreliable = rawAccuracy > 500; // Over 500m accuracy is essentially unusable

            if (!geofenceResult.isValid) {
                // If GPS is unreliable, offer retry before blocking
                if (isGPSUnreliable) {
                    const retryMsg = `⚠️ GPS Signal Too Weak\n\nYour GPS accuracy is ±${Math.round(rawAccuracy)}m - too unreliable to verify location.\n\nDistance shown: ${geofenceResult.distance}m from ${geofenceResult.siteName}\nRequired: Within ${geofenceResult.allowedRadius}m\n\n📍 Would you like to retry getting your GPS location?\n\n(Click YES to retry, NO to cancel check-in)`;
                    
                    const shouldRetry = await showConfirm(
                        'Retry GPS Location?',
                        retryMsg
                    );
                    
                    if (shouldRetry) {
                        // Trigger location refresh
                        await checkLocationAvailability();
                        
                        // Check if location improved
                        const newAccuracy = attendanceState.employeeLocation?.accuracy || rawAccuracy;
                        if (newAccuracy > 500) {
                            // Still unreliable - offer override option
                            const overrideMsg = `⚠️ GPS Still Unreliable (±${Math.round(newAccuracy)}m)\n\nIf you are PHYSICALLY AT ${geofenceResult.siteName} right now, you can confirm your location.\n\n⚠️ WARNING: False check-ins are tracked and flagged.\n\nAre you physically present at the site location?\n\n(Click YES only if you are AT the site, NO to cancel)`;
                            
                            const confirmOverride = await showConfirm(
                                'Confirm Physical Presence',
                                overrideMsg
                            );
                            
                            if (!confirmOverride) {
                                return; // User cancelled check-in
                            }
                            
                            // Allow check-in with override flag
                            statusMessage += `\n\n⚠️ Geofence Override: GPS unreliable (±${Math.round(newAccuracy)}m)`;
                        } else {
                            // GPS improved - re-validate
                            const newGeofenceResult = await validateGeofence(
                                attendanceState.employeeLocation,
                                employeeSite
                            );
                            
                            if (!newGeofenceResult.isValid) {
                                const errorMsg = `❌ Check-In Blocked\n\n${newGeofenceResult.message}\n\nYou must be physically at the site location to check in.`;
                                await showMessage('Location Verification Failed', errorMsg);
                                return;
                            }
                            
                            statusMessage += `\n\n📍 Location Verified: ${newGeofenceResult.siteName}`;
                        }
                    } else {
                        return; // User cancelled check-in
                    }
                } else {
                    // GPS is reliable but user is genuinely outside geofence
                    const errorMsg = `❌ Check-In Blocked\n\n${geofenceResult.message}\n\nYou must be physically at the site location to check in.`;
                    await showMessage('Location Verification Failed', errorMsg);
                    return; // Exit without saving attendance
                }
            } else {
                // Within geofence - add success message
                if (geofenceResult.siteName && !geofenceResult.warning) {
                    statusMessage += `\n\n📍 Location Verified: ${geofenceResult.siteName}`;
                } else if (geofenceResult.warning) {
                    statusMessage += `\n\n⚠ ${geofenceResult.message}`;
                }
            }
        } else if (!attendanceState.employeeLocation) {
            // No location data available
            if (employeeSite) {
                await showMessage(
                    'Location Verification Failed',
                    'Your location could not be determined. Check-in is blocked because geofence verification is required for your assigned site.'
                );
                return;
            }

            const allowWithoutLocation = await showConfirm(
                'Location Not Available',
                'Your location could not be determined and no site is assigned to your account. Proceed with check-in anyway?'
            );
            if (!allowWithoutLocation) {
                return; // Exit without saving
            }
            statusMessage += '\n\n⚠ Location not verified';
        }
        // ========================================

        const today = localDateToYMD(new Date());
        const attendanceData = {
            userId: auth.currentUser.uid,
            date: today,
            clockIn: timeString,
            clockOut: null,
            lunchOut: null,
            lunchIn: null,
            lunchDurationMinutes: 0,
            lunchLateReturn: false,
            status: timeInValidation.status,
            isLate: timeInValidation.isLate,
            timestamp: new Date(),
            userEmail: employeeEmail,
            employeeName: employeeName,
            employeeEmail: employeeEmail,
            employeeSite: employeeSite,
            employeeDesignation: employeeDesignation,
            employeeTagging: employeeTagging,
            autoTimedOut: false,
            hoursWorked: 0,
            clockInLocation: attendanceState.employeeLocation ? {
                latitude: attendanceState.employeeLocation.latitude,
                longitude: attendanceState.employeeLocation.longitude,
                accuracy: attendanceState.employeeLocation.accuracy,
                distance: attendanceState.locationDistance,
                address: attendanceState.employeeLocationAddress
            } : null,
            checkInPhotoURL: attendanceState.capturedPhotoURL || null
        };

        await addDoc(collection(db, 'attendance'), attendanceData);

        attendanceState.capturedPhotoBlob = null;
        attendanceState.capturedPhotoURL = null;

        attendanceState.clockInTime = timeString;
        attendanceState.clockedIn = true;
        attendanceState.todayRecord = {
            ...attendanceData
        };

        document.getElementById('clockInDisplay').textContent = timeString;
        document.getElementById('clockInDate').textContent = 'Marked today';
        const lunchOutDisplay = document.getElementById('lunchOutDisplay');
        if (lunchOutDisplay) lunchOutDisplay.textContent = '--:--';
        const lunchInDisplay = document.getElementById('lunchInDisplay');
        if (lunchInDisplay) lunchInDisplay.textContent = '--:--';
        updateAttendanceStatusText(attendanceState.todayRecord);
        updateAttendanceActionButtons(attendanceState.todayRecord);

        await showMessage('✓ Clocked In Successfully', statusMessage);
        
        await logActivity('Attendance', `Clocked in at ${timeString} - ${timeInValidation.status}`, 'success');

        setTimeout(() => loadAttendanceData(), 1000);

    } catch (error) {
        console.error('Error completing clock in:', error);
        await showMessage('Error', 'Failed to complete clock in: ' + error.message);
    }
}

async function handleClockOut() {
    try {
        if (!attendanceState.clockInTime) {
            await showMessage('Error', 'Please clock in first');
            return;
        }

        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        const timeOutValidation = validateTimeOut(timeString);
        
        if (!timeOutValidation.isValid) {
            const confirmed = await showConfirm(
                'Clock Out Time Warning', 
                `${timeOutValidation.message}\n\nDo you still want to proceed?`
            );
            if (!confirmed) return;
        } else {
            const confirmed = await showConfirm('Confirm Clock Out', 'Are you sure you want to clock out now?');
            if (!confirmed) return;
        }

        // Open camera modal before completing clock out
        openCameraModal('out');
        
    } catch (error) {
        console.error('Error initiating clock out:', error);
        await showMessage('Error', 'Failed to initiate check-out: ' + error.message);
    }
}

// Complete the clock out after photo capture
async function completeClockOut() {
    try {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
        const querySnapshot = await fetchAttendanceByTimestampRange(auth.currentUser.uid, todayStart, todayEnd);

        if (!querySnapshot.empty) {
            const docId = querySnapshot.docs[0].id;
            const todayData = querySnapshot.docs[0].data();

            const lunchRequired = shouldRequireLunchForShift(attendanceState.clockInTime, timeString);
            if (lunchRequired && (!todayData.lunchOut || !todayData.lunchIn)) {
                await showMessage(
                    'Clock Out Blocked',
                    'Lunch out and lunch in are required before clock out for shifts covering 12:00 PM to 1:00 PM.'
                );
                return;
            }

            const hoursWorked = calculateHoursWorked(
                attendanceState.clockInTime,
                timeString,
                todayData.lunchOut,
                todayData.lunchIn
            );
            
            await updateDoc(doc(db, 'attendance', docId), {
                clockOut: timeString,
                autoTimedOut: false,
                hoursWorked: hoursWorked.totalMinutes,
                lunchRequired,
                clockOutLocation: attendanceState.employeeLocation ? {
                    latitude: attendanceState.employeeLocation.latitude,
                    longitude: attendanceState.employeeLocation.longitude,
                    accuracy: attendanceState.employeeLocation.accuracy,
                    distance: attendanceState.locationDistance,
                    address: attendanceState.employeeLocationAddress
                } : null,
                checkOutPhotoURL: attendanceState.capturedPhotoURL || null
            });

            attendanceState.todayRecord = {
                ...todayData,
                clockOut: timeString,
                hoursWorked: hoursWorked.totalMinutes,
                lunchRequired
            };
        }

        attendanceState.capturedPhotoBlob = null;
        attendanceState.capturedPhotoURL = null;

        attendanceState.clockOutTime = timeString;

        document.getElementById('clockOutDisplay').textContent = timeString;
        document.getElementById('clockOutDate').textContent = 'Marked today';
        updateAttendanceStatusText(attendanceState.todayRecord || { clockIn: attendanceState.clockInTime, clockOut: timeString });
        updateAttendanceActionButtons(attendanceState.todayRecord || { clockIn: attendanceState.clockInTime, clockOut: timeString });

        const todayLunchOut = attendanceState.todayRecord?.lunchOut || null;
        const todayLunchIn = attendanceState.todayRecord?.lunchIn || null;
        const hoursWorked = calculateHoursWorked(attendanceState.clockInTime, timeString, todayLunchOut, todayLunchIn);
        const hoursMessage = `Hours worked: ${hoursWorked.formatted}`;
        
        await showMessage('✓ Clocked Out Successfully', `You clocked out at ${timeString}.\n\n${hoursMessage}\n\nGreat work today!`);
        
        await logActivity('Attendance', `Clocked out at ${timeString} - ${hoursMessage}`, 'success');

        setTimeout(() => loadAttendanceData(), 1000);

    } catch (error) {
        console.error('Error completing clock out:', error);
        await showMessage('Error', 'Failed to complete clock out: ' + error.message);
    }
}

async function checkLocationAvailability() {
    const locationDistance = document.getElementById('locationDistance');
    const targetLocation = await resolveActiveWorkLocation();

    if (!navigator.geolocation) {
        locationDistance.textContent = 'Location not available';
        locationDistance.style.color = '#ff6b6b';
        return;
    }

    try {
        locationDistance.textContent = 'Getting accurate GPS...';

        const position = await getBestAvailableLocationPosition();
        const { latitude, longitude, accuracy } = position.coords;
        attendanceState.employeeLocation = { latitude, longitude, accuracy };

        const distance = calculateDistance(
            latitude,
            longitude,
            targetLocation.latitude,
            targetLocation.longitude
        );
        attendanceState.locationDistance = distance;

        const { isWithinGeofence } = evaluateGeofenceDistance(
            distance,
            targetLocation.geofenceRadius,
            accuracy
        );
        attendanceState.isWithinGeofence = isWithinGeofence;

        const address = await getAddressFromCoordinates(latitude, longitude);
        attendanceState.employeeLocationAddress = address;

        const weakSignal = accuracy > LOCATION_ACCURACY_SETTINGS.weakSignalThresholdM;
        const veryWeakSignal = accuracy > 200; // Extremely poor GPS
        
        const geofenceStatus = isWithinGeofence
            ? ` ✓ (At ${targetLocation.name})`
            : ` ✗ (Away from ${targetLocation.name})`;
        const metrics = ` • ${Math.round(distance)}m • GPS ±${Math.round(accuracy)}m`;
        
        let signalWarning = '';
        if (veryWeakSignal) {
            signalWarning = ' • Poor GPS - Try refreshing';
        } else if (weakSignal) {
            signalWarning = ' • Weak GPS signal';
        }

        locationDistance.textContent = `${address}${geofenceStatus}${metrics}${signalWarning}`;
        locationDistance.style.color = isWithinGeofence ? '#00ff88' : (weakSignal ? '#ffd166' : '#ffa500');

        // Show helpful tip if GPS is very poor
        if (veryWeakSignal) {
            console.warn(`⚠️ Very poor GPS accuracy detected: ±${Math.round(accuracy)}m. Consider moving to an open area or refreshing.`);
        }

        initializeLocationMap(latitude, longitude, targetLocation);
    } catch (error) {
        locationDistance.textContent = 'Location access denied';
        locationDistance.style.color = '#ff6b6b';
        console.error('Location error:', error);
    }
}

function setupRefreshLocationButton() {
    const refreshBtn = document.getElementById('refreshLocationBtn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        const icon = refreshBtn.querySelector('i');
        icon.style.animation = 'spin 1s linear infinite';

        try {
            await checkLocationAvailability();
        } finally {
            refreshBtn.disabled = false;
            icon.style.animation = 'none';
        }
    });

    setupMapToggle();
    setupGetLocationButton();
}

function setupMapToggle() {
    const mapToggleBtn = document.getElementById('mapToggleBtn');
    const locationMap = document.getElementById('locationMap');
    const mapLegend = document.querySelector('.map-legend');
    let isMapVisible = true;

    if (!mapToggleBtn) return;

    mapToggleBtn.addEventListener('click', () => {
        isMapVisible = !isMapVisible;
        
        if (isMapVisible) {
            locationMap.classList.remove('hidden');
            mapLegend.classList.remove('hidden');
            mapToggleBtn.innerHTML = '<i class="fa-solid fa-map"></i> Hide Map';
        } else {
            locationMap.classList.add('hidden');
            mapLegend.classList.add('hidden');
            mapToggleBtn.innerHTML = '<i class="fa-solid fa-map"></i> Show Map';
        }
    });
}

function setupGetLocationButton() {
    const getLocationBtn = document.getElementById('getLocationBtn');
    if (!getLocationBtn) return;

    getLocationBtn.addEventListener('click', async () => {
        getLocationBtn.disabled = true;
        const icon = getLocationBtn.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'fa-solid fa-spinner fa-spin';

        try {
            await checkLocationAvailability();
        } finally {
            getLocationBtn.disabled = false;
            icon.className = originalClass;
        }
    });
}

function initializeLocationMap(userLat, userLon, targetLocation = activeWorkLocation) {
    const mapElement = document.getElementById('locationMap');
    if (!mapElement) return;

    if (window.locationMapInstance) {
        window.locationMapInstance.remove();
    }

    const centerLat = (userLat + targetLocation.latitude) / 2;
    const centerLon = (userLon + targetLocation.longitude) / 2;

    const map = L.map('locationMap', {
        center: [centerLat, centerLon],
        zoom: 15,
        scrollWheelZoom: false
    });

    window.locationMapInstance = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    const officeMarker = L.circleMarker([targetLocation.latitude, targetLocation.longitude], {
        radius: 10,
        fillColor: '#00d4ff',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    officeMarker.bindPopup(`<div style="text-align: center;"><strong>🏢 ${targetLocation.name || 'Work Location'}</strong></div>`);

    const userMarker = L.circleMarker([userLat, userLon], {
        radius: 8,
        fillColor: '#ff9944',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
    }).addTo(map);
    userMarker.bindPopup('<div style="text-align: center;"><strong>📍 Your Location</strong></div>');

    const line = L.polyline(
        [[targetLocation.latitude, targetLocation.longitude], [userLat, userLon]],
        { color: '#ff6b6b', weight: 2, opacity: 0.6, dashArray: '5, 5' }
    ).addTo(map);

    map.fitBounds(L.latLngBounds(
        [[targetLocation.latitude, targetLocation.longitude], [userLat, userLon]],
    ), { padding: [50, 50] });
}

// ===========================
// MY RECORDS MODULE
// ===========================

async function loadMyRecordsData() {
    try {
        const myRecordsContent = document.getElementById('my-records');
        if (!myRecordsContent) return;

        await loadAllRecords();
    } catch (error) {
        console.error('Error loading my records:', error);
    }
}

function isWorkingDay(date) {
    const day = date.getDay();
    return day >= 1 && day <= 6; // Monday to Saturday
}

async function getUserCreatedAtDate() {
    try {
        const userId = auth.currentUser?.uid;
        if (!userId) return new Date();

        let userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            userDoc = await getDoc(doc(db, 'employees', userId));
        }

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const createdAt = userData.createdAt;
            if (createdAt instanceof Date) return createdAt;
            if (createdAt?.toDate) return createdAt.toDate();
            if (createdAt) {
                const parsedDate = new Date(createdAt);
                if (!isNaN(parsedDate.getTime())) return parsedDate;
            }
        }
    } catch (error) {
        console.warn('Could not resolve user createdAt, using today as fallback:', error);
    }

    return new Date();
}

function timeStringToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return -1;
    const parts = timeStr.split(':');
    if (parts.length < 2) return -1;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return -1;
    return (hours * 60) + minutes;
}

function mergeDailyAttendanceRecord(existingRecord, incomingRecord) {
    if (!existingRecord) {
        return {
            ...incomingRecord,
            status: incomingRecord.status || (incomingRecord.clockIn ? 'Present' : 'Absent')
        };
    }

    const merged = { ...existingRecord };

    if (!merged.clockIn && incomingRecord.clockIn) {
        merged.clockIn = incomingRecord.clockIn;
    } else if (merged.clockIn && incomingRecord.clockIn) {
        const existingClockIn = timeStringToMinutes(merged.clockIn);
        const incomingClockIn = timeStringToMinutes(incomingRecord.clockIn);
        if (incomingClockIn >= 0 && (existingClockIn < 0 || incomingClockIn < existingClockIn)) {
            merged.clockIn = incomingRecord.clockIn;
        }
    }

    if (!merged.clockOut && incomingRecord.clockOut) {
        merged.clockOut = incomingRecord.clockOut;
    } else if (merged.clockOut && incomingRecord.clockOut) {
        const existingClockOut = timeStringToMinutes(merged.clockOut);
        const incomingClockOut = timeStringToMinutes(incomingRecord.clockOut);
        if (incomingClockOut > existingClockOut) {
            merged.clockOut = incomingRecord.clockOut;
        }
    }

    merged.isLate = Boolean(merged.isLate || incomingRecord.isLate || incomingRecord.status === 'Late');

    if (merged.clockIn) {
        merged.status = merged.isLate ? 'Late' : (merged.status === 'Late' ? 'Late' : 'Present');
        merged.isAbsent = false;
    } else if (incomingRecord.status === 'Absent' || incomingRecord.isAbsent) {
        merged.status = 'Absent';
        merged.isAbsent = true;
    }

    return merged;
}

function buildComputedDailyRecords(rawRecords, startDate, endDate, userCreatedAt) {
    const dayMap = new Map();

    rawRecords.forEach((record) => {
        const recordDate = new Date(record.date);
        if (isNaN(recordDate.getTime())) return;
        if (recordDate < startDate || recordDate > endDate) return;

        const dateKey = localDateToYMD(recordDate);
        const existing = dayMap.get(dateKey);
        dayMap.set(dateKey, mergeDailyAttendanceRecord(existing, record));
    });

    const computed = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    while (cursor <= endDate) {
        const currentDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        if (currentDate >= userCreatedAt && isWorkingDay(currentDate)) {
            const dateKey = localDateToYMD(currentDate);
            const existing = dayMap.get(dateKey);

            if (existing) {
                const normalizedRecord = {
                    ...existing,
                    date: dateKey,
                    status: existing.clockIn ? (existing.isLate || existing.status === 'Late' ? 'Late' : 'Present') : 'Absent',
                    isAbsent: !existing.clockIn
                };
                computed.push(normalizedRecord);
            } else {
                computed.push({
                    date: dateKey,
                    clockIn: null,
                    clockOut: null,
                    status: 'Absent',
                    isAbsent: true,
                    isLate: false
                });
            }
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    return computed.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderMyRecordsTable(records, emptyMessage) {
    const recordsTableBody = document.getElementById('recordsTableBody');
    if (!recordsTableBody) return;

    if (!records || records.length === 0) {
        recordsTableBody.innerHTML = `<tr class="placeholder-row"><td colspan="6" class="text-center">${emptyMessage}</td></tr>`;

        if (document.getElementById('totalPresentDays')) document.getElementById('totalPresentDays').textContent = 0;
        if (document.getElementById('totalAbsentDays')) document.getElementById('totalAbsentDays').textContent = 0;
        if (document.getElementById('totalLateDays')) document.getElementById('totalLateDays').textContent = 0;
        if (document.getElementById('totalDays')) document.getElementById('totalDays').textContent = 0;
        return;
    }

    let html = '';
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;

    records.forEach((record) => {
        const date = new Date(record.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

        const hasClockIn = Boolean(record.clockIn);
        let status = hasClockIn ? (record.isLate || record.status === 'Late' ? 'Late' : 'Present') : 'Absent';

        let hoursWorked = 'N/A';
        if (hasClockIn && record.clockOut) {
            try {
                const hoursData = calculateHoursWorked(record.clockIn, record.clockOut, record.lunchOut, record.lunchIn);
                hoursWorked = hoursData.formatted;
            } catch (e) {
                hoursWorked = 'N/A';
            }
        }

        if (hasClockIn) {
            totalPresent++;
            if (status === 'Late') totalLate++;
        } else {
            totalAbsent++;
        }

        let statusClass = 'present';
        if (status === 'Late') statusClass = 'late';
        if (status === 'Absent') statusClass = 'absent';

        html += `
            <tr>
                <td>${formattedDate}</td>
                <td>${dayName.substring(0, 3)}</td>
                <td>${formatTimeToAMPM(record.clockIn) || 'N/A'}</td>
                <td>${formatTimeToAMPM(record.clockOut) || 'N/A'}</td>
                <td>${hoursWorked}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
            </tr>
        `;
    });

    recordsTableBody.innerHTML = html;

    const totalDays = totalPresent + totalAbsent;
    if (document.getElementById('totalPresentDays')) document.getElementById('totalPresentDays').textContent = totalPresent;
    if (document.getElementById('totalAbsentDays')) document.getElementById('totalAbsentDays').textContent = totalAbsent;
    if (document.getElementById('totalLateDays')) document.getElementById('totalLateDays').textContent = totalLate;
    if (document.getElementById('totalDays')) document.getElementById('totalDays').textContent = totalDays;
}

async function fetchCurrentUserAttendanceRecords() {
    const q = query(
        collection(db, 'attendance'),
        where('userId', '==', auth.currentUser.uid)
    );
    const querySnapshot = await getDocs(q);
    const records = [];
    querySnapshot.forEach((doc) => records.push(doc.data()));
    return records;
}

async function loadAllRecords() {
    try {
        const allRecords = await fetchCurrentUserAttendanceRecords();
        const userCreatedAt = await getUserCreatedAtDate();
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const recordsInRange = buildComputedDailyRecords(allRecords, userCreatedAt, today, userCreatedAt);
        renderMyRecordsTable(recordsInRange, 'No attendance records found');

        const filterBtn = document.getElementById('filterBtn');
        const monthFilter = document.getElementById('recordsMonthFilter');
        if (filterBtn) {
            filterBtn.addEventListener('click', async () => {
                const selectedMonth = monthFilter.value;
                if (selectedMonth) {
                    await filterRecordsByMonth(selectedMonth);
                } else {
                    await loadAllRecords();
                }
            });
        }

    } catch (error) {
        console.error('Error loading all records:', error);
    }
}

async function filterRecordsByMonth(monthString) {
    try {
        const [year, month] = monthString.split('-').map(Number);
        const userCreatedAt = await getUserCreatedAtDate();
        const allRecords = await fetchCurrentUserAttendanceRecords();

        const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const effectiveEnd = monthEnd > today ? today : monthEnd;

        if (effectiveEnd < monthStart) {
            renderMyRecordsTable([], 'No records found for this month');
            return;
        }

        const effectiveStart = monthStart < userCreatedAt ? userCreatedAt : monthStart;
        const recordsInRange = buildComputedDailyRecords(allRecords, effectiveStart, effectiveEnd, userCreatedAt);

        renderMyRecordsTable(recordsInRange, 'No records found for this month');

    } catch (error) {
        console.error('Error filtering records:', error);
    }
}

// ===========================
// MY PROFILE MODULE
// ===========================

async function loadMyProfileData() {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const profileInfo = await resolveEmployeeProfileInfo(user.uid);
        const data = profileInfo.data || {};

        const fullName = data.fullName || data.name || '';
        const tagging = data.ltisc || data.tagging || '';
        const department = data.department || data.site || '';
        const designation = data.designation || '';
        const email = data.email || user.email || '';

        if (document.getElementById('fullName')) document.getElementById('fullName').value = fullName;
        if (document.getElementById('ltiscTagging')) document.getElementById('ltiscTagging').value = tagging;
        if (document.getElementById('departmentSite')) document.getElementById('departmentSite').value = department;
        if (document.getElementById('assignedDesignation')) document.getElementById('assignedDesignation').value = designation;
        if (document.getElementById('currentEmail')) document.getElementById('currentEmail').value = email;

        setupProfileEditing();
    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

async function resolveEmployeeProfileInfo(userId) {
    const collectionsToCheck = ['employees', 'users'];

    for (const collectionName of collectionsToCheck) {
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
        ref: doc(db, 'employees', userId),
        collection: 'employees',
        data: {}
    };
}

function setupProfileEditing() {
    const editProfileBtn = document.getElementById('editProfileBtn');
    const editPasswordBtn = document.getElementById('editPasswordBtn');
    const editProfileModal = document.getElementById('editProfileModal');
    const closeEditProfileModal = document.getElementById('closeEditProfileModal');
    const cancelEditProfileBtn = document.getElementById('cancelEditProfileBtn');
    const editProfileForm = document.getElementById('editProfileForm');

    if (editProfileBtn && !editProfileBtn.dataset.bound) {
        editProfileBtn.dataset.bound = 'true';
        editProfileBtn.addEventListener('click', async function() {
            const user = auth.currentUser;
            if (!user) {
                await showMessage('Error', 'User session not found. Please login again.');
                return;
            }

            const profileInfo = await resolveEmployeeProfileInfo(user.uid);
            const profileData = profileInfo.data || {};

            document.getElementById('editFullName').value = profileData.fullName || profileData.name || '';
            document.getElementById('editLtiscTagging').value = profileData.ltisc || profileData.tagging || '';
            document.getElementById('editCurrentEmail').value = profileData.email || user.email || '';
            
            await populateDepartmentDropdown(profileData.department || profileData.site || '');
            await populateDesignationDropdown(profileData.designation || '');
            
            editProfileModal.classList.add('active');
        });
    }

    async function populateDepartmentDropdown(currentDept) {
        try {
            const selectElement = document.getElementById('editDepartmentSite');
            const querySnapshot = await getDocs(collection(db, 'sites'));
            
            while (selectElement.options.length > 1) {
                selectElement.remove(1);
            }

            const departments = new Set();
            querySnapshot.forEach((doc) => {
                const site = doc.data();
                if (site.siteName) {
                    departments.add(site.siteName);
                }
            });

            departments.forEach((dept) => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                selectElement.appendChild(option);
            });

            if (currentDept) {
                selectElement.value = currentDept;
            }
        } catch (error) {
            console.error('Error loading departments:', error);
        }
    }

    async function populateDesignationDropdown(currentDesignation) {
        try {
            const selectElement = document.getElementById('editAssignedDesignation');
            const querySnapshot = await getDocs(collection(db, 'designations'));
            
            while (selectElement.options.length > 1) {
                selectElement.remove(1);
            }

            querySnapshot.forEach((doc) => {
                const designation = doc.data();
                if (designation.designationName) {
                    const option = document.createElement('option');
                    option.value = designation.designationName;
                    option.textContent = designation.designationName;
                    selectElement.appendChild(option);
                }
            });

            if (currentDesignation) {
                selectElement.value = currentDesignation;
            }
        } catch (error) {
            console.error('Error loading designations:', error);
        }
    }

    if (closeEditProfileModal && !closeEditProfileModal.dataset.bound) {
        closeEditProfileModal.dataset.bound = 'true';
        closeEditProfileModal.addEventListener('click', function() {
            editProfileModal.classList.remove('active');
        });
    }

    if (cancelEditProfileBtn && !cancelEditProfileBtn.dataset.bound) {
        cancelEditProfileBtn.dataset.bound = 'true';
        cancelEditProfileBtn.addEventListener('click', function() {
            editProfileModal.classList.remove('active');
        });
    }

    if (!window.__employeeProfileModalOutsideClickBound) {
        window.__employeeProfileModalOutsideClickBound = true;
        window.addEventListener('click', function(event) {
            if (event.target === editProfileModal) {
                editProfileModal.classList.remove('active');
            }
        });
    }

    if (editProfileForm && !editProfileForm.dataset.bound) {
        editProfileForm.dataset.bound = 'true';
        editProfileForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            try {
                const user = auth.currentUser;
                if (!user) {
                    await showMessage('Error', 'User session not found. Please login again.');
                    return;
                }

                const updatedName = document.getElementById('editFullName').value;
                const updatedTagging = document.getElementById('editLtiscTagging').value;
                const updatedDepartment = document.getElementById('editDepartmentSite').value;
                const updatedDesignation = document.getElementById('editAssignedDesignation').value;
                const updatedEmail = document.getElementById('editCurrentEmail').value;

                if (!updatedName || !updatedDepartment || !updatedDesignation || !updatedEmail) {
                    await showMessage('Validation Error', 'Please fill in all required fields');
                    return;
                }

                const profileInfo = await resolveEmployeeProfileInfo(user.uid);
                await setDoc(profileInfo.ref, {
                    fullName: updatedName,
                    name: updatedName,
                    ltisc: updatedTagging,
                    tagging: updatedTagging,
                    department: updatedDepartment,
                    site: updatedDepartment,
                    designation: updatedDesignation,
                    email: updatedEmail,
                    updatedAt: serverTimestamp()
                }, { merge: true });

                await logActivity('Profile Updated', `Profile updated successfully`, 'success');

                editProfileModal.classList.remove('active');
                
                await showMessage('Success', 'Profile updated successfully!');
                
                loadMyProfileData();
            } catch (error) {
                console.error('Error updating profile:', error);
                await logActivity('Profile Updated', `Failed: ${error.message}`, 'failed');
                await showMessage('Error', 'Error updating profile: ' + error.message);
            }
        });
    }

    if (editPasswordBtn && !editPasswordBtn.dataset.bound) {
        editPasswordBtn.dataset.bound = 'true';
        const changePasswordModal = document.getElementById('changePasswordModal');
        const closeChangePasswordModal = document.getElementById('closeChangePasswordModal');
        const cancelChangePasswordBtn = document.getElementById('cancelChangePasswordBtn');
        const changePasswordForm = document.getElementById('changePasswordForm');

        editPasswordBtn.addEventListener('click', function() {
            document.getElementById('modalCurrentPassword').value = '';
            document.getElementById('modalNewPassword').value = '';
            document.getElementById('modalConfirmPassword').value = '';
            
            changePasswordModal.classList.add('active');
        });

        if (closeChangePasswordModal && !closeChangePasswordModal.dataset.bound) {
            closeChangePasswordModal.dataset.bound = 'true';
            closeChangePasswordModal.addEventListener('click', function() {
                changePasswordModal.classList.remove('active');
            });
        }

        if (cancelChangePasswordBtn && !cancelChangePasswordBtn.dataset.bound) {
            cancelChangePasswordBtn.dataset.bound = 'true';
            cancelChangePasswordBtn.addEventListener('click', function() {
                changePasswordModal.classList.remove('active');
            });
        }

        if (!window.__employeePasswordModalOutsideClickBound) {
            window.__employeePasswordModalOutsideClickBound = true;
            window.addEventListener('click', function(event) {
                if (event.target === changePasswordModal) {
                    changePasswordModal.classList.remove('active');
                }
            });
        }

        if (changePasswordForm && !changePasswordForm.dataset.bound) {
            changePasswordForm.dataset.bound = 'true';
            changePasswordForm.addEventListener('submit', async function(e) {
                e.preventDefault();

                try {
                    const currentPassword = document.getElementById('modalCurrentPassword').value;
                    const newPassword = document.getElementById('modalNewPassword').value;
                    const confirmPassword = document.getElementById('modalConfirmPassword').value;

                    if (!currentPassword || !newPassword || !confirmPassword) {
                        await showMessage('Validation Error', 'Please fill in all password fields');
                        return;
                    }

                    if (newPassword !== confirmPassword) {
                        await showMessage('Password Mismatch', 'New password and confirm password do not match');
                        return;
                    }

                    if (newPassword.length < 6) {
                        await showMessage('Weak Password', 'New password must be at least 6 characters long');
                        return;
                    }

                    if (currentPassword === newPassword) {
                        await showMessage('Same Password', 'New password must be different from current password');
                        return;
                    }

                    const user = auth.currentUser;
                    
                    if (!user || !user.email) {
                        await showMessage('Error', 'Error: Unable to verify user account');
                        return;
                    }

                    const credential = EmailAuthProvider.credential(user.email, currentPassword);
                    await reauthenticateWithCredential(user, credential);
                    await updatePassword(user, newPassword);

                    try {
                        const profileInfo = await resolveEmployeeProfileInfo(user.uid);
                        await setDoc(profileInfo.ref, {
                            passwordUpdatedAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    } catch (profileSaveError) {
                        console.warn('Password changed in Auth, but profile timestamp update failed:', profileSaveError);
                    }

                    await logActivity('Password Changed', `Password changed successfully`, 'success');

                    await showMessage('Success', 'Password changed successfully!');
                    
                    document.getElementById('modalCurrentPassword').value = '';
                    document.getElementById('modalNewPassword').value = '';
                    document.getElementById('modalConfirmPassword').value = '';
                    changePasswordModal.classList.remove('active');
                } catch (error) {
                    console.error('Error changing password:', error);
                    
                    const errorDetail = error.code === 'auth/wrong-password' ? 'Wrong current password' :
                                      error.code === 'auth/invalid-credential' ? 'Invalid credentials' :
                                      error.code === 'auth/weak-password' ? 'Weak password' :
                                      error.code === 'auth/requires-recent-login' ? 'Session expired' :
                                      error.message;
                    
                    await logActivity('Password Changed', `Failed: ${errorDetail}`, 'failed');

                    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        await showMessage('Error', 'Current password is incorrect. Please try again.');
                    } else if (error.code === 'auth/weak-password') {
                        await showMessage('Error', 'Password is too weak. Please use a stronger password.');
                    } else if (error.code === 'auth/requires-recent-login') {
                        await showMessage('Error', 'Session has expired. Please logout and login again.');
                    } else {
                        await showMessage('Error', 'Error changing password: ' + error.message);
                    }
                }
            });
        }
    }
}

// ===========================
// INITIALIZE ON PAGE LOAD
// ===========================

document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.nav-item');
    const MenuBtn = document.getElementById('menuBtn');
    const sidebar = document.querySelector('.sidebar');
    const logoutBtn = document.getElementById('logoutBtn');
    const moduleTitles = {
        'dashboard': 'Dashboard',
        'attendance': 'Attendance',
        'my-records': 'My Records',
        'my-profile': 'My Profile'
    };

    setTimeout(() => {
        setupQuickActionButtons();
    }, 100);

    setInterval(() => {
        loadTodayAttendance();
        loadMonthlyStats();
    }, 5 * 60 * 1000);

    let currentUserId = null;
    let currentUserData = null;

    // Check if user is already logged in and initialize if needed
    const checkUserAndInitialize = async () => {
        const user = auth.currentUser;
        if (user) {
            currentUserId = user.uid;
            await loadEmployeeProfile();
            await initializeDashboard();
        } else {
            window.location.href = 'login.html';
        }
    };

    // Track if initialization has already run to prevent duplicates
    let isInitialized = false;
    
    async function performInitialization() {
        if (isInitialized) {
            console.log('⏭️ Initialization already completed, skipping...');
            return;
        }
        
        console.log('🚀 Starting initialization...');
        try {
            await loadEmployeeProfile();
            console.log('✅ Employee profile loaded');
            await initializeDashboard();
            console.log('✅ Dashboard initialized');
            isInitialized = true;
        } catch (err) {
            console.error('❌ Error in initialization:', err);
            // Show error to user
            const employeeNameEl = document.getElementById('employeeName');
            if (employeeNameEl) {
                employeeNameEl.textContent = 'Error loading data';
            }
        }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            console.log('✓ Auth state changed - user logged in:', user.uid);
            // Small delay to ensure DOM is fully ready
            setTimeout(() => performInitialization(), 100);
        } else {
            console.warn('⚠️ Auth state changed - user NOT logged in, redirecting...');
            window.location.href = 'login.html';
        }
    });
    
    // Safety timeout: if not initialized after 10 seconds, show error
    setTimeout(() => {
        if (!isInitialized) {
            console.error('⏱️ Initialization timeout - data failed to load after 10 seconds');
            const employeeNameEl = document.getElementById('employeeName');
            const ltiscTagEl = document.getElementById('ltiscTag');
            const employeeSiteEl = document.getElementById('employeeSite');
            
            if (employeeNameEl && employeeNameEl.textContent === 'Loading...') {
                employeeNameEl.textContent = 'Failed to load';
            }
            if (ltiscTagEl && ltiscTagEl.textContent === 'LOADING...') {
                ltiscTagEl.textContent = 'ERROR';
                ltiscTagEl.style.background = '#ff6b6b';
            }
            if (employeeSiteEl && employeeSiteEl.textContent.includes('Loading')) {
                employeeSiteEl.textContent = 'Site: Unable to load';
            }
            
            // Try one more time
            console.log('🔄 Attempting re-initialization...');
            if (auth.currentUser) {
                performInitialization();
            }
        }
    }, 10000);

    async function loadEmployeeWelcome() {
        try {
            const user = auth.currentUser;
            if (!user) {
                console.warn('No current user for loadEmployeeWelcome');
                return;
            }
            
            console.log('loadEmployeeWelcome: Fetching user data for:', user.uid);
            
            let userData = {};
            try {
                userData = await getMergedEmployeeUserData(user.uid);
                console.log('loadEmployeeWelcome: merged user data:', userData);
            } catch (err) {
                console.error('loadEmployeeWelcome: Firestore error:', err);
            }
            
            const employeeName = userData.fullName 
                ? userData.fullName.split(' ')[0]
                : (user.displayName ? user.displayName.split(' ')[0] : user.email?.split('@')[0] || 'Employee');
            
            const employeeNameElement = document.getElementById('employeeName');
            if (employeeNameElement) {
                employeeNameElement.textContent = employeeName;
                console.log('✓ Welcome name updated to:', employeeName);
            }
            
            const ltiscTag = document.getElementById('ltiscTag');
            if (ltiscTag) {
                const ltiscValue = userData.ltisc || 'LTISC';
                ltiscTag.textContent = ltiscValue;
                console.log('✓ LTISC tag updated to:', ltiscValue);
            }
            
            const employeeSiteElement = document.getElementById('employeeSite');
            if (employeeSiteElement) {
                const site = getAssignedSiteFromUserData(userData) || 'Main Office';
                employeeSiteElement.textContent = `Site: ${site}`;
                console.log('✓ Site updated to:', site);
            }
        } catch (error) {
            console.error('Error in loadEmployeeWelcome:', error);
        }
    }

    async function loadEmployeeProfile() {
        try {
            const user = auth.currentUser;
            if (!user) return;

            currentUserData = await getMergedEmployeeUserData(user.uid);
            if (currentUserData && Object.keys(currentUserData).length > 0) {
                console.log('✓ Loaded merged profile data');
            } else {
                console.warn('⚠️ No profile found in either collection');
            }
        } catch (error) {
            console.error('Error loading employee profile:', error);
        }
    }

    if (MenuBtn) {
        MenuBtn.addEventListener('click', function() {
            sidebar.classList.toggle('mobile-hidden');
        });
    }

    const syncEmployeeSidebarForViewport = () => {
        if (!sidebar) return;
        if (window.innerWidth <= 768) {
            sidebar.classList.add('mobile-hidden');
        } else {
            sidebar.classList.remove('mobile-hidden');
        }
    };

    syncEmployeeSidebarForViewport();
    window.addEventListener('resize', syncEmployeeSidebarForViewport);

    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();

            const module = this.getAttribute('data-module');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.module-content').forEach(content => {
                content.classList.remove('active');
            });

            const moduleContent = document.getElementById(module);
            if (moduleContent) {
                moduleContent.classList.add('active');
            }

            if (window.innerWidth <= 768) {
                sidebar.classList.add('mobile-hidden');
            }

            if (module === 'dashboard') {
                loadEmployeeWelcome();
            } else if (module === 'attendance') {
                loadAttendanceData();
            } else if (module === 'my-records') {
                loadMyRecordsData();
            } else if (module === 'my-profile') {
                loadMyProfileData();
            }
        });
    });

    const logoutConfirmModal = document.getElementById('logoutConfirmModal');
    const closeLogoutModal = document.getElementById('closeLogoutModal');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            logoutConfirmModal.classList.add('active');
        });
    }

    if (closeLogoutModal) {
        closeLogoutModal.addEventListener('click', function() {
            logoutConfirmModal.classList.remove('active');
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', function() {
            logoutConfirmModal.classList.remove('active');
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', function() {
            window.location.href = 'login.html';
        });
    }

    window.addEventListener('click', function(event) {
        if (event.target === logoutConfirmModal) {
            logoutConfirmModal.classList.remove('active');
        }
    });
});
