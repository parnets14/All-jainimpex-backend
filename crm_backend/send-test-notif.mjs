/**
 * Send test notification to dealer with phone 9876543212
 * Searches across all company databases
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URI   = process.env.MONGO_BASE_URI;
const OPTIONS    = process.env.MONGO_OPTIONS || '?retryWrites=true&w=majority';
const DATABASES  = [
  process.env.MONGO_DB_JAINIMPEX || 'JainImpexCRM',
  process.env.MONGO_DB_RIDHI     || 'ridhi_crm',
  process.env.MONGO_DB_SHREEJAIN || 'shreejain_crm',
];

if (!BASE_URI) { console.error('No MONGO_BASE_URI in .env'); process.exit(1); }

// Init Firebase Admin
const keyPath = join(__dirname, 'jain-impex-firebase-adminsdk-fbsvc-781243a615.json');
if (!existsSync(keyPath)) { console.error('Service account not found'); process.exit(1); }
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
console.log('✅ Firebase initialized');

const PHONE = '9876543212';
let foundDealer = null;
let foundDb = null;

// Search all company databases for the dealer
for (const dbName of DATABASES) {
  const uri = `${BASE_URI}/${dbName}${OPTIONS}`;
  console.log(`\n🔍 Searching in database: ${dbName}...`);

  const conn = await mongoose.createConnection(uri).asPromise();

  // Search users collection
  const user = await conn.db.collection('users').findOne({
    $or: [
      { phone: PHONE },
      { mobile: PHONE },
      { phoneNumber: PHONE },
      { phone: `+91${PHONE}` },
    ]
  });

  if (user) {
    console.log(`   Found user: ${user.name || user._id}`);

    // Find dealer with FCM token
    const dealer = await conn.db.collection('dealers').findOne({
      $or: [
        { userId: user._id },
        { user: user._id },
        { phone: PHONE },
        { mobile: PHONE },
      ],
      fcmToken: { $exists: true, $ne: null, $ne: '' }
    });

    if (dealer) {
      foundDealer = dealer;
      foundDb = dbName;
      await conn.close();
      break;
    } else {
      // Show all dealers in this DB for debugging
      const allDealers = await conn.db.collection('dealers')
        .find({ $or: [{ userId: user._id }, { user: user._id }] })
        .project({ name: 1, code: 1, fcmToken: 1 })
        .toArray();
      console.log(`   Dealer(s) linked to user: ${allDealers.length}`);
      allDealers.forEach(d => {
        console.log(`     - ${d.name} | fcmToken: ${d.fcmToken ? d.fcmToken.substring(0,30)+'...' : 'NULL'}`);
      });
    }
  } else {
    console.log(`   User not found in ${dbName}`);
  }

  await conn.close();
}

if (!foundDealer) {
  // Last resort: search all DBs for any dealer with an FCM token
  console.log('\n⚠️  Dealer not found via user lookup. Trying direct FCM token search...');
  for (const dbName of DATABASES) {
    const uri = `${BASE_URI}/${dbName}${OPTIONS}`;
    const conn = await mongoose.createConnection(uri).asPromise();
    const dealers = await conn.db.collection('dealers')
      .find({ fcmToken: { $exists: true, $ne: null, $ne: '' } })
      .project({ name: 1, code: 1, phone: 1, mobile: 1, fcmToken: 1 })
      .toArray();
    if (dealers.length > 0) {
      console.log(`\n  DB: ${dbName} — dealers with FCM tokens:`);
      dealers.forEach((d, i) => {
        console.log(`    ${i+1}. ${d.name} | phone: ${d.phone || d.mobile || 'N/A'} | token: ${d.fcmToken.substring(0,40)}...`);
      });
      // Use the first one found
      if (!foundDealer) { foundDealer = dealers[0]; foundDb = dbName; }
    }
    await conn.close();
  }
}

if (!foundDealer) {
  console.log('\n❌ No dealer with FCM token found in any database.');
  console.log('   Make sure the app is open and logged in, then try again.');
  process.exit(1);
}

console.log(`\n✅ Found dealer: ${foundDealer.name} in DB: ${foundDb}`);
console.log(`   FCM Token: ${foundDealer.fcmToken.substring(0, 60)}...`);

// Send the test notification
const message = {
  token: foundDealer.fcmToken,
  notification: {
    title: '🔔 Test Notification',
    body: `Hello ${foundDealer.name}! Your notifications are working perfectly. ✅`,
  },
  data: {
    type: 'system',
    test: 'true',
  },
  android: {
    priority: 'high',
    notification: {
      channelId: 'dealer_notifications',
      defaultSound: true,
      defaultVibrateTimings: true,
    },
  },
};

console.log('\n📤 Sending notification...');
try {
  const response = await admin.messaging().send(message);
  console.log('✅ SUCCESS! Notification sent to device.');
  console.log('   Message ID:', response);
} catch (err) {
  console.error('❌ Failed:', err.message);
  if (err.code === 'messaging/registration-token-not-registered') {
    console.log('   → Token is stale. Open the app and login again to refresh the token.');
  }
}

process.exit(0);
