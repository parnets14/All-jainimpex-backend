import express from 'express';
import {
  getAllCollections,
  getCollectionByIdAdmin,
  approveCollection,
  rejectCollection,
  getCollectionStats,
  createVoucherFromCollection
} from '../controllers/collectionController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';

const router = express.Router();

// Admin routes - require authentication
router.use(protect);
router.use(attachCompanyDB);

// Get all collections
router.get('/', getAllCollections);

// Get collection statistics
router.get('/stats', getCollectionStats);

// Get collection by ID
router.get('/:id', getCollectionByIdAdmin);

// Approve collection
router.put('/:id/approve', approveCollection);

// Reject collection
router.put('/:id/reject', rejectCollection);

// Create voucher from approved collection
router.post('/:id/create-voucher', createVoucherFromCollection);

export default router;
