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

const router = express.Router();

router.get('/', protect, getAllRecommendations);
router.post('/', protect, createRecommendation);
router.put('/:id', protect, updateRecommendation);
router.delete('/:id', protect, deleteRecommendation);
router.patch('/:id/complete', protect, markAsCompleted);
router.patch('/:id/dismiss', protect, dismissRecommendation);

export default router;
