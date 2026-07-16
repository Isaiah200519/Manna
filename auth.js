import { initFirebase } from './firebase-config.js';

export function setupAuthRouter(options = {}) {
    const { onRoleResolved } = options;
    const firebase = initFirebase();
    const auth = firebase.auth;
    const firestore = firebase.db;
    let shouldRedirectAfterAuth = false;
    let phoneConfirmation = null;
    let phoneRecaptchaVerifier = null;
    let activePhoneFlow = 'login';

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
    const showResetButton = document.getElementById('showResetButton');
    const passwordResetForm = document.getElementById('passwordResetForm');
    const resetPasswordButton = document.getElementById('resetPasswordButton');
    const resetGoogleButton = document.getElementById('resetGoogleButton');
    const resetIdentifierInput = document.getElementById('resetIdentifier');
    const resetPhoneSendButton = document.getElementById('resetPhoneSendButton');
    const resetPhoneVerifyButton = document.getElementById('resetPhoneVerifyButton');
    const resetPhoneNumberInput = document.getElementById('resetPhoneNumber');
    const resetPhoneOtpInput = document.getElementById('resetPhoneOtp');
    const resetPhoneOtpGroup = document.getElementById('resetPhoneOtpGroup');
    const loginGoogleButton = document.getElementById('loginGoogleButton');
    const registerGoogleButton = document.getElementById('registerGoogleButton');
    const showLoginPhoneModalButton = document.getElementById('showLoginPhoneModal');
    const showRegisterPhoneModalButton = document.getElementById('showRegisterPhoneModal');
    const showResetPhoneModalButton = document.getElementById('showResetPhoneModal');
    const loginPhoneModal = document.getElementById('loginPhoneModal');
    const registerPhoneModal = document.getElementById('registerPhoneModal');
    const resetPhoneModal = document.getElementById('resetPhoneModal');
    const loginPhoneSendButton = document.getElementById('loginPhoneSendButton');
    const loginPhoneVerifyButton = document.getElementById('loginPhoneVerifyButton');
    const loginPhoneNumberInput = document.getElementById('loginPhoneNumber');
    const loginPhoneOtpInput = document.getElementById('loginPhoneOtp');
    const loginPhoneOtpGroup = document.getElementById('loginPhoneOtpGroup');
    const registerPhoneSendButton = document.getElementById('registerPhoneSendButton');
    const registerPhoneVerifyButton = document.getElementById('registerPhoneVerifyButton');
    const registerPhoneNumberInput = document.getElementById('registerPhoneNumber');
    const registerPhoneOtpInput = document.getElementById('registerPhoneOtp');
    const registerPhoneOtpGroup = document.getElementById('registerPhoneOtpGroup');
    const phoneRecaptchaContainer = document.getElementById('phoneRecaptchaContainer');

    if (!loginForm || !registerForm || !auth || !firestore) return;

    function setAuthMessage(message) {
        if (authMessage) {
            authMessage.textContent = message;
        }
    }

    function resetPhoneFlow() {
        phoneConfirmation = null;
        activePhoneFlow = 'login';
        if (loginPhoneOtpGroup) loginPhoneOtpGroup.classList.add('hidden');
        if (registerPhoneOtpGroup) registerPhoneOtpGroup.classList.add('hidden');
        if (resetPhoneOtpGroup) resetPhoneOtpGroup.classList.add('hidden');
    }

    function ensurePhoneRecaptcha() {
        if (!phoneRecaptchaVerifier && phoneRecaptchaContainer && window.firebase?.auth?.RecaptchaVerifier) {
            phoneRecaptchaVerifier = new window.firebase.auth.RecaptchaVerifier(phoneRecaptchaContainer, {
                size: 'invisible',
                callback: () => {
                    setAuthMessage('Phone verification ready.');
                },
                'expired-callback': () => {
                    setAuthMessage('Phone verification expired. Please try again.');
                }
            });
        }
        return phoneRecaptchaVerifier;
    }

    async function persistUserProfile(user, role, fallbackName = '') {
        const existingDoc = await firestore.collection('users').doc(user.uid).get();
        const existingProfile = existingDoc.exists ? existingDoc.data() : {};
        const profilePayload = {
            uid: user.uid,
            role: existingProfile.role || role,
            displayName: user.displayName || existingProfile.displayName || fallbackName || user.email || 'New user',
            email: user.email || existingProfile.email || '',
            phoneNumber: user.phoneNumber || existingProfile.phoneNumber || '',
            photoURL: user.photoURL || existingProfile.photoURL || '',
            provider: user.providerData?.[0]?.providerId || existingProfile.provider || 'email',
            updatedAt: new Date()
        };
        if (!existingDoc.exists) {
            profilePayload.createdAt = new Date();
        }
        await firestore.collection('users').doc(user.uid).set(profilePayload, { merge: true });
        return profilePayload;
    }

    async function finishAuthFlow(user, role, fallbackName = '', message = 'Signed in successfully.') {
        shouldRedirectAfterAuth = true;
        await persistUserProfile(user, role, fallbackName);
        setAuthMessage(message);
    }

    async function handleGoogleAuth(mode) {
        const role = document.getElementById('registerRole').value;
        const label = mode === 'register' ? 'Create your account' : 'sign in';
        setAuthMessage(`Connecting your Google account for ${label}...`);
        try {
            const provider = new window.firebase.auth.GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            await finishAuthFlow(user, role, user.displayName || user.email || 'Google user', mode === 'register' ? 'Google account ready. Signing you in...' : 'Signed in with Google.');
        } catch (error) {
            shouldRedirectAfterAuth = false;
            setAuthMessage(error.message);
        }
    }

    async function sendPhoneCode(flow, phoneNumber) {
        if (!phoneNumber) {
            setAuthMessage('Please enter a phone number with your country code.');
            return;
        }
        activePhoneFlow = flow;
        const verifier = ensurePhoneRecaptcha();
        if (!verifier) {
            setAuthMessage('Phone verification is unavailable right now.');
            return;
        }
        try {
            const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifier);
            phoneConfirmation = confirmationResult;
            if (flow === 'register') {
                if (registerPhoneOtpGroup) registerPhoneOtpGroup.classList.remove('hidden');
                if (loginPhoneOtpGroup) loginPhoneOtpGroup.classList.add('hidden');
            } else {
                if (loginPhoneOtpGroup) loginPhoneOtpGroup.classList.remove('hidden');
                if (registerPhoneOtpGroup) registerPhoneOtpGroup.classList.add('hidden');
            }
            setAuthMessage('SMS code sent. Enter the verification code below.');
        } catch (error) {
            setAuthMessage(error.message);
        }
    }

    async function verifyPhoneCode(code) {
        if (!phoneConfirmation || !code) {
            setAuthMessage('Enter the SMS code that was sent to your phone.');
            return;
        }
        try {
            const result = await phoneConfirmation.confirm(code);
            const user = result.user;
            const role = document.getElementById('registerRole').value;
            const message = activePhoneFlow === 'register'
                ? 'Phone registration complete. Signing you in...'
                : activePhoneFlow === 'reset'
                    ? 'Phone verification complete. You can now continue with your account.'
                    : 'Signed in with your phone number.';
            await finishAuthFlow(user, role, user.displayName || user.phoneNumber || 'Phone user', message);
        } catch (error) {
            shouldRedirectAfterAuth = false;
            setAuthMessage(error.message);
        }
    }

    showRegisterButton?.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        showRegisterButton.classList.add('hidden');
        showLoginButton?.classList.remove('hidden');
        passwordResetForm?.classList.add('hidden');
    });

    showLoginButton?.addEventListener('click', () => {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        showRegisterButton.classList.remove('hidden');
        showLoginButton.classList.add('hidden');
        passwordResetForm?.classList.add('hidden');
    });

    showResetButton?.addEventListener('click', () => {
        passwordResetForm?.classList.toggle('hidden');
    });

    showLoginPhoneModalButton?.addEventListener('click', () => {
        loginPhoneModal?.classList.toggle('hidden');
    });

    showRegisterPhoneModalButton?.addEventListener('click', () => {
        registerPhoneModal?.classList.toggle('hidden');
    });

    showResetPhoneModalButton?.addEventListener('click', () => {
        resetPhoneModal?.classList.toggle('hidden');
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) {
            setAuthMessage('Please enter both email and password.');
            return;
        }
        setAuthMessage('Signing you in...');
        shouldRedirectAfterAuth = true;
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            shouldRedirectAfterAuth = false;
            setAuthMessage(error.message);
        }
    });

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = document.getElementById('registerName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const role = document.getElementById('registerRole').value;
        if (!name || !email || !password) {
            setAuthMessage('Please complete the registration form.');
            return;
        }
        setAuthMessage('Creating your account...');
        shouldRedirectAfterAuth = true;
        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            const user = result.user;
            await user.updateProfile({ displayName: name });
            await persistUserProfile(user, role, name, 'Account created. Signing you in...');
            setAuthMessage('Account created. Signing you in...');
        } catch (error) {
            shouldRedirectAfterAuth = false;
            setAuthMessage(error.message);
        }
    });

    loginGoogleButton?.addEventListener('click', () => {
        handleGoogleAuth('login');
    });

    registerGoogleButton?.addEventListener('click', () => {
        handleGoogleAuth('register');
    });

    loginPhoneSendButton?.addEventListener('click', () => {
        sendPhoneCode('login', loginPhoneNumberInput?.value.trim());
    });

    registerPhoneSendButton?.addEventListener('click', () => {
        sendPhoneCode('register', registerPhoneNumberInput?.value.trim());
    });

    loginPhoneVerifyButton?.addEventListener('click', () => {
        verifyPhoneCode(loginPhoneOtpInput?.value.trim());
    });

    registerPhoneVerifyButton?.addEventListener('click', () => {
        verifyPhoneCode(registerPhoneOtpInput?.value.trim());
    });

    resetPhoneSendButton?.addEventListener('click', () => {
        sendPhoneCode('reset', resetPhoneNumberInput?.value.trim());
    });

    resetPhoneVerifyButton?.addEventListener('click', () => {
        verifyPhoneCode(resetPhoneOtpInput?.value.trim());
    });

    resetPasswordButton?.addEventListener('click', async () => {
        const identifier = resetIdentifierInput?.value.trim();
        if (!identifier) {
            setAuthMessage('Enter an email address, phone number, or use Google to recover your account.');
            return;
        }
        if (identifier.includes('@')) {
            try {
                await auth.sendPasswordResetEmail(identifier);
                setAuthMessage('Password reset email sent. Check your inbox.');
            } catch (error) {
                setAuthMessage(error.message);
            }
            return;
        }
        if (/^\+?[0-9\s-]{7,15}$/.test(identifier)) {
            if (resetPhoneOtpGroup) resetPhoneOtpGroup.classList.remove('hidden');
            await sendPhoneCode('reset', identifier);
            return;
        }
        setAuthMessage('Please use the Google option above to continue with your Google account.');
    });

    resetGoogleButton?.addEventListener('click', () => {
        handleGoogleAuth('login');
    });

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            shouldRedirectAfterAuth = false;
            resetPhoneFlow();
            return;
        }
        if (!shouldRedirectAfterAuth) return;
        try {
            const doc = await firestore.collection('users').doc(user.uid).get();
            const profile = doc.exists ? doc.data() : null;
            const role = profile?.role || 'customer';
            if (typeof onRoleResolved === 'function') {
                onRoleResolved(role);
            }
        } catch (error) {
            setAuthMessage(error.message);
        }
    });

    seedButton?.addEventListener('click', async () => {
        if (typeof window.seedDatabase === 'function') {
            await window.seedDatabase();
            setAuthMessage('Demo data seeded.');
        }
    });
}
