import express from "express";
import {
  getDealers,
  getDealer,
  createDealer,
  updateDealer,
  deleteDealer,
  getDealerStats,
  uploadDealerDocuments,
  getDealerCompleteInfo,
  getDealerAccessibleProducts,
  getDealerHierarchyOptions,
  getDealerOutstanding,
  getDealerCreditApprovalHistory,
} from "../controllers/dealerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { uploadFields } from "../middleware/upload.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Get dealer statistics - Allow all authenticated users (needed for dashboard)
router.get("/stats", logActivity("Dealer Management", "Viewed dealer statistics", "READ"), getDealerStats);

// Product Access Control Routes
// Get products accessible to a specific dealer based on hierarchy permissions
router.get("/:id/accessible-products", logActivity("Sales Order", "Viewed dealer accessible products", "READ"), getDealerAccessibleProducts);

// Get dealer's allowed hierarchy options for filtering
router.get("/:id/hierarchy-options", logActivity("Dealer Management", "Viewed dealer hierarchy options", "READ"), getDealerHierarchyOptions);

// Get dealer outstanding balance - Allow all authenticated users (needed for invoices/payments)
router.get("/:id/outstanding", logActivity("Dealer Management", "Viewed dealer outstanding balance", "READ"), getDealerOutstanding);

// Get dealer credit approval history (last 30 days) - Allow all authenticated users
router.get("/:id/credit-approval-history", logActivity("Dealer Management", "Viewed dealer credit approval history", "READ"), getDealerCreditApprovalHistory);

// Get all dealers with pagination - Allow all authenticated users (needed for dropdowns in invoices/payments)
router.get("/", logActivity("Dealer Management", "Viewed dealers list", "READ"), getDealers);

// Get complete dealer info for Sales Order Dashboard - Allow all authenticated users
router.get("/:id/complete-info", logActivity("Dealer Management", "Viewed dealer complete info", "READ"), getDealerCompleteInfo);

// Get single dealer - Allow all authenticated users (needed for various features)
router.get("/:id", logActivity("Dealer Management", "Viewed dealer details", "READ"), getDealer);

// Create new dealer - Requires specific permission
router.post("/", logActivity("Dealer Management", "Created new dealer", "CREATE"), requirePermission("dealers.create"), createDealer);

// Update dealer
router.put("/:id", logActivity("Dealer Management", "Updated dealer", "UPDATE"), requirePermission("dealers.update"), updateDealer);

// Upload dealer documents
router.post(
  "/:id/documents",
  logActivity("Dealer Management", "Uploaded dealer documents", "UPDATE"),
  (req, res, next) => {
    console.log("=== UPLOAD ROUTE HIT ===");
    console.log("Method:", req.method);
    console.log("URL:", req.url);
    console.log("Params:", req.params);
    next();
  },
  requirePermission("dealers.update"),
  uploadFields([
    { name: "panDocument", maxCount: 1 },
    { name: "aadharDocument", maxCount: 2 },
    { name: "gstDocument", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  uploadDealerDocuments
);

// Delete dealer
router.delete("/:id", logActivity("Dealer Management", "Deleted dealer", "DELETE"), requirePermission("dealers.delete"), deleteDealer);

export default router;
