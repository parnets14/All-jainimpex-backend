import express from 'express';
import {
  getAllRecommendations,
  createRecommendation,
  updateRecommendation,
  deleteRecommendation,
  markAsCompleted,
  dismissRecommendation
} from '../controllers/productRecommendationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

router.get('/', protect, logActivity("Product Recommendations", "Viewed recommendations list", "READ"), getAllRecommendations);
router.post('/', protect, logActivity("Product Recommendations", "Created new recommendation", "CREATE"), createRecommendation);
router.put('/:id', protect, logActivity("Product Recommendations", "Updated recommendation", "UPDATE"), updateRecommendation);
router.delete('/:id', protect, logActivity("Product Recommendations", "Deleted recommendation", "DELETE"), deleteRecommendation);
router.patch('/:id/complete', protect, logActivity("Product Recommendations", "Marked recommendation as completed", "UPDATE"), markAsCompleted);
router.patch('/:id/dismiss', protect, logActivity("Product Recommendations", "Dismissed recommendation", "UPDATE"), dismissRecommendation);

export default router;
