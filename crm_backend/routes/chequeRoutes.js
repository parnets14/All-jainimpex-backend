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
import { requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Get cheque statistics
router.get("/stats/summary", requirePermission("cheques.view"), getChequeStats);

// Generate cheque report
router.get("/report", requirePermission("cheques.view"), getChequeReport);

// Get all cheques with pagination and filters
router.get("/", requirePermission("cheques.view"), getCheques);

// Get cheques by dealer
router.get("/dealer/:dealerId", requirePermission("cheques.view"), getChequesByDealer);

// Get cheques by status
router.get("/status/:status", requirePermission("cheques.view"), getChequesByStatus);

// Get single cheque
router.get("/:id", requirePermission("cheques.view"), getCheque);

// Create new cheque
router.post("/", requirePermission("cheques.create"), createCheque);

// Update cheque
router.put("/:id", requirePermission("cheques.update"), updateCheque);

// Update cheque status only
router.patch("/:id/status", requirePermission("cheques.update"), updateChequeStatus);

// Delete cheque (soft delete)
router.delete("/:id", requirePermission("cheques.delete"), deleteCheque);

export default router;
