import { verifyToken } from '../../utils/jwtUtils.js';
import User from '../../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Log token status for debugging (only in development)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 DE Auth check - URL: ${req.method} ${req.path}`);
      console.log(`🔐 Token present: ${!!token}, Token length: ${token ? token.length : 0}`);
    }

    if (!token) {
      console.log('❌ No token found in request');
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Please login'
      });
    }

    // Verify token using shared utility
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (verifyError) {
      console.error('Token verification failed:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Invalid or expired token.'
      });
    }

    // Get user from token
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive'
      });
    }

    // Attach user to request (matching format used in other parts of the app)
    req.user = {
      userId: user._id,
      _id: user._id, // Also add _id for compatibility
      role: user.role,
      phone: user.phone,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Not authorized. Invalid token'
    });
  }
};

// Middleware to check if user is delivery executive
export const isDeliveryExecutive = (req, res, next) => {
  if (req.user.role !== 'delivery_executive') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Delivery executive role required'
    });
  }
  next();
};
