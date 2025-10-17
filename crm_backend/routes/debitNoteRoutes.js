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

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Debit Note routes
router.route("/")
  .get(getDebitNotes)
  .post(createDebitNote);

router.route("/stats/summary")
  .get(getDebitNoteStats);

router.route("/available-invoices")
  .get(getAvailableSupplierInvoices);

router.route("/:id")
  .get(getDebitNote)
  .put(updateDebitNote)
  .delete(deleteDebitNote);

router.route("/:id/status")
  .patch(updateDebitNoteStatus);

export default router;

