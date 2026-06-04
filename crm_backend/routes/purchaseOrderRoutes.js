import express from "express";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrderStats,
  getLastPurchasePrice,
  get6MonthSalesQty,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(attachCompanyDB);

// Purchase Order Routes with activity logging
router.post("/", logActivity("Purchase Order Management", "Created new purchase order", "CREATE"), createPurchaseOrder);
router.get("/", logActivity("Purchase Order Management", "Viewed purchase orders list", "READ"), getPurchaseOrders);
router.get("/stats", logActivity("Purchase Order Management", "Viewed purchase order statistics", "READ"), getPurchaseOrderStats);
router.get("/last-price/:productId", logActivity("Purchase Order Management", "Viewed last purchase price", "READ"), getLastPurchasePrice);
router.get("/sales-6month/:productId", logActivity("Purchase Order Management", "Viewed 6-month sales qty", "READ"), get6MonthSalesQty);
router.get("/:id", logActivity("Purchase Order Management", "Viewed purchase order details", "READ"), getPurchaseOrderById);
router.put("/:id", logActivity("Purchase Order Management", "Updated purchase order", "UPDATE"), updatePurchaseOrder);
router.patch("/:id/status", logActivity("Purchase Order Management", "Updated purchase order status", "UPDATE"), updatePurchaseOrderStatus);
router.delete("/:id", logActivity("Purchase Order Management", "Deleted purchase order", "DELETE"), deletePurchaseOrder);

export default router;
