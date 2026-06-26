import mongoose from 'mongoose';

// Company-wide leave policy (Point 1). One document per company DB, admin-editable.
// Each leave type: annual quota, credit style (monthly accrual or upfront), paid flag.
// All types lapse at financial year-end (Apr-Mar) - no carry-forward.
const leaveTypeRuleSchema = new mongoose.Schema({
  key: { type: String, required: true },          // 'earned' | 'sick' | 'casual'
  label: { type: String, required: true },        // 'Earned Leave' etc.
  annualQuota: { type: Number, default: 0 },       // days per year
  creditStyle: { type: String, enum: ['monthly', 'upfront'], default: 'upfront' },
  paid: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
}, { _id: false });

const leavePolicySchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true }, // singleton
  financialYearStartMonth: { type: Number, default: 4 },   // April
  types: {
    type: [leaveTypeRuleSchema],
    default: [
      { key: 'earned', label: 'Earned Leave', annualQuota: 18, creditStyle: 'monthly', paid: true, active: true },
      { key: 'casual', label: 'Casual Leave', annualQuota: 12, creditStyle: 'upfront', paid: true, active: true },
      { key: 'sick',   label: 'Sick Leave',   annualQuota: 6,  creditStyle: 'upfront', paid: true, active: true },
    ],
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export { leavePolicySchema };
export default mongoose.model('LeavePolicy', leavePolicySchema);
