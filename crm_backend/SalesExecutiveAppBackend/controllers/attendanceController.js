import { getModels } from '../utils/getModels.js';
import path from 'path';
import fs from 'fs';

// @desc    Check-in with GPS and selfie
// @route   POST /api/se/attendance/check-in
// @access  Private (Sales Executive)
export const checkIn = async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = req.user._id;
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
    const userId = req.user._id;
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
    const userId = req.user._id;
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
    const userId = req.user._id;
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

// @desc    Get all attendance records (Admin/Web view) — filtered by admin's company
// @route   GET /api/se/attendance/all
// @access  Private (Admin)
export const getAllAttendance = async (req, res) => {
  try {
    const { date, userId, startDate, endDate, page = 1, limit = 100 } = req.query;
    const { SEAttendance, User } = getModels(req);

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

    // Get user info from the same company DB (already on req.dbConnection)
    const userIds = [...new Set(attendances.map(a => a.user?.toString()).filter(Boolean))];
    const userMap = {};

    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } }).select('name phone email').lean();
      users.forEach(u => { userMap[u._id.toString()] = u; });
    }

    // Attach user info — only include records where user was found in this company
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
