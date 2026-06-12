// Fallback salary processing without Redis
import { employeeSchema } from "../models/Employee.js";
import { salarySlipSchema } from "../models/SalarySlip.js";
import { attendanceSchema } from "../models/Attendance.js";
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
  };
};

// Direct salary calculation without queue
export const generateSalarySlipDirect = async (
  employeeId,
  month,
  year,
  generatedBy,
  type = "manual",
  dbConnection
) => {
  try {
    const { Employee, SalarySlip, Attendance } = getModels(dbConnection);
    console.log(
      `Processing salary for employee ${employeeId}, ${month}/${year} (${type})`
    );

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
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

    // Calculate salary period (1st to last day of month)
    const periodFrom = new Date(year, month - 1, 1);
    const periodTo = new Date(year, month, 0); // Last day of month

    // Get attendance for the month
    const attendance = await Attendance.find({
      employee: employeeId,
      date: {
        $gte: periodFrom,
        $lte: periodTo,
      },
    });

    // Calculate working days (excluding weekends)
    let workingDays = 0;
    let presentDays = 0;
    let leaveDays = 0;
    let currentDate = new Date(periodFrom);

    while (currentDate <= periodTo) {
      const dayOfWeek = currentDate.getDay();
      // Exclude weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;

        // Check if employee was present on this day
        const attendanceRecord = attendance.find(
          (a) => a.date.toDateString() === currentDate.toDateString()
        );

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
      // For hourly wage - calculate total hours actually worked from punches
      const totalHours = attendance.reduce((total, record) => {
        if (
          (record.status === "Present" || record.status === "Late") &&
          record.punchIn &&
          record.punchOut
        ) {
          const punchInTime = new Date(record.punchIn.time);
          const punchOutTime = new Date(record.punchOut.time);

          if (!isNaN(punchInTime.getTime()) && !isNaN(punchOutTime.getTime())) {
            const hoursWorked = (punchOutTime - punchInTime) / (1000 * 60 * 60);
            return total + Math.max(0, hoursWorked);
          }
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

    const totalDeductions =
      calculatedPF +
      (parseFloat(employee.professionalTax) || 0) +
      calculatedTDS +
      (parseFloat(employee.otherDeductions) || 0) +
      lopAmount;

    netSalary = grossSalary - totalDeductions;

    // Final safety check for NaN values
    if (isNaN(netSalary)) netSalary = 0;
    if (isNaN(totalDeductions)) totalDeductions = 0;

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
      hoursWorked:
        attendance.reduce((total, record) => {
          if (
            (record.status === "Present" || record.status === "Late") &&
            record.punchIn &&
            record.punchOut
          ) {
            const punchInTime = new Date(record.punchIn.time);
            const punchOutTime = new Date(record.punchOut.time);

            if (
              !isNaN(punchInTime.getTime()) &&
              !isNaN(punchOutTime.getTime())
            ) {
              const hoursWorked =
                (punchOutTime - punchInTime) / (1000 * 60 * 60);
              return total + Math.max(0, hoursWorked);
            }
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
  dbConnection
) => {
  // Process directly without queue
  return await generateSalarySlipDirect(
    employeeId,
    month,
    year,
    generatedBy,
    type,
    dbConnection
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
