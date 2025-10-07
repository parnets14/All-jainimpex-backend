import express from "express";
import {
  getDealers,
  getDealer,
  createDealer,
  updateDealer,
  deleteDealer,
  getDealerStats,
  uploadDealerDocuments,
} from "../controllers/dealerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { uploadFields } from "../middleware/upload.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Get dealer statistics
router.get("/stats", requirePermission("dealers.view"), getDealerStats);

// Get all dealers with pagination
router.get("/", requirePermission("dealers.view"), getDealers);

// Get single dealer
router.get("/:id", requirePermission("dealers.view"), getDealer);

// Create new dealer
router.post("/", requirePermission("dealers.create"), createDealer);

// Update dealer
router.put("/:id", requirePermission("dealers.update"), updateDealer);

// Upload dealer documents
router.post(
  "/:id/documents",
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
router.delete("/:id", requirePermission("dealers.delete"), deleteDealer);

export default router;
