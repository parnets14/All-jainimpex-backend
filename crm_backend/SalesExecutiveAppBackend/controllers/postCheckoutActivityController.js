import { getModels } from '../utils/getModels.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';

const ATTENDANCE_MASTER_COMPANY = 'jain-impex';

/**
 * Resolve the master (jain-impex) userId for this SE.
 */
const getMasterUserId = async (req) => {
  if (req.company === ATTENDANCE_MASTER_COMPANY) return req.user._id;
  const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);
  const MasterUser = masterConn.models.User || masterConn.model('User', userSchema);
  const phone = req.user.phone;
  if (!phone) return req.user._id;
  const masterUser = await MasterUser.findOne({ phone, role: 'sales_executive', status: 'Active' })
    .select('_id').lean();
  return masterUser ? masterUser._id : req.user._id;
};

// @desc    Log a post-checkout app open (SE calls this when they open the app after check-out)
// @route   POST /api/se/post-checkout-activity
// @access  Private (Sales Executive)
export const logPostCheckoutActivity = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = await getMasterUserId(req);
    const { SEAttendance, PostCheckoutActivity } = getModels(req);

    // Verify that the SE has already checked out today
    const today = new Date().setHours(0, 0, 0, 0);
    const attendance = await SEAttendance.findOne({ user: userId, date: today });

    if (!attendance || !attendance.checkOutTime) {
      return res.status(400).json({
        success: false,
        message: 'SE has not checked out today — no post-checkout activity to log',
      });
    }

    const activity = await PostCheckoutActivity.create({
      user: userId,
      date: today,
      openedAt: new Date(),
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude) || 0, parseFloat(latitude) || 0],
        address: address || '',
      },
      action: 'app_open',
    });

    res.status(201).json({
      success: true,
      message: 'Post-checkout activity logged',
      activity,
    });
  } catch (error) {
    console.error('Log post-checkout activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to log activity', error: error.message });
  }
};

// @desc    Get post-checkout activities (Admin view — all SEs or specific SE)
// @route   GET /api/se/post-checkout-activity
// @access  Private (Admin)
export const getPostCheckoutActivities = async (req, res) => {
  try {
    const { PostCheckoutActivity } = getModels(req);
    const { userId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (userId) {
      filter.user = userId;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.openedAt = {};
      if (startDate) filter.openedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.openedAt.$lte = end;
      }
    } else {
      // Default: today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      filter.openedAt = { $gte: todayStart, $lte: todayEnd };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [activities, total] = await Promise.all([
      PostCheckoutActivity.find(filter)
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'name phone email role')
        .lean(),
      PostCheckoutActivity.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      activities,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('Get post-checkout activities error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activities', error: error.message });
  }
};

// @desc    Check tracking status — tells the app if it should be tracking
// @route   GET /api/se/tracking-status
// @access  Private (Sales Executive)
export const getTrackingStatus = async (req, res) => {
  try {
    const userId = await getMasterUserId(req);
    const { SEAttendance } = getModels(req);

    const today = new Date().setHours(0, 0, 0, 0);
    const attendance = await SEAttendance.findOne({ user: userId, date: today }).lean();

    // Check IST time — no tracking after 23:59 IST
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const istHour = nowIST.getUTCHours();
    const istMin = nowIST.getUTCMinutes();
    const pastMidnightIST = istHour >= 23 && istMin >= 59;

    let shouldTrack = false;
    let reason = 'not_checked_in';

    if (!attendance || !attendance.checkInTime) {
      reason = 'not_checked_in';
    } else if (attendance.checkOutTime) {
      reason = 'checked_out';
    } else if (pastMidnightIST) {
      reason = 'past_midnight_ist';
    } else {
      shouldTrack = true;
      reason = 'active';
    }

    res.status(200).json({
      success: true,
      shouldTrack,
      reason,
      checkInTime: attendance?.checkInTime || null,
      checkOutTime: attendance?.checkOutTime || null,
    });
  } catch (error) {
    console.error('Get tracking status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get tracking status', error: error.message });
  }
};
