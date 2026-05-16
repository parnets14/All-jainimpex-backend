import express from 'express';
const router = express.Router();
import {
  getAllRoutePlans,
  getRoutePlanById,
  getTodayRoutePlan,
  startRoute,
  endRoute,
  createRoutePlanFromAssignments,
} from '../controllers/routePlanController.js';
import { protect } from '../middleware/protect.js';
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// Admin/Web routes (no protect for admin access - handled by main server)
// Must come before parameterized routes
router.get('/all', attachDeModels, getAllRoutePlans);
router.post('/create', attachDeModels, createRoutePlanFromAssignments);

// Mobile App routes (protected) - must come before parameterized routes
router.get('/today', protect, attachDeModels, getTodayRoutePlan);
router.post('/start', protect, attachDeModels, startRoute);
router.post('/end', protect, attachDeModels, endRoute);

// Parameterized routes (must come last)
router.get('/:routeId', attachDeModels, getRoutePlanById);

export default router;

