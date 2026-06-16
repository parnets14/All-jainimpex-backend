import express from 'express';
import { getReceivablesAging, getPayablesAging } from '../controllers/agingReportController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/receivables', logActivity('Aging Report', 'Viewed receivables aging', 'READ'), getReceivablesAging);
router.get('/payables', logActivity('Aging Report', 'Viewed payables aging', 'READ'), getPayablesAging);

export default router;
