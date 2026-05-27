import express from 'express';
import * as paymentAllocationController from '../controllers/paymentAllocationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Helper routes for allocation interface (must come before /:id route)
router.get('/outstanding-invoices', logActivity("Payment Allocation", "Viewed outstanding invoices", "READ"), paymentAllocationController.getOutstandingInvoices);
router.get('/unadjusted-payments', logActivity("Payment Allocation", "Viewed unadjusted payments", "READ"), paymentAllocationController.getUnadjustedPayments);

// Auto-allocate route
router.post('/auto-allocate', logActivity("Payment Allocation", "Auto-allocated payments", "CREATE"), paymentAllocationController.autoAllocatePayments);

// Payment Allocation routes
router.post('/', logActivity("Payment Allocation", "Created payment allocation", "CREATE"), paymentAllocationController.createPaymentAllocation);
router.get('/', logActivity("Payment Allocation", "Viewed payment allocations list", "READ"), paymentAllocationController.getPaymentAllocations);
router.get('/:id', logActivity("Payment Allocation", "Viewed payment allocation details", "READ"), paymentAllocationController.getPaymentAllocationById);

export default router;
