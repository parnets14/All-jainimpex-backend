import express from 'express';
import { protect, requirePermission } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { 
  getMarginAnalysisByCategory, 
  getMarginAnalysisByProduct, 
  getGrossMarginTrend 
} from '../controllers/marginAnalysisController.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/category', requirePermission('marginAnalysis.read'), getMarginAnalysisByCategory);
router.get('/product', requirePermission('marginAnalysis.read'), getMarginAnalysisByProduct);
router.get('/gross-margin-trend', requirePermission('marginAnalysis.read'), getGrossMarginTrend);

export default router;
