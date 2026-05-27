import express from 'express';
import * as voucherController from '../controllers/voucherController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Receipt Voucher
router.post('/receipt', logActivity("Voucher Entry", "Created receipt voucher", "CREATE"), voucherController.createReceiptVoucher);

// Payment Voucher
router.post('/payment', logActivity("Voucher Entry", "Created payment voucher", "CREATE"), voucherController.createPaymentVoucher);

// Contra Voucher
router.post('/contra', logActivity("Voucher Entry", "Created contra voucher", "CREATE"), voucherController.createContraVoucher);

// Get all vouchers with filters
router.get('/', logActivity("Voucher Entry", "Viewed vouchers list", "READ"), voucherController.getVouchers);

// Get current balances (cash and bank)
router.get('/balances', logActivity("Voucher Entry", "Viewed balances", "READ"), voucherController.getBalances);

// Get cash split preview (before creating voucher)
router.get('/cash-split-preview', logActivity("Voucher Entry", "Viewed cash split preview", "READ"), voucherController.getCashSplitPreview);

// Get unadjusted vouchers (for payment allocation)
router.get('/unadjusted', logActivity("Voucher Entry", "Viewed unadjusted vouchers", "READ"), voucherController.getUnadjustedVouchers);

// Get voucher by ID
router.get('/:id', logActivity("Voucher Entry", "Viewed voucher details", "READ"), voucherController.getVoucherById);

// Cancel voucher
router.delete('/:id', logActivity("Voucher Entry", "Cancelled voucher", "DELETE"), voucherController.cancelVoucher);

export default router;
