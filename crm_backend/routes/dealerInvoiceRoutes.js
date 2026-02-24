import express from "express";
import {
  getDealerInvoices,
  getDealerInvoice,
  getDealerSalesOrders,
  calculateDiscountsAndPoints,
  createDealerInvoice,
  approveDealerInvoice,
  updateDealerInvoice,
  updateInvoiceStatus,
  approveInvoice,
  deleteDealerInvoice,
  getInvoiceStats
} from "../controllers/dealerInvoiceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/dealer-invoices
// @desc    Get all dealer invoices with pagination and filtering
// @access  Private
router.get("/", getDealerInvoices);

// @route   GET /api/dealer-invoices/stats/overview
// @desc    Get invoice statistics
// @access  Private
router.get("/stats/overview", getInvoiceStats);

// @route   GET /api/dealer-invoices/sales-orders/:dealerId
// @desc    Get dealer's completed sales orders for invoice creation
// @access  Private
router.get("/sales-orders/:dealerId", getDealerSalesOrders);

// @route   POST /api/dealer-invoices/calculate-discounts
// @desc    Calculate discounts and points for products
// @access  Private
router.post("/calculate-discounts", calculateDiscountsAndPoints);

// @route   GET /api/dealer-invoices/:id
// @desc    Get single dealer invoice
// @access  Private
router.get("/:id", getDealerInvoice);

// @route   POST /api/dealer-invoices
// @desc    Create new dealer invoice
// @access  Private
router.post("/", createDealerInvoice);

// @route   PUT /api/dealer-invoices/:id/approve
// @desc    Approve draft dealer invoice (generate invoice number, create ledger entry)
// @access  Private
router.put("/:id/approve", approveDealerInvoice);

// @route   PUT /api/dealer-invoices/:id
// @desc    Update dealer invoice
// @access  Private
router.put("/:id", updateDealerInvoice);

// @route   PATCH /api/dealer-invoices/:id/status
// @desc    Update invoice status
// @access  Private
router.patch("/:id/status", updateInvoiceStatus);

// @route   PATCH /api/dealer-invoices/:id/approve
// @desc    Approve dealer invoice
// @access  Private
router.patch("/:id/approve", approveInvoice);

// @route   DELETE /api/dealer-invoices/:id
// @desc    Delete dealer invoice
// @access  Private
router.delete("/:id", deleteDealerInvoice);

export default router;

