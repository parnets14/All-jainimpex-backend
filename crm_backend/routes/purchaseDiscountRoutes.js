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

const router = express.Router();

// Debug: Log route registration
console.log('✅ Purchase Discount Routes: Loading...');

// All routes require authentication
router.use(protect);

// Get filter options
router.get('/filter-options', getFilterOptions);

// Get applicable discounts for product and supplier
router.get('/applicable/:productId/:supplierId', getApplicableDiscounts);

// CRUD routes
router.route('/')
  .get(getPurchaseDiscounts)
  .post(createPurchaseDiscount);

router.route('/:id')
  .get(getPurchaseDiscount)
  .put(updatePurchaseDiscount)
  .delete(deletePurchaseDiscount);

// Approval route
router.put('/:id/approve', approvePurchaseDiscount);

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