import { initFirebase, isFirebaseReady, subscribeCollection, addDocument, updateDocument, deleteDocument, saveDocument, clearStoredAuthState } from './firebase-config.js';
import { formatCurrency, formatDate, escapeHtml, getInitials, createToast, confirmDialog, getImageUrl, getAddonImageUrl, getRestaurantImageUrl, slugify } from './utils.js';
import { DEFAULT_CATEGORY_TAXONOMY, getCategoryDisplayName, getCategoryOptions } from './category-taxonomy.js';
import { getQRCardHTML, initQRCode, bindQRDownloadHandlers } from './qr-utils.js';

const state = {
  currentSection: 'dashboard',
  theme: localStorage.getItem('manna-theme') || 'dark',
  user: { uid: '', displayName: 'Guest', role: 'guest' },
  data: {
    products: [],
    addons: [],
    restaurants: [],
    customers: [],
    delivery: [],
    orders: [],
    reports: [],
    coupons: [],
    announcements: [],
    notifications: [],
    supportRequests: [],
    financialPayouts: [],
    platformFeePayments: [],
    settings: {},
    logs: []
  },
  filters: {
    products: { q: '', category: 'all', status: 'all', sort: 'date' },
    addons: { q: '', category: 'all', status: 'all', sort: 'date' },
    restaurants: { q: '', status: 'all' },
    customers: { q: '', status: 'all' },
    delivery: { q: '', status: 'all' },
    analytics: { range: 'month', restaurantId: 'all' }
  },
  adminMetrics: {},
  ui: {
    selectedProducts: new Set(),
    selectedAddons: new Set(),
    modal: null,
    unsubscribe: [],
    chartPoints: [],
    adminSessionUnsubscribe: null,
    adminSessionMessages: [],
    adminSessionId: null
  }
};

const content = document.getElementById('content');
const pageTitle = document.getElementById('pageTitle');
const breadcrumb = document.getElementById('breadcrumb');
const globalSearch = document.getElementById('globalSearch');
const searchResults = document.getElementById('searchResults');
const notificationBadge = document.getElementById('notificationBadge');
const modalRoot = document.getElementById('modalRoot');
const adminAvatar = document.getElementById('adminAvatar');
const appShell = document.getElementById('appShell');
const loginView = document.getElementById('loginView');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const mobileNavSheet = document.getElementById('mobileNavSheet');
const mobileNavClose = document.getElementById('mobileNavClose');
const mobileMenuButton = document.getElementById('mobileMenuButton');
const mobileBottomNav = document.getElementById('mobileBottomNav');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarClose = document.getElementById('sidebarClose');
const menuToggle = document.getElementById('menuToggle');

function seedData() {
  const existing = localStorage.getItem('manna-admin-state');
  if (existing) return;

  const now = new Date().toISOString();
  state.data.products = [
    { id: 'p1', name: 'Liberian Fried Rice', category: 'Rice', description: 'Classic fried rice with vegetables', imageFilename: 'liberian fried rice.jpeg', status: 'active', createdAt: now, updatedAt: now, searchKeywords: ['fried rice', 'liberia', 'rice'], preparationCategory: 'Main', suggestedTags: ['popular', 'spicy'] },
    { id: 'p2', name: 'Cassava Leaf Soup', category: 'Soup', description: 'Traditional cassava leaf soup', imageFilename: 'cassava leaf soup.jpeg', status: 'active', createdAt: now, updatedAt: now, searchKeywords: ['cassava', 'soup'], preparationCategory: 'Soup', suggestedTags: ['traditional'] },
    { id: 'p3', name: 'Meat Pie', category: 'Snacks', description: 'Flaky pastry filled with spiced meat', imageFilename: 'meat pie.jpeg', status: 'inactive', createdAt: now, updatedAt: now, searchKeywords: ['pie', 'snack'], preparationCategory: 'Snack', suggestedTags: ['savory'] }
  ];

  state.data.addons = [
    { id: 'a1', name: 'Bottle Water', category: 'water', description: 'Cold bottled water for dine-in and delivery.', imageFilename: 'bottle-water.png', price: 40, status: 'active', createdAt: now, updatedAt: now },
    { id: 'a2', name: 'Soft Drink', category: 'soft-drink', description: 'Refreshing soft drink for any meal.', imageFilename: 'softdrink.png', price: 70, status: 'active', createdAt: now, updatedAt: now }
  ];

  state.data.restaurants = [
    { id: 'r1', name: 'KFC Liberia', ownerName: 'Moses Doe', location: 'Sinkor', phone: '0771234567', logo: 'kfc.png', status: 'approved', isDeleted: false },
    { id: 'r2', name: 'Burger King', ownerName: 'Sarah Kollie', location: 'Broad Street', phone: '0770000000', logo: 'burgerking.png', status: 'pending', isDeleted: false }
  ];

  state.data.customers = [
    { id: 'c1', name: 'Ava Williams', email: 'ava@example.com', phone: '0771111111', address: 'Gardnersville', status: 'active', role: 'customer' },
    { id: 'c2', name: 'Daniel Kromah', email: 'daniel@example.com', phone: '0772222222', address: 'Paynesville', status: 'suspended', role: 'customer' }
  ];

  state.data.delivery = [
    { id: 'd1', name: 'James Paye', email: 'james@example.com', phone: '0773333333', status: 'approved', rating: 4.8, completedOrders: 142, role: 'delivery' },
    { id: 'd2', name: 'Rose Gbotoe', email: 'rose@example.com', phone: '0774444444', status: 'pending', rating: 4.2, completedOrders: 57, role: 'delivery' }
  ];

  state.data.orders = [
    { id: 'o1', orderNumber: 'ORD-1001', customerName: 'Ava Williams', restaurantName: 'KFC Liberia', total: 650, status: 'completed', createdAt: now },
    { id: 'o2', orderNumber: 'ORD-1002', customerName: 'Daniel Kromah', restaurantName: 'Burger King', total: 320, status: 'pending', createdAt: now }
  ];

  state.data.reports = [
    { id: 'rep1', orderId: 'ORD-1001', customerName: 'Ava Williams', restaurantName: 'KFC Liberia', reason: 'Late delivery', comment: 'The order arrived 45 minutes late.', priority: 'high', status: 'pending', createdAt: now },
    { id: 'rep2', orderId: 'ORD-1002', customerName: 'Daniel Kromah', restaurantName: 'Burger King', reason: 'Wrong item', comment: 'The order did not include the drink.', priority: 'medium', status: 'resolved', createdAt: now }
  ];

  state.data.coupons = [
    { id: 'cp1', code: 'WELCOME10', type: 'percentage', value: 10, applicableTo: 'platform', minOrderValue: 300, expiryDate: '2026-12-31', usageLimit: 100, status: 'active' }
  ];

  state.data.announcements = [
    { id: 'a1', title: 'Weekend promotion', message: 'Enjoy special discounts all weekend.', target: 'customers', status: 'published', scheduledAt: '' }
  ];

  state.data.notifications = [
    { id: 'n1', title: 'New report received', message: 'A high priority report needs review.', type: 'system', createdAt: now, read: false },
    { id: 'n2', title: 'Promotion sent', message: 'The weekend campaign was published.', type: 'announcement', createdAt: now, read: true }
  ];

  state.data.settings = {
    platformName: 'MANNA',
    commission: 8,
    currency: 'LRD',
    deliveryFee: 60,
    tax: 2,
    theme: 'dark',
    supportEmail: 'support@manna.app',
    supportPhone: '+231-555-1234',
    platformFeeType: 'percentage',
    platformFeeValue: 8,
    maintenanceMode: false
  };

  state.data.logs = [
    { id: 'l1', user: 'Demo Admin', action: 'Login', details: 'Signed in to admin console', createdAt: now },
    { id: 'l2', user: 'Demo Admin', action: 'Create product', details: 'Created Liberian Fried Rice', createdAt: now }
  ];

  localStorage.setItem('manna-admin-state', JSON.stringify(state.data));
}

function persistData() {
  localStorage.setItem('manna-admin-state', JSON.stringify(state.data));
}

function loadData() {
  const stored = localStorage.getItem('manna-admin-state');
  if (stored) {
    state.data = { ...state.data, ...JSON.parse(stored) };
  }
  if (!state.data.settings) state.data.settings = {};
  if (!state.data.logs) state.data.logs = [];
  if (!state.data.supportRequests) state.data.supportRequests = [];
}

function renderPageLayout(title, subtitle, actions = '', body = '') {
  return `
      <section class="page-shell">
        <div class="section-hero">
          <div>
            <h3 class="heading-3">${escapeHtml(title)}</h3>
            <p class="body-medium">${escapeHtml(subtitle)}</p>
          </div>
          ${actions ? `<div class="section-actions">${actions}</div>` : ''}
        </div>
        <div class="page-content-stack">${body}</div>
      </section>
    `;
}

function setMobileNavOpen(isOpen) {
  const isMobile = window.innerWidth <= 767;

  if (mobileNavSheet) {
    mobileNavSheet.classList.toggle('open', isMobile && isOpen);
    mobileNavSheet.setAttribute('aria-hidden', String(!(isMobile && isOpen)));
  }

  if (sidebar) {
    sidebar.classList.toggle('open', !isMobile && isOpen);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.classList.toggle('open', !isMobile && isOpen);
  }

  document.body.style.overflow = isOpen ? 'hidden' : '';
}

function syncMobileNavItems() {
  const mobileList = document.querySelector('.mobile-nav-list');
  if (!mobileList) return;

  const desktopItems = Array.from(document.querySelectorAll('.nav-item[data-section]')).filter(i => !i.closest('.mobile-nav-list'));
  desktopItems.forEach((item) => {
    const section = item.getAttribute('data-section');
    if (!section) return;

    const existingItem = mobileList.querySelector(`[data-section="${section}"]`);
    if (existingItem) return;

    const mobileBtn = document.createElement('button');
    mobileBtn.className = 'nav-item mobile-nav-item';
    mobileBtn.setAttribute('data-section', section);
    const icon = item.querySelector('.nav-icon')?.innerHTML || '';
    const label = item.textContent.trim() || section;
    mobileBtn.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
    mobileList.appendChild(mobileBtn);
  });

  if (mobileList.dataset.bound === 'true') return;

  mobileList.addEventListener('click', (e) => {
    const btn = e.target.closest('.mobile-nav-item');
    if (!btn) return;
    const section = btn.getAttribute('data-section');
    if (section) {
      setActiveNavigation(section);
      openSection && openSection(section);
      setMobileNavOpen(false);
    }
  });
  mobileList.dataset.bound = 'true';
}

function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  const count = (state.data.notifications || []).filter(n => !n.read).length;
  badge.textContent = count || '';
  badge.style.display = count ? 'inline-flex' : 'none';
}

function setActiveNavigation(section) {
  document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-section') === section);
  });
}

function attachEvents() {
  document.querySelectorAll('.nav-item[data-section], .mobile-nav-item[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.getAttribute('data-section');
      if (section) openSection(section);
      if (window.innerWidth <= 780) {
        setMobileNavOpen(false);
      }
    });
  });

  window.addEventListener('resize', () => {
    if (state.currentSection === 'dashboard') {
      requestAnimationFrame(drawRevenueChart);
    }
  });

  menuToggle?.addEventListener('click', () => setMobileNavOpen(true));
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
  // Ensure mobile menu contains all nav entries from desktop
  syncMobileNavItems();
  // initial badge update
  updateNotificationBadge();

  document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('manna-theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    createToast(`Theme switched to ${state.theme}`, 'success');
  });

  document.getElementById('supportButton')?.addEventListener('click', () => {
    openSection('help');
  });
  document.getElementById('notificationsToggle').addEventListener('click', () => {
    // mark all notifications read and open the notifications section
    (state.data.notifications || []).forEach(n => { n.read = true; });
    updateNotificationBadge();
    openSection && openSection('notifications');
  });
  document.getElementById('messagesButton').addEventListener('click', () => openAdminMessageSession());
  const adminLogout = async () => {
    const { auth } = initFirebase();
    try {
      if (auth) {
        await auth.signOut();
      }
    } catch (error) {
      console.warn('[MANNA] Admin logout warning:', error);
    } finally {
      clearStoredAuthState();
      createToast('You have been logged out.', 'warning');
      window.location.reload();
    }
  };
  document.getElementById('logoutButton').addEventListener('click', adminLogout);
  document.getElementById('logoutButtonSheet')?.addEventListener('click', adminLogout);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  const onboardingOverlay = document.getElementById('onboardingOverlay');
  const closeOnboarding = document.getElementById('closeOnboarding');
  if (closeOnboarding) {
    closeOnboarding.addEventListener('click', () => {
      if (onboardingOverlay) {
        onboardingOverlay.classList.add('hidden');
        onboardingOverlay.setAttribute('aria-hidden', 'true');
      }
      localStorage.setItem('manna-onboarding-seen-admin', 'true');
    });
  }
  if (onboardingOverlay && !localStorage.getItem('manna-onboarding-seen-admin')) {
    onboardingOverlay.classList.remove('hidden');
    onboardingOverlay.setAttribute('aria-hidden', 'false');
  }

  globalSearch.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    if (!query) {
      searchResults.innerHTML = '';
      searchResults.classList.remove('open');
      return;
    }
    const matches = [];
    matches.push(...state.data.products.filter((item) => [item.name, item.category, ...(item.searchKeywords || [])].join(' ').toLowerCase().includes(query)).map((item) => ({ label: `${item.name} • Product`, href: '#', type: 'product' })));
    matches.push(...state.data.addons.filter((item) => [item.name, item.category, item.description].join(' ').toLowerCase().includes(query)).map((item) => ({ label: `${item.name} • Add-On`, href: '#', type: 'addon' })));
    matches.push(...state.data.restaurants.filter((item) => `${item.name} ${item.location}`.toLowerCase().includes(query)).map((item) => ({ label: `${item.name} • Restaurant`, href: '#', type: 'restaurant' })));
    matches.push(...state.data.customers.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(query)).map((item) => ({ label: `${item.name} • Customer`, href: '#', type: 'customer' })));
    matches.push(...state.data.orders.filter((item) => `${item.orderNumber} ${item.customerName}`.toLowerCase().includes(query)).map((item) => ({ label: `${item.orderNumber} • Order`, href: '#', type: 'order' })));
    searchResults.innerHTML = matches.slice(0, 6).map((item) => `<a class="search-result" href="#">${escapeHtml(item.label)}</a>`).join('');
    searchResults.classList.toggle('open', matches.length > 0);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-wrap')) {
      searchResults.classList.remove('open');
    }
  });
}

function clearAdminMessageSession() {
  if (state.ui.adminSessionUnsubscribe) {
    state.ui.adminSessionUnsubscribe();
    state.ui.adminSessionUnsubscribe = null;
  }
  state.ui.adminSessionMessages = [];
  state.ui.adminSessionId = null;
}

function renderAdminMessageSession() {
  const container = document.getElementById('adminSessionMessages');
  if (!container) return;

  if (!state.ui.adminSessionMessages.length) {
    container.innerHTML = '<div class="empty-state">No messages yet. Start the conversation.</div>';
    return;
  }

  container.innerHTML = state.ui.adminSessionMessages.map((message) => {
    const isMine = message.senderUid === state.user.uid;
    const timeLabel = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return `
      <div style="display:flex; justify-content:${isMine ? 'flex-end' : 'flex-start'};">
        <div style="max-width: 78%; padding: 10px 12px; border-radius: 12px; background: ${isMine ? 'rgba(249, 115, 22, 0.16)' : 'rgba(255, 255, 255, 0.06)'}; border: 1px solid ${isMine ? 'rgba(249, 115, 22, 0.28)' : 'rgba(255,255,255,0.1)'}; color: var(--text-main);">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">${escapeHtml(message.senderName || (isMine ? 'You' : 'Admin session'))}${timeLabel ? ` • ${escapeHtml(timeLabel)}` : ''}</div>
          <div>${escapeHtml(message.text || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function openAdminMessageSession() {
  const { db, ready } = initFirebase();
  if (!ready || !db) {
    createToast('Firebase is unavailable right now. The live admin session could not be opened.', 'error');
    return;
  }

  clearAdminMessageSession();
  const sessionId = `admin-${state.user.uid || 'admin'}`;
  state.ui.adminSessionId = sessionId;

  await db.collection('adminSessions').doc(sessionId).set({
    sessionId,
    panel: 'admin',
    title: 'Admin message session',
    participantUid: state.user.uid || 'admin',
    participantName: state.user.displayName || 'Admin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  }, { merge: true });

  openModal('Admin Message Session', `
    <div style="display: flex; flex-direction: column; gap: 12px; min-height: 380px;">
      <div style="padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 12px; background: rgba(255,255,255,0.03); color: var(--text-muted);">
        Live session for <strong>${escapeHtml(state.user.displayName || 'Admin')}</strong>. Messages sync instantly.
      </div>
      <div id="adminSessionMessages" style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;"></div>
      <form id="adminSessionForm" style="display: flex; gap: 8px;">
        <input id="adminSessionInput" type="text" maxlength="500" placeholder="Type a message..." style="flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.04); color: var(--text-main);" />
        <button class="primary-btn" type="submit">Send</button>
      </form>
    </div>
  `);

  const sessionRef = db.collection('adminSessions').doc(sessionId).collection('messages');
  state.ui.adminSessionUnsubscribe = sessionRef.orderBy('createdAt', 'asc').onSnapshot((snapshot) => {
    state.ui.adminSessionMessages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
      };
    });
    renderAdminMessageSession();
  }, (error) => {
    console.error('[MANNA] Admin message session listener failed:', error);
    createToast('The live session is temporarily unavailable.', 'warning');
  });

  document.getElementById('adminSessionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('adminSessionInput');
    const text = input.value.trim();
    if (!text) return;

    try {
      await sessionRef.add({
        sessionId,
        text,
        senderUid: state.user.uid || 'admin',
        senderName: state.user.displayName || 'Admin',
        senderRole: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        read: false,
        isDeleted: false
      });
      input.value = '';
    } catch (error) {
      createToast(error.message || 'Unable to send the message.', 'error');
    }
  });
}

function openSupportModal() {
  openModal('Need help?', `
    <form id="supportForm" class="form-grid" style="padding: 8px 0;">
      <label>Topic<select name="category">
        <option value="account">Account</option>
        <option value="orders">Orders</option>
        <option value="payments">Payments</option>
        <option value="bug">Bug</option>
        <option value="other">Other</option>
      </select></label>
      <label>Message<textarea name="message" required placeholder="Tell us what you need help with."></textarea></label>
      <label>Email<input name="email" value="${escapeHtml(state.user.email || '')}" /></label>
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
      panel: 'admin',
      category: String(data.get('category') || 'other'),
      subject: String(data.get('category') || 'Support request'),
      message: String(data.get('message') || '').trim(),
      email: String(data.get('email') || state.user.email || '').trim(),
      userId: state.user.uid || '',
      status: 'new',
      createdAt: new Date().toISOString()
    };

    if (!payload.message) {
      createToast('Please describe your issue before sending.', 'warning');
      return;
    }

    try {
      await addDocument('supportRequests', payload);
      createToast('Support request sent. Our team will follow up shortly.', 'success');
      closeModal();
    } catch (error) {
      createToast(error.message || 'Unable to send support request.', 'error');
    }
  });
  document.getElementById('cancelSupport').addEventListener('click', closeModal);
}

function openSection(section) {
  state.currentSection = section;
  setActiveNavigation(section);
  setMobileNavOpen(false);
  const titles = {
    dashboard: 'Dashboard',
    products: 'Master Products',
    addons: 'Add-Ons',
    restaurants: 'Restaurants',
    customers: 'Customers',
    delivery: 'Delivery Persons',
    orders: 'Orders',
    analytics: 'Analytics',
    reports: 'Reports',
    coupons: 'Coupons',
    announcements: 'Announcements',
    notifications: 'Notifications',
    settings: 'Settings',
    logs: 'System Logs',
    financials: 'Financial Settlements',
    help: 'Help Center'
  };
  pageTitle.textContent = titles[section] || 'Overview';
  breadcrumb.textContent = `Home / ${pageTitle.textContent}`;
  renderSection(section);
}

function renderSection(section) {
  switch (section) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'products':
      renderProducts();
      break;
    case 'addons':
      renderAddons();
      break;
    case 'restaurants':
      renderRestaurants();
      break;
    case 'customers':
      renderCustomers();
      break;
    case 'delivery':
      renderDelivery();
      break;
    case 'orders':
      renderOrders();
      break;
    case 'analytics':
      renderAnalytics();
      break;
    case 'reports':
      renderReports();
      break;
    case 'coupons':
      renderCoupons();
      break;
    case 'announcements':
      renderAnnouncements();
      break;
    case 'notifications':
      renderNotifications();
      break;
    case 'settings':
      renderSettings();
      break;
    case 'logs':
      renderLogs();
      break;
    case 'financials':
      renderFinancials();
      break;
    case 'help':
      renderHelpCenter();
      break;
    default:
      renderDashboard();
  }
}

function getDashboardMetrics() {
  const activeProducts = state.data.products.filter((item) => item.status === 'active' && !item.isDeleted).length;
  const activeRestaurants = state.data.restaurants.filter((item) => item.status === 'approved' && !item.isDeleted).length;
  const activeCustomers = state.data.customers.filter((item) => item.status === 'active' && !item.isDeleted).length;
  const activeDelivery = state.data.delivery.filter((item) => item.status === 'approved' && !item.isDeleted).length;
  const pendingRestaurants = state.data.restaurants.filter((item) => item.status === 'pending' && !item.isDeleted).length;
  const pendingReports = state.data.reports.filter((item) => item.status === 'pending').length;
  const unreadNotifications = state.data.notifications.filter((item) => !item.read).length;
  const revenue = state.data.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const completedOrders = state.data.orders.filter((item) => item.status === 'completed').length;
  const cancelledOrders = state.data.orders.filter((item) => item.status === 'cancelled').length;

  return {
    restaurants: { key: 'restaurants', title: 'Active Restaurants', value: activeRestaurants, meta: 'approved', badge: 'Live', accent: false, icon: 'store' },
    customers: { key: 'customers', title: 'Active Customers', value: activeCustomers, meta: 'retained', badge: 'Stable', accent: false, icon: 'users' },
    delivery: { key: 'delivery', title: 'Active Riders', value: activeDelivery, meta: 'on route', badge: 'Busy', accent: false, icon: 'delivery' },
    orders: { key: 'orders', title: 'Orders', value: state.data.orders.length, meta: 'all time', badge: 'Flow', accent: false, icon: 'orders' },
    revenue: { key: 'revenue', title: 'Revenue', value: formatCurrency(revenue), meta: 'this week', badge: 'Growth', accent: true, icon: 'revenue' },
    reports: { key: 'reports', title: 'Pending Reports', value: pendingReports, meta: 'unresolved', badge: 'Priority', accent: false, icon: 'reports' },
    products: { key: 'products', title: 'Active Products', value: activeProducts, meta: 'catalog', badge: 'Fresh', accent: false, icon: 'products' },
    notifications: { key: 'notifications', title: 'Unread Alerts', value: unreadNotifications, meta: 'new activity', badge: 'Updates', accent: false, icon: 'alerts' },
    completed: { key: 'completed', title: 'Completed Orders', value: completedOrders, meta: 'fulfilled', badge: 'On time', accent: false, icon: 'check' },
    cancelled: { key: 'cancelled', title: 'Cancelled Orders', value: cancelledOrders, meta: 'rework', badge: 'Risk', accent: false, icon: 'alert' },
    pendingRestaurants: { key: 'pendingRestaurants', title: 'Pending Restaurants', value: pendingRestaurants, meta: 'review', badge: 'Needs review', accent: false, icon: 'review' }
  };
}

function renderMetricIcon(iconName) {
  const icons = {
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 19v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1"/><circle cx="10" cy="7" r="3"/><path d="M17 8a2 2 0 100 4 2 2 0 000-4zm4 10v-1a2 2 0 00-2-2"/></svg>',
    delivery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="10" height="8" rx="2"/><path d="M13 10h4l3 3v3h-2"/><circle cx="8" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4h10l2 2v13l-2 2H7l-2-2V6l2-2z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    products: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l8-3 8 3v10l-8 3-8-3z"/><path d="M4 7l8 3 8-3"/><path d="M12 10v11"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4a5 5 0 00-5 5v3l-1 2h12l-1-2V9a5 5 0 00-5-5z"/><path d="M10 18a2 2 0 104 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12l4 4 10-10"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4l8 14H4L12 4z"/><path d="M12 9v4"/><path d="M12 15h.01"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 7h8M8 12h8M8 17h5"/><path d="M4 4h16v16H4z"/></svg>'
  };
  return icons[iconName] || icons.store;
}

function renderMetricCard(metric) {
  return `
      <article class="metric-card ${metric.accent ? 'accent-card' : ''}" data-metric-key="${metric.key}">
        <div class="metric-top">
          <div class="metric-icon">${renderMetricIcon(metric.icon)}</div>
          <span class="metric-badge">${escapeHtml(metric.badge)}</span>
        </div>
        <div class="metric-number">${escapeHtml(metric.value)}</div>
        <div class="metric-title">${escapeHtml(metric.title)}</div>
        <div class="metric-meta">${escapeHtml(metric.meta)}</div>
      </article>
    `;
}

function renderEmptyState(title, description) {
  return `
      <div class="empty-state fade-in">
        <img src="./images/placeholders/empty-state.svg" alt="" class="empty-icon" />
        <h3 class="empty-title">${escapeHtml(title)}</h3>
        <p class="empty-description">${escapeHtml(description)}</p>
      </div>
    `;
}

function getOrderTimestamp(order) {
  if (!order?.createdAt) return null;
  const createdAt = order.createdAt;
  if (typeof createdAt?.toDate === 'function') return createdAt.toDate();
  const parsed = createdAt?.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getRevenueSeries() {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const values = labels.map((label, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (labels.length - 1 - index));
    const key = day.toISOString().slice(0, 10);
    const total = state.data.orders
      .filter((order) => getDateKey(order.createdAt) === key)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    return { label, value: total };
  });
  return values;
}

function drawRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);
  const padding = { top: 24, right: 16, bottom: 36, left: 16 };
  const values = getRevenueSeries();
  const maxValue = Math.max(...values.map((value) => value.value), 1);
  const stepX = (width - padding.left - padding.right) / Math.max(values.length - 1, 1);

  state.ui.chartPoints = values.map((point, index) => {
    const x = padding.left + index * stepX;
    const y = height - padding.bottom - (point.value / maxValue) * (height - padding.top - padding.bottom);
    return { ...point, x, y };
  });

  ctx.beginPath();
  state.ui.chartPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.closePath();

  const fill = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  fill.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
  fill.addColorStop(1, 'rgba(249, 115, 22, 0.02)');
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  state.ui.chartPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f97316';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  state.ui.chartPoints.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6.5, 0, Math.PI * 2);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f97316';
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function buildAnalyticsSnapshot() {
  const windowOrders = state.data.orders.filter((order) => {
    const createdAt = getOrderTimestamp(order);
    if (!createdAt) return false;
    const range = state.filters.analytics.range || 'month';
    if (range === 'day') {
      const windowStart = Date.now() - 24 * 60 * 60 * 1000;
      return createdAt.getTime() >= windowStart;
    }
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return createdAt >= startOfMonth;
  }).filter((order) => {
    if (state.filters.analytics.restaurantId === 'all') return true;
    return String(order.restaurantId || order.restaurantName || '') === state.filters.analytics.restaurantId;
  });

  const completed = windowOrders.filter((order) => ['completed', 'delivered', 'received'].includes(order.status));
  const refunded = windowOrders.filter((order) => {
    const refundStatus = String(order.refundStatus || '').toLowerCase();
    return ['requested', 'approved', 'rejected', 'confirmed', 'processed'].includes(refundStatus) || order.refundRequested || ['refund_approved', 'refunded'].includes(order.status);
  });
  const revenue = completed.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const refunds = refunded.reduce((sum, order) => sum + Number(order.refundAmount || order.total || 0), 0);
  const netCashflow = revenue - refunds;
  const purchaseCount = completed.length;
  const refundRate = purchaseCount ? (refunded.length / purchaseCount) * 100 : 0;
  const averageOrder = purchaseCount ? revenue / purchaseCount : 0;

  const series = state.filters.analytics.range === 'day'
    ? Array.from({ length: 24 }, (_, index) => {
      const bucketDate = new Date(Date.now() - (23 - index) * 60 * 60 * 1000);
      const bucketOrders = windowOrders.filter((order) => {
        const createdAt = getOrderTimestamp(order);
        return createdAt && createdAt.getHours() === bucketDate.getHours() && createdAt.getDate() === bucketDate.getDate();
      });
      const bucketRevenue = bucketOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return { label: `${String(bucketDate.getHours()).padStart(2, '0')}:00`, value: bucketRevenue };
    })
    : Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }, (_, index) => {
      const day = index + 1;
      const bucketOrders = windowOrders.filter((order) => {
        const createdAt = getOrderTimestamp(order);
        return createdAt && createdAt.getDate() === day;
      });
      const bucketRevenue = bucketOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return { label: `${day}`, value: bucketRevenue };
    });

  return {
    orders: windowOrders,
    completed,
    refunded,
    revenue,
    refunds,
    netCashflow,
    purchaseCount,
    refundRate,
    averageOrder,
    series
  };
}

function renderDashboard() {
  state.adminMetrics = getDashboardMetrics();
  const metrics = Object.values(state.adminMetrics);
  const pendingReports = state.data.reports.filter((item) => item.status === 'pending');
  const supportRequests = state.data.supportRequests.slice(0, 5);

  content.innerHTML = `
      <section class="dashboard-shell">
        <div class="dashboard-hero">
          <div>
            <p class="eyebrow">Operations Overview</p>
            <h3 class="heading-3">Premium command center for restaurants, orders, and growth.</h3>
            <p class="body-medium">Monitor performance in real time with live Firestore updates and executive-friendly analytics.</p>
          </div>
          <div class="hero-badge">Live • ${state.data.orders.length} orders tracked</div>
        </div>

        <div class="metric-grid">
          ${metrics.slice(0, 8).map((metric) => renderMetricCard(metric)).join('')}
        </div>

        <div class="dashboard-grid">
          <section class="chart-card">
            <div class="panel-card-header">
              <div>
                <h3 class="heading-4">Revenue Trend</h3>
                <p class="body-small">Weekly revenue overview</p>
              </div>
              <span class="metric-badge">Live</span>
            </div>
            <div class="chart-container">
              <canvas id="revenueChart" width="100%" height="220"></canvas>
              <div id="chartTooltip" class="chart-tooltip hidden"></div>
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-card-header">
              <div>
                <h3 class="heading-4">Top Restaurants</h3>
                <p class="body-small">Highest volume</p>
              </div>
            </div>
            <div class="stack">
              ${state.data.restaurants.slice(0, 4).map((restaurant) => `
                <div class="list-row">
                  <span>${escapeHtml(restaurant.name)}</span>
                  <span class="metric-badge">${escapeHtml(restaurant.status || 'approved')}</span>
                </div>
              `).join('')}
            </div>
          </section>
        </div>

        <div class="dashboard-grid">
          <section class="panel-card">
            <div class="panel-card-header">
              <div>
                <h3 class="heading-4">Recent Activity</h3>
                <p class="body-small">Latest orders and fulfilment events</p>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
                <tbody>
                  ${state.data.orders.slice(0, 6).map((order) => `
                    <tr>
                      <td>${escapeHtml(order.orderNumber || order.id)}</td>
                      <td>${escapeHtml(order.customerName || 'Customer')}</td>
                      <td><span class="metric-badge">${escapeHtml(order.status || 'pending')}</span></td>
                      <td>${formatCurrency(order.total || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-card-header">
              <div>
                <h3 class="heading-4">Recent Reports</h3>
                <p class="body-small">Needs attention</p>
              </div>
            </div>
            ${pendingReports.length ? pendingReports.slice(0, 4).map((report) => `
              <div class="list-row report-row">
                <div>
                  <strong>${escapeHtml(report.reason || 'Report')}</strong>
                  <div class="body-small">${escapeHtml(report.customerName || 'Customer')} • ${escapeHtml(report.restaurantName || 'Restaurant')}</div>
                </div>
                <span class="metric-badge">${escapeHtml(report.priority || 'high')}</span>
              </div>
            `).join('') : renderEmptyState('No unresolved reports', 'All reports have been resolved. Stay tuned.')}
          </section>
        </div>

        <div class="dashboard-grid">
          <section class="panel-card">
            <div class="panel-card-header">
              <div>
                <h3 class="heading-4">Support Queue</h3>
                <p class="body-small">Help requests from customers, restaurants, and riders.</p>
              </div>
            </div>
            ${supportRequests.length ? supportRequests.map((request) => `
              <div class="list-row">
                <div>
                  <strong>${escapeHtml(request.subject || request.message || 'Support request')}</strong>
                  <div class="body-small">${escapeHtml(request.panel || 'panel')} • ${escapeHtml(request.email || request.userEmail || 'Unknown')}</div>
                </div>
                <span class="metric-badge">${escapeHtml(request.status || 'new')}</span>
              </div>
            `).join('') : renderEmptyState('No support requests yet', 'New help requests will appear here instantly.')}
          </section>
        </div>
      </section>
    `;

  requestAnimationFrame(() => {
    drawRevenueChart();
    content.querySelectorAll('.metric-card').forEach((card, index) => {
      card.style.animationDelay = `${index * 60}ms`;
      card.classList.add('fade-in');
    });

    const chartCanvas = document.getElementById('revenueChart');
    const tooltip = document.getElementById('chartTooltip');
    if (chartCanvas && tooltip) {
      chartCanvas.addEventListener('mousemove', (event) => {
        const rect = chartCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const points = state.ui.chartPoints;
        const closest = points.reduce((previous, point) => {
          const previousDistance = Math.abs(previous.x - x);
          const currentDistance = Math.abs(point.x - x);
          return currentDistance < previousDistance ? point : previous;
        }, points[0] || { x: 0, y: 0 });

        const tooltipContent = `${escapeHtml(closest.label || '')}: ${formatCurrency(closest.value || 0)}`;
        tooltip.innerHTML = tooltipContent;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${closest.x}px`;
        tooltip.style.top = `${closest.y - 8}px`;
      });
      chartCanvas.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
    }
  });

  updateNotificationBadge();
}

function renderAddons() {
  const filtered = state.data.addons.filter((item) => !item.isDeleted).filter((item) => {
    const query = state.filters.addons.q.toLowerCase();
    const matchesQuery = !query || [item.name, item.category, item.description].join(' ').toLowerCase().includes(query);
    const matchesCategory = state.filters.addons.category === 'all' || item.category === state.filters.addons.category;
    const matchesStatus = state.filters.addons.status === 'all' || item.status === state.filters.addons.status;
    return matchesQuery && matchesCategory && matchesStatus;
  }).sort((first, second) => {
    if (state.filters.addons.sort === 'name') return (first.name || '').localeCompare(second.name || '');
    return new Date(second.updatedAt || second.createdAt || 0) - new Date(first.updatedAt || first.createdAt || 0);
  });
  const categories = [...new Set(state.data.addons.map((item) => item.category).filter(Boolean))];
  content.innerHTML = renderPageLayout(
    'Add-Ons',
    'Create reusable add-ons once and attach them to menu items.',
    `<button class="primary-btn" id="createAddonButton">Create Add-On</button>`,
    `
      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Master add-on catalog</h3>
            <p class="card-subtitle">Keep your add-on options consistent across restaurants and checkout.</p>
          </div>
        </div>
        <div class="toolbar-grid">
          <label>Search<input id="addonSearch" value="${escapeHtml(state.filters.addons.q)}" /></label>
          <label>Category<select id="addonCategory">
            <option value="all">All categories</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}" ${state.filters.addons.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
          </select></label>
          <label>Status<select id="addonStatus">
            <option value="all">All statuses</option>
            <option value="active" ${state.filters.addons.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${state.filters.addons.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select></label>
          <label>Sort<select id="addonSort">
            <option value="date" ${state.filters.addons.sort === 'date' ? 'selected' : ''}>Date</option>
            <option value="name" ${state.filters.addons.sort === 'name' ? 'selected' : ''}>Name</option>
          </select></label>
        </div>
        ${filtered.length ? `<div class="product-grid">${filtered.map(renderAddonCard).join('')}</div>` : `<div class="empty-state">${state.data.addons.length ? 'No add-ons match your filters.' : 'No add-ons yet. Create one using the button above.'}</div>`}
      </section>
    `
  );
  document.getElementById('createAddonButton').addEventListener('click', () => openAddonModal());
  document.querySelectorAll('[data-edit-addon]').forEach((button) => {
    button.addEventListener('click', () => openAddonModal(button.dataset.editAddon));
  });
  document.querySelectorAll('[data-delete-addon]').forEach((button) => {
    button.addEventListener('click', () => deleteAddon(button.dataset.deleteAddon));
  });
  document.getElementById('addonSearch').addEventListener('input', (event) => {
    state.filters.addons.q = event.target.value;
    renderAddons();
  });
  document.getElementById('addonCategory').addEventListener('change', (event) => {
    state.filters.addons.category = event.target.value;
    renderAddons();
  });
  document.getElementById('addonStatus').addEventListener('change', (event) => {
    state.filters.addons.status = event.target.value;
    renderAddons();
  });
  document.getElementById('addonSort').addEventListener('change', (event) => {
    state.filters.addons.sort = event.target.value;
    renderAddons();
  });
}

function normalizeAddonCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase();
  const categoryMap = {
    water: 'Water',
    'non alcoholic drinks': 'Non Alcoholic drinks',
    'non-alcoholic drinks': 'Non Alcoholic drinks',
    'alcoholic drinks': 'Alcoholic drinks',
    alcoholic: 'Alcoholic drinks'
  };
  return categoryMap[normalized] || String(category || '').trim() || 'Water';
}

function renderAddonCard(addon) {
  return `
    <article class="product-card">
      <img src="${getAddonImageUrl(addon.imageFilename || addon.image || '')}" alt="${escapeHtml(addon.name || 'Add-on')}" onerror="this.src='./images/placeholder.png'" />
      <div class="product-card__body">
        <div class="panel-card-header">
          <strong>${escapeHtml(addon.name || 'Untitled add-on')}</strong>
          <span class="badge">${escapeHtml(addon.category || 'General')}</span>
        </div>
        <div class="muted">${escapeHtml(addon.description || 'Reusable add-on option for checkout.')}</div>
        <div class="muted">Price: ${formatCurrency(addon.price || 0)}</div>
        <div class="modal-actions">
          <button class="ghost-btn" data-edit-addon="${addon.id}">Edit</button>
          <button class="ghost-btn" data-delete-addon="${addon.id}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function openAddonModal(addonId = null) {
  const addon = state.data.addons.find((item) => item.id === addonId) || {};
  const initialCategory = normalizeAddonCategory(addon.category);
  const initialImage = String(addon.imageFilename || addon.image || '').trim();

  openModal('Add-On', `
    <form id="addonForm" class="form-grid" style="padding: 8px 0;">
      <label>Name<input name="name" value="${escapeHtml(addon.name || '')}" required /></label>
      <label>Price<input name="price" type="number" min="0" value="${addon.price ?? 0}" /></label>
      <label>Category<select name="category">
        <option value="Water" ${initialCategory === 'Water' ? 'selected' : ''}>Water</option>
        <option value="Non Alcoholic drinks" ${initialCategory === 'Non Alcoholic drinks' ? 'selected' : ''}>Non Alcoholic drinks</option>
        <option value="Alcoholic drinks" ${initialCategory === 'Alcoholic drinks' ? 'selected' : ''}>Alcoholic drinks</option>
      </select></label>
      <label>Status<select name="status">
        <option value="active" ${addon.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${addon.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select></label>
      <label>Image<input id="addonImageInput" name="imageFilename" value="${escapeHtml(initialImage)}" placeholder="bottle-water.png" /></label>
      <div id="addonImagePreviewWrapper" class="addon-image-preview-wrapper ${initialImage ? '' : 'hidden'}">
        <div class="addon-image-preview-label">Preview</div>
        <img id="addonImagePreview" class="addon-image-preview" src="${escapeHtml(getAddonImageUrl(initialImage))}" alt="Add-on preview" />
        <div id="addonImageStatus" class="addon-image-preview-status">${initialImage ? 'Previewing the selected image' : 'No image selected'}</div>
      </div>
      <label class="full">Description<textarea name="description">${escapeHtml(addon.description || '')}</textarea></label>
      <div class="modal-actions full">
        <button class="ghost-btn" type="button" id="cancelAddonModal">Cancel</button>
        <button class="primary-btn" type="submit">Save add-on</button>
      </div>
    </form>
  `);

  const imageInput = document.getElementById('addonImageInput');
  const previewWrapper = document.getElementById('addonImagePreviewWrapper');
  const previewImage = document.getElementById('addonImagePreview');
  const previewStatus = document.getElementById('addonImageStatus');
  const updatePreview = () => {
    const imageValue = String(imageInput?.value || '').trim();
    if (!imageValue) {
      previewWrapper?.classList.add('hidden');
      if (previewImage) previewImage.src = './images/placeholder.png';
      if (previewStatus) previewStatus.textContent = 'No image selected';
      return;
    }
    previewWrapper?.classList.remove('hidden');
    if (previewImage) {
      const resolvedUrl = getAddonImageUrl(imageValue);
      previewImage.onerror = () => {
        previewImage.src = './images/placeholder.png';
        if (previewStatus) previewStatus.textContent = 'Image not found — using placeholder';
      };
      previewImage.onload = () => {
        if (previewStatus) previewStatus.textContent = 'Previewing the selected image';
      };
      previewImage.src = resolvedUrl;
      if (previewStatus) previewStatus.textContent = 'Loading image preview…';
    }
  };

  imageInput?.addEventListener('input', updatePreview);
  imageInput?.addEventListener('change', updatePreview);
  updatePreview();
  document.getElementById('addonForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      price: Number(formData.get('price') || 0),
      category: normalizeAddonCategory(String(formData.get('category') || '').trim()),
      imageFilename: String(formData.get('imageFilename') || '').trim(),
      image: String(formData.get('imageFilename') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status: String(formData.get('status') || 'active'),
      updatedAt: new Date().toISOString()
    };
    if (!payload.name) {
      createToast('Please add an add-on name.', 'warning');
      return;
    }
    const duplicate = state.data.addons.some((item) => item.id !== addonId && item.name?.toLowerCase() === payload.name.toLowerCase() && !item.isDeleted);
    if (duplicate) {
      createToast('An add-on with that name already exists.', 'warning');
      return;
    }
    try {
      if (addonId) {
        await updateDocument('masterAddons', addonId, payload);
      } else {
        await saveDocument('masterAddons', { ...payload, createdAt: new Date().toISOString(), isDeleted: false });
      }
      closeModal();
      createToast(addonId ? 'Add-on updated.' : 'Add-on created.', 'success');
    } catch (error) {
      createToast(error.message || 'Unable to save the add-on.', 'error');
    }
  });
  document.getElementById('cancelAddonModal').addEventListener('click', closeModal);
}

async function deleteAddon(addonId) {
  if (!confirmDialog('Delete this add-on from the master catalog?')) return;
  try {
    await updateDocument('masterAddons', addonId, { isDeleted: true, status: 'deleted', updatedAt: new Date().toISOString() });
    createToast('Add-on removed from the catalog.', 'success');
  } catch (error) {
    createToast(error.message || 'Unable to delete the add-on.', 'error');
  }
}

function renderProducts() {
  const filtered = state.data.products.filter((item) => !item.isDeleted).filter((item) => {
    const query = state.filters.products.q.toLowerCase();
    const matchesQuery = !query || [item.name, item.category, ...(item.searchKeywords || [])].join(' ').toLowerCase().includes(query);
    const matchesCategory = state.filters.products.category === 'all' || item.category === state.filters.products.category;
    const matchesStatus = state.filters.products.status === 'all' || item.status === state.filters.products.status;
    return matchesQuery && matchesCategory && matchesStatus;
  }).sort((a, b) => {
    if (state.filters.products.sort === 'name') return a.name.localeCompare(b.name);
    if (state.filters.products.sort === 'date') return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    return (b.searchKeywords?.length || 0) - (a.searchKeywords?.length || 0);
  });

  const categories = [...new Set(state.data.products.map((item) => getCategoryDisplayName(item.category)).filter(Boolean))];

  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Master Product Catalog</h3>
          <p class="card-subtitle">Create, edit, and manage global offerings</p>
        </div>
        <div class="row-actions">
          <button class="primary-btn" id="openProductModal">Add Product</button>
          <button class="secondary-btn" id="bulkActivateProducts">Activate Selected</button>
          <button class="ghost-btn" id="bulkDeleteProducts">Delete Selected</button>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr 1fr; margin-bottom: 14px;">
        <label>Search<input id="productSearch" value="${escapeHtml(state.filters.products.q)}" /></label>
        <label>Category<select id="productCategory">
          <option value="all">All</option>
          ${categories.map((category) => `<option value="${escapeHtml(category)}" ${state.filters.products.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select></label>
        <label>Status<select id="productStatus">
          <option value="all">All</option>
          <option value="active" ${state.filters.products.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${state.filters.products.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select></label>
        <label>Sort<select id="productSort">
          <option value="date" ${state.filters.products.sort === 'date' ? 'selected' : ''}>Date</option>
          <option value="name" ${state.filters.products.sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="popularity" ${state.filters.products.sort === 'popularity' ? 'selected' : ''}>Popularity</option>
        </select></label>
      </div>
      ${filtered.length ? `<div class="product-grid">${filtered.map(renderProductCard).join('')}</div>` : `<div class="empty-state">${state.data.products.length ? 'No master products match your filters.' : 'No products yet. Create one using the form above.'}</div>`}
    </section>
  `;

  document.getElementById('openProductModal').addEventListener('click', () => openProductModal());
  document.getElementById('bulkActivateProducts').addEventListener('click', () => bulkUpdateProducts('active'));
  document.getElementById('bulkDeleteProducts').addEventListener('click', () => bulkUpdateProducts('delete'));
  document.getElementById('productSearch').addEventListener('input', (event) => {
    state.filters.products.q = event.target.value;
    renderProducts();
  });
  document.getElementById('productCategory').addEventListener('change', (event) => {
    state.filters.products.category = event.target.value;
    renderProducts();
  });
  document.getElementById('productStatus').addEventListener('change', (event) => {
    state.filters.products.status = event.target.value;
    renderProducts();
  });
  document.getElementById('productSort').addEventListener('change', (event) => {
    state.filters.products.sort = event.target.value;
    renderProducts();
  });
  bindProductActions();
}

function renderProductCard(product) {
  const imageValue = product.imageFilename || product.image || '';
  return `
    <article class="product-card">
      <img src="${getImageUrl(imageValue)}" alt="${escapeHtml(product.name)}" onerror="this.src='./images/placeholder.png'" />
      <div class="row-actions">
        <input type="checkbox" class="product-select" value="${escapeHtml(product.id)}" ${state.ui.selectedProducts.has(product.id) ? 'checked' : ''} />
        <span class="badge-status ${product.status === 'active' ? 'active' : 'pending'}">${escapeHtml(product.status)}</span>
      </div>
      <h4>${escapeHtml(product.name)}</h4>
      <p>${escapeHtml(product.description)}</p>
      <p style="color: var(--accent-2)">${escapeHtml(getCategoryDisplayName(product.category))}</p>
      <div class="product-actions">
        <button class="secondary-btn edit-product" data-id="${escapeHtml(product.id)}">Edit</button>
        <button class="ghost-btn toggle-product" data-id="${escapeHtml(product.id)}">${product.status === 'active' ? 'Deactivate' : 'Activate'}</button>
        <button class="ghost-btn delete-product" data-id="${escapeHtml(product.id)}">Delete</button>
      </div>
    </article>
  `;
}

function bindProductActions() {
  document.querySelectorAll('.edit-product').forEach((button) => button.addEventListener('click', () => openProductModal(button.getAttribute('data-id'))));
  document.querySelectorAll('.toggle-product').forEach((button) => button.addEventListener('click', () => toggleProduct(button.getAttribute('data-id'))));
  document.querySelectorAll('.delete-product').forEach((button) => button.addEventListener('click', () => deleteProduct(button.getAttribute('data-id'))));
  document.querySelectorAll('.product-select').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
    if (event.target.checked) state.ui.selectedProducts.add(event.target.value); else state.ui.selectedProducts.delete(event.target.value);
  }));
}

function openProductModal(productId = null) {
  const product = state.data.products.find((item) => item.id === productId) || {};
  const imageValue = product.imageFilename || product.image || '';
  const form = `
    <form id="productForm" class="form-grid">
      <label>Name<input name="name" required value="${escapeHtml(product.name || '')}" /></label>
      <label>Description<textarea name="description" required>${escapeHtml(product.description || '')}</textarea></label>
      <label>Category<select name="category">
        <option value="">General</option>
        ${getCategoryOptions().map((category) => `<option value="${escapeHtml(category.name)}" ${String(product.category || '').toLowerCase() === category.name.toLowerCase() ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
      </select></label>
      <label>Image Path<input name="imageFilename" value="${escapeHtml(imageValue)}" /></label>
      <label>Search Keywords<input name="searchKeywords" value="${escapeHtml((product.searchKeywords || []).join(', '))}" /></label>
      <label>Preparation Category<input name="preparationCategory" value="${escapeHtml(product.preparationCategory || '')}" /></label>
      <label>Status<select name="status"><option value="active" ${product.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${product.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></label>
      <div class="card" style="padding: 12px;">
        <strong>Image Preview</strong>
        <img id="productImagePreview" src="${getImageUrl(imageValue)}" alt="Preview" style="width: 100%; height: 160px; object-fit: cover; border-radius: 12px; margin-top: 8px;" onerror="this.src='./images/placeholder.png'" />
      </div>
      <div class="row-actions">
        <button class="primary-btn" id="saveProduct" type="button">Save Product</button>
        <button class="ghost-btn" id="cancelModal" type="button">Cancel</button>
      </div>
    </form>
  `;
  openModal(productId ? 'Edit Product' : 'Create Product', form);

  const productForm = document.getElementById('productForm');
  productForm.querySelector('input[name="imageFilename"]').addEventListener('change', (event) => {
    const preview = document.getElementById('productImagePreview');
    const nextPath = String(event.target.value || '').trim();
    preview.src = getImageUrl(nextPath);
  });

  document.getElementById('saveProduct').addEventListener('click', async () => {
    const formData = new FormData(productForm);
    const imageValue = String(formData.get('imageFilename') || '').trim();
    const payload = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      category: String(formData.get('category') || '').trim(),
      imageFilename: imageValue,
      image: imageValue,
      searchKeywords: String(formData.get('searchKeywords') || '').split(',').map((item) => item.trim()).filter(Boolean),
      preparationCategory: String(formData.get('preparationCategory') || '').trim(),
      status: String(formData.get('status') || 'active'),
      updatedAt: new Date().toISOString(),
      createdAt: product.createdAt || new Date().toISOString(),
      suggestedTags: product.suggestedTags || []
    };

    if (!payload.name || !payload.description) {
      createToast('Please provide a name and description.', 'warning');
      return;
    }

    const duplicate = state.data.products.some((item) => item.id !== productId && item.name.toLowerCase() === payload.name.toLowerCase() && !item.isDeleted);
    if (duplicate) {
      createToast('A product with that name already exists.', 'warning');
      return;
    }

    try {
      if (productId) {
        await updateDocument('masterProducts', productId, payload);
        const index = state.data.products.findIndex((item) => item.id === productId);
        if (index >= 0) {
          state.data.products[index] = { ...state.data.products[index], ...payload, id: productId };
        }
        createToast('Product updated successfully.', 'success');
        state.data.logs.unshift({ id: Date.now().toString(), user: state.user.displayName, action: 'Update product', details: payload.name, createdAt: new Date().toISOString() });
      } else {
        const result = await saveDocument('masterProducts', payload);
        const newId = result?.id || `p-${Date.now()}`;
        state.data.products.unshift({ id: newId, ...payload, createdAt: new Date().toISOString() });
        createToast('Product created successfully.', 'success');
        state.data.logs.unshift({ id: Date.now().toString(), user: state.user.displayName, action: 'Create product', details: payload.name, createdAt: new Date().toISOString() });
      }

      persistData();
      closeModal();
      renderProducts();
      renderDashboard();
    } catch (error) {
      console.error(error);
      createToast(error.message || 'Unable to save the product right now.', 'error');
    }
  });

  document.getElementById('cancelModal').addEventListener('click', closeModal);
}

async function toggleProduct(productId) {
  const product = state.data.products.find((item) => item.id === productId);
  if (!product) return;
  const nextStatus = product.status === 'active' ? 'inactive' : 'active';
  try {
    await updateDocument('masterProducts', productId, { status: nextStatus, updatedAt: new Date().toISOString() });
    product.status = nextStatus;
    product.updatedAt = new Date().toISOString();
    persistData();
    createToast('Product status updated.', 'success');
    renderProducts();
  } catch (error) {
    console.error(error);
    createToast('Unable to update the product status.', 'error');
  }
}

async function deleteProduct(productId) {
  if (!confirmDialog('Soft delete this product? It can be restored later.')) return;
  const product = state.data.products.find((item) => item.id === productId);
  if (!product) return;
  try {
    await updateDocument('masterProducts', productId, { isDeleted: true, status: 'deleted', updatedAt: new Date().toISOString() });
    product.isDeleted = true;
    product.status = 'deleted';
    product.updatedAt = new Date().toISOString();
    persistData();
    createToast('Product soft deleted.', 'warning');
    renderProducts();
  } catch (error) {
    console.error(error);
    createToast('Unable to delete the product.', 'error');
  }
}

async function bulkUpdateProducts(action) {
  if (!state.ui.selectedProducts.size) {
    createToast('Select at least one product first.', 'warning');
    return;
  }
  if (action === 'delete' && !confirmDialog('Delete selected products?')) return;
  try {
    const selectedIds = Array.from(state.ui.selectedProducts);
    await Promise.all(selectedIds.map((id) => {
      const product = state.data.products.find((item) => item.id === id);
      if (!product) return Promise.resolve();
      if (action === 'delete') {
        product.isDeleted = true;
        product.status = 'deleted';
        return updateDocument('masterProducts', id, { isDeleted: true, status: 'deleted', updatedAt: new Date().toISOString() });
      }
      product.status = 'active';
      return updateDocument('masterProducts', id, { status: 'active', updatedAt: new Date().toISOString() });
    }));
    state.ui.selectedProducts.clear();
    persistData();
    createToast('Bulk action completed.', 'success');
    renderProducts();
  } catch (error) {
    console.error(error);
    createToast('Unable to apply the bulk update.', 'error');
  }
}

function renderRestaurants() {
  const filtered = state.data.restaurants.filter((item) => !item.isDeleted).filter((item) => {
    const query = state.filters.restaurants.q.toLowerCase();
    const matches = !query || `${item.name} ${item.ownerName} ${item.location}`.toLowerCase().includes(query);
    const matchesStatus = state.filters.restaurants.status === 'all' || item.status === state.filters.restaurants.status;
    return matches && matchesStatus;
  });

  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Restaurant Management</h3>
          <p class="card-subtitle">Approve, review, and manage restaurant partners</p>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr; margin-bottom: 14px;">
        <label>Search<input id="restaurantSearch" value="${escapeHtml(state.filters.restaurants.q)}" /></label>
        <label>Status<select id="restaurantStatus">
          <option value="all">All</option>
          <option value="approved" ${state.filters.restaurants.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="pending" ${state.filters.restaurants.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="rejected" ${state.filters.restaurants.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          <option value="suspended" ${state.filters.restaurants.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select></label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Restaurant</th><th>Owner</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${filtered.map((restaurant) => `
              <tr>
                <td><div style="display:flex;align-items:center;gap:10px"><img src="${getRestaurantImageUrl(restaurant)}" style="width:42px;height:42px;border-radius:10px" alt="${escapeHtml(restaurant.name)}" /><div><strong>${escapeHtml(restaurant.name)}</strong><div style="color:var(--muted);font-size:0.84rem">${escapeHtml(restaurant.phone)}</div></div></div></td>
                <td>${escapeHtml(restaurant.ownerName)}</td>
                <td>${escapeHtml(restaurant.location)}</td>
                <td><span class="badge-status ${restaurant.status === 'approved' ? 'active' : restaurant.status === 'suspended' ? 'suspended' : 'pending'}">${escapeHtml(restaurant.status)}</span></td>
                <td><div class="row-actions"><button class="secondary-btn" onclick="window.reviewRestaurant('${restaurant.id}')">Review</button><button class="secondary-btn" onclick="window.editRestaurantImage('${restaurant.id}')">Edit Image</button><button class="ghost-btn" onclick="window.updateRestaurant('${restaurant.id}','approved')">Approve</button><button class="ghost-btn" onclick="window.updateRestaurant('${restaurant.id}','suspended')">Suspend</button></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById('restaurantSearch').addEventListener('input', (event) => {
    state.filters.restaurants.q = event.target.value;
    renderRestaurants();
  });
  document.getElementById('restaurantStatus').addEventListener('change', (event) => {
    state.filters.restaurants.status = event.target.value;
    renderRestaurants();
  });
}

window.reviewRestaurant = (restaurantId) => {
  const restaurant = state.data.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return;

  openModal(`Review ${escapeHtml(restaurant.name || 'restaurant')}`, `
      <div class="form-grid" style="padding: 10px 0;">
        <label>Business Name<input value="${escapeHtml(restaurant.name || '')}" readonly /></label>
        <label>Owner Name<input value="${escapeHtml(restaurant.ownerName || '')}" readonly /></label>
        <label>Email<input value="${escapeHtml(restaurant.email || '')}" readonly /></label>
        <label>Phone<input value="${escapeHtml(restaurant.phone || '')}" readonly /></label>
        <label>Address<input value="${escapeHtml(restaurant.location || restaurant.address || '')}" readonly /></label>
        <label>Status<input value="${escapeHtml(restaurant.status || 'pending')}" readonly /></label>
        <label class="full">Restaurant image path<input id="restaurantImagePath" value="${escapeHtml(restaurant.logo || restaurant.image || restaurant.imagePath || '')}" /></label>
        <label class="full">Admin Notes<textarea id="restaurantReviewNotes">${escapeHtml(restaurant.reviewNotes || '')}</textarea></label>
        <div class="row-actions full">
          <button class="secondary-btn" id="approveRestaurantBtn">Approve</button>
          <button class="ghost-btn" id="rejectRestaurantBtn">Reject</button>
          <button class="ghost-btn" id="suspendRestaurantBtn">Suspend</button>
        </div>
      </div>
    `);

  document.getElementById('approveRestaurantBtn').addEventListener('click', async () => {
    const notes = document.getElementById('restaurantReviewNotes').value;
    await window.updateRestaurant(restaurantId, 'approved', notes);
    closeModal();
  });

  document.getElementById('rejectRestaurantBtn').addEventListener('click', async () => {
    const notes = document.getElementById('restaurantReviewNotes').value;
    await window.updateRestaurant(restaurantId, 'rejected', notes);
    closeModal();
  });

  document.getElementById('suspendRestaurantBtn').addEventListener('click', async () => {
    const notes = document.getElementById('restaurantReviewNotes').value;
    await window.updateRestaurant(restaurantId, 'suspended', notes);
    closeModal();
  });
};

function normalizeRestaurantImageFilename(filename) {
  if (!filename) return '';
  let normalized = String(filename).trim().replace(/\\/g, '/');
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (normalized.startsWith('images/')) return normalized;
  return `images/restaurants/${normalized}`;
}

function restaurantImageFileExists(filename) {
  const normalized = normalizeRestaurantImageFilename(filename);
  if (!normalized) return Promise.resolve(false);
  const url = `./${normalized}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

window.editRestaurantImage = (restaurantId) => {
  const restaurant = state.data.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return;

  const currentImage = restaurant.logo || restaurant.image || restaurant.imagePath || '';
  const currentPath = currentImage ? getRestaurantImageUrl(currentImage) : '';
  openModal(`Edit image for ${escapeHtml(restaurant.name || 'restaurant')}`, `
      <div class="form-grid" style="padding: 10px 0;">
        <label class="full">Restaurant image filename<input id="restaurantImagePath" value="${escapeHtml(currentImage)}" placeholder="example.png" /></label>
        <div class="card" style="padding: 12px; max-width: 360px; width: 100%;">
          <strong>Image preview</strong>
          <img id="restaurantImagePreview" src="${currentPath}" alt="Preview" style="width: 100%; max-width: 336px; height: 160px; object-fit: cover; border-radius: 12px; margin-top: 8px;" onerror="this.src='./images/placeholder.png'" />
          <div class="muted" style="margin-top: 8px; word-break: break-all;">Resolved path: <code id="restaurantImageResolvedPath">${escapeHtml(currentPath)}</code></div>
        </div>
        <div class="row-actions full">
          <button class="primary-btn" id="saveRestaurantImageBtn">Save Image</button>
          <button class="ghost-btn" id="cancelRestaurantImageBtn">Cancel</button>
        </div>
      </div>
    `);

  const imageInput = document.getElementById('restaurantImagePath');
  const preview = document.getElementById('restaurantImagePreview');
  const resolvedPath = document.getElementById('restaurantImageResolvedPath');

  imageInput.addEventListener('input', (event) => {
    const nextPath = String(event.target.value || '').trim();
    preview.src = getRestaurantImageUrl(nextPath);
    resolvedPath.textContent = nextPath ? getRestaurantImageUrl(nextPath) : '';
  });

  document.getElementById('saveRestaurantImageBtn').addEventListener('click', async () => {
    const imagePath = imageInput?.value?.trim() || '';
    if (!imagePath) {
      createToast('Please enter an image filename before saving.', 'warning');
      return;
    }

    const exists = await restaurantImageFileExists(imagePath);
    if (!exists) {
      createToast('Image not found in images/restaurants/. Please verify the filename.', 'error');
      return;
    }

    await window.updateRestaurant(restaurantId, restaurant.status || restaurant.restaurantStatus || 'pending', restaurant.reviewNotes || '', imagePath);
    closeModal();
  });

  document.getElementById('cancelRestaurantImageBtn').addEventListener('click', closeModal);
};

window.updateRestaurant = async (restaurantId, status, reviewNotes = '', imagePath = '') => {
  const restaurant = state.data.restaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return;
  const currentStatus = restaurant.status || restaurant.restaurantStatus || 'pending';
  const inputImagePath = imagePath || document.getElementById('restaurantImagePath')?.value?.trim() || '';
  if (currentStatus === status && !reviewNotes && inputImagePath === (restaurant.logo || restaurant.image || restaurant.imagePath || '')) {
    createToast(`No changes made to restaurant ${restaurant.name}.`, 'info');
    return;
  }
  try {
    const inputImagePath = imagePath || document.getElementById('restaurantImagePath')?.value?.trim() || '';
    const normalizedImage = inputImagePath || restaurant.logo || restaurant.image || restaurant.imagePath || '';
    const updates = {
      status,
      restaurantStatus: status,
      isActive: status === 'approved',
      reviewNotes,
      logo: normalizedImage,
      image: normalizedImage,
      imagePath: normalizedImage,
      restaurantImage: normalizedImage,
      coverImage: normalizedImage,
      reviewedAt: new Date(),
      updatedAt: new Date()
    };

    const firebase = initFirebase();
    const db = firebase?.db;
    const ownerUid = restaurant.ownerUid || restaurant.id;
    const userUpdates = {
      role: 'restaurant',
      restaurantId,
      restaurantStatus: status,
      isApproved: status === 'approved',
      restaurantName: restaurant.name || restaurant.businessName || '',
      ownerName: restaurant.ownerName || '',
      email: restaurant.email || '',
      phone: restaurant.phone || '',
      logo: normalizedImage,
      image: normalizedImage,
      imagePath: normalizedImage,
      restaurantImage: normalizedImage,
      coverImage: normalizedImage,
      updatedAt: new Date()
    };

    const writeOperations = [updateDocument('restaurants', restaurantId, updates)];

    if (db) {
      const userUpdatePromises = [];
      const ownerDocRef = db.collection('users').doc(ownerUid);
      const ownerDoc = await ownerDocRef.get();
      if (ownerDoc.exists || ownerUid) {
        userUpdatePromises.push(ownerDocRef.set(userUpdates, { merge: true }));
      }

      const restaurantUserQuery = await db.collection('users').where('restaurantId', '==', restaurantId).limit(5).get();
      restaurantUserQuery.forEach((doc) => {
        if (doc.id !== ownerUid) {
          userUpdatePromises.push(db.collection('users').doc(doc.id).set(userUpdates, { merge: true }));
        }
      });

      if (restaurant.email) {
        const emailQuery = await db.collection('users').where('email', '==', restaurant.email).limit(5).get();
        emailQuery.forEach((doc) => {
          if (doc.id !== ownerUid) {
            userUpdatePromises.push(db.collection('users').doc(doc.id).set(userUpdates, { merge: true }));
          }
        });
      }

      if (!userUpdatePromises.length) {
        userUpdatePromises.push(saveDocument('users', userUpdates, ownerUid));
      }

      writeOperations.push(...userUpdatePromises);
    } else {
      writeOperations.push(saveDocument('users', userUpdates, ownerUid));
    }

    await Promise.all(writeOperations);
    restaurant.status = status;
    restaurant.restaurantStatus = status;
    restaurant.isActive = status === 'approved';
    restaurant.reviewNotes = reviewNotes;
    restaurant.logo = imagePath || restaurant.logo || '';
    restaurant.image = imagePath || restaurant.image || '';
    restaurant.imagePath = imagePath;
    restaurant.reviewedAt = new Date().toISOString();
    restaurant.updatedAt = new Date().toISOString();
    persistData();
    createToast(`Restaurant ${status}.`, 'success');
    renderRestaurants();
  } catch (error) {
    console.error(error);
    createToast('Unable to update restaurant approval status.', 'error');
  }
};

function renderCustomers() {
  const filtered = state.data.customers.filter((item) => !item.isDeleted).filter((item) => {
    const query = state.filters.customers.q.toLowerCase();
    const matches = !query || `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query);
    const matchesStatus = state.filters.customers.status === 'all' || item.status === state.filters.customers.status;
    return matches && matchesStatus;
  });

  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Customer Management</h3>
          <p class="card-subtitle">Suspend accounts and review customer activity</p>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr; margin-bottom: 14px;">
        <label>Search<input id="customerSearch" value="${escapeHtml(state.filters.customers.q)}" /></label>
        <label>Status<select id="customerStatus">
          <option value="all">All</option>
          <option value="active" ${state.filters.customers.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="suspended" ${state.filters.customers.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select></label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${filtered.map((customer) => `
              <tr>
                <td>${escapeHtml(customer.name)}</td>
                <td>${escapeHtml(customer.email)}</td>
                <td>${escapeHtml(customer.phone)}</td>
                <td><span class="badge-status ${customer.status === 'active' ? 'active' : 'suspended'}">${escapeHtml(customer.status)}</span></td>
                <td><div class="row-actions"><button class="secondary-btn" onclick="window.updateCustomer('${customer.id}','${customer.status === 'active' ? 'suspended' : 'active'}')">${customer.status === 'active' ? 'Suspend' : 'Activate'}</button><button class="ghost-btn" onclick="window.resetPassword('${customer.id}')">Reset Password</button></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById('customerSearch').addEventListener('input', (event) => {
    state.filters.customers.q = event.target.value;
    renderCustomers();
  });
  document.getElementById('customerStatus').addEventListener('change', (event) => {
    state.filters.customers.status = event.target.value;
    renderCustomers();
  });
}

window.updateCustomer = async (customerId, status) => {
  const customer = state.data.customers.find((item) => item.id === customerId);
  if (!customer) return;
  try {
    await updateDocument('users', customerId, {
      status,
      updatedAt: new Date()
    });
    customer.status = status;
    persistData();
    createToast(`Customer ${status}.`, 'success');
    renderCustomers();
  } catch (error) {
    console.error(error);
    createToast('Unable to update customer status.', 'error');
  }
};

window.resetPassword = async (customerId) => {
  const customer = state.data.customers.find((item) => item.id === customerId);
  if (!customer) return;

  const { auth } = initFirebase();
  if (!auth || !customer.email) {
    createToast('Password reset is unavailable right now.', 'warning');
    return;
  }

  try {
    await auth.sendPasswordResetEmail(customer.email);
    createToast(`Password reset sent to ${customer.email}.`, 'success');
    state.data.logs.unshift({ id: Date.now().toString(), user: state.user.displayName, action: 'Reset password', details: customer.email, createdAt: new Date().toISOString() });
    persistData();
  } catch (error) {
    console.error(error);
    createToast(error?.message || 'Unable to send password reset email.', 'error');
  }
};

function renderDelivery() {
  const filtered = state.data.delivery.filter((item) => !item.isDeleted).filter((item) => {
    const query = state.filters.delivery.q.toLowerCase();
    const matches = !query || `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query);
    const matchesStatus = state.filters.delivery.status === 'all' || item.status === state.filters.delivery.status;
    return matches && matchesStatus;
  });

  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Delivery Person Management</h3>
          <p class="card-subtitle">Approvals, ratings, and performance</p>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr; margin-bottom: 14px;">
        <label>Search<input id="deliverySearch" value="${escapeHtml(state.filters.delivery.q)}" /></label>
        <label>Status<select id="deliveryStatus">
          <option value="all">All</option>
          <option value="approved" ${state.filters.delivery.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="pending" ${state.filters.delivery.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="suspended" ${state.filters.delivery.status === 'suspended' ? 'selected' : ''}>Suspended</option>
        </select></label>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Rating</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${filtered.map((person) => `
              <tr>
                <td>${escapeHtml(person.name)}</td>
                <td>${escapeHtml(person.email)}</td>
                <td>${Number(person.rating || 0).toFixed(1)} ★</td>
                <td><span class="badge-status ${person.status === 'approved' ? 'active' : person.status === 'suspended' ? 'suspended' : 'pending'}">${escapeHtml(person.status)}</span></td>
                <td><div class="row-actions"><button class="secondary-btn" onclick="window.updateDelivery('${person.id}','approved')">Approve</button><button class="ghost-btn" onclick="window.updateDelivery('${person.id}','suspended')">Suspend</button></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById('deliverySearch').addEventListener('input', (event) => {
    state.filters.delivery.q = event.target.value;
    renderDelivery();
  });
  document.getElementById('deliveryStatus').addEventListener('change', (event) => {
    state.filters.delivery.status = event.target.value;
    renderDelivery();
  });
}

window.updateDelivery = async (deliveryId, status) => {
  const person = state.data.delivery.find((item) => item.id === deliveryId);
  if (!person) return;
  try {
    await updateDocument('users', deliveryId, {
      status,
      isActive: status === 'approved',
      updatedAt: new Date()
    });
    person.status = status;
    person.isActive = status === 'approved';
    persistData();
    createToast(`Delivery person ${status}.`, 'success');
    renderDelivery();
  } catch (error) {
    console.error(error);
    createToast('Unable to update delivery status.', 'error');
  }
};

function renderOrders() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Order Center</h3>
          <p class="card-subtitle">Monitor live orders and fulfillment</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Restaurant</th><th>Status</th><th>Payment</th><th>Refund</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>
            ${state.data.orders.map((order) => `
              <tr>
                <td>${escapeHtml(order.orderNumber || order.id)}</td>
                <td>${escapeHtml(order.customerName || 'Customer')}</td>
                <td>${escapeHtml(order.restaurantName || 'Restaurant')}</td>
                <td><span class="badge-status ${order.status === 'completed' || order.status === 'delivered' ? 'active' : 'pending'}">${escapeHtml(order.status || 'pending')}</span></td>
                <td>${escapeHtml(order.deliveryLocationLabel || 'Standard')}<div class="body-small">${escapeHtml(order.deliveryLandmark || order.deliveryDetails || 'No notes')}</div></td>
                <td>${escapeHtml(order.paymentMethod || 'pending')}<div class="body-small">${escapeHtml(order.paymentDetails || '')}</div></td>
                <td>${escapeHtml(order.refundStatus || 'none')}<div class="body-small">${escapeHtml(order.refundReason || '')}</div></td>
                <td>${formatCurrency(order.total)}</td>
                <td>${formatDate(order.createdAt)}<div class="body-small">ETA: ${order.estimatedDeliveryTime ? formatDate(order.estimatedDeliveryTime) : 'Pending'}</div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAnalytics() {
  const analytics = buildAnalyticsSnapshot();
  const restaurants = state.data.restaurants.filter((item) => !item.isDeleted);
  const restaurantOptions = restaurants.map((restaurant) => `<option value="${escapeHtml(restaurant.id)}" ${state.filters.analytics.restaurantId === restaurant.id ? 'selected' : ''}>${escapeHtml(restaurant.name || restaurant.businessName || restaurant.id)}</option>`).join('');

  content.innerHTML = `
    <section class="card analytics-shell">
      <div class="card-header">
        <div>
          <h3 class="card-title">Analytics</h3>
          <p class="card-subtitle">Live purchase, refund, and cash-flow intelligence across the platform.</p>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr; margin-bottom: 14px;">
        <label>Restaurant<select id="analyticsRestaurantFilter"><option value="all">All restaurants</option>${restaurantOptions}</select></label>
        <label>Range<select id="analyticsRangeFilter"><option value="day" ${state.filters.analytics.range === 'day' ? 'selected' : ''}>Last 24h</option><option value="month" ${state.filters.analytics.range === 'month' ? 'selected' : ''}>This month</option></select></label>
        <div class="metric-badge" style="display:flex;align-items:center;justify-content:center;min-height:42px;">Live updates</div>
      </div>
      <div class="grid-3">
        <div class="card" style="padding: 14px">
          <h4>Purchases</h4>
          <p style="font-size: 1.45rem; margin: 6px 0">${analytics.purchaseCount}</p>
          <div class="body-small">Completed orders in the selected window</div>
        </div>
        <div class="card" style="padding: 14px">
          <h4>Refunds</h4>
          <p style="font-size: 1.45rem; margin: 6px 0">${analytics.refunded.length}</p>
          <div class="body-small">${formatCurrency(analytics.refunds)} refunded</div>
        </div>
        <div class="card" style="padding: 14px">
          <h4>Net Cash Flow</h4>
          <p style="font-size: 1.45rem; margin: 6px 0">${formatCurrency(analytics.netCashflow)}</p>
          <div class="body-small">${analytics.refundRate.toFixed(1)}% refund rate</div>
        </div>
      </div>
      <div class="dashboard-grid" style="margin-top: 14px;">
        <section class="panel-card">
          <div class="panel-card-header">
            <h4>Cash-flow trend</h4>
            <span class="metric-badge">${state.filters.analytics.range === 'day' ? 'Hourly' : 'Daily'}</span>
          </div>
          <div class="stack">
            ${analytics.series.map((point) => `
              <div class="list-row">
                <span>${escapeHtml(point.label)}</span>
                <span><strong>${formatCurrency(point.value)}</strong></span>
              </div>
            `).join('')}
          </div>
        </section>
        <section class="panel-card">
          <div class="panel-card-header">
            <h4>Top restaurants</h4>
            <span class="metric-badge">Revenue</span>
          </div>
          <div class="stack">
            ${restaurants.length ? restaurants.slice(0, 5).map((restaurant) => {
    const restaurantRevenue = state.data.orders.filter((order) => (order.restaurantId || order.restaurantName || '') === restaurant.id || (order.restaurantName || '') === restaurant.name).reduce((sum, order) => sum + Number(order.total || 0), 0);
    return `<div class="list-row"><span>${escapeHtml(restaurant.name || restaurant.businessName || restaurant.id)}</span><span>${formatCurrency(restaurantRevenue)}</span></div>`;
  }).join('') : '<div class="empty-state">No restaurant data yet.</div>'}
          </div>
        </section>
      </div>
    </section>
  `;

  document.getElementById('analyticsRestaurantFilter')?.addEventListener('change', (event) => {
    state.filters.analytics.restaurantId = event.target.value;
    renderAnalytics();
  });
  document.getElementById('analyticsRangeFilter')?.addEventListener('change', (event) => {
    state.filters.analytics.range = event.target.value;
    renderAnalytics();
  });
}

function renderReports() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Reports</h3>
          <p class="card-subtitle">Resolve complaints and assign priorities</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Restaurant</th><th>Reason</th><th>Status</th><th>Priority</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.data.reports.map((report) => `
              <tr>
                <td>${escapeHtml(report.orderId)}</td>
                <td>${escapeHtml(report.customerName)}</td>
                <td>${escapeHtml(report.restaurantName)}</td>
                <td>${escapeHtml(report.reason)}</td>
                <td><span class="badge-status ${report.status === 'resolved' ? 'active' : 'pending'}">${escapeHtml(report.status)}</span></td>
                <td>${escapeHtml(report.priority)}</td>
                <td><div class="row-actions"><button class="secondary-btn" onclick="window.resolveReport('${report.id}')">Resolve</button><button class="ghost-btn" onclick="window.dismissReport('${report.id}')">Dismiss</button></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

window.resolveReport = (reportId) => {
  const report = state.data.reports.find((item) => item.id === reportId);
  if (!report) return;
  report.status = 'resolved';
  persistData();
  createToast('Report resolved.', 'success');
  renderReports();
};

window.dismissReport = (reportId) => {
  const report = state.data.reports.find((item) => item.id === reportId);
  if (!report) return;
  report.status = 'dismissed';
  persistData();
  createToast('Report dismissed.', 'warning');
  renderReports();
};

function renderCoupons() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Coupons</h3>
          <p class="card-subtitle">Promotions and platform offers</p>
        </div>
        <button class="primary-btn" id="createCoupon">Create Coupon</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Applicable</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.data.coupons.map((coupon) => `
              <tr>
                <td>${escapeHtml(coupon.code)}</td>
                <td>${escapeHtml(coupon.type)}</td>
                <td>${coupon.type === 'percentage' ? `${coupon.value}%` : formatCurrency(coupon.value)}</td>
                <td>${escapeHtml(coupon.applicableTo)}</td>
                <td><span class="badge-status ${coupon.status === 'active' ? 'active' : 'pending'}">${escapeHtml(coupon.status)}</span></td>
                <td><div class="row-actions"><button class="secondary-btn" onclick="window.toggleCoupon('${coupon.id}')">Toggle</button><button class="ghost-btn" onclick="window.deleteCoupon('${coupon.id}')">Delete</button></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.getElementById('createCoupon').addEventListener('click', () => {
    const code = window.prompt('Coupon code');
    if (!code) return;
    const type = window.prompt('Type (percentage/fixed)', 'percentage') || 'percentage';
    const value = Number(window.prompt('Value', '10') || 0);
    const coupon = { id: `cp-${Date.now()}`, code, type, value, applicableTo: 'platform', minOrderValue: 300, expiryDate: '2026-12-31', usageLimit: 100, status: 'active' };
    state.data.coupons.unshift(coupon);
    persistData();
    createToast('Coupon created.', 'success');
    renderCoupons();
  });
}

window.toggleCoupon = (couponId) => {
  const coupon = state.data.coupons.find((item) => item.id === couponId);
  if (!coupon) return;
  coupon.status = coupon.status === 'active' ? 'inactive' : 'active';
  persistData();
  createToast('Coupon updated.', 'success');
  renderCoupons();
};

window.deleteCoupon = (couponId) => {
  state.data.coupons = state.data.coupons.filter((item) => item.id !== couponId);
  persistData();
  createToast('Coupon deleted.', 'warning');
  renderCoupons();
};

function renderAnnouncements() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Announcements</h3>
          <p class="card-subtitle">Broadcast updates to selected audiences</p>
        </div>
        <button class="primary-btn" id="createAnnouncement">Create Announcement</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Audience</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.data.announcements.map((announcement) => `
              <tr>
                <td>${escapeHtml(announcement.title)}</td>
                <td>${escapeHtml(announcement.target)}</td>
                <td>${escapeHtml(announcement.status)}</td>
                <td><button class="ghost-btn" onclick="window.deleteAnnouncement('${announcement.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.getElementById('createAnnouncement').addEventListener('click', () => {
    const title = window.prompt('Announcement title');
    const message = window.prompt('Message');
    const target = window.prompt('Target (all/customers/restaurants/delivery)', 'all') || 'all';
    if (!title || !message) return;
    const announcement = { id: `a-${Date.now()}`, title, message, target, status: 'published', scheduledAt: '' };
    state.data.announcements.unshift(announcement);
    state.data.notifications.unshift({ id: `n-${Date.now()}`, title, message, type: 'announcement', createdAt: new Date().toISOString(), read: false });
    persistData();
    createToast('Announcement published.', 'success');
    renderAnnouncements();
  });
}

window.deleteAnnouncement = (announcementId) => {
  state.data.announcements = state.data.announcements.filter((item) => item.id !== announcementId);
  persistData();
  createToast('Announcement removed.', 'warning');
  renderAnnouncements();
};

function renderNotifications() {
  const visible = state.data.notifications.filter((item) => !item.isDeleted);
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Notifications</h3>
          <p class="card-subtitle">Unread and recent platform events</p>
        </div>
        <div class="row-actions">
          <button class="ghost-btn" onclick="window.clearAllNotifications()">Clear all</button>
        </div>
      </div>
      <div class="form-grid">
        ${visible.length ? visible.map((notification) => `
          <div class="card" style="padding: 12px;">
            <div class="card-header" style="margin-bottom: 8px">
              <strong>${escapeHtml(notification.title)}</strong>
              <span class="badge-status ${notification.read ? 'active' : 'pending'}">${notification.read ? 'Read' : 'Unread'}</span>
            </div>
            <p style="margin: 0 0 8px; color: var(--muted)">${escapeHtml(notification.message)}</p>
            <div class="row-actions">
              <button class="secondary-btn" onclick="window.markNotificationRead('${notification.id}')">Mark Read</button>
              <button class="ghost-btn" onclick="window.deleteNotification('${notification.id}')">Delete</button>
            </div>
          </div>
        `).join('') : '<div class="empty-state">No notifications yet.</div>'}
      </div>
    </section>
  `;
}

window.markNotificationRead = (notificationId) => {
  const notification = state.data.notifications.find((item) => item.id === notificationId);
  if (!notification) return;
  notification.read = true;
  persistData();
  createToast('Notification marked as read.', 'success');
  renderNotifications();
  updateNotificationBadge();
};

window.deleteNotification = (notificationId) => {
  const notification = state.data.notifications.find((item) => item.id === notificationId);
  if (!notification) return;
  notification.read = true;
  notification.isDeleted = true;
  persistData();
  createToast('Notification removed.', 'warning');
  renderNotifications();
  updateNotificationBadge();
};

window.clearAllNotifications = () => {
  state.data.notifications = state.data.notifications.map((item) => (item.isDeleted ? item : { ...item, read: true, isDeleted: true }));
  persistData();
  createToast('All notifications cleared.', 'success');
  renderNotifications();
  updateNotificationBadge();
};

async function resetAppToFactoryState() {
  if (!confirmDialog('This will permanently wipe orders, notifications, reports, support requests, help content, announcements, coupons, and other Firestore-backed app data, then restart the app as a fresh state. Continue?')) {
    return;
  }

  try {
    const { db } = initFirebase();
    if (!db) {
      createToast('Firebase is unavailable right now. The reset could not be completed.', 'error');
      return;
    }

    createToast('Resetting app data and restarting…', 'info');

    const collectionsToReset = ['orders', 'notifications', 'reports', 'supportRequests', 'helpArticles', 'announcements', 'coupons', 'masterAddons', 'masterProducts', 'restaurants', 'adminSessions'];
    const preserveUserIds = [state.user?.uid].filter(Boolean);

    for (const collectionName of collectionsToReset) {
      const snapshot = await db.collection(collectionName).get();
      await Promise.all(snapshot.docs.map((doc) => db.collection(collectionName).doc(doc.id).delete().catch(() => null)));
    }

    const usersSnapshot = await db.collection('users').get();
    await Promise.all(usersSnapshot.docs
      .filter((doc) => !preserveUserIds.includes(doc.id))
      .map((doc) => db.collection('users').doc(doc.id).delete().catch(() => null)));

    const localStorageKeys = [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key, index, array) => array.indexOf(key) === index);
    localStorageKeys.filter((key) => key.startsWith('manna-') || key.startsWith('firebase:') || key === 'cart').forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    state.data = {
      products: [],
      addons: [],
      restaurants: [],
      customers: [],
      delivery: [],
      orders: [],
      reports: [],
      coupons: [],
      announcements: [],
      notifications: [],
      supportRequests: [],
      settings: {},
      logs: []
    };
    state.filters = {
      products: { q: '', category: 'all', status: 'all', sort: 'date' },
      addons: { q: '', category: 'all', status: 'all', sort: 'date' },
      restaurants: { q: '', status: 'all' },
      customers: { q: '', status: 'all' },
      delivery: { q: '', status: 'all' },
      analytics: { range: 'month', restaurantId: 'all' }
    };
    state.ui.selectedProducts = new Set();
    state.ui.selectedAddons = new Set();

    clearStoredAuthState();
    window.setTimeout(() => {
      window.location.reload();
    }, 600);
  } catch (error) {
    console.error('[MANNA] App reset failed:', error);
    createToast(error.message || 'The app reset could not be completed.', 'error');
  }
}

window.resetAppToFactoryState = resetAppToFactoryState;

function renderSettings() {
  const settings = state.data.settings || {};
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Platform Settings</h3>
          <p class="card-subtitle">Core platform configuration</p>
        </div>
      </div>
      <div class="form-grid">
        <label>Platform Name<input id="platformName" value="${escapeHtml(settings.platformName || 'MANNA')}" /></label>
        <label>Commission (%)<input id="commission" type="number" value="${escapeHtml(settings.commission || 8)}" /></label>
        <label>Currency<input id="currency" value="${escapeHtml(settings.currency || 'LRD')}" /></label>
        <label>Default Delivery Fee<input id="deliveryFee" type="number" value="${escapeHtml(settings.deliveryFee || 60)}" /></label>
        <label>Tax (%)<input id="tax" type="number" value="${escapeHtml(settings.tax || 2)}" /></label>
        <label>Support Email<input id="supportEmail" value="${escapeHtml(settings.supportEmail || '')}" /></label>
        <label>Support Phone<input id="supportPhone" value="${escapeHtml(settings.supportPhone || '')}" /></label>
        <label>Platform Fee Type<select id="platformFeeType"><option value="percentage" ${settings.platformFeeType === 'percentage' ? 'selected' : ''}>Percentage</option><option value="fixed" ${settings.platformFeeType === 'fixed' ? 'selected' : ''}>Fixed</option></select></label>
        <label>Platform Fee Value<input id="platformFeeValue" type="number" value="${escapeHtml(settings.platformFeeValue || 8)}" /></label>
        <label>Maintenance Mode<select id="maintenanceMode"><option value="false" ${settings.maintenanceMode ? '' : 'selected'}>Off</option><option value="true" ${settings.maintenanceMode ? 'selected' : ''}>On</option></select></label>
        <div class="modal-actions full">
          <button class="primary-btn" id="saveSettings">Save Settings</button>
          <button class="ghost-btn" type="button" onclick="window.resetAppToFactoryState()">Reset app to fresh state</button>
        </div>
      </div>
    </section>
  `;
  content.insertAdjacentHTML('beforeend', getQRCardHTML('adminQrContainer', 'adminQrCard'));
  initQRCode('adminQrContainer');
  bindQRDownloadHandlers();
  document.getElementById('saveSettings').addEventListener('click', async () => {
    state.data.settings = {
      ...settings,
      platformName: document.getElementById('platformName').value,
      commission: Number(document.getElementById('commission').value || 0),
      currency: document.getElementById('currency').value,
      deliveryFee: Number(document.getElementById('deliveryFee').value || 0),
      tax: Number(document.getElementById('tax').value || 0),
      supportEmail: document.getElementById('supportEmail').value,
      supportPhone: document.getElementById('supportPhone').value,
      platformFeeType: document.getElementById('platformFeeType').value,
      platformFeeValue: Number(document.getElementById('platformFeeValue').value || 0),
      maintenanceMode: document.getElementById('maintenanceMode').value === 'true'
    };
    persistData();
    try {
      const firebase = initFirebase();
      if (firebase?.db) {
        await Promise.all([
          firebase.db.collection('adminSettings').doc('config').set(state.data.settings, { merge: true }),
          firebase.db.collection('settings').doc('platform').set(state.data.settings, { merge: true })
        ]);
      }
    } catch (error) {
      console.error(error);
    }
    createToast('Settings saved.', 'success');
    state.data.logs.unshift({ id: Date.now().toString(), user: state.user.displayName, action: 'Update settings', details: 'Platform settings changed', createdAt: new Date().toISOString() });
    renderSettings();
  });
}

function renderFinancials() {
  const payouts = (state.data.financialPayouts || []).slice().sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  const fees = (state.data.platformFeePayments || []).slice().sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Financial Settlements</h3>
          <p class="card-subtitle">Review delivery payouts and platform fee payments submitted by restaurants.</p>
        </div>
      </div>
      <div class="stack">
        <div class="panel-card">
          <div class="panel-card-header">
            <h4>Delivery payouts</h4>
            <span class="badge">${payouts.filter((entry) => String(entry.status || 'pending').toLowerCase() === 'pending').length} pending</span>
          </div>
          <div class="list-stack">${payouts.length ? payouts.map((payout) => `
            <div class="list-item">
              <div class="panel-card-header">
                <strong>${escapeHtml(payout.deliveryPersonName || payout.deliveryPersonUid || 'Delivery partner')}</strong>
                <span class="badge">${escapeHtml(String(payout.status || 'pending').replace(/_/g, ' '))}</span>
              </div>
              <div class="muted">${escapeHtml(formatCurrency(payout.totalDeliveryFees || 0))} • ${escapeHtml(payout.restaurantName || payout.restaurantId || 'Restaurant')}</div>
              <div class="muted">Reference: ${escapeHtml(payout.paymentReference || 'Waiting for restaurant upload')}</div>
              ${payout.status === 'pending' ? `<div class="row-actions"><button class="primary-btn" data-settlement-action="confirm-payout" data-id="${escapeHtml(payout.id || '')}">Confirm payout</button><button class="ghost-btn" data-settlement-action="reject-payout" data-id="${escapeHtml(payout.id || '')}">Reject</button></div>` : ''}
            </div>`).join('') : '<div class="empty-state">No payouts yet.</div>'}</div>
        </div>
        <div class="panel-card">
          <div class="panel-card-header">
            <h4>Platform fees</h4>
            <span class="badge">${fees.filter((entry) => String(entry.status || 'pending').toLowerCase() === 'pending').length} pending</span>
          </div>
          <div class="list-stack">${fees.length ? fees.map((fee) => `
            <div class="list-item">
              <div class="panel-card-header">
                <strong>${escapeHtml(formatCurrency(fee.feeAmount || 0))}</strong>
                <span class="badge">${escapeHtml(String(fee.status || 'pending').replace(/_/g, ' '))}</span>
              </div>
              <div class="muted">${escapeHtml(fee.restaurantName || fee.restaurantId || 'Restaurant')} • ${escapeHtml(formatDate(fee.periodStart))} → ${escapeHtml(formatDate(fee.periodEnd))}</div>
              <div class="muted">Reference: ${escapeHtml(fee.paymentReference || 'Waiting for restaurant upload')}</div>
              ${fee.status === 'pending' ? `<div class="row-actions"><button class="primary-btn" data-settlement-action="confirm-fee" data-id="${escapeHtml(fee.id || '')}">Confirm fee</button><button class="ghost-btn" data-settlement-action="reject-fee" data-id="${escapeHtml(fee.id || '')}">Reject</button></div>` : ''}
            </div>`).join('') : '<div class="empty-state">No platform fee payments yet.</div>'}</div>
        </div>
      </div>
    </section>
  `;
  content.querySelectorAll('[data-settlement-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-settlement-action');
      const id = button.getAttribute('data-id');
      if (!id) return;
      if (action === 'confirm-payout') {
        await confirmPayout(id);
      } else if (action === 'reject-payout') {
        await rejectSettlement(id, 'deliveryPayouts');
      } else if (action === 'confirm-fee') {
        await confirmFee(id);
      } else if (action === 'reject-fee') {
        await rejectSettlement(id, 'platformFeePayments');
      }
    });
  });
}

async function confirmPayout(id) {
  const payout = (state.data.financialPayouts || []).find((entry) => entry.id === id);
  if (!payout) return;
  const paymentReference = window.prompt('Enter the payment reference', payout.paymentReference || '');
  const payerPhone = window.prompt('Enter the payout phone number', payout.payerPhone || '');
  const amountPaid = window.prompt('Enter the amount paid', String(payout.amountPaid || payout.totalDeliveryFees || 0));
  if (!paymentReference || !payerPhone || !amountPaid) {
    createToast('Please complete the payment details.', 'warning');
    return;
  }
  try {
    await updateDocument('deliveryPayouts', id, {
      status: 'confirmed',
      paymentReference: paymentReference.trim(),
      payerPhone: payerPhone.trim(),
      amountPaid: Number(amountPaid || 0),
      updatedAt: new Date()
    });
    await addDocument('notifications', {
      recipientUid: payout.deliveryPersonUid,
      title: 'Payout confirmed',
      message: `Your payout of ${formatCurrency(Number(amountPaid || 0))} was confirmed by the admin team.`,
      type: 'payout',
      read: false,
      isDeleted: false,
      createdAt: new Date()
    });
    createToast('Payout confirmed.', 'success');
    renderFinancials();
  } catch (error) {
    createToast(error.message || 'Unable to confirm the payout.', 'error');
  }
}

async function confirmFee(id) {
  const fee = (state.data.platformFeePayments || []).find((entry) => entry.id === id);
  if (!fee) return;
  const paymentReference = window.prompt('Enter the payment reference', fee.paymentReference || '');
  const payerPhone = window.prompt('Enter the payer phone number', fee.payerPhone || '');
  const amountPaid = window.prompt('Enter the amount paid', String(fee.amountPaid || fee.feeAmount || 0));
  if (!paymentReference || !payerPhone || !amountPaid) {
    createToast('Please complete the fee payment details.', 'warning');
    return;
  }
  try {
    await updateDocument('platformFeePayments', id, {
      status: 'confirmed',
      paymentReference: paymentReference.trim(),
      payerPhone: payerPhone.trim(),
      amountPaid: Number(amountPaid || 0),
      updatedAt: new Date()
    });
    await addDocument('notifications', {
      recipientUid: fee.restaurantId ? fee.restaurantId : null,
      title: 'Platform fee confirmed',
      message: `Your platform fee payment of ${formatCurrency(Number(amountPaid || 0))} was confirmed by the admin team.`,
      type: 'fee',
      read: false,
      isDeleted: false,
      createdAt: new Date()
    });
    createToast('Fee payment confirmed.', 'success');
    renderFinancials();
  } catch (error) {
    createToast(error.message || 'Unable to confirm the fee payment.', 'error');
  }
}

async function rejectSettlement(id, collectionName) {
  try {
    await updateDocument(collectionName, id, { status: 'rejected', updatedAt: new Date() });
    createToast('Settlement request marked as rejected.', 'warning');
    renderFinancials();
  } catch (error) {
    createToast(error.message || 'Unable to update the settlement request.', 'error');
  }
}

function renderHelpCenter() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Help Center</h3>
          <p class="card-subtitle">Manage help articles and review incoming help suggestions from customers, restaurants, and delivery partners.</p>
        </div>
      </div>
      <div class="stack">
        <div class="panel-card">
          <div class="panel-card-header">
            <h4>Incoming suggestions</h4>
            <span class="badge">${(state.data.supportRequests || []).filter((request) => !['reviewed', 'resolved'].includes(String(request.status || '').toLowerCase())).length} pending</span>
          </div>
          <div id="helpSuggestionsList" class="list-stack"></div>
        </div>
        <div class="panel-card">
          <div class="panel-card-header">
            <h4>Help articles</h4>
            <button class="primary-btn" id="openHelpArticleModal">Create article</button>
          </div>
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
          </div>
          <div id="helpArticlesList" class="card-grid"></div>
        </div>
      </div>
    </section>
  `;
  document.getElementById('openHelpArticleModal')?.addEventListener('click', openHelpArticleModal);
  renderHelpSuggestions();
  renderHelpArticleCards();
}

function renderHelpSuggestions() {
  const container = document.getElementById('helpSuggestionsList');
  if (!container) return;
  const suggestions = (state.data.supportRequests || [])
    .slice()
    .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
    .slice(0, 6);
  container.innerHTML = suggestions.length ? suggestions.map((request) => {
    const status = String(request.status || 'new').toLowerCase();
    const preview = String(request.message || '').trim();
    const previewText = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
    const sourceText = [request.panel || 'panel', request.email || 'No email'].filter(Boolean).join(' • ');
    return `
      <div class="list-item help-suggestion-feed-item">
        <div class="panel-card-header">
          <strong>${escapeHtml(request.subject || request.category || 'Help suggestion')}</strong>
          <span class="badge">${escapeHtml(status)}</span>
        </div>
        <div class="body-small">${escapeHtml(sourceText)}</div>
        <div class="muted">${escapeHtml(previewText || 'No details provided yet.')}</div>
        <div class="body-small">${escapeHtml(formatDate(request.createdAt) || 'Recently received')}</div>
        <div class="row-actions">
          <button class="primary-btn" data-help-request-action="reviewed" data-help-request-id="${escapeHtml(request.id || '')}" type="button">Mark reviewed</button>
          <button class="ghost-btn" data-help-request-action="resolved" data-help-request-id="${escapeHtml(request.id || '')}" type="button">Resolve</button>
        </div>
      </div>`;
  }).join('') : '<div class="empty-state">No recent suggestions yet.</div>';
  container.querySelectorAll('[data-help-request-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-help-request-id');
      const action = button.getAttribute('data-help-request-action');
      if (!id) return;
      try {
        await updateDocument('supportRequests', id, { status: action, updatedAt: new Date().toISOString() });
        createToast('Suggestion updated.', 'success');
        renderHelpSuggestions();
      } catch (error) {
        createToast(error.message || 'Unable to update the suggestion.', 'error');
      }
    });
  });
}

function getHelpArticleImage(article) {
  const imageName = String(article?.image || '').trim();
  if (!imageName) return 'images/placeholders/wrap.jpg';
  const normalizedName = imageName.replace(/^.*[\\/]/, '');
  return `images/help-images/${normalizedName}`;
}

function normalizeHelpArticleTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderHelpArticleCards() {
  const container = document.getElementById('helpArticlesList');
  if (!container) return;
  const categoryFilter = String(document.getElementById('helpArticleCategoryFilter')?.value || '').trim().toLowerCase();
  const tagFilter = String(document.getElementById('helpArticleTagFilter')?.value || '').trim().toLowerCase();
  const articles = (state.data.helpArticles || [])
    .slice()
    .filter((article) => {
      const matchesCategory = !categoryFilter || String(article.category || '').trim().toLowerCase() === categoryFilter;
      const tags = normalizeHelpArticleTags(article.tags || []);
      const tagText = tags.join(' ').toLowerCase();
      const matchesTag = !tagFilter || tagText.includes(tagFilter);
      return matchesCategory && matchesTag;
    })
    .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  const featuredArticles = articles.filter((article) => Boolean(article.featured));
  const regularArticles = articles.filter((article) => !article.featured);
  const renderArticleCard = (article) => {
    const tags = normalizeHelpArticleTags(article.tags || []);
    return `
    <article class="help-card">
      <div class="help-card__body">
        <h4>${escapeHtml(article.title || 'Help article')}</h4>
        <p>${escapeHtml(article.description || '')}</p>
        <div class="body-small">Target roles: ${escapeHtml((article.targetRoles || []).join(', ') || 'All')}</div>
        <div class="row-actions" style="margin-top: 10px; flex-wrap: wrap; gap: 8px;">
          ${article.featured ? '<span class="badge featured-badge">📌 Featured</span>' : ''}
          ${article.category ? `<span class="badge">${escapeHtml(article.category)}</span>` : ''}
          ${tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="row-actions" style="margin-top: 10px;">
          ${article.videoUrl ? `<a class="primary-btn" href="${escapeHtml(article.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch video</a>` : '<span class="badge">Video coming soon</span>'}
          <button class="ghost-btn" data-edit-help-article="${escapeHtml(article.id || '')}" type="button">Edit</button>
          <button class="ghost-btn" data-delete-help-article="${escapeHtml(article.id || '')}" type="button">Delete</button>
        </div>
      </div>
    </article>`;
  };
  container.innerHTML = articles.length ? `
    <div class="stack">
      ${featuredArticles.length ? `<div class="help-featured-section"><div class="panel-card-header"><h4>Featured guides</h4></div>${featuredArticles.map(renderArticleCard).join('')}</div>` : ''}
      ${regularArticles.length ? `<div class="help-featured-section"><div class="panel-card-header"><h4>More guides</h4></div>${regularArticles.map(renderArticleCard).join('')}</div>` : ''}
    </div>` : renderEmptyState('No help articles yet', 'Create guides for the customer, restaurant, or delivery experience.');
  document.getElementById('helpArticleCategoryFilter')?.addEventListener('change', renderHelpArticleCards);
  document.getElementById('helpArticleTagFilter')?.addEventListener('input', renderHelpArticleCards);
  container.querySelectorAll('[data-edit-help-article]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-edit-help-article');
      const article = (state.data.helpArticles || []).find((entry) => entry.id === id);
      if (article) {
        openHelpArticleModal(article);
      }
    });
  });
  container.querySelectorAll('[data-delete-help-article]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-delete-help-article');
      if (!id) return;
      try {
        await deleteDocument('helpArticles', id);
        createToast('Help article removed.', 'success');
      } catch (error) {
        createToast(error.message || 'Unable to delete the article.', 'error');
      }
    });
  });
}

function openHelpArticleModal(article = null) {
  const isEditing = Boolean(article?.id);
  const roleOptions = ['customer', 'restaurant', 'delivery', 'admin'];
  let selectedRoles = Array.isArray(article?.targetRoles)
    ? article.targetRoles.filter((role) => roleOptions.includes(String(role)))
    : [];

  openModal(isEditing ? 'Edit Help Article' : 'Create Help Article', `
    <form id="helpArticleForm" class="form-grid" style="padding: 8px 0;">
      <label>Title<input name="title" value="${escapeHtml(article?.title || '')}" required /></label>
      <label>Image<input id="helpArticleImageInput" name="image" value="${escapeHtml(article?.image || '')}" placeholder="help-image.jpg" /></label>
      <div class="stack" style="grid-column: 1 / -1;">
        <img id="helpArticleImagePreview" src="${escapeHtml(getHelpArticleImage(article))}" alt="Preview" style="display: ${article?.image ? 'block' : 'none'}; max-width: 200px; border-radius: 8px;" onerror="this.onerror=null; this.src='images/placeholders/wrap.jpg'; this.style.display='block';" />
      </div>
      <label>Category<select name="category">
        <option value="" ${!article?.category ? 'selected' : ''}>Choose category</option>
        <option value="Getting started" ${article?.category === 'Getting started' ? 'selected' : ''}>Getting started</option>
        <option value="Orders" ${article?.category === 'Orders' ? 'selected' : ''}>Orders</option>
        <option value="Payments" ${article?.category === 'Payments' ? 'selected' : ''}>Payments</option>
        <option value="Account" ${article?.category === 'Account' ? 'selected' : ''}>Account</option>
        <option value="Delivery" ${article?.category === 'Delivery' ? 'selected' : ''}>Delivery</option>
        <option value="Technical" ${article?.category === 'Technical' ? 'selected' : ''}>Technical</option>
      </select></label>
      <label>Tags<input name="tags" value="${escapeHtml((Array.isArray(article?.tags) ? article.tags : normalizeHelpArticleTags(article?.tags || '')).join(', '))}" placeholder="payments, onboarding, orders" /></label>
      <label><input type="checkbox" name="featured" ${article?.featured ? 'checked' : ''} /> Featured article</label>
      <label>Video URL<input name="videoUrl" value="${escapeHtml(article?.videoUrl || '')}" placeholder="https://..." /></label>
      <div class="row-actions" style="grid-column: 1 / -1; gap: 12px; flex-wrap: wrap;">
        ${roleOptions.map((role) => `<label><input class="help-role-checkbox" type="checkbox" value="${role}" ${selectedRoles.includes(role) ? 'checked' : ''} /> ${role.charAt(0).toUpperCase() + role.slice(1)}</label>`).join('')}
      </div>
      <label class="full">Description<textarea name="description" required>${escapeHtml(article?.description || '')}</textarea></label>
      <div class="row-actions">
        <button class="primary-btn" id="submitHelpArticle" type="button">${isEditing ? 'Save changes' : 'Save article'}</button>
        <button class="ghost-btn" id="cancelHelpArticle" type="button">Cancel</button>
      </div>
    </form>
  `);

  const imageInput = document.getElementById('helpArticleImageInput');
  const imagePreview = document.getElementById('helpArticleImagePreview');
  const syncImagePreview = () => {
    const imageValue = String(imageInput?.value || '').trim();
    const filename = imageValue.replace(/^.*[\\/]/, '');
    if (!filename) {
      imagePreview.src = '';
      imagePreview.style.display = 'none';
      return;
    }
    imagePreview.src = `images/help-images/${filename}`;
    imagePreview.style.display = 'block';
  };

  document.querySelectorAll('.help-role-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const role = event.target.value;
      if (event.target.checked) {
        selectedRoles = Array.from(new Set([...selectedRoles, role]));
      } else {
        selectedRoles = selectedRoles.filter((value) => value !== role);
      }
    });
  });

  imageInput?.addEventListener('input', syncImagePreview);
  imageInput?.addEventListener('change', syncImagePreview);
  syncImagePreview();

  document.getElementById('submitHelpArticle').addEventListener('click', async () => {
    const form = document.getElementById('helpArticleForm');
    const data = new FormData(form);
    const payload = {
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim(),
      image: String(data.get('image') || '').trim(),
      category: String(data.get('category') || '').trim(),
      tags: normalizeHelpArticleTags(data.get('tags')),
      featured: Boolean(form.querySelector('input[name="featured"]').checked),
      videoUrl: String(data.get('videoUrl') || '').trim(),
      targetRoles: Array.from(new Set(selectedRoles)),
      updatedAt: new Date().toISOString()
    };
    if (!payload.title || !payload.description) {
      createToast('Please add a title and description before publishing the article.', 'warning');
      return;
    }
    try {
      if (isEditing && article?.id) {
        await updateDocument('helpArticles', article.id, payload);
        createToast('Help article updated.', 'success');
      } else {
        await addDocument('helpArticles', { ...payload, createdAt: new Date().toISOString() });
        createToast('Help article published.', 'success');
      }
      closeModal();
      renderHelpCenter();
    } catch (error) {
      createToast(error.message || 'Unable to save the article.', 'error');
    }
  });
  document.getElementById('cancelHelpArticle').addEventListener('click', closeModal);
}

function renderLogs() {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">System Logs</h3>
          <p class="card-subtitle">Administrative audit trail</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            ${state.data.logs.map((entry) => `
              <tr>
                <td>${formatDate(entry.createdAt)}</td>
                <td>${escapeHtml(entry.user)}</td>
                <td>${escapeHtml(entry.action)}</td>
                <td>${escapeHtml(entry.details)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function handleAdminModalEscape(event) {
  if (event.key === 'Escape') {
    closeModal();
  }
}

function openModal(title, body) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="close-btn" id="closeModalBtn">×</button>
      </div>
      <div>${body}</div>
    </div>
  `;
  modalRoot.classList.add('open');
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', handleAdminModalEscape);
}

function closeModal() {
  clearAdminMessageSession();
  modalRoot.classList.remove('open');
  modalRoot.innerHTML = '';
  document.removeEventListener('keydown', handleAdminModalEscape);
}

function initializeTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  adminAvatar.textContent = getInitials(state.user.displayName);
}

function getAdminAllowedEmails() {
  const fromStorage = localStorage.getItem('manna-admin-email');
  const fallback = ['savieisaiah54@gmail.com'];
  return fromStorage ? [fromStorage, ...fallback] : fallback;
}

function isAuthorizedAdmin(profile = {}, email = '') {
  const role = String(profile?.role || profile?.userRole || '').toLowerCase();
  if (role === 'admin' || profile?.isAdmin) return true;
  const normalizedEmail = (email || '').toLowerCase();
  return getAdminAllowedEmails().some((allowed) => (allowed || '').toLowerCase() === normalizedEmail);
}

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
    if (!state.user?.uid || state.user.role === 'guest') {
      state.user = { uid: '', displayName: 'Guest', role: 'guest' };
      showLogin();
    }
  }, 900);
}

function showApp() {
  loginView.classList.add('hidden');
  appShell.classList.remove('hidden');
}

function showLogin() {
  appShell.classList.add('hidden');
  loginView.classList.remove('hidden');
}

function showAuthNotice(message) {
  showLogin();
  if (message) {
    createToast(message, 'warning');
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
      updatedAt: new Date().toISOString()
    };
    await updateDocument('users', uid, payload);
    state.user = { ...state.user, ...payload };
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

function attachLoginHandler() {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
      createToast('Please enter both email and password.', 'warning');
      return;
    }

    const { auth, db } = initFirebase();
    if (!auth || !db) {
      createToast('Firebase is not available. Please refresh and try again.', 'error');
      return;
    }

    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      const user = result.user;
      const profileDoc = await db.collection('users').doc(user.uid).get();
      const profile = profileDoc.exists ? profileDoc.data() : {};

      if (!isAuthorizedAdmin(profile, user.email)) {
        state.user = {
          uid: user.uid,
          displayName: profile.displayName || user.displayName || email.split('@')[0],
          role: 'unauthorized',
          email: user.email
        };
        showAuthNotice('This account is not authorized for the admin console.');
        return;
      }

      state.user = {
        uid: user.uid,
        displayName: profile.displayName || user.displayName || email.split('@')[0],
        role: 'admin',
        email: user.email
      };
      localStorage.setItem('manna-auth', 'granted');
      initializeTheme();
      showApp();
      createToast('Admin signed in successfully.', 'success');
    } catch (error) {
      const message = error?.message || 'Login failed.';
      createToast(message, 'error');
      if (message.includes('invalid-credential') || message.includes('bad')) {
        createToast('Use the Firebase admin account or verify the credentials.', 'warning');
      }
    }
  });
}

function ensureAdminAccess() {
  const { auth, db } = initFirebase();
  const savedAuth = localStorage.getItem('manna-auth');

  if (!auth || !db) {
    showLogin();
    return;
  }

  const restoreAdminSession = async (user) => {
    if (!user) {
      clearAuthBootstrapTimer();
      localStorage.removeItem('manna-auth');
      scheduleAuthFallback();
      return;
    }

    try {
      const profileDoc = await db.collection('users').doc(user.uid).get();
      const profile = profileDoc.exists ? profileDoc.data() : {};
      if (!isAuthorizedAdmin(profile, user.email)) {
        state.user = {
          uid: user.uid,
          displayName: profile.displayName || user.displayName || user.email?.split('@')[0] || 'Admin',
          role: 'unauthorized',
          email: user.email
        };
        showAuthNotice('This account is not authorized for the admin console.');
        return;
      }

      state.user = {
        uid: user.uid,
        displayName: profile.displayName || user.displayName || user.email?.split('@')[0] || 'Admin',
        role: 'admin',
        email: user.email
      };
      localStorage.setItem('manna-auth', 'granted');
      initializeTheme();
      showApp();
    } catch (error) {
      console.error(error);
      showLogin();
    }
  };

  auth.onAuthStateChanged((user) => {
    if (user) {
      clearAuthBootstrapTimer();
      restoreAdminSession(user);
      return;
    }

    state.user = { uid: '', displayName: 'Guest', role: 'guest' };
    scheduleAuthFallback();
  });

  if (auth.currentUser) {
    restoreAdminSession(auth.currentUser);
    return;
  }

  if (savedAuth === 'granted') {
    showApp();
    state.user = { ...state.user, displayName: 'Admin', role: 'admin' };
    initializeTheme();
    return;
  }

  scheduleAuthFallback();
}

function normalizeUserEntry(user, role = 'customer') {
  const normalizedRole = role || user?.role || 'customer';
  const displayName = user?.displayName || user?.name || user?.ownerName || (user?.email ? user.email.split('@')[0] : 'User');
  const status = user?.status || user?.accountStatus || (normalizedRole === 'delivery' || normalizedRole === 'delivery_person' ? 'pending' : 'active');

  return {
    ...user,
    id: user?.id || user?.uid || '',
    uid: user?.uid || user?.id || '',
    name: displayName,
    displayName,
    email: user?.email || '',
    phone: user?.phone || '',
    role: normalizedRole,
    status,
    isDeleted: Boolean(user?.isDeleted)
  };
}

function normalizeRestaurantEntry(entry, fallbackUser = null) {
  const fallbackStatus = entry?.status || entry?.restaurantStatus || fallbackUser?.restaurantStatus || fallbackUser?.status || 'pending';
  const businessName = entry?.businessName || entry?.name || fallbackUser?.businessName || fallbackUser?.displayName || 'New Restaurant';
  const ownerName = entry?.ownerName || fallbackUser?.ownerName || fallbackUser?.displayName || '';
  const email = entry?.email || fallbackUser?.email || '';
  const phone = entry?.phone || fallbackUser?.phone || '';
  const location = entry?.location || entry?.address || [entry?.city, entry?.county].filter(Boolean).join(', ') || fallbackUser?.address || '';

  return {
    ...entry,
    id: entry?.id || fallbackUser?.restaurantId || fallbackUser?.uid || fallbackUser?.id || '',
    ownerUid: entry?.ownerUid || fallbackUser?.uid || '',
    businessName,
    name: entry?.name || businessName,
    ownerName,
    email,
    phone,
    location,
    status: fallbackStatus,
    restaurantStatus: fallbackStatus,
    isActive: entry?.isActive ?? (fallbackStatus === 'approved'),
    isDeleted: Boolean(entry?.isDeleted),
    updatedAt: entry?.updatedAt || new Date().toISOString()
  };
}

function mergeRestaurantEntries(restaurants = [], users = []) {
  const normalizedRestaurants = restaurants.map((restaurant) => normalizeRestaurantEntry(restaurant));
  const restaurantUsers = users.filter((user) => user.role === 'restaurant' || user.role === 'resturant');
  const matchedIds = new Set();

  normalizedRestaurants.forEach((restaurant) => {
    matchedIds.add(restaurant.id);
  });

  restaurantUsers.forEach((user) => {
    const candidateId = user.restaurantId || user.uid || user.id;
    const existingIndex = normalizedRestaurants.findIndex((restaurant) => {
      return restaurant.id === candidateId || restaurant.ownerUid === user.uid || restaurant.email === user.email || restaurant.id === user.uid;
    });

    if (existingIndex >= 0) {
      normalizedRestaurants[existingIndex] = normalizeRestaurantEntry(normalizedRestaurants[existingIndex], user);
      matchedIds.add(normalizedRestaurants[existingIndex].id);
      return;
    }

    normalizedRestaurants.unshift(normalizeRestaurantEntry({ id: candidateId, source: 'user' }, user));
    matchedIds.add(candidateId);
  });

  return normalizedRestaurants.filter((restaurant) => Boolean(restaurant.id));
}

function initializeFirebaseSync() {
  const firebase = initFirebase();
  if (!firebase.ready) {
    createToast('Firebase not configured. Running in local demo mode.', 'warning');
    return;
  }

  const refreshDashboard = () => {
    if (state.currentSection === 'dashboard') {
      renderDashboard();
    } else {
      renderSection(state.currentSection);
    }
  };

  subscribeCollection('masterProducts', (items) => {
    console.log('[MANNA] Admin master products snapshot received:', items);
    state.data.products = items.map((item) => ({ ...item, category: getCategoryDisplayName(item.category) }));
    if (state.currentSection === 'products') {
      renderProducts();
    }
    refreshDashboard();
  });
  subscribeCollection('masterAddons', (items) => {
    console.log('[MANNA] Admin master add-ons snapshot received:', items);
    state.data.addons = items;
    if (state.currentSection === 'addons') {
      renderAddons();
    }
    refreshDashboard();
  });
  subscribeCollection('restaurants', (items) => {
    state.data.restaurants = items.map((restaurant) => normalizeRestaurantEntry(restaurant));
    refreshDashboard();
  }, [{ field: 'isDeleted', operator: '!=', value: true }]);
  subscribeCollection('orders', (items) => {
    state.data.orders = items;
    refreshDashboard();
  }, [{ field: 'isDeleted', operator: '!=', value: true }]);
  subscribeCollection('users', (items) => {
    state.data.customers = items
      .filter((item) => item.role === 'customer' || item.role === 'user')
      .map((item) => normalizeUserEntry(item, 'customer'));
    state.data.delivery = items
      .filter((item) => item.role === 'delivery_person' || item.role === 'delivery')
      .map((item) => normalizeUserEntry(item, 'delivery'));

    const db = initFirebase().db;
    const restaurantUsers = items.filter((item) => item.role === 'restaurant' || item.role === 'resturant');
    state.data.restaurants = mergeRestaurantEntries(state.data.restaurants, items);

    if (db) {
      const pendingCreations = restaurantUsers.map(async (user) => {
        const existingRestaurant = state.data.restaurants.find((restaurant) => {
          return restaurant.id === (user.restaurantId || user.uid || user.id) || restaurant.ownerUid === user.uid || restaurant.email === user.email;
        });

        if (existingRestaurant && existingRestaurant.id && existingRestaurant.id !== user.uid) {
          return null;
        }

        const restaurantDocId = user.restaurantId || user.uid || user.id;
        const restaurantPayload = {
          ownerUid: user.uid,
          ownerName: user.displayName || user.ownerName || '',
          businessName: user.businessName || user.displayName || 'New Restaurant',
          name: user.businessName || user.displayName || 'New Restaurant',
          email: user.email || '',
          phone: user.phone || '',
          address: user.address || '',
          city: user.city || '',
          county: user.county || '',
          location: user.address || '',
          status: user.restaurantStatus || user.status || 'pending',
          restaurantStatus: user.restaurantStatus || user.status || 'pending',
          isActive: Boolean(user.isApproved),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return db.collection('restaurants').doc(restaurantDocId).set(restaurantPayload, { merge: true });
      });

      Promise.allSettled(pendingCreations).catch(() => { });
    }

    refreshDashboard();
  });
  subscribeCollection('reports', (items) => {
    state.data.reports = items;
    refreshDashboard();
  });
  subscribeCollection('notifications', (items) => {
    state.data.notifications = items;
    refreshDashboard();
  });
  subscribeCollection('supportRequests', (items) => {
    state.data.supportRequests = items.sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
    refreshDashboard();
  });
  subscribeCollection('deliveryPayouts', (items) => {
    state.data.financialPayouts = items;
    if (state.currentSection === 'financials') {
      renderFinancials();
    }
    refreshDashboard();
  });
  subscribeCollection('platformFeePayments', (items) => {
    state.data.platformFeePayments = items;
    if (state.currentSection === 'financials') {
      renderFinancials();
    }
    refreshDashboard();
  });
  subscribeCollection('helpArticles', (items) => {
    state.data.helpArticles = items;
    if (state.currentSection === 'help') {
      renderHelpCenter();
    }
    refreshDashboard();
  });
}

function init() {
  seedData();
  loadData();
  initializeTheme();
  attachEvents();
  attachLoginHandler();
  ensureAdminAccess();
  initializeFirebaseSync();
  const hashSection = window.location.hash.replace('#', '').replace(/^admin-/, '');
  const initialSection = ['dashboard', 'products', 'addons', 'restaurants', 'customers', 'delivery', 'orders', 'analytics', 'reports', 'coupons', 'announcements', 'notifications', 'settings', 'logs'].includes(hashSection) ? hashSection : 'dashboard';
  openSection(initialSection);
  console.info('[MANNA] Admin panel initialized and ready to authenticate with Firebase.');
}

init();
