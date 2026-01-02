import express from 'express';
const router = express.Router();
import {
  getPendingReschedules,
  approveReschedule,
  rejectReschedule,
  getFailedDeliveries,
  reassignDelivery,
  editRescheduleDate
} from '../controllers/adminDeliveryController.js';
import { protect } from '../../middleware/authMiddleware.js';

// Admin routes for delivery management
router.get('/pending-reschedules', protect, getPendingReschedules);
router.post('/assignment/:assignmentId/approve-reschedule', protect, approveReschedule);
router.post('/assignment/:assignmentId/reject-reschedule', protect, rejectReschedule);
router.put('/assignment/:assignmentId/edit-reschedule-date', protect, editRescheduleDate);
router.get('/failed-deliveries', protect, getFailedDeliveries);
router.post('/assignment/:assignmentId/reassign', protect, reassignDelivery);

export default router;
