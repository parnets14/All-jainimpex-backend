import mongoose from 'mongoose';

// Loans & advances (Point 4). Admin chooses one-time deduction or monthly EMI.
// Interest optional (default 0%). Salary deducts the due installment each month.
const installmentSchema = new mongoose.Schema({
  month: { type: String },          // 'YYYY-MM'
  amount: { type: Number, default: 0 },
  paid: { type: Boolean, default: false },
  paidOn: { type: Date },
}, { _id: false });

const loanAdvanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  type: { type: String, enum: ['one-time', 'emi'], default: 'one-time' },
  principal: { type: Number, required: true },
  interestRate: { type: Number, default: 0 },   // annual % (0 = interest-free)
  months: { type: Number, default: 1 },         // EMI tenure (1 for one-time)
  startMonth: { type: String, required: true }, // 'YYYY-MM' when recovery begins
  emiAmount: { type: Number, default: 0 },      // per-month deduction (computed)
  totalPayable: { type: Number, default: 0 },   // principal + interest
  recovered: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  schedule: { type: [installmentSchema], default: [] },
  status: { type: String, enum: ['active', 'closed', 'cancelled'], default: 'active' },
  reason: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

loanAdvanceSchema.index({ employee: 1, status: 1 });

export { loanAdvanceSchema };
export default mongoose.model('LoanAdvance', loanAdvanceSchema);
