import mongoose from 'mongoose';

const accountMasterSchema = new mongoose.Schema({
  accountName: { type: String, required: true, trim: true, unique: true },
  accountGroup: {
    type: String,
    required: true,
    enum: [
      'Capital', 'Reserves & Surplus', 'Loans & Liabilities',
      'Current Liabilities', 'Duties & Taxes',
      'Fixed Assets', 'Current Assets',
      'Sales', 'Purchase',
      'Direct Expenses', 'Indirect Expenses',
      'Sundry Debtors', 'Sundry Creditors',
      'GST Payable', 'GST Input Credit',
      'Other'
    ]
  },
  accountType: {
    type: String,
    required: true,
    enum: ['Asset', 'Liability', 'Equity', 'Income', 'Expense']
  },
  openingBalance: { type: Number, default: 0 },
  openingBalanceType: { type: String, enum: ['Dr', 'Cr'], default: 'Dr' },
  isSystem: { type: Boolean, default: false }, // system accounts can't be deleted
  isActive: { type: Boolean, default: true },
  description: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Export schema for multi-database support
export { accountMasterSchema };

export default mongoose.model('AccountMaster', accountMasterSchema);
