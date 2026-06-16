import express from 'express';
import {
  getReconciliation,
  toggleClearance,
  bulkClearance,
  saveStatement,
} from '../controllers/bankReconciliationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity('BankReconciliation', 'Viewed bank reconciliation', 'READ'), getReconciliation);
router.patch('/clear', logActivity('BankReconciliation', 'Marked transaction cleared', 'UPDATE'), toggleClearance);
router.patch('/clear-bulk', logActivity('BankReconciliation', 'Bulk cleared transactions', 'UPDATE'), bulkClearance);
router.patch('/statement', logActivity('BankReconciliation', 'Saved statement balance', 'UPDATE'), saveStatement);

export default router;
