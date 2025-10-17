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
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Public routes (if any)
// router.get('/public', getPublicProducts);

// Protected routes
router.use(protect);

router.route('/')
  .get(logActivity("Product Management", "Viewed products list", "READ"), getProducts)
  .post(logActivity("Product Management", "Created new product", "CREATE"), createProduct);

router.route('/stats')
  .get(logActivity("Product Management", "Viewed product statistics", "READ"), getProductStats);

router.route('/category/:categoryId')
  .get(logActivity("Product Management", "Viewed products by category", "READ"), getProductsByCategory);

router.route('/brand/:brandId')
  .get(logActivity("Product Management", "Viewed products by brand", "READ"), getProductsByBrand);

router.route('/:id')
  .get(logActivity("Product Management", "Viewed product details", "READ"), getProduct)
  .put(logActivity("Product Management", "Updated product", "UPDATE"), updateProduct)
  .delete(logActivity("Product Management", "Deleted product", "DELETE"), deleteProduct);

export default router;