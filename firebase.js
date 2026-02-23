// ============================================================
// LTISC PURCHASING SYSTEM - FIREBASE CONFIGURATION
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, 
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
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ========== FIREBASE CONFIGURATION (LEADTECHINVENTORY - MAIN PROJECT) ==========
const firebaseConfig = {
  apiKey: "AIzaSyBnmVHGcybXtpHjtAnWatSByDKTa28Nuik",
  authDomain: "leadtechinventory.firebaseapp.com",
  projectId: "leadtechinventory",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Services
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// USER MANAGEMENT - Functions to handle user data in database
// ============================================================

/**
 * FUNCTION: ensureUserExists
 * PURPOSE: Creates a user profile in Firestore if it doesn't already exist
 * PARAMETERS:
 *   - userId: Unique identifier for the user (Firebase Auth UID)
 *   - email: User's email address
 *   - displayName: User's display name (optional, defaults to email prefix)
 * WHAT IT DOES:
 *   1. Checks if user already exists in "admin_user" collection
 *   2. If not found, creates new user document with email, role, and name
 *   3. Sets creation timestamp automatically
 * RETURNS: Nothing (void) - creates document in database
 */
export async function ensureUserExists(userId, email, displayName) {
    try {
        const userRef = doc(db, "admin_user", userId);
        const userSnap = await getDocs(query(collection(db, "admin_user"), where("email", "==", email)));
        if (userSnap.empty) {
            try {
                await setDoc(userRef, {
                    email: email,
                    role: "admin",
                    name: displayName || email.split("@")[0],
                    createdAt: serverTimestamp()
                });
                console.log("✅ User profile created in Firestore");
            } catch (firestoreError) {
                console.warn("⚠️ Could not create user profile (check Firestore security rules):", firestoreError.message);
            }
        } else {
            console.log("✅ User already exists in Firestore");
        }
    } catch (error) {
        console.error("Error checking user:", error);
    }
}

/**
 * FUNCTION: saveUserSession
 * PURPOSE: Stores user information in the browser's localStorage for persistent login
 * PARAMETERS:
 *   - userId: Unique identifier for the user
 *   - email: User's email address
 *   - displayName: User's display name to show in interface
 * WHAT IT DOES:
 *   Saves user credentials locally so user stays logged in even after page refresh
 * RETURNS: Nothing (void)
 */
export function saveUserSession(userId, email, displayName) {
    localStorage.setItem("user_id", userId);
    localStorage.setItem("email", email);
    localStorage.setItem("display_name", displayName || email.split("@")[0]);
    localStorage.setItem("isLoggedIn", "true");
}

/**
 * FUNCTION: getUserSession
 * PURPOSE: Retrieves the currently logged-in user's information from localStorage
 * PARAMETERS: None
 * WHAT IT DOES:
 *   Reads stored user data from the browser
 * RETURNS: Object containing user_id, email, display_name, and isLoggedIn status
 */
export function getUserSession() {
    return {
        user_id: localStorage.getItem("user_id"),
        email: localStorage.getItem("email"),
        display_name: localStorage.getItem("display_name"),
        isLoggedIn: localStorage.getItem("isLoggedIn") === "true"
    };
}

/**
 * FUNCTION: clearUserSession
 * PURPOSE: Logs out the user by removing their session data and signing them out of Firebase
 * PARAMETERS: None
 * WHAT IT DOES:
 *   1. Removes all user data from localStorage
 *   2. Signs out user from Firebase Authentication
 * RETURNS: Promise (async function)
 */
export async function clearUserSession() {
    localStorage.removeItem("user_id");
    localStorage.removeItem("email");
    localStorage.removeItem("display_name");
    localStorage.removeItem("isLoggedIn");
    await signOut(auth);
}

// ============================================================
// LOGIN AUTHENTICATION - Handle user login and authentication
// ============================================================

/**
 * FUNCTION: loginUser
 * PURPOSE: Authenticates user with email and password, creates profile, and saves session
 * PARAMETERS:
 *   - email: User's email address
 *   - password: User's password
 * WHAT IT DOES:
 *   1. Attempts to sign in user with Firebase Authentication
 *   2. Creates user profile in database if it doesn't exist
 *   3. Saves user session to localStorage for persistent login
 * RETURNS: Firebase user object on success, throws error on failure
 */
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create user profile if it doesn't exist
        await ensureUserExists(user.uid, email, user.displayName);
        
        // Save session
        saveUserSession(user.uid, email, user.displayName);
        
        console.log("✅ User logged in successfully:", email);
        return user;
    } catch (error) {
        console.error("❌ Login failed:", error.message);
        throw error;
    }
}

/**
 * FUNCTION: checkExistingLogin
 * PURPOSE: Checks if user is already logged in (has valid session)
 * PARAMETERS: None
 * WHAT IT DOES:
 *   Checks localStorage for existing user session data
 * RETURNS: true if user is logged in, false otherwise
 */
export function checkExistingLogin() {
    const userId = localStorage.getItem("user_id");
    const isLoggedIn = localStorage.getItem("isLoggedIn");

    if (userId && isLoggedIn === "true") {
        console.log("✅ User already logged in");
        return true;
    }
    return false;
}

// ============================================================
// PRODUCTS MANAGEMENT - CRUD operations for products in purchasing module
// ============================================================

/**
 * FUNCTION: getProducts
 * PURPOSE: Retrieves all products from the database
 * PARAMETERS: None
 * WHAT IT DOES:
 *   Fetches all documents from "products" collection in Firestore
 * RETURNS: Array of product objects with id and data fields
 */
export async function getProducts() {
    try {
        const productsRef = collection(db, "products");
        const querySnapshot = await getDocs(productsRef);
        const products = [];
        querySnapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        console.log("✅ Products fetched:", products.length, "items");
        return products;
    } catch (error) {
        console.error("Error fetching products:", error);
        throw error;
    }
}

/**
 * FUNCTION: addProduct
 * PURPOSE: Creates a new product in the database
 * PARAMETERS:
 *   - productData: Object containing product information (name, price, etc.)
 * WHAT IT DOES:
 *   1. Adds creation timestamp and creator email to product data
 *   2. Stores product in "products" collection
 * RETURNS: ID of newly created product document
 */
export async function addProduct(productData) {
    try {
        const session = getUserSession();
        const docRef = await addDoc(collection(db, "products"), {
            ...productData,
            created_by: session.email,
            created_at: serverTimestamp()
        });
        console.log("✅ Product added with ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding product:", error);
        throw error;
    }
}

/**
 * FUNCTION: updateProduct
 * PURPOSE: Modifies an existing product in the database
 * PARAMETERS:
 *   - productId: Unique identifier of product to update
 *   - productData: Object containing updated product information
 * WHAT IT DOES:
 *   Updates product document with new data and timestamp
 * RETURNS: Nothing (void)
 */
export async function updateProduct(productId, productData) {
    try {
        const productRef = doc(db, "products", productId);
        await updateDoc(productRef, {
            ...productData,
            updated_at: serverTimestamp()
        });
        console.log("✅ Product updated:", productId);
    } catch (error) {
        console.error("Error updating product:", error);
        throw error;
    }
}

/**
 * FUNCTION: deleteProduct
 * PURPOSE: Removes a product from the database
 * PARAMETERS:
 *   - productId: Unique identifier of product to delete
 * WHAT IT DOES:
 *   Permanently removes product document from database
 * RETURNS: Nothing (void)
 */
export async function deleteProduct(productId) {
    try {
        const productRef = doc(db, "products", productId);
        await deleteDoc(productRef);
        console.log("✅ Product deleted:", productId);
    } catch (error) {
        console.error("Error deleting product:", error);
        throw error;
    }
}

// ============================================================
// TRACKING RECORDS MANAGEMENT - Monitor order delivery and status updates
// ============================================================

/**
 * FUNCTION: getTrackingRecords
 * PURPOSE: Retrieves all order tracking records from the database
 * PARAMETERS: None
 * WHAT IT DOES:
 *   Fetches all documents from "tracking" collection
 * RETURNS: Array of tracking record objects
 */
export async function getTrackingRecords() {
    try {
        const trackingRef = collection(db, "tracking");
        const querySnapshot = await getDocs(trackingRef);
        const records = [];
        querySnapshot.forEach(doc => {
            records.push({ id: doc.id, ...doc.data() });
        });
        console.log("✅ Tracking records fetched:", records.length, "items");
        return records;
    } catch (error) {
        console.error("Error fetching tracking records:", error);
        throw error;
    }
}

/**
 * FUNCTION: addTrackingRecord
 * PURPOSE: Creates a new order tracking record
 * PARAMETERS:
 *   - trackingData: Object with order tracking info (status, delivery date, etc.)
 * WHAT IT DOES:
 *   Stores tracking information including who created it and when
 * RETURNS: ID of newly created tracking record
 */
export async function addTrackingRecord(trackingData) {
    try {
        const session = getUserSession();
        const docRef = await addDoc(collection(db, "tracking"), {
            ...trackingData,
            created_by: session.email,
            created_at: serverTimestamp()
        });
        console.log("✅ Tracking record added with ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding tracking record:", error);
        throw error;
    }
}

/**
 * FUNCTION: updateTrackingRecord
 * PURPOSE: Updates an existing tracking record (e.g., change delivery status)
 * PARAMETERS:
 *   - trackingId: ID of tracking record to update
 *   - trackingData: Object with updated tracking information
 * WHAT IT DOES:
 *   Updates tracking details and adds updated timestamp
 * RETURNS: Nothing (void)
 */
export async function updateTrackingRecord(trackingId, trackingData) {
    try {
        const trackingRef = doc(db, "tracking", trackingId);
        await updateDoc(trackingRef, {
            ...trackingData,
            updated_at: serverTimestamp()
        });
        console.log("✅ Tracking record updated:", trackingId);
    } catch (error) {
        console.error("Error updating tracking record:", error);
        throw error;
    }
}

/**
 * FUNCTION: deleteTrackingRecord
 * PURPOSE: Removes a tracking record from the database
 * PARAMETERS:
 *   - trackingId: ID of tracking record to delete
 * WHAT IT DOES:
 *   Permanently removes the tracking record
 * RETURNS: Nothing (void)
 */
export async function deleteTrackingRecord(trackingId) {
    try {
        const trackingRef = doc(db, "tracking", trackingId);
        await deleteDoc(trackingRef);
        console.log("✅ Tracking record deleted:", trackingId);
    } catch (error) {
        console.error("Error deleting tracking record:", error);
        throw error;
    }
}

// ============================================================
// PRICE LIST MANAGEMENT (PURCHASING MODULE)
// ============================================================

export async function getPriceList() {
    try {
        const priceListRef = collection(db, "price_list");
        const querySnapshot = await getDocs(priceListRef);
        const items = [];
        querySnapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });
        console.log("✅ Price list fetched:", items.length, "items");
        return items;
    } catch (error) {
        console.error("Error fetching price list:", error);
        throw error;
    }
}

export async function addPriceListItem(itemData) {
    try {
        const session = getUserSession();
        const docRef = await addDoc(collection(db, "price_list"), {
            ...itemData,
            created_by: session.email,
            created_at: serverTimestamp()
        });
        console.log("✅ Price list item added with ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding price list item:", error);
        throw error;
    }
}

export async function updatePriceListItem(itemId, itemData) {
    try {
        const itemRef = doc(db, "price_list", itemId);
        await updateDoc(itemRef, {
            ...itemData,
            updated_at: serverTimestamp()
        });
        console.log("✅ Price list item updated:", itemId);
    } catch (error) {
        console.error("Error updating price list item:", error);
        throw error;
    }
}

export async function deletePriceListItem(itemId) {
    try {
        const itemRef = doc(db, "price_list", itemId);
        await deleteDoc(itemRef);
        console.log("✅ Price list item deleted:", itemId);
    } catch (error) {
        console.error("Error deleting price list item:", error);
        throw error;
    }
}

// ============================================================
// PROJECT MANAGEMENT (PURCHASING MODULE)
// ============================================================

export async function getProjects() {
    try {
        const projectsRef = collection(db, "projects");
        const querySnapshot = await getDocs(projectsRef);
        const projects = [];
        querySnapshot.forEach(doc => {
            projects.push({ id: doc.id, ...doc.data() });
        });
        console.log("✅ Projects fetched:", projects.length, "projects");
        return projects;
    } catch (error) {
        console.error("Error fetching projects:", error);
        throw error;
    }
}

export async function addProjectRecord(projectData) {
    try {
        const session = getUserSession();
        const docRef = await addDoc(collection(db, "projects"), {
            ...projectData,
            created_by: session.email,
            created_at: serverTimestamp()
        });
        console.log("✅ Project added with ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding project:", error);
        throw error;
    }
}

export async function updateProjectRecord(projectId, projectData) {
    try {
        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, {
            ...projectData,
            updated_at: serverTimestamp()
        });
        console.log("✅ Project updated:", projectId);
    } catch (error) {
        console.error("Error updating project:", error);
        throw error;
    }
}

export async function deleteProjectRecord(projectId) {
    try {
        const projectRef = doc(db, "projects", projectId);
        await deleteDoc(projectRef);
        console.log("✅ Project deleted:", projectId);
    } catch (error) {
        console.error("Error deleting project:", error);
        throw error;
    }
}

// ============================================================
// USER SETTINGS & COLUMN CONFIGURATION (PURCHASING MODULE)
// ============================================================

export async function saveColumnConfiguration(userId, columnConfig) {
    try {
        // If caller didn't supply userId, try Firebase Auth current user as fallback
        let targetUserId = userId;
        try {
            if (!targetUserId && auth && auth.currentUser && auth.currentUser.uid) {
                targetUserId = auth.currentUser.uid;
                console.log('ℹ️ saveColumnConfiguration using auth.currentUser.uid fallback:', targetUserId);
            }
        } catch (authErr) {
            console.warn('⚠️ Could not access auth.currentUser for fallback:', authErr);
        }

        if (!targetUserId) throw new Error('No userId provided and no authenticated user found');

        const userSettingsRef = doc(db, "user_settings", targetUserId);
        
        // Build the update object dynamically to support all column config types
        // Use the resolved targetUserId (fallback to auth.currentUser) so we don't write undefined
        const updateData = {
            updatedAt: serverTimestamp(),
            userId: targetUserId
        };
        
        // Always save standard columns (project details columns)
        if (columnConfig.columnOrder) {
            updateData.columnOrder = columnConfig.columnOrder;
        }
        if (columnConfig.columnVisibility) {
            updateData.columnVisibility = columnConfig.columnVisibility;
        }
        if (columnConfig.columnDisplayNames) {
            updateData.columnDisplayNames = columnConfig.columnDisplayNames;
        }
        
        // NOTE: projectDataColumns are persisted in a dedicated collection (`projectdetails_column`)
        // and should NOT be stored inside `user_settings`. Migration helpers are available.
        
        await setDoc(userSettingsRef, updateData, { merge: true });
        
        console.log("✅ Column configuration saved to Firebase for user:", targetUserId);
        return true;
    } catch (error) {
        console.error("Error saving column configuration:", error);
        throw error;
    }
}

export async function loadColumnConfiguration(userId) {
    try {
        // If caller didn't supply userId, try Firebase Auth current user as fallback
        let targetUserId = userId;
        try {
            if (!targetUserId && auth && auth.currentUser && auth.currentUser.uid) {
                targetUserId = auth.currentUser.uid;
                console.log('ℹ️ loadColumnConfiguration using auth.currentUser.uid fallback:', targetUserId);
            }
        } catch (authErr) {
            console.warn('⚠️ Could not access auth.currentUser for fallback:', authErr);
        }

        if (!targetUserId) {
            console.warn('⚠️ No userId provided and no authenticated user found; aborting load');
            return null;
        }

        const userSettingsRef = doc(db, "user_settings", targetUserId);
        const docSnap = await getDoc(userSettingsRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("✅ Column configuration loaded from Firebase for user:", targetUserId);
            
            // CRITICAL: Return projectDataColumns if it exists
            const config = {
                columnOrder: data.columnOrder || [],
                columnVisibility: data.columnVisibility || {},
                columnDisplayNames: data.columnDisplayNames || {}
            };
            
            // Include projectDataColumns if saved (for "Project Data Details" table)
            if (data.projectDataColumns && Array.isArray(data.projectDataColumns)) {
                config.projectDataColumns = data.projectDataColumns;
                console.log('✅ Found projectDataColumns in Firebase:', data.projectDataColumns);
            }
            
            return config;
        } else {
            console.log("⚠️ No column configuration found for user:", targetUserId);
            return null;
        }
    } catch (error) {
        console.error("Error loading column configuration:", error);
        throw error;
    }
}



// ============================================================
// ACTIVITY LOGS
// ============================================================

export async function getActivityLogs() {
    try {
        const logsRef = collection(db, "activity_logs");
        const querySnapshot = await getDocs(logsRef);
        
        const logs = [];
        querySnapshot.forEach((doc) => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`✅ Retrieved ${logs.length} activity logs from Firebase`);
        return logs;
    } catch (error) {
        console.error("Error getting activity logs:", error);
        return [];
    }
}

export async function addActivityLog(activityData) {
    try {
        const session = getUserSession();
        // Use the user passed in activityData if provided, otherwise fall back to session display_name
        const userDisplay = activityData.user || session?.display_name?.trim() || session?.email?.split('@')[0] || 'Admin';
        
        const logEntry = {
            timestamp: serverTimestamp(),
            timestampFormatted: new Date().toISOString(),
            user: userDisplay,
            userId: session?.user_id,
            activityType: activityData.activityType || 'UNKNOWN',
            action: activityData.action || 'UNKNOWN',
            details: activityData.details || '',
            moduleName: activityData.moduleName || 'PURCHASING',
            recordId: activityData.recordId || null,
            metadata: activityData.metadata || {}
        };
        
        console.log('📝 Creating activity log entry:', logEntry);
        
        const logsRef = collection(db, "activity_logs");
        console.log('📍 Reference to collection:', 'activity_logs');
        
        const docRef = await addDoc(logsRef, logEntry);
        
        console.log(`✅ Activity logged successfully! ID: ${docRef.id}`);
        console.log(`✅ Activity logged: ${logEntry.action} - ${logEntry.details}`);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error adding activity log:", error);
        console.error("Error details:", error.message);
        return null;
    }
}

export async function deleteAllActivityLogs() {
    try {
        const logsRef = collection(db, "activity_logs");
        const querySnapshot = await getDocs(logsRef);
        
        let deleteCount = 0;
        for (const doc of querySnapshot.docs) {
            await deleteDoc(doc.ref);
            deleteCount++;
        }
        
        console.log(`✅ Deleted ${deleteCount} activity logs from Firebase`);
        return deleteCount;
    } catch (error) {
        console.error("❌ Error deleting activity logs:", error);
        return 0;
    }
}

export async function deleteActivityLogById(logId) {
    try {
        const logRef = doc(db, "activity_logs", logId);
        await deleteDoc(logRef);
        console.log(`✅ Activity log ${logId} deleted successfully`);
        return true;
    } catch (error) {
        console.error("❌ Error deleting activity log:", error);
        return false;
    }
}

// ============================================================
// FIREBASE SERVICES EXPORTS
// ============================================================

export {
  // App
  app,
  
  // Auth
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  
  // Firestore
  db,
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
  where,
  serverTimestamp,
};