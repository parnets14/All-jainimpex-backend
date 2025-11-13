import { verifyToken } from '../../utils/jwtUtils.js';
import User from '../../models/User.js';

// Protect routes for admin/web access - verify JWT token
const protectAdmin = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers (same as CRM's protect middleware)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    console.log('🔐 SE Admin Auth Check:', {
      hasAuth: !!req.headers.authorization,
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
    });

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token using the same utility as CRM
      const decoded = verifyToken(token);
      console.log('✅ Token decoded:', { userId: decoded.userId });

      // Get user from token (using userId like CRM does)
      req.user = await User.findById(decoded.userId).select('-password');

      if (!req.user) {
        console.log('❌ User not found in database');
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      console.log('✅ User found:', { id: req.user._id, role: req.user.role, email: req.user.email });

      // Allow admin, super_admin, and hr_manager to view attendance
      const allowedRoles = ['super_admin', 'admin', 'hr_manager', 'sales_executive'];
      if (!allowedRoles.includes(req.user.role)) {
        console.log('❌ Role not allowed:', req.user.role);
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.',
        });
      }

      console.log('✅ Access granted for role:', req.user.role);
      next();
    } catch (error) {
      console.log('❌ Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
      });
    }
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication',
    });
  }
};

export default protectAdmin;
