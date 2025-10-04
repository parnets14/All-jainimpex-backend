import express from "express";
import SalarySlip from "../models/SalarySlip.js";
import Employee from "../models/Employee.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Generate salary slip for an employee
router.post("/generate", protect, async (req, res) => {
  try {
    const { employeeId, month, year, daysWorked, hoursWorked } = req.body;

    // Get employee details
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check if salary slip already exists for this month
    const existingSlip = await SalarySlip.findOne({
      employeeId,
      month,
      year,
    });

    if (existingSlip) {
      return res.status(400).json({
        success: false,
        message: "Salary slip already generated for this month",
      });
    }

    // Calculate salary based on salary type
    let grossSalary = 0;
    let netSalary = 0;
    let calculatedBasic = 0;
    let calculatedHRA = 0;
    let calculatedConveyance = 0;
    let calculatedMedical = 0;
    let calculatedSpecial = 0;
    let calculatedPF = 0;
    let calculatedTDS = 0;

    const workingDays = 26; // Standard working days
    const actualDaysWorked = daysWorked || workingDays;
    const actualHoursWorked = hoursWorked || 0;

    if (employee.salaryType === "fixed") {
      // For fixed salary, use the stored salary components
      calculatedBasic = employee.basicSalary;
      calculatedHRA = employee.hra;
      calculatedConveyance = employee.conveyance;
      calculatedMedical = employee.medicalAllowance;
      calculatedSpecial = employee.specialAllowance;
      calculatedPF = employee.pf;
      calculatedTDS = employee.tds;

      grossSalary = employee.grossSalary;
      netSalary = employee.netSalary;
    } else if (employee.salaryType === "daily") {
      // For daily wage
      const dailyRate = employee.basicSalary / workingDays;
      calculatedBasic = dailyRate * actualDaysWorked;
      
      // Calculate other components proportionally
      calculatedHRA = (employee.hra / workingDays) * actualDaysWorked;
      calculatedConveyance = (employee.conveyance / workingDays) * actualDaysWorked;
      calculatedMedical = (employee.medicalAllowance / workingDays) * actualDaysWorked;
      calculatedSpecial = (employee.specialAllowance / workingDays) * actualDaysWorked;

      grossSalary = calculatedBasic + calculatedHRA + calculatedConveyance + 
                   calculatedMedical + calculatedSpecial;
      
      // Deductions
      calculatedPF = grossSalary * 0.12; // 12% PF
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0; // 5% TDS if salary > 50k
      
      netSalary = grossSalary - calculatedPF - employee.professionalTax - calculatedTDS - employee.otherDeductions;
    } else if (employee.salaryType === "hourly") {
      // For hourly wage
      const hourlyRate = employee.basicSalary;
      calculatedBasic = hourlyRate * actualHoursWorked;
      grossSalary = calculatedBasic;
      
      // No other components for hourly workers typically
      calculatedPF = grossSalary * 0.12; // 12% PF
      calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
      
      netSalary = grossSalary - calculatedPF - employee.professionalTax - calculatedTDS - employee.otherDeductions;
    }

    // Create salary slip
    const salarySlip = new SalarySlip({
      employeeId,
      employee: {
        name: employee.name,
        empId: employee.empId,
        department: employee.department,
        designation: employee.designation,
      },
      month,
      year,
      basicSalary: calculatedBasic,
      hra: calculatedHRA,
      conveyance: calculatedConveyance,
      medicalAllowance: calculatedMedical,
      specialAllowance: calculatedSpecial,
      pf: calculatedPF,
      professionalTax: employee.professionalTax,
      tds: calculatedTDS,
      otherDeductions: employee.otherDeductions,
      grossSalary,
      totalDeductions: calculatedPF + employee.professionalTax + calculatedTDS + employee.otherDeductions,
      netSalary,
      workingDays,
      daysWorked: actualDaysWorked,
      hoursWorked: actualHoursWorked,
      salaryType: employee.salaryType,
      bankDetails: {
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        ifscCode: employee.ifscCode,
      },
      generatedBy: req.user._id,
    });

    await salarySlip.save();

    res.status(201).json({
      success: true,
      message: "Salary slip generated successfully",
      data: salarySlip,
    });
  } catch (error) {
    console.error("Error generating salary slip:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Generate salary slips for all employees
router.post("/generate-all", protect, async (req, res) => {
  try {
    const { month, year } = req.body;
    const employees = await Employee.find({ status: "Active" });

    const results = {
      successful: [],
      failed: [],
    };

    for (const employee of employees) {
      try {
        // Check if salary slip already exists
        const existingSlip = await SalarySlip.findOne({
          employeeId: employee._id,
          month,
          year,
        });

        if (existingSlip) {
          results.failed.push({
            employeeId: employee._id,
            name: employee.name,
            reason: "Salary slip already exists",
          });
          continue;
        }

        // Calculate salary (similar to individual generation)
        let grossSalary = 0;
        let netSalary = 0;
        let calculatedBasic = 0;
        let calculatedHRA = 0;
        let calculatedConveyance = 0;
        let calculatedMedical = 0;
        let calculatedSpecial = 0;
        let calculatedPF = 0;
        let calculatedTDS = 0;

        const workingDays = 26;
        const actualDaysWorked = workingDays; // Default to full month
        const actualHoursWorked = 176; // Default 8 hours * 22 days

        if (employee.salaryType === "fixed") {
          calculatedBasic = employee.basicSalary;
          calculatedHRA = employee.hra;
          calculatedConveyance = employee.conveyance;
          calculatedMedical = employee.medicalAllowance;
          calculatedSpecial = employee.specialAllowance;
          calculatedPF = employee.pf;
          calculatedTDS = employee.tds;

          grossSalary = employee.grossSalary;
          netSalary = employee.netSalary;
        } else if (employee.salaryType === "daily") {
          const dailyRate = employee.basicSalary / workingDays;
          calculatedBasic = dailyRate * actualDaysWorked;
          grossSalary = calculatedBasic;
          calculatedPF = grossSalary * 0.12;
          calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
          netSalary = grossSalary - calculatedPF - employee.professionalTax - calculatedTDS - employee.otherDeductions;
        } else if (employee.salaryType === "hourly") {
          const hourlyRate = employee.basicSalary;
          calculatedBasic = hourlyRate * actualHoursWorked;
          grossSalary = calculatedBasic;
          calculatedPF = grossSalary * 0.12;
          calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
          netSalary = grossSalary - calculatedPF - employee.professionalTax - calculatedTDS - employee.otherDeductions;
        }

        const salarySlip = new SalarySlip({
          employeeId: employee._id,
          employee: {
            name: employee.name,
            empId: employee.empId,
            department: employee.department,
            designation: employee.designation,
          },
          month,
          year,
          basicSalary: calculatedBasic,
          hra: calculatedHRA,
          conveyance: calculatedConveyance,
          medicalAllowance: calculatedMedical,
          specialAllowance: calculatedSpecial,
          pf: calculatedPF,
          professionalTax: employee.professionalTax,
          tds: calculatedTDS,
          otherDeductions: employee.otherDeductions,
          grossSalary,
          totalDeductions: calculatedPF + employee.professionalTax + calculatedTDS + employee.otherDeductions,
          netSalary,
          workingDays,
          daysWorked: actualDaysWorked,
          hoursWorked: actualHoursWorked,
          salaryType: employee.salaryType,
          bankDetails: {
            bankName: employee.bankName,
            accountNumber: employee.accountNumber,
            ifscCode: employee.ifscCode,
          },
          generatedBy: req.user._id,
        });

        await salarySlip.save();
        results.successful.push({
          employeeId: employee._id,
          name: employee.name,
          salarySlipId: salarySlip._id,
        });
      } catch (error) {
        results.failed.push({
          employeeId: employee._id,
          name: employee.name,
          reason: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Generated salary slips: ${results.successful.length} successful, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    console.error("Error generating salary slips for all employees:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get salary slips with filtering
router.get("/slips", protect, async (req, res) => {
  try {
    const { employeeId, month, year, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (employeeId) filter.employeeId = employeeId;
    if (month) filter.month = month;
    if (year) filter.year = parseInt(year);

    const salarySlips = await SalarySlip.find(filter)
      .populate("employeeId", "name empId department")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SalarySlip.countDocuments(filter);

    res.json({
      success: true,
      data: salarySlips,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalRecords: total,
      },
    });
  } catch (error) {
    console.error("Error fetching salary slips:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get specific salary slip
router.get("/slip/:id", protect, async (req, res) => {
  try {
    const salarySlip = await SalarySlip.findById(req.params.id)
      .populate("employeeId", "name empId department designation phoneNumber email")
      .populate("generatedBy", "name");

    if (!salarySlip) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found",
      });
    }

    res.json({
      success: true,
      data: salarySlip,
    });
  } catch (error) {
    console.error("Error fetching salary slip:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update salary slip status (mark as paid)
router.patch("/slip/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;

    const salarySlip = await SalarySlip.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        paymentDate: status === "paid" ? new Date() : null
      },
      { new: true }
    );

    if (!salarySlip) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found",
      });
    }

    res.json({
      success: true,
      message: "Salary slip status updated successfully",
      data: salarySlip,
    });
  } catch (error) {
    console.error("Error updating salary slip status:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;