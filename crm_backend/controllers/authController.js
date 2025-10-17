// controllers/authController.js
import User from '../models/User.js';
import { generateToken } from '../utils/jwtUtils.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookieUtils.js';
import { logAuthActivity } from '../middleware/activityLogMiddleware.js';

// Login - with role-based authentication
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
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
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    // Remove password from response
    const userResponse = await User.findById(user._id).select('-password');

    // Log login activity
    await logAuthActivity(userResponse, 'LOGIN', {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
    });

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
        lastLogin: userResponse.lastLogin,
        phone: userResponse.phone,
        location: userResponse.location
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
    const user = await User.findById(req.user._id).select('-password');
    
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
        lastLogin: user.lastLogin,
        phone: user.phone,
        location: user.location,
        joinDate: user.joinDate,
        createdAt: user.createdAt
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