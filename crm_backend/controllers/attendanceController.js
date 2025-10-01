// controllers/attendanceController.js
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';

// Helper function to get start and end of day
const getDayRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

// Punch in
export const punchIn = async (req, res) => {
  try {
    const { employeeId, location, coordinates, image } = req.body;
    const today = new Date();
    const { start, end } = getDayRange(today);

    // Check if already punched in today
    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end }
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Already punched in for today'
      });
    }

    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Calculate if late (assuming 9:00 AM start time)
    const punchInTime = new Date();
    const lateTime = new Date();
    lateTime.setHours(9, 0, 0, 0); // 9:00 AM
    
    let status = 'Present';
    let lateMinutes = 0;

    if (punchInTime > lateTime) {
      status = 'Late';
      lateMinutes = Math.round((punchInTime - lateTime) / (1000 * 60));
    }

    const attendance = await Attendance.create({
      employee: employeeId,
      date: today,
      punchIn: {
        time: punchInTime,
        location,
        coordinates,
        image
      },
      status,
      lateMinutes,
      createdBy: req.user._id
    });

    await attendance.populate('employee', 'name empId designation department');

    res.status(201).json({
      success: true,
      message: 'Punched in successfully',
      attendance
    });
  } catch (error) {
    console.error('Punch in error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Punch out
export const punchOut = async (req, res) => {
  try {
    const { employeeId, location, coordinates, image } = req.body;
    const today = new Date();
    const { start, end } = getDayRange(today);

    // Find today's attendance
    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end }
    }).populate('employee', 'name empId designation department');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'No punch-in record found for today'
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
      location,
      coordinates,
      image
    };

    await attendance.save();

    res.json({
      success: true,
      message: 'Punched out successfully',
      attendance
    });
  } catch (error) {
    console.error('Punch out error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get attendance records with pagination and filters
export const getAttendance = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      employeeId,
      department,
      startDate,
      endDate,
      status,
      month,
      year
    } = req.query;

    const filter = {};

    if (employeeId) {
      filter.employee = employeeId;
    }

    if (department && department !== 'All') {
      const employees = await Employee.find({ department }).select('_id');
      filter.employee = { $in: employees.map(emp => emp._id) };
    }

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      filter.date = { $gte: start, $lte: end };
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    const attendance = await Attendance.find(filter)
      .populate('employee', 'name empId designation department')
      .populate('createdBy', 'name')
      .sort({ date: -1, 'punchIn.time': -1 })
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
};

// Get today's attendance status for an employee
export const getTodayAttendance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const today = new Date();
    const { start, end } = getDayRange(today);

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end }
    }).populate('employee', 'name empId designation department');

    res.json({
      success: true,
      attendance: attendance || null
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get attendance summary
export const getAttendanceSummary = async (req, res) => {
  try {
    const { month, year, department } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const matchStage = {
      date: { $gte: startDate, $lte: endDate }
    };

    if (department && department !== 'All') {
      const employees = await Employee.find({ department }).select('_id');
      matchStage.employee = { $in: employees.map(emp => emp._id) };
    }

    const summary = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalHours: { $sum: '$totalHours' },
          totalLateMinutes: { $sum: '$lateMinutes' },
          totalOvertime: { $sum: '$overtimeMinutes' }
        }
      }
    ]);

    const totalEmployees = await Employee.countDocuments(
      department && department !== 'All' ? { department } : {}
    );

    // Calculate present days for each employee
    const employeeAttendance = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$employee',
          presentDays: { $sum: 1 }
        }
      }
    ]);

    const presentEmployees = employeeAttendance.length;
    const absentEmployees = totalEmployees - presentEmployees;

    res.json({
      success: true,
      summary: {
        statusBreakdown: summary,
        totalEmployees,
        presentEmployees,
        absentEmployees,
        totalWorkHours: summary.reduce((sum, item) => sum + (item.totalHours || 0), 0),
        totalOvertime: summary.reduce((sum, item) => sum + (item.totalOvertime || 0), 0)
      }
    });
  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update attendance (admin only)
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const attendance = await Attendance.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('employee', 'name empId designation department');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      attendance
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete attendance (admin only)
export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByIdAndDelete(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};