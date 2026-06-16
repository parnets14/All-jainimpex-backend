import express from 'express';
import { getGSTR1, getHSNSummary, getGSTR3B } from '../controllers/gstReportController.js';
import { reconcileGSTR2B } from '../controllers/gstr2bController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/gstr1', logActivity('GST Reports', 'Viewed GSTR-1', 'READ'), getGSTR1);
router.get('/hsn-summary', logActivity('GST Reports', 'Viewed HSN summary', 'READ'), getHSNSummary);
router.get('/gstr3b', logActivity('GST Reports', 'Viewed GSTR-3B', 'READ'), getGSTR3B);
router.post('/gstr2b-reconcile', logActivity('GST Reports', 'Reconciled GSTR-2B', 'READ'), reconcileGSTR2B);

export default router;
