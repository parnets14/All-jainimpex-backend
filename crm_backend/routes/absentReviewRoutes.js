import express from "express";
import { attendanceSchema } from "../models/Attendance.js";
import { hrmsSettingsSchema } from "../models/HrmsSettings.js";
import { holidaySchema } from "../models/Holiday.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { enforceRoutePermissions } from "../middleware/routePermissions.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

const router = express.Router();

const getModels = (db) => ({
  Attendance: db.models.Attendance || db.model("Attendance", attendanceSchema),
  HrmsSettings: db.models.HrmsSettings || db.model("HrmsSettings", hrmsSettingsSchema),
  Holiday: db.models.Holiday || db.model("Holiday", holidaySchema),
});

// UTC instant corresponding to midnight in India for the supplied calendar day.
const istMidnight = (value = new Date()) => {
  const shifted = new Date(new Date(value).getTime() + 5.5 * 3600000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 5.5 * 3600000);
};

const endOfIstDay = (value) => new Date(istMidnight(value).getTime() + 86400000 - 1);

const salaryInfo = (employee, attendanceDate, allowedLunchMinutes = 0) => {
  const fixedGross =
    Number(employee?.basicSalary || 0) +
    Number(employee?.hra || 0) +
    Number(employee?.conveyance || 0) +
    Number(employee?.medicalAllowance || 0) +
    Number(employee?.specialAllowance || 0);
  const istDate = new Date(new Date(attendanceDate).getTime() + 5.5 * 3600000);
  const daysInMonth = new Date(Date.UTC(
    istDate.getUTCFullYear(), istDate.getUTCMonth() + 1, 0
  )).getUTCDate();
  const hm = (value) => {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
  };
  const shiftStart = hm(employee?.shiftStart) ?? 600;
  let shiftEnd = hm(employee?.shiftEnd) ?? 1080;
  if (shiftEnd <= shiftStart) shiftEnd += 1440;
  const requiredMinutes = Math.max(1, shiftEnd - shiftStart - Math.max(0, Number(allowedLunchMinutes) || 0));
  const salaryType = employee?.salaryType || "fixed";
  let perDaySalary = daysInMonth > 0 ? fixedGross / daysInMonth : 0;
  if (salaryType === "daily") perDaySalary = Number(employee?.basicSalary || 0);
  if (salaryType === "hourly") perDaySalary = Number(employee?.basicSalary || 0) * requiredMinutes / 60;
  return {
    gross: salaryType === "fixed" ? fixedGross : perDaySalary * daysInMonth,
    daysInMonth,
    salaryType,
    requiredMinutes,
    perDaySalary: Number(perDaySalary.toFixed(2)),
  };
};

const serializeRecord = (record, allowedLunchMinutes = 0) => {
  const employee = record.employee || {};
  const { gross, daysInMonth, perDaySalary, salaryType, requiredMinutes } = salaryInfo(
    employee, record.date, allowedLunchMinutes
  );
  return {
    _id: record._id,
    employee: {
      _id: employee._id,
      name: employee.name,
      empId: employee.empId,
      designation: employee.designation,
      department: employee.department,
    },
    date: record.date,
    status: record.status,
    leaveType: record.leaveType,
    reviewStatus: ["none", null, undefined].includes(record.reviewStatus) ? "pending" : record.reviewStatus,
    reviewReason: record.reviewReason,
    absentDeductionMultiplier: record.absentDeductionMultiplier,
    salaryType,
    requiredMinutes,
    grossSalary: gross,
    perDaySalary,
    daysInMonth,
  };
};

router.use(protect);
router.use(attachCompanyDB);
router.use(enforceRoutePermissions);

// GET /api/absent-review?status=pending|actioned|all&from=YYYY-MM-DD&to=YYYY-MM-DD
// This endpoint is intentionally read-only. The end-of-day finalizer creates
// absent records; the 09:00 IST cron assigns auto-paid or pending state.
router.get("/", async (req, res) => {
  try {
    const { Attendance, Holiday, HrmsSettings } = getModels(req.dbConnection);
    const settings = await HrmsSettings.findOne({ key: "default" }).select("allowedLunchMinutes").lean();
    const { status = "pending", from, to } = req.query;
    const filter = {};

    if (status === "pending") {
      filter.status = "Absent";
      filter.reviewStatus = { $in: ["pending", "none", null] };
      // With no date filter, return the complete unresolved backlog across months.
    } else if (status === "actioned") {
      filter.reviewStatus = { $in: ["auto_paid", "excused", "unexcused"] };
    } else if (status === "all") {
      filter.reviewStatus = { $in: ["pending", "none", null, "auto_paid", "excused", "unexcused"] };
    } else {
      return res.status(400).json({ success: false, message: "Invalid status filter" });
    }

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = istMidnight(new Date(`${from}T00:00:00Z`));
      if (to) filter.date.$lte = endOfIstDay(new Date(`${to}T00:00:00Z`));
    } else if (status !== "pending") {
      const nowIst = new Date(Date.now() + 5.5 * 3600000);
      filter.date = {
        $gte: new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1) - 5.5 * 3600000),
        $lte: endOfIstDay(new Date()),
      };
    }

    const records = await Attendance.find(filter)
      .populate("employee", "name empId designation department salaryType basicSalary hra conveyance medicalAllowance specialAllowance shiftStart shiftEnd")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const holidays = await Holiday.find({}).select("date departments").lean();
    const holidaysByDate = new Map();
    for (const holiday of holidays) {
      const key = new Date(new Date(holiday.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
      const list = holidaysByDate.get(key) || [];
      list.push(holiday);
      holidaysByDate.set(key, list);
    }

    const rows = records.filter((record) => {
      if (!record.employee) return false;
      const key = new Date(new Date(record.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
      return !(holidaysByDate.get(key) || []).some(
        (holiday) => !holiday.departments?.length || holiday.departments.includes(record.employee.department)
      );
    }).map((record) => serializeRecord(record, settings?.allowedLunchMinutes));
    return res.json({ success: true, count: rows.length, records: rows });
  } catch (error) {
    console.error("absent-review list error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/reasons", async (req, res) => {
  try {
    const { HrmsSettings } = getModels(req.dbConnection);
    const settings = await HrmsSettings.findOne({ key: "default" }).lean();
    return res.json({
      success: true,
      reasons: settings?.absentReasonPresets || [],
      defaultMultiplier: Number(settings?.absentDeductionMultiplier ?? 1),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post(
  "/:id/excuse",
  logActivity("Attendance", "Excused absence (paid leave)", "UPDATE"),
  async (req, res) => {
    try {
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ success: false, message: "Reason is required" });

      const { Attendance } = getModels(req.dbConnection);
      const record = await Attendance.findOneAndUpdate(
        { _id: req.params.id, status: "Absent", reviewStatus: { $in: ["pending", "none", null] } },
        {
          $set: {
            status: "Leave",
            leaveType: "Paid Leave",
            reviewStatus: "excused",
            reviewReason: reason,
            reviewedBy: req.user?._id || null,
            reviewedAt: new Date(),
            absentDeductionMultiplier: 0,
          },
        },
        { new: true, runValidators: true }
      );
      if (!record) {
        return res.status(409).json({ success: false, message: "This absence is no longer pending review" });
      }
      return res.json({ success: true, message: "Marked as Paid Leave (excused)", record });
    } catch (error) {
      console.error("excuse error:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

router.post(
  "/:id/unexcuse",
  logActivity("Attendance", "Unexcused absence (unpaid leave)", "UPDATE"),
  async (req, res) => {
    try {
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ success: false, message: "Reason is required" });

      const { Attendance, HrmsSettings } = getModels(req.dbConnection);
      let multiplier = req.body?.multiplier;
      if (multiplier == null || Number.isNaN(Number(multiplier))) {
        const settings = await HrmsSettings.findOne({ key: "default" }).lean();
        multiplier = settings?.absentDeductionMultiplier ?? 1;
      }
      multiplier = Number(multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        return res.status(400).json({ success: false, message: "Deduction multiplier must be greater than 0" });
      }

      const record = await Attendance.findOneAndUpdate(
        { _id: req.params.id, status: "Absent", reviewStatus: { $in: ["pending", "none", null] } },
        {
          $set: {
            leaveType: "Unpaid Leave",
            reviewStatus: "unexcused",
            reviewReason: reason,
            reviewedBy: req.user?._id || null,
            reviewedAt: new Date(),
            absentDeductionMultiplier: multiplier,
          },
        },
        { new: true, runValidators: true }
      );
      if (!record) {
        return res.status(409).json({ success: false, message: "This absence is no longer pending review" });
      }
      return res.json({
        success: true,
        message: `Marked as Unpaid Leave (unexcused) with ${multiplier}× deduction`,
        record,
      });
    } catch (error) {
      console.error("unexcuse error:", error.message);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;
