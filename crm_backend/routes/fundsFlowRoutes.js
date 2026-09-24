import express from 'express';
import { getFundsFlow } from '../controllers/fundsFlowController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('Funds Flow', 'Viewed funds flow', 'READ'), getFundsFlow);

export default router;
