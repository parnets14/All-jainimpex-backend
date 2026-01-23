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
  getAllPriceHistory,
  updateDiscountInfo,
  syncPurchasePricesFromInvoices,
  getComprehensivePricing,
  validateAndSyncAllPricing,
  getPriceValidationWarnings,
  autoSyncNewProduct
} from '../controllers/dealerPricingController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Debug: Log route registration
console.log('✅ Dealer Pricing Routes: Loading...');

// All routes require authentication
router.use(protect);

// Get all dealer pricing records (enhanced with filtering)
router.get('/', getDealerPricing);

// Get comprehensive pricing with both sales and purchase discounts
router.get('/comprehensive', getComprehensivePricing);

// Get price validation warnings for all products
router.get('/validation-warnings', getPriceValidationWarnings);

// Get filter options for bulk operations
router.get('/filter-options', getFilterOptions);

// Get scheduled price changes
router.get('/scheduled-changes', getScheduledChanges);

// Get all price history (for Price History tab)
router.get('/all-price-history', getAllPriceHistory);

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

// Update discount information for all products (enhanced with purchase discounts)
router.post('/update-discount-info', updateDiscountInfo);

// Sync purchase prices from supplier invoices
router.post('/sync-purchase-prices-from-invoices', syncPurchasePricesFromInvoices);

// Comprehensive price validation and auto-sync for all products
router.post('/validate-and-sync-all', validateAndSyncAllPricing);

// Auto-sync system for new products
router.post('/auto-sync-new-product', autoSyncNewProduct);

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
console.log('   - GET /api/dealer-pricing/comprehensive (with purchase & sales discounts)');
console.log('   - GET /api/dealer-pricing/validation-warnings (price validation warnings)');
console.log('   - GET /api/dealer-pricing/filter-options');
console.log('   - GET /api/dealer-pricing/scheduled-changes');
console.log('   - GET /api/dealer-pricing/all-price-history');
console.log('   - GET /api/dealer-pricing/price-history/:productId');
console.log('   - GET /api/dealer-pricing/product/:productId');
console.log('   - POST /api/dealer-pricing/preview-bulk-changes');
console.log('   - POST /api/dealer-pricing/apply-bulk-changes');
console.log('   - POST /api/dealer-pricing/apply-scheduled-changes');
console.log('   - POST /api/dealer-pricing/update-discount-info (enhanced)');
console.log('   - POST /api/dealer-pricing/sync-purchase-prices-from-invoices (new)');
console.log('   - POST /api/dealer-pricing/validate-and-sync-all (comprehensive validation)');
console.log('   - POST /api/dealer-pricing/auto-sync-new-product (auto-sync for new products)');
console.log('   - POST /api/dealer-pricing');
console.log('   - PUT /api/dealer-pricing/:id');
console.log('   - POST /api/dealer-pricing/bulk-update');
console.log('   - POST /api/dealer-pricing/sync-purchase-prices');
console.log('   - DELETE /api/dealer-pricing/scheduled-changes/:id');

export default router;

