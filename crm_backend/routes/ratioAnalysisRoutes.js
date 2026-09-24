import express from 'express';
import { getRatioAnalysis } from '../controllers/ratioAnalysisController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('Ratio Analysis', 'Viewed ratio analysis', 'READ'), getRatioAnalysis);

export default router;
