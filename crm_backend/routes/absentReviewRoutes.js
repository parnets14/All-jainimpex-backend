import express from "express";
import { attendanceSchema } from "../models/Attendance.js";
import { hrmsSettingsSchema } from "../models/HrmsSettings.js";
import { holidaySchema } from "../models/Holiday.js";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { enforceRoutePermissions } from "../middleware/routePermissions.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";
import { getAbsentReviewPolicyBounds } from "../utils/absentReviewPolicy.js";

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

const manualReviewDateFilter = (now = new Date()) => {
  const { reviewableFromUtc } = getAbsentReviewPolicyBounds(now);
  return { date: { $gte: reviewableFromUtc } };
};

const normalizeUnpaidMultiplier = (value) => {
  const multiplier = Number(value);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
};

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

const serializeRecord = (record, allowedLunchMinutes = 0, employeeMonthAbsentDays = 0) => {
  const employee = record.employee || {};
  const { gross, daysInMonth, perDaySalary, salaryType, requiredMinutes } = salaryInfo(
    employee, record.date, allowedLunchMinutes
  );
  const attendanceIst = new Date(new Date(record.date).getTime() + 5.5 * 3600000);
  const absenceMonth = attendanceIst.toISOString().slice(0, 7);
  const reviewDeadline = new Date(
    Date.UTC(attendanceIst.getUTCFullYear(), attendanceIst.getUTCMonth() + 1, 15) - 5.5 * 3600000
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
    absenceMonth,
    employeeMonthAbsentDays,
    reviewDeadline,
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
    const settings = await HrmsSettings.findOne({ key: "default" })
      .select("allowedLunchMinutes absentDeductionMultiplier")
      .lean();
    const { status = "pending", from, to } = req.query;
    const filter = {};
    const { yesterdayEndUtc: yesterdayEnd } = getAbsentReviewPolicyBounds();

    if (status === "pending") {
      filter.status = "Absent";
      filter.reviewStatus = { $in: ["pending", "none", null] };
      // With no lower date bound, return the complete unresolved backlog.
    } else if (status === "actioned") {
      filter.reviewStatus = { $in: ["auto_paid", "excused", "unexcused"] };
    } else if (status === "all") {
      filter.reviewStatus = { $in: ["pending", "none", null, "auto_paid", "excused", "unexcused"] };
    } else {
      return res.status(400).json({ success: false, message: "Invalid status filter" });
    }

    // Today is never eligible for absence review. Explicit future/today ranges
    // are also capped at yesterday 23:59:59.999 IST.
    filter.date = { $lte: yesterdayEnd };
    if (from) filter.date.$gte = istMidnight(new Date(`${from}T00:00:00Z`));
    if (to) {
      const requestedEnd = endOfIstDay(new Date(`${to}T00:00:00Z`));
      filter.date.$lte = requestedEnd < yesterdayEnd ? requestedEnd : yesterdayEnd;
    } else if (status !== "pending") {
      const nowIst = new Date(Date.now() + 5.5 * 3600000);
      filter.date.$gte = new Date(
        Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1) - 5.5 * 3600000
      );
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

    const isApplicableHoliday = (record) => {
      if (!record.employee) return true;
      const key = new Date(new Date(record.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
      return (holidaysByDate.get(key) || []).some(
        (holiday) => !holiday.departments?.length || holiday.departments.includes(record.employee.department)
      );
    };

    const visibleRecords = records.filter((record) => record.employee && !isApplicableHoliday(record));
    const absentCountByEmployeeMonth = new Map();

    if (visibleRecords.length > 0) {
      const employeeIds = [...new Set(visibleRecords.map((record) => String(record.employee._id)))];
      const monthBounds = visibleRecords.map((record) => {
        const value = new Date(new Date(record.date).getTime() + 5.5 * 3600000);
        return {
          start: Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1) - 5.5 * 3600000,
          end: Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1) - 5.5 * 3600000,
        };
      });
      const countRecords = await Attendance.find({
        employee: { $in: employeeIds },
        date: {
          $gte: new Date(Math.min(...monthBounds.map((bound) => bound.start))),
          $lt: new Date(Math.max(...monthBounds.map((bound) => bound.end))),
          $lte: yesterdayEnd,
        },
        $or: [
          { status: "Absent" },
          { reviewStatus: { $in: ["auto_paid", "excused", "unexcused"] } },
        ],
      })
        .populate("employee", "department")
        .select("employee date status reviewStatus")
        .lean();

      for (const record of countRecords) {
        if (!record.employee || isApplicableHoliday(record)) continue;
        const month = new Date(new Date(record.date).getTime() + 5.5 * 3600000)
          .toISOString()
          .slice(0, 7);
        const key = `${record.employee._id}:${month}`;
        absentCountByEmployeeMonth.set(key, (absentCountByEmployeeMonth.get(key) || 0) + 1);
      }
    }

    const rows = visibleRecords.map((record) => {
      const month = new Date(new Date(record.date).getTime() + 5.5 * 3600000)
        .toISOString()
        .slice(0, 7);
      const countKey = `${record.employee._id}:${month}`;
      return serializeRecord(
        record,
        settings?.allowedLunchMinutes,
        absentCountByEmployeeMonth.get(countKey) || 0
      );
    });
    return res.json({
      success: true,
      count: rows.length,
      records: rows,
      throughDate: new Date(yesterdayEnd.getTime() + 5.5 * 3600000).toISOString().slice(0, 10),
      defaultMultiplier: normalizeUnpaidMultiplier(settings?.absentDeductionMultiplier),
    });
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
      defaultMultiplier: normalizeUnpaidMultiplier(settings?.absentDeductionMultiplier),
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
        {
          _id: req.params.id,
          status: "Absent",
          reviewStatus: { $in: ["pending", "none", null] },
          ...manualReviewDateFilter(),
        },
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
      if (typeof multiplier === "string" && multiplier.trim() === "") {
        return res.status(400).json({ success: false, message: "Deduction multiplier is required" });
      }
      if (multiplier == null || Number.isNaN(Number(multiplier))) {
        const settings = await HrmsSettings.findOne({ key: "default" }).lean();
        multiplier = normalizeUnpaidMultiplier(settings?.absentDeductionMultiplier);
      }
      multiplier = Number(multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        return res.status(400).json({ success: false, message: "Deduction multiplier must be greater than 0" });
      }

      const record = await Attendance.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "Absent",
          reviewStatus: { $in: ["pending", "none", null] },
          ...manualReviewDateFilter(),
        },
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
