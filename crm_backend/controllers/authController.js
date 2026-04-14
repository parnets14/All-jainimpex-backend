// controllers/authController.js
import { getCompanyConnection } from '../config/multiDatabase.js';
import { userSchema } from '../models/User.js';
import { generateToken } from '../utils/jwtUtils.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookieUtils.js';
import { logAuthActivity } from '../middleware/activityLogMiddleware.js';

// Login - with role-based authentication and company support
export const login = async (req, res) => {
  try {
    console.log('🔐 Login request received');
    console.log('🔐 Request body:', JSON.stringify(req.body, null, 2));
    
    const { email, password, company } = req.body;

    console.log('🔐 Extracted values:');
    console.log('   Email:', email);
    console.log('   Password:', password ? '***' : 'missing');
    console.log('   Company:', company);

    // Validate company
    if (!company) {
      console.log('❌ Company validation failed - company is:', company);
      return res.status(400).json({
        success: false,
        message: 'Company identifier is required'
      });
    }

    console.log(`🔐 Login attempt for ${email} at company: ${company}`);

    // Get company-specific database connection
    const dbConnection = getCompanyConnection(company);
    
    // Get User model from company-specific database
    // Check if model already exists, otherwise create it
    const User = dbConnection.models.User || dbConnection.model('User', userSchema);

    // Check if user exists in this company's database
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log(`❌ User not found: ${email} in ${company} database`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token with company information
    const token = generateToken(user._id, company);

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    // Remove password from response
    const userResponse = await User.findById(user._id).select('-password');

    // Log login activity
    await logAuthActivity(userResponse, 'LOGIN', {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      company: company
    });

    console.log(`✅ Login successful for ${email} at ${company}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userResponse._id,
        name: userResponse.name,
        username: userResponse.username,
        email: userResponse.email,
        role: userResponse.role,
        status: userResponse.status,
        permissions: userResponse.permissions,
        assignedRegions: userResponse.assignedRegions,
        allowedDiscountLevels: userResponse.allowedDiscountLevels,
        lastLogin: userResponse.lastLogin,
        phone: userResponse.phone,
        location: userResponse.location,
        company: company // Include company in response
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get current user (Protected route)
export const getCurrentUser = async (req, res) => {
  try {
    // User is already attached by protect middleware with company info
    const User = req.dbConnection.models.User || req.dbConnection.model('User', userSchema);
    const user = await User.findById(req.user._id || req.user.id).select('-password');
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
        assignedRegions: user.assignedRegions,
        allowedDiscountLevels: user.allowedDiscountLevels,
        lastLogin: user.lastLogin,
        phone: user.phone,
        location: user.location,
        joinDate: user.joinDate,
        createdAt: user.createdAt,
        company: req.company // Include company from token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Logout route - Clear cookie
export const logout = async (req, res) => {
  try {
    // Log logout activity
    if (req.user) {
      await logAuthActivity(req.user, 'LOGOUT', {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
      });
    }

    clearAuthCookie(res);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Check authentication status
export const checkAuth = (req, res) => {
  res.json({
    success: true,
    message: 'User is authenticated',
    user: {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
};