import express from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrderStats
} from '../controllers/purchaseOrderController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Purchase Order Routes
router.post('/', createPurchaseOrder);
router.get('/', getPurchaseOrders);
router.get('/stats', getPurchaseOrderStats);
router.get('/:id', getPurchaseOrderById);
router.put('/:id', updatePurchaseOrder);
router.patch('/:id/status', updatePurchaseOrderStatus);
router.delete('/:id', deletePurchaseOrder);

export default router;