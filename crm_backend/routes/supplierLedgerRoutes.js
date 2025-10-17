import express from "express";
import {
  createSupplierLedgerEntry,
  getAllSupplierLedgerEntries,
  getSupplierLedgerBySupplier,
  updateSupplierLedgerEntry,
  deleteSupplierLedgerEntry,
  getSupplierLedgerSummary
} from "../controllers/supplierLedgerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Create supplier ledger entry
router.post("/", 
  requirePermission("supplier_ledger.create"),
  createSupplierLedgerEntry
);

// Get all supplier ledger entries
router.get("/", 
  requirePermission("supplier_ledger.read"),
  getAllSupplierLedgerEntries
);

// Get supplier ledger by supplier ID
router.get("/supplier/:supplierId", 
  requirePermission("supplier_ledger.read"),
  getSupplierLedgerBySupplier
);

// Get supplier ledger summary
router.get("/supplier/:supplierId/summary", 
  requirePermission("supplier_ledger.read"),
  getSupplierLedgerSummary
);

// Update supplier ledger entry
router.put("/:id", 
  requirePermission("supplier_ledger.update"),
  updateSupplierLedgerEntry
);

// Delete supplier ledger entry
router.delete("/:id", 
  requirePermission("supplier_ledger.delete"),
  deleteSupplierLedgerEntry
);

export default router;
