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

const router = express.Router();

// All routes are protected
router.use(protect);

router.route("/")
  .get(getSuppliers)
  .post(createSupplier);

router.route("/stats")
  .get(getSupplierStats);

router.route("/:id")
  .get(getSupplierById)
  .put(updateSupplier)
  .delete(deleteSupplier);

export default router;