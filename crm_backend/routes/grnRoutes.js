import express from 'express';
import {
  createGRN,
  getGRNs,
  getGRN,
  updateGRN,
  deleteGRN,
  getGRNStats,
  getApprovedPOs
} from '../controllers/grnController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.post('/', logActivity("GRN Entry Module", "Created new GRN", "CREATE"), createGRN);
router.get('/', logActivity("GRN Entry Module", "Viewed GRN list", "READ"), getGRNs);
router.get('/stats', logActivity("GRN Entry Module", "Viewed GRN statistics", "READ"), getGRNStats);
router.get('/approved-pos', logActivity("GRN Entry Module", "Viewed approved purchase orders", "READ"), getApprovedPOs);
router.get('/:id', logActivity("GRN Entry Module", "Viewed GRN details", "READ"), getGRN);
router.put('/:id', logActivity("GRN Entry Module", "Updated GRN", "UPDATE"), updateGRN);
router.delete('/:id', logActivity("GRN Entry Module", "Deleted GRN", "DELETE"), deleteGRN);

export default router;