import mongoose from "mongoose";

const dealerPerformanceSchema = new mongoose.Schema({
  // Dealer Information
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: {
    type: String,
    required: true
  },
  dealerCode: {
    type: String,
    required: true
  },
  dealerType: {
    type: String,
    required: true,
    enum: ["Retailer", "Wholeseller", "Resellers", "Independent", "Independent Dealer", "Distributor"]
  },
  category: {
    type: String,
    required: true
  },

  // Performance Metrics
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  sales: {
    type: Number,
    required: true,
    min: 0
  },
  schemeEarned: {
    type: Number,
    required: true,
    min: 0
  },
  discountLevel: {
    type: String,
    required: true,
    enum: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"]
  },
  performance: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  rank: {
    type: Number,
    required: true,
    min: 1
  },

  // Date Information
  performanceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  period: {
    type: String,
    required: true,
    enum: ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"]
  },

  // Product Details
  products: [{
    name: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: ["Sanitary", "Plumbing", "Kitchen", "Bathroom", "Other"]
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    points: {
      type: Number,
      required: true,
      min: 0
    },
    costPrice: {
      type: Number,
      required: true,
      min: 0
    },
    profit: {
      type: Number,
      required: true
    },
    profitMargin: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  }],

  // Additional Metrics
  totalProfit: {
    type: Number,
    required: true
  },
  averageProfitMargin: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  customerSatisfaction: {
    type: Number,
    min: 0,
    max: 5
  },
  returnRate: {
    type: Number,
    min: 0,
    max: 100
  },

  // Financial Metrics
  paid: {
    type: Number,
    default: 0,
    min: 0
  },
  outstanding: {
    type: Number,
    default: 0
  },
  growthPercentage: {
    type: Number,
    default: 0
  },
  targetAchieved: {
    type: Number,
    default: 0,
    min: 0
  },
  returnsPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  averageDiscountAvailed: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // System Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
dealerPerformanceSchema.index({ dealer: 1, performanceDate: -1 });
dealerPerformanceSchema.index({ dealerType: 1 });
dealerPerformanceSchema.index({ category: 1 });
dealerPerformanceSchema.index({ performanceDate: -1 });
dealerPerformanceSchema.index({ rank: 1 });
dealerPerformanceSchema.index({ performance: -1 });
dealerPerformanceSchema.index({ sales: -1 });

// Virtual for profit margin calculation
dealerPerformanceSchema.virtual('calculatedProfitMargin').get(function() {
  if (this.sales > 0) {
    return ((this.totalProfit / this.sales) * 100).toFixed(2);
  }
  return 0;
});

// Pre-save middleware to calculate totals
dealerPerformanceSchema.pre('save', function(next) {
  if (this.products && this.products.length > 0) {
    this.totalProfit = this.products.reduce((sum, product) => sum + product.profit, 0);
    this.averageProfitMargin = this.products.length > 0 
      ? this.products.reduce((sum, product) => sum + product.profitMargin, 0) / this.products.length
      : 0;
  }
  next();
});

// Export schema for multi-database support
export { dealerPerformanceSchema };

export default mongoose.model("DealerPerformance", dealerPerformanceSchema);
