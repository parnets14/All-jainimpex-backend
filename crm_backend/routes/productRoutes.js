import express from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStats,
  getProductsByCategory,
  getProductsByBrand
} from '../controllers/productController.js';
import { protect } from '../middleware/authMiddleware.js';
import { generalLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Public routes (if any)
// router.get('/public', getPublicProducts);

// Protected routes
router.use(protect);

router.route('/')
  .get(getProducts)
  .post(createProduct);

router.route('/stats')
  .get(getProductStats);

router.route('/category/:categoryId')
  .get(getProductsByCategory);

router.route('/brand/:brandId')
  .get(getProductsByBrand);

router.route('/:id')
  .get(getProduct)
  .put(updateProduct)
  .delete(deleteProduct);

export default router;