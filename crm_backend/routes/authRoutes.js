// routes/authRoutes.js
import express from 'express';
import { 
  login, 
  getCurrentUser, 
  logout, 
  checkAuth 
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate, loginSchema } from '../validators/authValidator.js';

const router = express.Router();

// Public routes
router.post('/login', validate(loginSchema), login);

// Protected routes
router.use(protect);
router.get('/me', getCurrentUser);
router.post('/logout', logout);
router.get('/check-auth', checkAuth);

export default router;