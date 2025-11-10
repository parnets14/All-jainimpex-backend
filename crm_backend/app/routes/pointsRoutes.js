import express from 'express';
import {
  getPointsSummary,
  getPointsHistory
} from '../controllers/pointsController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get points summary
router.get('/summary', getPointsSummary);

// Get points history
router.get('/history', getPointsHistory);

export default router;

