import express from "express";
import {
  getSuppliersForReconciliation,
  getPurchaseOrdersForReconciliation,
  getGRNsForReconciliation,
  getSupplierInvoicesForReconciliation,
  getSupplierPaymentsForReconciliation,
  performAutoReconciliation,
  getReconciliationSummary
} from "../controllers/reconciliationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Get suppliers for reconciliation
router.get("/suppliers", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed suppliers for reconciliation", "READ"),
  getSuppliersForReconciliation
);

// Get purchase orders for reconciliation
router.get("/purchase-orders", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed purchase orders for reconciliation", "READ"),
  getPurchaseOrdersForReconciliation
);

// Get GRNs for reconciliation
router.get("/grns", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed GRNs for reconciliation", "READ"),
  getGRNsForReconciliation
);

// Get supplier invoices for reconciliation
router.get("/supplier-invoices", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed supplier invoices for reconciliation", "READ"),
  getSupplierInvoicesForReconciliation
);

// Get supplier payments for reconciliation
router.get("/supplier-payments", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed supplier payments for reconciliation", "READ"),
  getSupplierPaymentsForReconciliation
);

// Perform automatic reconciliation
router.post("/auto-reconcile", 
  requirePermission("reconciliation.create"),
  logActivity("Reconciliation", "Performed auto-reconciliation", "CREATE"),
  performAutoReconciliation
);

// Get reconciliation summary
router.get("/summary", 
  requirePermission("reconciliation.read"),
  logActivity("Reconciliation", "Viewed reconciliation summary", "READ"),
  getReconciliationSummary
);

export default router;
