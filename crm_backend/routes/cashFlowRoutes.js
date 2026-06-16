import express from 'express';
import { getCashFlow } from '../controllers/cashFlowController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('CashFlow', 'Viewed cash flow statement', 'READ'), getCashFlow);

export default router;
