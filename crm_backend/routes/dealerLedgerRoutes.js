import express from "express";
import {
  createDealerLedgerEntry,
  getAllDealerLedgerEntries,
  getDealerLedgerByDealer,
  getDealerLedgerEntry,
  updateDealerLedgerEntry,
  deleteDealerLedgerEntry,
  getDealerLedgerStats,
  syncLedgerEntries,
  sendDealerLedgerEmail
} from "../controllers/dealerLedgerController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Dealer Ledger CRUD operations
router.post("/", createDealerLedgerEntry);
router.get("/", getAllDealerLedgerEntries);
router.get("/stats", getDealerLedgerStats);
router.get("/dealer/:dealerId", getDealerLedgerByDealer);
router.get("/sync/:dealerId", syncLedgerEntries);
router.post("/send-email/:dealerId", sendDealerLedgerEmail); // NEW: Send ledger via email
router.get("/:id", getDealerLedgerEntry);
router.put("/:id", updateDealerLedgerEntry);
router.delete("/:id", deleteDealerLedgerEntry);

export default router;























