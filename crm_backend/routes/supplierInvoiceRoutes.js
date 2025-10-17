import express from "express";
import {
  getSupplierInvoices,
  getSupplierInvoice,
  createSupplierInvoice,
  updateSupplierInvoice,
  updateSupplierInvoiceStatus,
  deleteSupplierInvoice,
  getAvailableGRNs,
  getSupplierInvoiceStats
} from "../controllers/supplierInvoiceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/supplier-invoices
// @desc    Get all supplier invoices with pagination and filters
// @access  Private
router.get("/", logActivity("Supplier Invoice", "Viewed supplier invoices list", "READ"), getSupplierInvoices);

// @route   GET /api/supplier-invoices/stats/summary
// @desc    Get supplier invoice statistics
// @access  Private
router.get("/stats/summary", logActivity("Supplier Invoice", "Viewed supplier invoice statistics", "READ"), getSupplierInvoiceStats);

// @route   GET /api/supplier-invoices/available-grns
// @desc    Get GRNs available for invoice creation
// @access  Private
router.get("/available-grns", logActivity("Supplier Invoice", "Viewed available GRNs for invoice", "READ"), getAvailableGRNs);

// @route   GET /api/supplier-invoices/:id
// @desc    Get single supplier invoice
// @access  Private
router.get("/:id", logActivity("Supplier Invoice", "Viewed supplier invoice details", "READ"), getSupplierInvoice);

// @route   POST /api/supplier-invoices
// @desc    Create new supplier invoice from GRN
// @access  Private
router.post("/", logActivity("Supplier Invoice", "Created new supplier invoice", "CREATE"), createSupplierInvoice);

// @route   PUT /api/supplier-invoices/:id
// @desc    Update supplier invoice
// @access  Private
router.put("/:id", logActivity("Supplier Invoice", "Updated supplier invoice", "UPDATE"), updateSupplierInvoice);

// @route   PATCH /api/supplier-invoices/:id/status
// @desc    Update supplier invoice status
// @access  Private
router.patch("/:id/status", logActivity("Supplier Invoice", "Updated supplier invoice status", "UPDATE"), updateSupplierInvoiceStatus);

// @route   DELETE /api/supplier-invoices/:id
// @desc    Delete supplier invoice
// @access  Private
router.delete("/:id", logActivity("Supplier Invoice", "Deleted supplier invoice", "DELETE"), deleteSupplierInvoice);

export default router;

