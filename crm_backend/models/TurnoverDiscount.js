import mongoose from 'mongoose';

/**
 * Turnover Discount
 * Tracks purchase-volume-based discount agreements with suppliers.
 * Supplier promises a discount % if the buyer purchases a target amount
 * within a period (monthly / quarterly / yearly).
 *
 * Actual purchase turnover is accumulated from Supplier Invoice totalAmount.
 */

const periodTargetSchema = new mongoose.Schema({
  periodType: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly', 'custom'],
    required: true
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  customStartDate: { type: Date, default: null },
  customEndDate:   { type: Date, default: null }
}, { _id: false });

const achievementSchema = new mongoose.Schema({
  periodType: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'custom'] },
  periodLabel: { type: String },          // e.g. "2026-08", "2026-Q3", "2026"
  achievedAmount: { type: Number, default: 0 },
  targetAmount: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  achieved: { type: Boolean, default: false },
  achievedAt: { type: Date, default: null },
  notified: { type: Boolean, default: false } // achievement notification sent
}, { _id: false });

const turnoverDiscountSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    default: null
  },
  supplierName: { type: String },

  // Target scope — which products count toward the turnover
  targetType: {
    type: String,
    enum: ['brand', 'category', 'subcategory', 'product', 'all'],
    default: 'all'
  },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', default: null },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  targetName: { type: String, default: 'All Products' },

  // Multiple period targets can be set (monthly / quarterly / yearly)
  periods: {
    type: [periodTargetSchema],
    validate: v => Array.isArray(v) && v.length > 0
  },

  validFrom: { type: Date, default: Date.now },
  validTo: {
    type: Date,
    default: function () {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return d;
    }
  },

  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },

  // Rolling achievement history (auto-maintained)
  achievements: { type: [achievementSchema], default: [] },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

turnoverDiscountSchema.index({ supplier: 1, isActive: 1 });
turnoverDiscountSchema.index({ targetType: 1, brand: 1, category: 1, subcategory: 1 });

export { turnoverDiscountSchema };
export default mongoose.model('TurnoverDiscount', turnoverDiscountSchema);
