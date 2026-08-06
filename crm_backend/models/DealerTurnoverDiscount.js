import mongoose from 'mongoose';

/**
 * Dealer Turnover Discount
 * Track sales-volume-based discount/incentive agreements with dealers.
 * A dealer promises to purchase a target amount within a period
 * (monthly / quarterly / yearly) to earn a discount.
 * Actual purchase turnover is accumulated from Dealer Invoice totalAmount (Approved only).
 */

const periodTargetSchema = new mongoose.Schema({
  periodType: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'custom'], required: true },
  targetAmount:       { type: Number, required: true, min: 0 },
  discountPercentage: { type: Number, required: true, min: 0, max: 100 },
  customStartDate:    { type: Date, default: null },
  customEndDate:      { type: Date, default: null }
}, { _id: false });

const achievementSchema = new mongoose.Schema({
  periodType:         { type: String, enum: ['monthly', 'quarterly', 'yearly', 'custom'] },
  periodLabel:        { type: String },
  achievedAmount:     { type: Number, default: 0 },
  targetAmount:       { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  achieved:           { type: Boolean, default: false },
  achievedAt:         { type: Date, default: null },
  notified:           { type: Boolean, default: false }
}, { _id: false });

const dealerTurnoverDiscountSchema = new mongoose.Schema({
  // Target scope — which dealers count toward this target
  targetType: {
    type: String,
    enum: ['dealer', 'dealerCategory', 'route', 'all'],
    default: 'all'
  },
  dealer:         { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer',         default: null },
  dealerCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'DealerCategory', default: null },
  route:          { type: mongoose.Schema.Types.ObjectId, ref: 'Route',          default: null },
  targetName:     { type: String, default: 'All Dealers' },

  // Multiple period targets
  periods: {
    type: [periodTargetSchema],
    validate: v => Array.isArray(v) && v.length > 0
  },

  validFrom: { type: Date, default: Date.now },
  validTo: {
    type: Date,
    default: function () {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d;
    }
  },

  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  achievements: { type: [achievementSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

dealerTurnoverDiscountSchema.index({ targetType: 1, dealer: 1, dealerCategory: 1, route: 1 });

export { dealerTurnoverDiscountSchema };
export default mongoose.model('DealerTurnoverDiscount', dealerTurnoverDiscountSchema);
