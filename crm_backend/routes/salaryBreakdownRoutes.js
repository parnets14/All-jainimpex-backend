import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { enforceRoutePermissions } from "../middleware/routePermissions.js";
import { generateSalarySlipDirect } from "../queue/salaryQueueFallback.js";
import {
  computeAttendanceAdjustments,
  computeHalfDayDeduction,
  computeLateDeduction,
  round2,
} from "../utils/hrmsSalaryCalc.js";
import { calculateAttendanceTime } from "../utils/attendanceTime.js";

const router = express.Router();
router.use(protect);
router.use(attachCompanyDB);
router.use(enforceRoutePermissions);

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_INDEX = Object.fromEntries(DAY_NAMES.map((name, index) => [name, index]));

const dateKeyIST = (value) => new Date(new Date(value).getTime() + 5.5 * 3600000)
  .toISOString().slice(0, 10);

const timeIST = (value) => value
  ? new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    })
  : null;

const firstInOf = (record) => record?.sessions?.find((session) => session.in?.time)?.in?.time
  || record?.punchIn?.time
  || null;

const lastOutOf = (record) => {
  const completed = (record?.sessions || []).filter((session) => session.out?.time);
  return completed.at(-1)?.out?.time || record?.punchOut?.time || null;
};

const paidLeave = (record, paidPolicyTypes) => (
  ["auto_paid", "excused"].includes(record?.reviewStatus)
  || paidPolicyTypes.has(record?.leaveType)
);

// GET /api/salary-breakdown/:employeeId?month=&year=&incentiveBonus=&manualAdjustment=
// Uses the exact persisted-payroll calculator in previewOnly mode. It never
// creates a slip or recovers a loan installment.
router.get("/:employeeId", async (req, res) => {
  try {
    const nowIST = new Date(Date.now() + 5.5 * 3600000);
    const month = parseInt(req.query.month, 10) || nowIST.getUTCMonth() + 1;
    const year = parseInt(req.query.year, 10) || nowIST.getUTCFullYear();
    const incentiveBonus = req.query.incentiveBonus == null ? undefined : (Number(req.query.incentiveBonus) || 0);
    const manualAdjustment = req.query.manualAdjustment == null ? undefined : (Number(req.query.manualAdjustment) || 0);
    const adjustmentReason = req.query.adjustmentReason == null ? undefined : String(req.query.adjustmentReason);

    const preview = await generateSalarySlipDirect(
      req.params.employeeId,
      month,
      year,
      req.user?._id,
      "preview",
      req.dbConnection,
      { previewOnly: true, incentiveBonus, manualAdjustment, adjustmentReason }
    );

    const {
      employee,
      attendance,
      attendanceAdjustments: adjustment,
      calculation,
      salaryData,
      period,
      hrmsSettings,
      existingSalarySlip,
    } = preview;

    const attendanceByDate = new Map(attendance.map((record) => [dateKeyIST(record.date), record]));
    const holidayDates = new Set(calculation.holidayDates || []);
    const offDays = new Set((Array.isArray(employee.weeklyOff) ? employee.weeklyOff : [employee.weeklyOff])
      .map((day) => DAY_INDEX[day]).filter((day) => day !== undefined));
    const paidPolicyTypes = new Set(["Paid Leave"]);
    // The shared engine already classified totals. These labels are only for
    // row text; protected review states are independently recognized above.
    const LeavePolicy = req.dbConnection.models.LeavePolicy;
    if (LeavePolicy) {
      const policy = await LeavePolicy.findOne({ key: "default" }).lean();
      (policy?.types || []).forEach((type) => {
        if (type.paid && type.active) paidPolicyTypes.add(type.label);
      });
    }

    const gross = Number(salaryData.grossSalary || 0);
    const salaryType = salaryData.salaryType || employee.salaryType || "fixed";
    const adjustmentGrossBase = Number(calculation.adjustmentGrossBase ?? salaryData.adjustmentGrossBase ?? gross);
    const totalWorkingMinutes = Number(calculation.totalWorkingMinutes || 0);
    const actualDaySalary = Number(calculation.absenceDayRate ?? calculation.perDayByMonth ?? 0);
    const days = [];

    for (let time = new Date(period.from).getTime(); time <= new Date(period.to).getTime(); time += 86400000) {
      const key = dateKeyIST(time);
      const istDate = new Date(time + 5.5 * 3600000);
      const dayIndex = istDate.getUTCDay();
      const record = attendanceByDate.get(key);
      const isWeeklyOff = offDays.has(dayIndex);
      const isHoliday = holidayDates.has(key);
      const joiningKey = employee.dateOfJoining ? dateKeyIST(employee.dateOfJoining) : null;
      const isBeforeJoining = !!joiningKey && key < joiningKey;
      const dayTime = calculateAttendanceTime(record, {
        allowedLunchMinutes: Number(hrmsSettings?.allowedLunchMinutes ?? 45),
      });
      const workedMinutes = round2(dayTime.creditedWorkingMinutes);
      const dailyAdjustment = record
        ? computeAttendanceAdjustments([record], employee, hrmsSettings)
        : computeAttendanceAdjustments([], employee, hrmsSettings);
      let dailyLateDeduction = round2(computeLateDeduction(
        dailyAdjustment, adjustmentGrossBase, totalWorkingMinutes
      ));
      let dailyHalfDeduction = salaryType === "hourly" ? 0 : round2(computeHalfDayDeduction(
        dailyAdjustment, adjustmentGrossBase, totalWorkingMinutes, actualDaySalary
      ));
      let dailyBreakPenalty = round2(dailyAdjustment.breakPenalty || 0);

      let status = record?.status || "Absent";
      let note = "";
      let calculationBand = null;
      let absentMultiplier = null;
      let estimatedDayDeduction = dailyLateDeduction + dailyHalfDeduction + dailyBreakPenalty;

      if (isBeforeJoining) {
        status = "Not Employed";
        dailyLateDeduction = 0;
        dailyHalfDeduction = 0;
        dailyBreakPenalty = 0;
        estimatedDayDeduction = 0;
        note = "Before employee date of joining";
      } else if (isWeeklyOff) {
        status = "Weekly Off";
        dailyLateDeduction = 0;
        dailyHalfDeduction = 0;
        dailyBreakPenalty = 0;
        estimatedDayDeduction = 0;
        note = "Paid non-working day";
      } else if (isHoliday) {
        status = "Holiday";
        dailyLateDeduction = 0;
        dailyHalfDeduction = 0;
        dailyBreakPenalty = 0;
        estimatedDayDeduction = 0;
        note = "Paid company holiday";
      } else if (!record) {
        absentMultiplier = 1;
        estimatedDayDeduction += actualDaySalary;
        note = "No finalized record — provisional absent × 1; final salary is blocked until reviewed";
      } else if (record.status === "Leave") {
        if (paidLeave(record, paidPolicyTypes)) {
          note = record.reviewStatus === "auto_paid"
            ? "Auto free monthly paid leave — no deduction"
            : record.reviewStatus === "excused"
              ? `Excused paid leave${record.reviewReason ? ` — ${record.reviewReason}` : ""}`
              : `Paid ${record.leaveType || "leave"}`;
        } else {
          absentMultiplier = Number(record.absentDeductionMultiplier ?? 1);
          estimatedDayDeduction += actualDaySalary * absentMultiplier;
          note = `Unpaid leave × ${absentMultiplier}${record.reviewReason ? ` — ${record.reviewReason}` : ""}`;
        }
      } else if (record.status === "Absent") {
        absentMultiplier = Number(record.absentDeductionMultiplier ?? 1);
        estimatedDayDeduction += actualDaySalary * absentMultiplier;
        note = record.reviewStatus === "unexcused"
          ? `Unexcused absence × ${absentMultiplier}${record.reviewReason ? ` — ${record.reviewReason}` : ""}`
          : "Pending review — provisional × 1; final salary is blocked";
      } else {
        const required = Number(dailyAdjustment.halfDayRequiredMin || dailyAdjustment.requiredMin || 0);
        const short = Math.max(0, required - workedMinutes);
        if (dailyAdjustment.halfDayCount > 0 && workedMinutes < dailyAdjustment.halfDayThresholdMin) {
          status = "Half Day";
          calculationBand = "below_half_by_minutes";
          note = `${workedMinutes}m worked; ${short}m short deducted by minute`;
        } else if (dailyAdjustment.halfDayCount > 0) {
          status = "Half Day";
          calculationBand = "flat_half_day";
          note = `Worked between half and full-minus-grace; flat 0.5 day deduction`;
        } else if (dailyAdjustment.halfDayShortMinutes > 0) {
          calculationBand = "near_full_shortfall";
          note = `${dailyAdjustment.halfDayShortMinutes}m shortfall deducted by minute`;
        } else {
          calculationBand = "full_day";
          note = "Required working time completed";
        }
        if (dailyAdjustment.excessBreakMinutes > 0) {
          note += `; excess break ${dailyAdjustment.excessBreakMinutes}m × ₹${dailyAdjustment.excessBreakDeductionPerMinute}/m = ₹${dailyBreakPenalty}`;
        }
        if (dailyAdjustment.lateExcessMinutes > 0) {
          note += `; late ${dailyAdjustment.lateExcessMinutes}m after grace`;
        }
        if (dailyAdjustment.paidOtEnabled && dailyAdjustment.otMinutes > 0) {
          note += `; paid OT ${dailyAdjustment.otMinutes}m = ₹${dailyAdjustment.otAmount}`;
        }
        if (dailyAdjustment.offsetEnabled && dailyAdjustment.offsetOtMinutes > 0) {
          note += `; late-offset OT ${dailyAdjustment.offsetOtMinutes}m (no OT pay)`;
        }
      }

      days.push({
        date: key,
        dow: DAY_NAMES[dayIndex],
        isWeeklyOff,
        isHoliday,
        status,
        leaveType: record?.leaveType || null,
        reviewStatus: record?.reviewStatus || null,
        punchIn: timeIST(firstInOf(record)),
        punchOut: timeIST(lastOutOf(record)),
        workingHours: round2(workedMinutes / 60),
        workedMinutes,
        actualBreakMinutes: dayTime.actualBreakMinutes,
        observedBreakMinutes: dayTime.observedBreakMinutes,
        completedActualBreakMinutes: dayTime.completedActualBreakMinutes,
        deductedBreakMinutes: dayTime.deductedBreakMinutes,
        configuredLunchMinutes: dayTime.configuredLunchMinutes,
        breakGraceMinutes: Number(dailyAdjustment.breakGraceMinutes || 0),
        breakAllowanceMinutes: Number(dailyAdjustment.breakAllowanceMinutes || 0),
        excessBreakMinutes: Number(dailyAdjustment.excessBreakMinutes || 0),
        excessBreakDeductionPerMinute: Number(dailyAdjustment.excessBreakDeductionPerMinute || 0),
        breakPenalty: dailyBreakPenalty,
        workingTimeSource: dayTime.source,
        workingTimeDataQuality: dayTime.dataQuality,
        requiredMinutes: Number(dailyAdjustment.halfDayRequiredMin || dailyAdjustment.requiredMin || 0),
        halfThresholdMinutes: Number(dailyAdjustment.halfDayThresholdMin || 0),
        calculationBand,
        lateMinutes: Number(dailyAdjustment.lateExcessMinutes || 0),
        lateEquivalentMinutes: Number(dailyAdjustment.lateEquivalentMinutes || 0),
        paidOtMinutes: Number(dailyAdjustment.otMinutes || 0),
        offsetOtMinutes: Number(dailyAdjustment.offsetOtMinutes || 0),
        otMinutes: Number(dailyAdjustment.otMinutes || 0),
        otAmount: Number(dailyAdjustment.otAmount || 0),
        lateDeduction: dailyLateDeduction,
        halfDayDeduction: dailyHalfDeduction,
        absentMultiplier,
        estimatedDayDeduction: round2(estimatedDayDeduction),
        note: dayTime.dataQuality === "stored-hours-only"
          ? `${note}; WARNING: no completed punch pair — credited from stored hours`
          : note,
      });
    }

    // Payroll pools all late minutes and late-offset OT for the month. Allocate
    // the resulting aggregate deduction back to late dates proportionally so
    // day rows add up exactly to the shared payroll result (last row absorbs
    // currency rounding).
    const aggregateLateDeduction = round2(salaryData.lateDeduction || 0);
    const aggregateLateEquivalent = Number(salaryData.lateEquivalentMinutes || 0);
    const lateRows = days.filter((day) =>
      day.lateMinutes > 0 && !day.isWeeklyOff && !day.isHoliday && day.status !== "Not Employed"
    );
    const totalRawLateMinutes = lateRows.reduce((sum, day) => sum + day.lateMinutes, 0);
    let allocatedDeduction = 0;
    let allocatedEquivalent = 0;
    lateRows.forEach((day, index) => {
      const isLast = index === lateRows.length - 1;
      const ratio = totalRawLateMinutes > 0 ? day.lateMinutes / totalRawLateMinutes : 0;
      const allocatedLate = isLast
        ? round2(aggregateLateDeduction - allocatedDeduction)
        : round2(aggregateLateDeduction * ratio);
      const allocatedEquivalentMinutes = isLast
        ? round2(aggregateLateEquivalent - allocatedEquivalent)
        : round2(aggregateLateEquivalent * ratio);
      day.estimatedDayDeduction = round2(day.estimatedDayDeduction - day.lateDeduction + allocatedLate);
      day.lateDeduction = allocatedLate;
      day.lateEquivalentMinutes = allocatedEquivalentMinutes;
      allocatedDeduction = round2(allocatedDeduction + allocatedLate);
      allocatedEquivalent = round2(allocatedEquivalent + allocatedEquivalentMinutes);
      if (adjustment.offsetEnabled) {
        day.note += "; late deduction allocated from month-pooled OT offset";
      }
    });

    // Reconcile fractional-minute rounding so day rows equal the shared monthly
    // break penalty exactly; the final affected row absorbs any cent remainder.
    const aggregateBreakPenalty = round2(salaryData.breakPenalty || 0);
    const breakRows = days.filter((day) => day.excessBreakMinutes > 0 && day.breakPenalty > 0);
    if (breakRows.length > 0) {
      const allocatedBreakPenalty = round2(
        breakRows.reduce((sum, day) => sum + Number(day.breakPenalty || 0), 0)
      );
      const breakRemainder = round2(aggregateBreakPenalty - allocatedBreakPenalty);
      if (breakRemainder !== 0) {
        const lastBreakRow = breakRows[breakRows.length - 1];
        lastBreakRow.breakPenalty = round2(lastBreakRow.breakPenalty + breakRemainder);
        lastBreakRow.estimatedDayDeduction = round2(
          lastBreakRow.estimatedDayDeduction + breakRemainder
        );
      }
    }

    const totalDeductions = round2(salaryData.totalDeductions);
    const netSalary = round2(salaryData.netSalary);
    const monthDays = Number(calculation.daysInMonth || 0);

    return res.json({
      success: true,
      provisional: calculation.isTillDate || calculation.unresolvedDates.length > 0,
      existingSalarySlip: existingSalarySlip || null,
      comparison: existingSalarySlip ? {
        persistedNetSalary: round2(existingSalarySlip.netSalary),
        recalculatedNetSalary: netSalary,
        difference: round2(netSalary - Number(existingSalarySlip.netSalary || 0)),
        matches: Math.abs(netSalary - Number(existingSalarySlip.netSalary || 0)) < 0.01,
      } : null,
      employee: {
        _id: employee._id,
        name: employee.name,
        empId: employee.empId,
        designation: employee.designation,
        department: employee.department,
        shiftStart: employee.shiftStart,
        shiftEnd: employee.shiftEnd,
        weeklyOff: employee.weeklyOff,
        salaryType: employee.salaryType || "fixed",
      },
      period: {
        month,
        year,
        daysInMonth: monthDays,
        from: period.from,
        to: period.to,
        fullMonthTo: period.fullMonthTo,
        isTillDate: calculation.isTillDate,
      },
      salary: {
        salaryType,
        grossSalary: round2(gross),
        contractualAdjustmentBase: round2(adjustmentGrossBase),
        perDayByMonth: round2(actualDaySalary),
        perDaySalaryWorking: round2(actualDaySalary),
        perMinuteRate: round2(calculation.perMinuteRate),
        fixedProrationFactor: Number(calculation.fixedProrationFactor ?? 1),
        payableCalendarDays: Number(calculation.payableCalendarDays ?? monthDays),
        totalWorkingMinutes,
        requiredWorkingMinutes: Number(adjustment.halfDayRequiredMin || adjustment.requiredMin || 0),
      },
      attendanceSummary: {
        workingDays: salaryData.workingDays || 0,
        presentDays: salaryData.daysWorked || 0,
        leaveDays: salaryData.leaveDays || 0,
        absentDaysCount: salaryData.absentDays || 0,
        absentPenaltyUnits: round2(salaryData.absentPenaltyUnits),
        pendingOrMissingDays: calculation.unresolvedDates.length,
        unresolvedDates: calculation.unresolvedDates,
        lateDays: salaryData.lateDays || 0,
        lateMinutes: salaryData.lateMinutes || 0,
        lateEquivalentMinutes: salaryData.lateEquivalentMinutes || 0,
        paidOtMinutes: salaryData.otMinutes || 0,
        offsetOtMinutes: adjustment.offsetOtMinutes || 0,
        otMinutes: salaryData.otMinutes || 0,
        halfDayCount: salaryData.halfDayCount || 0,
        halfDayShortMinutes: salaryData.halfDayShortMinutes || 0,
        excessBreakMinutes: salaryData.excessBreakMinutes || 0,
        excessBreakDays: salaryData.excessBreakDays || 0,
        breakAllowanceMinutes: salaryData.breakAllowanceMinutes || 0,
        excessBreakDeductionPerMinute: salaryData.excessBreakDeductionPerMinute || 0,
        workingTimeDataQualityWarnings: salaryData.workingTimeDataQualityWarnings || [],
      },
      earnings: {
        gross: round2(gross),
        otAmount: round2(salaryData.otAmount),
        incentiveBonus: round2(salaryData.incentiveBonus),
      },
      deductions: {
        pf: round2(salaryData.pf),
        professionalTax: round2(salaryData.professionalTax),
        tds: round2(salaryData.tds),
        otherDeductions: round2(salaryData.otherDeductions),
        lateDeduction: round2(salaryData.lateDeduction),
        halfDayShortfallDeduction: round2(salaryData.shortfallDeduction),
        excessBreakPenalty: round2(salaryData.breakPenalty),
        absentLopAmount: round2(salaryData.lopAmount),
        loanDeduction: round2(salaryData.loanDeduction),
        manualAdjustment: round2(salaryData.manualAdjustment),
        adjustmentReason: salaryData.adjustmentReason || "",
        totalDeductions,
      },
      formulas: {
        late: `deductible late ${round2(salaryData.lateEquivalentMinutes)} min × per-min ₹${round2(calculation.perMinuteRate)} × X ${adjustment.penaltyMultiplier || 1} = ₹${round2(salaryData.lateDeduction)}`,
        absent: salaryType === "fixed"
          ? `per-day ₹${round2(actualDaySalary)} × Σ penalty units ${round2(salaryData.absentPenaltyUnits)} = ₹${round2(salaryData.lopAmount)}`
          : `base absent days are already unpaid in ${salaryType} earnings; extra units ${round2(Math.max(0, Number(salaryData.absentPenaltyUnits || 0) - Number(salaryData.lopDays || 0)))} × per-day ₹${round2(actualDaySalary)} = ₹${round2(salaryData.lopAmount)}`,
        halfDay: `short ${salaryData.halfDayShortMinutes || 0} min × per-min + ${adjustment.halfDayFlatUnits || 0} flat units × per-day = ₹${round2(salaryData.shortfallDeduction)}`,
        break: `completed break above ${salaryData.breakAllowanceMinutes || 0}m allowance: ${salaryData.excessBreakMinutes || 0} min × ₹${salaryData.excessBreakDeductionPerMinute || 0}/min = ₹${round2(salaryData.breakPenalty)}`,
        net: `gross ₹${round2(gross)} + OT ₹${round2(salaryData.otAmount)} + incentive ₹${round2(salaryData.incentiveBonus)} − deductions ₹${totalDeductions} = ₹${netSalary}`,
      },
      netSalary,
      days,
    });
  } catch (error) {
    console.error("salary-breakdown error:", error.message);
    const status = /not found/i.test(error.message) ? 404 : /valid|future/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

export default router;
