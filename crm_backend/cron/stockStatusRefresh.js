import cron from 'node-cron';
import StockArrivalService from '../services/stockArrivalService.js';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';

// Rebuild the FIFO virtual allocation for every Pending Sales Order. Confirmed
// and Processing orders already own physical reservations and are intentionally
// excluded by StockArrivalService.
export const runStockStatusRefresh = async () => {
  console.log('🔄 [STOCK_CRON] Starting FIFO stock status refresh...');

  let totalUpdated = 0;
  let totalErrors = 0;
  let totalOrders = 0;

  for (const company of getValidCompanies()) {
    try {
      const dbConnection = getCompanyConnection(company);
      if (!dbConnection) {
        totalErrors++;
        console.error(`❌ [STOCK_CRON] No connection found for company: ${company}`);
        continue;
      }

      const result = await StockArrivalService.refreshAllPendingOrders(dbConnection);
      totalUpdated += result.ordersUpdated;
      totalOrders += result.ordersChecked;
      console.log(
        `✅ [STOCK_CRON] ${company}: ${result.ordersUpdated} updated out of ${result.ordersChecked} Pending orders.`
      );
    } catch (error) {
      totalErrors++;
      console.error(`❌ [STOCK_CRON] Error processing ${company}:`, error.message);
    }
  }

  console.log(
    `✅ [STOCK_CRON] Total: ${totalUpdated} updated, ${totalErrors} company errors, ${totalOrders} Pending orders checked.`
  );
  return { updated: totalUpdated, errors: totalErrors, total: totalOrders };
};

const scheduleStockStatusRefresh = () => {
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

  console.log('🕒 [STOCK_CRON] FIFO stock status refresh scheduled (every 3 hours IST)');
};

export default scheduleStockStatusRefresh;
