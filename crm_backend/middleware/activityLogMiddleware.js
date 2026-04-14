import { activityLogSchema } from "../models/ActivityLog.js";

const getModels = (dbConnection) => {
  return {
    ActivityLog: dbConnection.models.ActivityLog || dbConnection.model('ActivityLog', activityLogSchema)
  };
};

// Enhanced middleware to log user activities with better context
export const logActivity = (module, activity, action = "READ") => {
  return async (req, res, next) => {
    try {
      // Only log if user is authenticated
      if (req.user && req.dbConnection) {
        const { ActivityLog } = getModels(req.dbConnection);
        // Capture the original response send method
        const originalSend = res.send;
        
        res.send = function (data) {
          // Determine status based on response
          const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
          
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
              statusCode: res.statusCode,
              responseSize: data ? JSON.stringify(data).length : 0,
              userRole: req.user.role,
              timestamp: new Date().toISOString()
            },
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.get("User-Agent"),
            status: isSuccess ? "SUCCESS" : "FAILED",
          };

          // Don't await to avoid slowing down the response
          ActivityLog.create(logData).catch((error) => {
            console.error("Failed to log activity:", error);
          });
          
          // Call original send method
          originalSend.call(this, data);
        };
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
      
      if (isError && req.user && req.dbConnection) {
        const { ActivityLog } = getModels(req.dbConnection);
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
    if (!user || !req.dbConnection) return;

    const { ActivityLog } = getModels(req.dbConnection);
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
export const logAuthActivity = async (user, action, details = {}, dbConnection = null) => {
  try {
    if (!user || !dbConnection) return;

    const { ActivityLog } = getModels(dbConnection);
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
















