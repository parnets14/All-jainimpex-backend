import express from "express";
import ActivityLog from "../models/ActivityLog.js";
import DownloadLog from "../models/DownloadLog.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Create sample activity logs endpoint
router.post("/create-sample-logs", async (req, res) => {
  try {
    // Get some users to create logs for
    const users = await User.find().limit(5);
    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No users found. Please create users first."
      });
    }

    const modules = [
      "Sales Dashboard",
      "Inventory Management", 
      "HRMS",
      "Financial Reports",
      "User Management",
      "Purchase Orders",
      "Supplier Management",
      "Dealer Management",
      "Expense Management",
      "Attendance Tracking"
    ];

    const activities = [
      "Viewed dashboard",
      "Updated record",
      "Created new entry",
      "Deleted record",
      "Exported data",
      "Imported data",
      "Generated report",
      "Updated settings",
      "Viewed details",
      "Bulk operation"
    ];

    const actions = ["CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "IMPORT", "VIEW"];

    const sampleLogs = [];

    // Create 50 sample logs
    for (let i = 0; i < 50; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const module = modules[Math.floor(Math.random() * modules.length)];
      const activity = activities[Math.floor(Math.random() * activities.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      
      // Create timestamp within last 30 days
      const timestamp = new Date();
      timestamp.setDate(timestamp.getDate() - Math.floor(Math.random() * 30));
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));

      sampleLogs.push({
        user: user._id,
        username: user.username || user.name || "Unknown User",
        module: module,
        activity: activity,
        action: action,
        details: {
          method: "GET",
          url: `/api/${module.toLowerCase().replace(/\s+/g, '-')}`,
          params: {},
          query: {},
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        status: Math.random() > 0.1 ? "SUCCESS" : "FAILED", // 90% success rate
        timestamp: timestamp,
      });
    }

    // Insert sample logs
    await ActivityLog.insertMany(sampleLogs);

    // Also create some login/logout logs
    const authLogs = [];
    for (let i = 0; i < 20; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const action = Math.random() > 0.5 ? "LOGIN" : "LOGOUT";
      
      const timestamp = new Date();
      timestamp.setDate(timestamp.getDate() - Math.floor(Math.random() * 30));
      timestamp.setHours(Math.floor(Math.random() * 24));
      timestamp.setMinutes(Math.floor(Math.random() * 60));

      authLogs.push({
        user: user._id,
        username: user.username || user.name || "Unknown User",
        module: "Authentication",
        activity: action === "LOGIN" ? "User logged in" : "User logged out",
        action: action,
        details: {
          method: "POST",
          url: "/api/auth/login",
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        status: "SUCCESS",
        timestamp: timestamp,
      });
    }

    await ActivityLog.insertMany(authLogs);

    res.json({
      success: true,
      message: `Created ${sampleLogs.length} sample activity logs and ${authLogs.length} authentication logs`,
      totalCreated: sampleLogs.length + authLogs.length
    });
    
  } catch (error) {
    console.error("Error creating sample activity logs:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Clear all activity logs endpoint
router.delete("/clear-all-logs", async (req, res) => {
  try {
    const activityResult = await ActivityLog.deleteMany({});
    const downloadResult = await DownloadLog.deleteMany({});
    
    res.json({
      success: true,
      message: `Cleared ${activityResult.deletedCount} activity logs and ${downloadResult.deletedCount} download logs`,
      deletedCount: activityResult.deletedCount + downloadResult.deletedCount
    });
    
  } catch (error) {
    console.error("Error clearing logs:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create sample download logs endpoint
router.post("/create-sample-download-logs", async (req, res) => {
  try {
    // Get some users to use as references
    const users = await User.find().limit(5);
    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No users found. Please create users first."
      });
    }

    const modules = [
      "Activity Logs",
      "Download Logs", 
      "Dealer Performance",
      "Sales Order Dashboard",
      "Purchase Order Management",
      "User Management",
      "Dealer Management",
      "Product Management",
      "GRN Entry Module",
      "Supplier Invoice"
    ];

    const reportTypes = ["EXCEL", "PDF", "CSV"];
    const statuses = ["SUCCESS", "FAILED", "PENDING"];

    const sampleLogs = [];

    for (let i = 0; i < 30; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const module = modules[Math.floor(Math.random() * modules.length)];
      const reportType = reportTypes[Math.floor(Math.random() * reportTypes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      // Generate random file size (in bytes)
      const fileSize = status === "SUCCESS" ? Math.floor(Math.random() * 5000000) + 100000 : 0;
      
      // Generate random timestamp within last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      const randomTime = new Date(thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime()));

      const log = {
        user: user._id,
        username: user.username || user.name || "Unknown User",
        reportName: `${module} Report - ${randomTime.toISOString().slice(0, 10)}`,
        module: module,
        reportType: reportType,
        fileSize: fileSize,
        downloadUrl: `/api/reports/${module.toLowerCase().replace(/\s+/g, '-')}`,
        filters: {
          dateRange: "Last 30 days",
          format: reportType,
          includeDetails: true
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        timestamp: randomTime,
        status: status
      };

      sampleLogs.push(log);
    }

    await DownloadLog.insertMany(sampleLogs);

    res.json({
      success: true,
      message: `Created ${sampleLogs.length} sample download logs`,
      totalCreated: sampleLogs.length
    });
    
  } catch (error) {
    console.error("Error creating sample download logs:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
