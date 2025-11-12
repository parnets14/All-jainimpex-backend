import { generateToken as generateJWT } from '../../utils/jwtUtils.js';
import User from '../../models/User.js';

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate JWT Token (wrapper to match the utility function signature)
const generateToken = (id) => {
  return generateJWT(id); // Uses the shared utility with 30d expiry
};

// @desc    Send OTP to phone number
// @route   POST /api/se/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    // Find user by phone number
    const user = await User.findOne({ phone, role: 'sales_executive' });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Sales Executive not found with this phone number',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact admin.',
      });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiry (5 minutes)
    otpStore.set(phone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      userId: user._id,
    });

    // TODO: Send OTP via SMS gateway (Twilio, MSG91, etc.)
    // For now, return OTP in response for testing
    console.log(`OTP for ${phone}: ${otp}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      otp, // Remove this in production
      phone,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

// @desc    Verify OTP and login
// @route   POST /api/se/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }

    // Get stored OTP
    const storedData = otpStore.get(phone);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or invalid',
      });
    }

    // Check if OTP expired
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({
        success: false,
        message: 'OTP expired',
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // Get user
    const user = await User.findById(storedData.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Clear OTP
    otpStore.delete(phone);

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedRegions: user.assignedRegions || [],
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message,
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/se/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedRegions: user.assignedRegions || [],
        location: user.location,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message,
    });
  }
};

// @desc    Logout
// @route   POST /api/se/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    // In a real app, you might want to blacklist the token
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout',
      error: error.message,
    });
  }
};
