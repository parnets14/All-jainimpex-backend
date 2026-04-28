/**
 * Quick script to get FCM token from DB and send test notification
 * Run: node get-fcm-token.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('No MONGODB_URI in .env');
  process.exit(1);
}

// Init Firebase
const keyPath = join(__dirname, 'jain-impex-firebase-adminsdk-fbsvc-781243a615.json');
if (!existsSync(keyPath)) { console.error('Service account not found'); process.exit(1); }
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('✅ Firebase initialized');

// Connect to DB
await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB connected');

// Find dealers with FCM tokens
const dealers = await mongoose.connection.db.collection('dealers')
  .find({ fcmToken: { $exists: true, $ne: null } })
  .project({ name: 1, code: 1, fcmToken: 1 })
  .toArray();

if (dealers.length === 0) {
  console.log('❌ No dealers with FCM tokens found.');
  console.log('   → Login to the app first to save the token.');
  process.exit(0);
}

console.log(`\nFound ${dealers.length} dealer(s) with FCM tokens:`);
dealers.forEach((d, i) => {
  console.log(`  ${i+1}. ${d.name} (${d.code}) — token: ${d.fcmToken.substring(0,30)}...`);
});

// Send test to first dealer
const dealer = dealers[0];
console.log(`\nSending test notification to: ${dealer.name}...`);

const message = {
  token: dealer.fcmToken,
  notification: {
    title: 'Test from Jain Impex',
    body: `Hello ${dealer.name}! Push notifications are working perfectly.`,
  },
  data: { type: 'system', test: 'true' },
  android: {
    priority: 'high',
    notification: { channelId: 'dealer_notifications', defaultSound: true },
  },
};

try {
  const response = await admin.messaging().send(message);
  console.log('✅ SUCCESS! Notification sent. Message ID:', response);
} catch (err) {
  console.error('❌ Failed:', err.message);
  if (err.code === 'messaging/registration-token-not-registered') {
    console.log('   → Token is invalid. Rebuild app and login again to get fresh token.');
  }
}

await mongoose.disconnect();
process.exit(0);
