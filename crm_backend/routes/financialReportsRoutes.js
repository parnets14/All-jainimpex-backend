import express from 'express';
import {
  getProfitLoss,
  getGeneralLedger,
  getLedgerAccounts,
} from '../controllers/financialReportsController.js';
import { getBooksHealthCheck } from '../controllers/booksHealthController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/profit-loss', logActivity('Profit & Loss', 'Viewed P&L statement', 'READ'), getProfitLoss);
router.get('/general-ledger', logActivity('General Ledger', 'Viewed general ledger', 'READ'), getGeneralLedger);
router.get('/ledger-accounts', getLedgerAccounts);
router.get('/health-check', logActivity('Books Health Check', 'Ran books health check', 'READ'), getBooksHealthCheck);

export default router;
