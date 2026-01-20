import express from 'express';
import {
  getDiscountMappings,
  getDiscountMapping,
  createDiscountMapping,
  updateDiscountMapping,
  updateDiscountMappingStatus,
  deleteDiscountMapping,
  getApplicableDiscounts,
  calculateDiscount,
  getDiscountStats,
  fixMissingLevels,
  expireDiscounts
} from '../controllers/discountMappingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Routes
router.route('/')
  .get(getDiscountMappings)
  .post(logActivity('Created discount mapping'), createDiscountMapping);

router.route('/stats')
  .get(getDiscountStats);

router.route('/fix-missing-levels')
  .post(logActivity('Fixed discounts with missing levels'), fixMissingLevels);

router.route('/expire-discounts')
  .post(logActivity('Expired discounts manually'), expireDiscounts);

router.route('/calculate')
  .post(calculateDiscount);

router.route('/product/:productId/applicable')
  .get(getApplicableDiscounts);

router.route('/:id')
  .get(getDiscountMapping)
  .put(logActivity('Updated discount mapping'), updateDiscountMapping)
  .delete(logActivity('Deleted discount mapping'), deleteDiscountMapping);

router.route('/:id/status')
  .patch(logActivity('Updated discount mapping status'), updateDiscountMappingStatus);

export default router;