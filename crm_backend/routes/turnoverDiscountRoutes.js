import express from 'express';
import {
  createTurnoverDiscount,
  getTurnoverDiscounts,
  getTurnoverDiscount,
  updateTurnoverDiscount,
  deleteTurnoverDiscount,
  getTurnoverProgress,
  resetTurnoverNotifications,
} from '../controllers/turnoverDiscountController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.post('/', logActivity('Turnover Discount', 'Created turnover discount', 'CREATE'), createTurnoverDiscount);
router.get('/', logActivity('Turnover Discount', 'Viewed turnover discounts', 'READ'), getTurnoverDiscounts);
router.get('/progress', logActivity('Turnover Discount', 'Viewed turnover progress', 'READ'), getTurnoverProgress);
router.post('/reset-notifications', logActivity('Turnover Discount', 'Reset turnover notifications', 'UPDATE'), resetTurnoverNotifications);
router.get('/:id', logActivity('Turnover Discount', 'Viewed turnover discount', 'READ'), getTurnoverDiscount);
router.put('/:id', logActivity('Turnover Discount', 'Updated turnover discount', 'UPDATE'), updateTurnoverDiscount);
router.delete('/:id', logActivity('Turnover Discount', 'Deleted turnover discount', 'DELETE'), deleteTurnoverDiscount);

export default router;
