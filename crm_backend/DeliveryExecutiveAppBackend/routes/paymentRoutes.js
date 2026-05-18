import express from 'express';
const router = express.Router();
import {
  createPayment,
  getTodayPayments,
  getPaymentHistory,
  getPaymentById,
  getAllCollections,
  verifyPayment,
  uploadPaymentFiles,
} from '../controllers/paymentController.js';
import { protect } from '../middleware/protect.js';
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// Admin/Web routes (no protect for admin access - handled by main server)
router.get('/all', attachDeModels, getAllCollections);
router.put('/:paymentId/verify', attachDeModels, verifyPayment);

// Mobile App routes (protected)
router.post('/', protect, uploadPaymentFiles, createPayment);
router.post('/skip', protect, attachDeModels, async (req, res) => {
  try {
    const { DeliveryAssignment } = req.deModels;
    const { deliveryAssignment, skipReason } = req.body;

    if (!deliveryAssignment || !skipReason) {
      return res.status(400).json({ success: false, message: 'Assignment ID and skip reason are required' });
    }

    const assignment = await DeliveryAssignment.findById(deliveryAssignment);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Mark payment as skipped with reason
    assignment.paymentSkipped = true;
    assignment.paymentSkipReason = skipReason;
    assignment.paymentSkippedAt = new Date();
    await assignment.save();

    console.log(`⏭️ Payment collection skipped for assignment ${deliveryAssignment}: ${skipReason}`);

    res.json({ success: true, message: 'Collection skipped', data: { skipReason } });
  } catch (error) {
    console.error('Skip collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to skip collection', error: error.message });
  }
});
router.get('/today', protect, getTodayPayments);
router.get('/history', protect, getPaymentHistory);
router.get('/:paymentId', protect, getPaymentById);

export default router;


