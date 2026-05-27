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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();
router.use(generalLimiter);
router.use(protect);

router.get('/',                      logActivity("Dealer Order Request", "Viewed order requests list", "READ"), listOrderRequests);
router.get('/:id',                   logActivity("Dealer Order Request", "Viewed order request details", "READ"), getOrderRequest);
router.patch('/:id/approve',         logActivity("Dealer Order Request", "Approved order request", "UPDATE"), approveOrderRequest);
router.patch('/:id/reject',          logActivity("Dealer Order Request", "Rejected order request", "UPDATE"), rejectOrderRequest);
router.patch('/:id/link-so',         logActivity("Dealer Order Request", "Linked sales order", "UPDATE"), linkSalesOrder);
router.post('/:id/auto-link',        logActivity("Dealer Order Request", "Auto-linked sales orders", "UPDATE"), autoLinkSalesOrders);
router.get('/:id/prefill',           logActivity("Dealer Order Request", "Viewed prefill data", "READ"), getPrefillData);

export default router;
