import express from "express";
import {
  createCreditNote,
  getAllCreditNotes,
  getCreditNoteById,
  updateCreditNote,
  deleteCreditNote,
  getCreditNotesByDealer,
  getCreditNotesByInvoice,
  getCreditNoteStats
} from "../controllers/creditNoteController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// Credit Note CRUD operations
router.post("/", logActivity("Credit Note", "Created new credit note", "CREATE"), createCreditNote);
router.get("/", logActivity("Credit Note", "Viewed credit notes list", "READ"), getAllCreditNotes);
router.get("/stats", logActivity("Credit Note", "Viewed credit note statistics", "READ"), getCreditNoteStats);
router.get("/:id", logActivity("Credit Note", "Viewed credit note details", "READ"), getCreditNoteById);
router.put("/:id", logActivity("Credit Note", "Updated credit note", "UPDATE"), updateCreditNote);
router.delete("/:id", logActivity("Credit Note", "Deleted credit note", "DELETE"), deleteCreditNote);

// Specific queries
router.get("/dealer/:dealerId", logActivity("Credit Note", "Viewed dealer credit notes", "READ"), getCreditNotesByDealer);
router.get("/invoice/:invoiceId", logActivity("Credit Note", "Viewed invoice credit notes", "READ"), getCreditNotesByInvoice);

export default router;
