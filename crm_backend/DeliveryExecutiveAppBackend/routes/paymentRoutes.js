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
import { protect as protectAdmin } from '../../middleware/authMiddleware.js';
import { attachDeModels } from '../middleware/deCompanyMiddleware.js';

// Admin/Web routes use the main CRM token and the same tenant resolver.
router.get('/all', protectAdmin, attachDeModels, getAllCollections);
router.put('/:paymentId/verify', protectAdmin, attachDeModels, verifyPayment);

// Mobile App routes (protected)
router.post('/', protect, attachDeModels, uploadPaymentFiles, createPayment);
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
router.get('/today', protect, attachDeModels, getTodayPayments);
router.get('/history', protect, attachDeModels, getPaymentHistory);
router.get('/:paymentId', protect, attachDeModels, getPaymentById);

export default router;


