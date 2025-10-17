import DownloadLog from "../models/DownloadLog.js";

// Middleware to log download activities
export const logDownload = (module, reportName, reportType = "EXCEL") => {
  return async (req, res, next) => {
    try {
      // Only log if user is authenticated
      if (req.user) {
        const logData = {
          user: req.user._id,
          username: req.user.username || req.user.name || "Unknown",
          reportName: reportName,
          module: module,
          reportType: reportType,
          fileSize: req.fileSize || 0,
          downloadUrl: req.downloadUrl || req.originalUrl,
          filters: {
            query: req.query,
            params: req.params,
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          status: "SUCCESS",
        };

        // Don't await to avoid slowing down the response
        DownloadLog.create(logData).catch((error) => {
          console.error("Failed to log download:", error);
        });
      }
    } catch (error) {
      console.error("Download logging middleware error:", error);
    }
    
    next();
  };
};

// Helper function to manually log downloads
export const manualLogDownload = async (req, user, module, reportName, reportType = "EXCEL", additionalData = {}) => {
  try {
    if (!user) return;

    const logData = {
      user: user._id || user,
      username: user.username || user.name || "Unknown",
      reportName: reportName,
      module: module,
      reportType: reportType,
      fileSize: additionalData.fileSize || 0,
      downloadUrl: additionalData.downloadUrl || req?.originalUrl,
      filters: {
        ...additionalData.filters,
        query: req?.query,
        params: req?.params,
      },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get("User-Agent"),
      status: "SUCCESS",
    };

    await DownloadLog.create(logData);
  } catch (error) {
    console.error("Manual download logging error:", error);
  }
};

// Helper function to log failed downloads
export const logFailedDownload = async (req, user, module, reportName, error, additionalData = {}) => {
  try {
    if (!user) return;

    const logData = {
      user: user._id || user,
      username: user.username || user.name || "Unknown",
      reportName: reportName,
      module: module,
      reportType: additionalData.reportType || "EXCEL",
      fileSize: 0,
      downloadUrl: req?.originalUrl,
      filters: {
        ...additionalData.filters,
        query: req?.query,
        params: req?.params,
        error: error.message,
      },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get("User-Agent"),
      status: "FAILED",
    };

    await DownloadLog.create(logData);
  } catch (logError) {
    console.error("Failed download logging error:", logError);
  }
};
