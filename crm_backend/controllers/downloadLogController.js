import DownloadLog from "../models/DownloadLog.js";
import User from "../models/User.js";

// Get all download logs with filters and pagination
export const getDownloadLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      module,
      username,
      reportName,
      reportType,
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

    if (reportName) {
      filter.reportName = { $regex: reportName, $options: "i" };
    }

    if (reportType) {
      filter.reportType = reportType;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { reportName: { $regex: search, $options: "i" } },
        { module: { $regex: search, $options: "i" } },
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

    // Get download logs with pagination
    const downloadLogs = await DownloadLog.find(filter)
      .populate("user", "username email role")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await DownloadLog.countDocuments(filter);

    // Get unique modules for filter dropdown
    const modules = await DownloadLog.distinct("module");

    // Get unique report types for filter dropdown
    const reportTypes = await DownloadLog.distinct("reportType");

    res.json({
      success: true,
      data: downloadLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        modules,
        reportTypes,
      },
    });
  } catch (error) {
    console.error("Get download logs error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get download log by ID
export const getDownloadLog = async (req, res) => {
  try {
    const { id } = req.params;

    const downloadLog = await DownloadLog.findById(id).populate(
      "user",
      "username email role"
    );

    if (!downloadLog) {
      return res.status(404).json({
        success: false,
        message: "Download log not found",
      });
    }

    res.json({
      success: true,
      data: downloadLog,
    });
  } catch (error) {
    console.error("Get download log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create download log
export const createDownloadLog = async (req, res) => {
  try {
    const {
      user,
      username,
      reportName,
      module,
      reportType = "EXCEL",
      fileSize = 0,
      downloadUrl,
      filters = {},
      ipAddress,
      userAgent,
      status = "SUCCESS",
    } = req.body;

    const downloadLog = await DownloadLog.create({
      user,
      username,
      reportName,
      module,
      reportType,
      fileSize,
      downloadUrl,
      filters,
      ipAddress,
      userAgent,
      status,
    });

    res.status(201).json({
      success: true,
      message: "Download log created successfully",
      data: downloadLog,
    });
  } catch (error) {
    console.error("Create download log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get download logs statistics
export const getDownloadLogStats = async (req, res) => {
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

    // Get total downloads in period
    const totalDownloads = await DownloadLog.countDocuments({
      timestamp: { $gte: startDate, $lte: endDate },
    });

    // Get downloads by module
    const downloadsByModule = await DownloadLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$module",
          count: { $sum: 1 },
          totalSize: { $sum: "$fileSize" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get downloads by report type
    const downloadsByType = await DownloadLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$reportType",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get downloads by user
    const downloadsByUser = await DownloadLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$username",
          count: { $sum: 1 },
          totalSize: { $sum: "$fileSize" },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Get daily downloads for the period
    const dailyDownloads = await DownloadLog.aggregate([
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
          totalSize: { $sum: "$fileSize" },
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
        totalDownloads,
        downloadsByModule,
        downloadsByType,
        downloadsByUser,
        dailyDownloads,
      },
    });
  } catch (error) {
    console.error("Get download log stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete download log
export const deleteDownloadLog = async (req, res) => {
  try {
    const { id } = req.params;

    const downloadLog = await DownloadLog.findByIdAndDelete(id);

    if (!downloadLog) {
      return res.status(404).json({
        success: false,
        message: "Download log not found",
      });
    }

    res.json({
      success: true,
      message: "Download log deleted successfully",
    });
  } catch (error) {
    console.error("Delete download log error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Clean up old download logs (for maintenance)
export const cleanupOldDownloadLogs = async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await DownloadLog.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} old download logs`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Cleanup old download logs error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Clear all download logs
export const clearAllDownloadLogs = async (req, res) => {
  try {
    const result = await DownloadLog.deleteMany({});

    res.json({
      success: true,
      message: `Cleared all ${result.deletedCount} download logs`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Clear all download logs error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
