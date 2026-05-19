import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';
import { generateToken as generateJWT } from '../../utils/jwtUtils.js';

// Store OTPs temporarily (in production, use Redis)
const otpStore = new Map();

// All company databases to search
const COMPANIES = [
  {
    id: 'jain-impex',
    dbKey: 'jain-impex',
    name: 'Jain Impex',
    tagline: 'Sanitary Ware & Plumbing Products',
  },
  {
    id: 'ridhi',
    dbKey: 'ridhi',
    name: 'Ridhi Build Mart',
    tagline: 'Premium Plumbing Products',
  },
  {
    id: 'shree-jain-impex',
    dbKey: 'shree-jain-impex',
    name: 'Shree Jain Impex',
    tagline: 'Complete Sanitary & Plumbing Solutions',
  },
];

// Generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateToken = (id, company) => generateJWT(id, company);

// Helper — get User model for a company DB
const getUserModel = (dbKey) => {
  const conn = getCompanyConnection(dbKey);
  return conn.models.User || conn.model('User', userSchema);
};

// @desc    Send OTP — searches all company DBs for the phone number
// @route   POST /api/de/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    // Search all company databases for this phone + delivery_executive role
    const foundIn = [];
    for (const company of COMPANIES) {
      try {
        const User = getUserModel(company.dbKey);
        const user = await User.findOne({ phone, role: 'delivery_executive', status: 'Active' });
        if (user) {
          foundIn.push({ company, userId: user._id });
        }
      } catch (err) {
        console.warn(`Could not search ${company.dbKey}:`, err.message);
      }
    }

    if (foundIn.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active Delivery Executive account found with this phone number',
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    // Store OTP with all companies this user belongs to
    otpStore.set(phone, {
      otp,
      expiresAt,
      companies: foundIn, // [{ company, userId }]
    });

    console.log('='.repeat(50));
    console.log('📱 DELIVERY EXECUTIVE LOGIN OTP');
    console.log('='.repeat(50));
    console.log(`Phone: ${phone}`);
    console.log(`OTP: ${otp}`);
    console.log(`Found in: ${foundIn.map(f => f.company.id).join(', ')}`);
    console.log(`Expires in: 5 minutes`);
    console.log('='.repeat(50));

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      otp, // Remove in production
      phone,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP', error: error.message });
  }
};

// @desc    Verify OTP — returns company list if multiple, or auto-logs in if single
// @route   POST /api/de/auth/verify-otp
// @access  Public
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp, companyId } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    const storedData = otpStore.get(phone);
    if (!storedData) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new OTP' });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const { companies } = storedData;

    // If multiple companies and no companyId selected yet → ask frontend to pick
    if (companies.length > 1 && !companyId) {
      return res.status(200).json({
        success: true,
        requiresSelection: true,
        companies: companies.map(({ company }) => ({
          id: company.id,
          name: company.name,
          tagline: company.tagline,
        })),
      });
    }

    // Determine which company to log into
    let target;
    if (companyId) {
      target = companies.find(c => c.company.id === companyId);
      if (!target) {
        return res.status(400).json({ success: false, message: 'Invalid company selection' });
      }
    } else {
      // Single company — auto select
      target = companies[0];
    }

    // Clear OTP
    otpStore.delete(phone);

    // Get user from the selected company DB
    const User = getUserModel(target.company.dbKey);
    const user = await User.findById(target.userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate unique session ID for single-session enforcement
    const crypto = await import('crypto');
    const sessionId = crypto.randomUUID();

    // Update last login and session ID
    user.lastLogin = new Date();
    user.activeSessionId = sessionId;
    await user.save();

    // Generate token scoped to this company (includes sessionId)
    const token = generateToken(user._id, target.company.dbKey, sessionId);

    console.log('✅ Delivery Executive Login Successful:', user.name, '| Company:', target.company.id, '| Session:', sessionId.substring(0, 8));

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      // Return ALL companies user belongs to (for switch-company feature)
      companies: companies.map(({ company }) => ({
        id: company.id,
        name: company.name,
        tagline: company.tagline,
      })),
      company: {
        id: target.company.id,
        name: target.company.name,
        tagline: target.company.tagline,
      },
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        location: user.location,
        company: target.company.id,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP', error: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/de/auth/me
// @access  Private
export const getProfile = async (req, res) => {
  try {
    const company = req.company || 'jain-impex';
    const User = getUserModel(company);
    const user = await User.findById(req.user.userId || req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
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
        lastLogin: user.lastLogin,
        company,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile', error: error.message });
  }
};

// @desc    Logout
// @route   POST /api/de/auth/logout
// @access  Private
export const logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};
