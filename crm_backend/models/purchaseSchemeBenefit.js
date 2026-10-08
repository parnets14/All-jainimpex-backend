import mongoose from 'mongoose';

/* -------------------------------------------------------------------------
 * Purchase-scheme benefit records.
 *
 * Shared by `GRN` and `SupplierInvoice` — the two documents a purchase scheme
 * can fire on (the `autoApplyGRN` and `autoApplySupplierInvoice` flags on the
 * `Points` model). Kept in one module so the two models cannot drift apart.
 *
 * These are RECORDS of what services/schemeService.js detected. They do not
 * alter stock, item cost, invoice totals or the ledger, so recomputing or
 * clearing them has no financial side effects.
 * ------------------------------------------------------------------------- */

/**
 * One detected payout. `slabSeq`/`slabLabel` identify which tier of the ladder
 * qualified and `measuredValue` records the figure tested against it, so any
 * disputed payout can be re-derived from the stored data.
 */
export const purchaseSchemeBenefitSchema = new mongoose.Schema({
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Points' },
  schemeCode: { type: String, default: '' },
  schemeName: { type: String, default: '' },
  slabSeq: { type: Number, default: null },
  slabLabel: { type: String, default: '' },
  basis: { type: String, enum: ['amount', 'units'], default: 'amount' },
  measuredValue: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  extraQuantity: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  cashbackAmount: { type: Number, default: 0 },
  description: { type: String, default: '' }
}, { _id: false });

/**
 * The summary block embedded on the document. Points and free units are kept
 * separate from the money figures rather than summed into one number, because
 * adding "600 points" to "₹1,500" is meaningless.
 */
export const purchaseSchemeBenefitsSchema = new mongoose.Schema({
  appliedAt: { type: Date, default: null },
  schemes: { type: [purchaseSchemeBenefitSchema], default: [] },
  totalPoints: { type: Number, default: 0 },
  totalExtraQuantity: { type: Number, default: 0 },
  totalDiscountAmount: { type: Number, default: 0 },
  totalCashbackAmount: { type: Number, default: 0 }
}, { _id: false });

export default purchaseSchemeBenefitsSchema;
