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

// Admin/Web routes (no protect for admin access - handled by main server)
// Must come before parameterized routes
router.get('/all', getAllRoutePlans);
router.post('/create', createRoutePlanFromAssignments);

// Mobile App routes (protected) - must come before parameterized routes
router.get('/today', protect, getTodayRoutePlan);
router.post('/start', protect, startRoute);
router.post('/end', protect, endRoute);

// Parameterized routes (must come last)
router.get('/:routeId', getRoutePlanById);

export default router;

