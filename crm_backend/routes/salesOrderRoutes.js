import express from "express";
import {
  getSalesOrders,
  getSalesOrder,
  createSalesOrder,
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
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Public routes (if any)

// Protected routes
router.use(protect);

router.route("/")
  .get(logActivity("Sales Order Dashboard", "Viewed sales orders list", "READ"), getSalesOrders)
  .post(logActivity("Sales Order Dashboard", "Created new sales order", "CREATE"), createSalesOrder);

// NEW: Auto-split route for dual credit days system
router.route("/auto-split")
  .post(logActivity("Sales Order Dashboard", "Created sales order with auto-split", "CREATE"), createSalesOrderWithAutoSplit);

router.route("/overdue")
  .get(logActivity("Sales Order Dashboard", "Viewed overdue sales orders", "READ"), getOverdueSalesOrders);

// NEW: Expiry management routes - MUST be before /:id routes
router.route("/expiring-soon")
  .get(logActivity("Sales Order Dashboard", "Viewed orders expiring soon", "READ"), getOrdersExpiringSoon);

router.route("/pending-quantities")
  .get(logActivity("Stock Management", "Viewed pending quantities from out-of-stock orders", "READ"), getPendingQuantities);

router.route("/stats/summary")
  .get(logActivity("Sales Order Dashboard", "Viewed sales order statistics", "READ"), getSalesOrderStats);

router.route("/dealer/:dealerId")
  .get(logActivity("Sales Order Dashboard", "Viewed sales orders by dealer", "READ"), getSalesOrdersByDealer);

router.route("/product/:productId/stock")
  .get(logActivity("Sales Order Dashboard", "Viewed product stock for sales", "READ"), getProductStock);

router.route("/:id")
  .get(logActivity("Sales Order Dashboard", "Viewed sales order details", "READ"), getSalesOrder)
  .put(logActivity("Sales Order Dashboard", "Updated sales order", "UPDATE"), updateSalesOrder)
  .delete(logActivity("Sales Order Dashboard", "Deleted sales order", "DELETE"), deleteSalesOrder);

router.route("/:id/status")
  .patch(logActivity("Sales Order Dashboard", "Updated sales order status", "UPDATE"), updateSalesOrderStatus);

// NEW: Assign warehouse to out-of-stock order
router.route("/:id/assign-warehouse")
  .patch(logActivity("Sales Order Dashboard", "Assigned warehouse to out-of-stock order", "UPDATE"), assignWarehouseToOutOfStockOrder);

router.route("/:id/set-expiry")
  .patch(logActivity("Sales Order Dashboard", "Set expiry date for order", "UPDATE"), setOrderExpiry);

router.route("/:id/extend-expiry")
  .patch(logActivity("Sales Order Dashboard", "Extended expiry date for order", "UPDATE"), extendOrderExpiry);

router.route("/:id/expire-now")
  .patch(logActivity("Sales Order Dashboard", "Expired order immediately", "UPDATE"), expireOrderNow);

router.route("/:id/cancel-expiry")
  .patch(logActivity("Sales Order Dashboard", "Cancelled expiry for order", "UPDATE"), cancelOrderExpiry);

router.route("/:id/approve-credit-overlimit")
  .patch(logActivity("Sales Order Dashboard", "Approved credit overlimit order", "UPDATE"), approveCreditOverlimit);

// NEW: Stock status routes
router.route("/:id/stock-status")
  .get(logActivity("Sales Order Dashboard", "Viewed order stock status", "READ"), getOrderStockStatus);

router.route("/:id/refresh-stock-status")
  .post(logActivity("Sales Order Dashboard", "Refreshed order stock status", "UPDATE"), refreshOrderStockStatus);

// NEW: Refresh stock status by order number (easier for manual fixes)
router.route("/refresh-by-order-number/:orderNumber")
  .post(logActivity("Sales Order Dashboard", "Refreshed order stock status by order number", "UPDATE"), refreshOrderStockStatusByOrderNumber);

// Check stock availability for out-of-stock orders
router.route("/check-stock-availability")
  .post(logActivity("Sales Order Dashboard", "Checked stock availability for out-of-stock orders", "UPDATE"), checkStockAvailabilityForOutOfStockOrders);

// Auto-expire orders
router.route("/auto-expire")
  .post(logActivity("Sales Order Dashboard", "Auto-expired orders past deadline", "UPDATE"), autoExpireOrders);

// Migrate/fix stock status for all existing orders
router.route("/migrate-stock-status")
  .post(logActivity("Sales Order Dashboard", "Migrated order stock status", "UPDATE"), migrateOrderStockStatus);

// Manually trigger auto-refresh of stock status for all waiting/partial orders
router.route("/auto-refresh-stock-status")
  .post(logActivity("Sales Order Dashboard", "Manually triggered stock status auto-refresh", "UPDATE"), autoRefreshAllStockStatus);

// Migrate/fix all existing orders to recalculate discount-aware totals
router.route("/migrate-discount-totals")
  .post(logActivity("Sales Order Dashboard", "Migrated discount totals for all orders", "UPDATE"), migrateDiscountTotals);

// Dispatch deviations report
router.route("/dispatch-deviations")
  .get(logActivity("Deviation Report", "Viewed dispatch deviations", "READ"), getDispatchDeviations);

// Partial dispatch — reduce qty, unblock stock, create new SO or deviation
router.route("/:id/partial-dispatch")
  .patch(logActivity("Sales Order Dashboard", "Partial dispatch quantity reduction", "UPDATE"), partialDispatch);

export default router;