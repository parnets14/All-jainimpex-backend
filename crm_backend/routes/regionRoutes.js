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

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Protected routes
router.use(protect);
router.use(attachCompanyDB);

router.route('/')
  .get(getRegions)
  .post(createRegion);

router.route('/stats')
  .get(getRegionStats);

router.route('/:id')
  .get(getRegion)
  .put(updateRegion)
  .delete(deleteRegion);

export default router;
