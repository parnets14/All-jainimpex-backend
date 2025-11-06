import express from 'express';
import {
  getProductsForDealer,
  getProductDetailsForDealer,
  getProductsByCategoryForDealer,
  getProductsByBrandForDealer
} from '../controllers/productController.js';
import { protect } from '../../middleware/authMiddleware.js';
import { generalLimiter } from '../../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

// Get products for dealer (with dealer-specific pricing)
router.get('/', getProductsForDealer);

// Get product statistics for dealer
router.get('/stats', getProductsForDealer);

// Get products by category
router.get('/category/:categoryId', getProductsByCategoryForDealer);

// Get products by brand
router.get('/brand/:brandId', getProductsByBrandForDealer);

// Get single product details
router.get('/:id', getProductDetailsForDealer);

export default router;



