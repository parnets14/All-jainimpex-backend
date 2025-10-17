import ActivityLog from "../models/ActivityLog.js";
import User from "../models/User.js";

// Get all activity logs with filters and pagination
export const getActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      module,
      username,
      action,
      startDate,
      endDate,
      search,
      status,
    } = req.query;

    // Build filter object
    const filter = {};

    if (module) {
      filter.module = { $regex: module, $options: "i" };
    }

    if (username) {
      filter.username = { $regex: username, $options: "i" };
    }

    if (action) {
      filter.action = action;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { module: { $regex: search, $options: "i" } },
        { activity: { $regex: search, $options: "i" } },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get activity logs with pagination
    const activityLogs = await ActivityLog.find(filter)
      .populate("user", "username email role")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await ActivityLog.countDocuments(filter);

    // Get unique modules for filter dropdown
    const modules = await ActivityLog.distinct("module");

    // Get unique actions for filter dropdown
    const actions = await ActivityLog.distinct("action");

    res.json({
      success: true,
      data: activityLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        modules,
        actions,
      },
    });
  } catch (error) {
    console.error("Get activity logs error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get activity log by ID
export const getActivityLog = async (req, res) => {
  try {
    const { id } = req.params;

    const activityLog = await ActivityLog.findById(id).populate(
      "user",
      "username email role"
    );

    if (!activityLog) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
    }

    res.json({
      success: true,
      data: activityLog,
    });
  } catch (error) {
    console.error("Get activity log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create activity log
export const createActivityLog = async (req, res) => {
  try {
    const {
      user,
      username,
      module,
      activity,
      action,
      details,
      ipAddress,
      userAgent,
      status = "SUCCESS",
    } = req.body;

    const activityLog = await ActivityLog.create({
      user,
      username,
      module,
      activity,
      action,
      details,
      ipAddress,
      userAgent,
      status,
    });

    res.status(201).json({
      success: true,
      message: "Activity log created successfully",
      data: activityLog,
    });
  } catch (error) {
    console.error("Create activity log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get activity logs statistics
export const getActivityLogStats = async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    // Calculate date range based on period
    let startDate;
    const endDate = new Date();

    switch (period) {
      case "1d":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        break;
      case "7d":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "90d":
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get total activity logs in period
    const totalLogs = await ActivityLog.countDocuments({
      timestamp: { $gte: startDate, $lte: endDate },
    });

    // Get logs by module
    const logsByModule = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$module",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get logs by action
    const logsByAction = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get logs by user
    const logsByUser = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$username",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Get daily activity for the period
    const dailyActivity = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$timestamp" },
            month: { $month: "$timestamp" },
            day: { $dayOfMonth: "$timestamp" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    res.json({
      success: true,
      data: {
        period,
        totalLogs,
        logsByModule,
        logsByAction,
        logsByUser,
        dailyActivity,
      },
    });
  } catch (error) {
    console.error("Get activity log stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete activity log
export const deleteActivityLog = async (req, res) => {
  try {
    const { id } = req.params;

    const activityLog = await ActivityLog.findByIdAndDelete(id);

    if (!activityLog) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
    }

    res.json({
      success: true,
      message: "Activity log deleted successfully",
    });
  } catch (error) {
    console.error("Delete activity log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Clean up old activity logs (for maintenance)
export const cleanupOldLogs = async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} old activity logs`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Cleanup old logs error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
