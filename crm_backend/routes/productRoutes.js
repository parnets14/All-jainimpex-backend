import express from 'express';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStats,
  getProductsByCategoryHierarchy,
  getProductsByBrand,
  uploadProductImage,
  exportProductsToPDF,
  exportProductsToExcel,
  getPriceList,
  updatePriceListItem,
  getPriceListHistory,
  setOpeningStock
} from '../controllers/productController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { generalLimiter } from '../middleware/rateLimit.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import { imageUpload, handleUploadErrors } from '../middleware/upload.js';

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Protected routes
router.use(protect);
router.use(attachCompanyDB);

router.route('/')
  .get(logActivity("Product Management", "Viewed products list", "READ"), getProducts)
  .post(logActivity("Product Management", "Created new product", "CREATE"), createProduct);

router.route('/stats')
  .get(logActivity("Product Management", "Viewed product statistics", "READ"), getProductStats);

// Export routes
router.route('/export/pdf')
  .get(logActivity("Product Management", "Exported products to PDF", "READ"), exportProductsToPDF);

router.route('/export/excel')
  .get(logActivity("Product Management", "Exported products to Excel", "READ"), exportProductsToExcel);

router.route('/category-hierarchy/:categoryHierarchyId')
  .get(logActivity("Product Management", "Viewed products by category hierarchy", "READ"), getProductsByCategoryHierarchy);

router.route('/brand/:brandId')
  .get(logActivity("Product Management", "Viewed products by brand", "READ"), getProductsByBrand);

// Upload image route - must be before /:id route to avoid route conflicts
router.post('/upload-image', 
  imageUpload.single('image'),
  handleUploadErrors,
  logActivity("Product Management", "Uploaded product image", "CREATE"),
  uploadProductImage
);

// Price List routes — MUST be before /:id to avoid route conflicts
router.route('/price-list')
  .get(logActivity("Price List", "Viewed price list", "READ"), getPriceList);

router.route('/price-list/history')
  .get(logActivity("Price List", "Viewed price list history", "READ"), getPriceListHistory);

router.route('/price-list/:id')
  .patch(logActivity("Price List", "Updated price list item", "UPDATE"), updatePriceListItem);

router.route('/price-list/:id/opening-stock')
  .patch(logActivity("Price List", "Set opening stock", "UPDATE"), setOpeningStock);

router.route('/:id')
  .get(logActivity("Product Management", "Viewed product details", "READ"), getProduct)
  .put(logActivity("Product Management", "Updated product", "UPDATE"), updateProduct)
  .delete(logActivity("Product Management", "Deleted product", "DELETE"), deleteProduct);

export default router;