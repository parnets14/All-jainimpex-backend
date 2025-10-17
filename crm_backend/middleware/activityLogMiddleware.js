import ActivityLog from "../models/ActivityLog.js";

// Middleware to log user activities
export const logActivity = (module, activity, action = "READ") => {
  return async (req, res, next) => {
    try {
      // Only log if user is authenticated
      if (req.user) {
        const logData = {
          user: req.user._id,
          username: req.user.username || req.user.name || "Unknown",
          module: module,
          activity: activity,
          action: action,
          details: {
            method: req.method,
            url: req.originalUrl,
            params: req.params,
            query: req.query,
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          status: "SUCCESS",
        };

        // Don't await to avoid slowing down the response
        ActivityLog.create(logData).catch((error) => {
          console.error("Failed to log activity:", error);
        });
      }
    } catch (error) {
      console.error("Activity logging middleware error:", error);
    }
    
    next();
  };
};

// Middleware to log failed activities
export const logFailedActivity = (module, activity, action = "READ") => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function (data) {
      // Check if response indicates failure
      const isError = res.statusCode >= 400;
      
      if (isError && req.user) {
        const logData = {
          user: req.user._id,
          username: req.user.username || req.user.name || "Unknown",
          module: module,
          activity: activity,
          action: action,
          details: {
            method: req.method,
            url: req.originalUrl,
            params: req.params,
            query: req.query,
            error: data,
            statusCode: res.statusCode,
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          status: "FAILED",
        };

        // Don't await to avoid slowing down the response
        ActivityLog.create(logData).catch((error) => {
          console.error("Failed to log failed activity:", error);
        });
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Helper function to manually log activities
export const manualLogActivity = async (req, user, module, activity, action = "READ", details = {}) => {
  try {
    if (!user) return;

    const logData = {
      user: user._id || user,
      username: user.username || user.name || "Unknown",
      module: module,
      activity: activity,
      action: action,
      details: {
        ...details,
        method: req?.method,
        url: req?.originalUrl,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get("User-Agent"),
      },
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get("User-Agent"),
      status: "SUCCESS",
    };

    await ActivityLog.create(logData);
  } catch (error) {
    console.error("Manual activity logging error:", error);
  }
};

// Helper function to log login/logout activities
export const logAuthActivity = async (user, action, details = {}) => {
  try {
    if (!user) return;

    const logData = {
      user: user._id,
      username: user.username || user.name || "Unknown",
      module: "Authentication",
      activity: action === "LOGIN" ? "User logged in" : "User logged out",
      action: action,
      details: {
        ...details,
        timestamp: new Date(),
      },
      status: "SUCCESS",
    };

    await ActivityLog.create(logData);
  } catch (error) {
    console.error("Auth activity logging error:", error);
  }
};
