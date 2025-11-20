import User from '../../models/User.js';
import { generateToken } from '../../utils/jwtUtils.js';

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Login - Send OTP
export const login = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Find user with delivery_executive role
    const user = await User.findOne({ 
      phone, 
      role: 'delivery_executive',
      status: 'Active'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Delivery executive not found with this phone number'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with 5 minute expiry
    otpStore.set(phone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      userId: user._id
    });

    // Log OTP to console for testing
    console.log('='.repeat(50));
    console.log('📱 DELIVERY EXECUTIVE LOGIN OTP');
    console.log('='.repeat(50));
    console.log(`Phone: ${phone}`);
    console.log(`OTP: ${otp}`);
    console.log(`User: ${user.name}`);
    console.log(`Expires in: 5 minutes`);
    console.log('='.repeat(50));

    // In production, send SMS here
    // await sendSMS(phone, `Your OTP is: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      // For testing - show OTP in response
      otp: otp,
      expiresIn: '5 minutes'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
};

// Verify OTP and Login
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required'
      });
    }

    // Check if OTP exists
    const otpData = otpStore.get(phone);

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP'
      });
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP'
      });
    }

    // Verify OTP
    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // OTP is valid, get user
    const user = await User.findById(otpData.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Clear OTP
    otpStore.delete(phone);

    // Generate JWT token using shared utility (ensures same JWT_SECRET)
    const token = generateToken(user._id);
    
    console.log('🔐 Token generated using shared utility');
    console.log('🔐 Token length:', token.length);
    console.log('🔐 JWT_SECRET used:', process.env.JWT_SECRET ? 'from env' : 'fallback');

    console.log('✅ Delivery Executive Login Successful:', user.name);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        location: user.location
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message
    });
  }
};

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        location: user.location,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

// Logout
export const logout = async (req, res) => {
  try {
    // In a real app, you might want to blacklist the token
    // For now, just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout',
      error: error.message
    });
  }
};
