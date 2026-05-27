import express from 'express';
import {
  getStock,
  getStockHistory,
  getStockAlerts,
  migrateStockMovements,
  debugProductGRNs,
  createStockTransfer,
  getStockTransfers,
  getWarehouses,
  testStockSeparation,
  debugStockCalculation,
  testGRNStructure,
  debugStockMovements,
  debugWarehouses,
  debugTransfers,
  recalculateStockBalances
} from '../controllers/stockController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);
// Test endpoints without auth (temporary)
router.post('/migrate-test', migrateStockMovements);
router.get('/test-separation', testStockSeparation);
router.get('/debug-calculation/:productId', debugStockCalculation);
router.get('/test-grn-structure', testGRNStructure);
router.get('/debug-warehouses', debugWarehouses);
router.get('/debug-transfers', debugTransfers);
router.post('/recalculate-balances-test', recalculateStockBalances);

router.use(protect);

router.get('/', logActivity("Stock Management", "Viewed stock list", "READ"), getStock);
router.get('/alerts', logActivity("Stock Management", "Viewed stock alerts", "READ"), getStockAlerts);
router.get('/warehouses', logActivity("Stock Management", "Viewed warehouses", "READ"), getWarehouses);
router.get('/transfers', logActivity("Stock Management", "Viewed stock transfers", "READ"), getStockTransfers);
router.get('/:productId/history', logActivity("Stock Management", "Viewed stock history", "READ"), getStockHistory);
router.get('/:productId/debug', debugProductGRNs);
router.get('/debug-movements/:productId/:warehouseId', debugStockMovements);
router.post('/transfer', logActivity("Stock Management", "Created stock transfer", "CREATE"), createStockTransfer);
router.post('/migrate', logActivity("Stock Management", "Migrated stock movements", "CREATE"), migrateStockMovements);
router.post('/recalculate-balances', logActivity("Stock Management", "Recalculated stock balances", "UPDATE"), recalculateStockBalances);

export default router;