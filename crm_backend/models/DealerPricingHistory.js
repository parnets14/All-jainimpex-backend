import mongoose from 'mongoose';

const dealerPricingHistorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  oldPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Previous selling price'
  },
  newPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: 'New selling price'
  },
  changeType: {
    type: String,
    enum: ['manual', 'scheduled', 'bulk_update', 'import'],
    required: true
  },
  changeMethod: {
    type: String,
    enum: ['increase_amount', 'decrease_amount', 'increase_percentage', 'decrease_percentage', 'direct_update'],
    required: true
  },
  changeValue: {
    type: Number,
    comment: 'Amount or percentage value for the change (if applicable)'
  },
  reason: {
    type: String,
    trim: true,
    comment: 'Reason for price change'
  },
  notes: {
    type: String,
    trim: true
  },
  batchId: {
    type: String,
    index: true,
    comment: 'Batch ID for bulk operations'
  },
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealerPricingSchedule',
    comment: 'Reference to schedule if this was a scheduled change'
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changeDate: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
dealerPricingHistorySchema.index({ product: 1, changeDate: -1 });
dealerPricingHistorySchema.index({ changedBy: 1, changeDate: -1 });
dealerPricingHistorySchema.index({ batchId: 1 });
dealerPricingHistorySchema.index({ changeType: 1, changeDate: -1 });

// Static method to log price change
dealerPricingHistorySchema.statics.logPriceChange = async function(data) {
  try {
    const historyRecord = new this(data);
    await historyRecord.save();
    return historyRecord;
  } catch (error) {
    console.error('Error logging price change:', error);
    throw error;
  }
};

// Static method to get price history for a product
dealerPricingHistorySchema.statics.getProductPriceHistory = async function(productId, limit = 10) {
  try {
    return await this.find({ product: productId })
      .populate('changedBy', 'name email')
      .populate('scheduleId', 'effectiveDate reason')
      .sort({ changeDate: -1 })
      .limit(limit);
  } catch (error) {
    console.error('Error getting product price history:', error);
    throw error;
  }
};

// Export schema for multi-database support
export { dealerPricingHistorySchema };

export default mongoose.model('DealerPricingHistory', dealerPricingHistorySchema);