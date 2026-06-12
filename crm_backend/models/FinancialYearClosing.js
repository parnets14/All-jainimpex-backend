import mongoose from 'mongoose';

/**
 * Stores a snapshot of a financial year's closing figures.
 * Used for opening-balance carry-forward (Tally-style year close).
 *
 * When a financial year is "closed":
 *   - The year's net profit/loss is recorded
 *   - Retained earnings = prior retained earnings + this year's net profit
 *   - A full balance sheet snapshot is stored for reference
 *
 * The next financial year's balance sheet uses these as opening balances.
 */
const financialYearClosingSchema = new mongoose.Schema({
  financialYear: {
    type: String,        // e.g. "2025-26"
    required: true,
    unique: true,
    trim: true
  },
  fyStartDate: {
    type: Date,
    required: true       // April 1 of start year
  },
  fyEndDate: {
    type: Date,
    required: true       // March 31 of end year
  },
  // P&L for THIS financial year only
  netProfit: {
    type: Number,
    default: 0
  },
  // Cumulative retained earnings INCLUDING this year (prior + this year's profit)
  retainedEarnings: {
    type: Number,
    default: 0
  },
  // Closing balances carried forward as next year's opening
  closingBalances: {
    cashInHand:         { type: Number, default: 0 },
    bankBalances:       { type: Number, default: 0 },
    accountsReceivable: { type: Number, default: 0 },
    accountsPayable:    { type: Number, default: 0 },
    inventory:          { type: Number, default: 0 },
    fixedAssets:        { type: Number, default: 0 },
    capital:            { type: Number, default: 0 },
    gstPayable:         { type: Number, default: 0 },
    loans:              { type: Number, default: 0 }
  },
  // Full balance sheet snapshot (for reference/audit)
  snapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['Closed', 'Reopened'],
    default: 'Closed'
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closedAt: {
    type: Date,
    default: Date.now
  },
  notes: String
}, { timestamps: true });

export { financialYearClosingSchema };
export default mongoose.model('FinancialYearClosing', financialYearClosingSchema);
