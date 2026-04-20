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
  sendDealerLedgerEmail,
  getCombinedDealerLedger
} from "../controllers/dealerLedgerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// Dealer Ledger CRUD operations
router.post("/", createDealerLedgerEntry);
router.get("/", getAllDealerLedgerEntries);
router.get("/stats", getDealerLedgerStats);
router.get("/combined/:dealerId", getCombinedDealerLedger); // NEW: Combined ledger (old + voucher system)
router.get("/dealer/:dealerId", getDealerLedgerByDealer);
router.get("/sync/:dealerId", syncLedgerEntries);
router.post("/send-email/:dealerId", sendDealerLedgerEmail);
router.get("/:id", getDealerLedgerEntry);
router.put("/:id", updateDealerLedgerEntry);
router.delete("/:id", deleteDealerLedgerEntry);

export default router;























