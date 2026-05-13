import mongoose from 'mongoose';

const targetSchema = new mongoose.Schema({
  targetNumber: {
    type: String,
    unique: true
  },
  salesExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  salesExecutiveName: String,
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region'
  },
  
  // Target Period
  targetType: {
    type: String,
    enum: ['Daily', 'Weekly', 'Monthly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Target Metrics
  targets: {
    salesAmount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    visitCount: { type: Number, default: 0 },
    collectionAmount: { type: Number, default: 0 }
  },
  
  // Achievement (auto-calculated)
  achievement: {
    salesAmount: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    visitCount: { type: Number, default: 0 },
    collectionAmount: { type: Number, default: 0 },
    
    salesPercentage: { type: Number, default: 0 },
    orderPercentage: { type: Number, default: 0 },
    visitPercentage: { type: Number, default: 0 },
    collectionPercentage: { type: Number, default: 0 },
    
    overallPercentage: { type: Number, default: 0 }
  },
  
  // Incentive
  incentive: {
    enabled: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ['Fixed', 'Percentage', 'Slab'],
      default: 'Fixed'
    },
    fixedAmount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    minAchievement: { type: Number, default: 80 },
    slabs: [{
      from: Number,
      to: Number,
      bonus: Number
    }],
    earned: { type: Number, default: 0 }
  },
  
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled'],
    default: 'Active'
  },
  
  notes: String,
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastCalculated: Date
}, {
  timestamps: true
});

// Generate target number
targetSchema.pre('save', async function(next) {
  if (this.isNew && !this.targetNumber) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const count = await this.constructor.countDocuments({
      targetNumber: { $regex: `^TGT-${dateStr}-` }
    });
    this.targetNumber = `TGT-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
  }
  next();
});

// Indexes
targetSchema.index({ salesExecutive: 1, startDate: -1 });
targetSchema.index({ targetType: 1, status: 1 });
targetSchema.index({ startDate: 1, endDate: 1 });

// Export schema for multi-database support
export { targetSchema };

export default mongoose.model('Target', targetSchema);
