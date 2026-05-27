import express from "express";
import {
  getDebitNotes,
  getDebitNote,
  createDebitNote,
  updateDebitNote,
  deleteDebitNote,
  updateDebitNoteStatus,
  getDebitNoteStats,
  getAvailableSupplierInvoices
} from "../controllers/debitNoteController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);
router.use(attachCompanyDB);

// Debit Note routes
router.get("/", logActivity("Debit Note", "Viewed debit notes list", "READ"), getDebitNotes);
router.post("/", logActivity("Debit Note", "Created new debit note", "CREATE"), createDebitNote);

router.get("/stats/summary", logActivity("Debit Note", "Viewed debit note statistics", "READ"), getDebitNoteStats);

router.get("/available-invoices", logActivity("Debit Note", "Viewed available supplier invoices", "READ"), getAvailableSupplierInvoices);

router.get("/:id", logActivity("Debit Note", "Viewed debit note details", "READ"), getDebitNote);
router.put("/:id", logActivity("Debit Note", "Updated debit note", "UPDATE"), updateDebitNote);
router.delete("/:id", logActivity("Debit Note", "Deleted debit note", "DELETE"), deleteDebitNote);

router.patch("/:id/status", logActivity("Debit Note", "Updated debit note status", "UPDATE"), updateDebitNoteStatus);

export default router;
