/**
 * Notification Cleanup Cron
 * Runs daily at 2:00 AM IST — deletes notifications older than 7 days
 */
import cron from 'node-cron';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { notificationSchema }   from '../models/Notification.js';

const COMPANIES      = ['jain-impex', 'ridhi', 'shree-jain-impex'];
const RETENTION_DAYS = 7;

const runNotificationCleanup = async () => {
  console.log('🧹 Running notification cleanup cron...');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  let totalDeleted = 0;

  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;

      const Notification = db.models.Notification || db.model('Notification', notificationSchema);

      const result = await Notification.deleteMany({
        createdAt: { $lt: cutoff },
      });

      if (result.deletedCount > 0) {
        console.log(`🗑️  Deleted ${result.deletedCount} old notification(s) from ${company}`);
        totalDeleted += result.deletedCount;
      }
    } catch (err) {
      console.error(`Notification cleanup error for ${company}:`, err.message);
    }
  }

  console.log(`✅ Notification cleanup done — ${totalDeleted} total deleted (older than ${RETENTION_DAYS} days)`);
};

// Schedule: every day at 2:00 AM IST
export const startNotificationCleanupCron = () => {
  cron.schedule('0 2 * * *', runNotificationCleanup, { timezone: 'Asia/Kolkata' });
  console.log('🧹 Notification cleanup cron scheduled (daily 2:00 AM IST, 7-day retention)');
};

export default startNotificationCleanupCron;
