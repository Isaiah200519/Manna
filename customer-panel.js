import { initFirebase, clearStoredAuthState } from './firebase-config.js';
import { formatCurrency, formatDate, createToast, getImageUrl, getRestaurantImageUrl } from './utils.js';
import { DEFAULT_CATEGORY_TAXONOMY, getCategoryDisplayName, getCategoryOptions } from './category-taxonomy.js';
import { getQRCardHTML, initQRCode, bindQRDownloadHandlers } from './qr-utils.js';
import { resolveRestaurantPaymentDetails } from './checkout-utils.mjs';

const addonOptions = [
    { id: 'water', name: 'Water Bottle', price: 40 },
    { id: 'soft-drink', name: 'Soft Drink', price: 50 }
];

const defaultLocation = { lat: 6.3113, lng: -10.8014 };

const state = {
    authUser: null,
    customerProfile: null,
    restaurants: [],
    menuItems: [],
    orders: [],
    favorites: [],
    addresses: [],
    locations: [],
    categories: [],
    profileUnsubscribe: null,
    restaurantsUnsubscribe: null,
    ordersUnsubscribe: null,
    favoritesUnsubscribe: null,
    addressesUnsubscribe: null,
    locationsUnsubscribe: null,
    cart: { restaurantId: '', restaurantName: '', items: [], addons: [], drink: null, paymentMethod: 'orange_money', paymentPhone: '', paymentDetails: '', contactPhone: '', notes: '', deliveryFee: 0, selectedLocationId: '', restaurantPaymentReceiver: '', restaurantAcceptedPaymentMethods: [] },
    checkoutLocationSelection: null,
    activeSection: 'home',
    selectedRestaurant: null,
    selectedMenuItem: null,
    searchQuery: '',
    filters: { category: 'all', sort: 'rating' },
    orderFilter: 'all',
    deliveryFee: 60,
    notifications: []
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
        restaurantPaymentReceiver: cart.restaurantPaymentReceiver || '',
        restaurantAcceptedPaymentMethods: Array.isArray(cart.restaurantAcceptedPaymentMethods) ? cart.restaurantAcceptedPaymentMethods : []
    };
}

function isFavoriteMenuItem(menuItemId) {
    return state.favorites.some((entry) => entry.type === 'menuItem' && (entry.menuItemId === menuItemId || entry.id === menuItemId));
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

function resolvePasswordResetEmail(fallbackEmail = '') {
    const profileEmail = state.customerProfile?.email || state.authUser?.email || '';
    if (profileEmail) return profileEmail;
    const loginEmail = document.getElementById('loginEmail')?.value?.trim() || '';
    return loginEmail || fallbackEmail;
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
        createToast('Firebase is not ready yet. Please refresh.', 'error');
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
    cartButton?.addEventListener('click', () => showSection('cart'));
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
        state.searchQuery = event.target.value.toLowerCase();
        renderHome();
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

function setupRealtimeListeners(userId) {
    cleanupListeners();
    state.profileUnsubscribe = firestore.collection('users').doc(userId).onSnapshot((doc) => {
        state.customerProfile = doc.data() || {};
        renderProfileForm();
        renderSettingsForm();
    }, (error) => {
        console.error('[MANNA] Customer profile listener failed:', error);
    });
    state.restaurantsUnsubscribe = firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).onSnapshot((snapshot) => {
        state.restaurants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        loadVisibleProducts()
            .then(() => {
                renderHome();
                renderRestaurants();
                if (state.activeSection === 'home' || state.activeSection === 'restaurants') {
                    showSection(state.activeSection || 'home');
                }
            })
            .catch((error) => {
                console.error('[MANNA] Visible products load failed:', error);
            });
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
    state.addressesUnsubscribe = firestore.collection('users').doc(userId).collection('addresses').onSnapshot((snapshot) => {
        state.addresses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderProfileForm();
    }, (error) => {
        console.error('[MANNA] Customer addresses listener failed:', error);
    });
    state.locationsUnsubscribe = firestore.collection('users').doc(userId).collection('customerLocations').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.locations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        if (!state.cart.selectedLocationId && state.locations.length) {
            state.cart.selectedLocationId = state.locations[0].id;
            saveCartToStorage();
        }
        renderProfileForm();
        if (document.getElementById('checkoutForm')) {
            renderCheckout();
        }
    }, (error) => {
        console.error('[MANNA] Customer locations listener failed:', error);
    });
}

async function loadCustomerData() {
    const userId = state.authUser.uid;
    await loadPlatformSettings();
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

async function loadRestaurants() {
    const snapshot = await firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).get();
    state.restaurants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    state.categories = [...new Set(state.restaurants.map((restaurant) => restaurant.category).filter(Boolean))];
}

async function loadVisibleProducts() {
    const restaurantDocs = await firestore.collection('restaurants').where('status', '==', 'approved').where('isActive', '==', true).get();
    const restaurantIds = restaurantDocs.docs.map((doc) => doc.id);

    const productSnapshots = await Promise.all(restaurantIds.map((restaurantId) => firestore.collection('restaurants').doc(restaurantId).collection('menu').where('availability', '==', true).get()));
    const allProducts = productSnapshots.flatMap((snapshot, index) => snapshot.docs.map((doc) => ({
        id: doc.id,
        restaurantId: restaurantIds[index],
        ...doc.data()
    })));

    state.menuItems = allProducts.filter((item) => item.availability !== false);
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

function renderHome() {
    document.getElementById('homeCategories').innerHTML = state.categories.length ? state.categories.map((category) => `<button class="chip" data-category="${category}">${category}</button>`).join('') : '<div class="empty-state">No categories yet.</div>';
    document.querySelectorAll('[data-category]').forEach((button) => {
        button.addEventListener('click', () => {
            state.filters.category = button.dataset.category;
            showSection('restaurants');
        });
    });

    const featuredProducts = state.menuItems.filter((item) => item.availability !== false).slice(0, 8);
    document.getElementById('homeContent').innerHTML = featuredProducts.length ? featuredProducts.map((item) => {
        const restaurant = state.restaurants.find((entry) => entry.id === item.restaurantId);
        const isFavorite = isFavoriteMenuItem(item.id);
        return `
          <div class="item-card">
            <img src="${getImageUrl(item.imageFilename || item.image || '')}" alt="${item.name}" onerror="this.src='./images/placeholder.png'" />
            <div class="panel-card-header"><strong>${item.name}</strong><span class="badge">${formatCurrency(item.price || 0)}</span></div>
            <div class="muted">${item.restaurantDescription || item.description || 'Freshly prepared and ready for your order.'}</div>
            <div class="muted">${restaurant?.name || 'Restaurant'}</div>
            <div class="modal-actions">
              <button class="primary-btn" data-add-order="${item.id}">Add to cart</button>
              <button class="${getFavoriteButtonClass(isFavorite)}" data-favorite-item="${item.id}" aria-pressed="${isFavorite ? 'true' : 'false'}">${getFavoriteIcon(isFavorite)}</button>
            </div>
          </div>`;
    }).join('') : '<div class="empty-state">No dishes are available right now.</div>';

    document.querySelectorAll('[data-add-order]').forEach((button) => button.addEventListener('click', () => addToCart(button.dataset.addOrder)));
    document.querySelectorAll('[data-favorite-item]').forEach((button) => button.addEventListener('click', () => toggleFavoriteItem(button.dataset.favoriteItem)));
}

function renderRestaurants() {
    const filtered = state.restaurants.filter((restaurant) => {
        const search = state.searchQuery || '';
        const matchesSearch = !search || `${restaurant.name} ${restaurant.description || ''}`.toLowerCase().includes(search);
        const matchesCategory = state.filters.category === 'all' || getCategoryDisplayName(restaurant.category) === state.filters.category || state.menuItems.some((item) => item.restaurantId === restaurant.id && getCategoryDisplayName(item.category) === state.filters.category);
        return matchesSearch && matchesCategory;
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
      <div class="muted">${restaurant.description || 'Local favorites and hearty meals.'}</div>
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
    state.menuItems = menuItems;
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
            <div class="muted">${item.restaurantDescription || 'Freshly prepared and ready to order.'}</div>
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
        if (state.orderFilter === 'active') return ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'refund_requested'].includes(order.status);
        if (state.orderFilter === 'past') return ['delivered', 'completed', 'received'].includes(order.status);
        if (state.orderFilter === 'cancelled') return order.status === 'cancelled' || order.refundStatus === 'approved';
        return true;
    });
    document.getElementById('ordersList').innerHTML = filtered.length ? filtered.map((order) => `
    <div class="item-card">
      ${order.items?.length ? `<img src="${getImageUrl(order.items[0]?.imagePath || order.items[0]?.image || order.items[0]?.imageFilename || '')}" alt="${order.items[0]?.name || 'Item'}" onerror="this.src='./images/placeholder.png'" />` : ''}
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status}</span></div>
      <div class="muted">${formatCurrency(order.total || 0)} • ${order.restaurantName || 'Restaurant'}</div>
      <div class="muted">ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'} • Refund: ${order.refundStatus || 'none'}</div>
      <div class="modal-actions">
        <button class="ghost-btn" data-track-order="${order.id}">Track</button>
        <button class="ghost-btn" data-repeat-order="${order.id}">Repeat</button>
        <button class="ghost-btn" data-request-refund="${order.id}" ${canRequestRefund(order) ? '' : 'disabled'}>${getRefundButtonLabel(order)}</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No orders yet.</div>';
    document.querySelectorAll('[data-track-order]').forEach((button) => button.addEventListener('click', () => trackOrder(button.dataset.trackOrder)));
    document.querySelectorAll('[data-repeat-order]').forEach((button) => button.addEventListener('click', () => repeatOrder(button.dataset.repeatOrder)));
    document.querySelectorAll('[data-request-refund]').forEach((button) => button.addEventListener('click', () => requestRefund(button.dataset.requestRefund)));
}

function canRequestRefund(order) {
    return !['out_for_delivery', 'delivered', 'received', 'cancelled', 'refund_approved', 'refund_rejected'].includes(order.status) && !['requested', 'approved', 'rejected'].includes(order.refundStatus || 'none');
}

function getRefundButtonLabel(order) {
    if (order.refundStatus === 'requested') return 'Refund pending';
    if (order.refundStatus === 'approved') return 'Refund approved';
    if (order.refundStatus === 'rejected') return 'Refund rejected';
    return 'Request refund';
}

async function requestRefund(orderId) {
    const order = state.orders.find((entry) => entry.id === orderId);
    if (!order || !canRequestRefund(order)) return;
    try {
        await firestore.collection('orders').doc(orderId).update({ refundRequested: true, refundStatus: 'requested', updatedAt: new Date() });
        createToast('Refund request sent to the restaurant.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
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
              <div class="muted">${item.restaurantDescription || item.description || 'Freshly prepared and ready to order.'}</div>
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
              <div class="muted">${restaurant.description || 'A favorite place to order from.'}</div>
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
    document.getElementById('addressList').innerHTML = state.addresses.length ? state.addresses.map((address) => `<div class="item-card"><strong>${address.label || 'Address'}</strong><div class="muted">${address.street || ''} • ${address.city || ''}</div></div>`).join('') : '<div class="empty-state">No saved addresses yet.</div>';
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

function showSection(section) {
    state.activeSection = section;
    setActiveNavigation(section);
    setMobileNavOpen(false);
    sectionPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${section}Section`));
    if (section === 'cart') {
        renderCart();
    } else if (section === 'checkout') {
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
    }
    const titleMap = {
        home: ['Home', 'Find food, place orders, and track deliveries.'],
        restaurants: ['Restaurants', 'Browse approved restaurants and their menus.'],
        restaurantDetail: ['Restaurant', 'View dishes and add them to your cart.'],
        orders: ['Orders', 'Track active and completed orders.'],
        favorites: ['Favorites', 'Your saved restaurants and food.'],
        profile: ['Profile', 'Manage your address and personal details.'],
        settings: ['Settings', 'Adjust your experience and preferences.'],
        cart: ['Cart', 'Review items before checkout.'],
        checkout: ['Checkout', 'Complete your order with mobile money.']
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
    if (state.cart.restaurantId && state.cart.restaurantId !== restaurantId) {
        const replace = window.confirm('Your cart contains items from another restaurant. Replace cart?');
        if (!replace) return;
    }
    if (button) setButtonBusy(button, 'Adding…');
    const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
    const paymentDetails = resolveRestaurantPaymentDetails(restaurant, state.cart);
    state.cart.restaurantId = restaurantId;
    state.cart.restaurantName = restaurant?.name || state.cart.restaurantName || 'Restaurant';
    state.cart.restaurantPaymentReceiver = paymentDetails.restaurantPaymentReceiver;
    state.cart.restaurantAcceptedPaymentMethods = paymentDetails.acceptedPaymentMethods;
    const existingIndex = state.cart.items.findIndex((item) => item.menuItemId === menuItemId);
    if (existingIndex >= 0) state.cart.items[existingIndex].quantity += 1;
    else state.cart.items.push({ menuItemId, quantity: 1, variations: [], addons: [], notes: '' });
    saveCartToStorage();
    updateCartSummary();
    createToast(`${selectedItem.name} added to cart`, 'success');
    showSection('cart');
    renderCart();
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

function renderCheckout() {
    state.cart = normalizeCartState(state.cart);
    const items = getCartItems();
    const subtotal = items.reduce((sum, entry) => sum + (entry.menuItem?.price || 0) * entry.quantity, 0);
    const addonTotal = state.cart.addons.reduce((sum, addonId) => sum + (addonOptions.find((option) => option.id === addonId)?.price || 0), 0);
    const deliveryFee = Number(state.cart.deliveryFee || state.deliveryFee || 60);
    const total = subtotal + addonTotal + deliveryFee;
    const restaurant = state.restaurants.find((entry) => entry.id === state.cart.restaurantId);
    const paymentDetails = resolveRestaurantPaymentDetails(restaurant, state.cart);
    const paymentReceiverLabel = paymentDetails.restaurantPaymentReceiver || 'No payment receiver has been added yet for this restaurant.';
    const acceptedMethodsLabel = paymentDetails.acceptedPaymentMethods.length ? paymentDetails.acceptedPaymentMethods.map((method) => method.replace(/_/g, ' ')).join(', ') : 'Mobile money or cash';
    const defaultAddress = state.addresses[0] ? `${state.addresses[0].street || ''}, ${state.addresses[0].city || ''}`.trim() : (state.customerProfile?.address || '');
    const defaultSelectedLocationId = state.cart.selectedLocationId || state.locations[0]?.id || '';
    const locationOptions = state.locations.length ? state.locations.map((location) => `<option value="${location.id}" ${defaultSelectedLocationId === location.id ? 'selected' : ''}>${escapeHtml(location.label || 'Location')}</option>`).join('') : '<option value="">No saved locations</option>';
    document.getElementById('checkoutContent').innerHTML = `
    <div class="stack">
      <div class="item-card">
        <h4>Order summary</h4>
        ${items.map((entry) => `<div class="muted" style="display:flex;align-items:center;gap:10px;margin:6px 0"><img src="${getImageUrl(entry.menuItem?.imageFilename || entry.menuItem?.image || '')}" alt="${entry.menuItem?.name || 'Item'}" style="width:48px;height:48px;border-radius:10px;object-fit:cover" onerror="this.src='./images/placeholder.png'" /><span>${entry.menuItem?.name || 'Item'} × ${entry.quantity}</span></div>`).join('')}
        <div class="muted">${items.length ? items.map((entry) => `${entry.menuItem?.name || 'Item'} × ${entry.quantity}`).join(', ') : 'No items added yet.'}</div>
        <p><strong>Subtotal:</strong> ${formatCurrency(subtotal)}</p>
        <p><strong>Delivery fee:</strong> ${formatCurrency(deliveryFee)}</p>
        <p><strong>Add-ons:</strong> ${addonTotal ? formatCurrency(addonTotal) : 'None'}</p>
        <p><strong>Total:</strong> ${formatCurrency(total)}</p>
        <div class="muted">Payment receiver: ${escapeHtml(paymentReceiverLabel)}</div>
        <div class="muted">Accepted methods: ${escapeHtml(acceptedMethodsLabel)}</div>
      </div>
      <form id="checkoutForm" class="stack">
        <div class="item-card">
          <h4>Delivery details</h4>
          <label>Saved location<select name="savedLocationId" id="savedLocationSelect">
            <option value="">Use a custom address</option>
            ${locationOptions}
          </select></label>
          <div class="item-card checkout-location-card">
            <button class="primary-btn" id="autoChooseLocationButton" type="button">📍 Auto Choose My Current Location</button>
            <div id="checkoutLocationPreview" class="muted" style="margin-top:8px;">${state.checkoutLocationSelection?.fullAddress || 'Tap the button to pick your live delivery spot.'}</div>
            <div id="checkoutLocationMap" class="location-map" style="margin-top:10px;"></div>
            <div id="checkoutLocationStatus" class="map-status">Finding your location…</div>
            <button class="ghost-btn" id="confirmCheckoutLocationButton" type="button" style="margin-top:8px;" disabled>✔ Confirm Delivery Location</button>
          </div>
          <label>Delivery address<input id="deliveryAddressInput" name="deliveryAddress" value="${defaultAddress}" required /></label>
          <label><input type="checkbox" name="saveCheckoutLocationToProfile" value="1" /> Save this delivery location to my profile</label>
          <label>Phone<input name="customerPhone" value="${state.customerProfile?.phone || ''}" required /></label>
          <label>Notes<textarea name="notes">${state.cart.notes || ''}</textarea></label>
        </div>
        <div class="item-card">
          <h4>Add-ons</h4>
          ${addonOptions.map((option) => `<label><input type="checkbox" name="checkoutAddon" value="${option.id}" ${state.cart.addons.includes(option.id) ? 'checked' : ''} /> ${option.name} (${formatCurrency(option.price)})</label>`).join('')}
        </div>
        <div class="item-card">
          <h4>Payment</h4>
          <label>Payment method<select name="paymentMethod">
            <option value="orange_money" ${state.cart.paymentMethod === 'orange_money' ? 'selected' : ''}>Orange Money</option>
            <option value="lonestar_mobile_money" ${state.cart.paymentMethod === 'lonestar_mobile_money' ? 'selected' : ''}>Lonestar Mobile Money</option>
          </select></label>
          <div class="muted">Restaurant payment receiver: ${escapeHtml(paymentReceiverLabel)}</div>
          <label>Your wallet / payment phone<input name="paymentPhone" value="${state.cart.paymentPhone || ''}" required /></label>
          <label>Reference / payment details<input name="paymentDetails" value="${state.cart.paymentDetails || ''}" required /></label>
        </div>
      </form>
    </div>`;
    document.getElementById('savedLocationSelect')?.addEventListener('change', (event) => {
        const selectedLocation = state.locations.find((location) => location.id === event.target.value);
        if (!selectedLocation) {
            state.cart.selectedLocationId = '';
            saveCartToStorage();
            return;
        }
        const addressValue = [selectedLocation.landmark, selectedLocation.neighborhood, selectedLocation.details].filter(Boolean).join(' • ');
        const addressInput = document.getElementById('deliveryAddressInput');
        if (addressInput) {
            addressInput.value = addressValue || selectedLocation.label || '';
        }
        state.cart.selectedLocationId = selectedLocation.id;
        saveCartToStorage();
    });
    document.getElementById('autoChooseLocationButton')?.addEventListener('click', handleCheckoutLocationSelection);
    document.getElementById('confirmCheckoutLocationButton')?.addEventListener('click', confirmCheckoutLocationSelection);
    if (document.getElementById('checkoutLocationMap')) {
        initLocationPickerMap('checkoutLocationMap', 'checkoutLocationStatus');
    }
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

function isCustomerProfileComplete() {
    return Boolean(state.customerProfile && state.customerProfile.displayName && state.customerProfile.phone && state.customerProfile.address);
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
    const deliveryAddress = formData.get('deliveryAddress')?.toString().trim();
    const customerPhone = formData.get('customerPhone')?.toString().trim();
    const paymentMethod = formData.get('paymentMethod')?.toString() || 'orange_money';
    const paymentPhone = formData.get('paymentPhone')?.toString().trim();
    const paymentDetails = formData.get('paymentDetails')?.toString().trim();
    const notes = formData.get('notes')?.toString().trim();
    const selectedLocationId = formData.get('savedLocationId')?.toString().trim() || state.cart.selectedLocationId || '';
    const selectedLocation = state.locations.find((location) => location.id === selectedLocationId);
    const selectedAddons = Array.from(formData.getAll('checkoutAddon')).map((value) => value.toString());
    const shouldSaveLocationToProfile = formData.get('saveCheckoutLocationToProfile') === '1';
    if (!deliveryAddress || !customerPhone || !paymentPhone || !paymentDetails) {
        createToast('Please complete delivery and payment details.', 'error');
        clearButtonBusy(button);
        return;
    }
    if (!state.cart.items.length) {
        createToast('Your cart is empty.', 'error');
        clearButtonBusy(button);
        return;
    }
    const items = getCartItems();
    const subtotal = items.reduce((sum, entry) => sum + (entry.menuItem?.price || 0) * entry.quantity, 0);
    const addonTotal = selectedAddons.reduce((sum, addonId) => sum + (addonOptions.find((option) => option.id === addonId)?.price || 0), 0);
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
        address: deliveryAddress,
        deliveryLocationId: selectedLocation?.id || '',
        deliveryLocationLabel: selectedLocation?.label || '',
        deliveryLat: selectedLocation?.lat || state.checkoutLocationSelection?.latitude || null,
        deliveryLng: selectedLocation?.lng || state.checkoutLocationSelection?.longitude || null,
        deliveryLandmark: selectedLocation?.landmark || state.checkoutLocationSelection?.landmark || '',
        deliveryDetails: selectedLocation?.details || state.checkoutLocationSelection?.fullAddress || '',
        deliveryLocationConfirmed: Boolean(state.checkoutLocationSelection?.locationConfirmed || selectedLocation),
        deliveryCoordinates: state.checkoutLocationSelection ? {
            latitude: state.checkoutLocationSelection.latitude,
            longitude: state.checkoutLocationSelection.longitude,
            accuracy: state.checkoutLocationSelection.accuracy,
            address: state.checkoutLocationSelection.fullAddress || state.checkoutLocationSelection.address || '',
            country: state.checkoutLocationSelection.country || '',
            state: state.checkoutLocationSelection.state || '',
            city: state.checkoutLocationSelection.city || '',
            district: state.checkoutLocationSelection.district || '',
            street: state.checkoutLocationSelection.street || '',
            postalCode: state.checkoutLocationSelection.postalCode || '',
            timestamp: state.checkoutLocationSelection.timestamp || new Date().toISOString(),
            source: state.checkoutLocationSelection.source || 'manual'
        } : null,
        deliveryLocation: deliveryLocationPayload.address || deliveryLocationPayload.latitude || deliveryLocationPayload.longitude ? {
            address: deliveryLocationPayload.address || deliveryAddress,
            latitude: deliveryLocationPayload.latitude,
            longitude: deliveryLocationPayload.longitude,
            accuracy: deliveryLocationPayload.accuracy,
            source: deliveryLocationPayload.source || 'manual'
        } : null,
        coordinates: deliveryLocationPayload.latitude !== null && deliveryLocationPayload.longitude !== null ? {
            latitude: deliveryLocationPayload.latitude,
            longitude: deliveryLocationPayload.longitude,
            accuracy: deliveryLocationPayload.accuracy,
            address: deliveryLocationPayload.address || deliveryAddress,
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
        addons: selectedAddons.map((addonId) => addonOptions.find((option) => option.id === addonId) || { id: addonId, name: addonId, price: 0 }),
        notes,
        estimatedDeliveryTime: new Date(Date.now() + etaMinutes * 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        refundStatus: 'none',
        refundRequested: false
    };
    try {
        const orderRef = await firestore.collection('orders').add(orderPayload);
        if (shouldSaveLocationToProfile) {
            const position = locationMarker?.getLatLng?.();
            const locationPayload = {
                ownerId: state.authUser.uid,
                label: document.getElementById('locationLabel')?.value.trim() || 'Delivery',
                landmark: document.getElementById('locationLandmark')?.value.trim() || '',
                neighborhood: document.getElementById('locationNeighborhood')?.value.trim() || '',
                details: document.getElementById('locationDetails')?.value.trim() || '',
                lat: Number(position?.lat || deliveryLocationPayload.latitude || selectedLocation?.lat || 0),
                lng: Number(position?.lng || deliveryLocationPayload.longitude || selectedLocation?.lng || 0),
                createdAt: new Date()
            };
            await firestore.collection('users').doc(state.authUser.uid).collection('customerLocations').add(locationPayload);
        }
        await syncActiveOrderLocation(deliveryAddress, orderPayload.deliveryLocation);
        state.cart = normalizeCartState({ restaurantId: '', restaurantName: '', items: [], addons: [], drink: null, paymentMethod: 'orange_money', paymentPhone: '', paymentDetails: '', contactPhone: '', notes: '', deliveryFee: state.deliveryFee, selectedLocationId: '', restaurantPaymentReceiver: '', restaurantAcceptedPaymentMethods: [] });
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
    createToast('Items added back to cart.', 'success');
    showSection('cart');
    renderCart();
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
