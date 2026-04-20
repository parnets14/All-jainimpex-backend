import express from 'express';
import {
  createStockAdjustment,
  getStockAdjustments,
  getStockAdjustment,
  getProductStockAdjustments,
  getStockAdjustmentStats,
  deleteStockAdjustment
} from '../controllers/stockAdjustmentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

router.post('/', logActivity("Manual Stock Adjustment", "Created stock adjustment", "CREATE"), createStockAdjustment);
router.get('/', logActivity("Manual Stock Adjustment", "Viewed stock adjustments list", "READ"), getStockAdjustments);
router.get('/stats', logActivity("Manual Stock Adjustment", "Viewed stock adjustment statistics", "READ"), getStockAdjustmentStats);
router.get('/product/:productId', logActivity("Manual Stock Adjustment", "Viewed product stock adjustments", "READ"), getProductStockAdjustments);
router.get('/:id', logActivity("Manual Stock Adjustment", "Viewed stock adjustment details", "READ"), getStockAdjustment);
router.delete('/:id', logActivity("Manual Stock Adjustment", "Deleted stock adjustment", "DELETE"), deleteStockAdjustment);

export default router;