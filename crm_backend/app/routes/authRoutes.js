import express from 'express';
import {
  loginDealer,
  getDealerProfile,
  logoutDealer,
  verifyOTP,
  sendOTP
} from '../controllers/authController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate, loginSchema } from '../../validators/authValidator.js';

const router = express.Router();

// Public routes
router.post('/login', authLimiter, validate(loginSchema), loginDealer);
router.post('/send-otp', authLimiter, sendOTP);
router.post('/verify-otp', authLimiter, verifyOTP);

// Protected routes
router.use(protect);
router.get('/me', getDealerProfile);
router.post('/logout', logoutDealer);

export default router;



