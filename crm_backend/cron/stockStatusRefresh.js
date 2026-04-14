import cron from 'node-cron';
import { salesOrderSchema } from '../models/SalesOrder.js';
import StockArrivalService from '../services/stockArrivalService.js';
import { getCompanyConnection } from '../config/multiDatabase.js';

// Auto-refresh stock status for all waiting/partial orders
// Runs every 3 hours: 0:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00 IST
export const runStockStatusRefresh = async () => {
  console.log('🔄 [STOCK_CRON] Starting auto stock status refresh...');

  try {
    // Get all company database connections
    const companies = ['jain-impex', 'ridhi', 'shree-jain-impex'];
    let totalUpdated = 0;
    let totalErrors = 0;
    let totalOrders = 0;

    for (const company of companies) {
      try {
        const dbConnection = getCompanyConnection(company);
        if (!dbConnection) {
          console.error(`❌ [STOCK_CRON] No connection found for company: ${company}`);
          continue;
        }

        const SalesOrder = dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema);

        // Find all pending/confirmed orders with waiting or partial stock
        const orders = await SalesOrder.find({
          status: { $in: ['Pending', 'Confirmed', 'Processing'] },
          $or: [
            { 'orderStockStatus.overallStatus': 'waiting' },
            { 'orderStockStatus.overallStatus': 'partial' },
            { 'orderStockStatus.overallStatus': 'unknown' },
            { isOutOfStock: true, stockAvailable: { $ne: true } }
          ]
        }).select('_id orderNumber');

        if (orders.length === 0) {
          console.log(`✅ [STOCK_CRON] No orders need stock status refresh for ${company}.`);
          continue;
        }

        console.log(`🔄 [STOCK_CRON] Refreshing stock status for ${orders.length} orders in ${company}...`);

        let updated = 0;
        let errors = 0;

        for (const order of orders) {
          try {
            await StockArrivalService.checkOrderStockStatus(order._id, dbConnection);
            updated++;
          } catch (err) {
            errors++;
            console.error(`❌ [STOCK_CRON] Failed for order ${order.orderNumber} in ${company}:`, err.message);
          }
        }

        console.log(`✅ [STOCK_CRON] ${company}: ${updated} updated, ${errors} errors out of ${orders.length} orders.`);
        totalUpdated += updated;
        totalErrors += errors;
        totalOrders += orders.length;
      } catch (companyError) {
        console.error(`❌ [STOCK_CRON] Error processing company ${company}:`, companyError);
      }
    }

    console.log(`✅ [STOCK_CRON] Total: ${totalUpdated} updated, ${totalErrors} errors out of ${totalOrders} orders across all companies.`);
    return { updated: totalUpdated, errors: totalErrors, total: totalOrders };
  } catch (error) {
    console.error('❌ [STOCK_CRON] Fatal error during stock status refresh:', error);
    throw error;
  }
};

const scheduleStockStatusRefresh = () => {
  // Every 3 hours at minute 0: 0,3,6,9,12,15,18,21
  cron.schedule('0 */3 * * *', async () => {
    try {
      await runStockStatusRefresh();
    } catch (error) {
      console.error('❌ [STOCK_CRON] Cron job error:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  console.log('🕒 [STOCK_CRON] Stock status auto-refresh scheduled (every 3 hours IST)');
};

export default scheduleStockStatusRefresh;
