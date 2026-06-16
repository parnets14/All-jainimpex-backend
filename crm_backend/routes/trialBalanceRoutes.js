import express from 'express';
import { getTrialBalance } from '../controllers/trialBalanceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('Trial Balance', 'Viewed trial balance', 'READ'), getTrialBalance);

export default router;
