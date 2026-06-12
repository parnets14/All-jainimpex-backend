import express from 'express';
import { 
  generateBalanceSheet, 
  getBalanceSheetComparison,
  exportBalanceSheet,
  closeFinancialYear,
  getFinancialYearClosings,
  reopenFinancialYear
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

// ── Financial Year Closing (opening balance carry-forward) ──
router.get('/closings', logActivity("Balance Sheet", "Viewed financial year closings", "READ"), getFinancialYearClosings);
router.post('/close-year', logActivity("Balance Sheet", "Closed financial year", "CREATE"), closeFinancialYear);
router.delete('/close-year/:financialYear', logActivity("Balance Sheet", "Reopened financial year", "DELETE"), reopenFinancialYear);

export default router;
