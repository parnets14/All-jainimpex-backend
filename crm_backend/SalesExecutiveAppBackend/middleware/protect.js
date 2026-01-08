import { verifyToken } from '../../utils/jwtUtils.js';
import User from '../../models/User.js';

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token using shared utility
      const decoded = verifyToken(token);

      // Get user from token (using userId from shared utility)
      req.user = await User.findById(decoded.userId).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if user is sales executive, admin, or sub_admin (case-insensitive check)
      const userRole = req.user.role?.toLowerCase().replace(/\s+/g, '_');
      const allowedRoles = ['sales_executive', 'super_admin', 'admin', 'sub_admin'];
      
      if (!allowedRoles.includes(userRole)) {
        console.log(`⚠️ Access denied for role: ${req.user.role} (normalized: ${userRole})`);
        return res.status(403).json({
          success: false,
          message: 'Access denied. Sales Executive or Admin role required.',
        });
      }
      
      console.log(`✅ Access granted for role: ${req.user.role}`);

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication',
    });
  }
};

export default protect;
