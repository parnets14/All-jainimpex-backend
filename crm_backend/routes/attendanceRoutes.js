import express from 'express';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Punch In
router.post('/punch-in', protect, async (req, res) => {
  try {
    const { employeeId, location, faceVerified } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already punched in today
    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    });

    if (existingAttendance && existingAttendance.punchIn) {
      return res.status(400).json({
        success: false,
        message: 'Already punched in for today'
      });
    }

    const attendanceData = {
      employee: employeeId,
      date: today,
      punchIn: {
        time: new Date(),
        location: location || 'Office',
        faceVerified: faceVerified || false
      }
    };

    let attendance;
    if (existingAttendance) {
      attendance = await Attendance.findByIdAndUpdate(
        existingAttendance._id,
        attendanceData,
        { new: true }
      );
    } else {
      attendance = await Attendance.create(attendanceData);
    }

    await attendance.populate('employee', 'name empId designation department');

    res.json({
      success: true,
      message: 'Punch in successful',
      attendance
    });
  } catch (error) {
    console.error('Punch in error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Punch Out
router.post('/punch-out', protect, async (req, res) => {
  try {
    const { employeeId, location, faceVerified } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'No punch in record found for today'
      });
    }

    if (attendance.punchOut && attendance.punchOut.time) {
      return res.status(400).json({
        success: false,
        message: 'Already punched out for today'
      });
    }

    attendance.punchOut = {
      time: new Date(),
      location: location || 'Office',
      faceVerified: faceVerified || false
    };

    await attendance.save();
    await attendance.populate('employee', 'name empId designation department');

    res.json({
      success: true,
      message: 'Punch out successful',
      attendance
    });
  } catch (error) {
    console.error('Punch out error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get today's attendance
router.get('/today', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({ date: today })
      .populate('employee', 'name empId designation department')
      .sort({ 'punchIn.time': -1 });

    res.json({
      success: true,
      attendance
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get attendance with filters
router.get('/', protect, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      employeeId, 
      department, 
      status,
      page = 1, 
      limit = 10 
    } = req.query;

    const filter = {};
    
    // Date filter
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      filter.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.date = { $lte: new Date(endDate) };
    }

    // Employee filter
    if (employeeId) {
      filter.employee = employeeId;
    }

    // Status filter
    if (status && status !== 'All') {
      filter.status = status;
    }

    // Department filter (through employee)
    if (department && department !== 'All') {
      const employees = await Employee.find({ department }).select('_id');
      filter.employee = { $in: employees.map(emp => emp._id) };
    }

    const attendance = await Attendance.find(filter)
      .populate('employee', 'name empId designation department')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Attendance.countDocuments(filter);

    res.json({
      success: true,
      attendance,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Apply for leave
router.post('/leave', protect, async (req, res) => {
  try {
    const { employeeId, startDate, endDate, leaveType, reason } = req.body;

    const leave = await Leave.create({
      employee: employeeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      leaveType,
      reason
    });

    await leave.populate('employee', 'name empId designation department');

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      leave
    });
  } catch (error) {
    console.error('Leave application error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get attendance statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalEmployees = await Employee.countDocuments({ status: 'Active' });
    const presentToday = await Attendance.countDocuments({ 
      date: today, 
      status: { $in: ['Present', 'Late'] } 
    });
    const lateToday = await Attendance.countDocuments({ 
      date: today, 
      status: 'Late' 
    });
    const absentToday = totalEmployees - presentToday;

    // Monthly stats
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyStats = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalEmployees,
        presentToday,
        lateToday,
        absentToday,
        monthlyStats
      }
    });
  } catch (error) {
    console.error('Get attendance stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;