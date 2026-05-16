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
router.get('/today', protect, getTodayPayments);
router.get('/history', protect, getPaymentHistory);
router.get('/:paymentId', protect, getPaymentById);

export default router;


