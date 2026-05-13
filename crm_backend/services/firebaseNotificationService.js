import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let firebaseApp = null;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  try {
    let serviceAccount;

    // Option 1: Environment variable (for Render/production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('✅ Firebase: using service account from environment variable');
      } catch (parseErr) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT env var is not valid JSON:', parseErr.message);
        return null;
      }
    } else {
      // Option 2: Local file (for development)
      const keyPaths = [
        join(__dirname, '../firebase-service-account.json'),
        join(__dirname, '../jain-impex-firebase-adminsdk-fbsvc-781243a615.json'),
      ];
      const keyPath = keyPaths.find(p => existsSync(p));
      if (!keyPath) {
        console.warn('⚠️  Firebase: no service account found (env var or file). Push notifications disabled.');
        return null;
      }
      serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
      console.log('✅ Firebase: using service account from file:', keyPath);
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized');
    return firebaseApp;
  } catch (err) {
    console.error('❌ Firebase init error:', err.message);
    return null;
  }
};

// Send push notification to a single FCM token
export const sendPushNotification = async ({ token, title, body, data = {}, channelId = 'se_notifications' }) => {
  if (!token) return { success: false, reason: 'no_token' };
  const app = initFirebase();
  if (!app) return { success: false, reason: 'firebase_not_initialized' };

  try {
    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          channelId,          // se_notifications for SE app, dealer_notifications for Dealer app
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    const response = await admin.messaging().send(message);
    console.log(`📱 Push sent: ${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('❌ Push notification error:', err.message);
    // Token expired/invalid — caller should clear it
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      return { success: false, reason: 'invalid_token' };
    }
    return { success: false, reason: err.message };
  }
};

// Create DB notification + send push
export const createAndSendNotification = async ({
  db, dealerId, fcmToken,
  type, title, message, priority = 'medium',
  orderId = null, orderNumber = null, status = null, metadata = {},
}) => {
  try {
    // 1. Save to DB
    const { notificationSchema } = await import('../models/Notification.js');
    const Notification = db.models.Notification || db.model('Notification', notificationSchema);
    const notif = await Notification.create({
      dealer: dealerId, type, title, message, priority,
      orderId, orderNumber, status, metadata,
    });

    // 2. Send push if token available
    if (fcmToken) {
      const pushResult = await sendPushNotification({
        token: fcmToken, title, body: message,
        data: {
          type, notificationId: notif._id.toString(),
          ...(orderId ? { orderId: orderId.toString() } : {}),
          ...(orderNumber ? { orderNumber } : {}),
          ...(metadata.invoiceId ? { invoiceId: metadata.invoiceId.toString() } : {}),
        },
      });
      // Clear invalid token
      if (!pushResult.success && pushResult.reason === 'invalid_token') {
        const { dealerSchema } = await import('../models/Dealer.js');
        const Dealer = db.models.Dealer || db.model('Dealer', dealerSchema);
        await Dealer.findByIdAndUpdate(dealerId, { fcmToken: null });
      }
    }

    return notif;
  } catch (err) {
    console.error('createAndSendNotification error:', err.message);
    return null;
  }
};

export default { sendPushNotification, createAndSendNotification };
