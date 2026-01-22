import mongoose from 'mongoose';

const dealerPricingScheduleSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: 'Current selling price'
  },
  newPrice: {
    type: Number,
    required: true,
    min: 0,
    comment: 'New selling price to be applied'
  },
  changeType: {
    type: String,
    enum: ['increase_amount', 'decrease_amount', 'increase_percentage', 'decrease_percentage'],
    required: true
  },
  changeValue: {
    type: Number,
    required: true,
    comment: 'Amount or percentage value for the change'
  },
  effectiveDate: {
    type: Date,
    required: true,
    index: true,
    comment: 'Date when the price change should take effect'
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Applied', 'Cancelled', 'Failed'],
    default: 'Scheduled',
    index: true
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
  appliedAt: {
    type: Date,
    comment: 'When the price change was actually applied'
  },
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    comment: 'User who applied the price change'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
dealerPricingScheduleSchema.index({ effectiveDate: 1, status: 1 });
dealerPricingScheduleSchema.index({ product: 1, effectiveDate: 1 });
dealerPricingScheduleSchema.index({ status: 1, effectiveDate: 1 });

// Static method to apply scheduled price changes
dealerPricingScheduleSchema.statics.applyScheduledChanges = async function() {
  const DealerPricing = mongoose.model('DealerPricing');
  const now = new Date();
  
  try {
    // Find all scheduled changes that should be applied
    const scheduledChanges = await this.find({
      status: 'Scheduled',
      effectiveDate: { $lte: now },
      isActive: true
    }).populate('product');

    let appliedCount = 0;
    let failedCount = 0;

    for (const schedule of scheduledChanges) {
      try {
        // Find the current pricing record
        const pricing = await DealerPricing.findOne({
          product: schedule.product._id,
          isActive: true
        });

        if (pricing) {
          // Update the selling price
          pricing.sellingPrice = schedule.newPrice;
          pricing.updatedBy = schedule.createdBy; // Use original creator as updater
          await pricing.save();

          // Mark schedule as applied
          schedule.status = 'Applied';
          schedule.appliedAt = now;
          schedule.appliedBy = schedule.createdBy;
          await schedule.save();

          appliedCount++;
          console.log(`✅ Applied scheduled price change for ${schedule.product.itemName}: ₹${schedule.currentPrice} → ₹${schedule.newPrice}`);
        } else {
          // Mark as failed if no pricing record found
          schedule.status = 'Failed';
          schedule.notes = (schedule.notes || '') + ' | Failed: No active pricing record found';
          await schedule.save();
          failedCount++;
          console.log(`❌ Failed to apply price change for ${schedule.product.itemName}: No pricing record found`);
        }
      } catch (error) {
        // Mark individual schedule as failed
        schedule.status = 'Failed';
        schedule.notes = (schedule.notes || '') + ` | Failed: ${error.message}`;
        await schedule.save();
        failedCount++;
        console.error(`❌ Failed to apply price change for ${schedule.product.itemName}:`, error);
      }
    }

    console.log(`🎯 Scheduled price changes applied: ${appliedCount} successful, ${failedCount} failed`);
    return { appliedCount, failedCount };
  } catch (error) {
    console.error('Error applying scheduled price changes:', error);
    throw error;
  }
};

export default mongoose.model('DealerPricingSchedule', dealerPricingScheduleSchema);