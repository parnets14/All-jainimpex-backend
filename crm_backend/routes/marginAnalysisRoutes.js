import express from 'express';
import { protect, requirePermission } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import { 
  getMarginAnalysisByCategory, 
  getMarginAnalysisByProduct, 
  getGrossMarginTrend 
} from '../controllers/marginAnalysisController.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/category', requirePermission('marginAnalysis.read'), logActivity("Margin Analysis", "Viewed margin analysis by category", "READ"), getMarginAnalysisByCategory);
router.get('/product', requirePermission('marginAnalysis.read'), logActivity("Margin Analysis", "Viewed margin analysis by product", "READ"), getMarginAnalysisByProduct);
router.get('/gross-margin-trend', requirePermission('marginAnalysis.read'), logActivity("Margin Analysis", "Viewed gross margin trend", "READ"), getGrossMarginTrend);

export default router;
