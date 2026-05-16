import express from 'express';
const router = express.Router();
import {
  getDeliveryHistory,
  getDeliveryHistoryStats,
  getDeliveryById,
} from '../controllers/deliveryHistoryController.js';
import { protect } from '../middleware/protect.js';
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// Admin/Web routes (no protect for admin access - handled by main server)
// Must come before parameterized routes
router.get('/all', attachDeModels, getDeliveryHistory);
router.get('/stats/all', attachDeModels, getDeliveryHistoryStats);

// Mobile App routes (protected) - must come before parameterized routes
router.get('/history', protect, getDeliveryHistory); // Mobile app uses /deliveries/history
router.get('/stats', protect, getDeliveryHistoryStats);
router.get('/', protect, getDeliveryHistory);

// Parameterized routes (must come last)
router.get('/:deliveryId', protect, getDeliveryById);

export default router;

