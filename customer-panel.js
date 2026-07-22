import { initFirebase, clearStoredAuthState } from './firebase-config.js';
import { formatCurrency, formatDate, createToast, getImageUrl, getAddonImageUrl, getRestaurantImageUrl, calculateDistance, copyText, dialUSSD, getCommunityOptions, escapeHtml } from './utils.js';
import { DEFAULT_CATEGORY_TAXONOMY, getCategoryDisplayName, getCategoryOptions } from './category-taxonomy.js';
import { getQRCardHTML, initQRCode, bindQRDownloadHandlers } from './qr-utils.js';
import { resolveRestaurantPaymentDetails } from './checkout-utils.mjs';

const defaultLocation = { lat: 6.3113, lng: -10.8014 };

const state = {
    authUser: null,
    customerProfile: null,
    restaurants: [],
    menuItems: [],
    addons: [],
    orders: [],
    favorites: [],
    addresses: [],
    locations: [],
    activeAddressId: '',
    categories: [],
    profileUnsubscribe: null,
    restaurantsUnsubscribe: null,
    ordersUnsubscribe: null,
    favoritesUnsubscribe: null,
    addressesUnsubscribe: null,
    locationsUnsubscribe: null,
    cart: { restaurantId: '', restaurantName: '', items: [], addons: [], drink: null, paymentMethod: 'orange_money', paymentPhone: '', paymentDetails: '', contactPhone: '', notes: '', deliveryFee: 0, selectedLocationId: '', selectedAddonId: '', restaurantPaymentReceiver: '', restaurantAcceptedPaymentMethods: [] },
    checkoutLocationSelection: null,
    checkoutPaymentNumbers: { restaurantId: '', orangeMoneyNumber: '', lonestarMoneyNumber: '', loading: false, loaded: false },
    activeSection: 'home',
    selectedRestaurant: null,
    selectedMenuItem: null,
    searchQuery: '',
    filters: { category: 'all', sort: 'rating', community: '' },
    orderFilter: 'all',
    deliveryFee: 60,
    notifications: [],
    helpArticles: []
};

const authScreen = document.getElementById('authScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authMessage = document.getElementById('authMessage');
const showRegisterButton = document.getElementById('showRegisterButton');
const showLoginButton = document.getElementById('showLoginButton');
const forgotPasswordButton = document.getElementById('forgotPasswordButton');
const logoutButton = document.getElementById('logoutButton');
const mobileNavToggle = document.getElementById('mobileNavToggle');
const mobileNavSheet = document.getElementById('mobileNavSheet');
const mobileNavClose = document.getElementById('mobileNavClose');
const mobileMenuButton = document.getElementById('mobileMenuButton');
const notificationsToggle = document.getElementById('notificationsToggle');
const customerNotificationBadge = document.getElementById('customerNotificationBadge');
const customerNotificationBadgeCount = document.getElementById('customerNotificationBadgeCount');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarClose = document.getElementById('sidebarClose');
const cartButton = document.getElementById('cartButton');
const cartCount = document.getElementById('cartCount');
const navItems = Array.from(document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]'));
const mobileNavButtons = Array.from(document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item'));
const sectionPanels = Array.from(document.querySelectorAll('.section-panel'));
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');
const modalClose = document.getElementById('modalClose');

let firebase = null;
let firestore = null;
let auth = null;
let authBootstrapTimer = null;
let homeSearchTimeout = null;

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
let locationMap = null;
let locationMarker = null;
let locationAccuracyCircle = null;
let locationWatchId = null;
let locationMapReady = false;
let isTrackingLocation = false;
let locationReverseGeocodeTimer = null;

function normalizeCartState(cart = {}) {
    return {
        restaurantId: cart.restaurantId || '',
        restaurantName: cart.restaurantName || '',
        items: Array.isArray(cart.items) ? cart.items : [],
        addons: Array.isArray(cart.addons) ? cart.addons : [],
        drink: cart.drink || null,
        paymentMethod: cart.paymentMethod || 'orange_money',
        paymentPhone: cart.paymentPhone || '',
        paymentDetails: cart.paymentDetails || '',
        contactPhone: cart.contactPhone || '',
        notes: cart.notes || '',
        deliveryFee: Number(cart.deliveryFee || state.deliveryFee || 60),
        selectedLocationId: cart.selectedLocationId || '',
        selectedAddonId: cart.selectedAddonId || '',
        restaurantPaymentReceiver: cart.restaurantPaymentReceiver || '',
        restaurantAcceptedPaymentMethods: Array.isArray(cart.restaurantAcceptedPaymentMethods) ? cart.restaurantAcceptedPaymentMethods : []
    };
}

function isFavoriteMenuItem(menuItemId) {
    return state.favorites.some((entry) => entry.type === 'menuItem' && (entry.menuItemId === menuItemId || entry.id === menuItemId));
}

function getCurrentCheckoutPaymentNumbers() {
    const restaurantId = state.cart.restaurantId;
    if (!restaurantId) {
        return { restaurantId: '', orangeMoneyNumber: '', lonestarMoneyNumber: '', loading: false, loaded: false };
    }

    if (state.checkoutPaymentNumbers?.restaurantId === restaurantId) {
        return state.checkoutPaymentNumbers;
    }

    return { restaurantId: '', orangeMoneyNumber: '', lonestarMoneyNumber: '', loading: false, loaded: false };
}

async function ensureCheckoutPaymentNumbers() {
    const restaurantId = state.cart.restaurantId;
    if (!restaurantId || !firestore) return getCurrentCheckoutPaymentNumbers();

    const currentNumbers = state.checkoutPaymentNumbers;
    if (currentNumbers?.restaurantId === restaurantId && (currentNumbers.loaded || currentNumbers.loading)) {
        return currentNumbers;
    }

    state.checkoutPaymentNumbers = {
        restaurantId,
        orangeMoneyNumber: '',
        lonestarMoneyNumber: '',
        loading: true,
        loaded: false
    };

    try {
        const restaurantDoc = await firestore.collection('restaurants').doc(restaurantId).get();
        const restaurantData = restaurantDoc.data() || {};
        const nextNumbers = {
            restaurantId,
            orangeMoneyNumber: String(restaurantData.orangeMoneyNumber || restaurantData.mobileMoneyNumber || '').trim(),
            lonestarMoneyNumber: String(restaurantData.lonestarMoneyNumber || '').trim(),
            loading: false,
            loaded: true
        };
        state.checkoutPaymentNumbers = nextNumbers;
        if (document.getElementById('checkoutContent')) {
            renderCheckout();
        }
        return nextNumbers;
    } catch (error) {
        console.error('[MANNA] Unable to load restaurant payment numbers:', error);
        state.checkoutPaymentNumbers = {
            restaurantId,
            orangeMoneyNumber: '',
            lonestarMoneyNumber: '',
            loading: false,
            loaded: true
        };
        return state.checkoutPaymentNumbers;
    }
}

async function handleCopyUssd(code) {
    const copied = await copyText(code);
    createToast(copied ? 'USSD code copied to clipboard!' : 'Unable to copy automatically. Please copy the code manually.', copied ? 'success' : 'warning');
}

function handleDialUssd(code) {
    const dialed = dialUSSD(code);
    if (!dialed) {
        createToast('Please manually dial the code using your phone’s dialer.', 'warning');
    }
}

function isFavoriteRestaurant(restaurantId) {
    return state.favorites.some((entry) => entry.type === 'restaurant' && (entry.restaurantId === restaurantId || entry.id === restaurantId));
}

function getFavoriteButtonClass(isActive) {
    return `ghost-btn favorite-btn ${isActive ? 'active' : ''}`;
}

function getFavoriteIcon(isActive) {
    return isActive ? '♥' : '♡';
}

function normalizeGeoPoint(value) {
    if (!value) return null;
    if (typeof value.toJSON === 'function' && value.latitude != null && value.longitude != null) {
        return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
    }
    if (value.latitude != null && value.longitude != null) {
        return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
    }
    if (value._lat != null && value._long != null) {
        return { latitude: Number(value._lat), longitude: Number(value._long) };
    }
    if (value.lat != null && value.lng != null) {
        return { latitude: Number(value.lat), longitude: Number(value.lng) };
    }
    return null;
}

function getCustomerLocationCoordinates(profile = state.customerProfile) {
    const geopoint = profile?.geopoint || profile?.deliveryLocation?.geopoint || profile?.deliveryAddress?.geopoint;
    const normalizedGeopoint = normalizeGeoPoint(geopoint);
    if (normalizedGeopoint) {
        return normalizedGeopoint;
    }
    const activeLocation = state.locations.find((entry) => entry.isActive === true) || state.locations[0] || null;
    if (activeLocation?.lat != null && activeLocation?.lng != null) {
        return { latitude: Number(activeLocation.lat), longitude: Number(activeLocation.lng) };
    }
    return null;
}

function hasLocationChanged(previousProfile = null, nextProfile = null) {
    return JSON.stringify(getCustomerLocationCoordinates(previousProfile)) !== JSON.stringify(getCustomerLocationCoordinates(nextProfile));
}

function formatDistanceLabel(distance) {
    if (distance === null || distance === undefined || Number.isNaN(distance)) return '';
    if (distance < 1) return '< 1 km away';
    return `${distance.toFixed(distance >= 10 ? 0 : 1)} km away`;
}

function sortMenuItemsForCustomer(menuItems, customerLocation = null) {
    return [...menuItems].sort((a, b) => {
        if (customerLocation) {
            return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        }
        return Number(b.createdAt?.seconds || b.createdAt || 0) - Number(a.createdAt?.seconds || a.createdAt || 0);
    });
}

function resolvePasswordResetEmail(fallbackEmail = '') {
    const profileEmail = state.customerProfile?.email || state.authUser?.email || '';
    if (profileEmail) return profileEmail;
    const loginEmail = document.getElementById('loginEmail')?.value?.trim() || '';
    return loginEmail || fallbackEmail;
}

function init() {
    loadRestaurantFilterPreferences();
    bindEvents();
    firebase = initFirebase();
    auth = firebase.auth;
    firestore = firebase.db;
    if (auth) {
        auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => { });
    }
    if (!auth || !firestore) {
        createToast('Firebase is not ready yet. Please refresh.', 'error');
        return;
    }
    auth.onAuthStateChanged(handleAuthStateChange);
}

function toggleMobileCategoryDropdown(trigger) {
    if (window.innerWidth > 767) return;
    const dropdown = trigger?.nextElementSibling;
    if (!dropdown || !dropdown.classList.contains('category-dropdown')) return;

    const isOpen = dropdown.classList.contains('open');
    const activeDropdown = document.querySelector('.category-dropdown.open');
    if (activeDropdown && activeDropdown !== dropdown) {
        activeDropdown.classList.remove('open');
        activeDropdown.setAttribute('aria-hidden', 'true');
        const activeTrigger = activeDropdown.previousElementSibling;
        activeTrigger?.classList.remove('active');
        activeTrigger?.setAttribute('aria-expanded', 'false');
    }

    dropdown.classList.toggle('open', !isOpen);
    dropdown.setAttribute('aria-hidden', String(isOpen));
    trigger.classList.toggle('active', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
}

function closeMobileCategoryDropdown() {
    const dropdown = document.querySelector('.category-dropdown.open');
    if (!dropdown) return;

    dropdown.classList.remove('open');
    dropdown.setAttribute('aria-hidden', 'true');
    const trigger = dropdown.previousElementSibling;
    trigger?.classList.remove('active');
    trigger?.setAttribute('aria-expanded', 'false');
}

function bindEvents() {
    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);
    showRegisterButton?.addEventListener('click', () => toggleAuthMode(true));
    showLoginButton?.addEventListener('click', () => toggleAuthMode(false));
    forgotPasswordButton?.addEventListener('click', handleForgotPassword);
    logoutButton?.addEventListener('click', handleLogout);
    const openMobileMenu = (event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        setMobileNavOpen(true);
    };

    mobileNavToggle?.addEventListener('click', openMobileMenu);
    if (mobileNavClose) {
        mobileNavClose.addEventListener('click', (event) => {
            event.stopPropagation();
            setMobileNavOpen(false);
        });
    }
    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', openMobileMenu);
    }
    if (mobileNavSheet) {
        mobileNavSheet.addEventListener('click', (event) => {
            if (event.target === mobileNavSheet) {
                setMobileNavOpen(false);
            }
        });
    }
    document.getElementById('mobileLogoutButton')?.addEventListener('click', handleLogout);
    cartButton?.addEventListener('click', () => showSection('checkout'));
    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', () => {
            showSection('notifications');
        });
    }
    navItems.forEach((button) => button.addEventListener('click', () => showSection(button.dataset.section)));
    mobileNavButtons.forEach((button) => {
        if (!button.dataset.section) return;
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    document.getElementById('homeSearch')?.addEventListener('input', (event) => {
        const nextValue = event.target.value.trim();
        state.searchQuery = nextValue.toLowerCase();
        window.clearTimeout(homeSearchTimeout);
        homeSearchTimeout = window.setTimeout(() => {
            renderHome();
        }, 300);
    });
    document.getElementById('restaurantSearch')?.addEventListener('input', (event) => {
        state.searchQuery = event.target.value.toLowerCase();
        renderRestaurants();
    });
    document.getElementById('restaurantCategoryFilter')?.addEventListener('change', (event) => {
        state.filters.category = event.target.value;
        renderRestaurants();
    });
    document.getElementById('restaurantSort')?.addEventListener('change', (event) => {
        state.filters.sort = event.target.value;
        renderRestaurants();
    });
    document.getElementById('restaurantCommunityFilterButton')?.addEventListener('click', openCommunityFilterModal);
    document.getElementById('orderFilter')?.addEventListener('change', (event) => {
        state.orderFilter = event.target.value;
        renderOrders();
    });
    document.getElementById('saveProfileButton')?.addEventListener('click', saveProfile);
    document.getElementById('placeOrderButton')?.addEventListener('click', placeOrder);
    document.getElementById('checkoutButton')?.addEventListener('click', () => showSection('checkout'));
    document.addEventListener('click', (event) => {
        if (event.target.closest('#mobileMenuButton')) {
            event.preventDefault();
            event.stopPropagation();
            setMobileNavOpen(true);
            return;
        }
        const sectionButton = event.target.closest('[data-section]');
        if (sectionButton) {
            showSection(sectionButton.dataset.section);
        }
    });
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('.filter-trigger');
        if (trigger && window.innerWidth <= 767) {
            event.stopPropagation();
            toggleMobileCategoryDropdown(trigger);
            return;
        }

        const closeButton = event.target.closest('.close-btn');
        if (closeButton && window.innerWidth <= 767) {
            event.stopPropagation();
            closeMobileCategoryDropdown();
            return;
        }

        const dropdown = document.querySelector('.category-dropdown.open');
        if (dropdown && !dropdown.contains(event.target) && !event.target.closest('.filter-trigger')) {
            closeMobileCategoryDropdown();
        }
    });

    document.addEventListener('keydown', (event) => {
        const trigger = event.target.closest('.filter-trigger');
        if (!trigger || window.innerWidth > 767) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleMobileCategoryDropdown(trigger);
        }
    });

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
            localStorage.setItem('manna-onboarding-seen', 'true');
        });
    }
    if (onboardingOverlay && !localStorage.getItem('manna-onboarding-seen')) {
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

function setActiveNavigation(section) {
    document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-section') === section);
    });
    // ensure mobile nav contains all main nav items
    (function syncMobileNavItems() {
        const mobileList = document.querySelector('.mobile-nav-list');
        if (!mobileList) return;
        const desktopItems = Array.from(document.querySelectorAll('.nav-item[data-section]')).filter(i => !i.closest('.mobile-nav-list'));
        desktopItems.forEach((item) => {
            const section = item.getAttribute('data-section');
            if (!section) return;
            if (mobileList.querySelector(`.mobile-nav-item[data-section="${section}"]`)) return;
            const mobileBtn = document.createElement('button');
            mobileBtn.className = 'nav-item mobile-nav-item';
            mobileBtn.setAttribute('data-section', section);
            const icon = item.querySelector('.nav-icon')?.innerHTML || '';
            const label = item.textContent.trim() || section;
            mobileBtn.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
            mobileList.appendChild(mobileBtn);
        });
        mobileList.addEventListener('click', (e) => {
            const btn = e.target.closest('.mobile-nav-item');
            if (!btn) return;
            const section = btn.getAttribute('data-section');
            if (section) {
                showSection(section);
                setMobileNavOpen(false);
            }
        });
        // dedupe mobile items
        const seen = new Set();
        Array.from(mobileList.querySelectorAll('.mobile-nav-item')).forEach((el) => {
            const s = el.getAttribute('data-section');
            if (!s) return;
            if (seen.has(s)) el.remove(); else seen.add(s);
        });
    })();

    // notification badge helper
    (function updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge') || document.getElementById('notificationCount');
        if (!badge) return;
        const count = (state.notifications || state.data?.notifications || []).filter(n => !n.read).length;
        badge.textContent = count || '';
        badge.style.display = count ? 'inline-flex' : 'none';
        const toggle = document.getElementById('notificationsToggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                (state.notifications || state.data?.notifications || []).forEach(n => n.read = true);
                badge.textContent = '';
                badge.style.display = 'none';
                showSection && showSection('notifications');
            });
        }
    })();
}

function toggleAuthMode(showRegister) {
    loginForm.classList.toggle('hidden', showRegister);
    registerForm.classList.toggle('hidden', !showRegister);
    authMessage.textContent = '';
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        createToast('Signed in successfully', 'success');
    } catch (error) {
        authMessage.textContent = error.message;
        createToast(error.message, 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const phone = document.getElementById('registerPhone').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    if (!name || !phone || !email || !password || password !== confirmPassword) {
        authMessage.textContent = 'Please complete all fields and make sure passwords match.';
        return;
    }
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        await user.updateProfile({ displayName: name });
        await firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            displayName: name,
            email,
            phone,
            role: 'customer',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        createToast('Account created. Welcome to MANNA.', 'success');
        toggleAuthMode(false);
    } catch (error) {
        authMessage.textContent = error.message;
        createToast(error.message, 'error');
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
        state.customerProfile = null;
        authScreen.classList.remove('hidden');
        appShell.classList.add('hidden');
    }
}

async function handleAuthStateChange(user) {
    if (!user) {
        if (state.authUser) {
            clearAuthBootstrapTimer();
            state.authUser = null;
            state.customerProfile = null;
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            return;
        }
        scheduleAuthFallback();
        return;
    }
    clearAuthBootstrapTimer();
    state.authUser = user;
    try {
        const userDocRef = firestore.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            await userDocRef.set({ uid: user.uid, displayName: user.displayName || user.email, email: user.email, role: 'customer', createdAt: new Date(), updatedAt: new Date() });
        }
        const profile = userDoc.exists ? userDoc.data() : { uid: user.uid, displayName: user.displayName || user.email, email: user.email, role: 'customer' };
        const role = profile?.role || 'customer';
        if (role !== 'customer') {
            authMessage.textContent = 'This account is not authorized for the customer panel.';
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            createToast('Please use the correct panel for this account.', 'warning');
            return;
        }
        state.customerProfile = profile;
        authScreen.classList.add('hidden');
        appShell.classList.remove('hidden');
        await loadCustomerData();
        if (state.notifications.length) {
            renderNotifications();
        }
    } catch (error) {
        console.error(error);
        createToast(error.message || 'Could not load customer dashboard.', 'error');
    }
}

function cleanupListeners() {
    [state.profileUnsubscribe, state.restaurantsUnsubscribe, state.ordersUnsubscribe, state.favoritesUnsubscribe, state.addressesUnsubscribe, state.locationsUnsubscribe].forEach((unsubscribe) => {
        if (unsubscribe) unsubscribe();
    });
    state.profileUnsubscribe = null;
    state.restaurantsUnsubscribe = null;
    state.ordersUnsubscribe = null;
    state.favoritesUnsubscribe = null;
    state.addressesUnsubscribe = null;
    state.locationsUnsubscribe = null;
}

async function refreshCustomerFeed() {
    try {
        await loadVisibleProducts();
        renderHome();
        renderRestaurants();
        if (state.activeSection === 'home' || state.activeSection === 'restaurants') {
            showSection(state.activeSection || 'home');
        }
    } catch (error) {
        console.error('[MANNA] Visible products load failed:', error);
    }
}

function setupRealtimeListeners(userId) {
    cleanupListeners();
    state.profileUnsubscribe = firestore.collection('users').doc(userId).onSnapshot((doc) => {
        const previousProfile = state.customerProfile || {};
        state.customerProfile = doc.data() || {};
        renderProfileForm();
        renderSettingsForm();
        if (hasLocationChanged(previousProfile, state.customerProfile)) {
            refreshCustomerFeed();
        }
    }, (error) => {
        console.error('[MANNA] Customer profile listener failed:', error);
    });
    state.restaurantsUnsubscribe = firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).onSnapshot((snapshot) => {
        state.restaurants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        refreshCustomerFeed();
    }, (error) => {
        console.error('[MANNA] Restaurants listener failed:', error);
    });
    state.ordersUnsubscribe = firestore.collection('orders').where('customerUid', '==', userId).onSnapshot((snapshot) => {
        state.orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderOrders();
    }, (error) => {
        console.error('[MANNA] Customer orders listener failed:', error);
    });
    state.favoritesUnsubscribe = firestore.collection('users').doc(userId).collection('favorites').onSnapshot((snapshot) => {
        state.favorites = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderFavorites();
    }, (error) => {
        console.error('[MANNA] Customer favorites listener failed:', error);
    });
    firestore.collection('notifications').where('recipientUid', '==', userId).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderNotifications();
    }, (error) => {
        console.error('[MANNA] Customer notifications listener failed:', error);
    });
    firestore.collection('helpArticles').where('targetRoles', 'array-contains', 'customer').onSnapshot((snapshot) => {
        state.helpArticles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        if (state.activeSection === 'help') {
            renderHelpArticles();
        }
    }, (error) => {
        console.error('[MANNA] Customer help articles listener failed:', error);
    });
    state.addressesUnsubscribe = firestore.collection('users').doc(userId).collection('addresses').onSnapshot((snapshot) => {
        state.addresses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const activeAddress = state.addresses.find((entry) => entry.isActive === true) || state.addresses[0] || null;
        state.activeAddressId = activeAddress?.id || '';
        state.cart.selectedLocationId = activeAddress?.id || '';
        saveCartToStorage();
        renderProfileForm();
        if (document.getElementById('checkoutContent')) {
            renderCheckout();
        }
    }, (error) => {
        console.error('[MANNA] Customer addresses listener failed:', error);
    });
    state.locationsUnsubscribe = firestore.collection('users').doc(userId).collection('customerLocations').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.locations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderProfileForm();
        if (document.getElementById('checkoutContent')) {
            renderCheckout();
        }
        refreshCustomerFeed();
    }, (error) => {
        console.error('[MANNA] Customer locations listener failed:', error);
    });
}

async function loadCustomerData() {
    const userId = state.authUser.uid;
    await loadPlatformSettings();
    await loadAddons();
    setupRealtimeListeners(userId);
    renderAll();
    hydrateCartFromStorage();
    showSection('home');
}

async function loadPlatformSettings() {
    try {
        const snapshot = await firestore.collection('settings').doc('platform').get();
        const data = snapshot.exists ? snapshot.data() : {};
        state.deliveryFee = Number(data.deliveryFee || data.defaultDeliveryFee || 60);
    } catch (error) {
        console.error(error);
    }
}

async function loadAddons() {
    try {
        const snapshot = await firestore.collection('masterAddons').get();
        state.addons = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((addon) => addon.status === 'active' && !addon.isDeleted);
    } catch (error) {
        console.error('[MANNA] Failed to load add-ons:', error);
        state.addons = [];
    }
}

async function loadRestaurants() {
    const snapshot = await firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).get();
    state.restaurants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    state.categories = [...new Set(state.restaurants.map((restaurant) => restaurant.category).filter(Boolean))];
}

async function loadVisibleProducts() {
    const customerLocation = getCustomerLocationCoordinates();
    const approvedRestaurants = await firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).get();
    const allProducts = [];

    for (const restaurantDoc of approvedRestaurants.docs) {
        const restaurantData = restaurantDoc.data() || {};
        const restaurantId = restaurantDoc.id;
        const restaurantName = restaurantData.name || 'Restaurant';
        const restaurantGeopoint = normalizeGeoPoint(restaurantData.geopoint || restaurantData.location?.geopoint);
        const distance = customerLocation && restaurantGeopoint
            ? calculateDistance(customerLocation.latitude, customerLocation.longitude, restaurantGeopoint.latitude, restaurantGeopoint.longitude)
            : null;

        const menuSnapshot = await firestore.collection('restaurants').doc(restaurantId).collection('menu').get();
        for (const menuDoc of menuSnapshot.docs) {
            const menuItem = menuDoc.data() || {};
            const isAvailable = menuItem.isAvailable ?? menuItem.availability ?? false;
            if (!isAvailable) continue;

            allProducts.push({
                id: menuDoc.id,
                restaurantId,
                ...menuItem,
                restaurantName,
                distance,
                isAvailable: true
            });
        }
    }

    state.menuItems = sortMenuItemsForCustomer(allProducts, customerLocation);
    state.restaurants = state.restaurants.map((restaurant) => {
        const restaurantGeopoint = normalizeGeoPoint(restaurant.geopoint || restaurant.location?.geopoint);
        const distance = customerLocation && restaurantGeopoint
            ? calculateDistance(customerLocation.latitude, customerLocation.longitude, restaurantGeopoint.latitude, restaurantGeopoint.longitude)
            : null;
        return { ...restaurant, distance };
    });
    state.categories = [...new Set(state.menuItems.map((item) => getCategoryDisplayName(item.category)).filter(Boolean))];
}

async function loadOrders(userId) {
    const snapshot = await firestore.collection('orders').where('customerUid', '==', userId).orderBy('createdAt', 'desc').get();
    state.orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadFavorites(userId) {
    const snapshot = await firestore.collection('users').doc(userId).collection('favorites').get();
    state.favorites = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadAddresses(userId) {
    const snapshot = await firestore.collection('users').doc(userId).collection('addresses').get();
    state.addresses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadProfile(userId) {
    const doc = await firestore.collection('users').doc(userId).get();
    state.customerProfile = doc.data() || {};
    renderProfileForm();
    renderSettingsForm();
}

function renderAll() {
    renderHome();
    renderRestaurants();
    renderOrders();
    renderFavorites();
    renderNotifications();
    renderProfileForm();
    renderSettingsForm();
    updateCartSummary();
}

function getProductSearchText(item = {}) {
    const keywordText = Array.isArray(item.searchKeywords) ? item.searchKeywords.join(' ') : (item.searchKeywords || '');
    return [
        item.name,
        item.restaurantName,
        item.restaurantDescription,
        item.description,
        item.category,
        getCategoryDisplayName(item.category),
        keywordText
    ].filter(Boolean).join(' ').toLowerCase();
}

function renderHome() {
    const categoryOptions = [{ label: 'All', value: 'all' }, ...state.categories.map((category) => ({ label: category, value: category }))];
    const categoryMarkup = categoryOptions.length
        ? categoryOptions.map((category) => `<button class="chip ${state.filters.category === category.value ? 'active' : ''}" data-category="${category.value}">${category.label}</button>`).join('')
        : '<div class="empty-state">No categories yet.</div>';

    const desktopCategories = document.getElementById('homeCategories');
    if (desktopCategories) {
        desktopCategories.innerHTML = categoryMarkup;
    }

    const mobileCategories = document.getElementById('mobileHomeCategories');
    if (mobileCategories) {
        mobileCategories.innerHTML = categoryMarkup;
    }

    document.querySelectorAll('[data-category]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextCategory = button.dataset.category || 'all';
            const isSameCategory = state.filters.category === nextCategory;
            state.filters.category = isSameCategory ? 'all' : nextCategory;
            renderHome();
            if (window.innerWidth <= 767) {
                closeMobileCategoryDropdown();
            }
        });
    });

    const featuredProducts = state.menuItems.filter((item) => item.isAvailable !== false && item.availability !== false);
    const searchQuery = String(state.searchQuery || '').trim().toLowerCase();
    const filteredProducts = featuredProducts.filter((item) => {
        const matchesCategory = state.filters.category === 'all' || getCategoryDisplayName(item.category) === state.filters.category;
        if (!matchesCategory) return false;
        if (!searchQuery) return true;
        const haystack = getProductSearchText(item);
        const searchTerms = searchQuery.split(/\s+/).filter(Boolean);
        return searchTerms.every((term) => haystack.includes(term));
    });
    const nearbyProducts = filteredProducts.filter((item) => item.distance !== null && item.distance !== undefined && Number.isFinite(item.distance));
    const generalProducts = filteredProducts.filter((item) => item.distance === null || item.distance === undefined || !Number.isFinite(item.distance));
    const sortedNearbyProducts = nearbyProducts.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    const sortedGeneralProducts = [...generalProducts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const renderedProducts = [...sortedNearbyProducts, ...sortedGeneralProducts];

    document.getElementById('homeContent').innerHTML = `${renderedProducts.length ? renderedProducts.map((item) => {
        const restaurant = state.restaurants.find((entry) => entry.id === item.restaurantId);
        const isFavorite = isFavoriteMenuItem(item.id);
        const isNearby = item.distance !== null && item.distance !== undefined && Number.isFinite(item.distance);
        const distanceLabel = formatDistanceLabel(item.distance);
        return `
          <div class="item-card">
            <img src="${getImageUrl(item.imageFilename || item.image || '')}" alt="${item.name}" onerror="this.src='./images/placeholder.png'" />
            <div class="panel-card-header">
              <strong>${item.name}</strong>
              <div class="product-card-meta">
                <span class="badge">${formatCurrency(item.price || 0)}</span>
                ${isNearby ? '<span class="priority-badge">Nearby</span>' : ''}
                ${distanceLabel ? `<span class="distance-badge">📍 ${distanceLabel}</span>` : ''}
              </div>
            </div>
            <div class="muted card-description">${item.restaurantDescription || item.description || 'Freshly prepared and ready for your order.'}</div>
            <div class="muted">${restaurant?.name || item.restaurantName || 'Restaurant'}</div>
            <div class="modal-actions">
              <button class="primary-btn" data-add-order="${item.id}">Buy</button>
              <button class="${getFavoriteButtonClass(isFavorite)}" data-favorite-item="${item.id}" aria-pressed="${isFavorite ? 'true' : 'false'}">${getFavoriteIcon(isFavorite)}</button>
            </div>
          </div>`;
    }).join('') : '<div class="empty-state">No dishes are available right now.</div>'}`;

    document.querySelectorAll('[data-add-order]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.addOrder)));
    document.querySelectorAll('[data-favorite-item]').forEach((button) => button.addEventListener('click', () => toggleFavoriteItem(button.dataset.favoriteItem)));
}

function saveRestaurantFilterPreferences() {
    sessionStorage.setItem('manna-customer-community-filter', state.filters.community || '');
}

function loadRestaurantFilterPreferences() {
    const savedCommunity = sessionStorage.getItem('manna-customer-community-filter') || '';
    if (savedCommunity) {
        state.filters.community = savedCommunity;
    }
}

function openCommunityFilterModal() {
    const options = getCommunityOptions().map((community) => `<option value="${escapeHtml(community.toLowerCase())}" ${state.filters.community?.toLowerCase() === community.toLowerCase() ? 'selected' : ''}>${escapeHtml(community)}</option>`).join('');
    modalTitle.textContent = 'Filter by community';
    modalBody.innerHTML = `
      <div class="stack">
        <label>Community<select id="communityFilterSelect">
          <option value="">All communities</option>
          ${options}
        </select></label>
      </div>`;
    modalActions.innerHTML = `
      <button class="ghost-btn" id="clearCommunityFilterButton" type="button">Clear</button>
      <button class="primary-btn" id="applyCommunityFilterButton" type="button">Apply</button>
    `;
    modalBackdrop.classList.remove('hidden');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.getElementById('applyCommunityFilterButton')?.addEventListener('click', () => {
        const select = document.getElementById('communityFilterSelect');
        state.filters.community = select?.value || '';
        saveRestaurantFilterPreferences();
        renderRestaurants();
        closeModal();
    });
    document.getElementById('clearCommunityFilterButton')?.addEventListener('click', () => {
        state.filters.community = '';
        saveRestaurantFilterPreferences();
        renderRestaurants();
        closeModal();
    });
    window.addEventListener('keydown', handleModalEscape);
}

function renderRestaurants() {
    const filtered = state.restaurants.filter((restaurant) => {
        const search = state.searchQuery || '';
        const matchesSearch = !search || `${restaurant.name} ${restaurant.description || ''}`.toLowerCase().includes(search);
        const matchesCategory = state.filters.category === 'all' || getCategoryDisplayName(restaurant.category) === state.filters.category || state.menuItems.some((item) => item.restaurantId === restaurant.id && getCategoryDisplayName(item.category) === state.filters.category);
        const communityValue = String(state.filters.community || '').trim().toLowerCase();
        const matchesCommunity = !communityValue || String(restaurant.community || restaurant.district || restaurant.county || '').trim().toLowerCase() === communityValue;
        return matchesSearch && matchesCategory && matchesCommunity;
    }).sort((a, b) => {
        if (state.filters.sort === 'distance') return (a.distance || 0) - (b.distance || 0);
        if (state.filters.sort === 'newest') return Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0);
        if (state.filters.sort === 'popularity') return Number(b.orderCount || 0) - Number(a.orderCount || 0);
        return Number(b.rating || 0) - Number(a.rating || 0);
    });
    document.getElementById('restaurantsGrid').innerHTML = filtered.length ? filtered.map((restaurant) => `
    <div class="item-card">
      <img src="${getRestaurantImageUrl(restaurant)}" alt="${restaurant.name}" onerror="this.src='./images/placeholder.png'" />
      <div class="panel-card-header"><strong>${restaurant.name}</strong><span class="badge">${getCategoryDisplayName(restaurant.category || 'Food')}</span></div>
      <div class="muted card-description">${restaurant.description || 'Local favorites and hearty meals.'}</div>
      ${restaurant.phone ? `<div class="muted">📞 ${escapeHtml(restaurant.phone)}</div>` : ''}
      ${restaurant.community || restaurant.district || restaurant.county ? `<div class="muted">📍 ${escapeHtml([restaurant.community, restaurant.district, restaurant.county].filter(Boolean).join(' • '))}</div>` : ''}
      <div class="modal-actions">
        <button class="primary-btn" data-open-restaurant="${restaurant.id}">View Menu</button>
        <button class="${getFavoriteButtonClass(isFavoriteRestaurant(restaurant.id))}" data-favorite-restaurant="${restaurant.id}" aria-pressed="${isFavoriteRestaurant(restaurant.id) ? 'true' : 'false'}">${getFavoriteIcon(isFavoriteRestaurant(restaurant.id))}</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No restaurants match your filters.</div>';
    document.querySelectorAll('[data-open-restaurant]').forEach((button) => button.addEventListener('click', () => openRestaurant(button.dataset.openRestaurant)));
    document.querySelectorAll('[data-favorite-restaurant]').forEach((button) => button.addEventListener('click', () => toggleFavoriteRestaurant(button.dataset.favoriteRestaurant)));
}

async function openRestaurant(restaurantId) {
    const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
    if (!restaurant) return;
    state.selectedRestaurant = restaurant;
    const menuSnapshot = await firestore.collection('restaurants').doc(restaurantId).collection('menu').where('availability', '==', true).get();
    const menuItems = menuSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    document.getElementById('restaurantDetailContent').innerHTML = `
    <div class="panel-card">
      <div class="panel-card-header">
        <div><h3>${restaurant.name}</h3><p class="muted">${restaurant.description || ''}</p></div>
        <button class="ghost-btn" data-section="restaurants">Back</button>
      </div>
      <div class="card-grid">
        ${menuItems.length ? menuItems.map((item) => `
          <div class="item-card">
            <img src="${getImageUrl(item.imageFilename || item.image || '')}" alt="${item.name}" onerror="this.src='./images/placeholder.png'" />
            <div class="panel-card-header"><strong>${item.name}</strong><span class="badge">${formatCurrency(item.price || 0)}</span></div>
            <div class="muted card-description">${item.restaurantDescription || 'Freshly prepared and ready to order.'}</div>
            <div class="modal-actions">
              <button class="primary-btn" data-add-order="${item.id}">Add to cart</button>
              <button class="ghost-btn" data-favorite-item="${item.id}">♡</button>
            </div>
          </div>`).join('') : '<div class="empty-state">No dishes available yet.</div>'}
      </div>
    </div>`;
    document.querySelectorAll('[data-add-order]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.addOrder)));
    document.querySelectorAll('[data-favorite-item]').forEach((button) => button.addEventListener('click', () => toggleFavoriteItem(button.dataset.favoriteItem)));
    showSection('restaurantDetail');
}

function renderOrders() {
    const filtered = state.orders.filter((order) => {
        if (order.isDeleted) return false;
        if (state.orderFilter === 'active') return ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'refund_requested'].includes(order.status);
        if (state.orderFilter === 'past') return ['delivered', 'completed', 'received'].includes(order.status);
        if (state.orderFilter === 'cancelled') return order.status === 'cancelled' || order.refundStatus === 'approved';
        return true;
    });
    document.getElementById('ordersList').innerHTML = filtered.length ? filtered.map((order) => {
        const isArchived = Boolean(order.archived);
        const canDelete = ['received', 'refunded'].includes(order.status);
        const actionsDisabled = isArchived || ['received', 'refunded'].includes(order.status);
        return `
    <div class="item-card ${isArchived ? 'archived-order-card' : ''}">
      ${order.items?.length ? `<img src="${getImageUrl(order.items[0]?.imagePath || order.items[0]?.image || order.items[0]?.imageFilename || '')}" alt="${order.items[0]?.name || 'Item'}" onerror="this.src='./images/placeholder.png'" />` : ''}
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status}</span></div>
      <div class="muted">${formatCurrency(order.total || 0)} • ${order.restaurantName || 'Restaurant'}</div>
      <div class="muted">ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'} • Refund: ${order.refundStatus || 'none'}</div>
      <div class="modal-actions">
        <button class="ghost-btn" data-track-order="${order.id}" ${actionsDisabled ? 'disabled' : ''}>Track</button>
        <button class="ghost-btn" data-repeat-order="${order.id}" ${actionsDisabled ? 'disabled' : ''}>Repeat</button>
        <button class="ghost-btn" data-request-refund="${order.id}" ${canRequestRefund(order) && !isArchived ? '' : 'disabled'}>${getRefundButtonLabel(order)}</button>
        ${order.refundStatus === 'approved' && !order.refundConfirmedAt ? `<button class="primary-btn" data-confirm-refund="${order.id}">Confirm receipt</button>` : ''}
        ${canDelete ? `<button class="danger-btn" data-delete-order="${order.id}">Delete</button>` : ''}
      </div>
    </div>`;
    }).join('') : '<div class="empty-state">No orders yet.</div>';
    document.querySelectorAll('[data-track-order]').forEach((button) => button.addEventListener('click', () => trackOrder(button.dataset.trackOrder)));
    document.querySelectorAll('[data-repeat-order]').forEach((button) => button.addEventListener('click', () => repeatOrder(button.dataset.repeatOrder)));
    document.querySelectorAll('[data-request-refund]').forEach((button) => button.addEventListener('click', () => requestRefund(button.dataset.requestRefund)));
    document.querySelectorAll('[data-confirm-refund]').forEach((button) => button.addEventListener('click', () => confirmRefundReceipt(button.dataset.confirmRefund)));
    document.querySelectorAll('[data-delete-order]').forEach((button) => button.addEventListener('click', () => deleteOrderFromUI(button.dataset.deleteOrder)));
}

function canRequestRefund(order) {
    return !['out_for_delivery', 'delivered', 'received', 'cancelled', 'refund_approved', 'refund_rejected'].includes(order.status) && !['requested', 'approved', 'rejected'].includes(order.refundStatus || 'none');
}

function getRefundButtonLabel(order) {
    if (order.refundStatus === 'requested') return 'Refund pending';
    if (order.refundStatus === 'approved') return 'Refund approved';
    if (order.refundStatus === 'rejected') return 'Refund rejected';
    if (order.refundStatus === 'confirmed') return 'Refund confirmed';
    return 'Request refund';
}

async function requestRefund(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !canRequestRefund(order)) return;
    const reason = window.prompt('Tell us why you want a refund (optional)', 'Order issue');
    try {
        await firestore.collection('orders').doc(orderId).update({
            refundRequested: true,
            refundStatus: 'requested',
            refundReason: (reason || '').trim(),
            refundAmount: Number(order.refundAmount || order.total || 0),
            refundRequestedAt: new Date(),
            refundProcessedAt: null,
            refundConfirmedAt: null,
            status: 'refund_requested',
            updatedAt: new Date()
        });
        await firestore.collection('notifications').add({
            recipientUid: state.authUser?.uid || order.customerUid,
            title: 'Refund request submitted',
            message: `Your refund request for order #${order.orderNumber || order.id.slice(0, 6)} is now pending review.`,
            type: 'refund',
            read: false,
            isDeleted: false,
            createdAt: new Date()
        });
        await loadOrders(state.authUser.uid);
        renderOrders();
        createToast('Refund request sent to the restaurant.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function confirmRefundReceipt(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || order.refundStatus !== 'approved') return;
    try {
        await firestore.collection('orders').doc(orderId).update({
            refundStatus: 'confirmed',
            refundConfirmedAt: new Date(),
            status: 'refunded',
            updatedAt: new Date()
        });
        await loadOrders(state.authUser.uid);
        renderOrders();
        createToast('Refund receipt confirmed.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to confirm the refund receipt.', 'error');
    }
}

async function deleteOrderFromUI(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !['received', 'refunded'].includes(order.status)) return;
    const confirmed = window.confirm('Are you sure you want to permanently delete this order? This action cannot be undone.');
    if (!confirmed) return;
    try {
        await firestore.collection('orders').doc(orderId).set({ isDeleted: true, updatedAt: new Date() }, { merge: true });
        state.orders = state.orders.filter((entry) => entry.id !== orderId);
        renderOrders();
        createToast('Order deleted.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to delete the order.', 'error');
    }
}

function renderNotifications() {
    const visible = state.notifications.filter((item) => !item.isDeleted);
    const unreadCount = visible.filter((item) => !item.read).length;
    const badgeText = unreadCount ? `${unreadCount} unread` : 'All caught up';
    if (customerNotificationBadge) {
        customerNotificationBadge.textContent = badgeText;
    }
    if (customerNotificationBadgeCount) {
        customerNotificationBadgeCount.textContent = unreadCount || '0';
        customerNotificationBadgeCount.classList.toggle('hidden', unreadCount === 0);
    }
    const list = document.getElementById('notificationsList');
    if (!list) return;
    list.innerHTML = `
      <div class="action-row" style="margin-bottom: 12px;">
        <button class="ghost-btn" data-clear-all-notifications="true" ${visible.length ? '' : 'disabled'}>Clear all</button>
      </div>
      ${visible.length ? visible.map((item) => `
        <div class="item-card notification-card ${item.read ? '' : 'unread'}">
          <div class="panel-card-header">
            <strong>${item.title || 'Update'}</strong>
            <span class="badge">${item.type || 'system'}</span>
          </div>
          <div class="muted">${item.message || 'You have a new update from MANNA.'}</div>
          <div class="muted">${formatDate(item.createdAt)}</div>
          <div class="modal-actions">
            <button class="ghost-btn" data-mark-notification="${item.id}">${item.read ? 'Read' : 'Mark as Read'}</button>
            <button class="danger-btn" data-delete-notification="${item.id}">Delete</button>
          </div>
        </div>`).join('') : '<div class="empty-state">No notifications yet.</div>'}`;
    list.querySelectorAll('[data-clear-all-notifications]').forEach((button) => {
        button.addEventListener('click', clearAllNotifications);
    });
    list.querySelectorAll('[data-mark-notification]').forEach((button) => {
        button.addEventListener('click', () => markNotificationAsRead(button.dataset.markNotification));
    });
    list.querySelectorAll('[data-delete-notification]').forEach((button) => {
        button.addEventListener('click', () => deleteNotification(button.dataset.deleteNotification));
    });
}

async function markNotificationAsRead(notificationId) {
    try {
        await firestore.collection('notifications').doc(notificationId).set({ read: true, updatedAt: new Date() }, { merge: true });
        state.notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
        renderNotifications();
        createToast('Notification marked as read.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to update the notification.', 'error');
    }
}

async function deleteNotification(notificationId) {
    try {
        await firestore.collection('notifications').doc(notificationId).set({ read: true, isDeleted: true, updatedAt: new Date() }, { merge: true });
        state.notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true, isDeleted: true } : item));
        renderNotifications();
        createToast('Notification deleted.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to delete the notification.', 'error');
    }
}

async function clearAllNotifications() {
    const visible = state.notifications.filter((item) => !item.isDeleted);
    if (!visible.length) return;
    try {
        await Promise.all(visible.map((item) => firestore.collection('notifications').doc(item.id).set({ read: true, isDeleted: true, updatedAt: new Date() }, { merge: true })));
        state.notifications = state.notifications.map((item) => (visible.some((entry) => entry.id === item.id) ? { ...item, read: true, isDeleted: true } : item));
        renderNotifications();
        createToast('All notifications cleared.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to clear the notifications.', 'error');
    }
}

function renderFavorites() {
    document.getElementById('favoritesList').innerHTML = state.favorites.length ? state.favorites.map((favorite) => {
        if (favorite.type === 'menuItem' && favorite.menuItem) {
            const item = favorite.menuItem;
            const restaurant = state.restaurants.find((entry) => entry.id === item.restaurantId || entry.id === favorite.restaurantId);
            const isFavorite = true;
            return `
            <div class="item-card">
              <img src="${getImageUrl(item.imageFilename || item.image || '')}" alt="${item.name}" onerror="this.src='./images/placeholder.png'" />
              <div class="panel-card-header"><strong>${item.name}</strong><span class="badge">${formatCurrency(item.price || 0)}</span></div>
              <div class="muted card-description">${item.restaurantDescription || item.description || 'Freshly prepared and ready to order.'}</div>
              <div class="muted">${restaurant?.name || 'Restaurant'}</div>
              <div class="modal-actions">
                <button class="primary-btn" data-add-order="${item.id}">Add to cart</button>
                <button class="${getFavoriteButtonClass(isFavorite)}" data-favorite-item="${item.id}" aria-pressed="true">${getFavoriteIcon(isFavorite)}</button>
              </div>
            </div>`;
        }
        if (favorite.type === 'restaurant' && favorite.restaurant) {
            const restaurant = favorite.restaurant;
            return `
            <div class="item-card">
              <img src="${getRestaurantImageUrl(restaurant)}" alt="${restaurant.name}" onerror="this.src='./images/placeholder.png'" />
              <div class="panel-card-header"><strong>${restaurant.name}</strong><span class="badge">${getCategoryDisplayName(restaurant.category || 'Food')}</span></div>
              <div class="muted card-description">${restaurant.description || 'A favorite place to order from.'}</div>
              <div class="modal-actions">
                <button class="primary-btn" data-open-restaurant="${restaurant.id}">View Menu</button>
                <button class="${getFavoriteButtonClass(true)}" data-favorite-restaurant="${restaurant.id}" aria-pressed="true">${getFavoriteIcon(true)}</button>
              </div>
            </div>`;
        }
        return `
        <div class="item-card">
          <strong>${favorite.name || 'Favorite'}</strong>
          <div class="muted">${favorite.type || 'favorite'}</div>
        </div>`;
    }).join('') : '<div class="empty-state">No saved favorites yet.</div>';
    document.querySelectorAll('[data-add-order]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.addOrder)));
    document.querySelectorAll('[data-favorite-item]').forEach((button) => button.addEventListener('click', () => toggleFavoriteItem(button.dataset.favoriteItem)));
    document.querySelectorAll('[data-open-restaurant]').forEach((button) => button.addEventListener('click', () => openRestaurant(button.dataset.openRestaurant)));
    document.querySelectorAll('[data-favorite-restaurant]').forEach((button) => button.addEventListener('click', () => toggleFavoriteRestaurant(button.dataset.favoriteRestaurant)));
}

// Keep the checkout flow tied to the single active delivery address saved for the customer.
function getActiveAddress() {
    return state.addresses.find((entry) => entry.isActive === true) || state.addresses[0] || null;
}

function getAddressSummary(address) {
    if (!address) return '';
    return [address.label || 'Address', address.street || '', address.city || '', address.deliveryDetails || address.details || ''].filter(Boolean).join(' • ');
}

async function setActiveAddress(addressId) {
    if (!state.authUser?.uid || !addressId) return;
    try {
        const batch = firestore.batch();
        state.addresses.forEach((address) => {
            const ref = firestore.collection('users').doc(state.authUser.uid).collection('addresses').doc(address.id);
            batch.update(ref, { isActive: address.id === addressId, updatedAt: new Date() });
        });
        await batch.commit();
        createToast('Active delivery address updated.', 'success');
    } catch (error) {
        createToast(error.message || 'Unable to update your address.', 'error');
    }
}

// Present a lightweight location form so new addresses can be stored and activated immediately.
function openAddAddressModal() {
    openModal('Add New Location', `
      <form id="addAddressForm" class="stack">
        <label>Label<input name="label" value="Home" required /></label>
        <label>Street<input name="street" required /></label>
        <label>City<input name="city" required /></label>
        <label>Delivery details<textarea name="deliveryDetails"></textarea></label>
        <label>Latitude (optional)<input name="latitude" type="number" step="any" /></label>
        <label>Longitude (optional)<input name="longitude" type="number" step="any" /></label>
      </form>
    `);
    const actions = document.getElementById('modalActions');
    actions.innerHTML = '<button class="ghost-btn" id="cancelAddressModal">Cancel</button><button class="primary-btn" id="saveAddressModal">Save address</button>';
    document.getElementById('cancelAddressModal')?.addEventListener('click', closeModal);
    document.getElementById('saveAddressModal')?.addEventListener('click', async () => {
        const form = document.getElementById('addAddressForm');
        const formData = new FormData(form);
        const label = String(formData.get('label') || '').trim();
        const street = String(formData.get('street') || '').trim();
        const city = String(formData.get('city') || '').trim();
        const deliveryDetails = String(formData.get('deliveryDetails') || '').trim();
        const latitude = formData.get('latitude') ? Number(formData.get('latitude')) : null;
        const longitude = formData.get('longitude') ? Number(formData.get('longitude')) : null;
        if (!label || !street || !city) {
            createToast('Please provide a label, street, and city.', 'warning');
            return;
        }
        try {
            const batch = firestore.batch();
            const newDocRef = firestore.collection('users').doc(state.authUser.uid).collection('addresses').doc();
            batch.set(newDocRef, {
                ownerId: state.authUser.uid,
                label,
                street,
                city,
                deliveryDetails,
                coordinates: Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            state.addresses.forEach((address) => {
                if (address.id) {
                    const ref = firestore.collection('users').doc(state.authUser.uid).collection('addresses').doc(address.id);
                    batch.update(ref, { isActive: false, updatedAt: new Date() });
                }
            });
            await batch.commit();
            closeModal();
            createToast('New delivery address saved and activated.', 'success');
        } catch (error) {
            createToast(error.message || 'Unable to save the new address.', 'error');
        }
    });
}

function renderProfileForm() {
    const form = document.getElementById('profileForm');
    const profile = state.customerProfile || {};
    form.innerHTML = `
    <label>Full Name<input name="displayName" value="${profile.displayName || ''}" /></label>
    <label>Phone<input name="phone" value="${profile.phone || ''}" /></label>
    <label>Email<input name="email" value="${profile.email || ''}" /></label>
    <label>Address<input name="address" value="${profile.address || ''}" /></label>
    ${getQRCardHTML('customerQrContainer', 'customerQrCard')}
  `;
    initQRCode('customerQrContainer');
    bindQRDownloadHandlers();
    renderLocationPicker();
    document.getElementById('addressList').innerHTML = `
      <div class="action-row" style="margin-bottom: 8px;">
        <button class="primary-btn" id="addAddressButton" type="button">Add New Location</button>
      </div>
      ${state.addresses.length ? state.addresses.map((address) => `
        <div class="item-card ${address.isActive ? 'checkout-address-card active' : ''}">
          <div class="panel-card-header">
            <strong>${escapeHtml(address.label || 'Address')}</strong>
            <span class="badge">${address.isActive ? 'Active' : 'Saved'}</span>
          </div>
          <div class="muted">${escapeHtml(getAddressSummary(address))}</div>
          <div class="modal-actions">
            <button class="ghost-btn" type="button" data-set-active-address="${address.id}" ${address.isActive ? 'disabled' : ''}>${address.isActive ? 'Active' : 'Set as active'}</button>
          </div>
        </div>`).join('') : '<div class="empty-state">No saved addresses yet.</div>'}
    `;
    document.getElementById('addAddressButton')?.addEventListener('click', openAddAddressModal);
    document.querySelectorAll('[data-set-active-address]').forEach((button) => {
        button.addEventListener('click', () => setActiveAddress(button.dataset.setActiveAddress));
    });
}

function renderLocationPicker() {
    const card = document.getElementById('locationPickerCard');
    if (!card) return;
    card.innerHTML = `
    <div class="item-card">
      <div class="panel-card-header">
        <div><strong>Pick a delivery spot</strong><div class="muted">Use your current position or drag the pin.</div></div>
      </div>
      <div class="map-toolbar">
        <button class="primary-btn" id="useMyLocationButton" type="button">Auto location</button>
        <button class="ghost-btn" id="stopTrackingButton" type="button">Stop tracking</button>
      </div>
      <div id="locationMap" class="location-map"></div>
      <div id="locationStatus" class="map-status">Tap Auto location to follow your device in real time.</div>
      <div class="form-grid" style="margin-top: 12px;">
        <label>Label<input id="locationLabel" value="Home" /></label>
        <label>Landmark / nearby reference<input id="locationLandmark" /></label>
        <label>Neighborhood / area<input id="locationNeighborhood" /></label>
        <label>Delivery instructions<textarea id="locationDetails"></textarea></label>
        <button class="primary-btn" id="saveLocationButton" type="button">Save location</button>
      </div>
      <div class="location-chip-row" style="margin-top: 12px;">
        ${state.locations.length ? state.locations.map((location) => `<button class="location-chip" type="button" data-select-location="${location.id}">${escapeHtml(location.label || 'Location')}</button>`).join('') : '<div class="empty-state">No saved locations yet.</div>'}
      </div>
    </div>`;
    document.getElementById('saveLocationButton')?.addEventListener('click', saveCustomerLocation);
    document.getElementById('useMyLocationButton')?.addEventListener('click', handleAutoLocate);
    document.getElementById('stopTrackingButton')?.addEventListener('click', stopLiveLocationTracking);
    document.querySelectorAll('[data-select-location]').forEach((button) => button.addEventListener('click', () => selectSavedLocation(button.dataset.selectLocation)));
    initLocationPickerMap('locationMap', 'locationStatus');
}

function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function initLocationPickerMap(containerId = 'locationMap', statusElementId = 'locationStatus') {
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer || typeof window.L === 'undefined') return;

    if (locationMap) {
        locationMap.remove();
        locationMap = null;
        locationMarker = null;
        locationAccuracyCircle = null;
    }

    const fallbackLat = defaultLocation.lat;
    const fallbackLng = defaultLocation.lng;

    const streetLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    });
    const satelliteLayer = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
    });
    const terrainLayer = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; OpenTopoMap contributors'
    });

    locationMap = window.L.map(containerId, {
        zoomControl: false,
        worldCopyJump: true,
        layers: [satelliteLayer]
    }).setView([fallbackLat, fallbackLng], 13);

    window.L.control.zoom({ position: 'bottomright' }).addTo(locationMap);
    window.L.control.layers({
        'Satellite': satelliteLayer,
        'Street': streetLayer,
        'Terrain': terrainLayer
    }, null, { position: 'topright' }).addTo(locationMap);
    window.L.control.scale({ position: 'bottomleft' }).addTo(locationMap);

    const markerIcon = window.L.divIcon({
        html: '<div class="location-pin"></div>',
        className: 'location-pin-wrapper',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

    const initialPosition = { lat: fallbackLat, lng: fallbackLng };
    locationMarker = window.L.marker([initialPosition.lat, initialPosition.lng], { draggable: true, icon: markerIcon }).addTo(locationMap);
    locationAccuracyCircle = window.L.circle([initialPosition.lat, initialPosition.lng], { radius: 0, color: '#f97316', fillColor: '#fb923c', fillOpacity: 0.18 }).addTo(locationMap);

    locationMarker.on('dragend', async () => {
        stopLiveLocationTracking(false);
        const latLng = locationMarker.getLatLng();
        locationMap.panTo([latLng.lat, latLng.lng]);
        locationAccuracyCircle.setLatLng([latLng.lat, latLng.lng]);
        locationAccuracyCircle.setRadius(40);
        updateLocationStatus('Pin moved manually. Refining the address…', statusElementId);
        await maybeReverseGeocode(latLng.lat, latLng.lng, statusElementId, 'manual');
        state.cart.selectedLocationId = '';
    });

    locationMap.on('click', async (event) => {
        stopLiveLocationTracking(false);
        const latLng = event.latlng;
        locationMarker.setLatLng(latLng);
        locationAccuracyCircle.setLatLng(latLng);
        locationAccuracyCircle.setRadius(40);
        locationMap.panTo(latLng);
        updateLocationStatus('Pin placed manually. Refining the address…', statusElementId);
        await maybeReverseGeocode(latLng.lat, latLng.lng, statusElementId, 'manual');
    });

    if (navigator.geolocation && window.isSecureContext) {
        navigator.geolocation.getCurrentPosition((position) => {
            const latLng = { lat: position.coords.latitude, lng: position.coords.longitude };
            applyLocationToMap(latLng.lat, latLng.lng, position.coords.accuracy || 40, `Ready • Accuracy ±${Math.round(position.coords.accuracy || 0)}m`, { zoom: 16, pan: false }, statusElementId);
            locationMapReady = true;
        }, () => {
            locationMap.setView([fallbackLat, fallbackLng], 13);
            locationMarker.setLatLng([fallbackLat, fallbackLng]);
            locationAccuracyCircle.setLatLng([fallbackLat, fallbackLng]);
            locationAccuracyCircle.setRadius(40);
            locationMapReady = true;
            updateLocationStatus('Using Monrovia as the default starting point.', statusElementId);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    } else {
        locationMap.setView([fallbackLat, fallbackLng], 13);
        locationMarker.setLatLng([fallbackLat, fallbackLng]);
        locationAccuracyCircle.setLatLng([fallbackLat, fallbackLng]);
        locationAccuracyCircle.setRadius(40);
        locationMapReady = true;
        updateLocationStatus(window.isSecureContext ? 'Using Monrovia as the default starting point.' : 'Open this page over HTTPS or localhost to use live device location.', statusElementId);
    }

    setTimeout(() => locationMap.invalidateSize(), 220);
}

function applyLocationToMap(lat, lng, accuracy, message, options = {}, statusElementId = 'locationStatus') {
    if (!locationMap || !locationMarker) return;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
    locationMap.setView([nextLat, nextLng], options.zoom || 16);
    if (options.pan !== false) {
        locationMap.panTo([nextLat, nextLng]);
    }
    locationMarker.setLatLng([nextLat, nextLng]);
    if (locationAccuracyCircle) {
        locationAccuracyCircle.setLatLng([nextLat, nextLng]);
        locationAccuracyCircle.setRadius(Math.max(25, Number(accuracy) || 40));
    }
    updateLocationStatus(message, statusElementId);
}

function updateLocationStatus(message, statusElementId = 'locationStatus') {
    const status = document.getElementById(statusElementId);
    if (status) {
        status.textContent = message;
    }
}

async function reverseGeocodeLatLng(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        if (!response.ok) throw new Error('Geocoding unavailable');
        const payload = await response.json();
        const address = payload.address || {};
        const fullAddress = [
            address.house_number,
            address.road,
            address.suburb || address.neighbourhood || address.village || address.town || address.city || address.county,
            address.city || address.town || address.village || address.state || address.county,
            address.postcode,
            address.country
        ].filter(Boolean).join(', ');
        return {
            latitude: Number(lat),
            longitude: Number(lng),
            address: fullAddress,
            country: address.country || '',
            state: address.state || address.region || '',
            county: address.county || '',
            city: address.city || address.town || address.village || '',
            district: address.suburb || address.neighbourhood || address.village || '',
            street: address.road || '',
            houseNumber: address.house_number || '',
            postalCode: address.postcode || '',
            fullAddress,
            landmark: payload.name || ''
        };
    } catch (error) {
        console.warn('Reverse geocoding failed', error);
        return null;
    }
}

function maybeReverseGeocode(lat, lng, statusElementId = 'locationStatus', source = 'manual') {
    if (locationReverseGeocodeTimer) {
        window.clearTimeout(locationReverseGeocodeTimer);
    }
    locationReverseGeocodeTimer = window.setTimeout(async () => {
        const result = await reverseGeocodeLatLng(lat, lng);
        if (!result) {
            updateLocationStatus('Address lookup is temporarily unavailable. You can still save the coordinates.', statusElementId);
            return;
        }
        state.checkoutLocationSelection = {
            ...state.checkoutLocationSelection,
            latitude: result.latitude,
            longitude: result.longitude,
            address: result.fullAddress,
            country: result.country,
            state: result.state,
            city: result.city,
            district: result.district,
            street: result.street,
            houseNumber: result.houseNumber,
            postalCode: result.postalCode,
            fullAddress: result.fullAddress,
            landmark: result.landmark,
            accuracy: 20,
            timestamp: new Date().toISOString(),
            source
        };
        const addressInput = document.getElementById('deliveryAddressInput');
        if (addressInput && result.fullAddress) {
            addressInput.value = result.fullAddress;
        }
        const preview = document.getElementById('checkoutLocationPreview');
        if (preview) {
            preview.innerHTML = `<div class="muted">${escapeHtml(result.fullAddress || 'Delivery location set')}</div>`;
        }
        updateLocationStatus(`Location ready • ${result.fullAddress}`, statusElementId);
        createToast('Location refined. Review it and confirm before placing your order.', 'success');
    }, 280);
}

async function tryApproximateNetworkLocation() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error('Network lookup failed');
        const data = await response.json();
        if (Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
            return { lat: Number(data.latitude), lng: Number(data.longitude), accuracy: 1200 };
        }
    } catch (error) {
        console.warn('Approximate location lookup failed', error);
    }
    return null;
}

function stopLiveLocationTracking(showToast = true) {
    if (locationWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchId);
    }
    locationWatchId = null;
    isTrackingLocation = false;
    if (showToast) createToast('Live tracking stopped.', 'info');
}

async function handleAutoLocate() {
    if (!navigator.geolocation) {
        createToast('Geolocation is not supported on this device.', 'error');
        return;
    }

    if (!window.isSecureContext) {
        updateLocationStatus('Open this page over HTTPS or localhost to use live device location.');
        createToast('Please use HTTPS or localhost for device-location access.', 'info');
        return;
    }

    updateLocationStatus('Finding your location…');
    stopLiveLocationTracking(false);

    navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 40;
        applyLocationToMap(lat, lng, accuracy, `Tracking live • Accuracy ±${Math.round(accuracy)}m`, { zoom: 16, pan: true });
        isTrackingLocation = true;

        locationWatchId = navigator.geolocation.watchPosition((nextPosition) => {
            const nextLat = nextPosition.coords.latitude;
            const nextLng = nextPosition.coords.longitude;
            const nextAccuracy = nextPosition.coords.accuracy || 40;
            applyLocationToMap(nextLat, nextLng, nextAccuracy, `Tracking live • Accuracy ±${Math.round(nextAccuracy)}m`, { zoom: 16, pan: true });
        }, () => {
            updateLocationStatus('Live tracking paused. Try again if needed.');
        }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    }, async () => {
        const approx = await tryApproximateNetworkLocation();
        if (approx) {
            applyLocationToMap(approx.lat, approx.lng, approx.accuracy, 'Using approximate network location. You can place the pin manually if needed.', { zoom: 13, pan: true });
            createToast('Precise device location was not available; using an approximate network position.', 'info');
        } else {
            applyLocationToMap(defaultLocation.lat, defaultLocation.lng, 40, 'Unable to access your device location. You can place the pin manually.', { zoom: 13, pan: true });
        }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

function selectSavedLocation(locationId) {
    const location = state.locations.find((entry) => entry.id === locationId);
    if (!location || !locationMap || !locationMarker) return;
    const lat = Number(location.lat || 6.3113);
    const lng = Number(location.lng || -10.8014);
    locationMap.setView([lat, lng], 15);
    locationMarker.setLatLng([lat, lng]);
    if (document.getElementById('locationLabel')) document.getElementById('locationLabel').value = location.label || 'Home';
    if (document.getElementById('locationLandmark')) document.getElementById('locationLandmark').value = location.landmark || '';
    if (document.getElementById('locationNeighborhood')) document.getElementById('locationNeighborhood').value = location.neighborhood || '';
    if (document.getElementById('locationDetails')) document.getElementById('locationDetails').value = location.details || '';
}

function setButtonBusy(button, label) {
    if (!button) return;
    button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
    button.disabled = true;
    button.textContent = label;
    button.classList.add('is-busy');
}

function clearButtonBusy(button) {
    if (!button) return;
    button.disabled = false;
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.classList.remove('is-busy');
}

function buildDeliveryLocationPayload(selectedLocation = null) {
    const lat = Number(selectedLocation?.lat || state.checkoutLocationSelection?.latitude || null);
    const lng = Number(selectedLocation?.lng || state.checkoutLocationSelection?.longitude || null);
    const address = selectedLocation?.details || state.checkoutLocationSelection?.fullAddress || state.checkoutLocationSelection?.address || '';
    const accuracy = Number(state.checkoutLocationSelection?.accuracy || selectedLocation?.accuracy || 0);
    return {
        address,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        source: state.checkoutLocationSelection?.source || (selectedLocation ? 'saved' : 'manual')
    };
}

async function syncActiveOrderLocation(address, locationPayload = null) {
    if (!state.authUser?.uid || !state.orders.length) return;
    const activeStatuses = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'refund_requested'];
    const targetOrders = state.orders.filter((order) => order.customerUid === state.authUser.uid && activeStatuses.includes(order.status));
    if (!targetOrders.length) return;
    const updates = {
        address: address || '',
        deliveryLocation: locationPayload || null,
        updatedAt: new Date()
    };
    await Promise.all(targetOrders.map((order) => firestore.collection('orders').doc(order.id).set(updates, { merge: true })));
}

async function saveCustomerLocation() {
    if (!state.authUser) return;
    const button = document.getElementById('saveLocationButton');
    setButtonBusy(button, 'Saving…');
    const label = document.getElementById('locationLabel')?.value.trim() || 'Home';
    const landmark = document.getElementById('locationLandmark')?.value.trim() || '';
    const neighborhood = document.getElementById('locationNeighborhood')?.value.trim() || '';
    const details = document.getElementById('locationDetails')?.value.trim() || '';
    const position = locationMarker?.getLatLng?.();
    if (!position) return;

    try {
        const serverTimestamp = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
        const savedRef = await firestore.collection('users').doc(state.authUser.uid).collection('customerLocations').add({
            ownerId: state.authUser.uid,
            label,
            landmark,
            neighborhood,
            details,
            lat: Number(position.lat),
            lng: Number(position.lng),
            createdAt: serverTimestamp
        });
        const { GeoPoint } = window.firebase?.firestore || {};
        if (GeoPoint) {
            await firestore.collection('users').doc(state.authUser.uid).set({
                geopoint: new GeoPoint(Number(position.lat), Number(position.lng)),
                deliveryAddress: {
                    label,
                    landmark,
                    neighborhood,
                    details,
                    latitude: Number(position.lat),
                    longitude: Number(position.lng)
                },
                updatedAt: serverTimestamp
            }, { merge: true });
        }
        state.cart.selectedLocationId = savedRef.id;
        saveCartToStorage();
        createToast('Location saved successfully.', 'success');
        renderProfileForm();
    } catch (error) {
        createToast(error.message || 'Could not save this location.', 'error');
    } finally {
        clearButtonBusy(button);
    }
}

function renderSettingsForm() {
    const form = document.getElementById('settingsForm');
    form.innerHTML = `
    <label><input type="checkbox" checked /> Enable notifications</label>
    <label><input type="checkbox" checked /> Dark theme</label>
    <button class="primary-btn" id="changePasswordButton" type="button">Change Password</button>
  `;
    document.getElementById('changePasswordButton').addEventListener('click', () => createToast('Password reset is available through Firebase Auth.', 'info'));
}

function renderHelpSession() {
    const formContainer = document.getElementById('helpSessionContent');
    const articlesContainer = document.getElementById('helpArticlesList');
    if (!formContainer || !articlesContainer) return;
    formContainer.innerHTML = `
      <div class="panel-card">
        <div class="panel-card-header">
          <h4>Need help?</h4>
          <span class="badge">Send a suggestion to MANNA</span>
        </div>
        <form id="helpRequestForm" class="form-grid">
          <label>Topic<select name="category"><option value="orders">Orders</option><option value="account">Account</option><option value="payments">Payments</option><option value="technical">Technical</option><option value="other">Other</option></select></label>
          <label class="full">Message<textarea name="message" required placeholder="Tell us what you need help with."></textarea></label>
          <label>Email<input name="email" value="${state.authUser?.email || ''}" /></label>
          <div class="modal-actions"><button class="primary-btn" type="submit">Send suggestion</button></div>
        </form>
      </div>`;
    if (!document.getElementById('helpArticleCategoryFilter')) {
        articlesContainer.insertAdjacentHTML('beforebegin', `
          <div class="help-filter-row">
            <select id="helpArticleCategoryFilter">
              <option value="">All categories</option>
              <option value="getting started">Getting started</option>
              <option value="orders">Orders</option>
              <option value="payments">Payments</option>
              <option value="account">Account</option>
              <option value="delivery">Delivery</option>
              <option value="technical">Technical</option>
            </select>
            <input id="helpArticleTagFilter" type="text" placeholder="Filter by tag" />
          </div>`);
        document.getElementById('helpArticleCategoryFilter')?.addEventListener('change', renderHelpArticles);
        document.getElementById('helpArticleTagFilter')?.addEventListener('input', renderHelpArticles);
    }
    document.getElementById('helpRequestForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        const payload = {
            panel: 'customer',
            category: String(data.category || 'other'),
            subject: String(data.category || 'Support request'),
            message: String(data.message || '').trim(),
            email: String(data.email || state.authUser?.email || '').trim(),
            userId: state.authUser?.uid || '',
            status: 'new',
            createdAt: new Date()
        };
        if (!payload.message) {
            createToast('Please describe your issue before sending.', 'warning');
            return;
        }
        try {
            await firestore.collection('supportRequests').add(payload);
            form.reset();
            createToast('Support request sent. The admin team will review it.', 'success');
        } catch (error) {
            createToast(error.message || 'Unable to send support request.', 'error');
        }
    });
    renderHelpArticles();
}

function renderHelpArticles() {
    const container = document.getElementById('helpArticlesList');
    if (!container) return;
    const categoryFilter = String(document.getElementById('helpArticleCategoryFilter')?.value || '').trim().toLowerCase();
    const tagFilter = String(document.getElementById('helpArticleTagFilter')?.value || '').trim().toLowerCase();
    const filteredArticles = state.helpArticles.filter((article) => {
        const matchesCategory = !categoryFilter || String(article.category || '').trim().toLowerCase() === categoryFilter;
        const tags = Array.isArray(article.tags) ? article.tags : String(article.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
        const tagText = tags.join(' ').toLowerCase();
        const matchesTag = !tagFilter || tagText.includes(tagFilter);
        return matchesCategory && matchesTag;
    });
    const featuredArticles = filteredArticles.filter((article) => Boolean(article.featured));
    const regularArticles = filteredArticles.filter((article) => !article.featured);
    const renderArticleCard = (article) => `
      <div class="help-card">
        <img src="${article.image ? `images/help-video-images/${article.image}` : 'images/placeholders/wrap.jpg'}" alt="${article.title || 'Help guide'}" onerror="this.src='images/placeholders/wrap.jpg'" />
        <div class="help-card__body">
          <h4>${article.title || 'Help article'}</h4>
          <p>${article.description || ''}</p>
          <div class="action-row" style="flex-wrap: wrap; gap: 8px;">
            ${article.featured ? '<span class="badge featured-badge">📌 Featured</span>' : ''}
            ${article.category ? `<span class="badge">${article.category}</span>` : ''}
            ${(Array.isArray(article.tags) ? article.tags : String(article.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean)).map((tag) => `<span class="badge">${tag}</span>`).join('')}
          </div>
          <div class="action-row">
            ${article.videoUrl ? `<a class="primary-btn" href="${article.videoUrl}" target="_blank" rel="noopener noreferrer">Watch Video</a>` : '<span class="badge">Video coming soon</span>'}
          </div>
        </div>
      </div>`;
    container.innerHTML = filteredArticles.length ? `
      <div class="stack">
        ${featuredArticles.length ? `<div class="help-featured-section"><div class="panel-card-header"><h4>Featured guides</h4></div>${featuredArticles.map(renderArticleCard).join('')}</div>` : ''}
        ${regularArticles.length ? `<div class="help-featured-section"><div class="panel-card-header"><h4>More guides</h4></div>${regularArticles.map(renderArticleCard).join('')}</div>` : ''}
      </div>` : '<div class="empty-state">No help articles match the current filters.</div>';
}

function showSection(section) {
    if (section === 'cart') {
        section = 'checkout';
    }
    state.activeSection = section;
    setActiveNavigation(section);
    setMobileNavOpen(false);
    sectionPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${section}Section`));
    if (section === 'checkout') {
        renderCheckout();
    } else if (section === 'orders') {
        renderOrders();
    } else if (section === 'favorites') {
        renderFavorites();
    } else if (section === 'notifications') {
        renderNotifications();
    } else if (section === 'restaurants') {
        renderRestaurants();
    } else if (section === 'home') {
        renderHome();
    } else if (section === 'help') {
        renderHelpSession();
    }
    const titleMap = {
        home: ['Home', 'Find food, place orders, and track deliveries.'],
        restaurants: ['Restaurants', 'Browse approved restaurants and their menus.'],
        restaurantDetail: ['Restaurant', 'View dishes and add them to your cart.'],
        orders: ['Orders', 'Track active and completed orders.'],
        favorites: ['Favorites', 'Your saved restaurants and food.'],
        profile: ['Profile', 'Manage your address and personal details.'],
        settings: ['Settings', 'Adjust your experience and preferences.'],
        checkout: ['Checkout', 'Complete your order with mobile money.'],
        help: ['Help Center', 'Find quick guides and support material for customers.']
    };
    const [title, subtitle] = titleMap[section] || titleMap.home;
    pageTitle.textContent = title;
    pageSubtitle.textContent = subtitle;
}

function hydrateCartFromStorage() {
    try {
        const stored = JSON.parse(localStorage.getItem('manna-customer-cart') || 'null');
        if (stored) {
            state.cart = normalizeCartState(stored);
        } else {
            state.cart = normalizeCartState(state.cart);
        }
        updateCartSummary();
    } catch (error) {
        console.error(error);
        state.cart = normalizeCartState(state.cart);
    }
}

function saveCartToStorage() {
    localStorage.setItem('manna-customer-cart', JSON.stringify(state.cart));
}

function updateCartSummary() {
    const count = state.cart.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
    cartCount.textContent = count;
}

function getCartItems() {
    return state.cart.items.map((entry) => ({ ...entry, menuItem: state.menuItems.find((menuItem) => menuItem.id === entry.menuItemId) })).filter((entry) => entry.menuItem);
}

function normalizeImagePath(value, folder = 'products') {
    if (!value) return '';
    const normalized = String(value).trim();
    if (!normalized) return '';
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) return normalized.replace(/^\.\//, '').replace(/^\//, '');
    if (normalized.startsWith('images/')) return normalized;
    return `images/${folder}/${normalized}`;
}

async function addToCart(menuItemId) {
    const selectedItem = state.menuItems.find((item) => item.id === menuItemId);
    if (!selectedItem) return;
    const button = document.querySelector(`[data-add-order="${menuItemId}"]`);
    const restaurantId = selectedItem.restaurantId || state.selectedRestaurant?.id || state.cart.restaurantId;
    if (button) setButtonBusy(button, 'Preparing…');
    const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
    const paymentDetails = resolveRestaurantPaymentDetails(restaurant, state.cart);
    state.cart = normalizeCartState({
        ...state.cart,
        restaurantId,
        restaurantName: restaurant?.name || state.cart.restaurantName || 'Restaurant',
        restaurantPaymentReceiver: paymentDetails.restaurantPaymentReceiver,
        restaurantAcceptedPaymentMethods: paymentDetails.acceptedPaymentMethods,
        items: [{ menuItemId, quantity: 1, variations: [], addons: [], notes: '' }],
        selectedAddonId: ''
    });
    saveCartToStorage();
    updateCartSummary();
    createToast(`${selectedItem.name} is ready for checkout.`, 'success');
    showSection('checkout');
    renderCheckout();
}

function renderCart() {
    const items = getCartItems();
    document.getElementById('cartContent').innerHTML = items.length ? items.map((entry) => `
    <div class="item-card cart-item-card">
      <img src="${getImageUrl(entry.menuItem?.imageFilename || entry.menuItem?.image || '')}" alt="${entry.menuItem?.name || 'Item'}" onerror="this.src='./images/placeholder.png'" />
      <div class="panel-card-header"><strong>${entry.menuItem?.name || 'Item'}</strong><span>${formatCurrency((entry.menuItem?.price || 0) * entry.quantity)}</span></div>
      <div class="muted">${entry.menuItem?.restaurantDescription || 'Freshly prepared for delivery.'}</div>
      <div class="cart-actions-row">
        <div class="cart-quantity-control">
          <button class="cart-qty-btn" data-cart-decrease="${entry.menuItemId}" type="button" aria-label="Decrease quantity">−</button>
          <input class="cart-qty-input" type="number" min="1" value="${entry.quantity}" data-cart-quantity-input="${entry.menuItemId}" aria-label="Quantity" />
          <button class="cart-qty-btn" data-cart-increase="${entry.menuItemId}" type="button" aria-label="Increase quantity">+</button>
        </div>
        <button class="ghost-btn cart-remove-btn" data-cart-remove="${entry.menuItemId}" type="button">Remove</button>
      </div>
    </div>`).join('') : '<div class="empty-state">Your cart is empty.</div>';
    document.querySelectorAll('[data-cart-decrease]').forEach((button) => button.addEventListener('click', () => adjustCartQuantity(button.dataset.cartDecrease, -1)));
    document.querySelectorAll('[data-cart-increase]').forEach((button) => button.addEventListener('click', () => adjustCartQuantity(button.dataset.cartIncrease, 1)));
    document.querySelectorAll('[data-cart-quantity-input]').forEach((input) => input.addEventListener('change', (event) => {
        const menuItemId = event.target.dataset.cartQuantityInput;
        const nextQuantity = Number.parseInt(event.target.value, 10);
        if (!menuItemId) return;
        setCartQuantity(menuItemId, Number.isNaN(nextQuantity) ? 1 : nextQuantity);
    }));
    document.querySelectorAll('[data-cart-remove]').forEach((button) => button.addEventListener('click', () => removeCartItem(button.dataset.cartRemove)));
}

// Rebuild the checkout experience around a single selected product and its add-on choice.
function getAvailableAddonsForCurrentItem() {
    const checkoutItem = getCartItems()[0] || null;
    const addonIds = Array.isArray(checkoutItem?.menuItem?.addonIds) ? checkoutItem.menuItem.addonIds : [];
    return state.addons.filter((addon) => addonIds.includes(addon.id));
}

function renderCheckout() {
    state.cart = normalizeCartState(state.cart);
    const items = getCartItems();
    const checkoutItem = items[0] || null;
    const subtotal = checkoutItem ? (checkoutItem.menuItem?.price || 0) * checkoutItem.quantity : 0;
    const availableAddons = getAvailableAddonsForCurrentItem();
    const selectedAddon = availableAddons.find((option) => option.id === state.cart.selectedAddonId) || null;
    const addonTotal = selectedAddon ? selectedAddon.price : 0;
    const deliveryFee = Number(state.cart.deliveryFee || state.deliveryFee || 60);
    const total = subtotal + addonTotal + deliveryFee;
    const restaurant = state.restaurants.find((entry) => entry.id === state.cart.restaurantId);
    const paymentDetails = resolveRestaurantPaymentDetails(restaurant, state.cart);
    const paymentReceiverLabel = paymentDetails.restaurantPaymentReceiver || 'No payment receiver has been added yet for this restaurant.';
    const acceptedMethodsLabel = paymentDetails.acceptedPaymentMethods.length ? paymentDetails.acceptedPaymentMethods.map((method) => method.replace(/_/g, ' ')).join(', ') : 'Mobile money or cash';
    const activeAddress = getActiveAddress();
    const activeAddressLine = getAddressSummary(activeAddress) || state.customerProfile?.address || 'No active address';
    const coordinates = activeAddress?.coordinates?.latitude != null && activeAddress?.coordinates?.longitude != null ? `${activeAddress.coordinates.latitude}, ${activeAddress.coordinates.longitude}` : '';

    const paymentNumbers = getCurrentCheckoutPaymentNumbers();
    if (state.cart.restaurantId && !paymentNumbers.loaded && !paymentNumbers.loading) {
        void ensureCheckoutPaymentNumbers();
    }

    const availablePaymentMethods = [];
    if (paymentNumbers.orangeMoneyNumber) {
        availablePaymentMethods.push('orange_money');
    }
    if (paymentNumbers.lonestarMoneyNumber) {
        availablePaymentMethods.push('lonestar_mobile_money');
    }

    if (availablePaymentMethods.length && !availablePaymentMethods.includes(state.cart.paymentMethod)) {
        state.cart.paymentMethod = availablePaymentMethods[0];
        saveCartToStorage();
    }

    const selectedPaymentMethod = state.cart.paymentMethod || availablePaymentMethods[0] || 'orange_money';
    const selectedPaymentNumber = selectedPaymentMethod === 'orange_money' ? paymentNumbers.orangeMoneyNumber : paymentNumbers.lonestarMoneyNumber;
    const paymentMethodMeta = {
        orange_money: {
            label: 'Orange Money',
            image: './images/payments/orange.png',
            alt: 'Orange Money',
            template: (number, amount) => `*126*1*${number}*${amount}#`
        },
        lonestar_mobile_money: {
            label: 'Lonestar Cell',
            image: './images/payments/lonestar.png',
            alt: 'Lonestar Cell',
            template: (number, amount) => `*182*1*${number}*${amount}#`
        }
    };
    const activePaymentMeta = paymentMethodMeta[selectedPaymentMethod] || paymentMethodMeta.orange_money;
    const payableAmount = Math.max(1, Math.round(total));
    const ussdCode = selectedPaymentNumber ? activePaymentMeta.template(selectedPaymentNumber, payableAmount) : '';
    const isUnavailable = Boolean(selectedPaymentMethod && selectedPaymentNumber === '' && state.cart.restaurantId);
    const unavailableMessage = isUnavailable ? `This restaurant does not accept ${activePaymentMeta.label}. Please choose another method.` : '';

    document.getElementById('checkoutContent').innerHTML = `
    <div class="stack">
      <div class="item-card">
        <h4>Order summary</h4>
        ${checkoutItem ? `
          <div class="checkout-summary-row">
            <img src="${getImageUrl(checkoutItem.menuItem?.imageFilename || checkoutItem.menuItem?.image || '')}" alt="${checkoutItem.menuItem?.name || 'Item'}" onerror="this.src='./images/placeholder.png'" />
            <div>
              <strong>${escapeHtml(checkoutItem.menuItem?.name || 'Item')}</strong>
              <div class="muted">${escapeHtml(checkoutItem.menuItem?.restaurantDescription || 'Freshly prepared for delivery.')}</div>
            </div>
          </div>
        ` : '<div class="empty-state">No item selected. Choose a dish from the home page to begin checkout.</div>'}
        <p><strong>Subtotal:</strong> ${formatCurrency(subtotal)}</p>
        <p><strong>Delivery fee:</strong> ${formatCurrency(deliveryFee)}</p>
        <p><strong>Add-on:</strong> ${selectedAddon ? `${selectedAddon.name} (${formatCurrency(selectedAddon.price)})` : 'None'}</p>
        <p><strong>Total:</strong> ${formatCurrency(total)}</p>
        <div class="muted">Payment receiver: ${escapeHtml(paymentReceiverLabel)}</div>
        <div class="muted">Accepted methods: ${escapeHtml(acceptedMethodsLabel)}</div>
        ${restaurant?.phone ? `<div class="muted">Restaurant phone: ${escapeHtml(restaurant.phone)}</div>` : ''}
      </div>
      <div class="item-card">
        <div class="panel-card-header">
          <h4>Delivery address</h4>
          <button class="ghost-btn" data-section="profile" type="button">Manage in Profile</button>
        </div>
        <div class="checkout-address-card">
          <div class="muted">Only your active saved address is displayed here.</div>
          <input class="premium-input" type="text" value="${escapeHtml(activeAddressLine)}" readonly />
          ${coordinates ? `<input class="premium-input" type="text" value="${escapeHtml(coordinates)}" readonly />` : ''}
        </div>
      </div>
      <div class="item-card">
        <h4>Add-ons</h4>
        ${availableAddons.length ? `<div class="checkout-addon-grid">
          <label class="checkout-addon-card ${!selectedAddon ? 'active' : ''}">
            <input type="radio" name="checkoutAddon" value="" ${!selectedAddon ? 'checked' : ''} />
            <img src="./images/adds-on/bottle-water.png" alt="No add-on" onerror="this.src='./images/placeholder.png'" />
            <div class="checkout-addon-info">
              <strong>No add-on</strong>
              <span class="badge">Free</span>
            </div>
          </label>
          ${availableAddons.map((option) => `
            <label class="checkout-addon-card ${selectedAddon?.id === option.id ? 'active' : ''}">
              <input type="radio" name="checkoutAddon" value="${option.id}" ${selectedAddon?.id === option.id ? 'checked' : ''} />
              <img src="${getAddonImageUrl(option.imageFilename || option.image || '')}" alt="${escapeHtml(option.name)}" onerror="this.src='./images/placeholder.png'" />
              <div class="checkout-addon-info">
                <strong>${escapeHtml(option.name)}</strong>
                <span class="badge">${formatCurrency(option.price || 0)}</span>
              </div>
            </label>`).join('')}
        </div>` : '<div class="empty-state">This item has no optional add-ons configured.</div>'}
      </div>
      <form id="checkoutForm" class="stack">
        <div class="item-card">
          <h4>Quantity</h4>
          <div class="checkout-quantity-row">
            <button class="ghost-btn" type="button" data-checkout-decrease>−</button>
            <input class="premium-input" type="number" min="1" value="${checkoutItem?.quantity || 1}" data-checkout-quantity />
            <button class="ghost-btn" type="button" data-checkout-increase>+</button>
            <button class="danger-btn" type="button" id="removeCheckoutItemButton">Remove</button>
          </div>
          <label>Phone<input name="customerPhone" value="${state.customerProfile?.phone || ''}" required /></label>
          <label>Notes<textarea name="notes">${state.cart.notes || ''}</textarea></label>
        </div>
        <div class="item-card">
          <h4>Payment</h4>
          <div class="payment-method-selector">
            ${availablePaymentMethods.includes('orange_money') ? `<label class="payment-method-option ${selectedPaymentMethod === 'orange_money' ? 'selected' : ''}">
              <input type="radio" name="paymentMethod" value="orange_money" ${selectedPaymentMethod === 'orange_money' ? 'checked' : ''} />
              <img src="./images/payments/orange.png" alt="Orange Money" />
              <span>Orange Money</span>
            </label>` : ''}
            ${availablePaymentMethods.includes('lonestar_mobile_money') ? `<label class="payment-method-option ${selectedPaymentMethod === 'lonestar_mobile_money' ? 'selected' : ''}">
              <input type="radio" name="paymentMethod" value="lonestar_mobile_money" ${selectedPaymentMethod === 'lonestar_mobile_money' ? 'checked' : ''} />
              <img src="./images/payments/lonestar.png" alt="Lonestar Cell" />
              <span>Lonestar Cell</span>
            </label>` : ''}
          </div>
          <div class="muted">Restaurant payment receiver: ${escapeHtml(paymentReceiverLabel)}</div>
          ${isUnavailable ? `<div class="payment-unavailable-message">${escapeHtml(unavailableMessage)}</div>` : ussdCode ? `<div class="ussd-payment-card">
            <div class="ussd-code-label">USSD payment code</div>
            <div class="ussd-code" id="displayedUssdCode">${escapeHtml(ussdCode)}</div>
            <div class="ussd-actions">
              <button class="primary-btn" type="button" id="copyUssdButton">Copy Code</button>
              <button class="ghost-btn dial-button" type="button" id="dialUssdButton">Call</button>
            </div>
          </div>` : '<div class="empty-state">Select a payment method to view the USSD code.</div>'}
          <div class="premium-payment-fields">
            <label class="premium-field">
              <span class="premium-field-title">Payment phone number</span>
              <input class="premium-input" type="tel" name="paymentPhone" value="${state.cart.paymentPhone || ''}" placeholder="Enter your wallet number" required />
            </label>
            <label class="premium-field">
              <span class="premium-field-title">Payment ID number</span>
              <input class="premium-input" name="paymentDetails" value="${state.cart.paymentDetails || ''}" placeholder="Enter the payment reference or ID" required />
            </label>
          </div>
        </div>
      </form>
    </div>`;
    document.querySelectorAll('input[name="checkoutAddon"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            state.cart.selectedAddonId = event.target.value;
            saveCartToStorage();
            renderCheckout();
        });
    });
    document.querySelector('[data-checkout-decrease]')?.addEventListener('click', () => updateCheckoutQuantity(-1));
    document.querySelector('[data-checkout-increase]')?.addEventListener('click', () => updateCheckoutQuantity(1));
    document.querySelector('[data-checkout-quantity]')?.addEventListener('change', (event) => {
        const nextQuantity = Number.parseInt(event.target.value, 10);
        updateCheckoutQuantity(Number.isNaN(nextQuantity) ? 1 : nextQuantity, false);
    });
    document.getElementById('removeCheckoutItemButton')?.addEventListener('click', removeCheckoutItem);
    document.getElementById('removeCheckoutHeaderButton')?.addEventListener('click', removeCheckoutItem);
    document.querySelectorAll('.payment-method-option input[name="paymentMethod"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            state.cart.paymentMethod = radio.value;
            saveCartToStorage();
            renderCheckout();
        });
    });
    document.getElementById('copyUssdButton')?.addEventListener('click', () => {
        const code = document.getElementById('displayedUssdCode')?.textContent?.trim();
        if (!code) return;
        handleCopyUssd(code);
    });
    document.getElementById('dialUssdButton')?.addEventListener('click', () => {
        const code = document.getElementById('displayedUssdCode')?.textContent?.trim();
        if (!code) return;
        handleDialUssd(code);
    });
}

function setCartQuantity(menuItemId, quantity) {
    const item = state.cart.items.find((entry) => entry.menuItemId === menuItemId);
    if (!item) return;
    const nextQuantity = Math.max(0, Number(quantity) || 0);
    if (nextQuantity <= 0) {
        state.cart.items = state.cart.items.filter((entry) => entry.menuItemId !== menuItemId);
    } else {
        item.quantity = nextQuantity;
    }
    saveCartToStorage();
    updateCartSummary();
    renderCart();
}

function updateCheckoutQuantity(delta, relative = true) {
    if (!state.cart.items.length) {
        return;
    }
    const item = state.cart.items[0];
    const resolvedQuantity = relative
        ? Math.max(1, (item.quantity || 1) + delta)
        : Math.max(1, Number(delta || 1));
    item.quantity = resolvedQuantity;
    saveCartToStorage();
    updateCartSummary();
    renderCheckout();
}

function adjustCartQuantity(menuItemId, delta) {
    const item = state.cart.items.find((entry) => entry.menuItemId === menuItemId);
    if (!item) return;
    setCartQuantity(menuItemId, (item.quantity || 0) + delta);
}

function setCheckoutLocationBusy(button, label) {
    if (!button) return;
    button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
    button.disabled = true;
    button.textContent = label;
    button.classList.add('is-busy');
}

function clearCheckoutLocationBusy(button) {
    if (!button) return;
    button.disabled = false;
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.classList.remove('is-busy');
}

async function handleCheckoutLocationSelection() {
    const button = document.getElementById('autoChooseLocationButton');
    const confirmButton = document.getElementById('confirmCheckoutLocationButton');
    const status = document.getElementById('checkoutLocationStatus');
    setCheckoutLocationBusy(button, 'Finding your location…');
    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = '✔ Confirm Delivery Location';
    }
    if (status) {
        status.textContent = 'Finding your location…';
    }
    if (!navigator.geolocation) {
        createToast('Geolocation is not supported on this device.', 'error');
        clearCheckoutLocationBusy(button);
        return;
    }
    if (!window.isSecureContext) {
        createToast('Please use HTTPS or localhost for live location access.', 'info');
        clearCheckoutLocationBusy(button);
        return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 40;
        const locationResult = await reverseGeocodeLatLng(lat, lng);
        state.checkoutLocationSelection = {
            latitude: lat,
            longitude: lng,
            accuracy,
            address: locationResult?.fullAddress || '',
            country: locationResult?.country || '',
            state: locationResult?.state || '',
            city: locationResult?.city || '',
            district: locationResult?.district || '',
            street: locationResult?.street || '',
            houseNumber: locationResult?.houseNumber || '',
            postalCode: locationResult?.postalCode || '',
            fullAddress: locationResult?.fullAddress || '',
            landmark: locationResult?.landmark || '',
            timestamp: new Date().toISOString(),
            source: 'gps',
            locationConfirmed: false
        };
        const addressInput = document.getElementById('deliveryAddressInput');
        if (addressInput) {
            addressInput.value = state.checkoutLocationSelection.fullAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        }
        const preview = document.getElementById('checkoutLocationPreview');
        if (preview) {
            preview.innerHTML = `<div class="muted">${escapeHtml(state.checkoutLocationSelection.fullAddress || 'Delivery location set')}</div>`;
        }
        if (status) {
            status.textContent = `Location ready • ${state.checkoutLocationSelection.fullAddress || 'GPS coordinates captured'}`;
        }
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = '✔ Confirm Delivery Location';
        }
        applyLocationToMap(lat, lng, accuracy, `Location ready • ${state.checkoutLocationSelection.fullAddress || 'GPS coordinates captured'}`, { zoom: 16, pan: true }, 'checkoutLocationStatus');
        clearCheckoutLocationBusy(button);
        createToast('Live delivery location captured successfully.', 'success');
    }, async (error) => {
        let message = 'We could not access your location. Please try again.';
        if (error.code === 1) {
            message = 'Location permission was denied. Please allow access and try again.';
        } else if (error.code === 2) {
            message = 'Location is currently unavailable. Please try again or place the pin manually.';
        } else if (error.code === 3) {
            message = 'Location request timed out. Please try again.';
        }
        if (status) {
            status.textContent = message;
        }
        clearCheckoutLocationBusy(button);
        createToast(message, 'error');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function confirmCheckoutLocationSelection() {
    const button = document.getElementById('confirmCheckoutLocationButton');
    if (!state.checkoutLocationSelection) {
        createToast('Please choose a delivery location first.', 'info');
        return;
    }
    if (button) {
        setCheckoutLocationBusy(button, 'Confirmed');
    }
    state.checkoutLocationSelection.locationConfirmed = true;
    const addressInput = document.getElementById('deliveryAddressInput');
    if (addressInput) {
        addressInput.value = state.checkoutLocationSelection.fullAddress || addressInput.value;
    }
    createToast('Delivery location confirmed.', 'success');
}

function removeCartItem(menuItemId) {
    state.cart.items = state.cart.items.filter((entry) => entry.menuItemId !== menuItemId);
    saveCartToStorage();
    updateCartSummary();
    renderCart();
}

function removeCheckoutItem() {
    state.cart.items = [];
    state.cart.selectedAddonId = '';
    saveCartToStorage();
    updateCartSummary();
    createToast('Item removed. Choose another dish to continue.', 'info');
    showSection('home');
}

function isCustomerProfileComplete() {
    const hasAddress = Boolean(state.customerProfile?.address || getActiveAddress());
    return Boolean(state.customerProfile && state.customerProfile.displayName && state.customerProfile.phone && hasAddress);
}

function ensureCustomerProfileComplete() {
    if (isCustomerProfileComplete()) return true;
    createToast('Please complete your profile before placing an order.', 'warning');
    showSection('profile');
    return false;
}

async function placeOrder() {
    if (!ensureCustomerProfileComplete()) return;
    const checkoutForm = document.getElementById('checkoutForm');
    const button = document.getElementById('placeOrderButton');
    setButtonBusy(button, 'Placing…');
    const formData = new FormData(checkoutForm);
    const customerPhone = formData.get('customerPhone')?.toString().trim();
    const paymentMethod = formData.get('paymentMethod')?.toString() || 'orange_money';
    const paymentPhone = formData.get('paymentPhone')?.toString().trim();
    const paymentDetails = formData.get('paymentDetails')?.toString().trim();
    const notes = formData.get('notes')?.toString().trim();
    const selectedLocationId = state.cart.selectedLocationId || state.activeAddressId || '';
    const selectedLocation = state.addresses.find((address) => address.id === selectedLocationId) || getActiveAddress() || null;
    const selectedAddonId = formData.get('checkoutAddon')?.toString() || state.cart.selectedAddonId || '';
    const availableAddons = getAvailableAddonsForCurrentItem();
    const selectedAddon = availableAddons.find((option) => option.id === selectedAddonId) || null;
    const activeAddressLine = getAddressSummary(selectedLocation) || state.customerProfile?.address || '';
    if (!activeAddressLine || !customerPhone || !paymentPhone || !paymentDetails) {
        createToast('Please complete your delivery and payment details.', 'error');
        clearButtonBusy(button);
        return;
    }
    if (!state.cart.items.length) {
        createToast('Your checkout is empty.', 'error');
        clearButtonBusy(button);
        return;
    }
    const items = getCartItems();
    const subtotal = items.reduce((sum, entry) => sum + (entry.menuItem?.price || 0) * entry.quantity, 0);
    const addonTotal = selectedAddon ? selectedAddon.price : 0;
    const deliveryFee = Number(state.cart.deliveryFee || state.deliveryFee || 60);
    const total = subtotal + addonTotal + deliveryFee;
    const restaurant = state.restaurants.find((entry) => entry.id === state.cart.restaurantId);
    const restaurantPaymentDetails = resolveRestaurantPaymentDetails(restaurant, state.cart);
    const etaMinutes = Number(restaurant?.estimatedPrepTime || state.customerProfile?.estimatedPrepTime || 35) + 25;
    const deliveryLocationPayload = buildDeliveryLocationPayload(selectedLocation);
    const orderPayload = {
        customerUid: state.authUser.uid,
        customerName: state.customerProfile?.displayName || state.customerProfile?.email || 'Customer',
        customerPhone,
        restaurantId: state.cart.restaurantId,
        restaurantName: state.cart.restaurantName || restaurant?.name || 'Restaurant',
        restaurantMobileMoney: restaurantPaymentDetails.restaurantMobileMoney,
        restaurantPaymentReceiver: restaurantPaymentDetails.restaurantPaymentReceiver,
        restaurantAcceptedPaymentMethods: restaurantPaymentDetails.acceptedPaymentMethods,
        address: activeAddressLine,
        deliveryLocationId: selectedLocation?.id || '',
        deliveryLocationLabel: selectedLocation?.label || '',
        deliveryLat: selectedLocation?.coordinates?.latitude || selectedLocation?.lat || null,
        deliveryLng: selectedLocation?.coordinates?.longitude || selectedLocation?.lng || null,
        deliveryLandmark: selectedLocation?.landmark || selectedLocation?.deliveryDetails || '',
        deliveryDetails: selectedLocation?.deliveryDetails || selectedLocation?.details || '',
        deliveryLocationConfirmed: Boolean(selectedLocation),
        deliveryCoordinates: selectedLocation?.coordinates ? {
            latitude: selectedLocation.coordinates.latitude,
            longitude: selectedLocation.coordinates.longitude,
            accuracy: selectedLocation.accuracy || null,
            address: activeAddressLine,
            source: 'saved'
        } : null,
        deliveryLocation: deliveryLocationPayload.address || deliveryLocationPayload.latitude || deliveryLocationPayload.longitude ? {
            address: deliveryLocationPayload.address || activeAddressLine,
            latitude: deliveryLocationPayload.latitude,
            longitude: deliveryLocationPayload.longitude,
            accuracy: deliveryLocationPayload.accuracy,
            source: deliveryLocationPayload.source || 'manual'
        } : null,
        coordinates: deliveryLocationPayload.latitude !== null && deliveryLocationPayload.longitude !== null ? {
            latitude: deliveryLocationPayload.latitude,
            longitude: deliveryLocationPayload.longitude,
            accuracy: deliveryLocationPayload.accuracy,
            address: deliveryLocationPayload.address || activeAddressLine,
            source: deliveryLocationPayload.source || 'manual'
        } : null,
        status: 'pending',
        total,
        subtotal,
        deliveryFee,
        paymentMethod,
        paymentPhone,
        paymentDetails,
        paymentStatus: 'pending',
        amount: total,
        items: items.map((entry) => {
            const imageValue = entry.menuItem?.imageFilename || entry.menuItem?.image || '';
            const imagePath = normalizeImagePath(imageValue, 'products');
            return {
                menuItemId: entry.menuItemId,
                quantity: entry.quantity,
                name: entry.menuItem?.name || 'Item',
                description: entry.menuItem?.restaurantDescription || entry.menuItem?.description || '',
                category: entry.menuItem?.category || '',
                image: imagePath,
                imageFilename: imageValue,
                imagePath,
                price: entry.menuItem?.price || 0
            };
        }),
        addons: selectedAddon ? [{ id: selectedAddon.id, name: selectedAddon.name, price: selectedAddon.price, image: selectedAddon.image }] : [],
        notes,
        estimatedDeliveryTime: new Date(Date.now() + etaMinutes * 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        refundStatus: 'none',
        refundRequested: false,
        refundRequestedAt: null,
        refundProcessedAt: null,
        refundConfirmedAt: null,
        refundAmount: 0,
        refundReason: '',
        refundRejectedReason: ''
    };
    try {
        await firestore.collection('orders').add(orderPayload);
        await syncActiveOrderLocation(activeAddressLine, orderPayload.deliveryLocation);
        state.cart = normalizeCartState({ restaurantId: '', restaurantName: '', items: [], addons: [], drink: null, paymentMethod: 'orange_money', paymentPhone: '', paymentDetails: '', contactPhone: '', notes: '', deliveryFee: state.deliveryFee, selectedLocationId: '', selectedAddonId: '', restaurantPaymentReceiver: '', restaurantAcceptedPaymentMethods: [] });
        saveCartToStorage();
        updateCartSummary();
        showSection('orders');
        await loadOrders(state.authUser.uid);
        renderOrders();
        createToast('Order placed successfully.', 'success');
    } catch (error) {
        createToast(error.message || 'Could not place order.', 'error');
    } finally {
        clearButtonBusy(button);
    }
}

function trackOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    openModal(`Order ${order.orderNumber || order.id.slice(0, 6)}`, `<div class="stack"><p>Status: ${order.status}</p><p>Restaurant: ${order.restaurantName || ''}</p><p>Total: ${formatCurrency(order.total || 0)}</p><p>ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'}</p><p>Refund: ${order.refundStatus || 'none'}</p></div>`);
}

function repeatOrder(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order) return;
    state.cart = normalizeCartState({ restaurantId: order.restaurantId, restaurantName: order.restaurantName, items: order.items.map((item) => ({ ...item, quantity: item.quantity || 1 })), addons: [], drink: null, paymentMethod: 'orange_money', paymentPhone: '', paymentDetails: '', contactPhone: '', notes: '', deliveryFee: state.deliveryFee, selectedLocationId: order.deliveryLocationId || '', restaurantPaymentReceiver: order.restaurantPaymentReceiver || order.restaurantMobileMoney || '', restaurantAcceptedPaymentMethods: Array.isArray(order.restaurantAcceptedPaymentMethods) ? order.restaurantAcceptedPaymentMethods : [] });
    saveCartToStorage();
    updateCartSummary();
    createToast('Items prepared for checkout.', 'success');
    showSection('checkout');
    renderCheckout();
}

async function toggleFavoriteRestaurant(restaurantId) {
    const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
    if (!restaurant) return;
    const ref = firestore.collection('users').doc(state.authUser.uid).collection('favorites').doc(restaurantId);
    const snap = await ref.get();
    if (snap.exists) {
        await ref.delete();
    } else {
        await ref.set({ type: 'restaurant', name: restaurant.name, restaurantId, restaurant: { ...restaurant }, createdAt: new Date() });
    }
    await loadFavorites(state.authUser.uid);
    renderFavorites();
    renderHome();
    renderRestaurants();
}

async function toggleFavoriteItem(menuItemId) {
    const item = state.menuItems.find((entry) => entry.id === menuItemId);
    if (!item) return;
    const restaurant = state.restaurants.find((entry) => entry.id === item.restaurantId);
    const ref = firestore.collection('users').doc(state.authUser.uid).collection('favorites').doc(menuItemId);
    const snap = await ref.get();
    if (snap.exists) {
        await ref.delete();
    } else {
        await ref.set({ type: 'menuItem', name: item.name, menuItemId, menuItem: { ...item, restaurantName: restaurant?.name || '' }, restaurantId: item.restaurantId || '', createdAt: new Date() });
    }
    await loadFavorites(state.authUser.uid);
    renderFavorites();
    renderHome();
    renderRestaurants();
}

async function updateUserProfile(uid, updates) {
    if (!uid) {
        throw new Error('A user id is required to save the profile.');
    }
    const button = document.getElementById('saveProfileButton');
    if (button) {
        setButtonBusy(button, 'Saving…');
    }
    try {
        const payload = {
            ...updates,
            updatedAt: new Date()
        };
        await firestore.collection('users').doc(uid).set(payload, { merge: true });
        state.customerProfile = { ...state.customerProfile, ...payload };
        createToast('Profile saved to Firestore.', 'success');
        return payload;
    } catch (error) {
        createToast(error.message || 'Unable to save your profile.', 'error');
        throw error;
    } finally {
        if (button) {
            clearButtonBusy(button);
        }
    }
}

async function saveProfile(event) {
    event.preventDefault();
    const form = document.getElementById('profileForm');
    const formData = Object.fromEntries(new FormData(form));
    const updates = {
        displayName: String(formData.displayName || '').trim(),
        phone: String(formData.phone || '').trim(),
        email: String(formData.email || '').trim(),
        address: String(formData.address || '').trim()
    };
    if (!updates.displayName || !updates.phone || !updates.address) {
        createToast('Please fill in your name, phone, and address before saving.', 'warning');
        return;
    }
    const payload = await updateUserProfile(state.authUser.uid, updates);
    await syncActiveOrderLocation(payload.address, {
        address: payload.address,
        latitude: state.checkoutLocationSelection?.latitude || null,
        longitude: state.checkoutLocationSelection?.longitude || null,
        accuracy: state.checkoutLocationSelection?.accuracy || null,
        source: state.checkoutLocationSelection?.source || 'manual'
    });
}

function handleModalEscape(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
}

function openModal(title, body) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalActions.innerHTML = '<button class="ghost-btn" id="closeModalBtn">Close</button>';
    modalBackdrop.classList.remove('hidden');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    window.addEventListener('keydown', handleModalEscape);
}

function closeModal() {
    modalBackdrop.classList.add('hidden');
    modalBody.innerHTML = '';
    modalActions.innerHTML = '';
    modalBackdrop.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', handleModalEscape);
}

document.addEventListener('DOMContentLoaded', init);
