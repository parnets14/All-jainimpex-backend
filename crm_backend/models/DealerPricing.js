import mongoose from 'mongoose';

const dealerPricingSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
    comment: 'Price at which product was purchased from supplier'
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Price at which product is sold to dealers'
  },
  mrp: {
    type: Number,
    min: 0,
    comment: 'Maximum Retail Price (optional)'
  },
  profitMargin: {
    type: Number,
    default: 0,
    comment: 'Calculated profit margin percentage'
  },
  profitAmount: {
    type: Number,
    default: 0,
    comment: 'Calculated profit amount (sellingPrice - purchasePrice)'
  },
  lastPurchaseDate: {
    type: Date,
    comment: 'Date of last purchase from supplier'
  },
  lastPurchaseSupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    comment: 'Last supplier from whom product was purchased'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient queries
dealerPricingSchema.index({ product: 1 });
dealerPricingSchema.index({ isActive: 1 });
dealerPricingSchema.index({ product: 1, isActive: 1 });

// Calculate profit before saving
dealerPricingSchema.pre('save', function(next) {
  if (this.purchasePrice > 0 && this.sellingPrice > 0) {
    this.profitAmount = this.sellingPrice - this.purchasePrice;
    this.profitMargin = (this.profitAmount / this.purchasePrice) * 100;
  } else {
    this.profitAmount = 0;
    this.profitMargin = 0;
  }
  next();
});

// Prevent duplicate pricing entries for same product (when active)
dealerPricingSchema.index({ product: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

export default mongoose.model('DealerPricing', dealerPricingSchema);

