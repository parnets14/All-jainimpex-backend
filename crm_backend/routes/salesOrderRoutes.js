import express from "express";
import {
  getSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  deleteSalesOrder,
  updateSalesOrderStatus,
  getProductStock,
  getSalesOrderStats,
  getSalesOrdersByDealer,
  getOverdueSalesOrders
} from "../controllers/salesOrderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes (if any)

// Protected routes
router.use(protect);

router.route("/")
  .get(getSalesOrders)
  .post(createSalesOrder);

router.route("/overdue")
  .get(getOverdueSalesOrders);

router.route("/stats/summary")
  .get(getSalesOrderStats);

router.route("/dealer/:dealerId")
  .get(getSalesOrdersByDealer);

router.route("/product/:productId/stock")
  .get(getProductStock);

router.route("/:id")
  .get(getSalesOrder)
  .put(updateSalesOrder)
  .delete(deleteSalesOrder);

router.route("/:id/status")
  .patch(updateSalesOrderStatus);

export default router;