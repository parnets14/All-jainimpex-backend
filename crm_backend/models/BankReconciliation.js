import mongoose from 'mongoose';

/**
 * Stores the reconciliation state for a bank account.
 *
 * Bank Reconciliation (BRS) matches the bank balance "as per our books" against
 * the actual bank statement. Differences are usually timing items:
 *   - Cheques we issued (book payment) that the bank has not debited yet
 *   - Deposits we recorded (book receipt) that the bank has not credited yet
 *
 * We do NOT change the Voucher records. We only store, per bank account, which
 * book transactions (vouchers) have "cleared" the bank, plus the last statement
 * date and closing balance the user entered.
 */
const clearedItemSchema = new mongoose.Schema({
  clearedDate: { type: Date, default: Date.now },
  clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const bankReconciliationSchema = new mongoose.Schema({
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    required: true,
    unique: true,
  },
  // voucherId (string) -> { clearedDate, clearedBy, updatedAt }
  clearedItems: {
    type: Map,
    of: clearedItemSchema,
    default: {},
  },
  lastStatementDate: { type: Date },
  lastStatementBalance: { type: Number },
  lastReconciledAt: { type: Date },
  lastReconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export { bankReconciliationSchema };

export default mongoose.model('BankReconciliation', bankReconciliationSchema);
