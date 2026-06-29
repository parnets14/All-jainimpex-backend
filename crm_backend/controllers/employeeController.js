import { employeeSchema } from "../models/Employee.js";
import { uploadSingle, handleUploadErrors } from "../middleware/upload.js";
import path from "path";
import fs from "fs";

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    Employee: dbConnection.models.Employee || 
              dbConnection.model('Employee', employeeSchema)
  };
};

// Helper function to generate employee ID
const generateEmployeeId = async (dbConnection) => {
  try {
    const { Employee } = getModels(dbConnection);
    const lastEmployee = await Employee.findOne().sort({ createdAt: -1 });
    if (lastEmployee && lastEmployee.empId) {
      const lastNumber = parseInt(lastEmployee.empId.split('-')[1]);
      return `EMP-${String(lastNumber + 1).padStart(4, '0')}`;
    }
    return 'EMP-0001';
  } catch (error) {
    console.error('Error generating employee ID:', error);
    // Fallback ID
    return `EMP-${Date.now().toString().slice(-4)}`;
  }
};

// Helper function to safely parse numbers
const safeParseFloat = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
};

// Helper function to validate salary fields
const validateSalaryFields = (salaryType, basicSalary) => {
  if (!basicSalary || parseFloat(basicSalary) <= 0) {
    return `${
      salaryType === "fixed"
        ? "Basic Salary"
        : salaryType === "daily"
        ? "Daily Rate"
        : "Hourly Rate"
    } is required and must be greater than 0`;
  }
  return null;
};

// Helper function to generate face embedding using face-api.js
// Note: This is a placeholder for server-side processing
// In production, you might want to use Python/TensorFlow for better performance
const generateFaceEmbedding = async (imagePath) => {
  try {
    console.log("Face embedding generation requested for:", imagePath);
    // For now, we'll let the frontend handle face detection and just store the image
    // The frontend will generate descriptors on-the-fly when needed
    // In production, you could use a Python service or TensorFlow.js on Node
    return null; // Will be generated on frontend when needed
  } catch (error) {
    console.error("Error generating face embedding:", error);
    return null;
  }
};

// Get all employees with pagination and search
export const getEmployees = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search = "",
      department,
      designation,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { empId: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
        { department: { $regex: search, $options: "i" } },
      ];
    }

    if (department && department !== "All") {
      filter.department = department;
    }

    if (designation && designation !== "All") {
      filter.designation = designation;
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const employees = await Employee.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-__v -faceEmbedding"); // Exclude face embedding for list view

    const total = await Employee.countDocuments(filter);

    res.json({
      success: true,
      employees,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Get employees error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get single employee
export const getEmployee = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.json({
      success: true,
      employee,
    });
  } catch (error) {
    console.error("Get employee error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Create new employee with face image
export const createEmployee = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);

    // Extract data from form - when using multer, form data comes in req.body
    const {
      name,
      empId: empIdInput, // manual empId (optional) — matches biometric card no
      designation,
      department,
      dateOfJoining,
      shiftStart, // Point 3
      shiftEnd,
      weeklyOff,
      leaveLapseCycle, // Point 1 (dynamic lapse)
      phoneNumber, // NEW
      email,
      bankName,
      accountNumber,
      ifscCode,
      branch,
      basicSalary,
      salaryType = "fixed",
      hra = 0,
      conveyance = 0,
      medicalAllowance = 0,
      specialAllowance = 0,
      pf = 0,
      professionalTax = 0,
      tds = 0,
      otherDeductions = 0,
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !designation ||
      !department ||
      !dateOfJoining ||
      !bankName ||
      !accountNumber ||
      !ifscCode ||
      !branch
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate salary fields based on type
    const salaryError = validateSalaryFields(salaryType, basicSalary);
    if (salaryError) {
      // Delete uploaded file if validation fails
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: salaryError,
      });
    }

    // Employee ID: use the manually entered one if provided (matches the biometric
    // card number), otherwise auto-generate. Manual IDs must be unique.
    let empId;
    const manualId = (empIdInput || '').trim();
    if (manualId && manualId.toLowerCase() !== 'auto-generated') {
      const dupId = await Employee.findOne({
        empId: { $regex: `^${manualId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
      if (dupId) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: `Employee ID "${manualId}" is already in use. Please use a different ID.`,
        });
      }
      empId = manualId;
    } else {
      empId = await generateEmployeeId(req.dbConnection);
    }

    // Check if employee with same account number exists
    const existingEmployee = await Employee.findOne({ accountNumber });
    if (existingEmployee) {
      // Delete uploaded file if employee creation fails
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: "Employee with this account number already exists",
      });
    }

    // Handle face image upload
    let faceImagePath = null;
    let faceEmbedding = null;

    if (req.file) {
      // Normalize path to use forward slashes for consistent URL access
      faceImagePath = req.file.path.replace(/\\/g, "/");

      // Use face embedding from frontend if provided, otherwise generate from image
      if (req.body.faceEmbedding) {
        try {
          faceEmbedding = JSON.parse(req.body.faceEmbedding);
          console.log(
            "✅ Using face embedding from frontend:",
            faceEmbedding.length,
            "dimensions"
          );
        } catch (error) {
          console.error("Error parsing face embedding:", error);
          faceEmbedding = await generateFaceEmbedding(faceImagePath);
        }
      } else {
        // Generate face embedding from the uploaded image
        faceEmbedding = await generateFaceEmbedding(faceImagePath);
      }
    }

    // Parse all numeric values safely
    const employeeData = {
      name: name.trim(),
      empId,
      designation: designation.trim(),
      department: department.trim(),
      dateOfJoining,
      shiftStart: shiftStart || "10:00",
      shiftEnd: shiftEnd || "18:00",
      weeklyOff: weeklyOff || "Sunday",
      leaveLapseCycle: leaveLapseCycle === 'monthly' ? 'monthly' : 'yearly',
      phoneNumber: phoneNumber ? phoneNumber.trim() : "", // NEW
      email: email ? email.trim().toLowerCase() : "", // NEW
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.toUpperCase().trim(),
      branch: branch.trim(),
      basicSalary: safeParseFloat(basicSalary),
      salaryType: salaryType,
      hra: safeParseFloat(hra),
      conveyance: safeParseFloat(conveyance),
      medicalAllowance: safeParseFloat(medicalAllowance),
      specialAllowance: safeParseFloat(specialAllowance),
      pf: safeParseFloat(pf),
      professionalTax: safeParseFloat(professionalTax),
      tds: safeParseFloat(tds),
      otherDeductions: safeParseFloat(otherDeductions),
      createdBy: req.user._id,
      faceImage: faceImagePath,
      faceEmbedding: faceEmbedding,
    };

    console.log("Creating employee with data:", {
      name: employeeData.name,
      empId: employeeData.empId,
      faceImage: employeeData.faceImage ? "Uploaded" : "Not uploaded",
      faceEmbedding: employeeData.faceEmbedding ? "Generated" : "Not generated",
    });

    // Create employee - this will trigger the pre-save middleware
    const employee = await Employee.create(employeeData);

    // If for some reason salaries weren't calculated, calculate them manually
    if (!employee.grossSalary || !employee.netSalary) {
      const salaries = employee.calculateSalaries();
      employee.grossSalary = salaries.grossSalary;
      employee.netSalary = salaries.netSalary;
      await employee.save();
    }

    console.log("Employee created successfully:", {
      id: employee._id,
      name: employee.name,
      empId: employee.empId,
      grossSalary: employee.grossSalary,
      netSalary: employee.netSalary,
      faceImage: employee.faceImage ? "Uploaded" : "Not uploaded",
    });

    res.status(201).json({
      success: true,
      message: "Employee registered successfully",
      employee: {
        _id: employee._id,
        name: employee.name,
        empId: employee.empId,
        designation: employee.designation,
        department: employee.department,
        dateOfJoining: employee.dateOfJoining,
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        ifscCode: employee.ifscCode,
        branch: employee.branch,
        basicSalary: employee.basicSalary,
        salaryType: employee.salaryType,
        hra: employee.hra,
        conveyance: employee.conveyance,
        medicalAllowance: employee.medicalAllowance,
        specialAllowance: employee.specialAllowance,
        pf: employee.pf,
        professionalTax: employee.professionalTax,
        tds: employee.tds,
        otherDeductions: employee.otherDeductions,
        grossSalary: employee.grossSalary,
        netSalary: employee.netSalary,
        status: employee.status,
        faceImage: employee.faceImage,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      },
    });
  } catch (error) {
    console.error("Create employee error:", error);

    // Delete uploaded file if employee creation fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Employee ID or account number already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update employee with optional face image
export const updateEmployee = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    console.log("Update request body:", req.body);
    console.log("Update request file:", req.file);

    // Check if employee exists
    const existingEmployee = await Employee.findById(req.params.id);
    if (!existingEmployee) {
      // Delete uploaded file if employee not found
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Extract data from form
    const {
      name,
      empId: empIdInput, // allow editing to match biometric card no
      designation,
      department,
      dateOfJoining,
      shiftStart, // Point 3
      shiftEnd,
      weeklyOff,
      leaveLapseCycle, // Point 1 (dynamic lapse)
      phoneNumber, // NEW
      email, // NEW
      bankName,
      accountNumber,
      ifscCode,
      branch,
      basicSalary,
      salaryType,
      hra,
      conveyance,
      medicalAllowance,
      specialAllowance,
      pf,
      professionalTax,
      tds,
      otherDeductions,
      status,
    } = req.body;

    // Check if account number is already used by another employee
    if (accountNumber && accountNumber !== existingEmployee.accountNumber) {
      const employeeWithSameAccount = await Employee.findOne({
        accountNumber,
        _id: { $ne: req.params.id },
      });

      if (employeeWithSameAccount) {
        // Delete uploaded file if account number conflict
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: "Another employee already uses this account number",
        });
      }
    }

    const updateData = {};

    // Employee ID — allow change if provided & unique (matches biometric card no)
    if (empIdInput !== undefined) {
      const manualId = (empIdInput || '').trim();
      if (manualId && manualId.toLowerCase() !== 'auto-generated' && manualId !== existingEmployee.empId) {
        const dupId = await Employee.findOne({
          empId: { $regex: `^${manualId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
          _id: { $ne: req.params.id },
        });
        if (dupId) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: `Employee ID "${manualId}" is already in use.`,
          });
        }
        updateData.empId = manualId;
      }
    }

    // Only update provided fields
    if (name !== undefined) updateData.name = name.trim();
    if (designation !== undefined) updateData.designation = designation.trim();
    if (department !== undefined) updateData.department = department.trim();
    if (shiftStart !== undefined) updateData.shiftStart = shiftStart;
    if (shiftEnd !== undefined) updateData.shiftEnd = shiftEnd;
    if (weeklyOff !== undefined) updateData.weeklyOff = weeklyOff;
    if (leaveLapseCycle !== undefined) updateData.leaveLapseCycle = leaveLapseCycle === 'monthly' ? 'monthly' : 'yearly';
    if (dateOfJoining !== undefined) updateData.dateOfJoining = dateOfJoining;
    if (phoneNumber !== undefined)
      updateData.phoneNumber = phoneNumber ? phoneNumber.trim() : ""; // NEW
    if (email !== undefined)
      updateData.email = email ? email.trim().toLowerCase() : ""; // NEW
    if (bankName !== undefined) updateData.bankName = bankName.trim();
    if (accountNumber !== undefined)
      updateData.accountNumber = accountNumber.trim();
    if (ifscCode !== undefined)
      updateData.ifscCode = ifscCode.toUpperCase().trim();
    if (branch !== undefined) updateData.branch = branch.trim();
    if (salaryType !== undefined) updateData.salaryType = salaryType;
    if (hra !== undefined) updateData.hra = safeParseFloat(hra);
    if (conveyance !== undefined)
      updateData.conveyance = safeParseFloat(conveyance);
    if (medicalAllowance !== undefined)
      updateData.medicalAllowance = safeParseFloat(medicalAllowance);
    if (specialAllowance !== undefined)
      updateData.specialAllowance = safeParseFloat(specialAllowance);
    if (pf !== undefined) updateData.pf = safeParseFloat(pf);
    if (professionalTax !== undefined)
      updateData.professionalTax = safeParseFloat(professionalTax);
    if (tds !== undefined) updateData.tds = safeParseFloat(tds);
    if (otherDeductions !== undefined)
      updateData.otherDeductions = safeParseFloat(otherDeductions);
    if (status !== undefined) updateData.status = status;

    // Handle basic salary validation and update
    if (basicSalary !== undefined) {
      const currentSalaryType = salaryType || existingEmployee.salaryType;
      const salaryError = validateSalaryFields(currentSalaryType, basicSalary);
      if (salaryError) {
        // Delete uploaded file if validation fails
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: salaryError,
        });
      }
      updateData.basicSalary = safeParseFloat(basicSalary);
    }

    // Handle face image upload for update
    if (req.file) {
      // Delete old face image if exists
      if (
        existingEmployee.faceImage &&
        fs.existsSync(existingEmployee.faceImage)
      ) {
        fs.unlinkSync(existingEmployee.faceImage);
      }

      // Normalize path to use forward slashes for consistent URL access
      updateData.faceImage = req.file.path.replace(/\\/g, "/");

      // Use face embedding from frontend if provided, otherwise generate from image
      if (req.body.faceEmbedding) {
        try {
          updateData.faceEmbedding = JSON.parse(req.body.faceEmbedding);
          console.log(
            "✅ Using face embedding from frontend for update:",
            updateData.faceEmbedding.length,
            "dimensions"
          );
        } catch (error) {
          console.error("Error parsing face embedding for update:", error);
          updateData.faceEmbedding = await generateFaceEmbedding(req.file.path);
        }
      } else {
        // Generate new face embedding
        updateData.faceEmbedding = await generateFaceEmbedding(req.file.path);
      }
    }

    console.log("Updating employee with data:", {
      ...updateData,
      faceEmbedding: updateData.faceEmbedding ? "Regenerated" : "Not updated",
    });

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Ensure salaries are calculated
    if (employee) {
      const salaries = employee.calculateSalaries();
      if (
        employee.grossSalary !== salaries.grossSalary ||
        employee.netSalary !== salaries.netSalary
      ) {
        employee.grossSalary = salaries.grossSalary;
        employee.netSalary = salaries.netSalary;
        await employee.save();
      }
    }

    res.json({
      success: true,
      message: "Employee updated successfully",
      employee: {
        _id: employee._id,
        name: employee.name,
        empId: employee.empId,
        designation: employee.designation,
        department: employee.department,
        dateOfJoining: employee.dateOfJoining,
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        ifscCode: employee.ifscCode,
        branch: employee.branch,
        basicSalary: employee.basicSalary,
        salaryType: employee.salaryType,
        hra: employee.hra,
        conveyance: employee.conveyance,
        medicalAllowance: employee.medicalAllowance,
        specialAllowance: employee.specialAllowance,
        pf: employee.pf,
        professionalTax: employee.professionalTax,
        tds: employee.tds,
        otherDeductions: employee.otherDeductions,
        grossSalary: employee.grossSalary,
        netSalary: employee.netSalary,
        status: employee.status,
        faceImage: employee.faceImage,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update employee error:", error);

    // Delete uploaded file if update fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete employee
export const deleteEmployee = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Delete face image file if exists
    if (employee.faceImage && fs.existsSync(employee.faceImage)) {
      fs.unlinkSync(employee.faceImage);
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete employee error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get employee statistics
export const getEmployeeStats = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ status: "Active" });

    // Department-wise count
    const departmentStats = await Employee.aggregate([
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
        },
      },
    ]);

    // Total salary statistics
    const salaryStats = await Employee.aggregate([
      {
        $group: {
          _id: null,
          totalGrossSalary: { $sum: "$grossSalary" },
          totalNetSalary: { $sum: "$netSalary" },
          avgGrossSalary: { $avg: "$grossSalary" },
          avgNetSalary: { $avg: "$netSalary" },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees: totalEmployees - activeEmployees,
        departments: departmentStats,
        salary: salaryStats[0] || {},
      },
    });
  } catch (error) {
    console.error("Get employee stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update face embedding for existing employee
export const updateFaceEmbedding = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!employee.faceImage) {
      return res.status(400).json({
        success: false,
        message: "Employee does not have a face image",
      });
    }

    // Generate face embedding from existing image
    const faceEmbedding = await generateFaceEmbedding(employee.faceImage);

    if (!faceEmbedding) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate face embedding from image",
      });
    }

    employee.faceEmbedding = faceEmbedding;
    await employee.save();

    res.json({
      success: true,
      message: "Face embedding updated successfully",
      employee: {
        ...employee.toObject(),
        faceEmbedding: undefined,
      },
    });
  } catch (error) {
    console.error("Update face embedding error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Serve employee face image
export const getEmployeeFaceImage = async (req, res) => {
  try {
    const { Employee } = getModels(req.dbConnection);
    
    const employee = await Employee.findById(req.params.id);

    if (!employee || !employee.faceImage) {
      return res.status(404).json({
        success: false,
        message: "Employee or face image not found",
      });
    }

    if (!fs.existsSync(employee.faceImage)) {
      return res.status(404).json({
        success: false,
        message: "Face image file not found",
      });
    }

    res.sendFile(path.resolve(employee.faceImage));
  } catch (error) {
    console.error("Get employee face image error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Middleware for file upload
export const uploadFaceImage = uploadSingle("faceImage");
