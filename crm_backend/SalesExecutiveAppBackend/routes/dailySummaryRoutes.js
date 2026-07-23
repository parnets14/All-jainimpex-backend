import express from 'express';
import { getDailySummaries, triggerGeneration } from '../controllers/dailySummaryController.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// All routes require admin auth
router.use(protectAdmin);

// GET /api/se/daily-summary?date=2026-07-23&userId=xxx
router.get('/', getDailySummaries);

// POST /api/se/daily-summary/generate — manually trigger for a date
router.post('/generate', triggerGeneration);

export default router;
