import cron from 'node-cron';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';

const LEASE_ID = 'sales-order-expiration';
const LEASE_DURATION_MS = 5 * 60 * 1000;
const LEASE_OWNER = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'local'}:${process.pid}`;
let scheduledTask = null;
let localRunInProgress = false;

const acquireCompanyLease = async (dbConnection, now) => {
  try {
    const result = await dbConnection.collection('cron_leases').findOneAndUpdate(
      {
        _id: LEASE_ID,
        $or: [
          { leaseUntil: { $lte: now } },
          { leaseUntil: { $exists: false } }
        ]
      },
      {
        $set: {
          ownerId: LEASE_OWNER,
          acquiredAt: now,
          leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS)
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    const lease = result?.value || result;
    return lease?.ownerId === LEASE_OWNER;
  } catch (error) {
    // Another process can win the upsert race on the fixed _id. That is an
    // expected lease miss, not a job failure.
    if (error?.code === 11000) return false;
    throw error;
  }
};

const releaseCompanyLease = async (dbConnection) => {
  await dbConnection.collection('cron_leases').updateOne(
    { _id: LEASE_ID, ownerId: LEASE_OWNER },
    {
      $set: {
        leaseUntil: new Date(0),
        releasedAt: new Date()
      }
    }
  );
};

export const runSalesOrderExpiration = async () => {
  const now = new Date();
  let expiredCount = 0;

  for (const company of getValidCompanies()) {
    let dbConnection = null;
    let leaseAcquired = false;
    try {
      dbConnection = getCompanyConnection(company);
      leaseAcquired = await acquireCompanyLease(dbConnection, now);
      if (!leaseAcquired) continue;

      const SalesOrder = dbConnection.models.SalesOrder
        || dbConnection.model('SalesOrder', salesOrderSchema);
      const expiredCandidates = await SalesOrder.find({
        expiryDate: { $lt: now },
        isExpired: false,
        status: 'Pending'
      })
        .select('_id expiryDate')
        .lean();

      if (expiredCandidates.length === 0) continue;

      const result = await SalesOrder.bulkWrite(expiredCandidates.map(order => ({
        updateOne: {
          filter: {
            _id: order._id,
            expiryDate: { $lt: now },
            isExpired: false,
            status: 'Pending'
          },
          update: {
            $set: {
              isExpired: true,
              expiredAt: now,
              status: 'Expired',
              stockAvailable: false
            },
            $push: {
              expiryHistory: {
                action: 'expired',
                previousDate: order.expiryDate,
                newDate: null,
                reason: 'Order automatically expired after deadline passed',
                performedBy: null,
                performedAt: now
              }
            }
          }
        }
      })), { ordered: false });

      expiredCount += result.modifiedCount || 0;
    } catch (error) {
      console.error(`[SALES_ORDER_EXPIRY] ${company} failed:`, error.message);
    } finally {
      if (dbConnection && leaseAcquired) {
        try {
          await releaseCompanyLease(dbConnection);
        } catch (releaseError) {
          console.error(`[SALES_ORDER_EXPIRY] ${company} lease release failed:`, releaseError.message);
        }
      }
    }
  }

  if (expiredCount > 0) {
    console.log(`[SALES_ORDER_EXPIRY] Expired ${expiredCount} pending Sales Orders.`);
  }
  return { expiredCount };
};

export const startSalesOrderExpirationCron = () => {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('* * * * *', async () => {
    if (localRunInProgress) return;
    localRunInProgress = true;
    try {
      await runSalesOrderExpiration();
    } catch (error) {
      console.error('[SALES_ORDER_EXPIRY] Cron failed:', error);
    } finally {
      localRunInProgress = false;
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  console.log('[SALES_ORDER_EXPIRY] Scheduled every minute (IST) with a database lease.');
  return scheduledTask;
};

export default startSalesOrderExpirationCron;
