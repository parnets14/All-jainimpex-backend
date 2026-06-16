import express from 'express';
import { createTDSEntry, getTDSEntries, depositTDS, getTDSSummary } from '../controllers/tdsController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/summary', logActivity('TDS', 'Viewed TDS summary', 'READ'), getTDSSummary);
router.route('/')
  .get(logActivity('TDS', 'Viewed TDS entries', 'READ'), getTDSEntries)
  .post(logActivity('TDS', 'Recorded TDS deduction', 'CREATE'), createTDSEntry);
router.patch('/:id/deposit', logActivity('TDS', 'Deposited TDS', 'UPDATE'), depositTDS);

export default router;
