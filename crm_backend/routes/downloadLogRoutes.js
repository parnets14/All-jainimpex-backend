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
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get download logs with filters and pagination
router.get("/", getDownloadLogs);

// Get download log statistics
router.get("/stats", getDownloadLogStats);

// Get single download log
router.get("/:id", getDownloadLog);

// Create download log (usually called by middleware)
router.post("/", createDownloadLog);

// Delete download log (admin only)
router.delete("/:id", requirePermission("download_logs", "delete"), deleteDownloadLog);

// Clear all download logs (admin only)
router.delete("/", requirePermission("download_logs", "delete"), clearAllDownloadLogs);

// Cleanup old logs (admin only)
router.post("/cleanup", requirePermission("download_logs", "delete"), cleanupOldDownloadLogs);

export default router;
