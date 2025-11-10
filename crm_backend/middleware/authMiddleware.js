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
    let tokenSource = 'none';

    // Check for token in cookies first, then Authorization header, then query string
    if (req.cookies.token) {
      token = req.cookies.token;
      tokenSource = 'cookie';
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      tokenSource = 'header';
    } else if (req.query.token) {
      // Support token in query string for cases like PDF downloads via Linking.openURL
      token = req.query.token;
      tokenSource = 'query';
    }

    // Log token source for debugging (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 Auth check - Token source: ${tokenSource}, URL: ${req.method} ${req.path}`);
      if (tokenSource === 'query') {
        console.log(`🔐 Query params:`, Object.keys(req.query));
        console.log(`🔐 Token present: ${!!token}, Token length: ${token ? token.length : 0}`);
      }
    }

    if (!token) {
      console.log('❌ No token found in request');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Please login.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. Invalid or expired token.'
      });
    }
    
    // Get user from token
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.error('❌ User not found for token userId:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
    }

    // Check if user is active
    if (user.status !== 'Active') {
      console.error('❌ User account is not active:', user.status);
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message, error.stack);
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