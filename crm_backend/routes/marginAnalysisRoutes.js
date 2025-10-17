import express from 'express';
import { protect, requirePermission } from '../middleware/authMiddleware.js';
import { 
  getMarginAnalysisByCategory, 
  getMarginAnalysisByProduct, 
  getGrossMarginTrend 
} from '../controllers/marginAnalysisController.js';

const router = express.Router();

router.use(protect);

router.get('/category', requirePermission('marginAnalysis.read'), getMarginAnalysisByCategory);
router.get('/product', requirePermission('marginAnalysis.read'), getMarginAnalysisByProduct);
router.get('/gross-margin-trend', requirePermission('marginAnalysis.read'), getGrossMarginTrend);

export default router;
