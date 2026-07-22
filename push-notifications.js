import { createToast } from './utils.js';

const VAPID_KEY = 'BN6kWSeKKtCvZaqFhb_F5UVtQ97DyMBI_qdLr4eekvKtQ3Zp3L-EvVO9hoIJBpHsZZuR1jvovyNd5I7JnHkt-JU';
const SERVICE_WORKER_URL = '/firebase-messaging-sw.js';
const PROMPT_STORAGE_KEY = 'mannaPushNotificationPromptDismissed';
const PUSH_PROMPT_ID = 'mannaPushPermissionPrompt';

function isPushSupported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window && window.firebase?.messaging;
}

export async function registerPushServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
        console.info('[MANNA Push] Service worker registered:', registration.scope);
        return registration;
    } catch (error) {
        console.warn('[MANNA Push] Unable to register service worker:', error);
        return null;
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        throw new Error('Browser does not support notifications.');
    }

    return Notification.requestPermission();
}

async function getFcmToken(user, firestore) {
    if (!user || !firestore || !isPushSupported()) {
        return null;
    }

    try {
        await registerPushServiceWorker();
        const registration = await navigator.serviceWorker.ready;
        const messaging = window.firebase.messaging();
        if (!messaging || typeof messaging.getToken !== 'function') {
            throw new Error('Firebase Messaging is unavailable.');
        }

        const token = await messaging.getToken({
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
        });
        return token || null;
    } catch (error) {
        console.warn('[MANNA Push] Failed to get FCM token:', error);
        return null;
    }
}

async function saveFcmToken(userUid, firestore, token) {
    if (!userUid || !firestore || !token) {
        return;
    }

    try {
        await firestore.collection('users').doc(userUid).set({
            fcmToken: token,
            fcmTokenUpdatedAt: new Date()
        }, { merge: true });
        console.info('[MANNA Push] FCM token saved for user:', userUid);
    } catch (error) {
        console.warn('[MANNA Push] Failed to save FCM token:', error);
    }
}

function removePushPrompt() {
    const existing = document.getElementById(PUSH_PROMPT_ID);
    if (existing) {
        existing.remove();
    }
}

function createPushPrompt(onEnable, onDismiss) {
    removePushPrompt();

    const banner = document.createElement('div');
    banner.id = PUSH_PROMPT_ID;
    banner.className = 'push-permission-banner';
    banner.innerHTML = `
        <div class="push-permission-content">
            <strong>Enable notifications</strong>
            <p>Get real-time order updates, payment receipts, and admin alerts even when MANNA is not in the foreground.</p>
        </div>
        <div class="push-permission-actions">
            <button type="button" class="primary-btn" id="mannaPushEnableButton">Enable</button>
            <button type="button" class="ghost-btn" id="mannaPushDismissButton">Not now</button>
        </div>
    `;
    document.body.appendChild(banner);

    const enableButton = document.getElementById('mannaPushEnableButton');
    const dismissButton = document.getElementById('mannaPushDismissButton');

    enableButton?.addEventListener('click', async () => {
        await onEnable();
        removePushPrompt();
    });
    dismissButton?.addEventListener('click', () => {
        onDismiss();
        removePushPrompt();
    });
}

function shouldShowPrompt() {
    return Notification.permission === 'default' && !localStorage.getItem(PROMPT_STORAGE_KEY);
}

function markPromptDismissed() {
    localStorage.setItem(PROMPT_STORAGE_KEY, 'true');
}

async function showPushPermissionPrompt(user, firestore, showToast) {
    if (!shouldShowPrompt() || !document.body) {
        return;
    }

    createPushPrompt(async () => {
        try {
            const permission = await requestNotificationPermission();
            if (permission === 'granted') {
                await initializePushForUser(user, firestore, { showToast, promptOnDefault: false });
                showToast('Notifications are enabled. You can now receive updates from MANNA.', 'success');
            } else if (permission === 'denied') {
                markPromptDismissed();
                showToast('Push notifications were blocked. You can enable them from your browser settings.', 'warning');
            } else {
                showToast('Notification permission remains undecided. You can enable it later.', 'info');
            }
        } catch (error) {
            console.warn('[MANNA Push] Permission request failed:', error);
            showToast('Unable to enable notifications right now.', 'error');
        }
    }, () => {
        markPromptDismissed();
        showToast('You can enable push notifications later from your browser.', 'info');
    });
}

export async function initializePushForUser(user, firestore, options = {}) {
    if (!user || !firestore || !isPushSupported()) {
        return;
    }

    const { showToast = createToast, promptOnDefault = true } = options;

    try {
        await registerPushServiceWorker();
        const permission = Notification.permission;
        if (permission === 'granted') {
            const token = await getFcmToken(user, firestore);
            if (token) {
                await saveFcmToken(user.uid, firestore, token);
            }
            setupForegroundPush(showToast);
            return;
        }

        if (permission === 'default' && promptOnDefault) {
            await showPushPermissionPrompt(user, firestore, showToast);
        }
    } catch (error) {
        console.warn('[MANNA Push] initializePushForUser error:', error);
    }
}

export function setupForegroundPush(showToast = createToast) {
    if (!isPushSupported()) {
        return;
    }

    try {
        const messaging = window.firebase.messaging();
        messaging.onMessage((payload) => {
            const title = payload.notification?.title || 'MANNA notification';
            const body = payload.notification?.body || payload.data?.message || '';
            if (typeof showToast === 'function') {
                showToast(`${title}${body ? ` – ${body}` : ''}`, 'info');
            }
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (!message || typeof message !== 'object') {
                return;
            }
            if (message.action === 'open' && message.url) {
                window.location.href = message.url;
            }
        });
    } catch (error) {
        console.warn('[MANNA Push] Unable to initialize foreground push listener:', error);
    }
}
