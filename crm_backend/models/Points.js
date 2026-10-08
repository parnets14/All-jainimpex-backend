import mongoose from "mongoose";

/**
 * Slab-based points/benefit definition.
 *
 * A Points document describes Scope -> Condition -> Slabs -> Reward, the same
 * shape used by the dealer `Scheme` model. Each entry in `slabs` is an ordered
 * tier: when the accumulated measured value reaches `from` (and stays under
 * `to`, when `to` is set) that tier's reward applies.
 *
 * Selection is HIGHEST QUALIFYING SLAB ONLY — tiers never stack.
 */
const pointsSlabSchema = new mongoose.Schema(
  {
    seq: { type: Number, required: true, min: 1 },
    from: { type: Number, required: true, min: 0 },
    // null => open-ended top slab ("and above")
    to: { type: Number, default: null, min: 0 },
    label: { type: String, default: "" },
    reward: {
      points: { type: Number, default: 0, min: 0 },
      extraQuantity: { type: Number, default: 0, min: 0 },
      discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
      cashbackAmount: { type: Number, default: 0, min: 0 },
      description: { type: String, default: "" }
    }
  },
  { _id: false }
);

const pointsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["purchase", "sale"],
    required: true
  },
  /**
   * Human-entered unique identifier shown everywhere the entry appears.
   * Sparse so existing rows (created before this field) do not collide on null,
   * and so older documents can still be saved without a code.
   */
  schemeCode: {
    type: String,
    uppercase: true,
    trim: true,
    default: null
  },
  schemeName: {
    type: String,
    default: ""
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subcategory",
    required: true
  },
  calculationType: {
    type: String,
    enum: ["amount", "units"],
    required: true
  },
  inputValue: {
    type: Number,
    required: true,
    min: 0
  },
  // Benefit type and values
  benefitType: {
    type: String,
    enum: ["points", "extraQuantity", "discount", "cashback"],
    default: "points"
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  extraQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  cashbackAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Validity period for purchase schemes
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date,
    default: function() {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1); // Default 1 year validity
      return date;
    }
  },
  // Auto-apply settings
  autoApplyGRN: {
    type: Boolean,
    default: false
  },
  autoApplySupplierInvoice: {
    type: Boolean,
    default: false
  },
  // Description
  description: {
    type: String,
    default: ""
  },
  /**
   * Slab tiers. Empty for legacy single-threshold rows, which the controller
   * surfaces as a synthetic one-row slab built from calculationType/inputValue
   * and the benefit* fields. New entries are always written here.
   */
  slabs: {
    type: [pointsSlabSchema],
    default: []
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Index for efficient querying
pointsSchema.index({ type: 1, date: -1 });
pointsSchema.index({ brand: 1, category: 1, subcategory: 1 });
// Sparse unique: enforces uniqueness only where a code was actually supplied.
pointsSchema.index({ schemeCode: 1 }, { unique: true, sparse: true });

/**
 * Resolve the slab that a measured value falls into.
 * Returns the HIGHEST qualifying slab, or null when nothing qualifies.
 * Legacy rows (no `slabs`) resolve to null — callers should use
 * `effectiveSlabs()` for those.
 */
pointsSchema.methods.resolveSlab = function (measuredValue) {
  const value = Number(measuredValue) || 0;
  const ordered = [...(this.slabs || [])].sort(
    (a, b) => Number(a.from) - Number(b.from)
  );
  let match = null;
  for (const slab of ordered) {
    const from = Number(slab.from);
    const to = slab.to === null || slab.to === undefined ? null : Number(slab.to);
    if (value >= from && (to === null || value <= to)) match = slab;
  }
  return match;
};

/**
 * Slabs in a normalised shape. Legacy rows (no `slabs[]`) are surfaced as a
 * single-tier slab so the UI and reports can render one uniform model without
 * any migration or write.
 */
pointsSchema.methods.effectiveSlabs = function () {
  if (Array.isArray(this.slabs) && this.slabs.length > 0) {
    return [...this.slabs].sort((a, b) => Number(a.from) - Number(b.from));
  }
  if (this.inputValue === null || this.inputValue === undefined) return [];
  return [
    {
      seq: 1,
      from: Number(this.inputValue),
      to: null,
      label: `${this.inputValue}+ (legacy)`,
      reward: {
        points: Number(this.points || 0),
        extraQuantity: Number(this.extraQuantity || 0),
        discountPercentage: Number(this.discountPercentage || 0),
        cashbackAmount: Number(this.cashbackAmount || 0),
        description: ""
      }
    }
  ];
};

const Points = mongoose.model("Points", pointsSchema);

// Export schema for multi-database support
export { pointsSchema };

export default Points;