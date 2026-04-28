import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import {
  updateDealerProfile,
  getDealerProfile,
  uploadProfileImage,
  saveFcmToken,
} from '../controllers/dealerController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get dealer profile
router.get('/profile', getDealerProfile);

// Update dealer profile (name and image only)
router.put('/profile', uploadProfileImage, updateDealerProfile);

// Save FCM token for push notifications
router.post('/fcm-token', saveFcmToken);

export default router;

