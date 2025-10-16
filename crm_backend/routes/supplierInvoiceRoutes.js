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

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/supplier-invoices
// @desc    Get all supplier invoices with pagination and filters
// @access  Private
router.get("/", getSupplierInvoices);

// @route   GET /api/supplier-invoices/stats/summary
// @desc    Get supplier invoice statistics
// @access  Private
router.get("/stats/summary", getSupplierInvoiceStats);

// @route   GET /api/supplier-invoices/available-grns
// @desc    Get GRNs available for invoice creation
// @access  Private
router.get("/available-grns", getAvailableGRNs);

// @route   GET /api/supplier-invoices/:id
// @desc    Get single supplier invoice
// @access  Private
router.get("/:id", getSupplierInvoice);

// @route   POST /api/supplier-invoices
// @desc    Create new supplier invoice from GRN
// @access  Private
router.post("/", createSupplierInvoice);

// @route   PUT /api/supplier-invoices/:id
// @desc    Update supplier invoice
// @access  Private
router.put("/:id", updateSupplierInvoice);

// @route   PATCH /api/supplier-invoices/:id/status
// @desc    Update supplier invoice status
// @access  Private
router.patch("/:id/status", updateSupplierInvoiceStatus);

// @route   DELETE /api/supplier-invoices/:id
// @desc    Delete supplier invoice
// @access  Private
router.delete("/:id", deleteSupplierInvoice);

export default router;
