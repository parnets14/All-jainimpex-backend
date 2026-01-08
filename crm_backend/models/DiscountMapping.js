import mongoose from 'mongoose';

const discountLevelSchema = new mongoose.Schema({
  levelName: {
    type: String,
    required: true,
    trim: true
  },
  discountPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  description: {
    type: String,
    trim: true
  }
});

const discountMappingSchema = new mongoose.Schema({
  // Discount Configuration
  discountName: {
    type: String,
    required: true,
    trim: true
  },
  discountType: {
    type: String,
    enum: ['direct', 'level_based', 'both'],
    required: true,
    default: 'direct'
  },
  mappingType: {
    type: String,
    enum: ['sales', 'purchase'],
    required: true
  },
  
  // Hierarchy Configuration (Optional - for flexible targeting)
  targetType: {
    type: String,
    enum: ['product', 'brand', 'subcategory', 'category'],
    required: true
  },
  
  // Target References (Only one will be used based on targetType)
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: function() { return this.targetType === 'product'; }
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: function() { return this.targetType === 'brand'; }
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: function() { return this.targetType === 'subcategory'; }
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: function() { return this.targetType === 'category'; }
  },
  
  // Extended Subcategory Support (for subcategory-based discounts)
  includeExtendedSubcategories: {
    type: Boolean,
    default: true
  },
  
  // Discount Values
  directDiscountPercentage: {
    type: Number,
    min: 0,
    max: 100,
    required: function() { return this.discountType === 'direct' || this.discountType === 'both'; }
  },
  
  levels: {
    type: [discountLevelSchema],
    required: function() { return this.discountType === 'level_based' || this.discountType === 'both'; },
    validate: {
      validator: function(levels) {
        const needsLevels = this.discountType === 'level_based' || this.discountType === 'both';
        return !needsLevels || (levels && levels.length > 0);
      },
      message: 'At least one level is required for level-based or both discount types'
    }
  },
  
  // Validity Period
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validTo: {
    type: Date,
    required: true
  },
  
  // Status and Approval
  status: {
    type: String,
    enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Expired', 'Inactive'],
    default: 'Pending Approval'
  },
  
  // Approval Information
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Additional Configuration
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0,
    comment: 'Higher number = higher priority for same target type'
  },
  
  // Usage Limits (Optional)
  maxUsageCount: {
    type: Number,
    min: 0
  },
  currentUsageCount: {
    type: Number,
    default: 0
  },
  
  // Minimum Order Requirements (Optional)
  minOrderAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  minOrderQuantity: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Dealer Restrictions (Optional)
  applicableDealerTypes: [{
    type: String,
    enum: ['Retailer', 'Wholeseller', 'Distributor', 'Resellers', 'Independent', 'Independent Dealer']
  }],
  
  // Metadata
  remarks: String,
  internalNotes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
discountMappingSchema.index({ targetType: 1, status: 1, isActive: 1 });
discountMappingSchema.index({ product: 1, status: 1, isActive: 1 });
discountMappingSchema.index({ brand: 1, status: 1, isActive: 1 });
discountMappingSchema.index({ subcategory: 1, status: 1, isActive: 1 });
discountMappingSchema.index({ category: 1, status: 1, isActive: 1 });
discountMappingSchema.index({ validFrom: 1, validTo: 1 });
discountMappingSchema.index({ mappingType: 1, status: 1 });

// Virtual for checking if discount is currently valid
discountMappingSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  return this.status === 'Approved' && 
         this.isActive && 
         this.validFrom <= now && 
         this.validTo >= now &&
         (this.maxUsageCount === undefined || this.currentUsageCount < this.maxUsageCount);
});

// Method to get applicable discount percentage for a specific level
discountMappingSchema.methods.getDiscountForLevel = function(levelName) {
  if (this.discountType === 'direct') {
    return this.directDiscountPercentage;
  }
  
  if (this.discountType === 'level_based') {
    const level = this.levels.find(l => l.levelName === levelName);
    return level ? level.discountPercentage : 0;
  }
  
  if (this.discountType === 'both') {
    // For 'both' type, return direct discount + level discount
    const levelDiscount = this.levels.find(l => l.levelName === levelName);
    const directDiscount = this.directDiscountPercentage || 0;
    const additionalDiscount = levelDiscount ? levelDiscount.discountPercentage : 0;
    return { directDiscount, additionalDiscount, total: directDiscount + additionalDiscount };
  }
  
  return 0;
};

// Method to get all available levels for level-based discounts
discountMappingSchema.methods.getAvailableLevels = function() {
  if (this.discountType === 'level_based') {
    return this.levels.map(level => ({
      levelName: level.levelName,
      discountPercentage: level.discountPercentage,
      description: level.description
    }));
  }
  return [];
};

// Pre-save middleware for validation
discountMappingSchema.pre('save', function(next) {
  // Ensure validTo is after validFrom
  if (this.validTo <= this.validFrom) {
    return next(new Error('Valid To date must be after Valid From date'));
  }
  
  // Auto-expire if past validTo date
  if (new Date() > this.validTo && this.status === 'Approved') {
    this.status = 'Expired';
  }
  
  next();
});

// Static method to find applicable discounts for a product
discountMappingSchema.statics.findApplicableDiscounts = async function(productId, mappingType = 'sales', dealerType = null) {
  try {
    // Get product with full hierarchy
    const Product = mongoose.model('Product');
    const product = await Product.findById(productId)
      .populate('category')
      .populate('subcategory')
      .populate('brand')
      .populate('subcategory1')
      .populate('subcategory2')
      .populate('subcategory3')
      .populate('subcategory4')
      .populate('subcategory5');
    
    if (!product) {
      return [];
    }
    
    const now = new Date();
    const baseQuery = {
      mappingType,
      status: 'Approved',
      isActive: true,
      validFrom: { $lte: now },
      validTo: { $gte: now }
    };
    
    // Add dealer type filter if specified
    if (dealerType) {
      baseQuery.$or = [
        { applicableDealerTypes: { $size: 0 } }, // No restrictions
        { applicableDealerTypes: dealerType }
      ];
    }
    
    // Priority order: Product > Brand > Subcategory > Category
    const discountQueries = [
      // 1. Product-specific discounts (Highest Priority)
      { ...baseQuery, targetType: 'product', product: productId },
      
      // 2. Brand-based discounts
      { ...baseQuery, targetType: 'brand', brand: product.brand._id },
      
      // 3. Subcategory-based discounts (including extended subcategories)
      { ...baseQuery, targetType: 'subcategory', subcategory: product.subcategory._id },
      
      // 4. Category-based discounts (Lowest Priority)
      { ...baseQuery, targetType: 'category', category: product.category._id }
    ];
    
    // Add extended subcategory discounts if product has them
    const extendedSubcategories = [
      product.subcategory1,
      product.subcategory2,
      product.subcategory3,
      product.subcategory4,
      product.subcategory5
    ].filter(Boolean);
    
    for (const extSubcat of extendedSubcategories) {
      discountQueries.splice(3, 0, {
        ...baseQuery,
        targetType: 'subcategory',
        subcategory: extSubcat._id
      });
    }
    
    // Execute queries in priority order and return first match
    for (const query of discountQueries) {
      const discounts = await this.find(query)
        .populate('product brand category subcategory', 'name itemName')
        .sort({ priority: -1, createdAt: -1 })
        .limit(5); // Limit to prevent too many results
      
      if (discounts.length > 0) {
        return discounts.map(discount => ({
          ...discount.toObject(),
          targetInfo: {
            targetType: discount.targetType,
            targetName: this.getTargetName(discount, product)
          }
        }));
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error finding applicable discounts:', error);
    return [];
  }
};

// Helper method to get target name for display
discountMappingSchema.statics.getTargetName = function(discount, product) {
  switch (discount.targetType) {
    case 'product':
      return product.itemName;
    case 'brand':
      return discount.brand?.name || product.brand?.name;
    case 'subcategory':
      return discount.subcategory?.name || product.subcategory?.name;
    case 'category':
      return discount.category?.name || product.category?.name;
    default:
      return 'Unknown';
  }
};

// Ensure virtual fields are serialized
discountMappingSchema.set('toJSON', { virtuals: true });
discountMappingSchema.set('toObject', { virtuals: true });

export default mongoose.model('DiscountMapping', discountMappingSchema);