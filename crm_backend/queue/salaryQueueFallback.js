// Fallback salary processing without Redis
import { employeeSchema } from "../models/Employee.js";
import { salarySlipSchema } from "../models/SalarySlip.js";
import { attendanceSchema } from "../models/Attendance.js";
import { hrmsSettingsSchema } from "../models/HrmsSettings.js";
import {
  countWorkingDays,
  computeAttendanceAdjustments,
  computeLateDeduction,
} from "../utils/hrmsSalaryCalc.js";
import {
  getDueInstallments,
  markInstallmentPaid,
} from "../controllers/loanAdvanceController.js";
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
  };
};

// Worked hours for a day: sum of completed in/out sessions (excludes break gaps),
// falling back to legacy punchIn/out, then stored workingHours. Matches the
// multi-punch model so hourly pay and hoursWorked don't count lunch breaks.
const workedHoursOf = (record) => {
  const sessions = (record.sessions || []).filter((s) => s.in?.time && s.out?.time);
  if (sessions.length) {
    let ms = 0;
    sessions.forEach((s) => { ms += new Date(s.out.time) - new Date(s.in.time); });
    return Math.max(0, ms / 3600000);
  }
  if (record.punchIn?.time && record.punchOut?.time) {
    return Math.max(0, (new Date(record.punchOut.time) - new Date(record.punchIn.time)) / 3600000);
  }
  return record.workingHours || 0;
};

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
    const { Employee, SalarySlip, Attendance, HrmsSettings } = getModels(dbConnection);
    console.log(
      `Processing salary for employee ${employeeId}, ${month}/${year} (${type})`
    );

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    // Company-wide HRMS settings drive OT / late / shortfall (admin-configurable)
    let hrmsSettings = await HrmsSettings.findOne({ key: "default" });
    if (!hrmsSettings) hrmsSettings = await HrmsSettings.create({ key: "default" });

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

    if (existingSlip) {
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
    const periodFrom = istMid(new Date(year, month - 1, 1));
    const periodTo = new Date(istMid(new Date(year, month, 0)).getTime() + 86400000 - 1);

    // Get attendance for the month
    const attendance = await Attendance.find({
      employee: employeeId,
      date: {
        $gte: periodFrom,
        $lte: periodTo,
      },
    });

    // Calculate working days (excluding the employee's own weekly off — Point 3)
    const offDayIndex = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    }[employee.weeklyOff] ?? 0;
    let workingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let currentDate = new Date(periodFrom);

    while (currentDate <= periodTo) {
      // Use IST day-of-week (server is UTC; IST = UTC+5:30)
      const istDate = new Date(currentDate.getTime() + 5.5 * 3600000);
      const dayOfWeek = istDate.getUTCDay();
      // Skip the employee's weekly off (paid week-off, not counted in divisor)
      if (dayOfWeek !== offDayIndex) {
        workingDays++;

        // Check if employee was present on this day using IST calendar day matching
        // (attendance dates stored as IST midnight = 18:30 UTC of previous day)
        const currentIST = new Date(currentDate.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
        const attendanceRecord = attendance.find((a) => {
          const aIST = new Date(new Date(a.date).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
          return aIST === currentIST;
        });

        if (attendanceRecord) {
          if (
            attendanceRecord.status === "Present" ||
            attendanceRecord.status === "Late"
          ) {
            presentDays++;
          } else if (attendanceRecord.status === "Leave") {
            // Unpaid leave is not paid; all other leave types count as paid
            if (attendanceRecord.leaveType !== "Unpaid Leave") {
              leaveDays++;
              presentDays++; // Paid leave counts as present for salary
            }
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const absentDays = workingDays - presentDays;

    // Calculate salary based on salary type
    let calculatedBasic = 0;
    let calculatedHRA = 0;
    let calculatedConveyance = 0;
    let calculatedMedical = 0;
    let calculatedSpecial = 0;
    let calculatedPF = 0;
    let calculatedTDS = 0;
    let grossSalary = 0;
    let netSalary = 0;
    let lopDays = 0; // Loss-of-pay days (unpaid leave + unauthorized absence)
    let lopAmount = 0; // Amount deducted for LOP (fixed salary only)
    const paidLeaveDays = leaveDays; // leaveDays already excludes Unpaid Leave

    if (employee.salaryType === "fixed" || !employee.salaryType) {
      // For fixed salary, use the stored salary components with proper null checks
      calculatedBasic = parseFloat(employee.basicSalary) || 0;
      calculatedHRA = parseFloat(employee.hra) || 0;
      calculatedConveyance = parseFloat(employee.conveyance) || 0;
      calculatedMedical = parseFloat(employee.medicalAllowance) || 0;
      calculatedSpecial = parseFloat(employee.specialAllowance) || 0;
      calculatedPF = parseFloat(employee.pf) || 0;
      calculatedTDS = parseFloat(employee.tds) || 0;

      // If no basic salary is set, use a default minimum wage
      if (calculatedBasic === 0) {
        calculatedBasic = 15000; // Default minimum salary
        console.log(
          `Using default basic salary for ${employee.name}: ${calculatedBasic}`
        );
      }

      grossSalary =
        calculatedBasic +
        calculatedHRA +
        calculatedConveyance +
        calculatedMedical +
        calculatedSpecial;

      // Loss of Pay: deduct full-month gross per-day for every unpaid-leave /
      // unauthorized-absent weekday. Paid leave is protected (counted present).
      lopDays = Math.max(0, absentDays);
      if (workingDays > 0 && lopDays > 0) {
        const perDaySalary = grossSalary / workingDays;
        lopAmount = parseFloat((perDaySalary * lopDays).toFixed(2));
      }
    } else if (employee.salaryType === "daily") {
      // For daily wage with proper null checks
      const dailyRate = parseFloat(employee.basicSalary) || 0;
      calculatedBasic = dailyRate * presentDays; // paid leave already in presentDays

      grossSalary = calculatedBasic;
      calculatedPF = grossSalary * 0.12; // 12% PF
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0; // 5% TDS if salary > 50k
      // Absent / unpaid-leave days are simply unpaid for daily wage (no separate deduction)
      lopDays = Math.max(0, absentDays);
    } else if (employee.salaryType === "hourly") {
      // For hourly wage - total hours actually worked (sessions-aware, excludes breaks)
      const totalHours = attendance.reduce((total, record) => {
        if (record.status === "Present" || record.status === "Late") {
          return total + workedHoursOf(record);
        }
        return total;
      }, 0);

      const hourlyRate = parseFloat(employee.basicSalary) || 0;
      // Approved paid leave is compensated at a standard 8 hours/day
      const paidLeaveHours = paidLeaveDays * 8;
      calculatedBasic = hourlyRate * (totalHours + paidLeaveHours);
      grossSalary = calculatedBasic;

      calculatedPF = grossSalary * 0.12;
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
      lopDays = Math.max(0, absentDays);
    }

    // Ensure all values are numbers and not NaN
    calculatedPF = isNaN(calculatedPF) ? 0 : calculatedPF;
    calculatedTDS = isNaN(calculatedTDS) ? 0 : calculatedTDS;
    grossSalary = isNaN(grossSalary) ? 0 : grossSalary;
    lopAmount = isNaN(lopAmount) ? 0 : lopAmount;

    // ── HRMS adjustments: OT / late / shortfall (Points 5, 7, 2) ──
    const adj = computeAttendanceAdjustments(attendance, employee, hrmsSettings);
    const perDaySalary = workingDays > 0 ? grossSalary / workingDays : 0;
    const otAmount = parseFloat((adj.otAmount || 0).toFixed(2));
    const lateDeduction = parseFloat(
      (computeLateDeduction(adj, hrmsSettings, perDaySalary) || 0).toFixed(2)
    );
    const shortfallDeduction = parseFloat((adj.shortfallAmount || 0).toFixed(2));

    // ── Loan/advance installment for this month (Point 4) ──
    const monthNum = parseInt(month, 10);
    const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
    const dueInstallments = await getDueInstallments(
      dbConnection,
      employeeId,
      monthKey
    );
    const loanDeduction = parseFloat(
      dueInstallments.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2)
    );

    // ── Manual monthly fields (Point 12) ──
    const incentiveBonus = parseFloat(extras.incentiveBonus) || 0;
    const manualAdjustment = parseFloat(extras.manualAdjustment) || 0;
    const adjustmentReason = extras.adjustmentReason || "";

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

      // HRMS earnings
      otMinutes: adj.otMinutes || 0,
      otAmount: otAmount || 0,
      incentiveBonus: incentiveBonus || 0,

      // HRMS deductions
      lateDays: adj.lateDaysCount || 0,
      lateDeduction: lateDeduction || 0,
      shortfallMinutes: adj.shortfallMinutes || 0,
      shortfallDeduction: shortfallDeduction || 0,
      loanDeduction: loanDeduction || 0,
      loanRefs: dueInstallments.map((d) => ({ loanId: d.loanId, amount: d.amount })),
      manualAdjustment: manualAdjustment || 0,
      adjustmentReason,
      hoursWorked:
        attendance.reduce((total, record) => {
          if (record.status === "Present" || record.status === "Late") {
            return total + workedHoursOf(record);
          }
          return total;
        }, 0) || 0,
      salaryType: employee.salaryType,
      bankDetails: {
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        ifscCode: employee.ifscCode,
      },
      status: "generated",
      generatedBy,
      generationType: type,
    };

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
