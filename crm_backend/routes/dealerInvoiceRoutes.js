import express from "express";
import {
  getDealerInvoices,
  getDealerInvoice,
  getLastFinalizedDealerFamilyDiscount,
  getDealerSalesOrders,
  calculateDiscountsAndPoints,
  createDealerInvoice,
  approveDealerInvoice,
  updateDealerInvoice,
  deleteDealerInvoice,
  getInvoiceStats
} from "../controllers/dealerInvoiceController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import { requireAnyPermission } from "../middleware/routePermissions.js";

const router = express.Router();

const canViewInvoices = requireAnyPermission([
  "invoices.view",
  "invoices.create",
  "invoices.update",
  "invoices.approve",
  "invoices.delete",
  "invoices.cancel",
  "invoice"
]);
const canCreateInvoices = requireAnyPermission(["invoices.create", "invoice"]);
const canPrepareInvoices = requireAnyPermission(["invoices.create", "invoices.update", "invoice"]);
const canUpdateInvoices = requireAnyPermission(["invoices.update", "invoice"]);
const canApproveInvoices = requireAnyPermission(["invoices.approve", "invoice"]);
const canDeleteOrCancelInvoices = requireAnyPermission([
  "invoices.delete",
  "invoices.cancel",
  "invoice"
]);

// All routes are protected
router.use(protect);
router.use(attachCompanyDB);

// @route   GET /api/dealer-invoices
// @desc    Get all dealer invoices with pagination and filtering
// @access  Private
router.get("/", canViewInvoices, logActivity("Dealer Invoice", "Viewed dealer invoices list", "READ"), getDealerInvoices);

// @route   GET /api/dealer-invoices/stats/overview
// @desc    Get invoice statistics
// @access  Private
router.get("/stats/overview", canViewInvoices, logActivity("Dealer Invoice", "Viewed invoice statistics", "READ"), getInvoiceStats);

// @route   GET /api/dealer-invoices/sales-orders/:dealerId
// @desc    Get dealer's completed sales orders for invoice creation
// @access  Private
router.get("/sales-orders/:dealerId", canPrepareInvoices, logActivity("Dealer Invoice", "Viewed dealer sales orders", "READ"), getDealerSalesOrders);

// @route   POST /api/dealer-invoices/calculate-discounts
// @desc    Calculate discounts and points for products
// @access  Private
router.post("/calculate-discounts", canPrepareInvoices, logActivity("Dealer Invoice", "Calculated discounts and points", "READ"), calculateDiscountsAndPoints);

// @route   GET /api/dealer-invoices/last-finalized-discount/:dealerId/:subcategoryId
// @desc    Get the latest finalized discount history for a dealer and product family
// @access  Private
router.get(
  "/last-finalized-discount/:dealerId/:subcategoryId",
  canPrepareInvoices,
  logActivity("Dealer Invoice", "Viewed dealer family discount history", "READ"),
  getLastFinalizedDealerFamilyDiscount
);

// @route   GET /api/dealer-invoices/:id
// @desc    Get single dealer invoice
// @access  Private
router.get("/:id", canViewInvoices, logActivity("Dealer Invoice", "Viewed dealer invoice details", "READ"), getDealerInvoice);

// @route   POST /api/dealer-invoices
// @desc    Create new dealer invoice
// @access  Private
router.post("/", canCreateInvoices, logActivity("Dealer Invoice", "Created new dealer invoice", "CREATE"), createDealerInvoice);

// @route   PUT /api/dealer-invoices/:id/approve
// @desc    Approve draft dealer invoice (generate invoice number, create ledger entry)
// @access  Private
router.put("/:id/approve", canApproveInvoices, logActivity("Dealer Invoice", "Approved dealer invoice", "UPDATE"), approveDealerInvoice);

// @route   PUT /api/dealer-invoices/:id
// @desc    Update dealer invoice
// @access  Private
router.put("/:id", canUpdateInvoices, logActivity("Dealer Invoice", "Updated dealer invoice", "UPDATE"), updateDealerInvoice);

// @route   PATCH /api/dealer-invoices/:id/status
// @desc    Disabled: status changes must use dedicated workflows with their financial side effects
// @access  Private
router.patch("/:id/status", canUpdateInvoices, logActivity("Dealer Invoice", "Rejected unsafe invoice status update", "UPDATE"), (_req, res) => {
  return res.status(405).json({
    success: false,
    message: "Generic invoice status updates are not allowed. Use the dedicated approval, dispatch, delivery, or cancellation workflow."
  });
});

// @route   PATCH /api/dealer-invoices/:id/approve
// @desc    Backward-compatible alias for the canonical Draft-to-Approved workflow
// @access  Private
router.patch("/:id/approve", canApproveInvoices, logActivity("Dealer Invoice", "Approved dealer invoice", "UPDATE"), approveDealerInvoice);

// @route   DELETE /api/dealer-invoices/:id
// @desc    Permanently delete a draft or cancel an approved invoice
// @access  Private — controller enforces the status-specific permission
router.delete("/:id", canDeleteOrCancelInvoices, logActivity("Dealer Invoice", "Deleted dealer invoice", "DELETE"), deleteDealerInvoice);

export default router;
