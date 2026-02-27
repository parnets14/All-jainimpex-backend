import express from 'express';
import * as paymentAllocationController from '../controllers/paymentAllocationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Helper routes for allocation interface (must come before /:id route)
router.get('/outstanding-invoices', paymentAllocationController.getOutstandingInvoices);
router.get('/unadjusted-payments', paymentAllocationController.getUnadjustedPayments);

// Payment Allocation routes
router.post('/', paymentAllocationController.createPaymentAllocation);
router.get('/', paymentAllocationController.getPaymentAllocations);
router.get('/:id', paymentAllocationController.getPaymentAllocationById);

export default router;
