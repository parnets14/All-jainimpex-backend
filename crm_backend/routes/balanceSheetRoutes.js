import express from 'express';
import { 
  generateBalanceSheet, 
  getBalanceSheetComparison,
  exportBalanceSheet 
} from '../controllers/balanceSheetController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// Generate balance sheet
router.get('/generate', logActivity("Balance Sheet", "Generated balance sheet", "READ"), generateBalanceSheet);

// Get balance sheet comparison
router.get('/comparison', logActivity("Balance Sheet", "Viewed balance sheet comparison", "READ"), getBalanceSheetComparison);

// Export balance sheet
router.post('/export', logActivity("Balance Sheet", "Exported balance sheet", "READ"), exportBalanceSheet);

export default router;
