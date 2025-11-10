import express from 'express';
import {
  createNotification,
  createDealerNotification
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Create notification (general)
router.post('/', createNotification);

// Create notification for specific dealer
router.post('/dealer/:dealerId', createDealerNotification);

export default router;


