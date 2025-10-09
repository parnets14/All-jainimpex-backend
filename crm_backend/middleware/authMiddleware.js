// import { verifyToken } from '../utils/jwtUtils.js';
// import User from '../models/User.js';

// export const protect = async (req, res, next) => {
//   try {
//     let token;

//     // Check for token in cookies first, then Authorization header
//     if (req.cookies.token) {
//       token = req.cookies.token;
//     } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
//       token = req.headers.authorization.split(' ')[1];
//     }

//     if (!token) {
//       return res.status(401).json({
//         success: false,
//         message: 'Not authorized to access this route. Please login.'
//       });
//     }

//     // Verify token
//     const decoded = verifyToken(token);
    
//     // Get user from token
//     const user = await User.findById(decoded.userId).select('-password');
    
//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: 'User not found. Token is invalid.'
//       });
//     }

//     req.user = user;
//     req.token = token;
//     next();
//   } catch (error) {
//     return res.status(401).json({
//       success: false,
//       message: 'Not authorized to access this route. Invalid token.'
//     });
//   }
// };


import { verifyToken } from '../utils/jwtUtils.js';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in cookies first, then Authorization header
    if (req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Please login.'
      });
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from token
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
    }

    // Check if user is active
    if (user.status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route. Invalid token.'
    });
  }
};

// Middleware to check permissions
export const requirePermission = (permission) => {
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

// Middleware to check role
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient privileges.'
      });
    }
    next();
  };
};
export const admin = requireRole;
export const authenticate = requireRole;