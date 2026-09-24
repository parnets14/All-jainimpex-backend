import mongoose from 'mongoose';
import { PRIMARY_GROUPS, LEDGER_GROUPS, parentGroupFor } from '../config/accountGroups.js';

const accountMasterSchema = new mongoose.Schema({
  accountName: { type: String, required: true, trim: true, unique: true },
  /**
   * Primary group this ledger group rolls up into (Assets / Liabilities /
   * Income / Expenses). Derived from `accountGroup` automatically unless set
   * explicitly, so statements can group consistently.
   */
  parentGroup: {
    type: String,
    enum: [...PRIMARY_GROUPS, null],
    default: null,
    index: true
  },
  accountGroup: {
    type: String,
    required: true,
    // Canonical list lives in config/accountGroups.js and is shared with the
    // JournalVoucher entry lines, so the two can never drift apart again.
    enum: LEDGER_GROUPS
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

/**
 * Keep `parentGroup` in step with `accountGroup`.
 *
 * Derived on every save unless the caller passed an explicit non-null value, so
 * moving a ledger to a different group re-derives its primary group automatically
 * while a deliberate override still wins.
 */
accountMasterSchema.pre('save', function (next) {
  const explicitlySet = this.isModified('parentGroup') && this.parentGroup != null;
  if (!explicitlySet) {
    this.parentGroup = parentGroupFor(this.accountGroup);
  }
  next();
});

// Export schema for multi-database support
export { accountMasterSchema };

export default mongoose.model('AccountMaster', accountMasterSchema);
