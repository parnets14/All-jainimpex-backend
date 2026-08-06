import express from 'express';
import {
  createDealerTurnoverDiscount,
  getDealerTurnoverDiscounts,
  getDealerTurnoverDiscount,
  updateDealerTurnoverDiscount,
  deleteDealerTurnoverDiscount,
  getDealerTurnoverProgress,
} from '../controllers/dealerTurnoverDiscountController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);

router.post('/',         logActivity('Dealer Turnover', 'Created dealer turnover discount',  'CREATE'), createDealerTurnoverDiscount);
router.get('/',          logActivity('Dealer Turnover', 'Viewed dealer turnover discounts',  'READ'),   getDealerTurnoverDiscounts);
router.get('/progress',  logActivity('Dealer Turnover', 'Viewed dealer turnover progress',   'READ'),   getDealerTurnoverProgress);
router.get('/:id',       logActivity('Dealer Turnover', 'Viewed dealer turnover discount',   'READ'),   getDealerTurnoverDiscount);
router.put('/:id',       logActivity('Dealer Turnover', 'Updated dealer turnover discount',  'UPDATE'), updateDealerTurnoverDiscount);
router.delete('/:id',    logActivity('Dealer Turnover', 'Deleted dealer turnover discount',  'DELETE'), deleteDealerTurnoverDiscount);

export default router;
