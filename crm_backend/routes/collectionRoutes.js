import express from 'express';
import {
  getAllCollections,
  getCollectionByIdAdmin,
  approveCollection,
  rejectCollection,
  getCollectionStats
} from '../controllers/collectionController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin routes - require authentication
router.use(protect);

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

export default router;
