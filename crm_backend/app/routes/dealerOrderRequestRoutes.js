import express from 'express';
import {
  createOrderRequest,
  getMyOrderRequests,
  getOrderRequestDetail,
} from '../controllers/dealerOrderRequestController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();
router.use(generalLimiter);
router.use(protect);

router.post('/',     createOrderRequest);
router.get('/',      getMyOrderRequests);
router.get('/:id',   getOrderRequestDetail);

export default router;
