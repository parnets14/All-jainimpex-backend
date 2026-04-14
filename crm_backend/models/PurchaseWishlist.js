import mongoose from 'mongoose';

const PurchaseWishlistItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  requestedQuantity: {
    type: Number,
    required: true,
    min: 1
  },
  notes: {
    type: String,
    default: ''
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'medium', 'high', 'urgent'],
    default: 'normal'
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const PurchaseWishlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deactivatedReason: {
    type: String,
    trim: true
  },
  deactivatedAt: {
    type: Date
  },
  items: [PurchaseWishlistItemSchema],
  totalEstimatedCost: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update lastUpdated on save
PurchaseWishlistSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Index for efficient queries
PurchaseWishlistSchema.index({ createdBy: 1, isActive: 1 });
PurchaseWishlistSchema.index({ name: 1, createdBy: 1 });

// Export schema for multi-database support
export { PurchaseWishlistSchema };

export default mongoose.model('PurchaseWishlist', PurchaseWishlistSchema);