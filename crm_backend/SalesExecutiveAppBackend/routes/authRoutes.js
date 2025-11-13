import express from 'express';
import {
  login,
  verifyOTP,
  getMe,
  logout,
} from '../controllers/authController.js';
import protect from '../middleware/protect.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/verify-otp', verifyOTP);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export default router;
