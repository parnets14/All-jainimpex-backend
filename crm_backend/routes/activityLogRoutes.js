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
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { cleanupLogsManually, getLogStatistics } from "../cron/logCleanup.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);
router.use(attachCompanyDB);

// Get activity logs with filters and pagination
router.get("/", getActivityLogs);

// Get activity log statistics
router.get("/stats", getActivityLogStats);

// Get log statistics (admin only)
router.get("/statistics", async (req, res) => {
  try {
    const { activityLogSchema } = await import("../models/ActivityLog.js");
    const { downloadLogSchema } = await import("../models/DownloadLog.js");
    
    const ActivityLog = req.dbConnection.models.ActivityLog || req.dbConnection.model('ActivityLog', activityLogSchema);
    const DownloadLog = req.dbConnection.models.DownloadLog || req.dbConnection.model('DownloadLog', downloadLogSchema);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [
      totalActivityLogs,
      totalDownloadLogs,
      recentActivityLogs,
      recentDownloadLogs,
      oldActivityLogs,
      oldDownloadLogs
    ] = await Promise.all([
      ActivityLog.countDocuments().catch(() => 0),
      DownloadLog.countDocuments().catch(() => 0),
      ActivityLog.countDocuments({ timestamp: { $gte: sevenDaysAgo } }).catch(() => 0),
      DownloadLog.countDocuments({ timestamp: { $gte: sevenDaysAgo } }).catch(() => 0),
      ActivityLog.countDocuments({ timestamp: { $lt: sevenDaysAgo } }).catch(() => 0),
      DownloadLog.countDocuments({ timestamp: { $lt: sevenDaysAgo } }).catch(() => 0)
    ]);
    
    res.json({
      success: true,
      data: {
        total: {
          activityLogs: totalActivityLogs,
          downloadLogs: totalDownloadLogs,
          combined: totalActivityLogs + totalDownloadLogs
        },
        recent: {
          activityLogs: recentActivityLogs,
          downloadLogs: recentDownloadLogs,
          combined: recentActivityLogs + recentDownloadLogs
        },
        old: {
          activityLogs: oldActivityLogs,
          downloadLogs: oldDownloadLogs,
          combined: oldActivityLogs + oldDownloadLogs
        }
      }
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

// Cleanup old logs (admin only) - keeps last 7 days
router.post("/cleanup", requirePermission("activity_logs", "delete"), async (req, res) => {
  try {
    const { daysToKeep = 7 } = req.body;
    const { activityLogSchema } = await import("../models/ActivityLog.js");
    const { downloadLogSchema } = await import("../models/DownloadLog.js");
    
    const ActivityLog = req.dbConnection.models.ActivityLog || req.dbConnection.model('ActivityLog', activityLogSchema);
    const DownloadLog = req.dbConnection.models.DownloadLog || req.dbConnection.model('DownloadLog', downloadLogSchema);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const activityResult = await ActivityLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    const downloadResult = await DownloadLog.deleteMany({ timestamp: { $lt: cutoffDate } });
    const totalDeleted = activityResult.deletedCount + downloadResult.deletedCount;
    
    res.json({
      success: true,
      message: `Cleaned up ${totalDeleted} logs older than ${daysToKeep} days`,
      data: {
        activityLogsDeleted: activityResult.deletedCount,
        downloadLogsDeleted: downloadResult.deletedCount,
        totalDeleted
      }
    });
  } catch (error) {
    console.error("Cleanup old logs error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Manual cleanup of both activity and download logs (super admin only)
router.post("/cleanup-all", requirePermission("system", "manage"), async (req, res) => {
  try {
    const { daysToKeep = 7 } = req.body;
    
    // Use company-specific database connection
    const { activityLogSchema } = await import("../models/ActivityLog.js");
    const { downloadLogSchema } = await import("../models/DownloadLog.js");
    
    const ActivityLog = req.dbConnection.models.ActivityLog || req.dbConnection.model('ActivityLog', activityLogSchema);
    const DownloadLog = req.dbConnection.models.DownloadLog || req.dbConnection.model('DownloadLog', downloadLogSchema);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const activityResult = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    const downloadResult = await DownloadLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    const totalDeleted = activityResult.deletedCount + downloadResult.deletedCount;
    
    res.json({
      success: true,
      message: `Successfully cleaned up ${totalDeleted} old logs`,
      data: {
        activityLogsDeleted: activityResult.deletedCount,
        downloadLogsDeleted: downloadResult.deletedCount,
        totalDeleted
      }
    });
  } catch (error) {
    console.error("Manual cleanup error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Clear ALL logs (super admin only) - deletes everything
router.post("/clear-all", requirePermission("system", "manage"), async (req, res) => {
  try {
    const { activityLogSchema } = await import("../models/ActivityLog.js");
    const { downloadLogSchema } = await import("../models/DownloadLog.js");
    
    const ActivityLog = req.dbConnection.models.ActivityLog || req.dbConnection.model('ActivityLog', activityLogSchema);
    const DownloadLog = req.dbConnection.models.DownloadLog || req.dbConnection.model('DownloadLog', downloadLogSchema);
    
    const activityResult = await ActivityLog.deleteMany({});
    const downloadResult = await DownloadLog.deleteMany({});
    const totalDeleted = activityResult.deletedCount + downloadResult.deletedCount;
    
    res.json({
      success: true,
      message: `Cleared all ${totalDeleted} logs`,
      data: {
        activityLogsDeleted: activityResult.deletedCount,
        downloadLogsDeleted: downloadResult.deletedCount,
        totalDeleted
      }
    });
  } catch (error) {
    console.error("Clear all logs error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
















