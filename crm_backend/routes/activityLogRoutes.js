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
import { cleanupLogsManually, getLogStatistics } from "../cron/logCleanup.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Get activity logs with filters and pagination
router.get("/", getActivityLogs);

// Get activity log statistics
router.get("/stats", getActivityLogStats);

// Get log statistics (admin only)
router.get("/statistics", async (req, res) => {
  try {
    const stats = await getLogStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("Get log statistics error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get single activity log
router.get("/:id", getActivityLog);

// Create activity log (usually called by middleware)
router.post("/", createActivityLog);

// Delete activity log (admin only)
router.delete("/:id", requirePermission("activity_logs", "delete"), deleteActivityLog);

// Cleanup old logs (admin only)
router.post("/cleanup", requirePermission("activity_logs", "delete"), cleanupOldLogs);

// Manual cleanup of both activity and download logs (super admin only)
router.post("/cleanup-all", requirePermission("system", "manage"), async (req, res) => {
  try {
    const { daysToKeep = 7 } = req.body;
    const result = await cleanupLogsManually(daysToKeep);
    
    res.json({
      success: true,
      message: `Successfully cleaned up ${result.totalDeleted} old logs`,
      data: result
    });
  } catch (error) {
    console.error("Manual cleanup error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
















