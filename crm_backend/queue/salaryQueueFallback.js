// Fallback salary processing without Redis
import Employee from "../models/Employee.js";
import SalarySlip from "../models/SalarySlip.js";
import Attendance from "../models/Attendance.js";
import { generateSalaryPDF } from "../utils/pdfGenerator.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direct salary calculation without queue
export const generateSalarySlipDirect = async (
  employeeId,
  month,
  year,
  generatedBy,
  type = "manual"
) => {
  try {
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
            leaveDays++;
            presentDays++; // Count leave as present for salary calculation
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
    } else if (employee.salaryType === "daily") {
      // For daily wage with proper null checks
      const dailyRate = parseFloat(employee.basicSalary) || 0;
      calculatedBasic = dailyRate * presentDays;

      grossSalary = calculatedBasic;
      calculatedPF = grossSalary * 0.12; // 12% PF
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0; // 5% TDS if salary > 50k
    } else if (employee.salaryType === "hourly") {
      // For hourly wage - calculate total hours worked
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
      calculatedBasic = hourlyRate * totalHours;
      grossSalary = calculatedBasic;

      calculatedPF = grossSalary * 0.12;
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
    }

    // Ensure all values are numbers and not NaN
    calculatedPF = isNaN(calculatedPF) ? 0 : calculatedPF;
    calculatedTDS = isNaN(calculatedTDS) ? 0 : calculatedTDS;
    grossSalary = isNaN(grossSalary) ? 0 : grossSalary;

    const totalDeductions =
      calculatedPF +
      (parseFloat(employee.professionalTax) || 0) +
      calculatedTDS +
      (parseFloat(employee.otherDeductions) || 0);

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
  type = "manual"
) => {
  // Process directly without queue
  return await generateSalarySlipDirect(
    employeeId,
    month,
    year,
    generatedBy,
    type
  );
};

export const addBulkSalaryJobs = async (
  month,
  year,
  generatedBy,
  type = "manual"
) => {
  try {
    const employees = await Employee.find({ status: "Active" });
    const results = [];

    for (const employee of employees) {
      try {
        const result = await generateSalarySlipDirect(
          employee._id,
          month,
          year,
          generatedBy,
          type
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
