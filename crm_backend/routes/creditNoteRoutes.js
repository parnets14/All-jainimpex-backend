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

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// Credit Note CRUD operations
router.post("/", createCreditNote);
router.get("/", getAllCreditNotes);
router.get("/stats", getCreditNoteStats);
router.get("/:id", getCreditNoteById);
router.put("/:id", updateCreditNote);
router.delete("/:id", deleteCreditNote);

// Specific queries
router.get("/dealer/:dealerId", getCreditNotesByDealer);
router.get("/invoice/:invoiceId", getCreditNotesByInvoice);

export default router;
