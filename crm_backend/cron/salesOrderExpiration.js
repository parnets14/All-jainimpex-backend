import cron from 'node-cron';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { stockMovementSchema } from '../models/Stock.js';
import StockArrivalService from '../services/stockArrivalService.js';
import StockMovementService from '../services/stockMovementService.js';

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

const hasOutstandingReservations = async (StockMovement, salesOrder) => {
  const movements = await StockMovement.find({
    referenceType: 'SALE',
    $and: [
      {
        $or: [
          { salesOrder: salesOrder._id },
          { referenceNo: salesOrder.orderNumber }
        ]
      },
      {
        $or: [
          { movementRole: { $in: ['RESERVATION', 'RESERVATION_RELEASE'] } },
          {
            movementRole: null,
            remarks: { $regex: /(Stock Blocked|Stock(?: Fully)? Unblocked)/i }
          }
        ]
      }
    ]
  }).lean();

  const groups = new Map();
  for (const movement of movements) {
    const key = StockMovementService.stockKey(movement.productId, movement.warehouseId);
    const group = groups.get(key) || { blocked: 0, released: 0 };
    const isReservation = movement.movementRole === 'RESERVATION'
      || (!movement.movementRole
        && movement.type === 'OUT'
        && /Stock Blocked/i.test(String(movement.remarks || '')));
    const isRelease = movement.movementRole === 'RESERVATION_RELEASE'
      || (!movement.movementRole
        && movement.type === 'IN'
        && /Stock(?: Fully)? Unblocked/i.test(String(movement.remarks || '')));
    if (isReservation) group.blocked += Number(movement.quantity || 0);
    if (isRelease) group.released += Number(movement.quantity || 0);
    groups.set(key, group);
  }

  return [...groups.values()].some((group) => group.blocked > group.released);
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
      const StockMovement = dbConnection.models.StockMovement
        || dbConnection.model('StockMovement', stockMovementSchema);
      const expiredCandidates = await SalesOrder.find({
        expiryDate: { $lt: now },
        isExpired: false,
        status: 'Pending'
      })
        .select('_id orderNumber expiryDate')
        .lean();

      if (expiredCandidates.length === 0) continue;

      let companyExpiredCount = 0;
      for (const order of expiredCandidates) {
        let orderLease = null;
        try {
          orderLease = await StockMovementService.acquireStockLeases(
            dbConnection,
            [`SALES_ORDER:${order._id}`]
          );

          const hasReservation = await hasOutstandingReservations(
            StockMovement,
            order
          );
          if (hasReservation) {
            console.warn(`[SALES_ORDER_EXPIRY] Skipping ${order._id}: unresolved reservation exists.`);
            continue;
          }

          const expiredOrder = await SalesOrder.findOneAndUpdate(
            {
              _id: order._id,
              expiryDate: { $lt: now },
              isExpired: false,
              status: 'Pending'
            },
            {
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
            },
            { new: true, runValidators: true }
          );
          if (expiredOrder) companyExpiredCount++;
        } finally {
          if (orderLease) {
            try {
              await StockMovementService.releaseStockLeases(dbConnection, orderLease);
            } catch (releaseError) {
              console.error(`[SALES_ORDER_EXPIRY] ${company} order lease release failed:`, releaseError.message);
            }
          }
        }
      }

      expiredCount += companyExpiredCount;
      if (companyExpiredCount > 0) {
        await StockArrivalService.refreshAllPendingOrders(dbConnection);
      }
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
