// middleware/permissionMiddleware.js
export const validatePermissions = (req, res, next) => {
  // Skip permission check for super admin
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Get the required permission from route
  const requiredPermission = req.permission;
  
  if (!requiredPermission) {
    return next(); // No permission required for this route
  }

  // Check if user has the required permission
  if (!req.user.permissions.includes(requiredPermission) && 
      !req.user.permissions.includes('*')) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required permission: ${requiredPermission}`
    });
  }

  next();
};

// Middleware to set required permission for route
export const requirePermission = (permission) => {
  return (req, res, next) => {
    req.permission = permission;
    validatePermissions(req, res, next);
  };
};