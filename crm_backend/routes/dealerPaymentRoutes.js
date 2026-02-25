import express from "express";
import {
  getDealerPayments,
  getDealerPayment,
  createDealerPayment,
  updateDealerPaymentStatus,
  getAvailableInvoicesForPayment,
  getDealerPaymentStats,
  deleteDealerPayment,
  recordAdvancePayment,
  adjustAdvanceAgainstInvoice,
  getDealerAdvanceBalance,
  getOverdueInvoices,
  updateDealerPaymentStatusWithAdvance
} from "../controllers/dealerPaymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/dealer-payments
// @desc    Get all dealer payments with pagination and filters
// @access  Private
router.get("/", getDealerPayments);

// @route   GET /api/dealer-payments/stats
// @desc    Get payment statistics
// @access  Private
router.get("/stats", getDealerPaymentStats);

// @route   GET /api/dealer-payments/available-invoices
// @desc    Get available invoices for payment creation
// @access  Private
router.get("/available-invoices", getAvailableInvoicesForPayment);

// @route   GET /api/dealer-payments/dealer/:id/advance-balance
// @desc    Get dealer's advance balance and payments
// @access  Private
router.get("/dealer/:id/advance-balance", getDealerAdvanceBalance);

// @route   GET /api/dealer-payments/dealer/:dealerId/overdue
// @desc    Get overdue invoices for dealer
// @access  Private
router.get("/dealer/:dealerId/overdue", getOverdueInvoices);

// @route   GET /api/dealer-payments/:id
// @desc    Get single dealer payment
// @access  Private
router.get("/:id", getDealerPayment);

// @route   POST /api/dealer-payments
// @desc    Create new dealer payment
// @access  Private
router.post("/", createDealerPayment);

// @route   POST /api/dealer-payments/advance
// @desc    Record advance payment (without invoice)
// @access  Private
router.post("/advance", recordAdvancePayment);

// @route   POST /api/dealer-payments/adjust-advance
// @desc    Adjust advance payment against invoice
// @access  Private
router.post("/adjust-advance", adjustAdvanceAgainstInvoice);

// @route   PUT /api/dealer-payments/:id/status
// @desc    Update payment status (approve/reject) - handles both regular and advance payments
// @access  Private
router.put("/:id/status", updateDealerPaymentStatusWithAdvance);

// @route   DELETE /api/dealer-payments/:id
// @desc    Delete dealer payment
// @access  Private
router.delete("/:id", deleteDealerPayment);

export default router;

