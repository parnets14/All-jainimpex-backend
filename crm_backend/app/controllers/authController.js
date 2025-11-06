import User from '../../models/User.js';
import Dealer from '../../models/Dealer.js';
import { generateToken } from '../../utils/jwtUtils.js';
import { setAuthCookie, clearAuthCookie } from '../../utils/cookieUtils.js';

// @desc    Login dealer (phone/OTP based)
// @route   POST /api/app/auth/login
// @access  Public
export const loginDealer = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and is a dealer
    const user = await User.findOne({ email, role: 'dealer' }).select('+password');
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

    // Get dealer information
    const dealer = await Dealer.findOne({ code: user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer profile not found'
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

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userResponse._id,
        name: userResponse.name,
        email: userResponse.email,
        role: userResponse.role,
        dealerId: dealer._id,
        dealerCode: dealer.code,
        dealerName: dealer.name
      },
      dealer: {
        id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        phone: dealer.phone,
        email: dealer.email,
        address: dealer.address
      }
    });
  } catch (error) {
    console.error('Dealer login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return '';
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  // Remove country code if present (India: 91)
  if (normalized.startsWith('91') && normalized.length === 12) {
    normalized = normalized.substring(2);
  }
  return normalized;
};

// @desc    Send OTP to dealer
// @route   POST /api/app/auth/send-otp
// @access  Public
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Normalize phone number for search
    const normalizedPhone = normalizePhone(phone);

    // Find dealer by phone (try both normalized and exact match)
    const dealer = await Dealer.findOne({
      $or: [
        { phone: normalizedPhone },
        { phone: phone }
      ]
    });
    
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found with this phone number'
      });
    }

    // TODO: Implement OTP sending logic (SMS service)
    // For demo/testing: Generate and return OTP to display on screen
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    res.json({
      success: true,
      message: 'OTP sent successfully',
      // Always return OTP for demo/testing (display on screen)
      otp: otp
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Verify OTP and login
// @route   POST /api/app/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required'
      });
    }

    // TODO: Verify OTP from SMS service
    // For demo/testing: Accept any 6-digit OTP
    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be a 6-digit number'
      });
    }
    // Accept any valid 6-digit OTP for demo/testing

    // Normalize phone number for search
    const normalizedPhone = normalizePhone(phone);

    // Find dealer by phone (try both normalized and exact match)
    const dealer = await Dealer.findOne({
      $or: [
        { phone: normalizedPhone },
        { phone: phone }
      ]
    });
    
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    // Find or create user associated with dealer
    let user = await User.findOne({ username: dealer.code, role: 'dealer' });
    if (!user) {
      // Create user account for dealer if it doesn't exist
      console.log(`Creating User account for dealer ${dealer.code}`);
      user = await User.create({
        username: dealer.code,
        name: dealer.name || dealer.contactPerson || 'Dealer',
        email: dealer.email || `${dealer.code.toLowerCase()}@dealer.local`,
        phone: dealer.phone,
        role: 'dealer',
        status: dealer.isActive !== false ? 'Active' : 'Inactive',
        password: 'temp123', // Temporary password - dealer will use OTP login
        createdBy: dealer.createdBy || null
      });
      console.log(`✅ User account created for dealer ${dealer.code}: ${user._id}`);
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token
    const token = generateToken(user._id);

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || dealer.phone,
        role: user.role,
        dealerId: dealer._id,
        dealerCode: dealer.code,
        dealerName: dealer.name
      },
      dealer: {
        id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        phone: dealer.phone,
        email: dealer.email,
        address: dealer.address
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get dealer profile
// @route   GET /api/app/auth/me
// @access  Private (Dealer)
export const getDealerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get dealer information
    const dealer = await Dealer.findOne({ code: user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer profile not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || dealer.phone,
        role: user.role,
        dealerId: dealer._id,
        dealerCode: dealer.code,
        dealerName: dealer.name
      },
      dealer: {
        id: dealer._id,
        code: dealer.code,
        name: dealer.name,
        contactPerson: dealer.contactPerson,
        phone: dealer.phone,
        email: dealer.email,
        address: dealer.address,
        altAddress: dealer.altAddress,
        dealerType: dealer.dealerType,
        gst: dealer.gst,
        pan: dealer.pan,
        aadhar: dealer.aadhar,
        creditLimit: dealer.creditLimit,
        creditDays: dealer.creditDays,
        salesTarget: dealer.salesTarget
      }
    });
  } catch (error) {
    console.error('Get dealer profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Logout dealer
// @route   POST /api/app/auth/logout
// @access  Private (Dealer)
export const logoutDealer = async (req, res) => {
  try {
    clearAuthCookie(res);
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

