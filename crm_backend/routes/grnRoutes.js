import express from 'express';
import {
  createGRN,
  getGRNs,
  getGRN,
  updateGRN,
  deleteGRN,
  getGRNStats,
  getApprovedPOs,
  inspectGRN,
  extendPOExpiration
} from '../controllers/grnController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

router.post('/', logActivity("GRN Entry Module", "Created new GRN (Draft)", "CREATE"), createGRN);
router.get('/', logActivity("GRN Entry Module", "Viewed GRN list", "READ"), getGRNs);
router.get('/stats', logActivity("GRN Entry Module", "Viewed GRN statistics", "READ"), getGRNStats);
router.get('/approved-pos', logActivity("GRN Entry Module", "Viewed approved purchase orders", "READ"), getApprovedPOs);

// PO expiration management (must be before /:id to avoid route conflict)
router.put('/po/:id/extend-expiration', logActivity("GRN Entry Module", "Extended PO expiration", "UPDATE"), extendPOExpiration);

router.get('/:id', logActivity("GRN Entry Module", "Viewed GRN details", "READ"), getGRN);
router.put('/:id', logActivity("GRN Entry Module", "Updated GRN", "UPDATE"), updateGRN);
router.put('/:id/inspect', logActivity("GRN Entry Module", "Inspected and completed GRN", "UPDATE"), inspectGRN);
router.delete('/:id', logActivity("GRN Entry Module", "Deleted GRN", "DELETE"), deleteGRN);

export default router;