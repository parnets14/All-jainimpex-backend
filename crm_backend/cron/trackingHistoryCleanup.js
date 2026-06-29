/**
 * SE Trail-History Cleanup Cron
 * Deletes breadcrumb history (/se-tracking-history/{company}/{userId}/{YYYY-MM-DD})
 * older than RETENTION_DAYS, keeping Firebase RTDB storage tiny (free tier).
 * History is keyed per date, so we just drop date buckets older than the cutoff.
 * Runs daily at 3:15 AM IST.
 */
import cron from 'node-cron';
import admin from 'firebase-admin';

const RTDB_URL = 'https://jain-impex-default-rtdb.asia-southeast1.firebasedatabase.app';
const COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];
const RETENTION_DAYS = 30; // keep last 30 days of trails

const getDb = () => {
  try {
    return admin.app().database(RTDB_URL);
  } catch {
    return null;
  }
};

// 'YYYY-MM-DD' for `daysAgo` days before today (local)
const dateKeyDaysAgo = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

export const cleanupTrackingHistory = async () => {
  const db = getDb();
  if (!db) {
    console.log('⚠️ [TRAIL_CLEANUP] Firebase not initialized, skipping');
    return;
  }

  const cutoffKey = dateKeyDaysAgo(RETENTION_DAYS); // delete any date bucket < this
  let totalDeleted = 0;

  for (const company of COMPANIES) {
    try {
      // /se-tracking-history/{company}/{userId}/{dateKey}
      const rootSnap = await db.ref(`/se-tracking-history/${company}`).once('value');
      const users = rootSnap.val();
      if (!users) continue;

      for (const userId of Object.keys(users)) {
        const dateBuckets = users[userId] || {};
        const updates = {};
        Object.keys(dateBuckets).forEach((dateKey) => {
          // string compare works for YYYY-MM-DD
          if (dateKey < cutoffKey) updates[dateKey] = null;
        });
        if (Object.keys(updates).length > 0) {
          await db.ref(`/se-tracking-history/${company}/${userId}`).update(updates);
          totalDeleted += Object.keys(updates).length;
        }
      }
    } catch (error) {
      console.error(`❌ [TRAIL_CLEANUP] Error cleaning ${company}:`, error.message);
    }
  }

  if (totalDeleted > 0) {
    console.log(`🧹 [TRAIL_CLEANUP] Deleted ${totalDeleted} trail-day bucket(s) older than ${RETENTION_DAYS} days`);
  }
};

export const startTrackingHistoryCleanupCron = () => {
  cron.schedule('15 3 * * *', () => {
    console.log('🧹 [TRAIL_CLEANUP] Running SE trail-history cleanup...');
    cleanupTrackingHistory();
  }, { timezone: 'Asia/Kolkata' });
  console.log('✅ SE trail-history cleanup cron initialized (daily 3:15 AM IST, keep 30 days)');
};

export default startTrackingHistoryCleanupCron;
