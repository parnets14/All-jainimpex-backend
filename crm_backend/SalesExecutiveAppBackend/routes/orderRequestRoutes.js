import express from 'express';
import protect from '../middleware/protect.js';
import { createOrderRequest, getMyOrderRequests, deleteOrderRequest } from '../controllers/orderRequestController.js';

const router = express.Router();

router.post('/',      protect, createOrderRequest);
router.get('/',       protect, getMyOrderRequests);
router.delete('/:id', protect, deleteOrderRequest);

export default router;
