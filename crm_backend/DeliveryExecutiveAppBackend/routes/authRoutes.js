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

export default router;
