// Fallback salary processing without Redis
import { employeeSchema } from "../models/Employee.js";
import { salarySlipSchema } from "../models/SalarySlip.js";
import { attendanceSchema } from "../models/Attendance.js";
import { hrmsSettingsSchema } from "../models/HrmsSettings.js";
import { leavePolicySchema } from "../models/LeavePolicy.js";
import {
  countWorkingDays,
  computeAttendanceAdjustments,
  computeLateDeduction,
  computeHalfDayDeduction,
  computeTotalWorkingMinutes,
  daysInMonth,
} from "../utils/hrmsSalaryCalc.js";
import {
  getDueInstallments,
  markInstallmentPaid,
} from "../controllers/loanAdvanceController.js";
import { getHolidayDatesForMonth } from "../controllers/holidayController.js";
import { calculateAttendanceTime } from "../utils/attendanceTime.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve company-scoped models from a database connection
const getModels = (dbConnection) => {
  if (!dbConnection) {
    throw new Error(
      "Database connection is required for salary processing (multi-company)"
    );
  }
  return {
    Employee:
      dbConnection.models.Employee ||
      dbConnection.model("Employee", employeeSchema),
    SalarySlip:
      dbConnection.models.SalarySlip ||
      dbConnection.model("SalarySlip", salarySlipSchema),
    Attendance:
      dbConnection.models.Attendance ||
      dbConnection.model("Attendance", attendanceSchema),
    HrmsSettings:
      dbConnection.models.HrmsSettings ||
      dbConnection.model("HrmsSettings", hrmsSettingsSchema),
    LeavePolicy:
      dbConnection.models.LeavePolicy ||
      dbConnection.model("LeavePolicy", leavePolicySchema),
  };
};

const workedHoursOf = (record, allowedLunchMinutes) => (
  calculateAttendanceTime(record, { allowedLunchMinutes }).creditedWorkingHours
);

// Direct salary calculation without queue
export const generateSalarySlipDirect = async (
  employeeId,
  month,
  year,
  generatedBy,
  type = "manual",
  dbConnection,
  extras = {}
) => {
  try {
    const previewOnly = extras.previewOnly === true;
    const yNum = parseInt(year, 10);
    const mNum = parseInt(month, 10);
    if (!Number.isInteger(yNum) || !Number.isInteger(mNum) || mNum < 1 || mNum > 12) {
      throw new Error("A valid salary month and year are required");
    }

    // Future months are invalid. Current-month final generation is allowed only
    // when every required date has a finalized/reviewed record; the unresolved
    // guard below therefore blocks premature generation while still allowing
    // payroll on the last working day. Preview is capped at the last completed
    // IST day.
    const nowIst = new Date(Date.now() + 5.5 * 3600000);
    const currentYear = nowIst.getUTCFullYear();
    const currentMonth = nowIst.getUTCMonth() + 1;
    const targetKey = yNum * 100 + mNum;
    const currentKey = currentYear * 100 + currentMonth;
    if (!previewOnly && targetKey > currentKey) {
      throw new Error("Final salary cannot be generated for a future month");
    }
    if (previewOnly && targetKey > currentKey) {
      throw new Error("Salary preview is not available for a future month");
    }

    const { Employee, SalarySlip, Attendance, HrmsSettings, LeavePolicy } = getModels(dbConnection);
    console.log(
      `Processing salary for employee ${employeeId}, ${month}/${year} (${type})`
    );

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    // Company-wide HRMS settings drive OT / late / shortfall (admin-configurable)
    let hrmsSettings = await HrmsSettings.findOne({ key: "default" });
    if (!hrmsSettings) hrmsSettings = previewOnly ? {} : await HrmsSettings.create({ key: "default" });
    const allowedLunchMinutes = Math.max(0, Number(hrmsSettings?.allowedLunchMinutes ?? 45) || 0);

    // Load leave policy to determine which leave types are paid
    let leavePolicy = await LeavePolicy.findOne({ key: "default" });
    const paidLeaveTypes = new Set();
    if (leavePolicy && leavePolicy.types) {
      leavePolicy.types.forEach(t => { if (t.paid && t.active) paidLeaveTypes.add(t.label); });
    }
    // The unplanned free/excused leave uses this canonical protected type even
    // when the configurable leave policy has other labels.
    paidLeaveTypes.add('Paid Leave');
    if (paidLeaveTypes.size === 1) {
      paidLeaveTypes.add('Sick Leave');
      paidLeaveTypes.add('Casual Leave');
    }

    // Debug employee salary data
    console.log(`Employee ${employee.name} salary data:`, {
      salaryType: employee.salaryType,
      basicSalary: employee.basicSalary,
      hra: employee.hra,
      conveyance: employee.conveyance,
      medicalAllowance: employee.medicalAllowance,
      specialAllowance: employee.specialAllowance,
    });

    // Check if salary slip already exists
    const existingSlip = await SalarySlip.findOne({
      employeeId,
      month,
      year,
    });

    if (!previewOnly && existingSlip) {
      console.log(
        `Salary slip already exists for ${employee.name} - ${month}/${year}`
      );
      return {
        success: false,
        message: "Salary slip already exists",
        employeeName: employee.name,
      };
    }

    // Calculate salary period (1st to last day of month) using IST boundaries.
    // IST midnight = 18:30 UTC of the previous day.
    const istMid = (d) => {
      const ms = new Date(d).getTime() + 5.5 * 3600000;
      const ist = new Date(ms); ist.setUTCHours(0, 0, 0, 0);
      return new Date(ist.getTime() - 5.5 * 3600000);
    };
    const periodFrom = istMid(new Date(yNum, mNum - 1, 1));
    const fullPeriodTo = new Date(istMid(new Date(yNum, mNum, 0)).getTime() + 86400000 - 1);
    let periodTo = fullPeriodTo;
    if (previewOnly && targetKey === currentKey) {
      const todayStartUtc = new Date(Date.UTC(currentYear, currentMonth - 1, nowIst.getUTCDate()) - 5.5 * 3600000);
      periodTo = new Date(todayStartUtc.getTime() - 1); // yesterday 23:59:59.999 IST
    }

    const holidayDates = await getHolidayDatesForMonth(dbConnection, yNum, mNum, employee);

    // Get attendance for the month
    const attendance = await Attendance.find({
      employee: employeeId,
      date: {
        $gte: periodFrom,
        $lte: periodTo,
      },
    });

    // Calculate working days (excluding the employee's own weekly off — Point 3)
    const getOffDays = (weeklyOff) => {
      const DI = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      if (!weeklyOff) return [];
      const days = Array.isArray(weeklyOff) ? weeklyOff : [weeklyOff];
      return days.map(d => DI[d]).filter(d => d !== undefined);
    };
    const offDays = getOffDays(employee.weeklyOff);
    let workingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    // Sum of per-day multipliers for unexcused absences (Absent Review).
    // Each unexcused day contributes its own X (e.g. 1, 1.5, 2). Plain absent
    // days with no review default to X = 1.
    let absentMultiplierUnits = 0;
    const unresolvedDates = [];
    const joiningDateKey = employee.dateOfJoining
      ? new Date(new Date(employee.dateOfJoining).getTime() + 5.5 * 3600000).toISOString().slice(0, 10)
      : null;
    const targetMonthLastKey = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(yNum, mNum)).padStart(2, "0")}`;
    if (joiningDateKey && joiningDateKey > targetMonthLastKey) {
      if (previewOnly) {
        throw new Error("Invalid salary period: employee joins after the target month");
      }
      return {
        success: false,
        message: "Employee was not employed during the target month",
        employeeName: employee.name,
      };
    }
    let currentDate = new Date(periodFrom);

    while (currentDate <= periodTo) {
      // Use IST day-of-week (server is UTC; IST = UTC+5:30)
      const istDate = new Date(currentDate.getTime() + 5.5 * 3600000);
      const dayOfWeek = istDate.getUTCDay();
      const currentIST = new Date(currentDate.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
      // Weekly offs and applicable holidays are paid non-working days.
      if ((!joiningDateKey || currentIST >= joiningDateKey) && !offDays.includes(dayOfWeek) && !holidayDates.has(currentIST)) {
        workingDays++;

        // Check if employee was present on this day using IST calendar day matching
        // (attendance dates stored as IST midnight = 18:30 UTC of previous day)
        const attendanceRecord = attendance.find((a) => {
          const aIST = new Date(new Date(a.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
          return aIST === currentIST;
        });

        if (attendanceRecord) {
          if (
            attendanceRecord.status === "Present" ||
            attendanceRecord.status === "Late" ||
            attendanceRecord.status === "Half Day"
          ) {
            presentDays++;
          } else if (attendanceRecord.status === "Leave") {
            // Check LeavePolicy to determine if this leave type is paid
            const isProtectedReview = ['auto_paid', 'excused'].includes(attendanceRecord.reviewStatus);
            const isPaidLeave = isProtectedReview || paidLeaveTypes.has(attendanceRecord.leaveType);
            if (isPaidLeave) {
              leaveDays++;
              presentDays++; // Paid leave counts as present for salary
            } else {
              // Unpaid leave (e.g. unexcused absence marked via Absent Review).
              // Deduct with its own X multiplier (default 1 if unset).
              const x = attendanceRecord.absentDeductionMultiplier != null
                ? Number(attendanceRecord.absentDeductionMultiplier)
                : 1;
              absentMultiplierUnits += (x >= 0 ? x : 1);
            }
          } else if (attendanceRecord.status === "Absent") {
            // Unreviewed/pending days are provisional in preview and block final
            // generation so an admin decision can never be silently persisted.
            if (attendanceRecord.reviewStatus !== 'unexcused') unresolvedDates.push(currentIST);
            const x = attendanceRecord.absentDeductionMultiplier != null
              ? Number(attendanceRecord.absentDeductionMultiplier)
              : 1;
            absentMultiplierUnits += (x >= 0 ? x : 1);
          }
        } else {
          // Missing working-day attendance is provisional X=1 in preview and
          // blocks final generation for completed months.
          unresolvedDates.push(currentIST);
          absentMultiplierUnits += 1;
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (!previewOnly && unresolvedDates.length > 0) {
      throw new Error(`Cannot generate final salary: ${unresolvedDates.length} attendance day(s) are missing or pending review (${unresolvedDates.slice(0, 5).join(', ')}${unresolvedDates.length > 5 ? ', ...' : ''})`);
    }

    // Head-count of absent days (for display). Actual money uses absentMultiplierUnits.
    const absentDays = workingDays - presentDays;

    // Resolve attendance rules once, before branching by salary type, so preview
    // and persisted generation use the same employee-specific required minutes.
    const adjustmentAttendance = attendance.filter((record) => !holidayDates.has(
      new Date(new Date(record.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10)
    ));
    const adj = computeAttendanceAdjustments(adjustmentAttendance, employee, hrmsSettings);
    const perDayMinutes = adj.halfDayRequiredMin || adj.requiredMin;
    const totalWorkingMinutes = computeTotalWorkingMinutes(yNum, mNum, employee, perDayMinutes);
    const daysInThisMonth = daysInMonth(yNum, mNum);

    // Calculate salary based on salary type.
    let calculatedBasic = 0;
    let calculatedHRA = 0;
    let calculatedConveyance = 0;
    let calculatedMedical = 0;
    let calculatedSpecial = 0;
    let calculatedPF = 0;
    let calculatedTDS = 0;
    let grossSalary = 0;
    let netSalary = 0;
    let lopDays = Math.max(0, absentDays);
    let lopAmount = 0;
    let adjustmentGrossBase = 0;
    let absenceDayRate = 0;
    let fixedProrationFactor = 1;
    let payableCalendarDays = daysInThisMonth;
    const paidLeaveDays = leaveDays;
    const salaryType = employee.salaryType || "fixed";

    if (salaryType === "fixed") {
      // Keep an unprorated contractual base for per-day/minute penalties. A
      // mid-month joiner earns only the eligible calendar-day fraction, while
      // an absence after joining still costs the normal contractual day rate.
      let contractBasic = parseFloat(employee.basicSalary) || 0;
      const contractHRA = parseFloat(employee.hra) || 0;
      const contractConveyance = parseFloat(employee.conveyance) || 0;
      const contractMedical = parseFloat(employee.medicalAllowance) || 0;
      const contractSpecial = parseFloat(employee.specialAllowance) || 0;
      if (contractBasic === 0) {
        contractBasic = 15000;
        console.log(`Using default basic salary for ${employee.name}: ${contractBasic}`);
      }

      const monthFirstKey = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthLastKey = `${year}-${String(month).padStart(2, "0")}-${String(daysInThisMonth).padStart(2, "0")}`;
      if (joiningDateKey && joiningDateKey > monthLastKey) {
        payableCalendarDays = 0;
      } else if (joiningDateKey && joiningDateKey > monthFirstKey) {
        payableCalendarDays = daysInThisMonth - Number(joiningDateKey.slice(8, 10)) + 1;
      }
      fixedProrationFactor = daysInThisMonth > 0 ? payableCalendarDays / daysInThisMonth : 0;

      calculatedBasic = contractBasic * fixedProrationFactor;
      calculatedHRA = contractHRA * fixedProrationFactor;
      calculatedConveyance = contractConveyance * fixedProrationFactor;
      calculatedMedical = contractMedical * fixedProrationFactor;
      calculatedSpecial = contractSpecial * fixedProrationFactor;
      calculatedPF = (parseFloat(employee.pf) || 0) * fixedProrationFactor;
      calculatedTDS = (parseFloat(employee.tds) || 0) * fixedProrationFactor;
      adjustmentGrossBase = contractBasic + contractHRA + contractConveyance + contractMedical + contractSpecial;
      absenceDayRate = daysInThisMonth > 0 ? adjustmentGrossBase / daysInThisMonth : 0;
      grossSalary = calculatedBasic + calculatedHRA + calculatedConveyance + calculatedMedical + calculatedSpecial;

      if (absentMultiplierUnits > 0) {
        lopAmount = parseFloat((absenceDayRate * absentMultiplierUnits).toFixed(2));
      }
    } else if (salaryType === "daily") {
      const dailyRate = parseFloat(employee.basicSalary) || 0;
      calculatedBasic = dailyRate * presentDays;
      grossSalary = calculatedBasic;
      calculatedPF = grossSalary * 0.12;
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
      absenceDayRate = dailyRate;
      adjustmentGrossBase = perDayMinutes > 0
        ? dailyRate * (totalWorkingMinutes / perDayMinutes)
        : dailyRate * daysInThisMonth;
      // One unpaid day is already omitted from daily earnings. Only the part
      // of an admin multiplier above X=1 is an additional deduction.
      const additionalPenaltyUnits = Math.max(0, absentMultiplierUnits - lopDays);
      lopAmount = parseFloat((dailyRate * additionalPenaltyUnits).toFixed(2));
    } else if (salaryType === "hourly") {
      const totalHours = attendance.reduce((total, record) => {
        if (record.status === "Present" || record.status === "Late" || record.status === "Half Day") {
          return total + workedHoursOf(record, allowedLunchMinutes);
        }
        return total;
      }, 0);

      const hourlyRate = parseFloat(employee.basicSalary) || 0;
      const paidLeaveHours = paidLeaveDays * (perDayMinutes / 60);
      calculatedBasic = hourlyRate * (totalHours + paidLeaveHours);
      grossSalary = calculatedBasic;
      calculatedPF = grossSalary * 0.12;
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
      absenceDayRate = hourlyRate * (perDayMinutes / 60);
      adjustmentGrossBase = hourlyRate * (totalWorkingMinutes / 60);
      const additionalPenaltyUnits = Math.max(0, absentMultiplierUnits - lopDays);
      lopAmount = parseFloat((absenceDayRate * additionalPenaltyUnits).toFixed(2));
    }

    calculatedPF = isNaN(calculatedPF) ? 0 : calculatedPF;
    calculatedTDS = isNaN(calculatedTDS) ? 0 : calculatedTDS;
    grossSalary = isNaN(grossSalary) ? 0 : grossSalary;
    adjustmentGrossBase = isNaN(adjustmentGrossBase) ? 0 : adjustmentGrossBase;
    absenceDayRate = isNaN(absenceDayRate) ? 0 : absenceDayRate;
    lopAmount = isNaN(lopAmount) ? 0 : lopAmount;

    const actualMonthDaySalary = absenceDayRate;
    const otAmount = parseFloat((adj.otAmount || 0).toFixed(2));
    const lateDeduction = salaryType === "hourly" ? 0 : parseFloat(
      (computeLateDeduction(adj, adjustmentGrossBase, totalWorkingMinutes) || 0).toFixed(2)
    );
    // Hourly gross already contains only worked/paid-leave hours, so applying
    // separate late, half-day, or shortfall deductions would charge missing
    // time twice.
    const halfDayDeduction = salaryType === "hourly" ? 0 : parseFloat(
      (computeHalfDayDeduction(adj, adjustmentGrossBase, totalWorkingMinutes, actualMonthDaySalary) || 0).toFixed(2)
    );
    const shortfallDeduction = salaryType === "hourly"
      ? 0
      : (adj.halfDayEnabled
        ? halfDayDeduction
        : parseFloat((adj.shortfallAmount || 0).toFixed(2)));

    // ── Loan/advance installment for this month (Point 4) ──
    const monthNum = parseInt(month, 10);
    const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
    let dueInstallments;
    let loanDeduction;
    if (previewOnly && existingSlip) {
      // Final generation marks installments paid. Reuse the persisted month's
      // deduction when comparing an existing slip so the preview does not
      // falsely drop a legitimately recovered installment.
      dueInstallments = (existingSlip.loanRefs || []).map((ref) => ({
        loanId: ref.loanId,
        amount: Number(ref.amount || 0),
      }));
      loanDeduction = parseFloat(Number(existingSlip.loanDeduction || 0).toFixed(2));
    } else {
      dueInstallments = await getDueInstallments(dbConnection, employeeId, monthKey);
      loanDeduction = parseFloat(
        dueInstallments.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2)
      );
    }

    // ── Manual monthly fields (Point 12) ──
    const incentiveBonus = extras.incentiveBonus != null
      ? (parseFloat(extras.incentiveBonus) || 0)
      : (previewOnly ? (parseFloat(existingSlip?.incentiveBonus) || 0) : 0);
    const manualAdjustment = extras.manualAdjustment != null
      ? (parseFloat(extras.manualAdjustment) || 0)
      : (previewOnly ? (parseFloat(existingSlip?.manualAdjustment) || 0) : 0);
    const adjustmentReason = extras.adjustmentReason != null
      ? extras.adjustmentReason
      : (previewOnly ? (existingSlip?.adjustmentReason || "") : "");

    const totalDeductions =
      calculatedPF +
      (parseFloat(employee.professionalTax) || 0) +
      calculatedTDS +
      (parseFloat(employee.otherDeductions) || 0) +
      lopAmount +
      lateDeduction +
      shortfallDeduction +
      loanDeduction +
      manualAdjustment;

    // Net = gross + OT + incentive/bonus − all deductions
    netSalary = grossSalary + otAmount + incentiveBonus - totalDeductions;

    // Final safety check for NaN values
    if (isNaN(netSalary)) netSalary = 0;
    if (isNaN(totalDeductions)) totalDeductions = 0;
    // A payslip's net pay is never negative (excess loan/LOP carries via loan balance).
    netSalary = Math.max(0, netSalary);

    // Create salary slip
    const salaryData = {
      employeeId,
      employee: {
        name: employee.name,
        empId: employee.empId,
        designation: employee.designation,
        department: employee.department,
      },
      month,
      year,
      basicSalary: calculatedBasic || 0,
      hra: calculatedHRA || 0,
      conveyance: calculatedConveyance || 0,
      medicalAllowance: calculatedMedical || 0,
      specialAllowance: calculatedSpecial || 0,
      pf: calculatedPF || 0,
      professionalTax: parseFloat(employee.professionalTax) || 0,
      tds: calculatedTDS || 0,
      otherDeductions: parseFloat(employee.otherDeductions) || 0,
      grossSalary: grossSalary || 0,
      totalDeductions: totalDeductions || 0,
      netSalary: netSalary || 0,
      workingDays,
      daysWorked: presentDays,
      absentDays: Math.max(0, absentDays),
      leaveDays: paidLeaveDays,
      lopDays: lopDays || 0,
      lopAmount: lopAmount || 0,
      absentPenaltyUnits: parseFloat((absentMultiplierUnits || 0).toFixed(2)), // Σ of per-day X multipliers

      // HRMS earnings
      otMinutes: adj.otMinutes || 0,
      otAmount: otAmount || 0,
      incentiveBonus: incentiveBonus || 0,

      // HRMS deductions
      lateDays: adj.lateDaysCount || 0,
      lateMinutes: adj.lateExcessMinutes || 0,
      lateDeduction: lateDeduction || 0,
      // OT-Late offset (Scenario 1 & 2) — informational
      otLateOffsetEnabled: adj.offsetEnabled || false,
      otRequiredMinutes: adj.offsetRequiredOt || 0,
      lateEquivalentMinutes: adj.lateEquivalentMinutes || 0,
      otSurplusMinutes: adj.surplusDisplayMinutes || 0,
      // Half-day / shortfall
      halfDayCount: adj.halfDayCount || 0,
      halfDayShortMinutes: adj.halfDayShortMinutes || 0,
      shortfallMinutes: adj.halfDayEnabled ? (adj.halfDayShortMinutes || 0) : (adj.shortfallMinutes || 0),
      shortfallDeduction: shortfallDeduction || 0,
      loanDeduction: loanDeduction || 0,
      loanRefs: dueInstallments.map((d) => ({ loanId: d.loanId, amount: d.amount })),
      manualAdjustment: manualAdjustment || 0,
      adjustmentReason,
      hoursWorked:
        attendance.reduce((total, record) => {
          if (record.status === "Present" || record.status === "Late" || record.status === "Half Day") {
            return total + workedHoursOf(record, allowedLunchMinutes);
          }
          return total;
        }, 0) || 0,
      calculationVersion: "hrms-v2",
      attendanceCutoff: periodTo,
      actualDaysInMonth: daysInThisMonth,
      requiredWorkingMinutes: perDayMinutes,
      adjustmentGrossBase,
      absenceDayRate,
      fixedProrationFactor,
      payableCalendarDays,
      perMinuteSalaryRate: totalWorkingMinutes > 0 ? adjustmentGrossBase / totalWorkingMinutes : 0,
      halfDayThresholdMinutes: adj.halfDayThresholdMin || 0,
      salaryType,
      bankDetails: {
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        ifscCode: employee.ifscCode,
      },
      status: "generated",
      generatedBy,
      generationType: type,
    };

    if (previewOnly) {
      return {
        success: true,
        preview: true,
        salaryData,
        employee: employee.toObject ? employee.toObject() : employee,
        attendance: attendance.map((record) => record.toObject ? record.toObject() : record),
        attendanceAdjustments: adj,
        hrmsSettings: hrmsSettings.toObject ? hrmsSettings.toObject() : hrmsSettings,
        existingSalarySlip: existingSlip?.toObject ? existingSlip.toObject() : existingSlip,
        period: { from: periodFrom, to: periodTo, fullMonthTo: fullPeriodTo, month: mNum, year: yNum },
        calculation: {
          daysInMonth: daysInThisMonth,
          perDayByMonth: actualMonthDaySalary,
          absenceDayRate,
          adjustmentGrossBase,
          fixedProrationFactor,
          payableCalendarDays,
          perMinuteRate: totalWorkingMinutes > 0 ? adjustmentGrossBase / totalWorkingMinutes : 0,
          totalWorkingMinutes,
          unresolvedDates,
          holidayDates: [...holidayDates],
          isTillDate: targetKey === currentKey,
        },
      };
    }

    const salary = new SalarySlip(salaryData);
    await salary.save();

    // Mark this month's loan installments as recovered (Point 4)
    for (const d of dueInstallments) {
      try {
        await markInstallmentPaid(dbConnection, d.loanId, monthKey);
      } catch (e) {
        console.error(`Failed to mark loan ${d.loanId} installment paid:`, e.message);
      }
    }

    console.log(`Salary generated successfully for ${employee.name}`);

    return {
      success: true,
      salaryId: salary._id,
      employeeName: employee.name,
      netSalary,
      type,
    };
  } catch (error) {
    console.error(`Error generating salary for employee ${employeeId}:`, error);
    throw error;
  }
};

// Fallback functions for when Redis is not available
export const addSalaryJob = async (
  employeeId,
  month,
  year,
  generatedBy,
  type = "manual",
  dbConnection,
  extras = {}
) => {
  // Process directly without queue
  return await generateSalarySlipDirect(
    employeeId,
    month,
    year,
    generatedBy,
    type,
    dbConnection,
    extras
  );
};

export const addBulkSalaryJobs = async (
  month,
  year,
  generatedBy,
  type = "manual",
  dbConnection
) => {
  try {
    const { Employee } = getModels(dbConnection);
    const employees = await Employee.find({ status: "Active" });
    const results = [];

    for (const employee of employees) {
      try {
        const result = await generateSalarySlipDirect(
          employee._id,
          month,
          year,
          generatedBy,
          type,
          dbConnection
        );
        results.push(result);
      } catch (error) {
        console.error(
          `Failed to generate salary for ${employee.name}:`,
          error.message
        );
        results.push({
          success: false,
          employeeName: employee.name,
          error: error.message,
        });
      }
    }

    console.log(
      `Processed ${results.length} salary slips for ${month}/${year}`
    );
    return results;
  } catch (error) {
    console.error("Error adding bulk salary jobs:", error);
    throw error;
  }
};

export const getQueueStatus = async () => {
  return {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    jobs: {
      waiting: [],
      active: [],
      failed: [],
    },
    mode: "direct",
    message: "Processing salary slips directly (Redis not available)",
  };
};

// Export null values for compatibility
export const salaryQueue = null;
export const salaryWorker = null;
