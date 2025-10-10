import express from "express";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  getPurchaseOrderStats,
} from "../controllers/purchaseOrderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// Purchase Order Routes
router.post("/", createPurchaseOrder);
router.get("/", getPurchaseOrders);
router.get("/stats", getPurchaseOrderStats);
router.get("/:id", getPurchaseOrderById);
router.put("/:id", updatePurchaseOrder);
router.patch("/:id/status", updatePurchaseOrderStatus);
router.delete("/:id", deletePurchaseOrder);

export default router;
