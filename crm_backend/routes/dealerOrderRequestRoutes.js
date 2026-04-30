import express from 'express';
import {
  listOrderRequests,
  getOrderRequest,
  approveOrderRequest,
  rejectOrderRequest,
  linkSalesOrder,
  autoLinkSalesOrders,
  getPrefillData,
} from '../controllers/dealerOrderRequestController.js';
import { protect } from '../middleware/authMiddleware.js';
import { generalLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
router.use(generalLimiter);
router.use(protect);

router.get('/',                      listOrderRequests);
router.get('/:id',                   getOrderRequest);
router.patch('/:id/approve',         approveOrderRequest);
router.patch('/:id/reject',          rejectOrderRequest);
router.patch('/:id/link-so',         linkSalesOrder);
router.post('/:id/auto-link',        autoLinkSalesOrders);
router.get('/:id/prefill',           getPrefillData);

export default router;
