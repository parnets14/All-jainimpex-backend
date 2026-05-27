import express from "express";
import {
  getWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseStats,
  getWarehousesByRegion
} from "../controllers/warehouseController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { generalLimiter } from "../middleware/rateLimit.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

router.get("/", logActivity("Warehouse Management", "Viewed warehouses list", "READ"), getWarehouses);
router.post("/", logActivity("Warehouse Management", "Created new warehouse", "CREATE"), createWarehouse);

router.get("/stats/summary", logActivity("Warehouse Management", "Viewed warehouse statistics", "READ"), getWarehouseStats);

router.get("/region/:regionId", logActivity("Warehouse Management", "Viewed warehouses by region", "READ"), getWarehousesByRegion);

router.get("/:id", logActivity("Warehouse Management", "Viewed warehouse details", "READ"), getWarehouse);
router.put("/:id", logActivity("Warehouse Management", "Updated warehouse", "UPDATE"), updateWarehouse);
router.delete("/:id", logActivity("Warehouse Management", "Deleted warehouse", "DELETE"), deleteWarehouse);

export default router;
