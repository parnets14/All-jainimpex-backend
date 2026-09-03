import express from "express";
import {
  getSalesOrders,
  getSalesOrder,
  createSalesOrder,
  previewSalesOrderCredit,
  updateSalesOrder,
  deleteSalesOrder,
  updateSalesOrderStatus,
  assignWarehouseToOutOfStockOrder,
  getProductStock,
  getSalesOrderStats,
  getSalesOrdersByDealer,
  getOverdueSalesOrders,
  getPendingQuantities,
  createSalesOrderWithAutoSplit,
  setOrderExpiry,
  extendOrderExpiry,
  expireOrderNow,
  getOrdersExpiringSoon,
  cancelOrderExpiry,
  approveCreditOverlimit,
  rejectCreditOverlimit,
  checkStockAvailabilityForOutOfStockOrders,
  autoExpireOrders,
  getOrderStockStatus,
  refreshOrderStockStatus,
  refreshOrderStockStatusByOrderNumber,
  migrateOrderStockStatus,
  autoRefreshAllStockStatus,
  migrateDiscountTotals,
  getDispatchDeviations,
  partialDispatch
} from "../controllers/salesOrderController.js";
import { getLastFinalizedDealerInvoiceFamilyDiscount } from "../controllers/dealerInvoiceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import { requireAnyPermission } from '../middleware/routePermissions.js';

const router = express.Router();

// Protected routes
router.use(protect);
router.use(attachCompanyDB);

const canViewSalesOrders = requireAnyPermission(['sales.orders.view']);
const canCreateSalesOrders = requireAnyPermission(['sales.orders.create']);
const canUpdateSalesOrders = requireAnyPermission(['sales.orders.update']);
const canPreviewSalesOrderCredit = requireAnyPermission(['sales.orders.create', 'sales.orders.update']);
const canDeleteSalesOrders = requireAnyPermission(['sales.orders.delete']);
const canApproveSalesOrders = requireAnyPermission(['sales.orders.approve']);
const canManageCreditOverlimit = requireAnyPermission(['super.admin']);
const canManageSalesOrderSystem = requireAnyPermission(['system.management', 'super.admin']);

router.route("/")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed sales orders list", "READ"), getSalesOrders)
  .post(canCreateSalesOrders, logActivity("Sales Order Dashboard", "Created new sales order", "CREATE"), createSalesOrder);

// NEW: Auto-split route for dual credit days system
router.route("/auto-split")
  .post(canCreateSalesOrders, logActivity("Sales Order Dashboard", "Created sales order with auto-split", "CREATE"), createSalesOrderWithAutoSplit);

router.route('/credit-preview')
  .post(canPreviewSalesOrderCredit, logActivity('Sales Order Dashboard', 'Previewed Sales Order credit', 'READ'), previewSalesOrderCredit);

router.route("/overdue")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed overdue sales orders", "READ"), getOverdueSalesOrders);

// NEW: Expiry management routes - MUST be before /:id routes
router.route("/expiring-soon")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed orders expiring soon", "READ"), getOrdersExpiringSoon);

router.route("/pending-quantities")
  .get(canViewSalesOrders, logActivity("Stock Management", "Viewed pending quantities from out-of-stock orders", "READ"), getPendingQuantities);

router.route("/stats/summary")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed sales order statistics", "READ"), getSalesOrderStats);

router.route("/dealer/:dealerId")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed sales orders by dealer", "READ"), getSalesOrdersByDealer);

// Read-only invoice discount history for the Sales Order form. This route is
// intentionally under /sales-orders so Sales Order users do not need invoice permissions.
router.route("/dealer-family-last-invoice-discount/:dealerId/:subcategoryId")
  .get(
    canViewSalesOrders,
    logActivity("Sales Order Dashboard", "Viewed last invoice family discount", "READ"),
    getLastFinalizedDealerInvoiceFamilyDiscount
  );

router.route("/product/:productId/stock")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed product stock for sales", "READ"), getProductStock);

// Dispatch deviations report — MUST be before /:id
router.route("/dispatch-deviations")
  .get(canViewSalesOrders, logActivity("Deviation Report", "Viewed dispatch deviations", "READ"), getDispatchDeviations);

// NEW: Refresh stock status by order number — MUST be before /:id
router.route("/refresh-by-order-number/:orderNumber")
  .post(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Refreshed order stock status by order number", "UPDATE"), refreshOrderStockStatusByOrderNumber);

// Check stock availability for out-of-stock orders — MUST be before /:id
router.route("/check-stock-availability")
  .post(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Checked stock availability for out-of-stock orders", "UPDATE"), checkStockAvailabilityForOutOfStockOrders);

// Auto-expire orders — MUST be before /:id
router.route("/auto-expire")
  .post(canManageSalesOrderSystem, logActivity("Sales Order Dashboard", "Auto-expired orders past deadline", "UPDATE"), autoExpireOrders);

// Migrate routes — MUST be before /:id
router.route("/migrate-stock-status")
  .post(canManageSalesOrderSystem, logActivity("Sales Order Dashboard", "Migrated order stock status", "UPDATE"), migrateOrderStockStatus);

router.route("/auto-refresh-stock-status")
  .post(canManageSalesOrderSystem, logActivity("Sales Order Dashboard", "Manually triggered stock status auto-refresh", "UPDATE"), autoRefreshAllStockStatus);

router.route("/migrate-discount-totals")
  .post(canManageSalesOrderSystem, logActivity("Sales Order Dashboard", "Migrated discount totals for all orders", "UPDATE"), migrateDiscountTotals);

router.route("/:id")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed sales order details", "READ"), getSalesOrder)
  .put(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Updated sales order", "UPDATE"), updateSalesOrder)
  .delete(canDeleteSalesOrders, logActivity("Sales Order Dashboard", "Deleted sales order", "DELETE"), deleteSalesOrder);

router.route("/:id/status")
  .patch(canApproveSalesOrders, logActivity("Sales Order Dashboard", "Updated sales order status", "UPDATE"), updateSalesOrderStatus);

// NEW: Assign warehouse to out-of-stock order
router.route("/:id/assign-warehouse")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Assigned warehouse to out-of-stock order", "UPDATE"), assignWarehouseToOutOfStockOrder);

router.route("/:id/set-expiry")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Set expiry date for order", "UPDATE"), setOrderExpiry);

router.route("/:id/extend-expiry")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Extended expiry date for order", "UPDATE"), extendOrderExpiry);

router.route("/:id/expire-now")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Expired order immediately", "UPDATE"), expireOrderNow);

router.route("/:id/cancel-expiry")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Cancelled expiry for order", "UPDATE"), cancelOrderExpiry);

router.route("/:id/approve-credit-overlimit")
  .patch(canManageCreditOverlimit, logActivity("Sales Order Dashboard", "Approved credit overlimit order", "UPDATE"), approveCreditOverlimit);

router.route('/:id/reject-credit-overlimit')
  .patch(canManageCreditOverlimit, logActivity('Sales Order Dashboard', 'Rejected credit overlimit order', 'UPDATE'), rejectCreditOverlimit);

// NEW: Stock status routes
router.route("/:id/stock-status")
  .get(canViewSalesOrders, logActivity("Sales Order Dashboard", "Viewed order stock status", "READ"), getOrderStockStatus);

router.route("/:id/refresh-stock-status")
  .post(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Refreshed order stock status", "UPDATE"), refreshOrderStockStatus);

// Partial dispatch — reduce qty, unblock stock, create new SO or deviation
router.route("/:id/partial-dispatch")
  .patch(canUpdateSalesOrders, logActivity("Sales Order Dashboard", "Partial dispatch quantity reduction", "UPDATE"), partialDispatch);

export default router;