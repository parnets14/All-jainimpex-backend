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
  requestDeliveryOTP,
  verifyDeliveryOTP,
  completeDelivery,
  rescheduleDelivery,
  failDelivery,
  uploadPOD,
  adminConfirmDelivery,
  adminRejectDelivery,
  adminHandleFailed,
} from '../controllers/deliveryExecutionController.js';
import { protect } from '../middleware/protect.js';
import { protect as protectAdmin } from '../../middleware/authMiddleware.js';
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// ─── Assignment routes (Admin/Web) ───────────────────────────
router.get('/all', protectAdmin, attachDeModels, getAllAssignments);
router.get('/confirmed-orders', protect, attachDeModels, getConfirmedOrders);
router.get('/executives', protect, attachDeModels, getDeliveryExecutives);
router.post('/assign', protect, attachDeModels, assignOrders);
router.get('/my-assignments', protect, attachDeModels, getMyAssignments);
router.put('/assignment/:assignmentId/status', protect, attachDeModels, updateAssignmentStatus);
router.get('/active-executives', protect, attachDeModels, getActiveExecutives);
router.post('/location', protect, attachDeModels, updateLocation);
router.post('/optimize-route', protect, attachDeModels, optimizeRoute);
router.put('/:assignmentId/reassign', protect, attachDeModels, reassignDelivery);

// ─── Admin: Cancel assignment ────────────────────────────────
router.delete('/assignment/:assignmentId/cancel', protectAdmin, attachDeModels, async (req, res) => {
  try {
    const { DeliveryAssignment, SalesOrder } = req.deModels;
    const { assignmentId } = req.params;

    const assignment = await DeliveryAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Only allow cancel if not already delivered
    if (assignment.status === 'delivered' && assignment.adminConfirmed) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a confirmed delivery' });
    }

    // Revert SalesOrder to Confirmed (back in pool)
    await SalesOrder.findByIdAndUpdate(assignment.salesOrder, { status: 'Confirmed' });

    // Delete the assignment
    await DeliveryAssignment.findByIdAndDelete(assignmentId);

    res.json({ success: true, message: 'Assignment cancelled. Order is back in the assignment pool.' });
  } catch (error) {
    console.error('Cancel assignment error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel assignment', error: error.message });
  }
});

// ─── Delivery execution routes (Executive App) ───────────────
router.post('/assignment/:assignmentId/request-otp', protect, attachDeModels, requestDeliveryOTP);
router.post('/assignment/:assignmentId/verify-otp', protect, attachDeModels, verifyDeliveryOTP);
router.post('/assignment/:assignmentId/complete', protect, attachDeModels, uploadPOD, completeDelivery);
router.post('/assignment/:assignmentId/reschedule', protect, attachDeModels, rescheduleDelivery);
router.post('/assignment/:assignmentId/fail', protect, attachDeModels, uploadPOD, failDelivery);

// ─── Admin confirmation routes (Web CRM) ─────────────────────
router.post('/assignment/:assignmentId/admin-confirm', protectAdmin, attachDeModels, adminConfirmDelivery);
router.post('/assignment/:assignmentId/admin-reject', protectAdmin, attachDeModels, adminRejectDelivery);
router.post('/assignment/:assignmentId/admin-handle-failed', protectAdmin, attachDeModels, adminHandleFailed);

export default router;
