import mongoose from 'mongoose';

const purchaseDiscountMappingSchema = new mongoose.Schema({
  // Basic Information
  discountName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Hierarchy Targeting (same as dealer discounts but for suppliers)
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand'
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  extendedSubcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory'
  },
  
  // Supplier Targeting (instead of dealer targeting)
  suppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  }],
  
  // Purchase Discount Configuration (Simplified)
  directDiscountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Floating Discount Configuration
  floatingDiscountEnabled: {
    type: Boolean,
    default: false
  },
  floatingDiscountMin: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  floatingDiscountMax: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  
  // Validity Period
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validTo: {
    type: Date
  },
  
  // Status and Approval (Same as Sales Discounts)
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
  approvedDate: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedDate: {
    type: Date
  },
  approvalRemarks: {
    type: String,
    trim: true
  },
  
  // Active Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // System Fields
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

// Indexes for better performance
purchaseDiscountMappingSchema.index({ brand: 1, status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ category: 1, status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ subcategory: 1, status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ extendedSubcategory: 1, status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ suppliers: 1, status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ status: 1, isActive: 1 });
purchaseDiscountMappingSchema.index({ validFrom: 1, validTo: 1 });
purchaseDiscountMappingSchema.index({ status: 1 });

// Static method to find applicable discounts for a product and supplier
purchaseDiscountMappingSchema.statics.findApplicableDiscounts = async function(productId, supplierId) {
  try {
    const Product = mongoose.model('Product');
    const product = await Product.findById(productId)
      .populate('brand')
      .populate('category')
      .populate('subcategory')
      .populate('extendedSubcategory');
    
    if (!product) {
      return [];
    }
    
    const now = new Date();
    
    // Build query to find applicable discounts (Only approved ones)
    const query = {
      status: 'Approved',
      isActive: true,
      validFrom: { $lte: now },
      $or: [
        { validTo: { $exists: false } },
        { validTo: null },
        { validTo: { $gte: now } }
      ],
      $and: []
    };
    
    // Add hierarchy conditions
    const hierarchyConditions = [];
    
    if (product.brand) {
      hierarchyConditions.push({ brand: product.brand._id });
    }
    if (product.category) {
      hierarchyConditions.push({ category: product.category._id });
    }
    if (product.subcategory) {
      hierarchyConditions.push({ subcategory: product.subcategory._id });
    }
    if (product.extendedSubcategory) {
      hierarchyConditions.push({ extendedSubcategory: product.extendedSubcategory._id });
    }
    
    // Add supplier condition
    if (supplierId) {
      hierarchyConditions.push({ suppliers: supplierId });
    }
    
    if (hierarchyConditions.length > 0) {
      query.$and.push({ $or: hierarchyConditions });
    }
    
    const discounts = await this.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('extendedSubcategory', 'name')
      .populate('suppliers', 'name code')
      .sort({ createdAt: -1 });
    
    return discounts;
  } catch (error) {
    console.error('Error finding applicable purchase discounts:', error);
    return [];
  }
};

// Instance method to check if discount is currently valid
purchaseDiscountMappingSchema.methods.isCurrentlyValid = function() {
  const now = new Date();
  return this.status === 'Approved' && 
         this.isActive && 
         this.validFrom <= now && 
         (!this.validTo || this.validTo >= now);
};

// Virtual for discount summary
purchaseDiscountMappingSchema.virtual('discountSummary').get(function() {
  let summary = '';
  
  if (this.directDiscountPercentage > 0) {
    summary += `Direct: ${this.directDiscountPercentage}%`;
  }
  
  if (this.floatingDiscountEnabled) {
    if (summary) summary += ', ';
    summary += `Floating: ${this.floatingDiscountMin}%-${this.floatingDiscountMax}%`;
  }
  
  return summary || 'No discounts configured';
});

// Export schema for multi-database support
export { purchaseDiscountMappingSchema };

export default mongoose.model('PurchaseDiscountMapping', purchaseDiscountMappingSchema);