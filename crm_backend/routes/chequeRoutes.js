import express from "express";
import {
  getCheques,
  getCheque,
  createCheque,
  updateCheque,
  deleteCheque,
  updateChequeStatus,
  getChequesByDealer,
  getChequesByStatus,
  getChequeStats,
  getChequeReport,
} from "../controllers/chequeController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// Get cheque statistics
router.get("/stats/summary", requirePermission("cheques.view"), logActivity("Cheque Management", "Viewed cheque statistics", "READ"), getChequeStats);

// Generate cheque report
router.get("/report", requirePermission("cheques.view"), logActivity("Cheque Management", "Generated cheque report", "READ"), getChequeReport);

// Get all cheques with pagination and filters
router.get("/", requirePermission("cheques.view"), logActivity("Cheque Management", "Viewed cheques list", "READ"), getCheques);

// Get cheques by dealer
router.get("/dealer/:dealerId", requirePermission("cheques.view"), logActivity("Cheque Management", "Viewed dealer cheques", "READ"), getChequesByDealer);

// Get cheques by status
router.get("/status/:status", requirePermission("cheques.view"), logActivity("Cheque Management", "Viewed cheques by status", "READ"), getChequesByStatus);

// Get single cheque
router.get("/:id", requirePermission("cheques.view"), logActivity("Cheque Management", "Viewed cheque details", "READ"), getCheque);

// Create new cheque
router.post("/", requirePermission("cheques.create"), logActivity("Cheque Management", "Created new cheque", "CREATE"), createCheque);

// Update cheque
router.put("/:id", requirePermission("cheques.update"), logActivity("Cheque Management", "Updated cheque", "UPDATE"), updateCheque);

// Update cheque status only
router.patch("/:id/status", requirePermission("cheques.update"), logActivity("Cheque Management", "Updated cheque status", "UPDATE"), updateChequeStatus);

// Delete cheque (soft delete)
router.delete("/:id", requirePermission("cheques.delete"), logActivity("Cheque Management", "Deleted cheque", "DELETE"), deleteCheque);

export default router;
