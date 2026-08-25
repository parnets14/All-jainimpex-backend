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
  absentPenaltyUnits: { type: Number, default: 0 }, // Σ of per-day absent X multipliers
  hoursWorked: Number,
  calculationVersion: { type: String, default: 'hrms-v2' },
  attendanceCutoff: Date,
  actualDaysInMonth: Number,
  requiredWorkingMinutes: Number,
  adjustmentGrossBase: Number,
  absenceDayRate: Number,
  fixedProrationFactor: Number,
  payableCalendarDays: Number,
  perMinuteSalaryRate: Number,
  halfDayThresholdMinutes: Number,

  // ── HRMS earnings (Points 5, 12) ──
  otMinutes: { type: Number, default: 0 },
  otAmount: { type: Number, default: 0 },
  incentiveBonus: { type: Number, default: 0 },   // manual monthly (admin-entered)

  // ── HRMS deductions (Points 2, 4, 7, 12) ──
  lateDays: { type: Number, default: 0 },
  lateMinutes: { type: Number, default: 0 },       // total late minutes beyond grace
  lateDeduction: { type: Number, default: 0 },
  // OT-Late offset (Scenario 1 & 2) — informational, no direct pay impact beyond lateDeduction
  otLateOffsetEnabled: { type: Boolean, default: false },
  otRequiredMinutes: { type: Number, default: 0 },     // late × dynamic multiplier
  lateEquivalentMinutes: { type: Number, default: 0 }, // minutes actually deducted after offset
  otSurplusMinutes: { type: Number, default: 0 },      // display-only surplus (worked more OT than needed)
  // Half-day / shortfall
  halfDayCount: { type: Number, default: 0 },          // days classified as half day
  halfDayShortMinutes: { type: Number, default: 0 },   // total short minutes deducted by-minutes
  shortfallMinutes: { type: Number, default: 0 },
  shortfallDeduction: { type: Number, default: 0 },
  loanDeduction: { type: Number, default: 0 },
  loanRefs: [{ loanId: mongoose.Schema.Types.ObjectId, amount: Number }],
  manualAdjustment: { type: Number, default: 0 }, // manual one-off deduction
  adjustmentReason: { type: String, default: '' },
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