import express from 'express';
import {
  getDayBook,
  getDayBookVoucher,
  getVoucherTypes,
} from '../controllers/dayBookController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('Day Book', 'Viewed day book', 'READ'), getDayBook);

// Declared before '/:id' so the literal path is not captured as an id
router.get('/voucher-types', getVoucherTypes);

router.get('/:id', logActivity('Day Book', 'Viewed voucher', 'READ'), getDayBookVoucher);

export default router;
