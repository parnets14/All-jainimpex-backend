import express from 'express';
import {
  getMyOrders,
  getOrderDetails,
  createOrder,
  cancelOrder,
  getOrderHistory
} from '../controllers/orderController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get dealer's orders
router.get('/', getMyOrders);

// Get order history
router.get('/history', getOrderHistory);

// Get single order details
router.get('/:id', getOrderDetails);

// Create new order
router.post('/', createOrder);

// Cancel order (if allowed)
router.patch('/:id/cancel', cancelOrder);

export default router;



