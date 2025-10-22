import express from "express";
import {
  getActivityLogs,
  getActivityLog,
  createActivityLog,
  getActivityLogStats,
  deleteActivityLog,
  cleanupOldLogs,
} from "../controllers/activityLogController.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get activity logs with filters and pagination
router.get("/", getActivityLogs);

// Get activity log statistics
router.get("/stats", getActivityLogStats);

// Get single activity log
router.get("/:id", getActivityLog);

// Create activity log (usually called by middleware)
router.post("/", createActivityLog);

// Delete activity log (admin only)
router.delete("/:id", requirePermission("activity_logs", "delete"), deleteActivityLog);

// Cleanup old logs (admin only)
router.post("/cleanup", requirePermission("activity_logs", "delete"), cleanupOldLogs);

export default router;








