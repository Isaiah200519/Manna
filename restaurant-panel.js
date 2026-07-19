import { initFirebase, clearStoredAuthState } from './firebase-config.js';
import { formatCurrency, formatDate, createToast, getImageUrl } from './utils.js';
import { DEFAULT_CATEGORY_TAXONOMY, getCategoryDisplayName, getCategoryOptions } from './category-taxonomy.js';
import { getQRCardHTML, initQRCode, bindQRDownloadHandlers } from './qr-utils.js';

const state = {
    authUser: null,
    restaurantId: null,
    restaurantProfile: null,
    userProfile: null,
    masterProducts: [],
    menuItems: [],
    categories: [],
    orders: [],
    reviews: [],
    promotions: [],
    coupons: [],
    deliveryRequests: [],
    notifications: [],
    settings: {},
    chats: [],
    supportRequests: [],
    deliveryUsers: [],
    activeSection: 'dashboard',
    viewMode: 'grid',
    activeOrderChatId: null,
    orderChatMessages: [],
    orderChatUnsubscribe: null,
    menuFilters: { search: '', category: 'all', availability: 'all', sort: 'name' },
    selectedMenuIds: new Set(),
    orderFilter: 'all',
    catalogFilters: { search: '', category: 'all', status: 'all' },
    isLoading: false
};

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginButton = document.getElementById('loginButton');
const registerButton = document.getElementById('registerButton');
const showRegisterButton = document.getElementById('showRegisterButton');
const showLoginButton = document.getElementById('showLoginButton');
const forgotPasswordButton = document.getElementById('forgotPasswordButton');
const authMessage = document.getElementById('authMessage');
const logoutButton = document.getElementById('logoutButton');
const mobileNavToggle = document.getElementById('mobileNavToggle') || document.getElementById('mobileMenuButton');
const mobileNavSheet = document.getElementById('mobileNavSheet');
const mobileNavClose = document.getElementById('mobileNavClose');
const mobileMenuButton = document.getElementById('mobileMenuButton');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarClose = document.getElementById('sidebarClose');
const navItems = Array.from(document.querySelectorAll('.nav-item[data-section]'));
const sectionPanels = Array.from(document.querySelectorAll('.section-panel'));
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const userBadge = document.getElementById('userBadge');
const supportButton = document.getElementById('supportButton');
const notificationsToggle = document.getElementById('notificationsToggle');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');
const modalClose = document.getElementById('modalClose');

let firebase = null;
let firestore = null;
let auth = null;
let approvalBanner = null;
let authBootstrapTimer = null;

function clearAuthBootstrapTimer() {
    if (authBootstrapTimer) {
        clearTimeout(authBootstrapTimer);
        authBootstrapTimer = null;
    }
}

function scheduleAuthFallback() {
    clearAuthBootstrapTimer();
    authBootstrapTimer = window.setTimeout(() => {
        authBootstrapTimer = null;
        if (!state.authUser && !auth?.currentUser) {
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
        }
    }, 900);
}

function init() {
    bindEvents();
    firebase = initFirebase();
    auth = firebase.auth;
    firestore = firebase.db;
    if (auth) {
        auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => { });
    }
    if (!auth || !firestore) {
        createToast('Firebase is not ready yet. Please refresh the page.', 'error');
        return;
    }
    auth.onAuthStateChanged(handleAuthStateChange);
}

function bindEvents() {
    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);
    showRegisterButton?.addEventListener('click', () => toggleAuthMode(true));
    showLoginButton?.addEventListener('click', () => toggleAuthMode(false));
    forgotPasswordButton?.addEventListener('click', handleForgotPassword);
    logoutButton?.addEventListener('click', handleLogout);
    mobileNavToggle?.addEventListener('click', () => setMobileNavOpen(true));
    if (mobileNavClose) {
        mobileNavClose.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => setMobileNavOpen(true));
    }
    if (mobileNavSheet) {
        mobileNavSheet.addEventListener('click', (event) => {
            if (event.target === mobileNavSheet) {
                setMobileNavOpen(false);
            }
        });
    }
    document.getElementById('mobileLogoutButton')?.addEventListener('click', handleLogout);
    navItems.forEach((button) => {
        button.addEventListener('click', () => {
            const section = button.dataset.section;
            if (section) {
                showSection(section);
                if (window.innerWidth <= 780) {
                    setMobileNavOpen(false);
                }
            }
        });
    });
    syncMobileNavItems();
    updateNotificationBadge();
    document.querySelectorAll('[data-section]').forEach((button) => {
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            state.viewMode = button.dataset.view;
            renderMenu();
        });
    });
    document.getElementById('catalogSearch')?.addEventListener('input', (event) => {
        state.catalogFilters.search = event.target.value.toLowerCase();
        renderCatalog();
    });
    document.getElementById('catalogCategoryFilter')?.addEventListener('change', (event) => {
        state.catalogFilters.category = event.target.value;
        renderCatalog();
    });
    document.getElementById('catalogStatusFilter')?.addEventListener('change', (event) => {
        state.catalogFilters.status = event.target.value;
        renderCatalog();
    });
    document.getElementById('menuSearch')?.addEventListener('input', (event) => {
        state.menuFilters.search = event.target.value.toLowerCase();
        renderMenu();
    });
    document.getElementById('menuCategoryFilter')?.addEventListener('change', (event) => {
        state.menuFilters.category = event.target.value;
        renderMenu();
    });
    document.getElementById('menuAvailabilityFilter')?.addEventListener('change', (event) => {
        state.menuFilters.availability = event.target.value;
        renderMenu();
    });
    document.getElementById('menuSort')?.addEventListener('change', (event) => {
        state.menuFilters.sort = event.target.value;
        renderMenu();
    });
    document.getElementById('orderStatusFilter')?.addEventListener('change', (event) => {
        state.orderFilter = event.target.value;
        renderOrders();
    });
    document.getElementById('saveProfileButton')?.addEventListener('click', saveProfile);
    document.getElementById('saveSettingsButton')?.addEventListener('click', saveSettings);
    supportButton?.addEventListener('click', toggleSupportModal);
    notificationsToggle?.addEventListener('click', () => {
        showSection('notifications');
        if (window.innerWidth <= 780) {
            setMobileNavOpen(false);
        }
    });
    document.getElementById('createPromotionButton')?.addEventListener('click', openPromotionModal);
    document.getElementById('createCouponButton')?.addEventListener('click', openCouponModal);
    document.getElementById('bulkActivateButton')?.addEventListener('click', () => bulkUpdateMenu(true));
    document.getElementById('bulkDeactivateButton')?.addEventListener('click', () => bulkUpdateMenu(false));
    document.getElementById('bulkDeleteButton')?.addEventListener('click', bulkDeleteMenu);
    document.getElementById('chatForm')?.addEventListener('submit', submitChat);
    modalClose?.addEventListener('click', closeModal);
    modalBackdrop?.addEventListener('click', (event) => {
        if (event.target === modalBackdrop) closeModal();
    });
    window.addEventListener('keydown', handleModalEscape);
    const onboardingOverlay = document.getElementById('onboardingOverlay');
    const closeOnboarding = document.getElementById('closeOnboarding');
    if (closeOnboarding) {
        closeOnboarding.addEventListener('click', () => {
            if (onboardingOverlay) {
                onboardingOverlay.classList.add('hidden');
                onboardingOverlay.setAttribute('aria-hidden', 'true');
            }
            localStorage.setItem('manna-onboarding-seen-restaurant', 'true');
        });
    }
    if (onboardingOverlay && !localStorage.getItem('manna-onboarding-seen-restaurant')) {
        onboardingOverlay.classList.remove('hidden');
        onboardingOverlay.setAttribute('aria-hidden', 'false');
    }
}

function setMobileNavOpen(isOpen) {
    if (mobileNavSheet) {
        mobileNavSheet.classList.remove('open');
        mobileNavSheet.setAttribute('aria-hidden', 'true');
    }
    if (sidebar) {
        sidebar.classList.toggle('open', isOpen);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.classList.toggle('open', isOpen);
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ensure mobile nav mirrors desktop nav
function syncMobileNavItems() {
    const mobileList = document.querySelector('.mobile-nav-list');
    if (!mobileList) return;

    const desktopItems = Array.from(document.querySelectorAll('.nav-item[data-section]'))
        .filter((item) => !item.closest('.mobile-nav-list'));

    const preferredSections = [
        'dashboard', 'profile', 'catalog', 'menu', 'orders', 'reviews', 'promotions',
        'coupons', 'analytics', 'notifications', 'settings', 'chat'
    ];

    const sections = Array.from(new Set([...preferredSections, ...desktopItems.map((item) => item.getAttribute('data-section')).filter(Boolean)]));

    mobileList.innerHTML = '';
    sections.forEach((section) => {
        const sourceItem = desktopItems.find((item) => item.getAttribute('data-section') === section);
        const mobileBtn = document.createElement('button');
        mobileBtn.className = 'nav-item mobile-nav-item';
        mobileBtn.setAttribute('data-section', section);
        const icon = sourceItem?.querySelector('.nav-icon')?.innerHTML || '';
        const label = sourceItem?.textContent.trim() || section;
        mobileBtn.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
        mobileList.appendChild(mobileBtn);
    });

    if (!mobileList.dataset.boundMobileNav) {
        mobileList.addEventListener('click', (event) => {
            const button = event.target.closest('.mobile-nav-item[data-section]');
            if (!button) return;
            const section = button.getAttribute('data-section');
            if (section) {
                showSection(section);
                if (window.innerWidth <= 780) {
                    setMobileNavOpen(false);
                }
            }
        });
        mobileList.dataset.boundMobileNav = 'true';
    }
}

function updateNotificationBadge() {
    const count = (state.notifications || []).filter((item) => !item.read).length;
    const sectionBadge = document.getElementById('notificationBadge');
    const headerBadge = document.getElementById('notificationBadgeCount');

    if (sectionBadge) {
        sectionBadge.textContent = count ? `${count} unread` : '0 unread';
    }

    if (headerBadge) {
        headerBadge.textContent = `${count}`;
        headerBadge.classList.toggle('hidden', count === 0);
    }
}

function setActiveNavigation(section) {
    document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-section') === section);
    });
}

function toggleAuthMode(showRegister) {
    loginForm.classList.toggle('hidden', showRegister);
    registerForm.classList.toggle('hidden', !showRegister);
    authMessage.textContent = '';
}

function setAuthPending(isPending, isRegister = false) {
    const button = isRegister ? registerButton : loginButton;
    button.disabled = isPending;
    button.textContent = isPending
        ? (isRegister ? 'Creating account...' : 'Signing in...')
        : (isRegister ? 'Create Account' : 'Sign In');
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        authMessage.textContent = 'Please enter your email and password.';
        return;
    }
    setAuthPending(true);
    try {
        await auth.signInWithEmailAndPassword(email, password);
        createToast('Signed in successfully', 'success');
    } catch (error) {
        authMessage.textContent = error.message;
        createToast(error.message, 'error');
    } finally {
        setAuthPending(false);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const businessName = document.getElementById('registerBusinessName').value.trim();
    const ownerName = document.getElementById('registerOwnerName').value.trim();
    const phone = document.getElementById('registerPhone').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!businessName || !ownerName || !phone || !email || !password) {
        authMessage.textContent = 'Please complete all restaurant registration details.';
        return;
    }

    if (password.length < 6) {
        authMessage.textContent = 'Password must be at least 6 characters.';
        return;
    }

    if (password !== confirmPassword) {
        authMessage.textContent = 'Passwords do not match.';
        return;
    }

    setAuthPending(true, true);
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        await user.updateProfile({ displayName: ownerName });

        await firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            email,
            role: 'restaurant',
            displayName: ownerName,
            createdAt: new Date()
        });

        await firestore.collection('restaurants').doc(user.uid).set({
            ownerUid: user.uid,
            ownerName,
            businessName,
            name: businessName,
            email,
            phone,
            address: '',
            city: '',
            county: '',
            description: '',
            logo: '',
            banner: '',
            openingHours: { open: '08:00', close: '22:00' },
            workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            deliveryRadius: 8,
            estimatedPrepTime: 25,
            acceptedPaymentMethods: ['mobile_money', 'cash'],
            mobileMoneyNumber: '',
            status: 'pending',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        authMessage.textContent = 'Account created. Your restaurant is pending admin approval.';
        createToast('Account created. Your restaurant is pending admin approval.', 'success');
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = password;
        toggleAuthMode(false);
    } catch (error) {
        authMessage.textContent = error.message;
        createToast(error.message, 'error');
    } finally {
        setAuthPending(false, true);
    }
}

async function handleForgotPassword() {
    const email = resolvePasswordResetEmail();
    if (!email) {
        const enteredEmail = prompt('Enter the email linked to your account');
        if (!enteredEmail) return;
        const targetEmail = enteredEmail.trim();
        if (!targetEmail) return;
        try {
            await auth.sendPasswordResetEmail(targetEmail);
            createToast('Password reset email sent.', 'success');
        } catch (error) {
            createToast(error.message || 'Unable to send reset email.', 'error');
        }
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        createToast('Password reset email sent.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to send reset email.', 'error');
    }
}

async function handleLogout() {
    clearAuthBootstrapTimer();
    try {
        await auth.signOut();
    } catch (error) {
        console.warn('[MANNA] Logout warning:', error);
    } finally {
        clearStoredAuthState();
        state.authUser = null;
        state.restaurantId = null;
        state.restaurantProfile = null;
        authScreen.classList.remove('hidden');
        appShell.classList.add('hidden');
        authMessage.textContent = '';
    }
}

async function ensureRestaurantProfile(user, userData) {
    const restaurantIdFromUser = userData?.restaurantId || userData?.restaurantDocId || null;
    if (restaurantIdFromUser) {
        const directDoc = await firestore.collection('restaurants').doc(restaurantIdFromUser).get();
        if (directDoc.exists) {
            return {
                id: directDoc.id,
                data: directDoc.data()
            };
        }
    }

    const queryCandidates = [];
    if (user?.uid) {
        queryCandidates.push(firestore.collection('restaurants').where('ownerUid', '==', user.uid).limit(1));
    }
    if (userData?.email) {
        queryCandidates.push(firestore.collection('restaurants').where('email', '==', userData.email).limit(1));
    }
    if (userData?.businessName) {
        queryCandidates.push(firestore.collection('restaurants').where('businessName', '==', userData.businessName).limit(1));
    }

    for (const query of queryCandidates) {
        const snapshot = await query.get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return {
                id: doc.id,
                data: doc.data()
            };
        }
    }

    const defaultRestaurant = {
        ownerUid: user.uid,
        ownerName: user.displayName || userData?.displayName || userData?.ownerName || userData?.businessName || 'Your Restaurant',
        businessName: userData?.businessName || 'Your Restaurant',
        name: userData?.businessName || 'Your Restaurant',
        email: userData?.email || user.email || '',
        phone: userData?.phone || '',
        address: userData?.address || '',
        city: userData?.city || '',
        county: userData?.county || '',
        description: '',
        logo: '',
        banner: '',
        openingHours: { open: '08:00', close: '22:00' },
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        deliveryRadius: 8,
        estimatedPrepTime: 25,
        acceptedPaymentMethods: ['mobile_money', 'cash'],
        mobileMoneyNumber: '',
        status: userData?.restaurantStatus || userData?.status || 'pending',
        isActive: userData?.isApproved ?? (userData?.restaurantStatus === 'approved' || userData?.status === 'approved'),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const restaurantRef = firestore.collection('restaurants').doc(user.uid);
    await restaurantRef.set(defaultRestaurant, { merge: true });
    return {
        id: restaurantRef.id,
        data: defaultRestaurant
    };
}

async function handleAuthStateChange(user) {
    if (!user) {
        if (state.authUser) {
            clearAuthBootstrapTimer();
            state.authUser = null;
            state.userProfile = null;
            state.restaurantId = null;
            state.restaurantProfile = null;
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            return;
        }
        scheduleAuthFallback();
        return;
    }
    clearAuthBootstrapTimer();
    state.authUser = user;
    userBadge.textContent = user.email || 'Restaurant';
    try {
        const userDocRef = firestore.collection('users').doc(user.uid);
        let userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            await userDocRef.set({ uid: user.uid, email: user.email, role: 'restaurant', createdAt: new Date() });
            userDoc = await userDocRef.get();
        }

        const userData = userDoc.exists ? userDoc.data() : {};
        const role = userData.role || 'restaurant';
        if (role !== 'restaurant') {
            authMessage.textContent = 'This account is not authorized for the restaurant panel.';
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            createToast('Please use the correct panel for this account.', 'warning');
            return;
        }

        const resolvedRestaurant = await ensureRestaurantProfile(user, userData);
        const restaurantData = resolvedRestaurant.data || {};
        const normalizedStatus = restaurantData.status || userData.restaurantStatus || userData.status || 'pending';
        const normalizedProfile = {
            ...restaurantData,
            status: normalizedStatus,
            isActive: restaurantData.isActive ?? (normalizedStatus === 'approved')
        };

        await userDocRef.set({
            uid: user.uid,
            email: userData.email || user.email || '',
            role: 'restaurant',
            displayName: user.displayName || userData.displayName || userData.ownerName || '',
            businessName: restaurantData.businessName || userData.businessName || '',
            ownerName: restaurantData.ownerName || userData.ownerName || user.displayName || '',
            phone: restaurantData.phone || userData.phone || '',
            restaurantId: resolvedRestaurant.id,
            restaurantStatus: normalizedStatus,
            isApproved: normalizedStatus === 'approved',
            updatedAt: new Date()
        }, { merge: true });

        state.userProfile = {
            ...userData,
            uid: user.uid,
            email: userData.email || user.email || '',
            role: 'restaurant',
            displayName: user.displayName || userData.displayName || userData.ownerName || '',
            businessName: restaurantData.businessName || userData.businessName || '',
            ownerName: restaurantData.ownerName || userData.ownerName || user.displayName || '',
            phone: restaurantData.phone || userData.phone || '',
            restaurantId: resolvedRestaurant.id,
            restaurantStatus: normalizedStatus,
            isApproved: normalizedStatus === 'approved'
        };
        state.restaurantId = resolvedRestaurant.id;
        state.restaurantProfile = normalizedProfile;
        authScreen.classList.add('hidden');
        appShell.classList.remove('hidden');
        showSection('dashboard');
        await loadRestaurantData();
    } catch (error) {
        console.error(error);
        createToast(error.message || 'Could not initialize restaurant dashboard.', 'error');
    }
}

function cleanupListeners() {
    [state.restaurantDocUnsubscribe, state.deliveryUsersUnsubscribe, state.menuUnsubscribe, state.ordersUnsubscribe, state.reviewsUnsubscribe, state.promotionsUnsubscribe, state.couponsUnsubscribe, state.notificationsUnsubscribe, state.settingsUnsubscribe, state.chatsUnsubscribe, state.categoriesUnsubscribe, state.orderChatUnsubscribe].forEach((unsubscribe) => {
        if (unsubscribe) unsubscribe();
    });
    state.restaurantDocUnsubscribe = null;
    state.deliveryUsersUnsubscribe = null;
    state.menuUnsubscribe = null;
    state.ordersUnsubscribe = null;
    state.reviewsUnsubscribe = null;
    state.promotionsUnsubscribe = null;
    state.couponsUnsubscribe = null;
    state.notificationsUnsubscribe = null;
    state.settingsUnsubscribe = null;
    state.chatsUnsubscribe = null;
    state.categoriesUnsubscribe = null;
    state.orderChatUnsubscribe = null;
    state.activeOrderChatId = null;
    state.orderChatMessages = [];
}

function setupRealtimeListeners() {
    if (!state.restaurantId) return;
    cleanupListeners();
    state.restaurantDocUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).onSnapshot((doc) => {
        state.restaurantProfile = doc.data() || {};
        renderProfileForm();
        updateApprovalGate();
        renderAll();
    }, (error) => {
        console.error('[MANNA] Restaurant profile listener failed:', error);
    });
    state.categoriesUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('categories').onSnapshot((snapshot) => {
        state.categories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
        renderCategoryFilters();
        renderCatalog();
    }, (error) => {
        console.error('[MANNA] Restaurant categories listener failed:', error);
    });
    state.menuUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('menu').onSnapshot((snapshot) => {
        state.menuItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderMenu();
        renderCatalog();
    }, (error) => {
        console.error('[MANNA] Restaurant menu listener failed:', error);
    });
    state.ordersUnsubscribe = firestore.collection('orders').where('restaurantId', '==', state.restaurantId).onSnapshot((snapshot) => {
        state.orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderOrders();
        renderDashboard();
    }, (error) => {
        console.error('[MANNA] Restaurant orders listener failed:', error);
    });
    state.reviewsUnsubscribe = firestore.collection('reviews').where('restaurantId', '==', state.restaurantId).onSnapshot((snapshot) => {
        state.reviews = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderReviews();
    }, (error) => {
        console.error('[MANNA] Restaurant reviews listener failed:', error);
    });
    state.promotionsUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('promotions').onSnapshot((snapshot) => {
        state.promotions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderPromotions();
    }, (error) => {
        console.error('[MANNA] Restaurant promotions listener failed:', error);
    });
    state.couponsUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('coupons').onSnapshot((snapshot) => {
        state.coupons = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderCoupons();
    }, (error) => {
        console.error('[MANNA] Restaurant coupons listener failed:', error);
    });
    const recipientUid = state.authUser?.uid;
    if (recipientUid) {
        state.notificationsUnsubscribe = firestore.collection('notifications').where('recipientUid', '==', recipientUid).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            state.notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            renderNotifications();
        }, (error) => {
            console.error('[MANNA] Restaurant notifications listener failed:', error);
        });
    } else {
        state.notifications = [];
        renderNotifications();
    }
    firestore.collection('deliveryRequests').where('restaurantId', '==', state.restaurantId).onSnapshot((snapshot) => {
        state.deliveryRequests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderDeliveryRequests();
    }, (error) => {
        console.error('[MANNA] Restaurant delivery requests listener failed:', error);
    });
    state.settingsUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('settings').doc('store').onSnapshot((doc) => {
        state.settings = doc.exists ? doc.data() : {};
        renderSettingsForm();
    }, (error) => {
        console.error('[MANNA] Restaurant settings listener failed:', error);
    });
    state.chatsUnsubscribe = firestore.collection('restaurants').doc(state.restaurantId).collection('chats').onSnapshot((snapshot) => {
        state.chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        renderChat();
    }, (error) => {
        console.error('[MANNA] Restaurant chats listener failed:', error);
    });
    firestore.collection('supportRequests').where('restaurantId', '==', state.restaurantId).onSnapshot((snapshot) => {
        state.supportRequests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderSupportRequests();
    }, (error) => {
        console.error('[MANNA] Restaurant support requests listener failed:', error);
    });
    state.deliveryUsersUnsubscribe = firestore.collection('users').where('role', '==', 'delivery_person').onSnapshot((snapshot) => {
        state.deliveryUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderProfileForm();
    }, (error) => {
        console.error('[MANNA] Delivery users listener failed:', error);
    });
}

async function loadRestaurantData() {
    if (!state.restaurantId) return;
    try {
        await Promise.all([
            loadProfile(),
            loadMasterProducts(),
            loadCategories(),
            loadMenuItems(),
            loadOrders(),
            loadReviews(),
            loadPromotions(),
            loadCoupons(),
            loadNotifications(),
            loadSettings(),
            loadChats(),
            loadDeliveryRequests()
        ]);
        setupRealtimeListeners();
        renderAll();
    } catch (error) {
        console.error(error);
        createToast('Unable to load restaurant data right now.', 'error');
    }
}

async function loadProfile() {
    const doc = await firestore.collection('restaurants').doc(state.restaurantId).get();
    state.restaurantProfile = doc.data() || {};
    renderProfileForm();
    updateApprovalGate();
}

async function loadMasterProducts() {
    const snapshot = await firestore.collection('masterProducts').where('status', '==', 'active').get();
    state.masterProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderCatalogFilters();
}

async function loadCategories() {
    const snapshot = await firestore.collection('restaurants').doc(state.restaurantId).collection('categories').orderBy('order').get();
    state.categories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderCategoryFilters();
}

async function loadMenuItems() {
    const snapshot = await firestore.collection('restaurants').doc(state.restaurantId).collection('menu').get();
    state.menuItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadOrders() {
    const snapshot = await firestore.collection('orders').where('restaurantId', '==', state.restaurantId).orderBy('createdAt', 'desc').get();
    state.orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadReviews() {
    const snapshot = await firestore.collection('reviews').where('restaurantId', '==', state.restaurantId).orderBy('createdAt', 'desc').get();
    state.reviews = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadPromotions() {
    const snapshot = await firestore.collection('restaurants').doc(state.restaurantId).collection('promotions').orderBy('createdAt', 'desc').get();
    state.promotions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadCoupons() {
    const snapshot = await firestore.collection('restaurants').doc(state.restaurantId).collection('coupons').orderBy('createdAt', 'desc').get();
    state.coupons = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadNotifications() {
    if (!state.authUser?.uid) {
        state.notifications = [];
        return;
    }
    const snapshot = await firestore.collection('notifications').where('recipientUid', '==', state.authUser.uid).orderBy('createdAt', 'desc').get();
    state.notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function loadDeliveryRequests() {
    const snapshot = await firestore.collection('deliveryRequests').where('restaurantId', '==', state.restaurantId).get();
    state.deliveryRequests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function loadSettings() {
    const doc = await firestore.collection('restaurants').doc(state.restaurantId).collection('settings').doc('store').get();
    state.settings = doc.exists ? doc.data() : {};
    renderSettingsForm();
}

async function loadChats() {
    const snapshot = await firestore.collection('restaurants').doc(state.restaurantId).collection('chats').orderBy('createdAt', 'asc').get();
    state.chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderChat();
}

function updateApprovalGate() {
    const banner = ensureApprovalBanner();
    const isApproved = state.restaurantProfile?.status === 'approved' && state.restaurantProfile?.isActive !== false;
    state.canSell = isApproved;

    if (!banner) return;

    if (!isApproved) {
        const status = state.restaurantProfile?.status || 'pending';
        const title = status === 'suspended' ? 'Account suspended' : status === 'rejected' ? 'Application rejected' : 'Verification pending';
        const message = status === 'suspended'
            ? 'Your restaurant account has been suspended. Please contact support to restore access.'
            : status === 'rejected'
                ? 'Your restaurant application was not approved. Please contact support for next steps.'
                : 'Your restaurant is waiting for admin verification before you can start selling on the platform.';
        banner.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
        banner.innerHTML = '';
    }

    navItems.forEach((button) => {
        const allowed = isApproved || button.dataset.section === 'profile';
        button.disabled = !allowed;
        button.classList.toggle('disabled', !allowed);
    });
}

function ensureApprovalBanner() {
    if (approvalBanner) return approvalBanner;
    const mainPanel = document.querySelector('.main-panel');
    if (!mainPanel) return null;
    approvalBanner = document.createElement('div');
    approvalBanner.className = 'approval-banner hidden';
    mainPanel.insertBefore(approvalBanner, mainPanel.firstChild);
    return approvalBanner;
}

function renderAll() {
    renderDashboard();
    renderProfileForm();
    if (!state.canSell) {
        return;
    }
    renderCatalog();
    renderMenu();
    renderOrders();
    renderReviews();
    renderPromotions();
    renderCoupons();
    renderNotifications();
    renderAnalytics();
}

function setElementHtml(id, html) {
    const element = document.getElementById(id);
    if (element) {
        element.innerHTML = html;
    }
    return element;
}

function renderDashboard() {
    renderDeliveryRequests();
    const stats = [
        { label: 'Today\'s Orders', value: state.orders.filter((order) => isToday(order.createdAt)).length, tone: 'stat-card' },
        { label: 'Today\'s Revenue', value: formatCurrency(sumRevenue(state.orders.filter((order) => isToday(order.createdAt) && ['delivered', 'received'].includes(order.status)))), tone: 'stat-card' },
        { label: 'Pending Orders', value: state.orders.filter((order) => order.status === 'pending').length, tone: 'stat-card' },
        { label: 'Low Stock', value: state.menuItems.filter((item) => item.stockStatus === 'low_stock').length, tone: 'stat-card' }
    ];
    setElementHtml('dashboardStats', stats.map((stat) => `
    <div class="panel-card stat-card">
      <h4>${stat.label}</h4>
      <div class="value">${stat.value}</div>
    </div>`).join(''));

    const recentOrders = state.orders.slice(0, 4);
    setElementHtml('recentOrdersList', recentOrders.length ? recentOrders.map((order) => `
    <div class="list-item">
      <div class="panel-card-header">
        <strong>#${order.orderNumber || order.id.slice(0, 6)}</strong>
        <span class="badge">${order.status || 'pending'}</span>
      </div>
      <div class="muted">${order.customerName || 'Customer'} • ${formatCurrency(order.total || 0)}</div>
    </div>`).join('') : '<div class="empty-state">No orders yet.</div>');

    const lowStock = state.menuItems.filter((item) => item.stockStatus === 'low_stock').slice(0, 5);
    setElementHtml('lowStockList', lowStock.length ? lowStock.map((item) => `
    <div class="list-item">
      <strong>${item.restaurantDescription || item.name || 'Item'}</strong>
      <div class="muted">${item.stockStatus}</div>
    </div>`).join('') : '<div class="empty-state">Everything is stocked.</div>');
}

function renderDeliveryRequests() {
    const list = document.getElementById('deliveryRequestsList');
    if (!list) return;
    list.innerHTML = state.deliveryRequests.length ? state.deliveryRequests.map((request) => `
    <div class="list-item">
      <div class="panel-card-header">
        <strong>${request.deliveryPersonName || 'Delivery person'}</strong>
        <span class="badge">${request.status || 'pending'}</span>
      </div>
      <div class="muted">${request.deliveryPersonEmail || ''}</div>
      <div class="muted">Requested ${request.createdAt ? new Date(request.createdAt.seconds ? request.createdAt.seconds * 1000 : request.createdAt).toLocaleString() : 'recently'}</div>
      <div class="modal-actions">
        ${request.status === 'pending' ? `<button class="primary-btn" data-delivery-request-action="approve" data-delivery-request-id="${request.id}">Approve</button><button class="ghost-btn" data-delivery-request-action="reject" data-delivery-request-id="${request.id}">Reject</button>` : '<span class="badge">Handled</span>'}
      </div>
    </div>`).join('') : '<div class="empty-state">No delivery requests yet.</div>';
    document.querySelectorAll('[data-delivery-request-action]').forEach((button) => {
        button.addEventListener('click', () => handleDeliveryRequestAction(button.dataset.deliveryRequestAction, button.dataset.deliveryRequestId));
    });
}

function renderCatalogFilters() {
    const categoryFilter = document.getElementById('catalogCategoryFilter');
    const categories = [...new Set(state.masterProducts.map((item) => getCategoryDisplayName(item.category)).filter(Boolean))];
    categoryFilter.innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${category}">${category}</option>`).join('');
}

function renderCategoryFilters() {
    const menuCategoryFilter = document.getElementById('menuCategoryFilter');
    menuCategoryFilter.innerHTML = '<option value="all">All categories</option>' + state.categories.map((category) => `<option value="${category.name}">${category.name}</option>`).join('');
}

function renderCatalog() {
    const search = state.catalogFilters.search;
    const category = state.catalogFilters.category;
    const status = state.catalogFilters.status;
    const products = state.masterProducts.filter((product) => {
        const matchesSearch = !search || `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase().includes(search);
        const matchesCategory = category === 'all' || product.category === category;
        const matchesStatus = status === 'all' || (status === 'active' ? product.status === 'active' : product.status !== 'active');
        return matchesSearch && matchesCategory && matchesStatus;
    });
    document.getElementById('catalogGrid').innerHTML = products.length ? products.map((product) => `
    <div class="menu-item-card">
      <img src="${getImageUrl(product.imageFilename || product.image || '')}" alt="${product.name}" onerror="this.src='./images/placeholder.png'" />
      <div class="panel-card-header">
        <strong>${product.name}</strong>
        <span class="badge">${product.category || 'General'}</span>
      </div>
      <div class="muted">${product.description || 'A fresh menu option ready for your store.'}</div>
      <div class="modal-actions">
        <button class="primary-btn" data-add-product="${product.id}">Add to My Store</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No catalog items found.</div>';
    document.querySelectorAll('[data-add-product]').forEach((button) => {
        button.addEventListener('click', () => addToMenu(button.dataset.addProduct));
    });
}

function renderMenu() {
    const filtered = state.menuItems.filter((item) => {
        const term = `${item.restaurantDescription || ''} ${item.restaurantTags?.join(' ') || ''}`.toLowerCase();
        const matchesSearch = !state.menuFilters.search || term.includes(state.menuFilters.search) || (item.name || '').toLowerCase().includes(state.menuFilters.search);
        const matchesCategory = state.menuFilters.category === 'all' || item.category === state.menuFilters.category;
        const matchesAvailability = state.menuFilters.availability === 'all' || (state.menuFilters.availability === 'available' ? item.availability : !item.availability);
        return matchesSearch && matchesCategory && matchesAvailability;
    });
    const sorted = [...filtered].sort((first, second) => {
        if (state.menuFilters.sort === 'price') return (first.price || 0) - (second.price || 0);
        if (state.menuFilters.sort === 'popularity') return (second.popularity || 0) - (first.popularity || 0);
        return (first.name || '').localeCompare(second.name || '');
    });
    const content = document.getElementById('menuContent');
    if (state.viewMode === 'list') {
        content.innerHTML = sorted.length ? `
      <div class="list-stack">
        ${sorted.map((item) => `
          <div class="list-item table-row">
            <input type="checkbox" data-select-menu="${item.id}" />
            <div>
              <strong>${item.name || 'Untitled item'}</strong>
              <div class="muted">${item.category || 'General'}</div>
            </div>
            <div>${formatCurrency(item.price || 0)}</div>
            <label><input type="checkbox" data-toggle-availability="${item.id}" ${item.availability ? 'checked' : ''} /> Available</label>
            <button class="ghost-btn" data-edit-menu="${item.id}">Edit</button>
          </div>`).join('')}
      </div>` : '<div class="empty-state">Your menu is empty.</div>';
    } else {
        content.innerHTML = sorted.length ? sorted.map((item) => `
      <div class="menu-item-card">
        <img src="${getImageUrl(item.imageFilename || item.image || '')}" alt="${item.name || 'Menu item'}" onerror="this.src='./images/placeholder.png'" />
        <div class="panel-card-header">
          <strong>${item.name || 'Untitled item'}</strong>
          <span class="badge">${item.category || 'General'}</span>
        </div>
        <div class="muted">${item.restaurantDescription || 'Custom restaurant description'}</div>
        <div class="modal-actions">
          <label class="badge"><input type="checkbox" data-toggle-availability="${item.id}" ${item.availability ? 'checked' : ''} /> Available</label>
          <button class="ghost-btn" data-edit-menu="${item.id}">Edit</button>
        </div>
      </div>`).join('') : '<div class="empty-state">Your menu is empty.</div>';
    }
    document.querySelectorAll('[data-toggle-availability]').forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => toggleMenuAvailability(event.target.dataset.toggleAvailability, event.target.checked));
    });
    document.querySelectorAll('[data-edit-menu]').forEach((button) => {
        button.addEventListener('click', () => openMenuEditor(button.dataset.editMenu));
    });
    document.querySelectorAll('[data-select-menu]').forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
            if (event.target.checked) state.selectedMenuIds.add(event.target.dataset.selectMenu);
            else state.selectedMenuIds.delete(event.target.dataset.selectMenu);
        });
    });
}

function renderOrders() {
    const filtered = state.orders.filter((order) => state.orderFilter === 'all' || order.status === state.orderFilter);
    document.getElementById('ordersList').innerHTML = filtered.length ? filtered.map((order) => {
        const currentStatus = order.status || 'pending';
        const acceptButtonClass = currentStatus === 'pending' ? 'primary-btn is-active' : 'ghost-btn';
        const rejectButtonClass = ['pending', 'accepted', 'preparing'].includes(currentStatus) ? 'ghost-btn' : 'ghost-btn';
        const prepareButtonClass = ['accepted', 'preparing'].includes(currentStatus) ? 'primary-btn is-active' : 'ghost-btn';
        const readyButtonClass = ['preparing', 'ready'].includes(currentStatus) ? 'primary-btn is-active' : 'ghost-btn';
        const acceptDisabled = currentStatus !== 'pending';
        const rejectDisabled = ['cancelled', 'delivered', 'received'].includes(currentStatus);
        const prepareDisabled = !['accepted', 'preparing'].includes(currentStatus);
        const readyDisabled = !['preparing', 'ready'].includes(currentStatus);
        return `
    <div class="list-item">
      <div class="panel-card-header">
        <strong>${order.customerName || 'Customer'} • #${order.orderNumber || order.id.slice(0, 6)}</strong>
        <span class="badge">${currentStatus}</span>
      </div>
      <div class="muted">${formatCurrency(order.total || 0)} • ${order.address || 'No address provided'}</div>
      ${order.items?.length ? `<img src="${getImageUrl(order.items[0]?.imagePath || order.items[0]?.image || order.items[0]?.imageFilename || '')}" alt="${order.items[0]?.name || 'Item'}" style="width:64px;height:64px;object-fit:cover;border-radius:12px;margin-top:8px;" onerror="this.src='./images/placeholder.png'" />` : ''}
      <div class="muted">Delivery: ${order.deliveryLocationLabel || 'Standard'} • ${order.deliveryLandmark || order.deliveryDetails || 'No landmark provided'}</div>
      <div class="muted">Payment: ${order.paymentMethod || 'pending'} • Phone: ${order.paymentPhone || order.customerPhone || '—'} • ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'}</div>
      <div class="muted">Partner: ${order.deliveryPersonName || (order.deliveryPersonUid ? 'Assigned delivery person' : 'Awaiting assignment')} • Refund: ${order.refundStatus || 'none'}${order.refundRequested ? ' • requested by customer' : ''}</div>
      <div class="modal-actions">
        <button class="${acceptButtonClass}" data-order-action="accept" data-order-id="${order.id}" ${acceptDisabled ? 'disabled' : ''}>Accept</button>
        <button class="${rejectButtonClass}" data-order-action="reject" data-order-id="${order.id}" ${rejectDisabled ? 'disabled' : ''}>Reject</button>
        <button class="${prepareButtonClass}" data-order-action="prepare" data-order-id="${order.id}" ${prepareDisabled ? 'disabled' : ''}>Prepare</button>
        <button class="${readyButtonClass}" data-order-action="ready" data-order-id="${order.id}" ${readyDisabled ? 'disabled' : ''}>Ready</button>
        ${order.refundStatus === 'requested' ? `<button class="ghost-btn" data-order-action="approve-refund" data-order-id="${order.id}">Approve Refund</button><button class="ghost-btn" data-order-action="reject-refund" data-order-id="${order.id}">Reject Refund</button>` : ''}
        <button class="ghost-btn" data-order-action="details" data-order-id="${order.id}">Details</button>
        <button class="ghost-btn" data-open-order-chat="${order.id}">Chat</button>
      </div>
    </div>`;
    }).join('') : '<div class="empty-state">No orders found.</div>';
    document.querySelectorAll('[data-order-action]').forEach((button) => {
        button.addEventListener('click', () => handleOrderAction(button.dataset.orderAction, button.dataset.orderId));
    });
    document.querySelectorAll('[data-open-order-chat]').forEach((button) => {
        button.addEventListener('click', () => openOrderChat(button.dataset.openOrderChat));
    });
}

function renderReviews() {
    document.getElementById('reviewsList').innerHTML = state.reviews.length ? state.reviews.map((review) => `
    <div class="review-card">
      <div class="panel-card-header">
        <strong>${review.customerName || 'Anonymous'}</strong>
        <span class="badge">${'★'.repeat(review.rating || 0)}</span>
      </div>
      <div class="muted">${review.reviewText || review.text || 'No review text yet.'}</div>
      <div class="modal-actions">
        <button class="ghost-btn" data-reply-review="${review.id}">Reply</button>
        <button class="ghost-btn" data-report-review="${review.id}">Report</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No reviews yet.</div>';
    document.querySelectorAll('[data-reply-review]').forEach((button) => {
        button.addEventListener('click', () => replyToReview(button.dataset.replyReview));
    });
    document.querySelectorAll('[data-report-review]').forEach((button) => {
        button.addEventListener('click', () => reportReview(button.dataset.reportReview));
    });
}

function renderPromotions() {
    document.getElementById('promotionsList').innerHTML = state.promotions.length ? state.promotions.map((promotion) => `
    <div class="promotion-card">
      <strong>${promotion.title || 'Promotion'}</strong>
      <div class="muted">${promotion.description || ''}</div>
      <div class="badge">${promotion.type || 'discount'}</div>
    </div>`).join('') : '<div class="empty-state">No promotions yet.</div>';
}

function renderCoupons() {
    document.getElementById('couponsList').innerHTML = state.coupons.length ? state.coupons.map((coupon) => `
    <div class="coupon-card">
      <div class="panel-card-header">
        <strong>${coupon.code}</strong>
        <span class="badge">${coupon.status || 'active'}</span>
      </div>
      <div class="muted">${coupon.type === 'percentage' ? `${coupon.value}%` : formatCurrency(coupon.value)} off</div>
    </div>`).join('') : '<div class="empty-state">No coupons yet.</div>';
}

function renderNotifications() {
    const visible = state.notifications.filter((item) => !item.isDeleted);
    updateNotificationBadge();
    document.getElementById('notificationBadge').textContent = `${visible.filter((item) => !item.read).length} unread`;
    document.getElementById('notificationsList').innerHTML = `
      <div class="action-row" style="margin-bottom: 12px;">
        <button class="ghost-btn" data-clear-all-notifications="true" ${visible.length ? '' : 'disabled'}>Clear all</button>
      </div>
      ${visible.length ? visible.map((item) => `
      <div class="list-item">
        <strong>${item.title || 'Notification'}</strong>
        <div class="muted">${item.message || ''}</div>
        <div class="modal-actions">
          <button class="ghost-btn" data-read-notification="${item.id}">Mark read</button>
          <button class="ghost-btn" data-delete-notification="${item.id}">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-state">No notifications yet.</div>'}`;
    document.querySelectorAll('[data-clear-all-notifications]').forEach((button) => {
        button.addEventListener('click', clearAllNotifications);
    });
    document.querySelectorAll('[data-read-notification]').forEach((button) => {
        button.addEventListener('click', () => markNotificationRead(button.dataset.readNotification));
    });
    document.querySelectorAll('[data-delete-notification]').forEach((button) => {
        button.addEventListener('click', () => deleteNotification(button.dataset.deleteNotification));
    });
}

function renderAnalytics() {
    const totals = state.orders.filter((order) => ['delivered', 'received'].includes(order.status));
    const revenue = sumRevenue(totals);
    const avgOrder = totals.length ? revenue / totals.length : 0;
    const refundAmount = state.orders.filter((order) => ['refunded', 'refund_requested'].includes(order.status) || order.refundRequested).reduce((sum, order) => sum + Number(order.refundAmount || order.total || 0), 0);
    const pendingOrders = state.orders.filter((order) => order.status === 'pending').length;
    const cancellationRate = state.orders.length ? Math.round((state.orders.filter((order) => order.status === 'cancelled').length / state.orders.length) * 100) : 0;

    document.getElementById('analyticsSummary').innerHTML = `
    <div class="panel-card stat-card"><h4>Revenue</h4><div class="value">${formatCurrency(revenue)}</div></div>
    <div class="panel-card stat-card"><h4>Orders</h4><div class="value">${totals.length}</div></div>
    <div class="panel-card stat-card"><h4>Average Order</h4><div class="value">${formatCurrency(avgOrder)}</div></div>
    <div class="panel-card stat-card"><h4>Pending Orders</h4><div class="value">${pendingOrders}</div></div>
    <div class="panel-card stat-card"><h4>Refunded</h4><div class="value">${formatCurrency(refundAmount)}</div></div>
    <div class="panel-card stat-card"><h4>Cancellation Rate</h4><div class="value">${cancellationRate}%</div></div>`;

    const bars = state.orders.slice(0, 6).map((order) => {
        const orderDate = order.createdAt ? new Date(order.createdAt.seconds ? order.createdAt.seconds * 1000 : order.createdAt).toLocaleDateString('en-LR', { month: 'short', day: 'numeric' }) : 'recent';
        return `<div><div class="panel-card-header"><strong>${order.orderNumber || order.id}</strong><span>${formatCurrency(order.total || 0)}</span></div><div class="chart-bar" style="width:${Math.max(22, Math.min(100, (Number(order.total || 0) / 1000) * 100))}%"></div><div class="muted">${orderDate}</div></div>`;
    }).join('');
    document.getElementById('revenueChart').innerHTML = bars || '<div class="empty-state">No chart data yet.</div>';
    document.getElementById('productChart').innerHTML = state.menuItems.slice(0, 6).map((item) => `<div class="panel-card-header"><strong>${item.name || 'Item'}</strong><span>${item.availability ? 'Live' : 'Offline'}</span></div>`).join('');
}

function renderProfileForm() {
    const form = document.getElementById('profileForm');
    const profile = state.restaurantProfile || {};
    const deliveryUsersOptions = state.deliveryUsers.length ? state.deliveryUsers.map((user) => `<option value="${user.uid || user.id}">${user.displayName || user.email || 'Delivery person'}</option>`).join('') : '<option value="">No delivery people available yet</option>';
    const assignedDeliveryPersons = (profile.deliveryPersons || []).filter(Boolean);
    const assignedChips = assignedDeliveryPersons.length ? assignedDeliveryPersons.map((uid) => {
        const user = state.deliveryUsers.find((entry) => (entry.uid || entry.id) === uid);
        return `<div class="chip">${user?.displayName || user?.email || uid}</div>`;
    }).join('') : '<div class="empty-state">No delivery partners assigned yet.</div>';
    form.innerHTML = `
    <label class="full">Business Name<input name="businessName" value="${profile.businessName || ''}" /></label>
    <label>Owner Name<input name="ownerName" value="${profile.ownerName || ''}" /></label>
    <label>Phone<input name="phone" value="${profile.phone || ''}" /></label>
    <label>Mobile money receiver<input name="mobileMoneyNumber" value="${profile.mobileMoneyNumber || ''}" /></label>
    <label>Email<input name="email" value="${profile.email || state.authUser?.email || ''}" /></label>
    <label>Address<input name="address" value="${profile.address || ''}" /></label>
    <label>City<input name="city" value="${profile.city || ''}" /></label>
    <label>County<input name="county" value="${profile.county || ''}" /></label>
    <label>Image Path<input name="imagePath" value="${profile.imagePath || profile.logo || profile.image || ''}" /></label>
    <label>Banner Path<input name="banner" value="${profile.banner || ''}" /></label>
    <label class="full">Description<textarea name="description">${profile.description || ''}</textarea></label>
    <label>Opening Time<input name="open" value="${profile.openingHours?.open || ''}" /></label>
    <label>Closing Time<input name="close" value="${profile.openingHours?.close || ''}" /></label>
    <label>Delivery Radius<input name="deliveryRadius" type="number" value="${profile.deliveryRadius || 5}" /></label>
    <label>Prep Time<input name="estimatedPrepTime" type="number" value="${profile.estimatedPrepTime || 20}" /></label>
    ${getQRCardHTML('restaurantQrContainer', 'restaurantQrCard')}
  `;
    initQRCode('restaurantQrContainer');
    bindQRDownloadHandlers();
    form.insertAdjacentHTML('afterend', `
      <div class="panel-card">
        <div class="panel-card-header">
          <h4>Delivery partners</h4>
          <button class="primary-btn" id="assignDeliveryPartnerButton" type="button">Assign partner</button>
        </div>
        <label>Select delivery person<select id="deliveryPartnerSelect">${deliveryUsersOptions}</select></label>
        <div class="chip-row">${assignedChips}</div>
      </div>
    `);
    const assignButton = document.getElementById('assignDeliveryPartnerButton');
    if (assignButton) {
        assignButton.addEventListener('click', assignDeliveryPartner);
    }
}

function renderSettingsForm() {
    const form = document.getElementById('settingsForm');
    const settings = state.settings || {};
    form.innerHTML = `
    <label>Opening Time<input name="open" value="${settings.open || ''}" /></label>
    <label>Closing Time<input name="close" value="${settings.close || ''}" /></label>
    <label>Delivery Radius<input name="deliveryRadius" type="number" value="${settings.deliveryRadius || 5}" /></label>
    <label>Minimum Order Value<input name="minimumOrderValue" type="number" value="${settings.minimumOrderValue || 0}" /></label>
    <label>Prep Time<input name="estimatedPrepTime" type="number" value="${settings.estimatedPrepTime || 20}" /></label>
    <label><input type="checkbox" name="vacationMode" ${settings.vacationMode ? 'checked' : ''} /> Vacation Mode</label>
    <label><input type="checkbox" name="acceptOrders" ${settings.acceptOrders !== false ? 'checked' : ''} /> Accept Orders</label>
    <label><input type="checkbox" name="autoAccept" ${settings.autoAccept ? 'checked' : ''} /> Auto Accept</label>
  `;
}

function renderChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = state.chats.length ? state.chats.map((message) => `
    <div class="message ${message.sender === state.authUser?.uid ? 'self' : ''}">${message.text}</div>`).join('') : '<div class="empty-state">No messages yet.</div>';
}

function renderSupportRequests() {
    const container = document.getElementById('supportRequestsList');
    if (!container) return;
    container.innerHTML = state.supportRequests.length ? state.supportRequests.map((request) => `
    <div class="list-item">
      <strong>${request.subject || request.category || 'Support request'}</strong>
      <div class="muted">${request.message || ''}</div>
      <div class="muted">${request.email || ''}</div>
      <span class="badge">${request.status || 'new'}</span>
    </div>`).join('') : '<div class="empty-state">No support requests yet.</div>';
}

function showSection(section) {
    const allowedSection = state.canSell || section === 'profile' ? section : 'profile';
    state.activeSection = allowedSection;
    setActiveNavigation(allowedSection);
    setMobileNavOpen(false);
    sectionPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${allowedSection}Section`));
    const titleMap = {
        dashboard: ['Dashboard', 'Track menu performance and orders in real time.'],
        profile: ['Profile', 'Keep your restaurant profile accurate and current.'],
        catalog: ['Catalog', 'Browse the admin master catalog and add products.'],
        menu: ['Menu', 'Manage availability, pricing, and presentation.'],
        orders: ['Orders', 'Accept and prepare incoming orders.'],
        reviews: ['Reviews', 'Monitor customer feedback and reply.'],
        promotions: ['Promotions', 'Create time-based promotions.'],
        coupons: ['Coupons', 'Create coupon codes for customers.'],
        analytics: ['Analytics', 'Measure performance and growth.'],
        notifications: ['Notifications', 'Follow new order and store activity.'],
        settings: ['Settings', 'Tune your store preferences.'],
        chat: ['Chat', 'Open a future-ready support conversation.']
    };
    const [title, subtitle] = titleMap[allowedSection] || titleMap.dashboard;
    pageTitle.textContent = title;
    pageSubtitle.textContent = subtitle;
}

async function handleDeliveryRequestAction(action, requestId) {
    const request = state.deliveryRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    try {
        const requestRef = firestore.collection('deliveryRequests').doc(requestId);
        if (action === 'approve') {
            const deliveryPersonUid = request.deliveryPersonUid;
            const currentRestaurantIds = state.deliveryUsers.find((user) => (user.uid || user.id) === deliveryPersonUid)?.approvedRestaurants || [];
            const nextApprovedRestaurants = Array.from(new Set([...(currentRestaurantIds || []), state.restaurantId]));
            await Promise.all([
                requestRef.update({ status: 'approved', updatedAt: new Date() }),
                firestore.collection('users').doc(deliveryPersonUid).set({ approvedRestaurants: nextApprovedRestaurants, updatedAt: new Date() }, { merge: true }),
                firestore.collection('restaurants').doc(state.restaurantId).set({ deliveryPersons: Array.from(new Set([...(state.restaurantProfile?.deliveryPersons || []), deliveryPersonUid])), updatedAt: new Date() }, { merge: true }),
                firestore.collection('notifications').add({ recipientUid: deliveryPersonUid, title: 'Restaurant approved', message: `Your request to join ${state.restaurantProfile?.name || 'the restaurant'} was approved.`, type: 'delivery', read: false, isDeleted: false, createdAt: new Date() })
            ]);
            createToast('Delivery request approved.', 'success');
        } else if (action === 'reject') {
            await Promise.all([
                requestRef.update({ status: 'rejected', updatedAt: new Date() }),
                firestore.collection('notifications').add({ recipientUid: request.deliveryPersonUid, title: 'Restaurant request declined', message: `Your request to join ${state.restaurantProfile?.name || 'the restaurant'} was declined.`, type: 'delivery', read: false, isDeleted: false, createdAt: new Date() })
            ]);
            createToast('Delivery request declined.', 'success');
        }
    } catch (error) {
        createToast(error.message || 'Unable to update the delivery request.', 'error');
    }
}

async function assignDeliveryPartner() {
    const select = document.getElementById('deliveryPartnerSelect');
    const deliveryPersonUid = select?.value;
    if (!deliveryPersonUid || !state.restaurantId) return;
    try {
        const current = state.restaurantProfile?.deliveryPersons || [];
        if (current.includes(deliveryPersonUid)) {
            createToast('This delivery person is already assigned to your restaurant.', 'info');
            return;
        }
        const nextDeliveryPersons = [...current, deliveryPersonUid];
        const deliveryUser = state.deliveryUsers.find((user) => (user.uid || user.id) === deliveryPersonUid);
        const approvedRestaurants = Array.from(new Set([...(deliveryUser?.approvedRestaurants || []), state.restaurantId]));
        await Promise.all([
            firestore.collection('restaurants').doc(state.restaurantId).set({ deliveryPersons: nextDeliveryPersons, updatedAt: new Date() }, { merge: true }),
            firestore.collection('users').doc(deliveryPersonUid).set({ approvedRestaurants, updatedAt: new Date() }, { merge: true })
        ]);
        createToast('Delivery partner assigned successfully.', 'success');
    } catch (error) {
        console.error(error);
        createToast(error.message || 'Unable to assign delivery partner.', 'error');
    }
}

async function updateUserProfile(uid, updates) {
    if (!uid) {
        throw new Error('A user id is required to save the profile.');
    }
    const button = document.getElementById('saveProfileButton');
    if (button) {
        button.disabled = true;
        button.textContent = 'Saving…';
    }
    try {
        const payload = {
            ...updates,
            updatedAt: new Date()
        };
        await firestore.collection('users').doc(uid).set(payload, { merge: true });
        state.userProfile = { ...state.userProfile, ...payload };
        createToast('Profile saved to Firestore.', 'success');
        return payload;
    } catch (error) {
        createToast(error.message || 'Unable to save your profile.', 'error');
        throw error;
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Save Profile';
        }
    }
}

async function saveProfile(event) {
    event.preventDefault();
    const form = document.getElementById('profileForm');
    const data = Object.fromEntries(new FormData(form));
    const profilePayload = {
        businessName: data.businessName,
        ownerName: data.ownerName,
        phone: data.phone,
        mobileMoneyNumber: data.mobileMoneyNumber || '',
        acceptedPaymentMethods: state.restaurantProfile?.acceptedPaymentMethods || ['mobile_money', 'cash'],
        email: data.email,
        address: data.address,
        city: data.city,
        county: data.county,
        imagePath: data.imagePath || '',
        image: data.imagePath || '',
        logo: data.imagePath || '',
        banner: data.banner || '',
        description: data.description,
        openingHours: { open: data.open, close: data.close },
        deliveryRadius: Number(data.deliveryRadius || 0),
        estimatedPrepTime: Number(data.estimatedPrepTime || 0),
        updatedAt: new Date()
    };
    await firestore.collection('restaurants').doc(state.restaurantId).set(profilePayload, { merge: true });
    await updateUserProfile(state.authUser?.uid, {
        displayName: data.ownerName || data.businessName || state.userProfile?.displayName || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || ''
    });
    state.restaurantProfile = { ...state.restaurantProfile, ...profilePayload };
    createToast('Profile saved', 'success');
}

async function saveSettings(event) {
    event.preventDefault();
    const form = document.getElementById('settingsForm');
    const data = Object.fromEntries(new FormData(form));
    const payload = {
        open: data.open,
        close: data.close,
        deliveryRadius: Number(data.deliveryRadius || 0),
        minimumOrderValue: Number(data.minimumOrderValue || 0),
        estimatedPrepTime: Number(data.estimatedPrepTime || 0),
        vacationMode: Boolean(data.vacationMode),
        acceptOrders: Boolean(data.acceptOrders),
        autoAccept: Boolean(data.autoAccept),
        updatedAt: new Date()
    };
    await firestore.collection('restaurants').doc(state.restaurantId).collection('settings').doc('store').set(payload, { merge: true });
    state.settings = payload;
    createToast('Settings saved', 'success');
}

async function addToMenu(productId) {
    const masterProduct = state.masterProducts.find((product) => product.id === productId);
    if (!masterProduct) return;
    const existing = await firestore.collection('restaurants').doc(state.restaurantId).collection('menu').where('masterProductId', '==', productId).limit(1).get();
    if (!existing.empty) {
        createToast('This product is already in your menu.', 'error');
        return;
    }
    const payload = {
        masterProductId: productId,
        restaurantId: state.restaurantId,
        name: masterProduct.name,
        category: getCategoryDisplayName(masterProduct.category || 'General'),
        price: 0,
        restaurantDescription: masterProduct.description || '',
        availability: true,
        featured: false,
        recommended: false,
        todayDeal: false,
        discount: 0,
        preparationTime: masterProduct.preparationTime || 20,
        servingSize: 'Standard',
        restaurantTags: [],
        stockStatus: 'in_stock',
        image: masterProduct.image || masterProduct.imageFilename || 'placeholder.svg',
        imageFilename: masterProduct.imageFilename || masterProduct.image || 'placeholder.svg',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    await firestore.collection('restaurants').doc(state.restaurantId).collection('menu').add(payload);
    await loadMenuItems();
    renderMenu();
    createToast(`${masterProduct.name} added to your menu.`, 'success');
}

async function toggleMenuAvailability(itemId, isAvailable) {
    await firestore.collection('restaurants').doc(state.restaurantId).collection('menu').doc(itemId).update({ availability: isAvailable, updatedAt: new Date() });
    const item = state.menuItems.find((entry) => entry.id === itemId);
    if (item) item.availability = isAvailable;
    renderMenu();
}

async function bulkUpdateMenu(isAvailable) {
    const ids = Array.from(state.selectedMenuIds);
    await Promise.all(ids.map((id) => firestore.collection('restaurants').doc(state.restaurantId).collection('menu').doc(id).update({ availability: isAvailable, updatedAt: new Date() })));
    state.selectedMenuIds.clear();
    await loadMenuItems();
    renderMenu();
    createToast('Selected items updated.', 'success');
}

async function bulkDeleteMenu() {
    const ids = Array.from(state.selectedMenuIds);
    await Promise.all(ids.map((id) => firestore.collection('restaurants').doc(state.restaurantId).collection('menu').doc(id).delete()));
    state.selectedMenuIds.clear();
    await loadMenuItems();
    renderMenu();
    createToast('Selected items removed.', 'success');
}

async function openMenuEditor(menuId) {
    const item = state.menuItems.find((entry) => entry.id === menuId);
    if (!item) return;
    modalTitle.textContent = 'Edit Menu Item';
    modalBody.innerHTML = `
    <form id="menuEditorForm" class="form-grid">
      <label>Price<input name="price" type="number" value="${item.price || 0}" /></label>
      <label>Preparation Time<input name="preparationTime" type="number" value="${item.preparationTime || 20}" /></label>
      <label>Serving Size<input name="servingSize" value="${item.servingSize || ''}" /></label>
      <label>Stock Status<select name="stockStatus"><option ${item.stockStatus === 'in_stock' ? 'selected' : ''}>in_stock</option><option ${item.stockStatus === 'low_stock' ? 'selected' : ''}>low_stock</option><option ${item.stockStatus === 'out_of_stock' ? 'selected' : ''}>out_of_stock</option></select></label>
      <label>Restaurant Description<textarea name="restaurantDescription">${item.restaurantDescription || ''}</textarea></label>
      <label class="full">Restaurant Notes<textarea name="notes">${item.notes || ''}</textarea></label>
      <label><input type="checkbox" name="availability" ${item.availability ? 'checked' : ''} /> Available</label>
      <label><input type="checkbox" name="featured" ${item.featured ? 'checked' : ''} /> Featured</label>
      <label><input type="checkbox" name="recommended" ${item.recommended ? 'checked' : ''} /> Recommended</label>
      <label><input type="checkbox" name="todayDeal" ${item.todayDeal ? 'checked' : ''} /> Today's Deal</label>
    </form>`;
    modalActions.innerHTML = `
    <button class="ghost-btn" id="cancelEditor">Cancel</button>
    <button class="primary-btn" id="saveEditor">Save</button>`;
    modalBackdrop.classList.remove('hidden');
    document.getElementById('saveEditor').addEventListener('click', async () => {
        const form = document.getElementById('menuEditorForm');
        const formData = Object.fromEntries(new FormData(form));
        const payload = {
            price: Number(formData.price || 0),
            preparationTime: Number(formData.preparationTime || 0),
            servingSize: formData.servingSize,
            stockStatus: formData.stockStatus,
            restaurantDescription: formData.restaurantDescription,
            notes: formData.notes,
            availability: Boolean(formData.availability),
            featured: Boolean(formData.featured),
            recommended: Boolean(formData.recommended),
            todayDeal: Boolean(formData.todayDeal),
            updatedAt: new Date()
        };
        await firestore.collection('restaurants').doc(state.restaurantId).collection('menu').doc(menuId).update(payload);
        closeModal();
        await loadMenuItems();
        renderMenu();
        createToast('Menu item updated', 'success');
    });
    document.getElementById('cancelEditor').addEventListener('click', closeModal);
}

function closeModal() {
    if (state.orderChatUnsubscribe) {
        state.orderChatUnsubscribe();
        state.orderChatUnsubscribe = null;
    }
    state.activeOrderChatId = null;
    state.orderChatMessages = [];
    modalBackdrop.classList.add('hidden');
    modalBody.innerHTML = '';
    modalActions.innerHTML = '';
    modalBackdrop.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
}

function toggleSupportModal() {
    if (!modalBackdrop.classList.contains('hidden') && modalTitle.textContent === 'Help & support') {
        closeModal();
        return;
    }
    openSupportModal();
}

function openSupportModal() {
    modalTitle.textContent = 'Help & support';
    modalBody.innerHTML = `
    <form id="supportForm" class="form-grid">
      <label>Topic<select name="category">
        <option value="account">Account</option>
        <option value="orders">Orders</option>
        <option value="payments">Payments</option>
        <option value="technical">Technical</option>
        <option value="other">Other</option>
      </select></label>
      <label>Subject<input name="subject" value="Support request" /></label>
      <label class="full">Message<textarea name="message" required placeholder="Tell us what you need help with."></textarea></label>
      <label>Email<input name="email" value="${state.authUser?.email || ''}" /></label>
    </form>`;
    modalActions.innerHTML = `
    <button class="ghost-btn" id="cancelSupport">Cancel</button>
    <button class="primary-btn" id="submitSupport">Send request</button>`;
    modalBackdrop.classList.remove('hidden');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.getElementById('submitSupport').addEventListener('click', async () => {
        const form = document.getElementById('supportForm');
        const formData = Object.fromEntries(new FormData(form));
        const payload = {
            restaurantId: state.restaurantId,
            restaurantName: state.restaurantProfile?.businessName || state.restaurantProfile?.name || '',
            panel: 'restaurant',
            category: formData.category || 'other',
            subject: formData.subject || formData.category || 'Support request',
            message: String(formData.message || '').trim(),
            email: String(formData.email || state.authUser?.email || '').trim(),
            status: 'new',
            createdAt: new Date()
        };
        if (!payload.message) {
            createToast('Please describe your issue before sending.', 'warning');
            return;
        }
        try {
            await firestore.collection('supportRequests').add(payload);
            closeModal();
            createToast('Support request sent. We will follow up shortly.', 'success');
        } catch (error) {
            createToast(error.message || 'Unable to send support request.', 'error');
        }
    });
    document.getElementById('cancelSupport').addEventListener('click', closeModal);
}

function openPromotionModal() {
    modalTitle.textContent = 'Create Promotion';
    modalBody.innerHTML = `
    <form id="promotionForm" class="form-grid">
      <label class="full">Title<input name="title" /></label>
      <label class="full">Description<textarea name="description"></textarea></label>
      <label>Type<select name="type"><option value="discount">Discount</option><option value="featured">Featured</option><option value="deal">Deal</option></select></label>
      <label>Discount<input name="value" type="number" /></label>
      <label class="full">Valid Until<input name="validUntil" type="date" /></label>
    </form>`;
    modalActions.innerHTML = `
    <button class="ghost-btn" id="cancelPromotion">Cancel</button>
    <button class="primary-btn" id="savePromotion">Save</button>`;
    modalBackdrop.classList.remove('hidden');
    document.getElementById('savePromotion').addEventListener('click', async () => {
        const formData = Object.fromEntries(new FormData(document.getElementById('promotionForm')));
        await firestore.collection('restaurants').doc(state.restaurantId).collection('promotions').add({ ...formData, createdAt: new Date(), updatedAt: new Date() });
        closeModal();
        await loadPromotions();
        renderPromotions();
        createToast('Promotion created', 'success');
    });
    document.getElementById('cancelPromotion').addEventListener('click', closeModal);
}

function openCouponModal() {
    modalTitle.textContent = 'Create Coupon';
    modalBody.innerHTML = `
    <form id="couponForm" class="form-grid">
      <label class="full">Code<input name="code" /></label>
      <label>Type<select name="type"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></label>
      <label>Value<input name="value" type="number" /></label>
      <label>Minimum Order<input name="minimumOrderValue" type="number" /></label>
      <label class="full">Expiry<input name="expiryDate" type="date" /></label>
      <label>Status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    </form>`;
    modalActions.innerHTML = `
    <button class="ghost-btn" id="cancelCoupon">Cancel</button>
    <button class="primary-btn" id="saveCoupon">Save</button>`;
    modalBackdrop.classList.remove('hidden');
    document.getElementById('saveCoupon').addEventListener('click', async () => {
        const formData = Object.fromEntries(new FormData(document.getElementById('couponForm')));
        await firestore.collection('restaurants').doc(state.restaurantId).collection('coupons').add({ ...formData, createdAt: new Date(), updatedAt: new Date() });
        closeModal();
        await loadCoupons();
        renderCoupons();
        createToast('Coupon created', 'success');
    });
    document.getElementById('cancelCoupon').addEventListener('click', closeModal);
}

async function createNotification(recipientUid, title, message, type = 'system') {
    if (!recipientUid) return;
    await firestore.collection('notifications').add({ recipientUid, title, message, type, read: false, isDeleted: false, createdAt: new Date() });
}

async function notifyDeliveryPartnersForOrder(restaurantId, restaurantName, orderId) {
    if (!restaurantId) return;
    const restaurantDoc = await firestore.collection('restaurants').doc(restaurantId).get();
    const restaurantData = restaurantDoc.data() || {};
    const partnerUids = Array.from(new Set([
        ...(restaurantData.deliveryPersons || []),
        ...(state.deliveryUsers || []).filter((user) => (user.approvedRestaurants || []).includes(restaurantId)).map((user) => user.uid || user.id).filter(Boolean)
    ]));
    if (!partnerUids.length) return;
    await Promise.all(partnerUids.map((uid) => firestore.collection('notifications').add({
        recipientUid: uid,
        title: 'Order ready for pickup',
        message: `${restaurantName || 'Your restaurant'} marked order #${orderId.slice(0, 6)} as ready for pickup.`,
        type: 'delivery',
        read: false,
        isDeleted: false,
        createdAt: new Date()
    })));
}

function isRestaurantProfileComplete() {
    const profile = state.restaurantProfile || {};
    return Boolean((profile.businessName || profile.name) && profile.ownerName && profile.phone && profile.address);
}

function ensureRestaurantProfileComplete() {
    if (isRestaurantProfileComplete()) return true;
    createToast('Please complete your restaurant profile before updating order status.', 'warning');
    showSection('profile');
    return false;
}

async function handleOrderAction(action, orderId) {
    const orderRef = firestore.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    const currentOrder = orderDoc.data() || {};
    const nextStatus = {
        accept: 'accepted',
        reject: 'cancelled',
        prepare: 'preparing',
        ready: 'ready'
    }[action];
    const requiresProfile = ['accept', 'prepare', 'ready'];
    if (requiresProfile.includes(action) && !ensureRestaurantProfileComplete()) {
        return;
    }
    if (!nextStatus) {
        if (action === 'approve-refund') {
            await orderRef.update({ status: 'refund_approved', refundStatus: 'approved', updatedAt: new Date() });
            await loadOrders();
            renderOrders();
            createToast('Refund approved.', 'success');
            return;
        }
        if (action === 'reject-refund') {
            await orderRef.update({ refundStatus: 'rejected', updatedAt: new Date() });
            await loadOrders();
            renderOrders();
            createToast('Refund rejected.', 'success');
            return;
        }
        openOrderDetails(currentOrder);
        return;
    }
    await orderRef.update({ status: nextStatus, updatedAt: new Date() });
    if (currentOrder.customerUid) {
        const customerNotifications = {
            accept: { title: 'Order accepted', message: 'Your order was accepted and is being prepared.', type: 'order' },
            reject: { title: 'Order cancelled', message: 'Your order was cancelled by the restaurant.', type: 'order' },
            prepare: { title: 'Order in progress', message: 'Your order is now being prepared.', type: 'order' },
            ready: { title: 'Order ready', message: 'Your order is ready for pickup.', type: 'order' }
        };
        const notification = customerNotifications[action];
        if (notification) {
            await createNotification(currentOrder.customerUid, notification.title, notification.message, notification.type);
        }
    }
    if (nextStatus === 'ready' && currentOrder.restaurantId) {
        await notifyDeliveryPartnersForOrder(currentOrder.restaurantId, currentOrder.restaurantName || state.restaurantProfile?.businessName || state.restaurantProfile?.name || 'your restaurant', orderId);
    }
    await loadOrders();
    renderOrders();
    createToast(`Order marked as ${nextStatus}`, 'success');
}

async function openOrderChat(orderId) {
    const orderDoc = await firestore.collection('orders').doc(orderId).get();
    const order = orderDoc.data() || {};
    state.activeOrderChatId = orderId;
    modalTitle.textContent = `Order chat #${order.orderNumber || orderId.slice(0, 6)}`;
    modalBody.innerHTML = `
    <div id="orderChatMessages" class="chat-log"></div>
    <form id="orderChatForm" class="chat-form">
      <input id="orderChatInput" type="text" placeholder="Send an update about this order" />
      <button type="submit" class="primary-btn">Send</button>
    </form>`;
    modalActions.innerHTML = `<button class="ghost-btn" id="closeOrderChat">Close</button>`;
    modalBackdrop.classList.remove('hidden');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.getElementById('closeOrderChat').addEventListener('click', closeModal);
    document.getElementById('orderChatForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('orderChatInput');
        const text = input?.value.trim();
        if (!text) return;
        await firestore.collection('orders').doc(orderId).collection('messages').add({
            text,
            senderRole: 'restaurant',
            senderUid: state.authUser?.uid || '',
            read: false,
            isDeleted: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        input.value = '';
    });
    loadOrderChatMessages(orderId);
}

function loadOrderChatMessages(orderId) {
    if (state.orderChatUnsubscribe) {
        state.orderChatUnsubscribe();
        state.orderChatUnsubscribe = null;
    }
    state.orderChatUnsubscribe = firestore.collection('orders').doc(orderId).collection('messages').orderBy('createdAt', 'asc').onSnapshot((snapshot) => {
        state.orderChatMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((message) => !message.isDeleted);
        const container = document.getElementById('orderChatMessages');
        if (!container) return;
        container.innerHTML = state.orderChatMessages.length ? state.orderChatMessages.map((message) => `
      <div class="chat-bubble ${message.senderRole === 'restaurant' ? 'self' : ''}">
        <div class="panel-card-header">
          <strong>${message.senderRole === 'restaurant' ? 'You' : message.senderRole === 'delivery_person' ? 'Delivery' : 'Customer'}</strong>
          <span class="badge">${message.read ? 'Read' : 'Unread'}</span>
        </div>
        <div>${message.text}</div>
        <div class="muted">${formatDate(message.createdAt)}</div>
        <div class="action-row">
          <button class="ghost-btn" type="button" data-delete-order-chat-message="${message.id}">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-state">No messages yet.</div>';
        document.querySelectorAll('[data-delete-order-chat-message]').forEach((button) => {
            button.addEventListener('click', async () => {
                await deleteOrderChatMessage(orderId, button.dataset.deleteOrderChatMessage);
            });
        });
    });
}

async function deleteOrderChatMessage(orderId, messageId) {
    await firestore.collection('orders').doc(orderId).collection('messages').doc(messageId).set({ isDeleted: true, updatedAt: new Date() }, { merge: true });
}

function openOrderDetails(order) {
    modalTitle.textContent = `Order ${order.orderNumber || order.id}`;
    modalBody.innerHTML = `
    <div class="list-stack">
      <div><strong>Customer</strong>: ${order.customerName || 'N/A'}</div>
      <div><strong>Phone</strong>: ${order.customerPhone || order.paymentPhone || 'N/A'}</div>
      <div><strong>Address</strong>: ${order.address || 'N/A'}</div>
      <div><strong>Saved location</strong>: ${order.deliveryLocationLabel || 'Not selected'}</div>
      <div><strong>Landmark / notes</strong>: ${order.deliveryLandmark || order.deliveryDetails || 'N/A'}</div>
      <div><strong>Items</strong>:
        ${Array.isArray(order.items) && order.items.length ? order.items.map((item) => `
          <div class="item-card" style="margin-top:8px;padding:10px;border-radius:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <img src="${getImageUrl(item.imagePath || item.image || item.imageFilename || '')}" alt="${item.name || 'Item'}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;" onerror="this.src='./images/placeholder.png'" />
              <div>
                <div><strong>${item.name || 'Item'}</strong> × ${item.quantity || 1}</div>
                <div class="muted">${item.description || item.restaurantDescription || 'Freshly prepared item'}</div>
              </div>
            </div>
          </div>`).join('') : '<div class="muted">None</div>'}
      </div>
      <div><strong>Payment</strong>: ${order.paymentMethod || 'pending'} • ${order.paymentDetails || 'N/A'}</div>
      <div><strong>Total</strong>: ${formatCurrency(order.total || 0)}</div>
      <div><strong>ETA</strong>: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'}</div>
      <div><strong>Refund</strong>: ${order.refundStatus || 'none'}</div>
    </div>`;
    modalActions.innerHTML = `<button class="ghost-btn" id="closeDetails">Close</button>`;
    modalBackdrop.classList.remove('hidden');
    document.getElementById('closeDetails').addEventListener('click', closeModal);
}

async function replyToReview(reviewId) {
    const text = window.prompt('Reply to review');
    if (!text) return;
    await firestore.collection('reviews').doc(reviewId).update({ reply: text, updatedAt: new Date() });
    await loadReviews();
    renderReviews();
    createToast('Reply saved', 'success');
}

async function reportReview(reviewId) {
    await firestore.collection('reports').add({ reviewId, restaurantId: state.restaurantId, createdAt: new Date() });
    createToast('Review reported to admin', 'success');
}

async function markNotificationRead(notificationId) {
    await firestore.collection('notifications').doc(notificationId).set({ read: true, updatedAt: new Date() }, { merge: true });
    await loadNotifications();
    renderNotifications();
}

async function deleteNotification(notificationId) {
    await firestore.collection('notifications').doc(notificationId).set({ read: true, isDeleted: true, updatedAt: new Date() }, { merge: true });
    await loadNotifications();
    renderNotifications();
}

async function clearAllNotifications() {
    const visible = state.notifications.filter((item) => !item.isDeleted);
    if (!visible.length) return;
    await Promise.all(visible.map((item) => firestore.collection('notifications').doc(item.id).set({ read: true, isDeleted: true, updatedAt: new Date() }, { merge: true })));
    await loadNotifications();
    renderNotifications();
    createToast('All notifications cleared.', 'success');
}

async function submitChat(event) {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    await firestore.collection('restaurants').doc(state.restaurantId).collection('chats').add({ text, sender: state.authUser.uid, createdAt: new Date() });
    input.value = '';
    await loadChats();
}

async function submitSupportRequest(event) {
    event.preventDefault();
    const form = document.getElementById('supportForm');
    const data = Object.fromEntries(new FormData(form));
    const payload = {
        restaurantId: state.restaurantId,
        restaurantName: state.restaurantProfile?.businessName || state.restaurantProfile?.name || '',
        panel: 'restaurant',
        category: data.category || 'general',
        subject: data.subject || data.category || 'Support request',
        message: data.message || '',
        email: data.email || state.authUser?.email || '',
        status: 'new',
        createdAt: new Date()
    };
    if (!payload.message) return;
    await firestore.collection('supportRequests').add(payload);
    form.reset();
    createToast('Support request sent. We will follow up soon.', 'success');
}

function sumRevenue(orders) {
    return orders.reduce((total, order) => total + Number(order.total || 0), 0);
}

function isToday(value) {
    if (!value) return false;
    const date = value.toDate ? value.toDate() : new Date(value);
    const now = new Date();
    return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

document.addEventListener('DOMContentLoaded', init);
