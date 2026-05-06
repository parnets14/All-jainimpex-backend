import { verifyToken } from '../../utils/jwtUtils.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';
import User from '../../models/User.js'; // fallback default DB

// Protect routes for admin/web access
// Supports both: CRM web token (has company) and legacy tokens (no company)
const protectAdmin = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized — no token' });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Try company-specific DB first (if token has company)
    let user = null;
    if (decoded.company) {
      try {
        const conn = getCompanyConnection(decoded.company);
        const UserModel = conn.models.User || conn.model('User', userSchema);
        user = await UserModel.findById(decoded.userId).select('-password');
        if (user) req.company = decoded.company;
      } catch (e) {
        console.warn(`protectAdmin: company DB lookup failed for ${decoded.company}:`, e.message);
      }
    }

    // Fallback to default DB (legacy tokens without company)
    if (!user) {
      user = await User.findById(decoded.userId).select('-password');
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const allowedRoles = ['super_admin', 'admin', 'sub_admin', 'hr_manager', 'sales_executive'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }

    req.user = user;
    console.log(`✅ SE Admin Auth: ${user.name} (${user.role}) → company: ${req.company || 'default'}`);
    next();
  } catch (error) {
    console.error('protectAdmin error:', error);
    res.status(500).json({ success: false, message: 'Server error in authentication' });
  }
};

export default protectAdmin;
