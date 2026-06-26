import mongoose from 'mongoose';

// Per-employee leave balance for a financial year (Point 1).
// One document per (employee + fyStart year). Tracks accrued/used/remaining per type.
const typeBalanceSchema = new mongoose.Schema({
  key: { type: String, required: true },     // 'earned' | 'sick' | 'casual'
  accrued: { type: Number, default: 0 },      // credited so far this FY
  used: { type: Number, default: 0 },         // approved leave days consumed
}, { _id: false });

const leaveBalanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  fyYear: { type: Number, required: true },   // e.g. 2026 for FY Apr 2026 - Mar 2027
  balances: { type: [typeBalanceSchema], default: [] },
  // tracks which months' monthly-accrual have already been credited (avoid double credit)
  lastAccrualMonth: { type: String, default: '' }, // 'YYYY-MM'
}, { timestamps: true });

leaveBalanceSchema.index({ employee: 1, fyYear: 1 }, { unique: true });

export { leaveBalanceSchema };
export default mongoose.model('LeaveBalance', leaveBalanceSchema);
