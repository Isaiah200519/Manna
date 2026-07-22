importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyBv8xoBsZrYvczcjcZAW85t--RG_zShXxQ',
    authDomain: 'manna-8cd1d.firebaseapp.com',
    projectId: 'manna-8cd1d',
    storageBucket: 'manna-8cd1d.firebasestorage.app',
    messagingSenderId: '120769527685',
    appId: '1:120769527685:web:870e7851bf1874c3d74eec',
    measurementId: 'G-74HQY6DRQW'
});

const messaging = firebase.messaging();
const DEFAULT_ICON = '/images/logo/manna-logo.png';
const DEFAULT_BADGE = '/images/logo/manna-logo.png';
const DEFAULT_TAG = 'manna-notification';

function buildNotificationOptions(payload) {
    const notification = payload.notification || {};
    const data = payload.data || {};

    return {
        body: notification.body || data.body || 'You have a new update from MANNA.',
        icon: notification.icon || DEFAULT_ICON,
        badge: notification.badge || DEFAULT_BADGE,
        tag: data.tag || notification.tag || DEFAULT_TAG,
        data: {
            url: data.url || notification.click_action || '/',
            ...data
        },
        actions: notification.actions || []
    };
}

messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'MANNA Notification';
    const options = buildNotificationOptions(payload);
    self.registration.showNotification(title, options);
});

self.addEventListener('push', (event) => {
    if (!event.data) {
        return;
    }

    let payload;
    try {
        payload = event.data.json();
    } catch (error) {
        console.warn('[MANNA SW] Push event did not contain JSON payload:', error);
        return;
    }

    const title = payload.notification?.title || payload.title || 'MANNA Notification';
    const options = buildNotificationOptions(payload);
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const data = notification.data || {};
    const url = data.url || '/';

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) {
                const client = clientList[0];
                if (client.focus) {
                    client.focus();
                }
                if (client.navigate) {
                    return client.navigate(url).catch(() => clients.openWindow(url));
                }
                return client.postMessage({ action: 'open', url });
            }
            return clients.openWindow(url);
        })
    );
});
