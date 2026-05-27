import express from 'express';
import {
  createNotification,
  createDealerNotification
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Create notification (general)
router.post('/', logActivity("Notifications", "Created notification", "CREATE"), createNotification);

// Create notification for specific dealer
router.post('/dealer/:dealerId', logActivity("Notifications", "Created dealer notification", "CREATE"), createDealerNotification);

export default router;


