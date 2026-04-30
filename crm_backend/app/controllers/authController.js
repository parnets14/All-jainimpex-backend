import { generateToken } from '../../utils/jwtUtils.js';
import { setAuthCookie, clearAuthCookie } from '../../utils/cookieUtils.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { dealerSchema } from '../../models/Dealer.js';
import { userSchema } from '../../models/User.js';

// ─── In-memory OTP store (phone → { otp, expiresAt }) ───────────────────────
// OTPs expire after 5 minutes. Cleaned up on each verify call.
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

const saveOTP = (phone, otp) => {
  otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS });
};

const validateOTP = (phone, otp) => {
  const entry = otpStore.get(phone);
  if (!entry) return { valid: false, reason: 'No OTP found. Please request a new one.' };
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if (entry.otp !== otp) {
    return { valid: false, reason: 'Incorrect OTP. Please try again.' };
  }
  otpStore.delete(phone); // one-time use
  return { valid: true };
};

// ─── Company metadata ────────────────────────────────────────────────────────
const COMPANY_INFO = {
  'jain-impex': {
    id: 'jain-impex',
    name: 'Jain Impex',
    tagline: 'Sanitary Ware & Plumbing Products',
  },
  'ridhi': {
    id: 'ridhi',
    name: 'Ridhi Build Mart',
    tagline: 'Premium Plumbing Products',
  },
  'shree-jain-impex': {
    id: 'shree-jain-impex',
    name: 'Shree Jain Impex',
    tagline: 'Complete Sanitary & Plumbing Solutions',
  },
};

const ALL_COMPANIES = Object.keys(COMPANY_INFO);

// ─── Helper: get Dealer + User models for a company ─────────────────────────
const getModels = (company) => {
  const conn = getCompanyConnection(company);
  const Dealer = conn.models.Dealer || conn.model('Dealer', dealerSchema);
  const User   = conn.models.User   || conn.model('User',   userSchema);
  return { Dealer, User, conn };
};

// ─── Helper: normalize phone ─────────────────────────────────────────────────
const normalizePhone = (phone) => {
  if (!phone) return '';
  let n = phone.replace(/\D/g, '');
  if (n.startsWith('91') && n.length === 12) n = n.substring(2);
  return n;
};

// ─── Helper: find dealer across all companies ────────────────────────────────
const findDealerInAllCompanies = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const query = { $or: [{ phone: normalizedPhone }, { phone }] };

  const results = await Promise.all(
    ALL_COMPANIES.map(async (company) => {
      try {
        const { Dealer } = getModels(company);
        const dealer = await Dealer.findOne(query);
        return dealer ? { company, dealer } : null;
      } catch (err) {
        console.error(`Error searching ${company}:`, err.message);
        return null;
      }
    })
  );

  return results.filter(Boolean); // [{company, dealer}, ...]
};

// ─── Helper: find or create User for a dealer ────────────────────────────────
const findOrCreateUser = async (dealer, company) => {
  const { User } = getModels(company);

  let user = await User.findOne({ username: dealer.code, role: 'dealer' });
  if (!user) {
    console.log(`Creating User for dealer ${dealer.code} in ${company}`);
    user = await User.create({
      username: dealer.code,
      name: dealer.name || dealer.contactPerson || 'Dealer',
      email: dealer.email || `${dealer.code.toLowerCase()}@dealer.local`,
      phone: dealer.phone,
      role: 'dealer',
      status: dealer.isActive !== false ? 'Active' : 'Inactive',
      password: 'temp123',
      createdBy: dealer.createdBy || null,
    });
    console.log(`✅ User created for ${dealer.code} in ${company}: ${user._id}`);
  }
  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Send OTP — searches ALL 3 company DBs
// @route   POST /api/app/auth/send-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const found = await findDealerInAllCompanies(phone);

    if (found.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found with this phone number',
      });
    }

    // Generate OTP and store it with TTL
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    saveOTP(normalizePhone(phone), otp);

    console.log(`📱 OTP for ${phone}: ${otp} (found in ${found.map(f => f.company).join(', ')})`);

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      otp, // TODO: Remove in production — send via SMS instead
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify OTP — returns tokens for ALL companies dealer belongs to
// @route   POST /api/app/auth/verify-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number' });
    }

    // Validate OTP against stored value
    const normalizedPhone = normalizePhone(phone);
    const otpCheck = validateOTP(normalizedPhone, otp);
    if (!otpCheck.valid) {
      return res.status(400).json({ success: false, message: otpCheck.reason });
    }

    // Find dealer in all companies
    const found = await findDealerInAllCompanies(phone);

    if (found.length === 0) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    // Build company entries with tokens
    const companies = await Promise.all(
      found.map(async ({ company, dealer }) => {
        try {
          const user = await findOrCreateUser(dealer, company);
          await user.updateLastLogin();

          const token = generateToken(user._id, company);

          return {
            ...COMPANY_INFO[company],
            token,
            user: {
              id: user._id,
              name: user.name,
              email: user.email,
              phone: user.phone || dealer.phone,
              role: user.role,
              dealerId: dealer._id,
              dealerCode: dealer.code,
              dealerName: dealer.name,
            },
            dealer: {
              id: dealer._id,
              code: dealer.code,
              name: dealer.name,
              phone: dealer.phone,
              email: dealer.email,
              address: dealer.address,
              image: dealer.image,
            },
          };
        } catch (err) {
          console.error(`Error processing ${company}:`, err.message);
          return null;
        }
      })
    );

    const validCompanies = companies.filter(Boolean);

    if (validCompanies.length === 0) {
      return res.status(500).json({ success: false, message: 'Failed to process login' });
    }

    // Set cookie for the first company (backward compat)
    setAuthCookie(res, validCompanies[0].token);

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      companiesCount: validCompanies.length,
      companies: validCompanies,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get dealer profile (uses company from JWT via authMiddleware)
// @route   GET /api/app/auth/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const getDealerProfile = async (req, res) => {
  try {
    const company = req.company;
    const { Dealer } = getModels(company);

    const user = req.user;
    const dealer = await Dealer.findOne({ code: user.username });

    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer profile not found' });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || dealer.phone,
        role: user.role,
        dealerId: dealer._id,
        dealerCode: dealer.code,
        dealerName: dealer.name,
        company,
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
        salesTarget: dealer.salesTarget,
        image: dealer.image,
      },
    });
  } catch (error) {
    console.error('Get dealer profile error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout
// @route   POST /api/app/auth/logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
export const logoutDealer = async (req, res) => {
  try {
    clearAuthCookie(res);
    return res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Legacy email/password login (kept for backward compat)
// @route   POST /api/app/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const loginDealer = async (req, res) => {
  return res.status(400).json({
    success: false,
    message: 'Email/password login is deprecated. Please use OTP login.',
  });
};
