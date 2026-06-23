// middleware/permissionMiddleware.js

/**
 * Check if user has a specific permission.
 * Matches: exact string, wildcard '*', or module-level wildcard 'module.*'
 */
const userHasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(requiredPermission)) return true;
  // Module-level wildcard: if user has 'products.*', they can access 'products.create'
  const module = requiredPermission.split('.')[0];
  if (userPermissions.includes(`${module}.*`)) return true;
  // Also accept just the module name as permission (e.g., 'inventory' grants 'inventory.view')
  if (userPermissions.includes(module)) return true;
  return false;
};

export const validatePermissions = (req, res, next) => {
  // Skip permission check for super admin
  if (req.user && req.user.role === 'super_admin') {
    return next();
  }

  // Get the required permission from route
  const requiredPermission = req.permission;
  
  if (!requiredPermission) {
    return next(); // No permission required for this route
  }

  // Check if user has the required permission
  if (!userHasPermission(req.user?.permissions, requiredPermission)) {
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
    // Super admin bypasses all permission checks
    if (req.user && req.user.role === 'super_admin') {
      return next();
    }
    req.permission = permission;
    validatePermissions(req, res, next);
  };
};

export default { validatePermissions, requirePermission };
