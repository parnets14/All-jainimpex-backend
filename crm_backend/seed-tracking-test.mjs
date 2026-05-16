/**
 * Quick script to seed test location data into Firebase RTDB
 * Run: node seed-tracking-test.mjs
 * This simulates a delivery executive sharing their location
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load service account
const keyPath = join(__dirname, 'jain-impex-firebase-adminsdk-fbsvc-781243a615.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

// Initialize Firebase Admin
const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jain-impex-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const db = admin.database();

// Seed test data for shree-jain-impex company
const company = 'shree-jain-impex';
const testExecutives = [
  {
    id: 'test-exec-1',
    name: 'Ramesh Kumar',
    phone: '9876543210',
    latitude: 26.9124,
    longitude: 75.7873,
    status: 'active',
  },
  {
    id: 'test-exec-2',
    name: 'Suresh Sharma',
    phone: '9876543211',
    latitude: 26.9224,
    longitude: 75.7973,
    status: 'active',
  },
];

async function seedData() {
  console.log('🌱 Seeding test tracking data...');

  for (const exec of testExecutives) {
    const ref = db.ref(`/tracking/${company}/${exec.id}`);
    await ref.set({
      name: exec.name,
      phone: exec.phone,
      latitude: exec.latitude,
      longitude: exec.longitude,
      accuracy: 15,
      speed: 2.5,
      status: exec.status,
      lastUpdated: Date.now(),
    });
    console.log(`✅ Seeded: ${exec.name} at ${exec.latitude}, ${exec.longitude}`);
  }

  console.log('\n🎉 Done! Check your web dashboard - executives should appear now.');
  console.log('📍 To clean up later, run: node seed-tracking-test.mjs --clean');

  if (process.argv.includes('--clean')) {
    await db.ref(`/tracking/${company}`).remove();
    console.log('🧹 Cleaned up test data');
  }

  process.exit(0);
}

seedData().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
