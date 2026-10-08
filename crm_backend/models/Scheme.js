import mongoose from "mongoose";

/**
 * Scheme (Offer) master.
 *
 * Dealer-facing slab-based offer engine. A scheme answers four questions:
 *
 *   WHAT counts   -> scope     (brand / category / subcategory / product / mix / all)
 *   HOW measured  -> condition (quantity / amount, per-invoice or cumulative window)
 *   HOW MUCH      -> slabs[]   (ordered tiers: from, to, reward payload)
 *   WHAT you get  -> reward    (points / freeItem / discount / creditNote / cashback / gift)
 *
 * Sales type (Regular Sale vs CD Sales) is intentionally NOT a scheme dimension.
 * A split order only changes how the order is filed, not what the dealer bought:
 * a scheme scoped to a brand/category/subcategory applies to both CD and Regular
 * products of that brand/category/subcategory, and their quantities accumulate
 * together into the same progress bucket.
 *
 * Scheme Code is unique per company (each company has its own database).
 */

// ---------------------------------------------------------------------------
// Scope — WHAT counts toward the scheme
// ---------------------------------------------------------------------------
const scopeSchema = new mongoose.Schema({
  // Discriminator. 'brand' | 'category' | 'subcategory' | 'product' | 'mix' | 'all'
  level: {
    type: String,
    enum: ["brand", "category", "subcategory", "product", "mix", "all"],
    required: true
  },

  // Single-target selectors (used when level !== 'mix')
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Subcategory" },

  // level === 'product' — explicit product allow-list
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

  // level === 'mix' — multiple groups that may each carry their own requirement.
  // Example: Group A (min 5 pcs) + Group B (min 5 pcs) must BOTH be satisfied.
  mixGroups: [{
    groupName: { type: String, default: "" },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Subcategory" },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    minQuantity: { type: Number, default: 0, min: 0 },
    minAmount: { type: Number, default: 0, min: 0 },
    // RATIO MODE. When set (> 0), this group must ALSO account for at least this
    // share of the scheme's total qualifying value, measured on the scheme's basis.
    // Example: Pipes 50% / Fittings 50%, or Category A 70% / Category B 30%.
    // Ratios are relative weights: they are normalised against the sum of all
    // configured ratio percentages, so 50/50 and 70/30 both work. A group with
    // ratio 0 is treated as an absolute-minimum group, not a ratio participant.
    ratioPercentage: { type: Number, default: 0, min: 0, max: 100 }
  }]
}, { _id: false });

// ---------------------------------------------------------------------------
// Per-product ladders (schema item #3)
//
// A scheme normally carries ONE `slabs[]` ladder measured over the whole scope.
// `productSlabs[]` lets a SINGLE scheme hold one ladder PER product instead:
//   Product A: 5 -> 1 free, 10 -> 2 free
//   Product B: 10 -> 1 free, 20 -> 3 free
// Each entry measures only the lines of its own product and resolves its own
// highest qualifying slab. It is independent of `slabs[]`; when both are present
// they are both evaluated and both can produce an achievement.
// ---------------------------------------------------------------------------
const productSlabGroupSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  label: { type: String, default: "", trim: true },
  slabs: { type: [/* slabSchema */ mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false });


// ---------------------------------------------------------------------------
// Slab — HOW MUCH purchased and WHAT reward
// `to: null` on the last slab means "and above".
// Slab selection is HIGHEST QUALIFYING ONLY (not additive).
// ---------------------------------------------------------------------------
const slabSchema = new mongoose.Schema({
  seq: { type: Number, required: true, min: 1 },

  // Qualification band. `from` is inclusive, `to` is inclusive. null `to` = open ended.
  from: { type: Number, required: true, min: 0 },
  to: { type: Number, default: null, min: 0 },

  // Optional label for display / reporting, e.g. "Buy 10 Get 1"
  label: { type: String, default: "", trim: true },

  // PAYMENT TERMS SLAB (schema item #11)
  //
  // Allows a slab to apply only under a given payment condition, so one scheme can
  // carry parallel ladders:
  //   Immediate Payment : 5 -> 1 free, 10 -> 2 free
  //   30 Days Credit    : 8 -> 1 free, 15 -> 2 free
  //
  // Each slab targets an inclusive window of the dealer/invoice credit days.
  //   fromCreditDays: 0, toCreditDays: 0   => Immediate (no credit)
  //   fromCreditDays: 30, toCreditDays: null => 30 days and above
  // A slab with `toCreditDays: null` and `fromCreditDays: 0` is untargeted and
  // applies under ANY payment condition (the default, backwards compatible).
  paymentTerms: {
    // Human label shown in the builder, e.g. "30 Days Credit".
    label: { type: String, default: "", trim: true },
    fromCreditDays: { type: Number, default: 0, min: 0 },
    toCreditDays: { type: Number, default: null, min: 0 }
  },

  reward: {
    // Reward kind for THIS slab.
    type: {
      type: String,
      enum: ["points", "freeItem", "discount", "creditNote", "cashback", "gift"],
      required: true
    },

    // points
    points: { type: Number, default: 0, min: 0 },

    // discount / creditNote / cashback (percentage based)
    percentage: { type: Number, default: 0, min: 0, max: 100 },

    // creditNote / cashback (flat amount)
    amount: { type: Number, default: 0, min: 0 },

    // freeItem
    freeItemQuantity: { type: Number, default: 0, min: 0 },
    // How the free product is chosen out of the qualifying lines.
    freeItemRule: {
      type: String,
      enum: ["sameProduct", "lowestPrice", "equalOrLower", "specificProduct"],
      default: "sameProduct"
    },
    freeItemProduct: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },

    // gift (trip / item)
    giftName: { type: String, default: "", trim: true },

    // Human readable description shown in the UI and stored on the application.
    description: { type: String, default: "", trim: true }
  }
}, { _id: false });

// ---------------------------------------------------------------------------
// Scheme
// ---------------------------------------------------------------------------
const schemeSchema = new mongoose.Schema({
  // Human readable unique code, e.g. CERA-MS-2026-01. Unique per company DB.
  schemeCode: {
    type: String,
    required: [true, "Scheme code is required"],
    trim: true,
    uppercase: true
  },
  schemeName: {
    type: String,
    required: [true, "Scheme name is required"],
    trim: true
  },
  description: { type: String, default: "", trim: true },

  // Which side of the business the scheme serves. Dealers are the current focus;
  // purchase is reserved so the same engine can be reused later.
  appliesTo: {
    type: String,
    enum: ["dealer", "purchase"],
    default: "dealer",
    required: true
  },

  scope: { type: scopeSchema, required: true },

  condition: {
    // quantity = pcs, amount = ₹ value
    basis: {
      type: String,
      enum: ["quantity", "amount"],
      default: "quantity",
      required: true
    },
    // perInvoice  -> each invoice evaluated on its own
    // cumulative  -> contributions accumulate across invoices within [validFrom, validTo]
    accumulation: {
      type: String,
      enum: ["perInvoice", "cumulative"],
      default: "cumulative",
      required: true
    }
  },

  slabs: {
    type: [slabSchema],
    validate: {
      validator: (slabs) => Array.isArray(slabs) && slabs.length > 0,
      message: "At least one slab is required"
    }
  },

  // Optional per-product ladders. When non-empty, each group is measured on its own
  // product's lines and resolves its own ladder, independently of `slabs[]`.
  // This is what makes "Product A: 5->1, 10->2 and Product B: 10->1, 20->3" live
  // inside ONE scheme instead of one scheme per product.
  productSlabs: { type: [productSlabGroupSchema], default: [] },

  // Whether the reward is handed over automatically at invoice time or must be
  // manually processed from the Scheme Redemption module.
  //   autoAtInvoice -> freeItem / discount style immediate rewards
  //   manual         -> points / creditNote / cashback / gift (decided by a user)
  redemptionMode: {
    type: String,
    enum: ["autoAtInvoice", "manual"],
    default: "manual"
  },

  // Optional. Whether the same dealer can earn this scheme more than once
  // inside the validity window.
  allowRepeat: { type: Boolean, default: false },

  // Dealer targeting — empty means "all dealers".
  dealerScope: {
    dealerTypes: [{ type: String }],
    dealerCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "DealerCategory" }],
    regions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Region" }],
    routes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Route" }],
    dealers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dealer" }]
  },

  validFrom: { type: Date, required: true, default: Date.now },
  validTo: {
    type: Date,
    required: true,
    default: function () {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
  },

  status: {
    type: String,
    enum: ["Draft", "Active", "Paused", "Expired", "Cancelled"],
    default: "Active"
  },

  // Higher number wins when one line matches several schemes.
  priority: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

// Scheme code must be unique per company database.
schemeSchema.index({ schemeCode: 1 }, { unique: true });
schemeSchema.index({ status: 1, validFrom: 1, validTo: 1 });
schemeSchema.index({ appliesTo: 1, status: 1 });
schemeSchema.index({ "scope.level": 1, "scope.brand": 1, "scope.category": 1, "scope.subcategory": 1 });

// Auto-expire on read/save when the window has passed.
schemeSchema.methods.isCurrentlyActive = function (at = new Date()) {
  return this.status === "Active" && this.validFrom <= at && this.validTo >= at;
};

// Returns the highest qualifying slab for a measured value, or null.
//
// `creditDays` (optional) filters to slabs whose payment-terms window covers it.
// Untargeted slabs (fromCreditDays 0 / toCreditDays null) always pass, so a scheme
// that never used payment terms behaves exactly as before.
schemeSchema.methods.resolveSlab = function (measuredValue, creditDays = null) {
  const value = Number(measuredValue || 0);
  const hasCreditTarget = creditDays !== null && creditDays !== undefined;
  const days = Number(creditDays || 0);

  const qualifying = (this.slabs || []).filter((slab) => {
    const from = Number(slab.from || 0);
    const to = slab.to === null || slab.to === undefined ? Infinity : Number(slab.to);
    if (value < from || value > to) return false;

    if (!hasCreditTarget) return true;

    const terms = slab.paymentTerms || {};
    const termsFrom = Number(terms.fromCreditDays || 0);
    const termsTo =
      terms.toCreditDays === null || terms.toCreditDays === undefined
        ? null
        : Number(terms.toCreditDays);

    // Untargeted slab: applies under any payment condition.
    if (termsFrom === 0 && termsTo === null) return true;

    return days >= termsFrom && (termsTo === null || days <= termsTo);
  });

  if (qualifying.length === 0) return null;
  // Highest `from` wins; this makes "Buy 20 -> 4 free" beat "Buy 10 -> 2 free".
  return qualifying.reduce((best, slab) =>
    (Number(slab.from) > Number(best.from) ? slab : best)
  );
};

const Scheme = mongoose.model("Scheme", schemeSchema);

export { schemeSchema, slabSchema, scopeSchema, productSlabGroupSchema };
export default Scheme;
