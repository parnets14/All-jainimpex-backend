import express from "express";
import { salarySlipSchema } from "../models/SalarySlip.js";
import { employeeSchema } from "../models/Employee.js";
import { attendanceSchema } from "../models/Attendance.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { attachCompanyDB } from "../middleware/companyMiddleware.js";
import { generateSalaryPDF } from "../utils/pdfGenerator.js";
import { logActivity } from "../middleware/activityLogMiddleware.js";

// Import direct salary processing functions
import {
  generateSalarySlipDirect,
  addBulkSalaryJobs,
  getQueueStatus,
} from "../queue/salaryQueueFallback.js";

const router = express.Router();

// Resolve company-scoped models from the request's database connection
const getModels = (dbConnection) => {
  return {
    SalarySlip:
      dbConnection.models.SalarySlip ||
      dbConnection.model("SalarySlip", salarySlipSchema),
    Employee:
      dbConnection.models.Employee ||
      dbConnection.model("Employee", employeeSchema),
    Attendance:
      dbConnection.models.Attendance ||
      dbConnection.model("Attendance", attendanceSchema),
  };
};

// All salary routes require authentication and a company database connection
router.use(protect);
router.use(attachCompanyDB);

// Helper function to calculate salary (company-scoped models passed in)
const calculateSalary = async (employee, month, year, Attendance) => {
  const periodFrom = new Date(year, month - 1, 1);
  const periodTo = new Date(year, month, 0); // Last day of month

  const attendance = await Attendance.find({
    employee: employee._id,
    date: { $gte: periodFrom, $lte: periodTo },
  });

  // Calculate working days (excluding weekends)
  let workingDays = 0;
  let presentDays = 0;
  let leaveDays = 0;
  let currentDate = new Date(periodFrom);

  while (currentDate <= periodTo) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
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
          if (attendanceRecord.leaveType !== "Unpaid Leave") {
            leaveDays++;
            presentDays++; // Paid leave counts as present for salary
          }
        }
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  let calculatedBasic = 0;
  let calculatedHRA = 0;
  let calculatedConveyance = 0;
  let calculatedMedical = 0;
  let calculatedSpecial = 0;
  let calculatedPF = 0;
  let calculatedTDS = 0;
  let grossSalary = 0;
  let netSalary = 0;

  if (employee.salaryType === "fixed") {
    calculatedBasic = employee.basicSalary || 0;
    calculatedHRA = employee.hra || 0;
    calculatedConveyance = employee.conveyance || 0;
    calculatedMedical = employee.medicalAllowance || 0;
    calculatedSpecial = employee.specialAllowance || 0;
    calculatedPF = employee.pf || 0;
    calculatedTDS = employee.tds || 0;

    grossSalary =
      calculatedBasic +
      calculatedHRA +
      calculatedConveyance +
      calculatedMedical +
      calculatedSpecial;
  } else if (employee.salaryType === "daily") {
    const dailyRate = employee.basicSalary || 0;
    calculatedBasic = dailyRate * presentDays;

    if (workingDays > 0) {
      calculatedHRA = ((employee.hra || 0) / workingDays) * presentDays;
      calculatedConveyance =
        ((employee.conveyance || 0) / workingDays) * presentDays;
      calculatedMedical =
        ((employee.medicalAllowance || 0) / workingDays) * presentDays;
      calculatedSpecial =
        ((employee.specialAllowance || 0) / workingDays) * presentDays;
    }

    grossSalary =
      calculatedBasic +
      calculatedHRA +
      calculatedConveyance +
      calculatedMedical +
      calculatedSpecial;
    calculatedPF = grossSalary * 0.12;
    calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
  } else if (employee.salaryType === "hourly") {
    const totalHours = attendance.reduce((total, record) => {
      if (
        (record.status === "Present" || record.status === "Late") &&
        record.punchIn &&
        record.punchOut
      ) {
        const hoursWorked =
          (new Date(record.punchOut.time) - new Date(record.punchIn.time)) /
          (1000 * 60 * 60);
        return total + Math.max(0, hoursWorked);
      }
      return total;
    }, 0);

    const hourlyRate = employee.basicSalary || 0;
    calculatedBasic = hourlyRate * totalHours;
    calculatedHRA = totalHours * 10;
    calculatedConveyance = totalHours * 5;

    grossSalary = calculatedBasic + calculatedHRA + calculatedConveyance;
    calculatedPF = grossSalary * 0.12;
    calculatedTDS = grossSalary > 50000 ? grossSalary * 0.05 : 0;
  }

  const totalDeductions =
    calculatedPF +
    (employee.professionalTax || 0) +
    calculatedTDS +
    (employee.otherDeductions || 0);
  netSalary = grossSalary - totalDeductions;

  const hoursWorked = attendance.reduce((total, record) => {
    if (
      (record.status === "Present" || record.status === "Late") &&
      record.punchIn &&
      record.punchOut
    ) {
      const hw =
        (new Date(record.punchOut.time) - new Date(record.punchIn.time)) /
        (1000 * 60 * 60);
      return total + Math.max(0, hw);
    }
    return total;
  }, 0);

  return {
    basicSalary: calculatedBasic,
    hra: calculatedHRA,
    conveyance: calculatedConveyance,
    medicalAllowance: calculatedMedical,
    specialAllowance: calculatedSpecial,
    pf: calculatedPF,
    professionalTax: employee.professionalTax || 0,
    tds: calculatedTDS,
    otherDeductions: employee.otherDeductions || 0,
    grossSalary,
    totalDeductions,
    netSalary,
    workingDays,
    daysWorked: presentDays,
    hoursWorked,
  };
};

// Generate salary slip for an employee (Direct processing)
router.post(
  "/generate",
  logActivity("Salary Management", "Generated salary slip", "CREATE"),
  async (req, res) => {
    try {
      const { employeeId, month, year } = req.body;

      if (!employeeId || !month || !year) {
        return res.status(400).json({
          success: false,
          message: "Employee ID, month, and year are required",
        });
      }

      const result = await generateSalarySlipDirect(
        employeeId,
        month,
        year,
        req.user._id,
        "manual",
        req.dbConnection
      );

      if (result.success) {
        res.status(201).json({
          success: true,
          message: "Salary slip generated successfully",
          data: result,
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message,
        });
      }
    } catch (error) {
      console.error("Error generating salary slip:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Generate salary slips for all employees (Direct processing)
router.post(
  "/generate-all",
  logActivity("Salary Management", "Generated all salary slips", "CREATE"),
  async (req, res) => {
    try {
      const { month, year } = req.body;
      const results = await addBulkSalaryJobs(
        month,
        year,
        req.user._id,
        "manual-bulk",
        req.dbConnection
      );

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      res.json({
        success: true,
        message: `Generated salary slips: ${successful.length} successful, ${failed.length} failed`,
        data: { jobsCount: successful.length, successful, failed },
      });
    } catch (error) {
      console.error("Error generating bulk salary slips:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Get processing status
router.get(
  "/queue-status",
  logActivity("Salary Management", "Viewed queue status", "READ"),
  async (req, res) => {
    try {
      const status = await getQueueStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      console.error("Error getting processing status:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Trigger monthly salary generation
router.post(
  "/generate-monthly",
  logActivity(
    "Salary Management",
    "Triggered monthly salary generation",
    "CREATE"
  ),
  async (req, res) => {
    try {
      const { month, year } = req.body;

      const queueResults = await addBulkSalaryJobs(
        month,
        year,
        req.user._id,
        "automatic",
        req.dbConnection
      );

      const successful = queueResults.filter((r) => r.success);
      const failed = queueResults.filter((r) => !r.success);

      res.json({
        success: true,
        message: `Monthly salary generation completed: ${successful.length} successful, ${failed.length} failed`,
        data: {
          jobsCount: successful.length,
          month,
          year,
          results: { successful, failed },
        },
      });
    } catch (error) {
      console.error("Error triggering monthly salary generation:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Get salary slips with filtering
router.get(
  "/slips",
  logActivity("Salary Management", "Viewed salary slips list", "READ"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const {
        employeeId,
        month,
        year,
        page = 1,
        limit = 10,
        status,
      } = req.query;

      const filter = {};
      if (employeeId) filter.employeeId = employeeId;
      if (month) filter.month = month;
      if (year) filter.year = parseInt(year);
      if (status) filter.status = status;

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
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get salary statistics
router.get(
  "/stats",
  logActivity("Salary Management", "Viewed salary statistics", "READ"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      const stats = await SalarySlip.aggregate([
        {
          $facet: {
            currentMonth: [
              { $match: { month: currentMonth, year: currentYear } },
              { $count: "count" },
            ],
            totalGenerated: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            totalAmount: [
              { $group: { _id: null, total: { $sum: "$netSalary" } } },
            ],
          },
        },
      ]);

      const result = {
        currentMonth: stats[0].currentMonth[0]?.count || 0,
        totalGenerated: stats[0].totalGenerated[0]?.count || 0,
        byStatus: stats[0].byStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        totalAmount: stats[0].totalAmount[0]?.total || 0,
      };

      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error fetching salary statistics:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get specific salary slip
router.get(
  "/slip/:id",
  logActivity("Salary Management", "Viewed salary slip details", "READ"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const salarySlip = await SalarySlip.findById(req.params.id)
        .populate(
          "employeeId",
          "name empId department designation phoneNumber email"
        )
        .populate("generatedBy", "name");

      if (!salarySlip) {
        return res.status(404).json({
          success: false,
          message: "Salary slip not found",
        });
      }

      res.json({ success: true, data: salarySlip });
    } catch (error) {
      console.error("Error fetching salary slip:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Update salary slip status (mark as paid)
router.patch(
  "/slip/:id/status",
  logActivity("Salary Management", "Updated salary slip status", "UPDATE"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const { status } = req.body;

      const salarySlip = await SalarySlip.findByIdAndUpdate(
        req.params.id,
        {
          status,
          paymentDate: status === "paid" ? new Date() : null,
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
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// View salary slip PDF (HTML) in browser
router.get(
  "/slip/:id/view",
  logActivity("Salary Management", "Viewed salary slip PDF", "READ"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const salarySlip = await SalarySlip.findById(req.params.id).populate(
        "employeeId",
        "name empId department designation"
      );

      if (!salarySlip) {
        return res.status(404).json({
          success: false,
          message: "Salary slip not found",
        });
      }

      const htmlContent = generateSalarySlipHTML(salarySlip);
      res.setHeader("Content-Type", "text/html");
      res.send(htmlContent);
    } catch (error) {
      console.error("Error viewing salary slip:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Download salary slip PDF
router.get(
  "/slip/:id/download",
  logActivity("Salary Management", "Downloaded salary slip PDF", "READ"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const salarySlip = await SalarySlip.findById(req.params.id).populate(
        "employeeId",
        "name empId department designation"
      );

      if (!salarySlip) {
        return res.status(404).json({
          success: false,
          message: "Salary slip not found",
        });
      }

      const pdfBuffer = await generateSalaryPDF(salarySlip);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="salary-slip-${salarySlip.employee.empId}-${salarySlip.month}-${salarySlip.year}.pdf"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error downloading salary slip:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Delete all salary slips (super_admin / admin only)
router.delete(
  "/clear-all",
  requireRole(["super_admin", "admin"]),
  logActivity("Salary Management", "Cleared all salary slips", "DELETE"),
  async (req, res) => {
    try {
      const { SalarySlip } = getModels(req.dbConnection);
      const result = await SalarySlip.deleteMany({});

      res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} salary slips`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("Error deleting salary slips:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Helper function to generate HTML for salary slip
const generateSalarySlipHTML = (salarySlip) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Salary Slip - ${salarySlip.employee.name}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .salary-slip { background: white; max-width: 800px; margin: 0 auto; padding: 0; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid #1e3a8a; padding: 20px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); }
            .logo-section { display: flex; align-items: center; justify-content: center; margin-bottom: 15px; }
            .company-logo { width: 80px; height: 60px; margin-right: 20px; border-radius: 8px; object-fit: contain; border: 2px solid #1e3a8a; }
            .company-details { text-align: left; }
            .company-name { font-size: 28px; font-weight: bold; color: #1e3a8a; margin: 0; letter-spacing: 1px; }
            .company-tagline { font-size: 14px; color: #666; margin: 2px 0; }
            .company-address { font-size: 12px; color: #888; }
            .slip-title { font-size: 20px; margin: 15px 0 0 0; color: #1e3a8a; font-weight: bold; background: #e3f2fd; padding: 10px; border-radius: 5px; }
            .content { padding: 25px; }
            .employee-details { margin: 20px 0; background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #1e3a8a; }
            .employee-details h3 { margin: 0 0 15px 0; color: #1e3a8a; font-size: 16px; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .detail-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
            .detail-row:last-child { border-bottom: none; }
            .salary-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .salary-table th { background: #1e3a8a; color: white; padding: 12px 8px; text-align: center; font-weight: bold; }
            .salary-table td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; }
            .earnings-header { background: #d4edda !important; color: #155724 !important; }
            .deductions-header { background: #f8d7da !important; color: #721c24 !important; }
            .total-row { font-weight: bold; background-color: #e8f4fd; }
            .net-salary { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; font-size: 18px; text-align: center; padding: 15px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding-top: 30px; border-top: 1px solid #ddd; }
            .signature-box { text-align: center; width: 200px; }
            .signature-line { border-top: 1px solid #000; margin: 40px 0 10px 0; }
            .signature-label { font-size: 12px; color: #666; }
            .footer { text-align: center; margin-top: 30px; padding: 15px; background: #f8f9fa; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
            @media print { body { background: white; margin: 0; } .salary-slip { box-shadow: none; } }
        </style>
    </head>
    <body>
        <div class="salary-slip">
            <div class="header">
                <div class="logo-section">
                    <img src="/public/logo.jpeg" alt="Company Logo" class="company-logo" onerror="this.style.display='none'">
                    <div class="company-details">
                        <div class="company-name">JAIN IMPEX</div>
                        <div class="company-tagline">Plumbing Solutions & Services</div>
                        <div class="company-address">123 Market Road, New Delhi - 110001</div>
                    </div>
                </div>
                <div class="slip-title">SALARY SLIP - ${salarySlip.month}/${
    salarySlip.year
  }</div>
            </div>
            <div class="content">
                <div class="employee-details">
                    <h3>Employee Information</h3>
                    <div class="details-grid">
                        <div class="detail-row"><strong>Employee Name:</strong><span>${
                          salarySlip.employee.name
                        }</span></div>
                        <div class="detail-row"><strong>Employee ID:</strong><span>${
                          salarySlip.employee.empId
                        }</span></div>
                        <div class="detail-row"><strong>Designation:</strong><span>${
                          salarySlip.employee.designation
                        }</span></div>
                        <div class="detail-row"><strong>Department:</strong><span>${
                          salarySlip.employee.department
                        }</span></div>
                        <div class="detail-row"><strong>Working Days:</strong><span>${
                          salarySlip.workingDays
                        }</span></div>
                        <div class="detail-row"><strong>Days Worked:</strong><span>${
                          salarySlip.daysWorked
                        }</span></div>
                        <div class="detail-row"><strong>Paid Leave Days:</strong><span>${
                          salarySlip.leaveDays || 0
                        }</span></div>
                        <div class="detail-row"><strong>Absent / LOP Days:</strong><span>${
                          salarySlip.lopDays || 0
                        }</span></div>
                    </div>
                </div>
                <table class="salary-table">
                    <tr>
                        <th class="earnings-header">EARNINGS</th>
                        <th class="earnings-header">AMOUNT</th>
                        <th class="deductions-header">DEDUCTIONS</th>
                        <th class="deductions-header">AMOUNT</th>
                    </tr>
                    <tr>
                        <td>Basic Salary</td>
                        <td>₹${salarySlip.basicSalary?.toFixed(2) || "0.00"}</td>
                        <td>Provident Fund (PF)</td>
                        <td>₹${salarySlip.pf?.toFixed(2) || "0.00"}</td>
                    </tr>
                    <tr>
                        <td>House Rent Allowance</td>
                        <td>₹${salarySlip.hra?.toFixed(2) || "0.00"}</td>
                        <td>Professional Tax</td>
                        <td>₹${
                          salarySlip.professionalTax?.toFixed(2) || "0.00"
                        }</td>
                    </tr>
                    <tr>
                        <td>Conveyance Allowance</td>
                        <td>₹${salarySlip.conveyance?.toFixed(2) || "0.00"}</td>
                        <td>TDS</td>
                        <td>₹${salarySlip.tds?.toFixed(2) || "0.00"}</td>
                    </tr>
                    <tr>
                        <td>Medical Allowance</td>
                        <td>₹${
                          salarySlip.medicalAllowance?.toFixed(2) || "0.00"
                        }</td>
                        <td>Other Deductions</td>
                        <td>₹${
                          salarySlip.otherDeductions?.toFixed(2) || "0.00"
                        }</td>
                    </tr>
                    <tr>
                        <td>Special Allowance</td>
                        <td>₹${
                          salarySlip.specialAllowance?.toFixed(2) || "0.00"
                        }</td>
                        <td>Loss of Pay (${salarySlip.lopDays || 0} days)</td>
                        <td>₹${salarySlip.lopAmount?.toFixed(2) || "0.00"}</td>
                    </tr>
                    <tr class="total-row">
                        <td><strong>Gross Salary</strong></td>
                        <td><strong>₹${
                          salarySlip.grossSalary?.toFixed(2) || "0.00"
                        }</strong></td>
                        <td><strong>Total Deductions</strong></td>
                        <td><strong>₹${
                          salarySlip.totalDeductions?.toFixed(2) || "0.00"
                        }</strong></td>
                    </tr>
                    <tr class="net-salary">
                        <td colspan="3"><strong>NET SALARY PAYABLE</strong></td>
                        <td><strong>₹${
                          salarySlip.netSalary?.toFixed(2) || "0.00"
                        }</strong></td>
                    </tr>
                </table>
                <div class="signatures">
                    <div class="signature-box"><div class="signature-line"></div><div class="signature-label">Employee Signature</div></div>
                    <div class="signature-box"><div class="signature-line"></div><div class="signature-label">HR Manager</div></div>
                    <div class="signature-box"><div class="signature-line"></div><div class="signature-label">Authorized Signatory</div></div>
                </div>
            </div>
            <div class="footer">
                <div>This is a computer generated document and does not require a physical signature.</div>
                <div style="margin-top: 5px;"><strong>Generated on:</strong> ${new Date().toLocaleDateString()}</div>
            </div>
        </div>
    </body>
    </html>
  `;
};

export default router;
