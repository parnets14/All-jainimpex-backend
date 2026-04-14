import mongoose from 'mongoose';

const productRecommendationSchema = new mongoose.Schema({
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: String,
  productCode: String,
  
  reason: {
    type: String,
    required: true,
    trim: true
  },
  
  priority: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3
  },
  
  suggestedAction: {
    type: String,
    required: true,
    enum: ['Reorder', 'Introduce', 'Upsell', 'Cross-sell', 'Promote'],
    default: 'Introduce'
  },
  
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Dismissed', 'Expired'],
    default: 'Active'
  },
  
  validFrom: {
    type: Date,
    default: Date.now
  },
  
  validUntil: {
    type: Date
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
  
  completedAt: Date,
  dismissedAt: Date,
  dismissedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
productRecommendationSchema.index({ dealer: 1, status: 1 });
productRecommendationSchema.index({ product: 1 });
productRecommendationSchema.index({ priority: -1 });
productRecommendationSchema.index({ validUntil: 1 });

// Export schema for multi-database support
export { productRecommendationSchema };

export default mongoose.model('ProductRecommendation', productRecommendationSchema);
