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
} from "../controllers/dealerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { uploadFields } from "../middleware/upload.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Get dealer statistics
router.get("/stats", logActivity("Dealer Management", "Viewed dealer statistics", "READ"), requirePermission("dealers.view"), getDealerStats);

// Get all dealers with pagination
router.get("/", logActivity("Dealer Management", "Viewed dealers list", "READ"), requirePermission("dealers.view"), getDealers);

// Get complete dealer info for Sales Order Dashboard
router.get("/:id/complete-info", logActivity("Dealer Management", "Viewed dealer complete info", "READ"), requirePermission("dealers.view"), getDealerCompleteInfo);

// Get single dealer
router.get("/:id", logActivity("Dealer Management", "Viewed dealer details", "READ"), requirePermission("dealers.view"), getDealer);

// Create new dealer
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
