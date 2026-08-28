import mongoose from 'mongoose';

// Company-wide HRMS configuration (a single document per company DB).
// Admin-editable. Drives overtime, late, lunch/shortfall, and no-punch alert.
const hrmsSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true }, // singleton

  // ── Overtime (Point 5) ──
  // OT counts from each employee's own shift end once they cross the buffer.
  // Legacy flat fields (kept for backward compat):
  otBufferMinutes: { type: Number, default: 30 },
  otRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perHour' },
  otRate: { type: Number, default: 0 },          // ₹ per hour or per minute

  // Per-employee OT rules (same assignment pattern as late/offset rules)
  otRules: [{
    applyTo: { type: String, enum: ['all', 'remaining', 'custom'], default: 'all' },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    enabled: { type: Boolean, default: true },
    config: {
      bufferMinutes: { type: Number, default: 30 },
      rateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perHour' },
      rate: { type: Number, default: 0 },
    }
  }],

  // ── Late Entry & OT Deduction System ──
  //
  // Dynamic Multiplier (Grace/Multiplier): converts late minutes → required OT minutes.
  //   e.g. 2 means 10 min late → 20 min OT required.
  // X (Penalty Multiplier): applied on top of salary-based per-minute deduction.
  //   Deduction = Late Minutes × (Salary / Total Working Minutes) × X
  // Surplus Factor: multiplied against surplus OT minutes for display-only output.
  //
  // Decision tree:
  //   Result = (Late Minutes × Dynamic Multiplier) − Actual OT Worked
  //   Result > 0 → Scenario 1 → shortfall → convert back to late-equiv → deduct via Rule 1
  //   Result < 0 → Scenario 2 → surplus → adjust & display only, no pay impact
  //   Result = 0 → fully offset → no deduction

  // ── Rule 1: Late Entry Deduction (base formula) ──
  // Per-employee assignment: each rule targets a set of employees
  lateDeductionRules: [{
    applyTo: { type: String, enum: ['all', 'remaining', 'custom'], default: 'all' },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    enabled: { type: Boolean, default: true },
    config: {
      graceMinutes: { type: Number, default: 5 },
      // X = penalty multiplier applied on (Salary / Total Working Minutes)
      penaltyMultiplier: { type: Number, default: 1 },
    }
  }],

  // ── OT-Late Offset Rules (Scenario 1 & 2) ──
  // Each rule targets a set of employees and defines how OT offsets lateness
  otLateOffsetRules: [{
    applyTo: { type: String, enum: ['all', 'remaining', 'custom'], default: 'all' },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    enabled: { type: Boolean, default: true },
    config: {
      // Dynamic multiplier: late min × this = required OT min
      dynamicMultiplier: { type: Number, default: 2 },
      // Surplus factor: surplus OT × this = display-only adjusted minutes (no pay impact)
      surplusFactor: { type: Number, default: 1 },
    }
  }],

  // ── Legacy fields (kept for backward compatibility, not used by new UI) ──
  lateGraceMinutes: { type: Number, default: 15 },
  lateDeductionMode: { type: String, enum: ['proportional', 'slab', 'count'], default: 'proportional' },
  lateProportionalUsesFullTime: { type: Boolean, default: false },
  lateRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perMinute' },
  lateRate: { type: Number, default: 0 },
  lateSlabHalfDayMinutes: { type: Number, default: 0 },
  lateSlabFullDayMinutes: { type: Number, default: 0 },
  lateCountPerMonth: { type: Number, default: 3 },
  lateCountEqualsDays: { type: Number, default: 1 },

  // ── Lunch / working-hours shortfall (Point 2) ──
  allowedLunchMinutes: { type: Number, default: 45, min: 0 },
  // Monetary excess-break rule: actual completed break may use lunch + grace
  // before the configured per-minute penalty starts.
  breakGraceMinutes: { type: Number, default: 5, min: 0 },
  excessBreakDeductionPerMinute: { type: Number, default: 2, min: 0 },
  shortfallGraceMinutes: { type: Number, default: 0 },
  shortfallRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perMinute' },
  shortfallRate: { type: Number, default: 0 },

  // ── Half-Day & Shortfall Deduction (new) ──
  // Everything deducted BY MINUTES using per-minute salary = salary / (daysInMonth × requiredWorkingMinutes).
  //
  // requiredWorkingMinutes  = full working minutes/day AFTER lunch (e.g. 8h = 480).
  // halfDayThresholdMinutes = below this = half day; deduct by minutes (short from full).
  // halfDayGraceMinutes     = if shortfall from full ≤ this, skip half-day → just shortfall by minutes.
  //
  // Fixed 3-band logic (no mode choice):
  //   worked < threshold (half)        → deduct SHORT minutes by-minute
  //   threshold ≤ worked < (full−grace) → FLAT HALF-DAY salary
  //   worked ≥ (full − grace)          → deduct only the small shortfall by-minute
  halfDayEnabled: { type: Boolean, default: false },
  requiredWorkingMinutes: { type: Number, default: 0 },     // 0 = auto per employee (shift − lunch)
  halfDayThresholdMinutes: { type: Number, default: 240 },  // 4h half point
  halfDayGraceMinutes: { type: Number, default: 30 },       // near-full grace

  // Per-employee half-day rules (same assignment pattern as other rules)
  halfDayRules: [{
    applyTo: { type: String, enum: ['all', 'remaining', 'custom'], default: 'all' },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    enabled: { type: Boolean, default: true },
    config: {
      requiredWorkingMinutes: { type: Number, default: 480 },
      halfDayThresholdMinutes: { type: Number, default: 240 },
      halfDayGraceMinutes: { type: Number, default: 30 },
      deductionMode: { type: String, enum: ['byMinutes', 'flatHalf'], default: 'byMinutes' },
    }
  }],

  // ── No-punch-in alert (Point 8) ──
  noPunchAlertTime: { type: String, default: '13:30' }, // fixed clock time HH:mm

  // ── Absent Review & Excuse ──
  // Every employee gets N free paid leaves per month (auto-applied to their
  // 1st absence(s) of the month, no cut, no review). From the (N+1)th absence
  // onward, the day goes to the Absent Review component for super-admin action.
  freeMonthlyPaidLeaves: { type: Number, default: 1 },
  // Default penalty multiplier for UNPAID (unexcused) absences.
  // Deduction = (salary / daysInMonth) × X. Admin can override per-person at review time.
  absentDeductionMultiplier: { type: Number, default: 1, min: 0.1 },
  // Time the daily absent-review notification is sent to super-admin (HH:mm IST).
  absentReviewAlertTime: { type: String, default: '09:00' },
  // Preset reasons shown in the review dropdown (for both paid & unpaid). "Other" is always available.
  absentReasonPresets: {
    type: [String],
    default: [
      'Medical / Sick',
      'Family emergency',
      'Personal work',
      'Pre-approved verbally',
      'Unauthorized absence',
      'No prior notice',
    ],
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export { hrmsSettingsSchema };
export default mongoose.model('HrmsSettings', hrmsSettingsSchema);
