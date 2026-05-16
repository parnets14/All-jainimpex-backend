/**
 * Notification Cleanup Cron
 * Deletes admin notifications older than 7 days from Firebase RTDB.
 * Runs daily at 2:00 AM.
 */
import cron from 'node-cron';
import admin from 'firebase-admin';

const RTDB_URL = 'https://jain-impex-default-rtdb.asia-southeast1.firebasedatabase.app';
const COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];
const MAX_AGE_DAYS = 7;

const getDb = () => {
  try {
    return admin.app().database(RTDB_URL);
  } catch {
    return null;
  }
};

const cleanupNotifications = async () => {
  const db = getDb();
  if (!db) {
    console.log('⚠️ [NOTIF_CLEANUP] Firebase not initialized, skipping');
    return;
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let totalDeleted = 0;

  for (const company of COMPANIES) {
    try {
      const snapshot = await db.ref(`/notifications/${company}`).orderByChild('createdAt').endAt(cutoff).once('value');
      const data = snapshot.val();
      if (!data) continue;

      const keysToDelete = Object.keys(data);
      const updates = {};
      keysToDelete.forEach((key) => { updates[key] = null; });

      await db.ref(`/notifications/${company}`).update(updates);
      totalDeleted += keysToDelete.length;
    } catch (error) {
      console.error(`❌ [NOTIF_CLEANUP] Error cleaning ${company}:`, error.message);
    }
  }

  if (totalDeleted > 0) {
    console.log(`🧹 [NOTIF_CLEANUP] Deleted ${totalDeleted} notifications older than ${MAX_AGE_DAYS} days`);
  }
};

// Run daily at 2:00 AM
cron.schedule('0 2 * * *', () => {
  console.log('🧹 [NOTIF_CLEANUP] Running notification cleanup...');
  cleanupNotifications();
});

// Also clean up tracking data older than 24 hours (offline executives)
const cleanupTrackingData = async () => {
  const db = getDb();
  if (!db) return;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

  for (const company of COMPANIES) {
    try {
      const snapshot = await db.ref(`/tracking/${company}`).once('value');
      const data = snapshot.val();
      if (!data) continue;

      const updates = {};
      Object.entries(data).forEach(([userId, loc]) => {
        if (loc.lastUpdated && loc.lastUpdated < cutoff && loc.status === 'offline') {
          updates[userId] = null; // Remove stale offline entries
        }
      });

      if (Object.keys(updates).length > 0) {
        await db.ref(`/tracking/${company}`).update(updates);
        console.log(`🧹 [TRACKING_CLEANUP] Removed ${Object.keys(updates).length} stale entries for ${company}`);
      }
    } catch (error) {
      console.error(`❌ [TRACKING_CLEANUP] Error cleaning ${company}:`, error.message);
    }
  }
};

// Run tracking cleanup every 6 hours
cron.schedule('0 */6 * * *', () => {
  cleanupTrackingData();
});

export { cleanupNotifications, cleanupTrackingData };
export const startNotificationCleanupCron = () => {
  console.log('✅ Notification cleanup cron initialized (daily 2 AM + tracking every 6h)');
};
export default { cleanupNotifications, cleanupTrackingData, startNotificationCleanupCron };
