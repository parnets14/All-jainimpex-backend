import express from 'express';
import {
  logPostCheckoutActivity,
  getPostCheckoutActivities,
  getTrackingStatus,
} from '../controllers/postCheckoutActivityController.js';
import protect from '../middleware/protect.js';
import protectAdmin from '../middleware/protectAdmin.js';

const router = express.Router();

// Admin route — view all post-checkout activities
router.get('/', protectAdmin, getPostCheckoutActivities);

// SE routes
router.use(protect);

// SE logs a post-checkout app open
router.post('/', logPostCheckoutActivity);

// SE asks if tracking should be active (used on app start/resume)
router.get('/tracking-status', getTrackingStatus);

export default router;
