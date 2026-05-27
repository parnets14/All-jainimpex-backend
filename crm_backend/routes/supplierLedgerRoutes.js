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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Create supplier ledger entry
router.post("/", 
  requirePermission("supplier_ledger.create"),
  logActivity("Supplier Ledger", "Created supplier ledger entry", "CREATE"),
  createSupplierLedgerEntry
);

// Get all supplier ledger entries
router.get("/", 
  requirePermission("supplier_ledger.read"),
  logActivity("Supplier Ledger", "Viewed supplier ledger entries", "READ"),
  getAllSupplierLedgerEntries
);

// Get supplier ledger by supplier ID
router.get("/supplier/:supplierId", 
  requirePermission("supplier_ledger.read"),
  logActivity("Supplier Ledger", "Viewed supplier ledger by supplier", "READ"),
  getSupplierLedgerBySupplier
);

// Get supplier ledger summary
router.get("/supplier/:supplierId/summary", 
  requirePermission("supplier_ledger.read"),
  logActivity("Supplier Ledger", "Viewed supplier ledger summary", "READ"),
  getSupplierLedgerSummary
);

// Update supplier ledger entry
router.put("/:id", 
  requirePermission("supplier_ledger.update"),
  logActivity("Supplier Ledger", "Updated supplier ledger entry", "UPDATE"),
  updateSupplierLedgerEntry
);

// Delete supplier ledger entry
router.delete("/:id", 
  requirePermission("supplier_ledger.delete"),
  logActivity("Supplier Ledger", "Deleted supplier ledger entry", "DELETE"),
  deleteSupplierLedgerEntry
);

export default router;
