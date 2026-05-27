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
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(attachCompanyDB);

// Dealer Ledger CRUD operations
router.post("/", logActivity("Dealer Ledger", "Created dealer ledger entry", "CREATE"), createDealerLedgerEntry);
router.get("/", logActivity("Dealer Ledger", "Viewed dealer ledger entries", "READ"), getAllDealerLedgerEntries);
router.get("/stats", logActivity("Dealer Ledger", "Viewed dealer ledger statistics", "READ"), getDealerLedgerStats);
router.get("/combined/:dealerId", logActivity("Dealer Ledger", "Viewed combined dealer ledger", "READ"), getCombinedDealerLedger); // NEW: Combined ledger (old + voucher system)
router.get("/dealer/:dealerId", logActivity("Dealer Ledger", "Viewed dealer ledger by dealer", "READ"), getDealerLedgerByDealer);
router.get("/sync/:dealerId", logActivity("Dealer Ledger", "Synced ledger entries", "READ"), syncLedgerEntries);
router.post("/send-email/:dealerId", logActivity("Dealer Ledger", "Sent dealer ledger email", "CREATE"), sendDealerLedgerEmail);
router.get("/:id", logActivity("Dealer Ledger", "Viewed dealer ledger entry details", "READ"), getDealerLedgerEntry);
router.put("/:id", logActivity("Dealer Ledger", "Updated dealer ledger entry", "UPDATE"), updateDealerLedgerEntry);
router.delete("/:id", logActivity("Dealer Ledger", "Deleted dealer ledger entry", "DELETE"), deleteDealerLedgerEntry);

export default router;























