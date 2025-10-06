import express from "express";
import Attendance from "../models/Attendance.js";
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Punch In
router.post("/punch-in", protect, async (req, res) => {
  try {
    const { employeeId, location, faceVerified } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already punched in today
    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: today,
    });

    if (existingAttendance && existingAttendance.punchIn) {
      return res.status(400).json({
        success: false,
        message: "Already punched in for today",
      });
    }

    const attendanceData = {
      employee: employeeId,
      date: today,
      punchIn: {
        time: new Date(),
        location: location || "Office",
        faceVerified: faceVerified || false,
      },
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

    await attendance.populate("employee", "name empId designation department");

    res.json({
      success: true,
      message: "Punch in successful",
      attendance,
    });
  } catch (error) {
    console.error("Punch in error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Punch Out
router.post("/punch-out", protect, async (req, res) => {
  try {
    const { employeeId, location, faceVerified } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today,
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No punch in record found for today",
      });
    }

    if (attendance.punchOut && attendance.punchOut.time) {
      return res.status(400).json({
        success: false,
        message: "Already punched out for today",
      });
    }

    attendance.punchOut = {
      time: new Date(),
      location: location || "Office",
      faceVerified: faceVerified || false,
    };

    await attendance.save();
    await attendance.populate("employee", "name empId designation department");

    res.json({
      success: true,
      message: "Punch out successful",
      attendance,
    });
  } catch (error) {
    console.error("Punch out error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get today's attendance
router.get("/today", protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({ date: today })
      .populate("employee", "name empId designation department")
      .sort({ "punchIn.time": -1 });

    res.json({
      success: true,
      attendance,
    });
  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get attendance with filters and auto-absent
router.get("/", protect, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      employeeId,
      department,
      status,
      page = 1,
      limit = 10,
      includeAbsent = "true", // New parameter to include absent employees
      search, // Add search parameter
    } = req.query;

    console.log("Attendance API called with params:", req.query);

    // Default to today if no date specified
    const today = new Date();
    console.log("Today date:", today.toISOString());
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // End of day

      dateFilter = {
        $gte: start,
        $lte: end,
      };
    } else if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(startDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        $gte: start,
        $lte: end,
      };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { $lte: end };
    } else {
      // Default to today
      dateFilter = {
        $gte: today,
        $lt: tomorrow,
      };
    }

    // Get all active employees
    let employeeFilter = { status: "Active" };
    if (department && department !== "All") {
      employeeFilter.department = department;
    }
    if (employeeId) {
      employeeFilter._id = employeeId;
    }
    if (search) {
      employeeFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { empId: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
      ];
    }

    const allEmployees = await Employee.find(employeeFilter)
      .select("name empId designation department")
      .sort({ name: 1 });

    // Get attendance records for the date range
    const attendanceFilter = {
      date: dateFilter,
    };

    if (employeeId) {
      attendanceFilter.employee = employeeId;
    } else if (department && department !== "All") {
      const deptEmployees = await Employee.find({ department }).select("_id");
      attendanceFilter.employee = { $in: deptEmployees.map((emp) => emp._id) };
    }

    const attendanceRecords = await Attendance.find(attendanceFilter)
      .populate("employee", "name empId designation department")
      .sort({ date: -1, "punchIn.time": -1 });

    console.log("Date filter applied:", dateFilter);
    console.log(`Found ${attendanceRecords.length} attendance records`);
    console.log(`Found ${allEmployees.length} employees`);

    // Filter out records with null employees (orphaned records)
    const validAttendanceRecords = attendanceRecords.filter((record) => {
      if (!record.employee) {
        console.warn(`Orphaned attendance record found: ${record._id}`);
        return false;
      }
      return true;
    });

    // Create a map of employee attendance
    const attendanceMap = new Map();
    validAttendanceRecords.forEach((record) => {
      const empId = record.employee._id.toString();
      const dateKey = record.date.toISOString().split("T")[0];
      const key = `${empId}-${dateKey}`;
      attendanceMap.set(key, record);
    });

    // Generate complete attendance list with absent employees
    let completeAttendance = [];

    if (includeAbsent === "true") {
      // Get date range for iteration
      let startIterDate, endIterDate;

      if (startDate && endDate) {
        startIterDate = new Date(startDate);
        endIterDate = new Date(endDate);
      } else if (startDate) {
        startIterDate = new Date(startDate);
        endIterDate = new Date(startDate); // Same day
      } else {
        startIterDate = new Date(today);
        endIterDate = new Date(today);
      }

      startIterDate.setHours(0, 0, 0, 0);
      endIterDate.setHours(0, 0, 0, 0);

      console.log(
        "Date iteration range:",
        startIterDate.toISOString(),
        "to",
        endIterDate.toISOString()
      );

      for (
        let d = new Date(startIterDate);
        d <= endIterDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dateKey = d.toISOString().split("T")[0];

        allEmployees.forEach((employee) => {
          const key = `${employee._id}-${dateKey}`;
          const existingRecord = attendanceMap.get(key);

          if (existingRecord) {
            completeAttendance.push(existingRecord);
          } else {
            // Skip weekends when creating absent records
            const dayOfWeek = new Date(d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              // Not Sunday or Saturday
              // Create absent record
              completeAttendance.push({
                _id: `absent-${employee._id}-${dateKey}`,
                employee: employee,
                date: new Date(d),
                status: "Absent",
                punchIn: null,
                punchOut: null,
                isAbsent: true,
              });
            }
          }
        });
      }
    } else {
      completeAttendance = validAttendanceRecords;
    }

    // Apply status filter
    if (status && status !== "All") {
      completeAttendance = completeAttendance.filter(
        (record) => record.status === status
      );
    }

    // Sort by date and name
    completeAttendance.sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.employee.name.localeCompare(b.employee.name);
    });

    // Pagination
    const total = completeAttendance.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedAttendance = completeAttendance.slice(startIndex, endIndex);

    console.log("Final attendance count:", total);
    console.log("Paginated attendance count:", paginatedAttendance.length);

    res.json({
      success: true,
      attendance: paginatedAttendance,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      totalEmployees: allEmployees.length,
      presentToday: validAttendanceRecords.filter((r) => r.status !== "Absent")
        .length,
      absentToday:
        allEmployees.length -
        validAttendanceRecords.filter((r) => r.status !== "Absent").length,
    });
  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Apply for leave
router.post("/leave", protect, async (req, res) => {
  try {
    const { employeeId, startDate, endDate, leaveType, reason } = req.body;

    const leave = await Leave.create({
      employee: employeeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      leaveType,
      reason,
      status: "Approved", // Auto-approve for now, can be changed to 'Pending' if approval workflow needed
    });

    // Create attendance records for leave dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip weekends (Saturday = 6, Sunday = 0)
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        const attendanceDate = new Date(d);
        attendanceDate.setHours(0, 0, 0, 0);

        // Check if attendance record already exists
        const existingAttendance = await Attendance.findOne({
          employee: employeeId,
          date: attendanceDate,
        });

        if (!existingAttendance) {
          await Attendance.create({
            employee: employeeId,
            date: attendanceDate,
            status: "Leave",
            leaveType: leaveType,
            reason: reason,
          });
        } else if (existingAttendance.status === "Absent") {
          // Update existing absent record to leave
          existingAttendance.status = "Leave";
          existingAttendance.leaveType = leaveType;
          existingAttendance.reason = reason;
          await existingAttendance.save();
        }
      }
    }

    await leave.populate("employee", "name empId designation department");

    res.status(201).json({
      success: true,
      message: "Leave application submitted successfully",
      leave,
    });
  } catch (error) {
    console.error("Leave application error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get individual employee attendance details
router.get("/employee/:employeeId/details", protect, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { period = "month", startDate, endDate } = req.query;

    // Calculate date range based on period
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else {
      switch (period) {
        case "week":
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          dateFilter = { $gte: weekStart };
          break;
        case "month":
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = { $gte: monthStart };
          break;
        case "year":
          const yearStart = new Date(now.getFullYear(), 0, 1);
          dateFilter = { $gte: yearStart };
          break;
        default:
          const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter = { $gte: defaultStart };
      }
    }

    // Get employee details
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Get attendance records
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: dateFilter,
    }).sort({ date: -1 });

    // Get leave records if Leave model exists
    let leaveRecords = [];
    try {
      leaveRecords = await Leave.find({
        employee: employeeId,
        startDate: dateFilter,
      }).sort({ startDate: -1 });
    } catch (error) {
      console.log("Leave model not available");
    }

    // Calculate statistics
    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter((r) =>
      ["Present", "Late"].includes(r.status)
    ).length;
    const lateDays = attendanceRecords.filter(
      (r) => r.status === "Late"
    ).length;
    const leaveDays = leaveRecords.length;

    // Calculate working days in period (excluding weekends)
    const startCalc =
      dateFilter.$gte || new Date(now.getFullYear(), now.getMonth(), 1);
    const endCalc = new Date();
    let workingDays = 0;

    for (
      let d = new Date(startCalc);
      d <= endCalc;
      d.setDate(d.getDate() + 1)
    ) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        // Exclude Sunday (0) and Saturday (6)
        workingDays++;
      }
    }

    const absentDays = workingDays - presentDays - leaveDays;
    const attendancePercentage =
      workingDays > 0 ? ((presentDays / workingDays) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      employee: {
        _id: employee._id,
        name: employee.name,
        empId: employee.empId,
        designation: employee.designation,
        department: employee.department,
      },
      period,
      statistics: {
        workingDays,
        presentDays,
        absentDays,
        lateDays,
        leaveDays,
        attendancePercentage,
      },
      attendanceRecords,
      leaveRecords,
    });
  } catch (error) {
    console.error("Get employee attendance details error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get attendance statistics
router.get("/stats", protect, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalEmployees = await Employee.countDocuments({ status: "Active" });
    const presentToday = await Attendance.countDocuments({
      date: today,
      status: { $in: ["Present", "Late"] },
    });
    const lateToday = await Attendance.countDocuments({
      date: today,
      status: "Late",
    });
    const absentToday = totalEmployees - presentToday;

    // Monthly stats
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyStats = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        totalEmployees,
        presentToday,
        lateToday,
        absentToday,
        monthlyStats,
      },
    });
  } catch (error) {
    console.error("Get attendance stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Test route to create sample attendance data
router.post("/test-data", protect, async (req, res) => {
  try {
    const employees = await Employee.find({ status: "Active" }).limit(3);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const testAttendance = [];

    for (const employee of employees) {
      // Create a punch-in record for today
      const attendance = await Attendance.create({
        employee: employee._id,
        date: today,
        punchIn: {
          time: new Date(),
          location: "Office - Floor 1",
          faceVerified: false,
        },
        status: "Present",
      });

      await attendance.populate(
        "employee",
        "name empId designation department"
      );
      testAttendance.push(attendance);
    }

    res.json({
      success: true,
      message: `Created ${testAttendance.length} test attendance records`,
      attendance: testAttendance,
    });
  } catch (error) {
    console.error("Test data creation error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
