/**
 * PO Expiration Cron
 *
 * 1. Warns one day before an unused Approved PO's GRN-conversion window ends
 * 2. Marks unused Approved POs as Expired after their effective expiration
 *
 * Legacy Approved POs with no explicit expiration use
 * approvedAt || updatedAt || orderDate || createdAt, plus 30 days.
 * Runs daily at 8:00 AM IST (2:30 UTC).
 */
import cron from 'node-cron';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { purchaseOrderSchema } from '../models/PurchaseOrder.js';
import { grnSchema } from '../models/GRN.js';
import { sendAdminNotification } from '../services/adminNotificationService.js';

const getModels = (company) => {
  const conn = getCompanyConnection(company);
  return {
    PurchaseOrder: conn.models.PurchaseOrder || conn.model('PurchaseOrder', purchaseOrderSchema),
    GRN: conn.models.GRN || conn.model('GRN', grnSchema)
  };
};

const effectiveExpiryExpression = () => ({
  $ifNull: [
    '$expirationDate',
    {
      $dateAdd: {
        startDate: {
          $ifNull: [
            '$approvedAt',
            { $ifNull: ['$updatedAt', { $ifNull: ['$orderDate', '$createdAt'] }] }
          ]
        },
        unit: 'day',
        amount: 30
      }
    }
  ]
});

const isReferencedByGRN = (GRN, purchaseOrderId) => GRN.exists({
  $or: [
    { poId: purchaseOrderId },
    { poIds: purchaseOrderId }
  ]
});

const runPOExpiration = async () => {
  const companies = getValidCompanies();
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const company of companies) {
    try {
      const { PurchaseOrder, GRN } = getModels(company);
      const [primaryPOIds, additionalPOIds] = await Promise.all([
        GRN.distinct('poId'),
        GRN.distinct('poIds')
      ]);
      const referencedPOIds = [...new Set(
        [...primaryPOIds, ...additionalPOIds].filter(Boolean).map((id) => id.toString())
      )];

      const unusedApprovedPredicate = {
        status: 'Approved',
        convertedToGRNId: null,
        _id: { $nin: referencedPOIds }
      };

      // Warn about unused Approved POs whose conversion window ends within one day.
      const expiringSoon = await PurchaseOrder.find({
        ...unusedApprovedPredicate,
        expirationNotified: { $ne: true },
        $expr: {
          $and: [
            { $gt: [effectiveExpiryExpression(), now] },
            { $lte: [effectiveExpiryExpression(), oneDayFromNow] }
          ]
        }
      }).populate('supplierId', 'name').lean();

      let warningsSent = 0;
      for (const po of expiringSoon) {
        // Recheck legacy GRN references immediately before reserving this warning.
        if (await isReferencedByGRN(GRN, po._id)) continue;

        const reservedPO = await PurchaseOrder.findOneAndUpdate(
          {
            _id: po._id,
            status: 'Approved',
            convertedToGRNId: null,
            expirationNotified: { $ne: true },
            $expr: {
              $and: [
                { $gt: [effectiveExpiryExpression(), now] },
                { $lte: [effectiveExpiryExpression(), oneDayFromNow] }
              ]
            }
          },
          { $set: { expirationNotified: true } },
          { new: true, timestamps: false }
        ).populate('supplierId', 'name').lean();
        if (!reservedPO) continue;

        try {
          await sendAdminNotification({
            type: 'system',
            title: '⏰ Approved PO Expiring Tomorrow',
            message: `PO ${reservedPO.poNumber} (${reservedPO.supplierId?.name || 'Supplier'}) must be converted to a GRN before its approval window expires. Extend it if more time is needed.`,
            priority: 'high',
            company,
            data: {
              poId: reservedPO._id,
              poNumber: reservedPO.poNumber,
              supplierName: reservedPO.supplierId?.name
            }
          });
          warningsSent += 1;
        } catch (notificationError) {
          // Release only our still-current reservation so a later run can retry.
          await PurchaseOrder.updateOne(
            {
              _id: reservedPO._id,
              status: 'Approved',
              convertedToGRNId: null,
              expirationNotified: true,
              $expr: {
                $and: [
                  { $gt: [effectiveExpiryExpression(), now] },
                  { $lte: [effectiveExpiryExpression(), oneDayFromNow] }
                ]
              }
            },
            { $set: { expirationNotified: false } },
            { timestamps: false }
          );
          console.error(`[${company}] PO expiration warning failed for ${reservedPO.poNumber}:`, notificationError.message);
        }
      }

      if (warningsSent > 0) {
        console.log(`[${company}] Sent Approved-to-GRN expiration warnings for ${warningsSent} PO(s)`);
      }

      // Expire only elapsed Approved POs that remain unused and unclaimed.
      const elapsedPOs = await PurchaseOrder.find({
        ...unusedApprovedPredicate,
        $expr: { $lte: [effectiveExpiryExpression(), now] }
      }).select('_id').lean();

      let expiredCount = 0;
      for (const po of elapsedPOs) {
        if (await isReferencedByGRN(GRN, po._id)) continue;

        const expiredPO = await PurchaseOrder.findOneAndUpdate(
          {
            _id: po._id,
            status: 'Approved',
            convertedToGRNId: null,
            $expr: { $lte: [effectiveExpiryExpression(), now] }
          },
          {
            $set: { status: 'Expired' },
            $push: {
              statusHistory: {
                fromStatus: 'Approved',
                toStatus: 'Expired',
                changedAt: now,
                changedBy: null,
                reason: 'Approved-to-GRN conversion window elapsed'
              }
            }
          },
          { new: true, runValidators: true, timestamps: false }
        );
        if (expiredPO) expiredCount += 1;
      }

      if (expiredCount > 0) {
        console.log(`[${company}] Expired ${expiredCount} unused Approved PO(s)`);
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
