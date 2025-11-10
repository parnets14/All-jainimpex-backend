import express from "express";
import {
  getDealerPayments,
  getDealerPayment,
  createDealerPayment,
  updateDealerPaymentStatus,
  getAvailableInvoicesForPayment,
  getDealerPaymentStats,
  deleteDealerPayment
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

// @route   GET /api/dealer-payments/:id
// @desc    Get single dealer payment
// @access  Private
router.get("/:id", getDealerPayment);

// @route   POST /api/dealer-payments
// @desc    Create new dealer payment
// @access  Private
router.post("/", createDealerPayment);

// @route   PUT /api/dealer-payments/:id/status
// @desc    Update payment status (approve/reject)
// @access  Private
router.put("/:id/status", updateDealerPaymentStatus);

// @route   DELETE /api/dealer-payments/:id
// @desc    Delete dealer payment
// @access  Private
router.delete("/:id", deleteDealerPayment);

export default router;

