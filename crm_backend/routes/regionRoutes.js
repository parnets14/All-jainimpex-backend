import express from 'express';
import {
  getRegions,
  getRegion,
  createRegion,
  updateRegion,
  deleteRegion,
  getRegionStats
} from '../controllers/regionController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { generalLimiter } from '../middleware/rateLimit.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Protected routes
router.use(protect);
router.use(attachCompanyDB);

router.get('/', logActivity("Region Management", "Viewed regions list", "READ"), getRegions);
router.post('/', logActivity("Region Management", "Created new region", "CREATE"), createRegion);

router.get('/stats', logActivity("Region Management", "Viewed region statistics", "READ"), getRegionStats);

router.get('/:id', logActivity("Region Management", "Viewed region details", "READ"), getRegion);
router.put('/:id', logActivity("Region Management", "Updated region", "UPDATE"), updateRegion);
router.delete('/:id', logActivity("Region Management", "Deleted region", "DELETE"), deleteRegion);

export default router;
