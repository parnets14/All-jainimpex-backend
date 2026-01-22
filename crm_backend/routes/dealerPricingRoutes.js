import express from 'express';
import {
  getDealerPricing,
  getDealerPricingByProduct,
  createOrUpdateDealerPricing,
  updateDealerPricing,
  bulkUpdateDealerPricing,
  syncPurchasePrices,
  getFilterOptions,
  previewBulkChanges,
  applyBulkChanges,
  getScheduledChanges,
  applyScheduledChanges,
  cancelScheduledChange,
  getPriceHistory,
  updateDiscountInfo
} from '../controllers/dealerPricingController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Debug: Log route registration
console.log('✅ Dealer Pricing Routes: Loading...');

// All routes require authentication
router.use(protect);

// Get all dealer pricing records (enhanced with filtering)
router.get('/', getDealerPricing);

// Get filter options for bulk operations
router.get('/filter-options', getFilterOptions);

// Get scheduled price changes
router.get('/scheduled-changes', getScheduledChanges);

// Get price history for a product
router.get('/price-history/:productId', getPriceHistory);

// Get dealer pricing by product ID
router.get('/product/:productId', getDealerPricingByProduct);

// Preview bulk price changes
router.post('/preview-bulk-changes', previewBulkChanges);

// Apply bulk price changes (immediate or scheduled)
router.post('/apply-bulk-changes', applyBulkChanges);

// Apply scheduled price changes manually
router.post('/apply-scheduled-changes', applyScheduledChanges);

// Update discount information for all products
router.post('/update-discount-info', updateDiscountInfo);

// Create or update dealer pricing
router.post('/', createOrUpdateDealerPricing);

// Update dealer pricing
router.put('/:id', updateDealerPricing);

// Bulk update dealer pricing (legacy)
router.post('/bulk-update', bulkUpdateDealerPricing);

// Sync purchase prices from purchase orders
router.post('/sync-purchase-prices', syncPurchasePrices);

// Cancel scheduled price change
router.delete('/scheduled-changes/:id', cancelScheduledChange);

// Debug: Log successful registration
console.log('✅ Dealer Pricing Routes: Registered successfully');
console.log('   - GET /api/dealer-pricing (enhanced filtering)');
console.log('   - GET /api/dealer-pricing/filter-options');
console.log('   - GET /api/dealer-pricing/scheduled-changes');
console.log('   - GET /api/dealer-pricing/price-history/:productId');
console.log('   - GET /api/dealer-pricing/product/:productId');
console.log('   - POST /api/dealer-pricing/preview-bulk-changes');
console.log('   - POST /api/dealer-pricing/apply-bulk-changes');
console.log('   - POST /api/dealer-pricing/apply-scheduled-changes');
console.log('   - POST /api/dealer-pricing/update-discount-info');
console.log('   - POST /api/dealer-pricing');
console.log('   - PUT /api/dealer-pricing/:id');
console.log('   - POST /api/dealer-pricing/bulk-update');
console.log('   - POST /api/dealer-pricing/sync-purchase-prices');
console.log('   - DELETE /api/dealer-pricing/scheduled-changes/:id');

export default router;

