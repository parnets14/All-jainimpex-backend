import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import {
  createJournalVoucher,
  getJournalVouchers,
  getJournalVoucherById,
  cancelJournalVoucher
} from '../controllers/journalVoucherController.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', getJournalVouchers);
router.post('/', createJournalVoucher);
router.get('/:id', getJournalVoucherById);
router.patch('/:id/cancel', cancelJournalVoucher);

export default router;
