import express from "express";
import {
  getDownloadLogs,
  getDownloadLog,
  createDownloadLog,
  getDownloadLogStats,
  deleteDownloadLog,
  cleanupOldDownloadLogs,
  clearAllDownloadLogs,
} from "../controllers/downloadLogController.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Get download logs with filters and pagination
router.get("/", logActivity("Download Logs", "Viewed download logs list", "READ"), getDownloadLogs);

// Get download log statistics
router.get("/stats", logActivity("Download Logs", "Viewed download log statistics", "READ"), getDownloadLogStats);

// Get single download log
router.get("/:id", logActivity("Download Logs", "Viewed download log details", "READ"), getDownloadLog);

// Create download log (usually called by middleware)
router.post("/", logActivity("Download Logs", "Created download log", "CREATE"), createDownloadLog);

// Delete download log (admin only)
router.delete("/:id", requirePermission("download_logs", "delete"), logActivity("Download Logs", "Deleted download log", "DELETE"), deleteDownloadLog);

// Clear all download logs (admin only)
router.delete("/", requirePermission("download_logs", "delete"), logActivity("Download Logs", "Cleared all download logs", "DELETE"), clearAllDownloadLogs);

// Cleanup old logs (admin only)
router.post("/cleanup", requirePermission("download_logs", "delete"), logActivity("Download Logs", "Cleaned up old download logs", "DELETE"), cleanupOldDownloadLogs);

export default router;
