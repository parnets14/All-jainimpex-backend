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
  autoSyncNewProduct,
  autoCreateMissingPricingRecords
} from '../controllers/dealerPricingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { attachCompanyDB } from '../middleware/companyMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';

const router = express.Router();

// Debug: Log route registration
console.log('✅ Dealer Pricing Routes: Loading...');

// All routes require authentication and company database connection
router.use(protect);
router.use(attachCompanyDB); // Add company middleware for multi-company support

// Get all dealer pricing records (enhanced with filtering)
router.get('/', logActivity("Dealer Pricing", "Viewed dealer pricing list", "READ"), getDealerPricing);

// Get comprehensive pricing with both sales and purchase discounts
router.get('/comprehensive', logActivity("Dealer Pricing", "Viewed comprehensive pricing", "READ"), getComprehensivePricing);

// Get price validation warnings for all products
router.get('/validation-warnings', logActivity("Dealer Pricing", "Viewed price validation warnings", "READ"), getPriceValidationWarnings);

// Get filter options for bulk operations
router.get('/filter-options', logActivity("Dealer Pricing", "Viewed filter options", "READ"), getFilterOptions);

// Get scheduled price changes
router.get('/scheduled-changes', logActivity("Dealer Pricing", "Viewed scheduled price changes", "READ"), getScheduledChanges);

// Get all price history (for Price History tab)
router.get('/all-price-history', logActivity("Dealer Pricing", "Viewed all price history", "READ"), getAllPriceHistory);

// Get price history for a product
router.get('/price-history/:productId', logActivity("Dealer Pricing", "Viewed product price history", "READ"), getPriceHistory);

// Get dealer pricing by product ID
router.get('/product/:productId', logActivity("Dealer Pricing", "Viewed pricing by product", "READ"), getDealerPricingByProduct);

// Preview bulk price changes
router.post('/preview-bulk-changes', logActivity("Dealer Pricing", "Previewed bulk price changes", "READ"), previewBulkChanges);

// Apply bulk price changes (immediate or scheduled)
router.post('/apply-bulk-changes', logActivity("Dealer Pricing", "Applied bulk price changes", "UPDATE"), applyBulkChanges);

// Apply scheduled price changes manually
router.post('/apply-scheduled-changes', logActivity("Dealer Pricing", "Applied scheduled price changes", "UPDATE"), applyScheduledChanges);

// Update discount information for all products (enhanced with purchase discounts)
router.post('/update-discount-info', logActivity("Dealer Pricing", "Updated discount information", "UPDATE"), updateDiscountInfo);

// Sync purchase prices from supplier invoices
router.post('/sync-purchase-prices-from-invoices', logActivity("Dealer Pricing", "Synced purchase prices from invoices", "UPDATE"), syncPurchasePricesFromInvoices);

// Comprehensive price validation and auto-sync for all products
router.post('/validate-and-sync-all', logActivity("Dealer Pricing", "Validated and synced all pricing", "UPDATE"), validateAndSyncAllPricing);

// Auto-sync system for new products
router.post('/auto-sync-new-product', logActivity("Dealer Pricing", "Auto-synced new product pricing", "CREATE"), autoSyncNewProduct);

// Auto-create missing pricing records for all products
router.post('/auto-create-missing', logActivity("Dealer Pricing", "Auto-created missing pricing records", "CREATE"), autoCreateMissingPricingRecords);

// Create or update dealer pricing
router.post('/', logActivity("Dealer Pricing", "Created dealer pricing", "CREATE"), createOrUpdateDealerPricing);

// Update dealer pricing
router.put('/:id', logActivity("Dealer Pricing", "Updated dealer pricing", "UPDATE"), updateDealerPricing);

// Bulk update dealer pricing (legacy)
router.post('/bulk-update', logActivity("Dealer Pricing", "Bulk updated dealer pricing", "UPDATE"), bulkUpdateDealerPricing);

// Sync purchase prices from purchase orders
router.post('/sync-purchase-prices', logActivity("Dealer Pricing", "Synced purchase prices", "UPDATE"), syncPurchasePrices);

// Cancel scheduled price change
router.delete('/scheduled-changes/:id', logActivity("Dealer Pricing", "Cancelled scheduled price change", "DELETE"), cancelScheduledChange);

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

