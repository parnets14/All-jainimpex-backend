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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// @route   GET /api/supplier-payments
// @desc    Get all supplier payments with pagination and filters
// @access  Private
router.get("/", logActivity("Supplier Payment", "Viewed supplier payments list", "READ"), getSupplierPayments);

// @route   GET /api/supplier-payments/stats
// @desc    Get payment statistics
// @access  Private
router.get("/stats", logActivity("Supplier Payment", "Viewed payment statistics", "READ"), getSupplierPaymentStats);

// @route   GET /api/supplier-payments/available-invoices
// @desc    Get available invoices for payment creation
// @access  Private
router.get("/available-invoices", logActivity("Supplier Payment", "Viewed available invoices for payment", "READ"), getAvailableInvoicesForPayment);

// @route   GET /api/supplier-payments/:id
// @desc    Get single supplier payment
// @access  Private
router.get("/:id", logActivity("Supplier Payment", "Viewed supplier payment details", "READ"), getSupplierPayment);

// @route   POST /api/supplier-payments
// @desc    Create new supplier payment
// @access  Private
router.post("/", logActivity("Supplier Payment", "Created new supplier payment", "CREATE"), createSupplierPayment);

// @route   PUT /api/supplier-payments/:id/status
// @desc    Update payment status (approve/reject)
// @access  Private
router.put("/:id/status", logActivity("Supplier Payment", "Updated payment status", "UPDATE"), updateSupplierPaymentStatus);

// @route   DELETE /api/supplier-payments/:id
// @desc    Delete supplier payment
// @access  Private
router.delete("/:id", logActivity("Supplier Payment", "Deleted supplier payment", "DELETE"), deleteSupplierPayment);

export default router;

















