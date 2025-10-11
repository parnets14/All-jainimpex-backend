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
  testGRNStructure
} from '../controllers/stockController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Test endpoints without auth (temporary)
router.post('/migrate-test', migrateStockMovements);
router.get('/test-separation', testStockSeparation);
router.get('/debug-calculation/:productId', debugStockCalculation);
router.get('/test-grn-structure', testGRNStructure);

router.use(protect);

router.get('/', getStock);
router.get('/alerts', getStockAlerts);
router.get('/warehouses', getWarehouses);
router.get('/transfers', getStockTransfers);
router.get('/:productId/history', getStockHistory);
router.get('/:productId/debug', debugProductGRNs);
router.post('/transfer', createStockTransfer);
router.post('/migrate', migrateStockMovements);

export default router;