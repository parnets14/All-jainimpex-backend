import { getModels } from '../utils/getModels.js';
import { getCompanyConnection } from '../../config/multiDatabase.js';
import { userSchema } from '../../models/User.js';
import { employeeSchema } from '../../models/Employee.js';
import { attendanceSchema as hrmsAttendanceSchema } from '../../models/Attendance.js';
import path from 'path';
import fs from 'fs';

// Master company where all SE Attendance records are stored
const ATTENDANCE_MASTER_COMPANY = 'jain-impex';

/**
 * Resolve the master (jain-impex) userId for this SE.
 * Since the same person can have different _id in each company DB,
 * we match by phone number to find their jain-impex identity.
 * Falls back to the current user's _id if they're already on jain-impex
 * or if no match is found (so attendance still works).
 */
const getMasterUserId = async (req) => {
  // If already logged into jain-impex, just use the current _id
  if (req.company === ATTENDANCE_MASTER_COMPANY) {
    return req.user._id;
  }

  // Find this user's jain-impex counterpart by phone
  const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);
  const MasterUser = masterConn.models.User || masterConn.model('User', userSchema);
  const phone = req.user.phone;

  if (!phone) return req.user._id; // fallback

  const masterUser = await MasterUser.findOne({ phone, role: 'sales_executive', status: 'Active' })
    .select('_id')
    .lean();

  return masterUser ? masterUser._id : req.user._id;
};

// @desc    Check-in with GPS and selfie
// @route   POST /api/se/attendance/check-in
// @access  Private (Sales Executive)
export const checkIn = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = await getMasterUserId(req); // Always use jain-impex userId
    const { SEAttendance } = getModels(req);

    const today = new Date().setHours(0, 0, 0, 0);
    const existingAttendance = await SEAttendance.findOne({
      user: userId,
      date: today,
    });

    if (existingAttendance && existingAttendance.checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in today',
      });
    }

    let checkInSelfie = '';
    if (req.file) {
      checkInSelfie = `/uploads/selfies/${req.file.filename}`;
    }

    const checkInTime = new Date();
    const attendanceData = {
      user: userId,
      date: today,
      checkInTime,
      checkInLocation: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        address: address || '',
      },
      checkInSelfie,
    };

    const checkInHour = checkInTime.getHours();
    const checkInMinute = checkInTime.getMinutes();
    const lateThreshold = 9 * 60 + 30;
    const checkInMinutes = checkInHour * 60 + checkInMinute;
    
    if (checkInMinutes > lateThreshold) {
      attendanceData.status = 'late';
    }

    let attendance;
    if (existingAttendance) {
      attendance = await SEAttendance.findByIdAndUpdate(
        existingAttendance._id,
        attendanceData,
        { new: true }
      );
    } else {
      attendance = await SEAttendance.create(attendanceData);
    }

    // Sync to HRMS Attendance (Option A): find the linked Employee record and
    // write a session so the HRMS salary/attendance system sees this punch.
    // Always syncs to jain-impex HRMS since that's where attendance is managed.
    try {
      const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);
      const Employee = masterConn.models.Employee || masterConn.model('Employee', employeeSchema);
      const HRMSAttendance = masterConn.models.Attendance || masterConn.model('Attendance', hrmsAttendanceSchema);
      const linkedEmp = await Employee.findOne({ linkedUserId: userId, status: 'Active' }).select('_id').lean();
      if (linkedEmp) {
        const istMid = (d) => { const ms = new Date(d).getTime()+5.5*3600000; const ist=new Date(ms); ist.setUTCHours(0,0,0,0); return new Date(ist.getTime()-5.5*3600000); };
        const dayStart = istMid(checkInTime);
        let hrmsAtt = await HRMSAttendance.findOne({ employee: linkedEmp._id, date: dayStart });
        if (!hrmsAtt) hrmsAtt = new HRMSAttendance({ employee: linkedEmp._id, date: dayStart, sessions: [] });
        // Add a new open session (check-in, no out yet)
        const sessions = hrmsAtt.sessions || [];
        const hasOpenApp = sessions.some(s => s.in?.source === 'app' && !s.out?.time);
        if (!hasOpenApp) {
          sessions.push({ in: { time: checkInTime, location: address || 'Field', source: 'app' } });
          hrmsAtt.sessions = sessions;
          hrmsAtt.markModified('sessions');
          await hrmsAtt.save();
        }
      }
    } catch (syncErr) {
      console.error('SE→HRMS attendance sync (check-in) failed:', syncErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Checked in successfully',
      attendance,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check in',
      error: error.message,
    });
  }
};

// @desc    Check-out with GPS
// @route   POST /api/se/attendance/check-out
// @access  Private (Sales Executive)
export const checkOut = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = await getMasterUserId(req); // Always use jain-impex userId
    const { SEAttendance } = getModels(req);

    const today = new Date().setHours(0, 0, 0, 0);
    const attendance = await SEAttendance.findOne({
      user: userId,
      date: today,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'No check-in found for today',
      });
    }

    if (attendance.checkOutTime) {
      return res.status(400).json({
        success: false,
        message: 'Already checked out today',
      });
    }

    let checkOutSelfie = '';
    if (req.file) {
      checkOutSelfie = `/uploads/selfies/${req.file.filename}`;
    }

    attendance.checkOutTime = new Date();
    attendance.checkOutLocation = {
      type: 'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
      address: address || '',
    };
    if (checkOutSelfie) {
      attendance.checkOutSelfie = checkOutSelfie;
    }

    await attendance.save();

    // Sync to HRMS Attendance: close the open 'app' session for this employee today
    // Always syncs to jain-impex HRMS since that's where attendance is managed.
    try {
      const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);
      const Employee = masterConn.models.Employee || masterConn.model('Employee', employeeSchema);
      const HRMSAttendance = masterConn.models.Attendance || masterConn.model('Attendance', hrmsAttendanceSchema);
      const linkedEmp = await Employee.findOne({ linkedUserId: userId, status: 'Active' }).select('_id').lean();
      if (linkedEmp) {
        const istMid = (d) => { const ms = new Date(d).getTime()+5.5*3600000; const ist=new Date(ms); ist.setUTCHours(0,0,0,0); return new Date(ist.getTime()-5.5*3600000); };
        const dayStart = istMid(new Date());
        const hrmsAtt = await HRMSAttendance.findOne({ employee: linkedEmp._id, date: dayStart });
        if (hrmsAtt) {
          const sessions = hrmsAtt.sessions || [];
          const openIdx = sessions.findIndex(s => s.in?.source === 'app' && !s.out?.time);
          if (openIdx >= 0) {
            sessions[openIdx].out = { time: attendance.checkOutTime, location: address || 'Field', source: 'app' };
            hrmsAtt.sessions = sessions;
            hrmsAtt.markModified('sessions');
            await hrmsAtt.save();
          }
        }
      }
    } catch (syncErr) {
      console.error('SE→HRMS attendance sync (check-out) failed:', syncErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Checked out successfully',
      attendance,
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check out',
      error: error.message,
    });
  }
};

// @desc    Get today's attendance
// @route   GET /api/se/attendance/today
// @access  Private (Sales Executive)
export const getTodayAttendance = async (req, res) => {
  try {
    const userId = await getMasterUserId(req); // Always use jain-impex userId
    const today = new Date().setHours(0, 0, 0, 0);
    const { SEAttendance } = getModels(req);

    const attendance = await SEAttendance.findOne({
      user: userId,
      date: today,
    });

    res.status(200).json({
      success: true,
      attendance: attendance || null,
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance',
      error: error.message,
    });
  }
};

// @desc    Get attendance history
// @route   GET /api/se/attendance/history
// @access  Private (Sales Executive)
export const getAttendanceHistory = async (req, res) => {
  try {
    const userId = await getMasterUserId(req); // Always use jain-impex userId
    const { startDate, endDate, page = 1, limit = 30 } = req.query;
    const { SEAttendance } = getModels(req);

    const query = { user: userId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [attendances, total] = await Promise.all([
      SEAttendance.find(query)
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SEAttendance.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      attendances,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get attendance history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance history',
      error: error.message,
    });
  }
};

// @desc    Get all attendance records (Admin/Web view) — all companies see centralized attendance
// @route   GET /api/se/attendance/all
// @access  Private (Admin)
export const getAllAttendance = async (req, res) => {
  try {
    const { date, userId, startDate, endDate, page = 1, limit = 100 } = req.query;
    const { SEAttendance } = getModels(req);

    // User info is always from jain-impex (master) since that's where userIds are from
    const masterConn = getCompanyConnection(ATTENDANCE_MASTER_COMPANY);
    const MasterUser = masterConn.models.User || masterConn.model('User', userSchema);

    const query = {};

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end   = new Date(endDate); end.setHours(23, 59, 59, 999);
      query.date  = { $gte: start, $lte: end };
    }

    if (userId) query.user = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [attendances, total] = await Promise.all([
      SEAttendance.find(query)
        .sort({ date: -1, checkInTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SEAttendance.countDocuments(query),
    ]);

    // Get user info — search ALL company DBs since SEs may only exist in one company
    const userIds = [...new Set(attendances.map(a => a.user?.toString()).filter(Boolean))];
    const userMap = {};

    if (userIds.length > 0) {
      // First try master (jain-impex)
      const users = await MasterUser.find({ _id: { $in: userIds } }).select('name phone email').lean();
      users.forEach(u => { userMap[u._id.toString()] = u; });

      // For any userIds NOT found in jain-impex, search other company DBs
      const missingIds = userIds.filter(id => !userMap[id]);
      if (missingIds.length > 0) {
        const ALL_COMPANIES = ['ridhi', 'shree-jain-impex'];
        for (const company of ALL_COMPANIES) {
          if (missingIds.length === 0) break;
          try {
            const conn = getCompanyConnection(company);
            const CompanyUser = conn.models.User || conn.model('User', userSchema);
            const found = await CompanyUser.find({ _id: { $in: missingIds } }).select('name phone email').lean();
            found.forEach(u => {
              userMap[u._id.toString()] = u;
              const idx = missingIds.indexOf(u._id.toString());
              if (idx >= 0) missingIds.splice(idx, 1);
            });
          } catch (e) { /* skip company if connection fails */ }
        }
      }
    }

    // Attach user info
    const enriched = attendances
      .map(a => ({
        ...a,
        user: userMap[a.user?.toString()] || null,
      }))
      .filter(a => a.user !== null);

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(enriched.length / parseInt(limit)),
        totalItems: enriched.length,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get all attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to get attendance records', error: error.message });
  }
};
