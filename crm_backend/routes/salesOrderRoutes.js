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
  createSalesOrderWithAutoSplit
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

export default router;