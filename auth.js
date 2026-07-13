import { initFirebase } from './firebase-config.js';

export function setupAuthRouter(options = {}) {
    const { onRoleResolved } = options;
    const firebase = initFirebase();
    const auth = firebase.auth;
    const firestore = firebase.db;
    if (auth && typeof auth.setPersistence === 'function' && window.firebase?.auth?.Auth?.Persistence) {
        auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
            console.warn('[MANNA] Auth persistence setup failed:', error);
        });
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authMessage = document.getElementById('authMessage');
    const showRegisterButton = document.getElementById('showRegisterButton');
    const showLoginButton = document.getElementById('showLoginButton');
    const seedButton = document.getElementById('seedButton');

    if (!loginForm || !registerForm || !auth || !firestore) return;

    showRegisterButton?.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        showRegisterButton.classList.add('hidden');
        showLoginButton?.classList.remove('hidden');
    });

    showLoginButton?.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        showRegisterButton.classList.remove('hidden');
        showLoginButton.classList.add('hidden');
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            authMessage.textContent = error.message;
        }
    });

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const role = document.getElementById('registerRole').value;
        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            const user = result.user;
            await user.updateProfile({ displayName: name });
            await firestore.collection('users').doc(user.uid).set({
                uid: user.uid,
                role,
                displayName: name,
                email,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            authMessage.textContent = 'Account created. Signing you in...';
        } catch (error) {
            authMessage.textContent = error.message;
        }
    });

    auth.onAuthStateChanged(async (user) => {
        if (!user) return;
        try {
            const doc = await firestore.collection('users').doc(user.uid).get();
            const profile = doc.exists ? doc.data() : null;
            const role = profile?.role || 'customer';
            if (typeof onRoleResolved === 'function') {
                onRoleResolved(role);
            }
        } catch (error) {
            authMessage.textContent = error.message;
        }
    });

    seedButton?.addEventListener('click', async () => {
        if (typeof window.seedDatabase === 'function') {
            await window.seedDatabase();
            authMessage.textContent = 'Demo data seeded.';
        }
    });
}
