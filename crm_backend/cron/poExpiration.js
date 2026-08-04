/**
 * PO Expiration Cron
 * 
 * 1. Sends notification 1 day before a PO expires (so admin can extend)
 * 2. Marks expired POs as 'Expired' after expirationDate passes
 * 
 * Runs daily at 8:00 AM IST (2:30 UTC).
 */
import cron from 'node-cron';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { purchaseOrderSchema } from '../models/PurchaseOrder.js';
import { sendAdminNotification } from '../services/adminNotificationService.js';

const getModel = (company) => {
  const conn = getCompanyConnection(company);
  return conn.models.PurchaseOrder || conn.model('PurchaseOrder', purchaseOrderSchema);
};

const runPOExpiration = async () => {
  const companies = getValidCompanies();
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const company of companies) {
    try {
      const PurchaseOrder = getModel(company);

      // 1. Notify about Draft POs expiring tomorrow (not yet notified)
      const expiringTomorrow = await PurchaseOrder.find({
        status: 'Draft',
        expirationDate: { $lte: oneDayFromNow, $gt: now },
        expirationNotified: { $ne: true }
      }).populate('supplierId', 'name').lean();

      for (const po of expiringTomorrow) {
        await sendAdminNotification({
          type: 'system',
          title: '⏰ PO Expiring Tomorrow',
          message: `PO ${po.poNumber} (${po.supplierId?.name || 'Supplier'}) expires tomorrow. Extend or create GRN to prevent expiration.`,
          priority: 'high',
          company,
          data: { poId: po._id, poNumber: po.poNumber, supplierName: po.supplierId?.name }
        });

        // Mark as notified
        await PurchaseOrder.updateOne(
          { _id: po._id },
          { $set: { expirationNotified: true } }
        );
      }

      if (expiringTomorrow.length > 0) {
        console.log(`[${company}] Sent expiration warnings for ${expiringTomorrow.length} PO(s)`);
      }

      // 2. Expire Draft POs past their expiration date (not approved in time)
      const expired = await PurchaseOrder.updateMany(
        {
          status: 'Draft',
          expirationDate: { $lte: now, $ne: null }
        },
        { $set: { status: 'Expired' } }
      );

      if (expired.modifiedCount > 0) {
        console.log(`[${company}] Expired ${expired.modifiedCount} PO(s)`);
      }
    } catch (error) {
      console.error(`[${company}] PO expiration cron error:`, error.message);
    }
  }
};

const startPOExpirationCron = () => {
  // Run daily at 8:00 AM IST = 2:30 UTC
  cron.schedule('30 2 * * *', runPOExpiration, { timezone: 'UTC' });
  console.log('⏰ PO Expiration cron scheduled (8:00 AM IST daily)');
};

export { startPOExpirationCron, runPOExpiration };
export default startPOExpirationCron;
