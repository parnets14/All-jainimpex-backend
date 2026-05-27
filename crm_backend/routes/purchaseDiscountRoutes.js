import express from 'express';
import {
  getPurchaseDiscounts,
  getPurchaseDiscount,
  createPurchaseDiscount,
  updatePurchaseDiscount,
  deletePurchaseDiscount,
  getApplicableDiscounts,
  getFilterOptions,
  approvePurchaseDiscount
} from '../controllers/purchaseDiscountController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Debug: Log route registration
console.log('✅ Purchase Discount Routes: Loading...');

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// All routes require authentication
router.use(protect);

// Get filter options
router.get('/filter-options', logActivity("Purchase Discount", "Viewed filter options", "READ"), getFilterOptions);

// Get applicable discounts for product and supplier
router.get('/applicable/:productId/:supplierId', logActivity("Purchase Discount", "Viewed applicable discounts", "READ"), getApplicableDiscounts);

// CRUD routes
router.get('/', logActivity("Purchase Discount", "Viewed purchase discounts list", "READ"), getPurchaseDiscounts);
router.post('/', logActivity("Purchase Discount", "Created new purchase discount", "CREATE"), createPurchaseDiscount);

router.get('/:id', logActivity("Purchase Discount", "Viewed purchase discount details", "READ"), getPurchaseDiscount);
router.put('/:id', logActivity("Purchase Discount", "Updated purchase discount", "UPDATE"), updatePurchaseDiscount);
router.delete('/:id', logActivity("Purchase Discount", "Deleted purchase discount", "DELETE"), deletePurchaseDiscount);

// Approval route
router.put('/:id/approve', logActivity("Purchase Discount", "Approved purchase discount", "UPDATE"), approvePurchaseDiscount);

// Debug: Log available routes
console.log('📋 Purchase Discount Routes registered:');
console.log('   - GET /api/purchase-discounts');
console.log('   - POST /api/purchase-discounts');
console.log('   - GET /api/purchase-discounts/:id');
console.log('   - PUT /api/purchase-discounts/:id');
console.log('   - DELETE /api/purchase-discounts/:id');
console.log('   - PUT /api/purchase-discounts/:id/approve');
console.log('   - GET /api/purchase-discounts/filter-options');
console.log('   - GET /api/purchase-discounts/applicable/:productId/:supplierId');

export default router;