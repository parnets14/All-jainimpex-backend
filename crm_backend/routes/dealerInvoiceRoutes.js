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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// @route   GET /api/dealer-invoices
// @desc    Get all dealer invoices with pagination and filtering
// @access  Private
router.get("/", logActivity("Dealer Invoice", "Viewed dealer invoices list", "READ"), getDealerInvoices);

// @route   GET /api/dealer-invoices/stats/overview
// @desc    Get invoice statistics
// @access  Private
router.get("/stats/overview", logActivity("Dealer Invoice", "Viewed invoice statistics", "READ"), getInvoiceStats);

// @route   GET /api/dealer-invoices/sales-orders/:dealerId
// @desc    Get dealer's completed sales orders for invoice creation
// @access  Private
router.get("/sales-orders/:dealerId", logActivity("Dealer Invoice", "Viewed dealer sales orders", "READ"), getDealerSalesOrders);

// @route   POST /api/dealer-invoices/calculate-discounts
// @desc    Calculate discounts and points for products
// @access  Private
router.post("/calculate-discounts", logActivity("Dealer Invoice", "Calculated discounts and points", "READ"), calculateDiscountsAndPoints);

// @route   GET /api/dealer-invoices/:id
// @desc    Get single dealer invoice
// @access  Private
router.get("/:id", logActivity("Dealer Invoice", "Viewed dealer invoice details", "READ"), getDealerInvoice);

// @route   POST /api/dealer-invoices
// @desc    Create new dealer invoice
// @access  Private
router.post("/", logActivity("Dealer Invoice", "Created new dealer invoice", "CREATE"), createDealerInvoice);

// @route   PUT /api/dealer-invoices/:id/approve
// @desc    Approve draft dealer invoice (generate invoice number, create ledger entry)
// @access  Private
router.put("/:id/approve", logActivity("Dealer Invoice", "Approved dealer invoice", "UPDATE"), approveDealerInvoice);

// @route   PUT /api/dealer-invoices/:id
// @desc    Update dealer invoice
// @access  Private
router.put("/:id", logActivity("Dealer Invoice", "Updated dealer invoice", "UPDATE"), updateDealerInvoice);

// @route   PATCH /api/dealer-invoices/:id/status
// @desc    Update invoice status
// @access  Private
router.patch("/:id/status", logActivity("Dealer Invoice", "Updated invoice status", "UPDATE"), updateInvoiceStatus);

// @route   PATCH /api/dealer-invoices/:id/approve
// @desc    Approve dealer invoice
// @access  Private
router.patch("/:id/approve", logActivity("Dealer Invoice", "Approved dealer invoice", "UPDATE"), approveInvoice);

// @route   DELETE /api/dealer-invoices/:id
// @desc    Delete dealer invoice
// @access  Private
router.delete("/:id", logActivity("Dealer Invoice", "Deleted dealer invoice", "DELETE"), deleteDealerInvoice);

export default router;

