import mongoose from "mongoose";

/**
 * SchemeApplication — the redemption ledger.
 *
 * One record per (achievement, reward actually given). This is what makes the
 * "who availed what offer and how much" reports possible, and it is the audit
 * trail for the fact that deferred rewards (points / credit note / cashback /
 * gift) are decided MANUALLY by a user from the Scheme Redemption module.
 *
 * Scheme code is stored denormalised so every report row can show it without a
 * join, matching the requirement that the code appears everywhere.
 */

const editHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ["created", "edited", "approved", "rejected", "processed", "revoked"],
    required: true
  },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String, default: "" },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  performedByName: { type: String, default: "" },
  performedAt: { type: Date, default: Date.now }
}, { _id: false });

const schemeApplicationSchema = new mongoose.Schema({
  // --- Scheme identity (denormalised on purpose) ---
  scheme: { type: mongoose.Schema.Types.ObjectId, ref: "Scheme", required: true },
  schemeCode: { type: String, required: true, trim: true },
  schemeName: { type: String, default: "" },

  // --- Who ---
  dealer: { type: mongoose.Schema.Types.ObjectId, ref: "Dealer", required: true },
  dealerName: { type: String, default: "" },
  dealerCode: { type: String, default: "" },
  route: { type: mongoose.Schema.Types.ObjectId, ref: "Route", default: null },
  routeName: { type: String, default: "" },
  region: { type: mongoose.Schema.Types.ObjectId, ref: "Region", default: null },
  regionName: { type: String, default: "" },

  // --- What was achieved ---
  progress: { type: mongoose.Schema.Types.ObjectId, ref: "SchemeProgress", default: null },
  slabSeq: { type: Number, default: null },
  slabLabel: { type: String, default: "" },
  // Which ladder produced this reward:
  //   null  -> the scheme's flat ladder
  //   <id>  -> a per-product ladder (item #3)
  // Two products can legitimately be at the SAME slabSeq (Product A and Product B
  // both reaching their own tier 2), so the dedupe key has to include the product.
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  ladderLabel: { type: String, default: "" },
  measuredValue: { type: Number, default: 0 },
  basis: { type: String, enum: ["quantity", "amount"], default: "quantity" },

  // --- The reward being given ---
  // `detectedReward` is what the engine proposed; `finalReward` is what the user
  // actually decided after editing. They may differ — that difference is the
  // whole point of the manual redemption step.
  detectedReward: {
    type: { type: String, default: "" },
    points: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    freeItemQuantity: { type: Number, default: 0 },
    freeItemRule: { type: String, default: "" },
    freeItemProduct: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    giftName: { type: String, default: "" },
    description: { type: String, default: "" }
  },

  rewardType: {
    type: String,
    enum: ["points", "freeItem", "discount", "creditNote", "cashback", "gift"],
    required: true
  },
  rewardPoints: { type: Number, default: 0, min: 0 },
  rewardPercentage: { type: Number, default: 0, min: 0, max: 100 },
  rewardAmount: { type: Number, default: 0, min: 0 },
  rewardFreeItemQuantity: { type: Number, default: 0, min: 0 },
  rewardFreeItemProduct: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  rewardFreeItemProductName: { type: String, default: "" },
  rewardGiftName: { type: String, default: "" },
  rewardDescription: { type: String, default: "" },

  status: {
    type: String,
    enum: ["Pending", "Partially Given", "Given", "Rejected", "Revoked"],
    default: "Pending"
  },

  // Amount already handed over, for partial redemption.
  givenAmount: { type: Number, default: 0, min: 0 },
  givenPoints: { type: Number, default: 0, min: 0 },
  givenQuantity: { type: Number, default: 0, min: 0 },

  remarks: { type: String, default: "", trim: true },
  rejectionReason: { type: String, default: "", trim: true },

  // --- Which document(s) made up the qualifying purchase ---
  sourceDocuments: [{
    documentType: String,
    documentId: mongoose.Schema.Types.ObjectId,
    documentNumber: String,
    quantity: Number,
    amount: Number
  }],

  // The document that froze the slab. Kept as first-class fields (not only in
  // sourceDocuments) so the approval flow can look up "did this invoice already
  // create an entitlement for this slab?" without scanning arrays.
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "DealerInvoice", default: null },
  invoiceNumber: { type: String, default: "" },
  salesOrder: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", default: null },
  orderGroupId: { type: String, default: null },

  // --- Downstream artefacts created when processed ---
  creditNote: { type: mongoose.Schema.Types.ObjectId, ref: "CreditNote", default: null },
  creditNoteNumber: { type: String, default: "" },
  ledgerEntry: { type: mongoose.Schema.Types.ObjectId, default: null },

  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  processedByName: { type: String, default: "" },
  processedAt: { type: Date, default: null },

  editHistory: { type: [editHistorySchema], default: [] }
}, { timestamps: true });

schemeApplicationSchema.index({ scheme: 1, status: 1 });
schemeApplicationSchema.index({ dealer: 1, status: 1 });
schemeApplicationSchema.index({ schemeCode: 1 });
schemeApplicationSchema.index({ status: 1, createdAt: -1 });
// Guards the retry path in invoice approval against duplicate entitlements.
// `product` is part of the key because one invoice can legitimately carry the same
// slabSeq on two different per-product ladders (Product A and Product B both at
// tier 2) — without it the second reward would be silently skipped.
schemeApplicationSchema.index({ invoice: 1, scheme: 1, slabSeq: 1, product: 1 });

const SchemeApplication = mongoose.model("SchemeApplication", schemeApplicationSchema);

export { schemeApplicationSchema };
export default SchemeApplication;
