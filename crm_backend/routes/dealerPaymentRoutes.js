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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// @route   GET /api/dealer-payments
// @desc    Get all dealer payments with pagination and filters
// @access  Private
router.get("/", logActivity("Dealer Payment", "Viewed dealer payments list", "READ"), getDealerPayments);

// @route   GET /api/dealer-payments/stats
// @desc    Get payment statistics
// @access  Private
router.get("/stats", logActivity("Dealer Payment", "Viewed payment statistics", "READ"), getDealerPaymentStats);

// @route   GET /api/dealer-payments/available-invoices
// @desc    Get available invoices for payment creation
// @access  Private
router.get("/available-invoices", logActivity("Dealer Payment", "Viewed available invoices for payment", "READ"), getAvailableInvoicesForPayment);

// @route   GET /api/dealer-payments/dealer/:id/advance-balance
// @desc    Get dealer's advance balance and payments
// @access  Private
router.get("/dealer/:id/advance-balance", logActivity("Dealer Payment", "Viewed dealer advance balance", "READ"), getDealerAdvanceBalance);

// @route   GET /api/dealer-payments/dealer/:dealerId/overdue
// @desc    Get overdue invoices for dealer
// @access  Private
router.get("/dealer/:dealerId/overdue", logActivity("Dealer Payment", "Viewed overdue invoices", "READ"), getOverdueInvoices);

// @route   GET /api/dealer-payments/:id
// @desc    Get single dealer payment
// @access  Private
router.get("/:id", logActivity("Dealer Payment", "Viewed dealer payment details", "READ"), getDealerPayment);

// @route   POST /api/dealer-payments
// @desc    Create new dealer payment
// @access  Private
router.post("/", logActivity("Dealer Payment", "Created new dealer payment", "CREATE"), createDealerPayment);

// @route   POST /api/dealer-payments/advance
// @desc    Record advance payment (without invoice)
// @access  Private
router.post("/advance", logActivity("Dealer Payment", "Recorded advance payment", "CREATE"), recordAdvancePayment);

// @route   POST /api/dealer-payments/adjust-advance
// @desc    Adjust advance payment against invoice
// @access  Private
router.post("/adjust-advance", logActivity("Dealer Payment", "Adjusted advance against invoice", "UPDATE"), adjustAdvanceAgainstInvoice);

// @route   PUT /api/dealer-payments/:id/status
// @desc    Update payment status (approve/reject) - handles both regular and advance payments
// @access  Private
router.put("/:id/status", logActivity("Dealer Payment", "Updated payment status", "UPDATE"), updateDealerPaymentStatusWithAdvance);

// @route   DELETE /api/dealer-payments/:id
// @desc    Delete dealer payment
// @access  Private
router.delete("/:id", logActivity("Dealer Payment", "Deleted dealer payment", "DELETE"), deleteDealerPayment);

export default router;

