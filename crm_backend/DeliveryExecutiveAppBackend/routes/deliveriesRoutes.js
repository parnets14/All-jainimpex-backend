import express from 'express';
const router = express.Router();
import { getMyAssignments } from '../controllers/assignmentController.js';
import { protect } from '../middleware/protect.js';

// Mobile app route - /deliveries/today
router.get('/today', protect, (req, res, next) => {
  req.query.date = new Date().toISOString().split('T')[0]; // Set today's date
  return getMyAssignments(req, res, next);
});

export default router;




