import Employee from '../models/Employee.js';

// Helper function to safely parse numbers
const safeParseFloat = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
};

// Get all employees with pagination and search
export const getEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', department, designation, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { empId: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department && department !== 'All') {
      filter.department = department;
    }
    
    if (designation && designation !== 'All') {
      filter.designation = designation;
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const employees = await Employee.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await Employee.countDocuments(filter);

    res.json({
      success: true,
      employees,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get single employee
export const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      employee
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create new employee
export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      designation,
      department,
      dateOfJoining,
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
      otherDeductions
    } = req.body;

    // Validate required fields
    if (!name || !designation || !department || !dateOfJoining || 
        !bankName || !accountNumber || !ifscCode || !branch || !basicSalary) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Generate employee ID
    const empId = await Employee.generateEmployeeId();

    // Check if employee with same account number exists
    const existingEmployee = await Employee.findOne({ accountNumber });
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this account number already exists'
      });
    }

    // Parse all numeric values safely
    const employeeData = {
      name: name.trim(),
      empId,
      designation: designation.trim(),
      department: department.trim(),
      dateOfJoining,
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.toUpperCase().trim(),
      branch: branch.trim(),
      basicSalary: safeParseFloat(basicSalary),
      salaryType: salaryType || 'fixed',
      hra: safeParseFloat(hra),
      conveyance: safeParseFloat(conveyance),
      medicalAllowance: safeParseFloat(medicalAllowance),
      specialAllowance: safeParseFloat(specialAllowance),
      pf: safeParseFloat(pf),
      professionalTax: safeParseFloat(professionalTax),
      tds: safeParseFloat(tds),
      otherDeductions: safeParseFloat(otherDeductions),
      createdBy: req.user._id
    };

    console.log('Creating employee with data:', employeeData);

    // Create employee - this will trigger the pre-save middleware
    const employee = await Employee.create(employeeData);

    // If for some reason salaries weren't calculated, calculate them manually
    if (!employee.grossSalary || !employee.netSalary) {
      const salaries = employee.calculateSalaries();
      employee.grossSalary = salaries.grossSalary;
      employee.netSalary = salaries.netSalary;
      await employee.save();
    }

    console.log('Employee created successfully:', {
      id: employee._id,
      grossSalary: employee.grossSalary,
      netSalary: employee.netSalary
    });

    res.status(201).json({
      success: true,
      message: 'Employee registered successfully',
      employee
    });
  } catch (error) {
    console.error('Create employee error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID or account number already exists'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update employee
export const updateEmployee = async (req, res) => {
  try {
    const {
      name,
      designation,
      department,
      dateOfJoining,
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
      status
    } = req.body;

    // Check if employee exists
    const existingEmployee = await Employee.findById(req.params.id);
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check if account number is already used by another employee
    if (accountNumber && accountNumber !== existingEmployee.accountNumber) {
      const employeeWithSameAccount = await Employee.findOne({
        accountNumber,
        _id: { $ne: req.params.id }
      });
      
      if (employeeWithSameAccount) {
        return res.status(400).json({
          success: false,
          message: 'Another employee already uses this account number'
        });
      }
    }

    const updateData = {};
    
    // Only update provided fields
    if (name !== undefined) updateData.name = name.trim();
    if (designation !== undefined) updateData.designation = designation.trim();
    if (department !== undefined) updateData.department = department.trim();
    if (dateOfJoining !== undefined) updateData.dateOfJoining = dateOfJoining;
    if (bankName !== undefined) updateData.bankName = bankName.trim();
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber.trim();
    if (ifscCode !== undefined) updateData.ifscCode = ifscCode.toUpperCase().trim();
    if (branch !== undefined) updateData.branch = branch.trim();
    if (basicSalary !== undefined) updateData.basicSalary = safeParseFloat(basicSalary);
    if (salaryType !== undefined) updateData.salaryType = salaryType;
    if (hra !== undefined) updateData.hra = safeParseFloat(hra);
    if (conveyance !== undefined) updateData.conveyance = safeParseFloat(conveyance);
    if (medicalAllowance !== undefined) updateData.medicalAllowance = safeParseFloat(medicalAllowance);
    if (specialAllowance !== undefined) updateData.specialAllowance = safeParseFloat(specialAllowance);
    if (pf !== undefined) updateData.pf = safeParseFloat(pf);
    if (professionalTax !== undefined) updateData.professionalTax = safeParseFloat(professionalTax);
    if (tds !== undefined) updateData.tds = safeParseFloat(tds);
    if (otherDeductions !== undefined) updateData.otherDeductions = safeParseFloat(otherDeductions);
    if (status !== undefined) updateData.status = status;

    console.log('Updating employee with data:', updateData);

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Ensure salaries are calculated
    if (employee) {
      const salaries = employee.calculateSalaries();
      if (employee.grossSalary !== salaries.grossSalary || employee.netSalary !== salaries.netSalary) {
        employee.grossSalary = salaries.grossSalary;
        employee.netSalary = salaries.netSalary;
        await employee.save();
      }
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      employee
    });
  } catch (error) {
    console.error('Update employee error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete employee
export const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    await Employee.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get employee statistics
export const getEmployeeStats = async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ status: 'Active' });
    
    // Department-wise count
    const departmentStats = await Employee.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      }
    ]);

    // Total salary statistics
    const salaryStats = await Employee.aggregate([
      {
        $group: {
          _id: null,
          totalGrossSalary: { $sum: '$grossSalary' },
          totalNetSalary: { $sum: '$netSalary' },
          avgGrossSalary: { $avg: '$grossSalary' },
          avgNetSalary: { $avg: '$netSalary' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees: totalEmployees - activeEmployees,
        departments: departmentStats,
        salary: salaryStats[0] || {}
      }
    });
  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};