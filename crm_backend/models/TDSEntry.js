import mongoose from 'mongoose';

/**
 * TDS (Tax Deducted at Source) entry — tracks tax withheld from vendor/other
 * payments, the resulting TDS Payable liability, and its deposit with the govt.
 */
const tdsEntrySchema = new mongoose.Schema({
  // Deductee (the party we deducted TDS from)
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  deducteeName: { type: String, required: true, trim: true },
  panNumber: { type: String, trim: true, uppercase: true, default: '' },

  // Section under which TDS is deducted (e.g. 194C, 194J, 194I, 194H, 194Q)
  section: { type: String, required: true, trim: true },
  natureOfPayment: { type: String, default: '' },

  baseAmount: { type: Number, required: true, min: 0 },     // amount on which TDS computed
  tdsRate: { type: Number, required: true, min: 0 },         // %
  tdsAmount: { type: Number, required: true, min: 0 },

  deductionDate: { type: Date, required: true, default: Date.now },
  referenceNumber: { type: String, default: '' },            // invoice / payment ref

  // Deposit tracking
  status: { type: String, enum: ['Deducted', 'Deposited'], default: 'Deducted' },
  challanNumber: { type: String, default: '' },
  depositDate: { type: Date, default: null },

  // Linked journal vouchers (for audit)
  deductionVoucher: { type: String, default: '' },
  depositVoucher: { type: String, default: '' },

  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

tdsEntrySchema.index({ deductionDate: -1 });
tdsEntrySchema.index({ status: 1 });
tdsEntrySchema.index({ section: 1 });

export { tdsEntrySchema };

export default mongoose.model('TDSEntry', tdsEntrySchema);
