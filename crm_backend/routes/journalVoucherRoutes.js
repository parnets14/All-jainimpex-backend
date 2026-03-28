import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  createJournalVoucher,
  getJournalVouchers,
  getJournalVoucherById,
  cancelJournalVoucher
} from '../controllers/journalVoucherController.js';

const router = express.Router();

router.use(protect);

router.get('/', getJournalVouchers);
router.post('/', createJournalVoucher);
router.get('/:id', getJournalVoucherById);
router.patch('/:id/cancel', cancelJournalVoucher);

export default router;
