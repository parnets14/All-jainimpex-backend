import mongoose from "mongoose";

/**
 * SchemeProgress — the dealer x scheme x window accumulation bucket.
 *
 * WHY this exists:
 *   A dealer's qualifying purchase for one scheme can span MULTIPLE documents.
 *   A Sales Order can be auto-split into a Regular order + a CD order, and a
 *   Confirmed order can be partially dispatched with the remainder moved into a
 *   brand-new order. Computing progress per order or per invoice would therefore
 *   lose continuity.
 *
 *   So the bucket is keyed on (dealer, scheme, window) — NEVER on an order — and
 *   every contributing document line is recorded as a `contribution` at LINE level.
 *   Splitting, reducing or cancelling a document simply adds/updates/excludes its
 *   contribution and the measured total is recomputed from the surviving lines.
 *
 * Example: 5 pcs on 10 Oct + 5 pcs on 12 Oct = 10 -> the "10 pcs -> 1 free" slab.
 */

const contributionSchema = new mongoose.Schema({
  // Where the quantity/value came from.
  documentType: {
    type: String,
    enum: ["SalesOrder", "DealerInvoice"],
    required: true
  },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  documentNumber: { type: String, default: "" },
  lineId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Traceability: which split family the source order belongs to.
  //
  // STRING, not ObjectId. The id is generated as `SOG-<timestamp>-<random>` and a
  // non-split order uses its own orderNumber ("SO-2026-0017") — see
  // SalesOrder.orderGroupId and SchemeApplication.orderGroupId, both String.
  //
  // Typed as ObjectId here, EVERY save threw
  //   Cast to ObjectId failed for value "SOG-…" at path "contributions.0.orderGroupId"
  // and the caller swallowed it as "Scheme progress recording failed (non-critical)".
  // The upsert had already created the bucket, so the visible symptom was a dealer
  // row with Measured 0 and no contributions — progress simply never recorded.
  orderGroupId: { type: String, default: null },

  // Snapshot of the matched line, used for reporting and for re-matching.
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  productCode: { type: String, default: "" },
  productName: { type: String, default: "" },
  brand: { type: String, default: "" },
  category: { type: String, default: "" },
  subcategory: { type: String, default: "" },
  salesType: { type: String, default: "" },

  quantity: { type: Number, default: 0, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 },

  // Which mix group this line satisfied, when scope.level === 'mix'.
  mixGroupName: { type: String, default: "" },

  counted: { type: Boolean, default: true },
  exclusionReason: {
    type: String,
    enum: ["", "cancelled", "rejected", "expired", "reduced", "deviation", "replaced"],
    default: ""
  },

  occurredAt: { type: Date, default: Date.now }
}, { _id: true });

// A frozen achievement. Created the moment a slab is crossed and never silently
// mutated — if the underlying purchase is later reversed the achievement is
// flagged `revocationPending` instead of being deleted.
const achievementSchema = new mongoose.Schema({
  slabSeq: { type: Number, required: true },
  slabLabel: { type: String, default: "" },

  // Which ladder produced this achievement.
  //   null  -> the scheme's flat `slabs[]` ladder (measured over the whole scope)
  //   <id>  -> a per-product ladder from `productSlabs[]` (item #3), measured on
  //            that product's own lines only.
  // Uniqueness is (product, slabSeq): one row per ladder, always the highest won.
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  // The per-product ladder's own label (e.g. "Pipe ladder"). Not the product name —
  // the engine only ever sees the product's id.
  ladderLabel: { type: String, default: "" },

  measuredValue: { type: Number, default: 0 },
  rewardType: {
    type: String,
    enum: ["points", "freeItem", "discount", "creditNote", "cashback", "gift"],
    required: true
  },
  rewardSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  rewardDescription: { type: String, default: "" },

  // Which document is credited with crossing the slab.
  crossedByDocumentType: { type: String, enum: ["SalesOrder", "DealerInvoice"], default: null },
  crossedByDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  crossingDocumentNumber: { type: String, default: "" },

  achievedAt: { type: Date, default: Date.now },

  // autoAtInvoice rewards are handed over here; manual ones go to SchemeApplication.
  autoApplied: { type: Boolean, default: false },
  autoAppliedAt: { type: Date, default: null },
  autoAppliedDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Set once this achievement has been turned into a SchemeApplication (deferred
  // reward) or handed over inline (auto reward), so it is no longer "pending".
  redeemed: { type: Boolean, default: false },
  redeemedAt: { type: Date, default: null },
  application: { type: mongoose.Schema.Types.ObjectId, ref: "SchemeApplication", default: null },

  revocationPending: { type: Boolean, default: false },
  revocationReason: { type: String, default: "" }
}, { _id: true });

const schemeProgressSchema = new mongoose.Schema({
  dealer: { type: mongoose.Schema.Types.ObjectId, ref: "Dealer", required: true },
  dealerName: { type: String, default: "" },
  dealerCode: { type: String, default: "" },

  scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
  schemeCode: { type: String, required: true },
  schemeName: { type: String, default: "" },

  // The window the bucket belongs to. Mirrors the scheme's validity window so a
  // scheme edit that changes the window naturally starts a fresh bucket.
  windowFrom: { type: Date, required: true },
  windowTo: { type: Date, required: true },

  basis: { type: String, enum: ["quantity", "amount"], required: true },

  // Denormalised from the Scheme. `false` = one achievement per dealer, so the
  // entitlement step must not mint a second reward for the same slab.
  allowRepeat: { type: Boolean, default: false },

  contributions: { type: [contributionSchema], default: [] },
  achievements: { type: [achievementSchema], default: [] },

  // Denormalised running totals, recomputed from contributions on every write.
  measuredQuantity: { type: Number, default: 0 },
  measuredAmount: { type: Number, default: 0 },

  // Next slab the dealer has not reached yet (for the Sales Order advisory hint).
  nextSlabSeq: { type: Number, default: null },
  nextSlabFrom: { type: Number, default: null }
}, { timestamps: true });

// One bucket per dealer + scheme + window.
schemeProgressSchema.index(
  { dealer: 1, scheme: 1, windowFrom: 1, windowTo: 1 },
  { unique: true }
);
schemeProgressSchema.index({ scheme: 1, "achievements.revocationPending": 1 });
schemeProgressSchema.index({ dealer: 1, schemeCode: 1 });

// Recompute the denormalised totals from the counted contributions.
schemeProgressSchema.methods.recomputeTotals = function () {
  const counted = (this.contributions || []).filter((c) => c.counted !== false);
  this.measuredQuantity = counted.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
  this.measuredAmount = counted.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  return this.measuredQuantity;
};

/**
 * Refresh the "next slab" hint. Kept on the model so both commit helpers and any
 * future maintenance job stay consistent. Pass the scheme's slabs; when they are
 * not supplied the hint is left untouched.
 */
schemeProgressSchema.methods.refreshNextSlab = function (slabs = []) {
  if (!Array.isArray(slabs) || slabs.length === 0) return;
  const value = this.measuredValue();
  const ordered = [...slabs].sort((a, b) => Number(a.from) - Number(b.from));
  const next = ordered.find((s) => Number(s.from) > value);
  if (next) {
    this.nextSlabSeq = next.seq;
    this.nextSlabFrom = Number(next.from);
  } else {
    this.nextSlabSeq = null;
    this.nextSlabFrom = null;
  }
};

// Value actually compared against the slabs.
schemeProgressSchema.methods.measuredValue = function () {
  return this.basis === "amount"
    ? Number(this.measuredAmount || 0)
    : Number(this.measuredQuantity || 0);
};

const SchemeProgress = mongoose.model("SchemeProgress", schemeProgressSchema);

export { schemeProgressSchema };
export default SchemeProgress;
