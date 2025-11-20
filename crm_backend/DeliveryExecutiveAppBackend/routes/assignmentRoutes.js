import express from 'express';
const router = express.Router();
import {
  assignOrders,
  getMyAssignments,
  getAllAssignments,
  updateAssignmentStatus,
  getActiveExecutives,
  updateLocation,
  getConfirmedOrders,
  getDeliveryExecutives,
  optimizeRoute,
  reassignDelivery,
} from '../controllers/assignmentController.js';
import {
  verifyDeliveryOTP,
  completeDelivery,
  rescheduleDelivery,
  failDelivery,
  uploadPOD,
} from '../controllers/deliveryExecutionController.js';
import { protect } from '../middleware/protect.js';
import { protect as protectAdmin } from '../../middleware/authMiddleware.js';

// Assignment routes
// Admin/Web routes - protected with main CRM auth middleware
// Note: This route is for web/admin access, so it uses the main CRM's protect middleware
router.get('/all', protectAdmin, getAllAssignments);
router.get('/confirmed-orders', protect, getConfirmedOrders);
router.get('/executives', protect, getDeliveryExecutives);
router.post('/assign', protect, assignOrders);
router.get('/my-assignments', protect, getMyAssignments);
router.put('/assignment/:assignmentId/status', protect, updateAssignmentStatus);
router.get('/active-executives', protect, getActiveExecutives);
router.post('/location', protect, updateLocation);
router.post('/optimize-route', protect, optimizeRoute);
router.put('/:assignmentId/reassign', protect, reassignDelivery);

// Delivery execution routes
router.post('/assignment/:assignmentId/verify-otp', protect, verifyDeliveryOTP);
router.post('/assignment/:assignmentId/complete', protect, uploadPOD, completeDelivery);
router.post('/assignment/:assignmentId/reschedule', protect, rescheduleDelivery);
router.post('/assignment/:assignmentId/fail', protect, failDelivery);

export default router;
