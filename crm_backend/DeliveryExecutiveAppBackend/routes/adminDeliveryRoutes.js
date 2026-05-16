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
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// Admin routes for delivery management
router.get('/pending-reschedules', protect, attachDeModels, getPendingReschedules);
router.post('/assignment/:assignmentId/approve-reschedule', protect, attachDeModels, approveReschedule);
router.post('/assignment/:assignmentId/reject-reschedule', protect, attachDeModels, rejectReschedule);
router.put('/assignment/:assignmentId/edit-reschedule-date', protect, attachDeModels, editRescheduleDate);
router.get('/failed-deliveries', protect, attachDeModels, getFailedDeliveries);
router.post('/assignment/:assignmentId/reassign', protect, attachDeModels, reassignDelivery);

export default router;
