import express from 'express';
import { login, verifyOTP, getProfile, logout } from '../controllers/authController.js';
import { protect, isDeliveryExecutive } from '../middleware/protect.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/verify-otp', verifyOTP);

// Protected routes
router.get('/me', protect, isDeliveryExecutive, getProfile);
router.post('/logout', protect, isDeliveryExecutive, logout);

// FCM token save
router.post('/fcm-token', protect, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'FCM token required' });
    
    const { getCompanyConnection } = await import('../../config/multiDatabase.js');
    const { userSchema } = await import('../../models/User.js');
    const company = req.company || 'jain-impex';
    const db = getCompanyConnection(company);
    const User = db.models.User || db.model('User', userSchema);
    
    await User.findByIdAndUpdate(req.user.userId || req.user._id, { fcmToken });
    res.json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    console.error('Save FCM token error:', error);
    res.status(500).json({ success: false, message: 'Failed to save token' });
  }
});

export default router;
