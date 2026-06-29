// import mongoose from 'mongoose';

// const employeeSchema = new mongoose.Schema({
//   // Basic Information
//   name: {
//     type: String,
//     required: [true, 'Employee name is required'],
//     trim: true
//   },
//   empId: {
//     type: String,
//     required: [true, 'Employee ID is required'],
//     unique: true,
//     trim: true
//   },
//   designation: {
//     type: String,
//     required: [true, 'Designation is required'],
//     trim: true
//   },
//   department: {
//     type: String,
//     required: [true, 'Department is required'],
//     trim: true
//   },
//   dateOfJoining: {
//     type: Date,
//     required: [true, 'Date of joining is required']
//   },
  
//   // Bank Details
//   bankName: {
//     type: String,
//     required: [true, 'Bank name is required'],
//     trim: true
//   },
//   accountNumber: {
//     type: String,
//     required: [true, 'Account number is required'],
//     trim: true
//   },
//   ifscCode: {
//     type: String,
//     required: [true, 'IFSC code is required'],
//     trim: true,
//     uppercase: true,
//     match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format']
//   },
//   branch: {
//     type: String,
//     required: [true, 'Branch is required'],
//     trim: true
//   },
  
//   // Salary Information
//   salaryType: {
//     type: String,
//     enum: ['fixed', 'variable'],
//     default: 'fixed'
//   },
//   basicSalary: {
//     type: Number,
//     required: [true, 'Basic salary is required'],
//     min: [0, 'Basic salary cannot be negative']
//   },
//   hra: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   conveyance: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   medicalAllowance: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   specialAllowance: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   pf: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   professionalTax: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   tds: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   otherDeductions: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   grossSalary: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
//   netSalary: {
//     type: Number,
//     default: 0,
//     min: 0
//   },
  
//   // System Fields
//   status: {
//     type: String,
//     enum: ['Active', 'Inactive'],
//     default: 'Active'
//   },
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   }
// },

// {
//   timestamps: true
// });

// // Add to employeeSchema
// employeeSchema.add({
//   faceEmbedding: {
//     type: [Number], // Array of numbers for face embedding
//     default: null
//   },
//   faceImage: {
//     type: String, // Path to face image
//     default: null
//   }
// });


// // Calculate salaries before saving
// employeeSchema.pre('save', function(next) {
//   try {
//     // Ensure all numeric fields are numbers
//     const basic = Number(this.basicSalary) || 0;
//     const hra = Number(this.hra) || 0;
//     const conveyance = Number(this.conveyance) || 0;
//     const medical = Number(this.medicalAllowance) || 0;
//     const special = Number(this.specialAllowance) || 0;
//     const pf = Number(this.pf) || 0;
//     const profTax = Number(this.professionalTax) || 0;
//     const tds = Number(this.tds) || 0;
//     const otherDed = Number(this.otherDeductions) || 0;

//     // Calculate gross salary
//     const gross = basic + hra + conveyance + medical + special;
    
//     // Calculate net salary
//     const totalDeductions = pf + profTax + tds + otherDed;
//     const net = Math.max(0, gross - totalDeductions);

//     // Set the calculated values
//     this.grossSalary = parseFloat(gross.toFixed(2));
//     this.netSalary = parseFloat(net.toFixed(2));

//     console.log('Salary Calculation:', {
//       basic, hra, conveyance, medical, special,
//       gross: this.grossSalary,
//       deductions: totalDeductions,
//       net: this.netSalary
//     });

//     next();
//   } catch (error) {
//     console.error('Error in salary calculation:', error);
//     next(error);
//   }
// });

// // Also add pre-update middleware for findOneAndUpdate
// employeeSchema.pre('findOneAndUpdate', function(next) {
//   try {
//     const update = this.getUpdate();
//     const basic = Number(update.basicSalary) || Number(this._update.basicSalary) || 0;
//     const hra = Number(update.hra) || Number(this._update.hra) || 0;
//     const conveyance = Number(update.conveyance) || Number(this._update.conveyance) || 0;
//     const medical = Number(update.medicalAllowance) || Number(this._update.medicalAllowance) || 0;
//     const special = Number(update.specialAllowance) || Number(this._update.specialAllowance) || 0;
//     const pf = Number(update.pf) || Number(this._update.pf) || 0;
//     const profTax = Number(update.professionalTax) || Number(this._update.professionalTax) || 0;
//     const tds = Number(update.tds) || Number(this._update.tds) || 0;
//     const otherDed = Number(update.otherDeductions) || Number(this._update.otherDeductions) || 0;

//     const gross = basic + hra + conveyance + medical + special;
//     const totalDeductions = pf + profTax + tds + otherDed;
//     const net = Math.max(0, gross - totalDeductions);

//     this.set({
//       grossSalary: parseFloat(gross.toFixed(2)),
//       netSalary: parseFloat(net.toFixed(2))
//     });

//     next();
//   } catch (error) {
//     console.error('Error in update salary calculation:', error);
//     next(error);
//   }
// });

// // Generate employee ID
// employeeSchema.statics.generateEmployeeId = async function() {
//   try {
//     const lastEmployee = await this.findOne().sort({ createdAt: -1 });
//     if (lastEmployee && lastEmployee.empId) {
//       const lastNumber = parseInt(lastEmployee.empId.split('-')[1]);
//       return `EMP-${String(lastNumber + 1).padStart(4, '0')}`;
//     }
//     return 'EMP-0001';
//   } catch (error) {
//     console.error('Error generating employee ID:', error);
//     // Fallback ID
//     return `EMP-${Date.now().toString().slice(-4)}`;
//   }
// };

// // Add instance method to calculate salaries
// employeeSchema.methods.calculateSalaries = function() {
//   const basic = Number(this.basicSalary) || 0;
//   const hra = Number(this.hra) || 0;
//   const conveyance = Number(this.conveyance) || 0;
//   const medical = Number(this.medicalAllowance) || 0;
//   const special = Number(this.specialAllowance) || 0;
//   const pf = Number(this.pf) || 0;
//   const profTax = Number(this.professionalTax) || 0;
//   const tds = Number(this.tds) || 0;
//   const otherDed = Number(this.otherDeductions) || 0;

//   const gross = basic + hra + conveyance + medical + special;
//   const totalDeductions = pf + profTax + tds + otherDed;
//   const net = Math.max(0, gross - totalDeductions);

//   return {
//     grossSalary: parseFloat(gross.toFixed(2)),
//     netSalary: parseFloat(net.toFixed(2))
//   };
// };

// // Add method to update face embedding
// employeeSchema.methods.updateFaceEmbedding = function(embedding) {
//   this.faceEmbedding = embedding;
//   return this.save();
// };

// export default mongoose.model('Employee', employeeSchema);



import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Employee name is required'],
    trim: true
  },
  empId: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    trim: true
  },
  designation: {
    type: String,
    required: [true, 'Designation is required'],
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true
  },
  dateOfJoining: {
    type: Date,
    required: [true, 'Date of joining is required']
  },

  // ── Shift & weekly off (Point 3) — per employee, set at registration ──
  shiftStart: {
    type: String,            // "HH:mm" 24h, e.g. "10:00"
    default: '10:00',
    trim: true
  },
  shiftEnd: {
    type: String,            // "HH:mm" 24h, e.g. "18:00"
    default: '18:00',
    trim: true
  },
  weeklyOff: {
    type: String,            // day of week; paid week-off, skipped in salary working-days
    enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'None'],
    default: 'Sunday'
  },

  // ── Leave lapse cycle (Point 1, dynamic) ──
  // 'yearly'  → leaves accumulate within the FY and lapse at FY end (default, regular staff)
  // 'monthly' → use-it-or-lose-it each month (helpers / dispatch staff)
  leaveLapseCycle: {
    type: String,
    enum: ['yearly', 'monthly'],
    default: 'yearly'
  },

  phoneNumber: {
    type: String,
    trim: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  // Bank Details
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  accountNumber: {
    type: String,
    required: [true, 'Account number is required'],
    trim: true
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format']
  },
  branch: {
    type: String,
    required: [true, 'Branch is required'],
    trim: true
  },
  
  // Salary Information - UPDATED
  salaryType: {
    type: String,
    enum: ['fixed', 'daily', 'hourly'], // Updated enum
    default: 'fixed'
  },
  basicSalary: {
    type: Number,
    required: [true, 'Basic salary is required'],
    min: [0, 'Basic salary cannot be negative']
  },
  hra: {
    type: Number,
    default: 0,
    min: 0
  },
  conveyance: {
    type: Number,
    default: 0,
    min: 0
  },
  medicalAllowance: {
    type: Number,
    default: 0,
    min: 0
  },
  specialAllowance: {
    type: Number,
    default: 0,
    min: 0
  },
  pf: {
    type: Number,
    default: 0,
    min: 0
  },
  professionalTax: {
    type: Number,
    default: 0,
    min: 0
  },
  tds: {
    type: Number,
    default: 0,
    min: 0
  },
  otherDeductions: {
    type: Number,
    default: 0,
    min: 0
  },
  grossSalary: {
    type: Number,
    default: 0,
    min: 0
  },
  netSalary: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // System Fields
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Face Recognition Fields
  faceEmbedding: {
    type: [Number],
    default: null
  },
  faceImage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Update salary calculation middleware to handle different salary types
employeeSchema.pre('save', function(next) {
  try {
    if (this.salaryType === 'fixed') {
      // Only calculate for fixed salary employees
      const basic = Number(this.basicSalary) || 0;
      const hra = Number(this.hra) || 0;
      const conveyance = Number(this.conveyance) || 0;
      const medical = Number(this.medicalAllowance) || 0;
      const special = Number(this.specialAllowance) || 0;
      const pf = Number(this.pf) || 0;
      const profTax = Number(this.professionalTax) || 0;
      const tds = Number(this.tds) || 0;
      const otherDed = Number(this.otherDeductions) || 0;

      // Calculate gross salary
      const gross = basic + hra + conveyance + medical + special;
      
      // Calculate net salary
      const totalDeductions = pf + profTax + tds + otherDed;
      const net = Math.max(0, gross - totalDeductions);

      // Set the calculated values
      this.grossSalary = parseFloat(gross.toFixed(2));
      this.netSalary = parseFloat(net.toFixed(2));

      console.log('Fixed Salary Calculation:', {
        basic, hra, conveyance, medical, special,
        gross: this.grossSalary,
        deductions: totalDeductions,
        net: this.netSalary
      });
    } else {
      // For daily/hourly employees, set gross and net to basicSalary
      // Actual calculations will be done based on attendance
      const rate = Number(this.basicSalary) || 0;
      this.grossSalary = parseFloat(rate.toFixed(2));
      this.netSalary = parseFloat(rate.toFixed(2));
      
      console.log('Variable Rate Set:', {
        salaryType: this.salaryType,
        rate: this.basicSalary,
        gross: this.grossSalary,
        net: this.netSalary
      });
    }

    next();
  } catch (error) {
    console.error('Error in salary calculation:', error);
    next(error);
  }
});

// Also update pre-update middleware
employeeSchema.pre('findOneAndUpdate', function(next) {
  try {
    const update = this.getUpdate();
    const salaryType = update.salaryType || this._update.salaryType || 'fixed';
    
    if (salaryType === 'fixed') {
      const basic = Number(update.basicSalary) || Number(this._update.basicSalary) || 0;
      const hra = Number(update.hra) || Number(this._update.hra) || 0;
      const conveyance = Number(update.conveyance) || Number(this._update.conveyance) || 0;
      const medical = Number(update.medicalAllowance) || Number(this._update.medicalAllowance) || 0;
      const special = Number(update.specialAllowance) || Number(this._update.specialAllowance) || 0;
      const pf = Number(update.pf) || Number(this._update.pf) || 0;
      const profTax = Number(update.professionalTax) || Number(this._update.professionalTax) || 0;
      const tds = Number(update.tds) || Number(this._update.tds) || 0;
      const otherDed = Number(update.otherDeductions) || Number(this._update.otherDeductions) || 0;

      const gross = basic + hra + conveyance + medical + special;
      const totalDeductions = pf + profTax + tds + otherDed;
      const net = Math.max(0, gross - totalDeductions);

      this.set({
        grossSalary: parseFloat(gross.toFixed(2)),
        netSalary: parseFloat(net.toFixed(2))
      });
    } else {
      // For daily/hourly, set gross and net to basicSalary
      const rate = Number(update.basicSalary) || Number(this._update.basicSalary) || 0;
      this.set({
        grossSalary: parseFloat(rate.toFixed(2)),
        netSalary: parseFloat(rate.toFixed(2))
      });
    }

    next();
  } catch (error) {
    console.error('Error in update salary calculation:', error);
    next(error);
  }
});

// Generate employee ID
employeeSchema.statics.generateEmployeeId = async function() {
  try {
    const lastEmployee = await this.findOne().sort({ createdAt: -1 });
    if (lastEmployee && lastEmployee.empId) {
      const lastNumber = parseInt(lastEmployee.empId.split('-')[1]);
      return `EMP-${String(lastNumber + 1).padStart(4, '0')}`;
    }
    return 'EMP-0001';
  } catch (error) {
    console.error('Error generating employee ID:', error);
    return `EMP-${Date.now().toString().slice(-4)}`;
  }
};

// Add instance method to calculate salaries
employeeSchema.methods.calculateSalaries = function() {
  if (this.salaryType === 'fixed') {
    const basic = Number(this.basicSalary) || 0;
    const hra = Number(this.hra) || 0;
    const conveyance = Number(this.conveyance) || 0;
    const medical = Number(this.medicalAllowance) || 0;
    const special = Number(this.specialAllowance) || 0;
    const pf = Number(this.pf) || 0;
    const profTax = Number(this.professionalTax) || 0;
    const tds = Number(this.tds) || 0;
    const otherDed = Number(this.otherDeductions) || 0;

    const gross = basic + hra + conveyance + medical + special;
    const totalDeductions = pf + profTax + tds + otherDed;
    const net = Math.max(0, gross - totalDeductions);

    return {
      grossSalary: parseFloat(gross.toFixed(2)),
      netSalary: parseFloat(net.toFixed(2))
    };
  } else {
    // For variable salary types
    const rate = Number(this.basicSalary) || 0;
    return {
      grossSalary: parseFloat(rate.toFixed(2)),
      netSalary: parseFloat(rate.toFixed(2))
    };
  }
};

// Add method to update face embedding
employeeSchema.methods.updateFaceEmbedding = function(embedding) {
  this.faceEmbedding = embedding;
  return this.save();
};

// Export schema for multi-database support
export { employeeSchema };

export default mongoose.model('Employee', employeeSchema);