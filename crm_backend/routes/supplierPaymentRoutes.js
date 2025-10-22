import express from "express";
import {
  getSupplierPayments,
  getSupplierPayment,
  createSupplierPayment,
  updateSupplierPaymentStatus,
  getAvailableInvoicesForPayment,
  getSupplierPaymentStats,
  deleteSupplierPayment
} from "../controllers/supplierPaymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/supplier-payments
// @desc    Get all supplier payments with pagination and filters
// @access  Private
router.get("/", getSupplierPayments);

// @route   GET /api/supplier-payments/stats
// @desc    Get payment statistics
// @access  Private
router.get("/stats", getSupplierPaymentStats);

// @route   GET /api/supplier-payments/available-invoices
// @desc    Get available invoices for payment creation
// @access  Private
router.get("/available-invoices", getAvailableInvoicesForPayment);

// @route   GET /api/supplier-payments/:id
// @desc    Get single supplier payment
// @access  Private
router.get("/:id", getSupplierPayment);

// @route   POST /api/supplier-payments
// @desc    Create new supplier payment
// @access  Private
router.post("/", createSupplierPayment);

// @route   PUT /api/supplier-payments/:id/status
// @desc    Update payment status (approve/reject)
// @access  Private
router.put("/:id/status", updateSupplierPaymentStatus);

// @route   DELETE /api/supplier-payments/:id
// @desc    Delete supplier payment
// @access  Private
router.delete("/:id", deleteSupplierPayment);

export default router;









