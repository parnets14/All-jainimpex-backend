import { verifyToken } from '../../utils/jwtUtils.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';

// Helper — get User model for a company DB
const getUserModel = (dbKey) => {
  const conn = getCompanyConnection(dbKey);
  return conn.models.User || conn.model('User', userSchema);
};

export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
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

    // Extract company from token (multi-company support)
    const company = decoded.company || 'jain-impex';

    // Get user from the correct company database
    const User = getUserModel(company);
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

    // Attach user and company to request
    req.user = {
      userId: user._id,
      _id: user._id,
      role: user.role,
      phone: user.phone,
      name: user.name
    };
    req.company = company;

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
