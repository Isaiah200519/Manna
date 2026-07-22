import { initFirebase, clearStoredAuthState } from './firebase-config.js';
import { formatCurrency, formatDate, createToast } from './utils.js';
import { getQRCardHTML, initQRCode, bindQRDownloadHandlers } from './qr-utils.js';

const state = {
    authUser: null,
    profile: null,
    restaurants: [],
    deliveryRequests: [],
    allOrders: [],
    notifications: [],
    supportRequests: [],
    chatMessages: [],
    helpArticles: [],
    payoutPreferences: {},
    financialPayouts: [],
    selectedOrder: null,
    activeSection: 'dashboard',
    pendingClaimOrderIds: new Set(),
    loading: false,
    profileUnsubscribe: null,
    restaurantsUnsubscribe: null,
    deliveryRequestsUnsubscribe: null,
    ordersUnsubscribe: null,
    notificationsUnsubscribe: null,
    chatsUnsubscribe: null
};

const elements = {
    authScreen: document.getElementById('authScreen'),
    appShell: document.getElementById('appShell'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    authMessage: document.getElementById('authMessage'),
    showRegisterButton: document.getElementById('showRegisterButton'),
    showLoginButton: document.getElementById('showLoginButton'),
    forgotPasswordButton: document.getElementById('forgotPasswordButton'),
    logoutButton: document.getElementById('logoutButton'),
    refreshButton: document.getElementById('refreshButton'),
    saveProfileButton: document.getElementById('saveProfileButton'),
    supportButton: document.getElementById('supportButton'),
    notificationBell: document.getElementById('notificationBell'),
    notificationDropdown: document.getElementById('notificationDropdown'),
    notificationCount: document.getElementById('notificationCount'),
    mobileNavToggle: document.getElementById('mobileNavToggle'),
    mobileNavSheet: document.getElementById('mobileNavSheet'),
    mobileNavClose: document.getElementById('mobileNavClose'),
    mobileMenuButton: document.getElementById('mobileMenuButton'),
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    sidebarClose: document.getElementById('sidebarClose'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    pageHeading: document.getElementById('pageHeading'),
    pageBreadcrumb: document.getElementById('pageBreadcrumb'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalTitle: document.getElementById('modalTitle'),
    modalBody: document.getElementById('modalBody'),
    modalClose: document.getElementById('modalClose'),
    loadingOverlay: document.getElementById('loadingOverlay')
};

let firebase = null;
let firestore = null;
let auth = null;
let authBootstrapTimer = null;
let payoutListenerUnsubscribe = null;

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
            elements.authScreen.classList.remove('hidden');
            elements.appShell.classList.add('hidden');
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
        createToast('Firebase is not ready. Please refresh the page.', 'error');
        return;
    }
    auth.onAuthStateChanged(handleAuthStateChange);
}

function bindEvents() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.showRegisterButton.addEventListener('click', () => toggleAuthMode(true));
    elements.forgotPasswordButton.addEventListener('click', handleForgotPassword);
    elements.showLoginButton.addEventListener('click', () => toggleAuthMode(false));
    elements.forgotPasswordButton.addEventListener('click', handleForgotPassword);
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.refreshButton.addEventListener('click', () => refreshData());
    if (elements.saveProfileButton) {
        elements.saveProfileButton.addEventListener('click', (event) => {
            event.preventDefault();
            saveProfile();
        });
    }
    elements.notificationBell.addEventListener('click', () => {
        showSection('notifications');
        setMobileNavOpen(false);
    });
    elements.supportButton?.addEventListener('click', () => showSection('help'));
    if (elements.mobileNavToggle) {
        const openMobileMenu = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            setMobileNavOpen(true);
        };
        elements.mobileNavToggle.addEventListener('click', openMobileMenu);
    }
    if (elements.mobileNavClose) {
        elements.mobileNavClose.addEventListener('click', (event) => {
            event.stopPropagation();
            setMobileNavOpen(false);
        });
    }
    if (elements.sidebarClose) {
        elements.sidebarClose.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.addEventListener('click', () => setMobileNavOpen(false));
    }
    if (elements.mobileMenuButton) {
        elements.mobileMenuButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setMobileNavOpen(true);
        });
    }
    if (elements.mobileNavSheet) {
        elements.mobileNavSheet.addEventListener('click', (event) => {
            if (event.target === elements.mobileNavSheet) {
                setMobileNavOpen(false);
            }
        });
    }
    // sync desktop nav into mobile menu
    (function syncMobileNavItems() {
        const mobileList = document.querySelector('.mobile-nav-list');
        if (!mobileList) return;
        const desktopItems = Array.from(document.querySelectorAll('.nav-item[data-section]')).filter(i => !i.closest('.mobile-nav-list'));
        desktopItems.forEach(item => {
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
        // dedupe mobile entries (keep first occurrence)
        const seen = new Set();
        Array.from(mobileList.querySelectorAll('.mobile-nav-item')).forEach((el) => {
            const s = el.getAttribute('data-section');
            if (!s) return;
            if (seen.has(s)) el.remove(); else seen.add(s);
        });
    })();

    // notification badge behavior
    (function () {
        const badge = document.getElementById('notificationCount') || document.getElementById('notificationBadge');
        if (!badge) return;
        const getCount = () => (state.notifications || state.data?.notifications || []).filter(n => !n.read).length;
        const count = getCount();
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
    document.getElementById('mobileLogoutButton')?.addEventListener('click', handleLogout);
    document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
        button.addEventListener('click', () => showSection(button.dataset.section));
    });
    elements.modalClose.addEventListener('click', closeModal);
    elements.modalBackdrop.addEventListener('click', (event) => {
        if (event.target === elements.modalBackdrop) closeModal();
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
            localStorage.setItem('manna-onboarding-seen-delivery', 'true');
        });
    }
    if (onboardingOverlay && !localStorage.getItem('manna-onboarding-seen-delivery')) {
        onboardingOverlay.classList.remove('hidden');
        onboardingOverlay.setAttribute('aria-hidden', 'false');
    }

    document.addEventListener('click', (event) => {
        if (event.target.closest('#mobileMenuButton')) {
            event.preventDefault();
            event.stopPropagation();
            setMobileNavOpen(true);
            return;
        }
        const sectionButton = event.target.closest('[data-section]');
        if (sectionButton && !sectionButton.closest('.nav-item') && !sectionButton.closest('.mobile-nav-item')) {
            const section = sectionButton.dataset.section;
            if (section) showSection(section);
        }

        const actionButton = event.target.closest('[data-action]');
        if (actionButton) {
            handleAction(actionButton.dataset.action, actionButton.dataset.id);
        }
    });
}

function setMobileNavOpen(isOpen) {
    if (elements.mobileNavSheet) {
        elements.mobileNavSheet.classList.remove('open');
        elements.mobileNavSheet.setAttribute('aria-hidden', 'true');
    }
    if (elements.sidebar) {
        elements.sidebar.classList.toggle('open', isOpen);
    }
    if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.classList.toggle('open', isOpen);
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
}

function setActiveNavigation(section) {
    document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
        button.classList.toggle('active', button.getAttribute('data-section') === section);
    });
}

function toggleAuthMode(showRegister) {
    elements.loginForm.classList.toggle('hidden', showRegister);
    elements.registerForm.classList.toggle('hidden', !showRegister);
    elements.authMessage.textContent = '';
}

function resolvePasswordResetEmail(fallbackEmail = '') {
    const profileEmail = state.profile?.email || state.authUser?.email || '';
    if (profileEmail) return profileEmail;
    const loginEmail = document.getElementById('loginEmail')?.value?.trim() || '';
    return loginEmail || fallbackEmail;
}

function setLoading(isLoading) {
    state.loading = isLoading;
    elements.loadingOverlay.classList.toggle('hidden', !isLoading);
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    setLoading(true);
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        elements.authMessage.textContent = error.message;
        createToast(error.message, 'error');
    } finally {
        setLoading(false);
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const phone = document.getElementById('registerPhone').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const vehicleType = document.getElementById('registerVehicleType').value;
    if (!name || !phone || !email || !password || password !== confirmPassword) {
        elements.authMessage.textContent = 'Please complete all fields and make sure passwords match.';
        return;
    }
    setLoading(true);
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        await user.updateProfile({ displayName: name });
        await firestore.collection('users').doc(user.uid).set({
            uid: user.uid,
            displayName: name,
            phone,
            email,
            role: 'delivery_person',
            vehicleType,
            vehiclePlate: '',
            isActive: true,
            rating: 4.9,
            totalDeliveries: 0,
            totalEarnings: 0,
            approvedRestaurants: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });
        toggleAuthMode(false);
        createToast('Delivery account created. Welcome to MANNA.', 'success');
    } catch (error) {
        elements.authMessage.textContent = error.message;
        createToast(error.message, 'error');
    } finally {
        setLoading(false);
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
            createToast(error.message, 'error');
        }
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        createToast('Password reset email sent.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
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
        cleanupListeners();
        state.profile = null;
        state.restaurants = [];
        state.allOrders = [];
        state.notifications = [];
        elements.authScreen.classList.remove('hidden');
        elements.appShell.classList.add('hidden');
    }
}

async function handleAuthStateChange(user) {
    if (!user) {
        if (state.authUser) {
            clearAuthBootstrapTimer();
            cleanupListeners();
            state.authUser = null;
            state.profile = null;
            elements.authScreen.classList.remove('hidden');
            elements.appShell.classList.add('hidden');
            return;
        }
        scheduleAuthFallback();
        return;
    }
    clearAuthBootstrapTimer();
    setLoading(true);
    try {
        const userDocRef = firestore.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) {
            await userDocRef.set({
                uid: user.uid,
                displayName: user.displayName || user.email,
                email: user.email,
                phone: '',
                role: 'delivery_person',
                vehicleType: 'Motorcycle',
                vehiclePlate: '',
                isActive: true,
                rating: 4.9,
                totalDeliveries: 0,
                totalEarnings: 0,
                approvedRestaurants: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        const profile = userDoc.exists ? userDoc.data() : { role: 'delivery_person' };
        const role = profile?.role || 'delivery_person';
        if (role !== 'delivery_person') {
            elements.authMessage.textContent = 'This account is not authorized for the delivery panel.';
            elements.authScreen.classList.remove('hidden');
            elements.appShell.classList.add('hidden');
            createToast('Please use the correct panel for this account.', 'warning');
            return;
        }
        state.authUser = user;
        state.profile = profile;
        elements.authScreen.classList.add('hidden');
        elements.appShell.classList.remove('hidden');
        showSection(state.activeSection);
        setupRealtimeListeners(user.uid);
        if (!user.emailVerified) {
            createToast('Please verify your email before taking deliveries.', 'info');
        }
        renderAll();
    } catch (error) {
        console.error(error);
        createToast(error.message || 'Unable to load the delivery dashboard.', 'error');
    } finally {
        setLoading(false);
    }
}

function setupRealtimeListeners(userId) {
    cleanupListeners();
    state.profileUnsubscribe = firestore.collection('users').doc(userId).onSnapshot((doc) => {
        state.profile = doc.data() || {};
        renderProfile();
        renderSettings();
        renderDashboard();
    }, (error) => {
        console.error('[MANNA] Delivery profile listener failed:', error);
    });

    state.restaurantsUnsubscribe = firestore.collection('restaurants').onSnapshot((snapshot) => {
        state.restaurants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderRestaurants();
        renderDashboard();
    }, (error) => {
        console.error('[MANNA] Delivery restaurants listener failed:', error);
    });

    state.deliveryRequestsUnsubscribe = firestore.collection('deliveryRequests').where('deliveryPersonUid', '==', userId).onSnapshot((snapshot) => {
        state.deliveryRequests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderRestaurants();
        renderDashboard();
        renderPartnerRequests();
    }, (error) => {
        console.error('[MANNA] Delivery requests listener failed:', error);
    });

    state.ordersUnsubscribe = firestore.collection('orders').onSnapshot((snapshot) => {
        state.allOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderAllLists();
        renderDashboard();
    }, (error) => {
        console.error('[MANNA] Delivery orders listener failed:', error);
    });

    state.notificationsUnsubscribe = firestore.collection('notifications').where('recipientUid', '==', userId).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.notifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderNotifications();
        renderHeaderNotifications();
    }, (error) => {
        console.error('[MANNA] Delivery notifications listener failed:', error);
    });

    firestore.collection('helpArticles').where('targetRoles', 'array-contains', 'delivery').onSnapshot((snapshot) => {
        state.helpArticles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderHelpArticles();
    }, (error) => {
        console.error('[MANNA] Delivery help articles listener failed:', error);
    });
}

function cleanupListeners() {
    [state.profileUnsubscribe, state.restaurantsUnsubscribe, state.deliveryRequestsUnsubscribe, state.ordersUnsubscribe, state.notificationsUnsubscribe, state.chatsUnsubscribe].forEach((unsubscribe) => { if (unsubscribe) unsubscribe(); });
    state.profileUnsubscribe = null;
    state.restaurantsUnsubscribe = null;
    state.deliveryRequestsUnsubscribe = null;
    state.ordersUnsubscribe = null;
    state.notificationsUnsubscribe = null;
    state.chatsUnsubscribe = null;
}

function renderAll() {
    renderDashboard();
    renderAvailableOrders();
    renderActiveDeliveries();
    renderHistory();
    renderRestaurants();
    renderPartnerRequests();
    renderHelpArticles();
    renderProfile();
    renderSettings();
    renderNotifications();
    renderHeaderNotifications();
}

function renderAllLists() {
    renderAvailableOrders();
    renderActiveDeliveries();
    renderHistory();
    renderRestaurants();
    renderNotifications();
    renderDashboard();
}

function renderDashboard() {
    const approvedRestaurantIds = state.profile?.approvedRestaurants || [];
    const available = state.allOrders.filter((order) => !order.isDeleted && approvedRestaurantIds.includes(order.restaurantId) && order.status === 'ready' && !order.deliveryPersonUid);
    const active = state.allOrders.filter((order) => !order.isDeleted && order.deliveryPersonUid === state.authUser?.uid && order.status === 'out_for_delivery');
    const history = state.allOrders.filter((order) => !order.isDeleted && order.deliveryPersonUid === state.authUser?.uid && ['delivered', 'received'].includes(order.status));
    const today = history.filter((order) => {
        const updated = order.updatedAt?.toDate ? order.updatedAt.toDate() : new Date(order.updatedAt || Date.now());
        const todayDate = new Date();
        return updated.toDateString() === todayDate.toDateString();
    });

    document.getElementById('statAvailable').textContent = available.length;
    document.getElementById('statActive').textContent = active.length;
    document.getElementById('statToday').textContent = today.length;
    document.getElementById('statRating').textContent = Number(state.profile?.rating || 0).toFixed(1);

    const recent = [...history].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)).slice(0, 5);
    document.getElementById('recentActivityList').innerHTML = recent.length ? recent.map((order) => `
    <div class="item-card">
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status}</span></div>
      <div class="muted">${order.restaurantName || 'Restaurant'} • ${formatDate(order.updatedAt || order.createdAt)}</div>
    </div>`).join('') : '<div class="empty-state">No completed deliveries yet.</div>';

    const myRestaurants = state.restaurants.filter((restaurant) => approvedRestaurantIds.includes(restaurant.id));
    document.getElementById('myRestaurantsList').innerHTML = myRestaurants.length ? myRestaurants.map((restaurant) => `
    <div class="item-card">
      <div class="panel-card-header"><strong>${restaurant.name}</strong><span class="badge">Approved</span></div>
      <div class="muted">${restaurant.location || 'Location unavailable'}</div>
      <div class="action-row">
        <button class="danger-btn" data-action="leave-restaurant" data-id="${restaurant.id}">Leave</button>
      </div>
    </div>`).join('') : '<div class="empty-state">You have not been approved by any restaurant yet.</div>';
}

function getDeliveryLocationMeta(order) {
    const latitude = Number(order.deliveryLat ?? order.coordinates?.latitude ?? order.deliveryLocation?.latitude ?? order.lat ?? order.latitude ?? null);
    const longitude = Number(order.deliveryLng ?? order.coordinates?.longitude ?? order.deliveryLocation?.longitude ?? order.lng ?? order.longitude ?? null);
    const address = order.address || order.deliveryLocation?.address || order.deliveryDetails || order.deliveryLandmark || '';
    const label = order.deliveryLocationLabel || order.deliveryLandmark || order.deliveryDetails || address || 'Delivery address';
    const mapsUrl = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `https://www.google.com/maps?q=${latitude},${longitude}&z=16`
        : `https://www.google.com/maps?q=${encodeURIComponent(address || label)}`;
    return { latitude, longitude, address, label, mapsUrl };
}

function renderDeliveryLocationMap(order) {
    const { latitude, longitude, label, mapsUrl } = getDeliveryLocationMeta(order);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return '';
    }
    return `
      <div class="delivery-map-card">
        <div class="map-hint">Google Maps • Live directions</div>
        <iframe
          title="Delivery location map"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          src="https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed"
        ></iframe>
        <div class="muted" style="font-size: 12px;">${label}</div>
        <div class="action-row">
          <a class="primary-btn" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        </div>
      </div>`;
}

function renderAvailableOrders() {
    const approvedRestaurantIds = state.profile?.approvedRestaurants || [];
    const available = state.allOrders.filter((order) => !order.isDeleted && approvedRestaurantIds.includes(order.restaurantId) && order.status === 'ready' && !order.deliveryPersonUid);
    document.getElementById('availableOrdersList').innerHTML = available.length ? available.map((order) => {
        const isClaiming = state.pendingClaimOrderIds.has(order.id);
        return `
    <div class="item-card">
      <img src="${getImagePath(order.items?.[0]?.imagePath || order.items?.[0]?.image || order.items?.[0]?.imageFilename || '', 'products')}" alt="${order.items?.[0]?.name || 'Order'}" />
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status || 'accepted'}</span></div>
      <div class="meta-stack">
        <div class="meta-row"><span>${order.items?.[0]?.name || 'Order'} × ${order.items?.[0]?.quantity || 1}</span><span>${formatCurrency(order.total || 0)}</span></div>
        <div class="meta-row"><span>${order.address || 'Address unavailable'}</span><span>${order.deliveryLocationLabel || 'Standard'}</span></div>
        <div class="muted">${order.deliveryLandmark || order.deliveryDetails || 'No delivery notes'}</div>
      </div>
      ${renderDeliveryLocationMap(order)}
      <div class="action-row">
        <button class="primary-btn" data-action="pick-up-order" data-id="${order.id}" ${isClaiming ? 'disabled' : ''}>${isClaiming ? 'Claiming...' : 'Pick Up'}</button>
        <button class="ghost-btn" data-action="open-chat" data-id="${order.id}">Chat</button>
      </div>
    </div>`;
    }).join('') : '<div class="empty-state">No available orders from your approved restaurants yet.</div>';
}

function renderActiveDeliveries() {
    const active = state.allOrders.filter((order) => !order.isDeleted && !order.archived && order.deliveryPersonUid === state.authUser?.uid && order.status === 'out_for_delivery');
    document.getElementById('activeDeliveriesList').innerHTML = active.length ? active.map((order) => `
    <div class="item-card">
      <img src="${getImagePath(order.items?.[0]?.imagePath || order.items?.[0]?.image || order.items?.[0]?.imageFilename || '', 'products')}" alt="${order.items?.[0]?.name || 'Order'}" />
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status}</span></div>
      <div class="meta-stack">
        <div class="meta-row"><span>${order.customerName || 'Customer'}</span><span>${order.items?.[0]?.name || 'Order'} × ${order.items?.[0]?.quantity || 1}</span></div>
        <div class="muted">${order.address || 'Address unavailable'}</div>
        <div class="muted">${order.deliveryLandmark || order.deliveryDetails || 'No delivery notes'}</div>
      </div>
      ${renderDeliveryLocationMap(order)}
      <div class="muted">ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'} • Refund: ${order.refundStatus || 'none'}</div>
      <div class="action-row">
        <button class="primary-btn" data-action="deliver-order" data-id="${order.id}">Delivered</button>
        <button class="ghost-btn" data-action="report-issue" data-id="${order.id}">Report Issue</button>
        <button class="ghost-btn" data-action="open-chat" data-id="${order.id}">Chat</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No active deliveries right now.</div>';
}

function renderHistory() {
    const history = state.allOrders.filter((order) => !order.isDeleted && order.deliveryPersonUid === state.authUser?.uid && ['delivered', 'received'].includes(order.status));
    document.getElementById('historyList').innerHTML = history.length ? history.map((order) => `
    <div class="item-card">
      <div class="panel-card-header"><strong>#${order.orderNumber || order.id.slice(0, 6)}</strong><span class="badge">${order.status}</span></div>
      <div class="muted">${order.restaurantName || 'Restaurant'} • ${formatCurrency(order.total || 0)}</div>
      <div class="muted">${order.customerName || 'Customer'} • ${formatDate(order.updatedAt || order.createdAt)}</div>
      <div class="action-row">
        <button class="ghost-btn" data-action="open-chat" data-id="${order.id}">Chat</button>
        ${['received', 'refunded'].includes(order.status) ? `<button class="danger-btn" data-action="delete-history" data-id="${order.id}">Delete</button>` : ''}
      </div>
    </div>`).join('') : '<div class="empty-state">Delivery history is empty.</div>';
}

function renderPartnerRequests() {
    const list = document.getElementById('partnerRequestsList');
    if (!list) return;
    const pending = state.deliveryRequests.filter((request) => request.status === 'pending');
    list.innerHTML = pending.length ? pending.map((request) => `
      <div class="item-card">
        <div class="panel-card-header"><strong>${request.restaurantName || 'Restaurant'}</strong><span class="badge">Pending</span></div>
        <div class="muted">Your request to partner with this restaurant is awaiting review.</div>
      </div>`).join('') : '<div class="empty-state">You have no active partner requests right now.</div>';
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

function renderRestaurants() {
    const approvedRestaurantIds = state.profile?.approvedRestaurants || [];
    const requestCards = state.deliveryRequests.length ? state.deliveryRequests.map((request) => {
        const restaurant = state.restaurants.find((entry) => entry.id === request.restaurantId);
        const statusLabel = request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Declined' : 'Pending';
        return `
        <div class="item-card">
          <div class="panel-card-header"><strong>${restaurant?.name || 'Restaurant'}</strong><span class="badge">${statusLabel}</span></div>
          <div class="muted">${restaurant?.location || 'Location unavailable'}</div>
          <div class="muted">${request.status === 'pending' ? 'Waiting for restaurant confirmation.' : request.status === 'approved' ? 'You are now approved to deliver for this restaurant.' : 'Your request was declined.'}</div>
        </div>`;
    }).join('') : '<div class="empty-state">You have not requested any restaurant partnerships yet.</div>';
    const approvedCards = state.restaurants.filter((restaurant) => approvedRestaurantIds.includes(restaurant.id)).length ? state.restaurants.filter((restaurant) => approvedRestaurantIds.includes(restaurant.id)).map((restaurant) => `
    <div class="item-card">
      <img src="${getImagePath(restaurant.logo, 'restaurants')}" alt="${restaurant.name}" />
      <div class="panel-card-header"><strong>${restaurant.name}</strong><span class="badge">Approved</span></div>
      <div class="muted">${restaurant.location || 'Location unavailable'} • ${restaurant.category || 'Restaurant'}</div>
    </div>`).join('') : '<div class="empty-state">No approved restaurant partners yet.</div>';
    document.getElementById('restaurantsList').innerHTML = state.restaurants.length ? state.restaurants.map((restaurant) => `
    <div class="item-card">
      <img src="${getImagePath(restaurant.logo, 'restaurants')}" alt="${restaurant.name}" />
      <div class="panel-card-header"><strong>${restaurant.name}</strong><span class="badge">${restaurant.rating || 'New'}</span></div>
      <div class="muted">${restaurant.location || 'Location unavailable'} • ${restaurant.category || 'Restaurant'}</div>
      <div class="action-row">
        <button class="${approvedRestaurantIds.includes(restaurant.id) ? 'ghost-btn' : 'primary-btn'}" data-action="request-delivery" data-id="${restaurant.id}">${approvedRestaurantIds.includes(restaurant.id) ? 'Approved' : 'Request to Deliver'}</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No restaurants are available right now.</div>';
    document.getElementById('myRequestsList').innerHTML = requestCards;
    document.getElementById('approvedRestaurantsList').innerHTML = approvedCards;
}

function renderProfile() {
    const profile = state.profile || {};
    document.getElementById('profileForm').innerHTML = `
    <label>Name<input id="profileName" value="${profile.displayName || ''}" /></label>
    <label>Phone<input id="profilePhone" value="${profile.phone || ''}" /></label>
    <label>Email<input value="${profile.email || ''}" readonly /></label>
    <label>Vehicle Type<select id="profileVehicleType">
      <option value="Bicycle" ${profile.vehicleType === 'Bicycle' ? 'selected' : ''}>Bicycle</option>
      <option value="Motorcycle" ${profile.vehicleType === 'Motorcycle' ? 'selected' : ''}>Motorcycle</option>
      <option value="Car" ${profile.vehicleType === 'Car' ? 'selected' : ''}>Car</option>
    </select></label>
    <label>Vehicle Plate<input id="profileVehiclePlate" value="${profile.vehiclePlate || ''}" /></label>
    <label>Rating<input value="${profile.rating || 0}" readonly /></label>
    <label>Total Deliveries<input value="${profile.totalDeliveries || 0}" readonly /></label>
    ${getQRCardHTML('deliveryQrContainer', 'deliveryQrCard')}
  `;
    initQRCode('deliveryQrContainer');
    bindQRDownloadHandlers();
}

function renderSettings() {
    const profile = state.profile || {};
    document.getElementById('settingsContent').innerHTML = `
    <div class="item-card">
      <div class="panel-card-header"><strong>Availability</strong><span class="badge">${profile.isActive ? 'Online' : 'Offline'}</span></div>
      <label><input type="checkbox" id="availabilityToggle" ${profile.isActive ? 'checked' : ''} /> Available for new deliveries</label>
      <div class="action-row">
        <button class="primary-btn" data-action="change-password">Change Password</button>
        <button class="danger-btn" data-action="deactivate-account">Deactivate Account</button>
      </div>
    </div>
    <div class="item-card">
      <div class="panel-card-header"><strong>Payment preferences</strong></div>
      <label>Mobile money number<input id="payoutPhone" value="${state.payoutPreferences?.paymentPhone || ''}" /></label>
      <label>Provider<select id="payoutProvider">
        <option value="orange" ${state.payoutPreferences?.provider === 'orange' ? 'selected' : ''}>Orange Money</option>
        <option value="lonestar" ${state.payoutPreferences?.provider === 'lonestar' ? 'selected' : ''}>Lonestar</option>
      </select></label>
      <div class="action-row">
        <button class="primary-btn" id="savePayoutPreferences">Save payment preferences</button>
      </div>
    </div>`;
    const availabilityToggle = document.getElementById('availabilityToggle');
    if (availabilityToggle) {
        availabilityToggle.addEventListener('change', async () => {
            await firestore.collection('users').doc(state.authUser.uid).set({ isActive: availabilityToggle.checked, updatedAt: new Date() }, { merge: true });
            createToast(availabilityToggle.checked ? 'You are online for new deliveries.' : 'You are offline for now.', 'success');
        });
    }
    document.getElementById('savePayoutPreferences')?.addEventListener('click', async () => {
        const paymentPhone = document.getElementById('payoutPhone').value.trim();
        const provider = document.getElementById('payoutProvider').value;
        await firestore.collection('users').doc(state.authUser.uid).set({ payoutPreferences: { provider, paymentPhone }, updatedAt: new Date() }, { merge: true });
        state.payoutPreferences = { provider, paymentPhone };
        createToast('Payment preferences saved.', 'success');
    });
}

function renderNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    const visible = state.notifications.filter((item) => !item.isDeleted);
    list.innerHTML = `
      <div class="action-row" style="margin-bottom: 12px;">
        <button class="ghost-btn" data-clear-all-notifications="true" ${visible.length ? '' : 'disabled'}>Clear all</button>
      </div>
      ${visible.length ? visible.map((item) => `
      <div class="item-card notification-card ${item.read ? '' : 'unread'}">
        <div class="panel-card-header"><strong>${item.title || 'Update'}</strong><span class="badge">${item.type || 'system'}</span></div>
        <div class="muted">${item.message || ''}</div>
        <div class="muted">${formatDate(item.createdAt)}</div>
        <div class="action-row">
          <button class="ghost-btn" data-action="mark-notification-read" data-id="${item.id}">${item.read ? 'Read' : 'Mark as Read'}</button>
          <button class="danger-btn" data-action="delete-notification" data-id="${item.id}">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-state">No notifications yet.</div>'}`;
    list.querySelectorAll('[data-clear-all-notifications]').forEach((button) => {
        button.addEventListener('click', clearAllNotifications);
    });
}

function renderHeaderNotifications() {
    const unread = state.notifications.filter((item) => !item.isDeleted && !item.read).length;
    elements.notificationCount.textContent = unread;
    elements.notificationCount.classList.toggle('hidden', unread === 0);
    elements.notificationDropdown.innerHTML = state.notifications.filter((item) => !item.isDeleted).length ? state.notifications.filter((item) => !item.isDeleted).slice(0, 5).map((item) => `<div class="item-card notification-card ${item.read ? '' : 'unread'}"><strong>${item.title || 'Update'}</strong><div class="muted">${item.message || ''}</div></div>`).join('') : '<div class="empty-state">No recent updates.</div>';
}

function toggleNotifications() {
    showSection('notifications');
    setMobileNavOpen(false);
}

function showSection(section) {
    state.activeSection = section;
    setActiveNavigation(section);
    setMobileNavOpen(false);
    document.querySelectorAll('.section-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${section}Section`));
    if (section === 'help') {
        renderHelpSession();
    }
    if (section === 'settings') {
        renderSettings();
    }
    const titleMap = {
        dashboard: ['Dashboard', 'Pick up, deliver, and keep your route moving.', 'Delivery Console', 'Dashboard / Overview'],
        available: ['Available Orders', 'Orders ready for pickup from approved restaurants.', 'Available Orders', 'Dashboard / Orders'],
        active: ['Active Deliveries', 'Orders currently assigned to you.', 'Active Deliveries', 'Dashboard / Deliveries'],
        history: ['Delivery History', 'Completed deliveries and your route summary.', 'Delivery History', 'Dashboard / History'],
        restaurants: ['Restaurants', 'Request deliveries from restaurants you want to work with.', 'Restaurants', 'Dashboard / Restaurants'],
        partners: ['Partner Requests', 'Track your pending delivery partnerships.', 'Partner Requests', 'Dashboard / Partners'],
        notifications: ['Notifications', 'Stay updated on your deliveries.', 'Notifications', 'Dashboard / Alerts'],
        profile: ['Profile', 'Update your profile and vehicle details.', 'Profile', 'Dashboard / Profile'],
        settings: ['Settings', 'Manage availability and account options.', 'Settings', 'Dashboard / Preferences'],
        help: ['Help Center', 'Find guides and support resources for delivery partners.', 'Help Center', 'Dashboard / Help']
    };
    const [title, subtitle, heading, breadcrumb] = titleMap[section] || titleMap.dashboard;
    elements.pageTitle.textContent = title;
    elements.pageSubtitle.textContent = subtitle;
    if (elements.pageHeading) elements.pageHeading.textContent = heading;
    if (elements.pageBreadcrumb) elements.pageBreadcrumb.textContent = breadcrumb;
}

function setClaimButtonState(orderId, isClaiming) {
    if (!orderId) return;
    document.querySelectorAll(`[data-action="pick-up-order"][data-id="${orderId}"]`).forEach((button) => {
        button.disabled = isClaiming;
        button.classList.toggle('is-busy', isClaiming);
        if (isClaiming) {
            button.dataset.originalText = button.textContent.trim();
            button.textContent = 'Claiming...';
        } else if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    });
}

async function handleAction(action, id) {
    if (!state.authUser) return;
    switch (action) {
        case 'pick-up-order':
            await pickUpOrder(id);
            break;
        case 'deliver-order':
            await markDelivered(id);
            break;
        case 'report-issue':
            await reportIssue(id);
            break;
        case 'request-delivery':
            await requestDelivery(id);
            break;
        case 'leave-restaurant':
            await leaveRestaurant(id);
            break;
        case 'mark-notification-read':
            await markNotificationRead(id);
            break;
        case 'delete-notification':
            await deleteNotification(id);
            break;
        case 'delete-history':
            await deleteHistory(id);
            break;
        case 'change-password':
            await handleForgotPassword();
            break;
        case 'deactivate-account':
            await deactivateAccount();
            break;
        case 'open-chat':
            await openChat(id);
            break;
        default:
            break;
    }
}

async function pickUpOrder(orderId) {
    if (!ensureDeliveryProfileComplete()) return;
    if (!orderId || state.pendingClaimOrderIds.has(orderId)) return;

    state.pendingClaimOrderIds.add(orderId);
    setClaimButtonState(orderId, true);

    const profile = state.profile || {};
    const order = state.allOrders.find((entry) => entry.id === orderId);
    let assignedSuccessfully = false;

    try {
        const orderRef = firestore.collection('orders').doc(orderId);
        const serverTimestamp = window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();

        await firestore.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                throw new Error('This order no longer exists.');
            }

            const orderData = orderDoc.data() || {};
            if (orderData.deliveryPersonUid) {
                throw new Error('This order has already been claimed by another driver.');
            }
            if (!['accepted', 'preparing', 'ready'].includes(orderData.status)) {
                throw new Error('This order is not available for pickup right now.');
            }

            transaction.update(orderRef, {
                status: 'out_for_delivery',
                deliveryPersonUid: state.authUser.uid,
                deliveryPersonName: profile.displayName || profile.email || 'Delivery person',
                deliveryPersonPhone: profile.phone || '',
                deliveryPersonVehicleType: profile.vehicleType || '',
                assignedAt: serverTimestamp,
                updatedAt: new Date()
            });
        });

        assignedSuccessfully = true;
        await Promise.all([
            createNotification(state.authUser.uid, 'Order assigned', 'You picked up an order and it is now in transit.', 'delivery'),
            order?.customerUid ? createNotification(order.customerUid, 'Order on the way', 'Your order is now on the way with a delivery partner.', 'delivery') : Promise.resolve(),
            order?.restaurantId ? (async () => {
                const restaurant = state.restaurants.find((entry) => entry.id === order.restaurantId);
                if (restaurant?.ownerUid) {
                    await createNotification(restaurant.ownerUid, 'Delivery assigned', 'A delivery partner is now on the way with one of your orders.', 'delivery');
                }
            })() : Promise.resolve()
        ]);
        createToast('Order picked up and assigned to you.', 'success');
    } catch (error) {
        const message = error.message || 'Unable to claim this order.';
        if (message.includes('already been claimed')) {
            createToast('Sorry, this order was just claimed by another driver.', 'warning');
        } else if (message.includes('not available')) {
            createToast('This order is no longer available for pickup.', 'warning');
        } else {
            createToast(message, 'error');
        }
    } finally {
        state.pendingClaimOrderIds.delete(orderId);
        if (!assignedSuccessfully) {
            setClaimButtonState(orderId, false);
        }
    }
}

async function markDelivered(orderId) {
    if (!ensureDeliveryProfileComplete()) return;
    try {
        await firestore.collection('orders').doc(orderId).update({ status: 'delivered', updatedAt: new Date() });
        const order = state.allOrders.find((entry) => entry.id === orderId);
        if (order?.customerUid) {
            await createNotification(order.customerUid, 'Delivery completed', 'Your order was delivered successfully.', 'delivery');
        }
        if (order?.restaurantId) {
            const restaurant = state.restaurants.find((entry) => entry.id === order.restaurantId);
            if (restaurant?.ownerUid) {
                await createNotification(restaurant.ownerUid, 'Delivery completed', 'A delivery was completed for your restaurant.', 'delivery');
            }
        }
        createToast('Delivery marked as complete.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function reportIssue(orderId) {
    const message = prompt('Describe the issue');
    if (!message) return;
    try {
        await firestore.collection('reports').add({ orderId, deliveryPersonUid: state.authUser.uid, message, createdAt: new Date() });
        createToast('Issue reported to the admin team.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function requestDelivery(restaurantId) {
    try {
        const restaurant = state.restaurants.find((entry) => entry.id === restaurantId);
        const existing = await firestore.collection('deliveryRequests').where('deliveryPersonUid', '==', state.authUser.uid).where('restaurantId', '==', restaurantId).limit(1).get();
        if (!existing.empty) {
            const currentStatus = existing.docs[0].data()?.status || 'pending';
            createToast(currentStatus === 'approved' ? 'You are already approved for this restaurant.' : 'You already have a request for this restaurant.', 'info');
            return;
        }
        const requestPayload = {
            deliveryPersonUid: state.authUser.uid,
            deliveryPersonName: state.profile?.displayName || state.profile?.email || 'Delivery person',
            restaurantId,
            restaurantName: restaurant?.name || '',
            status: 'pending',
            createdAt: new Date()
        };
        await firestore.collection('deliveryRequests').add(requestPayload);
        if (restaurant?.ownerUid) {
            await firestore.collection('notifications').add({
                recipientUid: restaurant.ownerUid,
                title: 'New delivery request',
                message: `${requestPayload.deliveryPersonName} wants to join ${restaurant.name || 'your restaurant'}.`,
                type: 'delivery',
                read: false,
                isDeleted: false,
                createdAt: new Date()
            });
        }
        createToast('Delivery request sent to the restaurant.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function leaveRestaurant(restaurantId) {
    try {
        const restaurantRef = firestore.collection('restaurants').doc(restaurantId);
        const restaurantDoc = await restaurantRef.get();
        const current = restaurantDoc.data()?.deliveryPersons || [];
        const next = current.filter((uid) => uid !== state.authUser.uid);
        await restaurantRef.update({ deliveryPersons: next, updatedAt: new Date() });
        const profileApproved = state.profile?.approvedRestaurants || [];
        await firestore.collection('users').doc(state.authUser.uid).set({ approvedRestaurants: profileApproved.filter((id) => id !== restaurantId), updatedAt: new Date() }, { merge: true });
        createToast('You have left this restaurant network.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function markNotificationRead(notificationId) {
    try {
        await firestore.collection('notifications').doc(notificationId).set({ read: true, updatedAt: new Date() }, { merge: true });
        state.notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
        renderNotifications();
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function deleteNotification(notificationId) {
    try {
        await firestore.collection('notifications').doc(notificationId).set({ read: true, isDeleted: true, updatedAt: new Date() }, { merge: true });
        state.notifications = state.notifications.map((item) => (item.id === notificationId ? { ...item, read: true, isDeleted: true } : item));
        renderNotifications();
    } catch (error) {
        createToast(error.message, 'error');
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
        createToast(error.message, 'error');
    }
}

async function deleteHistory(orderId) {
    try {
        await firestore.collection('orders').doc(orderId).set({ isDeleted: true, updatedAt: new Date() }, { merge: true });
        createToast('Order removed from history.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function deactivateAccount() {
    try {
        await firestore.collection('users').doc(state.authUser.uid).set({ isActive: false, isDeleted: true, updatedAt: new Date() }, { merge: true });
        await auth.signOut();
        createToast('Your account has been deactivated.', 'success');
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function updateUserProfile(uid, updates) {
    if (!uid) {
        throw new Error('A user id is required to save the profile.');
    }
    const button = document.querySelector('#saveProfileButton');
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
        state.profile = { ...state.profile, ...payload };
        createToast('Profile saved to Firestore.', 'success');
        return payload;
    } catch (error) {
        createToast(error.message || 'Unable to save your profile.', 'error');
        throw error;
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Save';
        }
    }
}

async function saveProfile() {
    try {
        const name = document.getElementById('profileName').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();
        const vehicleType = document.getElementById('profileVehicleType').value;
        const vehiclePlate = document.getElementById('profileVehiclePlate').value.trim();
        await updateUserProfile(state.authUser.uid, { displayName: name, phone, vehicleType, vehiclePlate });
    } catch (error) {
        createToast(error.message, 'error');
    }
}

async function refreshData() {
    renderAll();
    createToast('Data refreshed.', 'success');
}

async function openChat(orderId) {
    state.selectedOrder = state.allOrders.find((entry) => entry.id === orderId);
    if (!state.selectedOrder) return;
    elements.modalTitle.textContent = `Chat for #${state.selectedOrder.orderNumber || orderId.slice(0, 6)}`;
    elements.modalBody.innerHTML = `
    <div id="chatMessages" class="chat-list"></div>
    <form id="chatForm" class="form-grid">
      <textarea id="chatInput" placeholder="Send a message to the restaurant or customer..."></textarea>
      <button class="primary-btn" type="submit">Send</button>
    </form>`;
    elements.modalBackdrop.classList.remove('hidden');
    await loadChatMessages(orderId);
    document.getElementById('chatForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = document.getElementById('chatInput').value.trim();
        if (!text) return;
        await firestore.collection('orders').doc(orderId).collection('messages').add({ text, senderRole: 'delivery_person', senderUid: state.authUser.uid, read: false, isDeleted: false, createdAt: new Date(), updatedAt: new Date() });
        document.getElementById('chatInput').value = '';
    });
}

function loadChatMessages(orderId) {
    if (state.chatsUnsubscribe) state.chatsUnsubscribe();
    state.chatsUnsubscribe = firestore.collection('orders').doc(orderId).collection('messages').orderBy('createdAt', 'asc').onSnapshot((snapshot) => {
        state.chatMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((message) => !message.isDeleted);
        document.getElementById('chatMessages').innerHTML = state.chatMessages.length ? state.chatMessages.map((message) => `
      <div class="chat-bubble ${message.senderRole === 'delivery_person' ? 'self' : ''}">
        <div class="panel-card-header">
          <strong>${message.senderRole === 'delivery_person' ? 'You' : message.senderRole === 'restaurant' ? 'Restaurant' : 'Customer'}</strong>
          <span class="badge">${message.read ? 'Read' : 'Unread'}</span>
        </div>
        <div>${message.text}</div>
        <div class="muted">${formatDate(message.createdAt)}</div>
        <div class="action-row">
          <button class="ghost-btn" type="button" data-delete-chat-message="${message.id}">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-state">No messages yet.</div>';
        document.querySelectorAll('[data-delete-chat-message]').forEach((button) => {
            button.addEventListener('click', async () => {
                await firestore.collection('orders').doc(orderId).collection('messages').doc(button.dataset.deleteChatMessage).set({ isDeleted: true, updatedAt: new Date() }, { merge: true });
            });
        });
    });
}

function openModal(title, body) {
    elements.modalTitle.textContent = title;
    elements.modalBody.innerHTML = body;
    elements.modalBackdrop.classList.remove('hidden');
    elements.modalBackdrop.setAttribute('aria-hidden', 'false');
    elements.modalClose.addEventListener('click', closeModal);
    window.addEventListener('keydown', handleModalEscape);
}

function closeModal() {
    elements.modalBackdrop.classList.add('hidden');
    elements.modalBody.innerHTML = '';
    elements.modalTitle.textContent = 'Dialog';
    elements.modalBackdrop.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
}

function toggleSupportModal() {
    if (!elements.modalBackdrop.classList.contains('hidden') && elements.modalTitle.textContent === 'Help & support') {
        closeModal();
        return;
    }
    openSupportModal();
}

function ensureDeliveryProfileComplete() {
    const profile = state.profile || {};
    const hasRequiredFields = Boolean(profile.phone || profile.mobile || profile.contactPhone) && Boolean(profile.vehicleType || profile.vehicleNumber || profile.vehicle || profile.deliveryVehicle);
    if (!hasRequiredFields) {
        createToast('Please complete your delivery profile before picking up orders.', 'warning');
        return false;
    }
    return true;
}

function openSupportModal() {
    openModal('Help & support', `
      <form id="supportForm" class="form-grid" style="padding:8px 0;">
        <label>Topic<select name="category"><option value="delivery">Delivery issue</option><option value="payment">Payment</option><option value="account">Account</option><option value="other">Other</option></select></label>
        <label>Message<textarea name="message" required placeholder="Describe what you need help with."></textarea></label>
        <label>Email<input name="email" value="${state.profile?.email || state.authUser?.email || ''}" /></label>
        <div class="row-actions">
          <button class="primary-btn" id="submitSupport" type="button">Send request</button>
          <button class="ghost-btn" id="cancelSupport" type="button">Cancel</button>
        </div>
      </form>
    `);

    document.getElementById('submitSupport').addEventListener('click', async () => {
        const form = document.getElementById('supportForm');
        const data = new FormData(form);
        const payload = {
            panel: 'delivery',
            category: String(data.get('category') || 'other'),
            message: String(data.get('message') || '').trim(),
            email: String(data.get('email') || state.profile?.email || state.authUser?.email || '').trim(),
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
            createToast('Support request sent. We will follow up shortly.', 'success');
            closeModal();
        } catch (error) {
            createToast(error.message || 'Unable to send support request.', 'error');
        }
    });
    document.getElementById('cancelSupport').addEventListener('click', closeModal);
}

async function createNotification(recipientUid, title, message, type = 'system') {
    if (!recipientUid) return;
    await firestore.collection('notifications').add({ recipientUid, title, message, type, read: false, isDeleted: false, createdAt: new Date() });
}

function getImagePath(filename, folder = 'products') {
    if (!filename) return './images/placeholders/wrap.jpg';
    const normalized = String(filename).trim();
    if (!normalized) return './images/placeholders/wrap.jpg';
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) return normalized.replace(/^\.\//, '').startsWith('images/') ? `./${normalized.replace(/^\.\//, '')}` : normalized;
    if (normalized.startsWith('images/')) return `./${normalized}`;
    return `./images/${folder}/${normalized}`;
}

document.addEventListener('DOMContentLoaded', init);
