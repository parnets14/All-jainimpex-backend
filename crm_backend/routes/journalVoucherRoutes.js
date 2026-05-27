import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import {
  createJournalVoucher,
  getJournalVouchers,
  getJournalVoucherById,
  cancelJournalVoucher
} from '../controllers/journalVoucherController.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity("Journal Voucher", "Viewed journal vouchers list", "READ"), getJournalVouchers);
router.post('/', logActivity("Journal Voucher", "Created new journal voucher", "CREATE"), createJournalVoucher);
router.get('/:id', logActivity("Journal Voucher", "Viewed journal voucher details", "READ"), getJournalVoucherById);
router.patch('/:id/cancel', logActivity("Journal Voucher", "Cancelled journal voucher", "UPDATE"), cancelJournalVoucher);

export default router;
