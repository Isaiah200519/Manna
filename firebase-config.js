const firebaseConfig = {
    apiKey: 'AIzaSyBv8xoBsZrYvczcjcZAW85t--RG_zShXxQ',
    authDomain: 'manna-8cd1d.firebaseapp.com',
    projectId: 'manna-8cd1d',
    storageBucket: 'manna-8cd1d.firebasestorage.app',
    messagingSenderId: '120769527685',
    appId: '1:120769527685:web:870e7851bf1874c3d74eec',
    measurementId: 'G-74HQY6DRQW'
};

let firebaseApp = null;
let firestore = null;
let auth = null;
let analytics = null;
let initialized = false;

export function initFirebase() {
    if (initialized) return { app: firebaseApp, db: firestore, auth, analytics, ready: Boolean(firebaseApp && firestore) };

    if (typeof window !== 'undefined' && window.firebase && window.firebase.apps?.length) {
        firebaseApp = window.firebase.apps[0];
    } else if (typeof window !== 'undefined' && window.firebase) {
        firebaseApp = window.firebase.initializeApp(firebaseConfig);
    }

    if (firebaseApp) {
        firestore = window.firebase.firestore();
        auth = window.firebase.auth();
        analytics = window.firebase.analytics ? window.firebase.analytics() : null;
        if (auth && window.firebase?.auth?.Auth?.Persistence) {
            auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
                console.warn('[MANNA] Auth persistence setup failed:', error);
            });
        }
        initialized = true;
        console.info(`[MANNA] Firebase connected to project: ${firebaseConfig.projectId}`);
    }

    return { app: firebaseApp, db: firestore, auth, analytics, ready: Boolean(firebaseApp && firestore) };
}

export function ensureAuthPersistence() {
    const { auth } = initFirebase();
    if (!auth || !window.firebase?.auth?.Auth?.Persistence) {
        return Promise.resolve(false);
    }

    return auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
        console.warn('[MANNA] Auth persistence setup failed:', error);
        return false;
    });
}

export function clearStoredAuthState() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('manna-auth');
        sessionStorage.removeItem('manna-auth');
    } catch (error) {
        console.warn('[MANNA] Failed to clear stored auth state:', error);
    }
}

export function isFirebaseReady() {
    return Boolean(firebaseApp && firestore);
}

export function subscribeCollection(collectionName, callback, constraints = []) {
    const { db, ready } = initFirebase();
    if (!ready || !db) return null;

    let ref = db.collection(collectionName);
    constraints.forEach((constraint) => {
        ref = ref.where(constraint.field, constraint.operator, constraint.value);
    });

    return ref.onSnapshot((snapshot) => {
        callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
        console.error(`[MANNA] Firestore snapshot error for ${collectionName}:`, error);
        callback([]);
    });
}

export function addDocument(collectionName, payload) {
    const { db, ready } = initFirebase();
    if (!ready || !db) return Promise.reject(new Error('Firebase unavailable'));
    return db.collection(collectionName).add(payload).catch((error) => {
        console.error(`[MANNA] Failed to add document to ${collectionName}:`, error);
        throw error;
    });
}

export function updateDocument(collectionName, id, payload) {
    const { db, ready } = initFirebase();
    if (!ready || !db) return Promise.reject(new Error('Firebase unavailable'));
    return db.collection(collectionName).doc(id).update(payload).catch((error) => {
        console.error(`[MANNA] Failed to update document in ${collectionName}:`, error);
        throw error;
    });
}

export function deleteDocument(collectionName, id) {
    const { db, ready } = initFirebase();
    if (!ready || !db) return Promise.reject(new Error('Firebase unavailable'));
    return db.collection(collectionName).doc(id).delete().catch((error) => {
        console.error(`[MANNA] Failed to delete document from ${collectionName}:`, error);
        throw error;
    });
}

export function saveDocument(collectionName, payload, id) {
    const { db, ready } = initFirebase();
    if (!ready || !db) return Promise.reject(new Error('Firebase unavailable'));
    if (id) {
        return db.collection(collectionName).doc(id).set(payload, { merge: true }).catch((error) => {
            console.error(`[MANNA] Failed to save document in ${collectionName}:`, error);
            throw error;
        });
    }
    return db.collection(collectionName).add(payload).catch((error) => {
        console.error(`[MANNA] Failed to add document to ${collectionName}:`, error);
        throw error;
    });
}
