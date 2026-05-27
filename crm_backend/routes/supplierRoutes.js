// routes/supplierRoutes.js
import express from "express";
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierStats
} from "../controllers/supplierController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

router.get("/", logActivity("Supplier Management", "Viewed suppliers list", "READ"), getSuppliers);
router.post("/", logActivity("Supplier Management", "Created new supplier", "CREATE"), createSupplier);

router.get("/stats", logActivity("Supplier Management", "Viewed supplier statistics", "READ"), getSupplierStats);

router.get("/:id", logActivity("Supplier Management", "Viewed supplier details", "READ"), getSupplierById);
router.put("/:id", logActivity("Supplier Management", "Updated supplier", "UPDATE"), updateSupplier);
router.delete("/:id", logActivity("Supplier Management", "Deleted supplier", "DELETE"), deleteSupplier);

export default router;
