import mongoose from "mongoose";

const salarySlipSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  employee: {
    name: String,
    empId: String,
    department: String,
    designation: String,
  },
  month: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  basicSalary: Number,
  hra: Number,
  conveyance: Number,
  medicalAllowance: Number,
  specialAllowance: Number,
  pf: Number,
  professionalTax: Number,
  tds: Number,
  otherDeductions: Number,
  grossSalary: Number,
  totalDeductions: Number,
  netSalary: Number,
  workingDays: Number,
  daysWorked: Number,
  absentDays: Number,
  leaveDays: Number,
  lopDays: Number,
  lopAmount: Number,
  hoursWorked: Number,
  salaryType: {
    type: String,
    enum: ["fixed", "daily", "hourly"],
    default: "fixed",
  },
  status: {
    type: String,
    enum: ["generated", "paid"],
    default: "generated",
  },
  paymentDate: Date,
  bankDetails: {
    bankName: String,
    accountNumber: String,
    ifscCode: String,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to ensure only one salary slip per employee per month
salarySlipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

// Export schema for multi-database support
export { salarySlipSchema };

export default mongoose.model("SalarySlip", salarySlipSchema);