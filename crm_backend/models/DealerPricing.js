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
  // Enhanced fields for scheduled pricing
  hasScheduledChange: {
    type: Boolean,
    default: false,
    comment: 'Whether this product has a scheduled price change'
  },
  nextScheduledPrice: {
    type: Number,
    min: 0,
    comment: 'Next scheduled price (if any)'
  },
  nextScheduledDate: {
    type: Date,
    comment: 'Date of next scheduled price change'
  },
  // Discount information
  hasDirectDiscount: {
    type: Boolean,
    default: false,
    comment: 'Whether this product has direct discount mapping'
  },
  directDiscountPercentage: {
    type: Number,
    default: 0,
    comment: 'Direct discount percentage from discount mapping'
  },
  maxDiscountPercentage: {
    type: Number,
    default: 0,
    comment: 'Maximum discount percentage allowed'
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
dealerPricingSchema.index({ hasScheduledChange: 1, nextScheduledDate: 1 });
dealerPricingSchema.index({ hasDirectDiscount: 1 });

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

// Method to update discount information (enhanced to check hierarchy)
dealerPricingSchema.methods.updateDiscountInfo = async function(dealerType = null) {
  const DiscountMapping = mongoose.model('DiscountMapping');
  
  try {
    // Find applicable discounts for this product through hierarchy
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      this.product,
      'sales', // Default to sales mapping
      dealerType // Pass dealer type to filter applicable discounts (null = no filtering)
    );

    console.log(`🔍 Checking discounts for product ${this.product} (dealerType: ${dealerType || 'any'}): found ${applicableDiscounts.length} applicable discounts`);

    if (applicableDiscounts && applicableDiscounts.length > 0) {
      const discount = applicableDiscounts[0]; // Use highest priority discount
      
      this.hasDirectDiscount = discount.discountType === 'direct' || discount.discountType === 'both';
      this.directDiscountPercentage = discount.directDiscountPercentage || 0;
      this.maxDiscountPercentage = discount.maxDiscountPercentage || 0;
      
      console.log(`✅ Applied discount to product ${this.product}: ${this.directDiscountPercentage}% direct, ${this.maxDiscountPercentage}% max (dealerType: ${dealerType || 'any'})`);
    } else {
      this.hasDirectDiscount = false;
      this.directDiscountPercentage = 0;
      this.maxDiscountPercentage = 0;
      
      console.log(`❌ No applicable discounts found for product ${this.product} (dealerType: ${dealerType || 'any'})`);
    }
    
    return this;
  } catch (error) {
    console.error('Error updating discount info for product:', this.product, error);
    return this;
  }
};

// Static method to update all discount information (enhanced to include all products)
dealerPricingSchema.statics.updateAllDiscountInfo = async function(dealerType = null) {
  try {
    // Get all existing pricing records
    const existingPricingRecords = await this.find({ isActive: true });
    let updatedCount = 0;

    console.log(`🔄 Updating discount info for ${existingPricingRecords.length} existing pricing records (dealerType: ${dealerType || 'any'})`);

    // Update existing pricing records
    for (const pricing of existingPricingRecords) {
      await pricing.updateDiscountInfo(dealerType);
      await pricing.save();
      updatedCount++;
    }

    // Get all products to check for those without pricing records
    const Product = mongoose.model('Product');
    const allProducts = await Product.find({}).select('_id rateSlabs');
    
    // Find products that don't have pricing records but have rate slabs
    const existingProductIds = existingPricingRecords.map(p => p.product.toString());
    const productsWithoutPricing = allProducts.filter(product => 
      !existingProductIds.includes(product._id.toString()) &&
      product.rateSlabs && 
      product.rateSlabs.length > 0 && 
      product.rateSlabs[0].rate > 0
    );

    console.log(`Found ${productsWithoutPricing.length} products without pricing records but with rate slabs`);

    // Create pricing records for products with rate slabs
    for (const product of productsWithoutPricing) {
      try {
        const newPricing = new this({
          product: product._id,
          sellingPrice: product.rateSlabs[0].rate,
          purchasePrice: 0, // Will be updated when actual purchase happens
          isActive: true,
          createdBy: null // System created
        });

        // Update discount info for the new pricing record with dealer type
        await newPricing.updateDiscountInfo(dealerType);
        await newPricing.save();
        updatedCount++;
        
        console.log(`Created pricing record for product ${product._id} with rate slab price ₹${product.rateSlabs[0].rate} (dealerType: ${dealerType || 'any'})`);
      } catch (error) {
        console.error(`Error creating pricing record for product ${product._id}:`, error);
        // Continue with other products even if one fails
      }
    }

    console.log(`Updated discount info for ${updatedCount} pricing records (${existingPricingRecords.length} existing + ${productsWithoutPricing.length} new) with dealerType: ${dealerType || 'any'}`);
    return updatedCount;
  } catch (error) {
    console.error('Error updating all discount info:', error);
    throw error;
  }
};

// Prevent duplicate pricing entries for same product (when active)
dealerPricingSchema.index({ product: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

export default mongoose.model('DealerPricing', dealerPricingSchema);

