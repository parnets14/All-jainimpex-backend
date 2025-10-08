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
import { generalLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

// Apply general rate limiting to all routes
router.use(generalLimiter);

// All routes are protected
router.use(protect);

router.route("/")
  .get(getWarehouses)
  .post(createWarehouse);

router.route("/stats/summary")
  .get(getWarehouseStats);

router.route("/region/:regionId")
  .get(getWarehousesByRegion);

router.route("/:id")
  .get(getWarehouse)
  .put(updateWarehouse)
  .delete(deleteWarehouse);

export default router;