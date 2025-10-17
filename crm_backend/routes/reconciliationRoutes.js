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
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get suppliers for reconciliation
router.get("/suppliers", 
  requirePermission("reconciliation.read"),
  getSuppliersForReconciliation
);

// Get purchase orders for reconciliation
router.get("/purchase-orders", 
  requirePermission("reconciliation.read"),
  getPurchaseOrdersForReconciliation
);

// Get GRNs for reconciliation
router.get("/grns", 
  requirePermission("reconciliation.read"),
  getGRNsForReconciliation
);

// Get supplier invoices for reconciliation
router.get("/supplier-invoices", 
  requirePermission("reconciliation.read"),
  getSupplierInvoicesForReconciliation
);

// Get supplier payments for reconciliation
router.get("/supplier-payments", 
  requirePermission("reconciliation.read"),
  getSupplierPaymentsForReconciliation
);

// Perform automatic reconciliation
router.post("/auto-reconcile", 
  requirePermission("reconciliation.create"),
  performAutoReconciliation
);

// Get reconciliation summary
router.get("/summary", 
  requirePermission("reconciliation.read"),
  getReconciliationSummary
);

export default router;
