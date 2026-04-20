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

router.get('/', getStock);
router.get('/alerts', getStockAlerts);
router.get('/warehouses', getWarehouses);
router.get('/transfers', getStockTransfers);
router.get('/:productId/history', getStockHistory);
router.get('/:productId/debug', debugProductGRNs);
router.get('/debug-movements/:productId/:warehouseId', debugStockMovements);
router.post('/transfer', createStockTransfer);
router.post('/migrate', migrateStockMovements);
router.post('/recalculate-balances', recalculateStockBalances);

export default router;