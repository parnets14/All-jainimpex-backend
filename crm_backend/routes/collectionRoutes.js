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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Admin routes - require authentication
router.use(protect);
router.use(attachCompanyDB);

// Get all collections
router.get('/', logActivity("Collections", "Viewed collections list", "READ"), getAllCollections);

// Get collection statistics
router.get('/stats', logActivity("Collections", "Viewed collection statistics", "READ"), getCollectionStats);

// Get collection by ID
router.get('/:id', logActivity("Collections", "Viewed collection details", "READ"), getCollectionByIdAdmin);

// Approve collection
router.put('/:id/approve', logActivity("Collections", "Approved collection", "UPDATE"), approveCollection);

// Reject collection
router.put('/:id/reject', logActivity("Collections", "Rejected collection", "UPDATE"), rejectCollection);

// Create voucher from approved collection
router.post('/:id/create-voucher', logActivity("Collections", "Created voucher from collection", "CREATE"), createVoucherFromCollection);

export default router;
