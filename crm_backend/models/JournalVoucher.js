import mongoose from 'mongoose';

const journalEntryLineSchema = new mongoose.Schema({
  accountName: { type: String, required: true, trim: true },
  accountGroup: {
    type: String,
    enum: [
      'Capital', 'Loans & Liabilities', 'Current Liabilities',
      'Fixed Assets', 'Current Assets', 'Sales', 'Purchase',
      'Direct Expenses', 'Indirect Expenses', 'GST Payable',
      'GST Input Credit', 'Sundry Debtors', 'Sundry Creditors', 'Other'
    ],
    required: true
  },
  debit: { type: Number, default: 0, min: 0 },
  credit: { type: Number, default: 0, min: 0 },
  narration: { type: String, trim: true }
});

const journalVoucherSchema = new mongoose.Schema({
  voucherNumber: { type: String, unique: true },
  voucherDate: { type: Date, required: true },
  financialYear: { type: String, required: true },
  voucherType: {
    type: String,
    enum: ['Journal', 'Contra', 'Opening Entry', 'Depreciation', 'GST Adjustment'],
    default: 'Journal'
  },
  entries: {
    type: [journalEntryLineSchema],
    validate: {
      validator: function (entries) {
        if (entries.length < 2) return false;
        const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
        const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
        return Math.abs(totalDebit - totalCredit) < 0.01;
      },
      message: 'Journal entry must have at least 2 lines and total debits must equal total credits'
    }
  },
  totalAmount: { type: Number, required: true, min: 0 },
  narration: { type: String, trim: true },
  status: { type: String, enum: ['Posted', 'Cancelled'], default: 'Posted' },
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelReason: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// Auto-generate voucher number
journalVoucherSchema.pre('save', async function (next) {
  if (!this.voucherNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('JournalVoucher').countDocuments();
    this.voucherNumber = `JV-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('JournalVoucher', journalVoucherSchema);
