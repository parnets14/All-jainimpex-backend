import express from 'express';
import * as voucherController from '../controllers/voucherController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Receipt Voucher
router.post('/receipt', voucherController.createReceiptVoucher);

// Payment Voucher
router.post('/payment', voucherController.createPaymentVoucher);

// Contra Voucher
router.post('/contra', voucherController.createContraVoucher);

// Get all vouchers with filters
router.get('/', voucherController.getVouchers);

// Get current balances (cash and bank)
router.get('/balances', voucherController.getBalances);

// Get cash split preview (before creating voucher)
router.get('/cash-split-preview', voucherController.getCashSplitPreview);

// Get unadjusted vouchers (for payment allocation)
router.get('/unadjusted', voucherController.getUnadjustedVouchers);

// Get voucher by ID
router.get('/:id', voucherController.getVoucherById);

// Cancel voucher
router.delete('/:id', voucherController.cancelVoucher);

export default router;
