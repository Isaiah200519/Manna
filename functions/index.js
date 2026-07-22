const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendNotification = functions.firestore
    .document('notifications/{notificationId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data) {
            return null;
        }

        const payload = {
            notification: {
                title: data.title || 'MANNA update',
                body: data.body || data.message || 'You have a new notification.',
                icon: '/images/logo/manna-logo.png',
                badge: '/images/logo/manna-logo.png'
            },
            data: {
                url: data.url || '/',
                orderId: data.orderId || '',
                tag: data.tag || 'manna-notification'
            }
        };

        const recipientUid = data.recipientUid;
        const recipientUids = Array.isArray(data.recipientUids) ? data.recipientUids : [];
        const broadcast = data.broadcast === true;

        if (recipientUid) {
            const userDoc = await admin.firestore().collection('users').doc(recipientUid).get();
            const fcmToken = userDoc.exists ? userDoc.data()?.fcmToken : null;
            if (!fcmToken) {
                return null;
            }
            return admin.messaging().send({ token: fcmToken, ...payload });
        }

        if (recipientUids.length) {
            const tokens = [];
            for (const uid of recipientUids) {
                const userDoc = await admin.firestore().collection('users').doc(uid).get();
                const token = userDoc.exists ? userDoc.data()?.fcmToken : null;
                if (token) tokens.push(token);
            }
            if (!tokens.length) {
                return null;
            }
            return admin.messaging().sendMulticast({ tokens, ...payload });
        }

        if (broadcast) {
            const usersSnapshot = await admin.firestore().collection('users').where('fcmToken', '!=', null).get();
            const tokens = usersSnapshot.docs
                .map((doc) => doc.data()?.fcmToken)
                .filter(Boolean);
            if (!tokens.length) {
                return null;
            }
            return admin.messaging().sendMulticast({ tokens, ...payload });
        }

        return null;
    });
