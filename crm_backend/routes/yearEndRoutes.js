import express from 'express';
import { getYearEndChecklist, toggleChecklistItem } from '../controllers/yearEndController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

router.get('/checklist', logActivity('YearEnd', 'Viewed year-end checklist', 'READ'), getYearEndChecklist);
router.patch('/checklist/:key', logActivity('YearEnd', 'Updated year-end checklist item', 'UPDATE'), toggleChecklistItem);

export default router;
