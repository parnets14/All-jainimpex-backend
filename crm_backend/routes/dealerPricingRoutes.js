import express from 'express';
import {
  getDealerPricing,
  getDealerPricingByProduct,
  createOrUpdateDealerPricing,
  updateDealerPricing,
  bulkUpdateDealerPricing,
  syncPurchasePrices
} from '../controllers/dealerPricingController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Debug: Log route registration
console.log('✅ Dealer Pricing Routes: Loading...');

// All routes require authentication
router.use(protect);

// Get all dealer pricing records
router.get('/', getDealerPricing);

// Get dealer pricing by product ID
router.get('/product/:productId', getDealerPricingByProduct);

// Create or update dealer pricing
router.post('/', createOrUpdateDealerPricing);

// Update dealer pricing
router.put('/:id', updateDealerPricing);

// Bulk update dealer pricing
router.post('/bulk-update', bulkUpdateDealerPricing);

// Sync purchase prices from purchase orders
router.post('/sync-purchase-prices', syncPurchasePrices);

// Debug: Log successful registration
console.log('✅ Dealer Pricing Routes: Registered successfully');
console.log('   - GET /api/dealer-pricing');
console.log('   - GET /api/dealer-pricing/product/:productId');
console.log('   - POST /api/dealer-pricing');
console.log('   - PUT /api/dealer-pricing/:id');
console.log('   - POST /api/dealer-pricing/bulk-update');
console.log('   - POST /api/dealer-pricing/sync-purchase-prices');

export default router;

