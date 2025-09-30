// middleware/permissionMiddleware.js
export const checkPermission = (permission) => {
  return (req, res, next) => {
    // Super admin has all permissions
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user has the required permission
    if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('*')) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

// Check if user has any of the required permissions
export const checkAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (req.user.role === 'super_admin') {
      return next();
    }

    const hasAny = permissions.some(permission => 
      req.user.permissions.includes(permission) || req.user.permissions.includes('*')
    );

    if (!hasAny) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required one of: ${permissions.join(', ')}`
      });
    }

    next();
  };
};