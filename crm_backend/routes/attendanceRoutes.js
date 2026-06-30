import express from "express";
import { attendanceSchema } from "../models/Attendance.js";
import { leaveSchema } from "../models/Leave.js";
import { employeeSchema } from "../models/Employee.js";
import { leavePolicySchema } from "../models/LeavePolicy.js";
import { leaveBalanceSchema } from "../models/LeaveBalance.js";
import { fyYearOf } from "../controllers/hrmsController.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

// Resolve company-scoped models from the request's database connection
const getModels = (dbConnection) => {
  return {
    Attendance:
      dbConnection.models.Attendance ||
      dbConnection.model("Attendance", attendanceSchema),
    Leave: dbConnection.models.Leave || dbConnection.model("Leave", leaveSchema),
    Employee:
      dbConnection.models.Employee ||
      dbConnection.model("Employee", employeeSchema),
    LeavePolicy:
      dbConnection.models.LeavePolicy ||
      dbConnection.model("LeavePolicy", leavePolicySchema),
    LeaveBalance:
      dbConnection.models.LeaveBalance ||
      dbConnection.model("LeaveBalance", leaveBalanceSchema),
  };
};

// Map the Attendance/Leave leaveType label to a leave-policy balance key.
// Unpaid leave consumes no balance (returns null).
const leaveKeyForType = (leaveType) => {
  if (leaveType === "Sick Leave") return "sick";
  if (leaveType === "Casual Leave") return "casual";
  if (leaveType === "Unpaid Leave") return null;
  return "earned"; // 'Paid Leave' (and any paid default)
};

// All attendance routes require authentication and a company database connection
router.use(protect);
router.use(attachCompanyDB);

// Punch In
router.post(
  "/punch-in",
  logActivity("Attendance", "Punched in", "CREATE"),
  async (req, res) => {
    try {
      const { Attendance } = getModels(req.dbConnection);
      const { employeeId, location, faceVerified } = req.body;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let attendance = await Attendance.findOne({
        employee: employeeId,
        date: today,
      });
      if (!attendance) {
        attendance = new Attendance({ employee: employeeId, date: today, sessions: [] });
      }

      const sessions = attendance.sessions || [];
      const last = sessions[sessions.length - 1];
      const hasOpen = last && last.in && last.in.time && (!last.out || !last.out.time);
      if (hasOpen) {
        return res.status(400).json({
          success: false,
          message: "Already punched in. Please punch out first.",
        });
      }

      sessions.push({
        in: {
          time: new Date(),
          location: location || "Office",
          faceVerified: faceVerified || false,
          source: "web",
        },
      });
      attendance.sessions = sessions;
      attendance.markModified("sessions");
      await attendance.save();

      await attendance.populate(
        "employee",
        "name empId designation department"
      );

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
  }
);

// Punch Out
router.post(
  "/punch-out",
  logActivity("Attendance", "Punched out", "CREATE"),
  async (req, res) => {
    try {
      const { Attendance } = getModels(req.dbConnection);
      const { employeeId, location, faceVerified } = req.body;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const attendance = await Attendance.findOne({
        employee: employeeId,
        date: today,
      });

      if (!attendance || !attendance.sessions || attendance.sessions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No punch in record found for today",
        });
      }

      const last = attendance.sessions[attendance.sessions.length - 1];
      if (!last.in || !last.in.time) {
        return res.status(400).json({
          success: false,
          message: "No open punch-in to close.",
        });
      }
      if (last.out && last.out.time) {
        return res.status(400).json({
          success: false,
          message: "Already punched out. Please punch in first.",
        });
      }

      last.out = {
        time: new Date(),
        location: location || "Office",
        faceVerified: faceVerified || false,
        source: "web",
      };
      attendance.markModified("sessions");

      await attendance.save();
      await attendance.populate(
        "employee",
        "name empId designation department"
      );

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
  }
);

// Get today's attendance
router.get(
  "/today",
  logActivity("Attendance", "Viewed today's attendance", "READ"),
  async (req, res) => {
    try {
      const { Attendance } = getModels(req.dbConnection);
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
  }
);

// Get attendance with filters and auto-absent
router.get(
  "/",
  logActivity("Attendance", "Viewed attendance list", "READ"),
  async (req, res) => {
    try {
      const { Attendance, Employee } = getModels(req.dbConnection);
      const {
        startDate,
        endDate,
        employeeId,
        department,
        status,
        page = 1,
        limit = 10,
        includeAbsent = "true",
        search,
      } = req.query;

      // Default to today if no date specified
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let dateFilter = {};
      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(startDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      } else if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { $lte: end };
      } else {
        dateFilter = { $gte: today, $lt: tomorrow };
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
      const attendanceFilter = { date: dateFilter };

      if (employeeId) {
        attendanceFilter.employee = employeeId;
      } else if (department && department !== "All") {
        const deptEmployees = await Employee.find({ department }).select("_id");
        attendanceFilter.employee = {
          $in: deptEmployees.map((emp) => emp._id),
        };
      }

      const attendanceRecords = await Attendance.find(attendanceFilter)
        .populate("employee", "name empId designation department")
        .sort({ date: -1, "punchIn.time": -1 });

      // Filter out records with null employees (orphaned records)
      const validAttendanceRecords = attendanceRecords.filter(
        (record) => !!record.employee
      );

      // Create a map of employee attendance
      const attendanceMap = new Map();
      validAttendanceRecords.forEach((record) => {
        const empId = record.employee._id.toString();
        const dateKey = record.date.toISOString().split("T")[0];
        attendanceMap.set(`${empId}-${dateKey}`, record);
      });

      // Generate complete attendance list with absent employees
      let completeAttendance = [];

      if (includeAbsent === "true") {
        let startIterDate, endIterDate;
        if (startDate && endDate) {
          startIterDate = new Date(startDate);
          endIterDate = new Date(endDate);
        } else if (startDate) {
          startIterDate = new Date(startDate);
          endIterDate = new Date(startDate);
        } else {
          startIterDate = new Date(today);
          endIterDate = new Date(today);
        }

        startIterDate.setHours(0, 0, 0, 0);
        endIterDate.setHours(0, 0, 0, 0);

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
              const dayOfWeek = new Date(d).getDay();
              if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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
      const paginatedAttendance = completeAttendance.slice(
        startIndex,
        endIndex
      );

      res.json({
        success: true,
        attendance: paginatedAttendance,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        totalEmployees: allEmployees.length,
        presentToday: validAttendanceRecords.filter(
          (r) => r.status !== "Absent"
        ).length,
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
  }
);

// Apply for leave (creates a Pending request — requires admin approval)
router.post(
  "/leave",
  logActivity("Attendance", "Applied for leave", "CREATE"),
  async (req, res) => {
    try {
      const { Leave, Attendance } = getModels(req.dbConnection);
      const { employeeId, startDate, endDate, leaveType, reason } = req.body;

      if (!employeeId || !startDate || !endDate || !leaveType || !reason) {
        return res.status(400).json({
          success: false,
          message:
            "Employee, start date, end date, leave type and reason are required",
        });
      }

      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start or end date",
        });
      }

      // 1) End date cannot be before start date
      if (end < start) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be before start date",
        });
      }

      // 2) Cannot apply for leave in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start < today) {
        return res.status(400).json({
          success: false,
          message: "Cannot apply for leave on a past date",
        });
      }

      // 3) Cannot overlap an existing Pending/Approved leave for this employee
      const overlappingLeave = await Leave.findOne({
        employee: employeeId,
        status: { $in: ["Pending", "Approved"] },
        startDate: { $lte: end },
        endDate: { $gte: start },
      });

      if (overlappingLeave) {
        return res.status(400).json({
          success: false,
          message: `A ${overlappingLeave.status.toLowerCase()} leave already exists that overlaps these dates (${new Date(
            overlappingLeave.startDate
          ).toLocaleDateString()} - ${new Date(
            overlappingLeave.endDate
          ).toLocaleDateString()})`,
        });
      }

      // 4) Cannot apply for leave on a day attendance is already marked present
      const endOfRange = new Date(end);
      endOfRange.setHours(23, 59, 59, 999);
      const presentRecord = await Attendance.findOne({
        employee: employeeId,
        date: { $gte: start, $lte: endOfRange },
        status: { $in: ["Present", "Late", "Half Day"] },
      });

      if (presentRecord) {
        return res.status(400).json({
          success: false,
          message: `Attendance is already marked (${
            presentRecord.status
          }) on ${new Date(
            presentRecord.date
          ).toLocaleDateString()}. You cannot apply leave for a day already attended.`,
        });
      }

      const leave = await Leave.create({
        employee: employeeId,
        startDate: start,
        endDate: end,
        leaveType,
        reason,
        status: "Pending",
      });

      await leave.populate("employee", "name empId designation department");

      res.status(201).json({
        success: true,
        message: "Leave application submitted successfully. Pending approval.",
        leave,
      });
    } catch (error) {
      console.error("Leave application error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// List leave applications (filter by status / employee)
router.get(
  "/leaves",
  logActivity("Attendance", "Viewed leave applications", "READ"),
  async (req, res) => {
    try {
      const { Leave } = getModels(req.dbConnection);
      const { status, employeeId, page = 1, limit = 20 } = req.query;

      const filter = {};
      if (status && status !== "All") filter.status = status;
      if (employeeId) filter.employee = employeeId;

      const leaves = await Leave.find(filter)
        .populate("employee", "name empId designation department")
        .populate("approvedBy", "name")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((page - 1) * limit);

      const total = await Leave.countDocuments(filter);

      res.json({
        success: true,
        leaves,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total,
        pendingCount: await Leave.countDocuments({ status: "Pending" }),
      });
    } catch (error) {
      console.error("Get leaves error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Approve a leave application (super_admin / admin only)
router.patch(
  "/leave/:id/approve",
  requireRole(["super_admin", "admin"]),
  logActivity("Attendance", "Approved leave", "UPDATE"),
  async (req, res) => {
    try {
      const { Leave, Attendance, LeavePolicy, LeaveBalance } = getModels(req.dbConnection);
      const leave = await Leave.findById(req.params.id);

      if (!leave) {
        return res.status(404).json({
          success: false,
          message: "Leave application not found",
        });
      }

      if (leave.status === "Approved") {
        return res.status(400).json({
          success: false,
          message: "Leave is already approved",
        });
      }

      leave.status = "Approved";
      leave.approvedBy = req.user._id;
      await leave.save();

      // Create attendance records (Leave status) for the leave dates
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);

      let leaveDaysCreated = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          const attendanceDate = new Date(d);
          attendanceDate.setHours(0, 0, 0, 0);

          const existingAttendance = await Attendance.findOne({
            employee: leave.employee,
            date: attendanceDate,
          });

          if (!existingAttendance) {
            await Attendance.create({
              employee: leave.employee,
              date: attendanceDate,
              status: "Leave",
              leaveType: leave.leaveType,
              reason: leave.reason,
            });
            leaveDaysCreated++;
          } else if (existingAttendance.status === "Absent") {
            existingAttendance.status = "Leave";
            existingAttendance.leaveType = leave.leaveType;
            existingAttendance.reason = leave.reason;
            await existingAttendance.save();
            leaveDaysCreated++;
          }
        }
      }

      // Consume the leave balance for paid leave types (Unpaid consumes nothing).
      // Keeps the Leave Balances screen accurate with what was actually approved.
      const balKey = leaveKeyForType(leave.leaveType);
      if (balKey && leaveDaysCreated > 0) {
        try {
          const policy = await LeavePolicy.findOne({ key: "default" });
          const fyYear = fyYearOf(start, policy?.financialYearStartMonth || 4);
          let bal = await LeaveBalance.findOne({ employee: leave.employee, fyYear });
          if (!bal) bal = new LeaveBalance({ employee: leave.employee, fyYear, balances: [] });
          let tb = bal.balances.find((x) => x.key === balKey);
          if (!tb) {
            bal.balances.push({ key: balKey, accrued: 0, used: 0 });
            tb = bal.balances[bal.balances.length - 1];
          }
          tb.used = parseFloat(((tb.used || 0) + leaveDaysCreated).toFixed(2));
          bal.markModified("balances");
          await bal.save();
        } catch (balErr) {
          console.error("Leave balance update on approve failed:", balErr.message);
          // Don't fail the approval if balance bookkeeping hiccups.
        }
      }

      await leave.populate("employee", "name empId designation department");
      await leave.populate("approvedBy", "name");

      res.json({
        success: true,
        message: "Leave approved successfully",
        leave,
      });
    } catch (error) {
      console.error("Approve leave error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Reject a leave application (super_admin / admin only)
router.patch(
  "/leave/:id/reject",
  requireRole(["super_admin", "admin"]),
  logActivity("Attendance", "Rejected leave", "UPDATE"),
  async (req, res) => {
    try {
      const { Leave } = getModels(req.dbConnection);
      const leave = await Leave.findById(req.params.id);

      if (!leave) {
        return res.status(404).json({
          success: false,
          message: "Leave application not found",
        });
      }

      if (leave.status === "Approved") {
        return res.status(400).json({
          success: false,
          message: "Cannot reject an already approved leave",
        });
      }

      leave.status = "Rejected";
      leave.approvedBy = req.user._id;
      await leave.save();

      await leave.populate("employee", "name empId designation department");
      await leave.populate("approvedBy", "name");

      res.json({
        success: true,
        message: "Leave rejected",
        leave,
      });
    } catch (error) {
      console.error("Reject leave error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Get individual employee attendance details
router.get(
  "/employee/:employeeId/details",
  logActivity("Attendance", "Viewed employee attendance details", "READ"),
  async (req, res) => {
    try {
      const { Attendance, Leave, Employee } = getModels(req.dbConnection);
      const { employeeId } = req.params;
      const { period = "month", startDate, endDate } = req.query;

      let dateFilter = {};
      const now = new Date();

      if (startDate && endDate) {
        dateFilter = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      } else {
        switch (period) {
          case "week": {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            dateFilter = { $gte: weekStart };
            break;
          }
          case "month": {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { $gte: monthStart };
            break;
          }
          case "year": {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            dateFilter = { $gte: yearStart };
            break;
          }
          default: {
            const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { $gte: defaultStart };
          }
        }
      }

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const attendanceRecords = await Attendance.find({
        employee: employeeId,
        date: dateFilter,
      }).sort({ date: -1 });

      let leaveRecords = [];
      try {
        leaveRecords = await Leave.find({
          employee: employeeId,
          startDate: dateFilter,
        }).sort({ startDate: -1 });
      } catch (error) {
        console.log("Leave lookup failed:", error.message);
      }

      const presentDays = attendanceRecords.filter((r) =>
        ["Present", "Late"].includes(r.status)
      ).length;
      const lateDays = attendanceRecords.filter(
        (r) => r.status === "Late"
      ).length;
      const leaveDays = leaveRecords.length;

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
  }
);

// Get attendance statistics
router.get(
  "/stats",
  logActivity("Attendance", "Viewed attendance statistics", "READ"),
  async (req, res) => {
    try {
      const { Attendance, Employee } = getModels(req.dbConnection);
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

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthlyStats = await Attendance.aggregate([
        { $match: { date: { $gte: startOfMonth } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
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
  }
);

// Update attendance record (admin only)
router.put(
  "/:id",
  requireRole(["super_admin", "admin"]),
  logActivity("Attendance", "Updated attendance record", "UPDATE"),
  async (req, res) => {
    try {
      const { Attendance } = getModels(req.dbConnection);
      const attendance = await Attendance.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate("employee", "name empId designation department");

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message: "Attendance record not found",
        });
      }

      res.json({
        success: true,
        message: "Attendance updated successfully",
        attendance,
      });
    } catch (error) {
      console.error("Update attendance error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

export default router;
