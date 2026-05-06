import { verifyToken } from '../../utils/jwtUtils.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';

// Protect routes - verify JWT token and attach correct company DB connection
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    // Verify token — contains userId + company
    const decoded = verifyToken(token);

    if (!decoded.company) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: missing company context',
      });
    }

    // Get the correct company DB connection from token
    const dbConnection = getCompanyConnection(decoded.company);
    const User = dbConnection.models.User || dbConnection.model('User', userSchema);

    // Find user in the correct company DB
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact admin.',
      });
    }

    // Check role
    const userRole = user.role?.toLowerCase().replace(/\s+/g, '_');
    const allowedRoles = ['sales_executive', 'super_admin', 'admin', 'sub_admin'];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Sales Executive or Admin role required.',
      });
    }

    // Attach user, company, and DB connection to request
    // All downstream controllers use req.company to query the right DB
    req.user       = user;
    req.company    = decoded.company;   // e.g. 'jain-impex'
    req.dbConnection = dbConnection;    // ready-to-use mongoose connection

    console.log(`✅ SE Auth: ${user.name} → ${decoded.company} DB`);
    next();

  } catch (error) {
    console.error('SE protect middleware error:', error.message);
    return res.status(401).json({
      success: false,
      message: error.message || 'Not authorized',
    });
  }
};

export default protect;
