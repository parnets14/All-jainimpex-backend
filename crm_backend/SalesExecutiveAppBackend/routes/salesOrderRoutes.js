import express from 'express';
import {
  getDealers,
  getProducts,
  getProductFilters,
  createSalesOrder,
  getMySalesOrders,
  getSalesOrderById,
  getWarehouses,
  calculateOrderDiscounts,
} from '../controllers/salesOrderController.js';
import protect from '../middleware/protect.js';

const router = express.Router();

// Sales Executive routes - require SE authentication
router.use(protect);

// Get dealers assigned to sales executive
router.get('/dealers', getDealers);

// Get warehouses (must be before /:id route)
router.get('/warehouses', getWarehouses);

// Get product filter options (brands, categories, subcategories)
router.get('/product-filters', getProductFilters);

// Get products with pricing and stock
router.get('/products', getProducts);

// Calculate discounts and points for order
router.post('/calculate-discounts', calculateOrderDiscounts);

// Get my sales orders (must be before /:id route)
router.get('/', getMySalesOrders);

// Create new sales order
router.post('/', createSalesOrder);

// Get specific order details (must be last)
router.get('/:id', getSalesOrderById);

export default router;
