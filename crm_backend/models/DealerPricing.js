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
  // Sales Discount Information (existing)
  hasDirectDiscount: {
    type: Boolean,
    default: false,
    comment: 'Whether this product has direct sales discount mapping'
  },
  directDiscountPercentage: {
    type: Number,
    default: 0,
    comment: 'Direct sales discount percentage from discount mapping'
  },
  maxDiscountPercentage: {
    type: Number,
    default: 0,
    comment: 'Maximum sales discount percentage allowed'
  },
  salesDiscountSource: {
    type: String,
    enum: ['direct', 'brand', 'category', 'subcategory', 'extended_subcategory'],
    comment: 'Source of sales discount (hierarchy level)'
  },
  salesDiscountSourceName: {
    type: String,
    comment: 'Name of the sales discount source (brand name, category name, etc.)'
  },
  
  // Purchase Discount Information (new)
  purchaseDiscountInfo: {
    hasDirectDiscount: {
      type: Boolean,
      default: false,
      comment: 'Whether this product has direct purchase discount'
    },
    directDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      comment: 'Direct purchase discount percentage from suppliers'
    },
    hasFloatingDiscount: {
      type: Boolean,
      default: false,
      comment: 'Whether this product has floating purchase discount'
    },
    floatingDiscountMin: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      comment: 'Minimum floating purchase discount percentage'
    },
    floatingDiscountMax: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      comment: 'Maximum floating purchase discount percentage'
    },
    discountSource: {
      type: String,
      enum: ['direct', 'brand', 'category', 'subcategory', 'extended_subcategory'],
      comment: 'Source of purchase discount (hierarchy level)'
    },
    discountSourceName: {
      type: String,
      comment: 'Name of the purchase discount source'
    },
    lastDiscountUpdate: {
      type: Date,
      comment: 'When purchase discount info was last updated'
    }
  },
  
  // Effective Pricing (after discounts)
  effectivePurchasePrice: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Purchase price after applying purchase discounts'
  },
  effectiveSellingPrice: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Selling price after considering all discount factors'
  },
  
  // Enhanced Margin Analysis
  grossMargin: {
    type: Number,
    default: 0,
    comment: 'Profit margin before any discounts ((selling - purchase) / purchase * 100)'
  },
  netMargin: {
    type: Number,
    default: 0,
    comment: 'Profit margin after all discounts ((effective_selling - effective_purchase) / effective_purchase * 100)'
  },
  marginRange: {
    min: {
      type: Number,
      default: 0,
      comment: 'Minimum possible margin (with maximum floating discounts)'
    },
    max: {
      type: Number,
      default: 0,
      comment: 'Maximum possible margin (with minimum floating discounts)'
    }
  },
  
  // Price Source Tracking
  purchasePriceSource: {
    type: String,
    enum: ['manual', 'supplier_invoice', 'product_master', 'bulk_update'],
    default: 'manual',
    comment: 'Source of the current purchase price'
  },
  lastPurchasePriceUpdate: {
    type: Date,
    comment: 'When purchase price was last updated'
  },
  lastSupplierInvoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierInvoice',
    comment: 'Reference to the last supplier invoice that updated purchase price'
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
dealerPricingSchema.index({ 'purchaseDiscountInfo.hasDirectDiscount': 1 });
dealerPricingSchema.index({ purchasePriceSource: 1 });
dealerPricingSchema.index({ lastPurchasePriceUpdate: 1 });

// Calculate all pricing metrics before saving
dealerPricingSchema.pre('save', function(next) {
  // Calculate basic profit metrics
  if (this.purchasePrice > 0 && this.sellingPrice > 0) {
    this.profitAmount = this.sellingPrice - this.purchasePrice;
    this.profitMargin = (this.profitAmount / this.purchasePrice) * 100;
    this.grossMargin = this.profitMargin; // Gross margin is before discounts
  } else {
    this.profitAmount = 0;
    this.profitMargin = 0;
    this.grossMargin = 0;
  }
  
  // Calculate effective prices (after discounts)
  this.calculateEffectivePrices();
  
  // Calculate net margin (after discounts)
  if (this.effectivePurchasePrice > 0 && this.effectiveSellingPrice > 0) {
    this.netMargin = ((this.effectiveSellingPrice - this.effectivePurchasePrice) / this.effectivePurchasePrice) * 100;
  } else {
    this.netMargin = 0;
  }
  
  // Calculate margin range (considering floating discounts)
  this.calculateMarginRange();
  
  next();
});

// Method to calculate effective prices after discounts
dealerPricingSchema.methods.calculateEffectivePrices = function() {
  // Calculate effective purchase price (after purchase discounts)
  let effectivePurchase = this.purchasePrice;
  if (this.purchaseDiscountInfo && this.purchaseDiscountInfo.hasDirectDiscount && this.purchaseDiscountInfo.directDiscountPercentage > 0) {
    const discountAmount = (this.purchasePrice * this.purchaseDiscountInfo.directDiscountPercentage) / 100;
    effectivePurchase = this.purchasePrice - discountAmount;
  }
  this.effectivePurchasePrice = Math.max(0, effectivePurchase);
  
  // Effective selling price remains the same as selling price for now
  // (Sales discounts are applied at invoice level, not at product level)
  this.effectiveSellingPrice = this.sellingPrice;
};

// Method to calculate margin range considering floating discounts
dealerPricingSchema.methods.calculateMarginRange = function() {
  if (!this.purchaseDiscountInfo || !this.purchaseDiscountInfo.hasFloatingDiscount) {
    // No floating discount, range is same as net margin
    this.marginRange.min = this.netMargin;
    this.marginRange.max = this.netMargin;
    return;
  }
  
  const basePrice = this.purchasePrice;
  const sellingPrice = this.effectiveSellingPrice;
  
  if (basePrice <= 0 || sellingPrice <= 0) {
    this.marginRange.min = 0;
    this.marginRange.max = 0;
    return;
  }
  
  // Calculate with minimum floating discount (best case for margin)
  const minDiscountAmount = (basePrice * this.purchaseDiscountInfo.floatingDiscountMin) / 100;
  const maxEffectivePurchase = basePrice - minDiscountAmount;
  this.marginRange.max = maxEffectivePurchase > 0 ? ((sellingPrice - maxEffectivePurchase) / maxEffectivePurchase) * 100 : 0;
  
  // Calculate with maximum floating discount (worst case for margin)
  const maxDiscountAmount = (basePrice * this.purchaseDiscountInfo.floatingDiscountMax) / 100;
  const minEffectivePurchase = basePrice - maxDiscountAmount;
  this.marginRange.min = minEffectivePurchase > 0 ? ((sellingPrice - minEffectivePurchase) / minEffectivePurchase) * 100 : 0;
};

// Method to update both sales and purchase discount information
dealerPricingSchema.methods.updateAllDiscountInfo = async function(dealerType = null) {
  // Update purchase discount info (new logic)
  await this.updatePurchaseDiscountInfo();
  
  return this;
};

// Method to update purchase discount information
dealerPricingSchema.methods.updatePurchaseDiscountInfo = async function() {
  const PurchaseDiscountMapping = mongoose.model('PurchaseDiscountMapping');
  
  try {
    // Find applicable purchase discounts for this product
    const applicableDiscounts = await PurchaseDiscountMapping.findApplicableDiscounts(this.product);

    console.log(`🔍 Checking purchase discounts for product ${this.product}: found ${applicableDiscounts.length} applicable discounts`);

    if (applicableDiscounts && applicableDiscounts.length > 0) {
      const discount = applicableDiscounts[0]; // Use highest priority discount
      
      // Initialize purchaseDiscountInfo if it doesn't exist
      if (!this.purchaseDiscountInfo) {
        this.purchaseDiscountInfo = {};
      }
      
      this.purchaseDiscountInfo.hasDirectDiscount = discount.directDiscountPercentage > 0;
      this.purchaseDiscountInfo.directDiscountPercentage = discount.directDiscountPercentage || 0;
      this.purchaseDiscountInfo.hasFloatingDiscount = discount.floatingDiscountEnabled || false;
      this.purchaseDiscountInfo.floatingDiscountMin = discount.floatingDiscountMin || 0;
      this.purchaseDiscountInfo.floatingDiscountMax = discount.floatingDiscountMax || 0;
      
      // Determine discount source
      if (discount.brand) {
        this.purchaseDiscountInfo.discountSource = 'brand';
        this.purchaseDiscountInfo.discountSourceName = discount.brand.name;
      } else if (discount.category) {
        this.purchaseDiscountInfo.discountSource = 'category';
        this.purchaseDiscountInfo.discountSourceName = discount.category.name;
      } else if (discount.subcategory) {
        this.purchaseDiscountInfo.discountSource = 'subcategory';
        this.purchaseDiscountInfo.discountSourceName = discount.subcategory.name;
      } else if (discount.extendedSubcategory) {
        this.purchaseDiscountInfo.discountSource = 'extended_subcategory';
        this.purchaseDiscountInfo.discountSourceName = discount.extendedSubcategory.name;
      } else {
        this.purchaseDiscountInfo.discountSource = 'direct';
        this.purchaseDiscountInfo.discountSourceName = 'Direct Product Discount';
      }
      
      this.purchaseDiscountInfo.lastDiscountUpdate = new Date();
      
      console.log(`✅ Applied purchase discount to product ${this.product}: ${this.purchaseDiscountInfo.directDiscountPercentage}% direct, floating: ${this.purchaseDiscountInfo.floatingDiscountMin}%-${this.purchaseDiscountInfo.floatingDiscountMax}% from ${this.purchaseDiscountInfo.discountSource}`);
    } else {
      // Reset purchase discount info if no applicable discounts
      this.purchaseDiscountInfo = {
        hasDirectDiscount: false,
        directDiscountPercentage: 0,
        hasFloatingDiscount: false,
        floatingDiscountMin: 0,
        floatingDiscountMax: 0,
        discountSource: null,
        discountSourceName: null,
        lastDiscountUpdate: new Date()
      };
      
      console.log(`❌ No applicable purchase discounts found for product ${this.product}`);
    }
    
    return this;
  } catch (error) {
    console.error('Error updating purchase discount info for product:', this.product, error);
    return this;
  }
};

// Method to sync purchase price from latest supplier invoice
dealerPricingSchema.methods.syncPurchasePriceFromInvoices = async function() {
  const SupplierInvoice = mongoose.model('SupplierInvoice');
  
  try {
    // Find the most recent supplier invoice containing this product
    const recentInvoice = await SupplierInvoice.findOne({
      'items.productId': this.product,
      status: { $in: ['Approved', 'Completed', 'Paid'] }
    })
    .sort({ invoiceDate: -1, createdAt: -1 })
    .populate('supplierId', 'name');

    if (recentInvoice) {
      // Find the product item in the invoice
      const productItem = recentInvoice.items.find(item => 
        item.productId && item.productId.toString() === this.product.toString()
      );

      if (productItem && productItem.unitPrice > 0) {
        // Calculate effective purchase price (after discounts applied in invoice)
        let effectivePrice = productItem.unitPrice;
        
        // Apply direct discount if present
        if (productItem.directDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * productItem.directDiscount / 100);
        }
        
        // Apply floating discount if present
        if (productItem.floatingDiscount > 0) {
          effectivePrice = effectivePrice - (effectivePrice * productItem.floatingDiscount / 100);
        }
        
        // Update purchase price with the effective price from invoice
        this.purchasePrice = Math.max(0, effectivePrice);
        this.purchasePriceSource = 'supplier_invoice';
        this.lastPurchasePriceUpdate = new Date();
        this.lastSupplierInvoice = recentInvoice._id;
        
        console.log(`✅ Synced purchase price for product ${this.product} from supplier invoice: ₹${productItem.unitPrice} → ₹${this.purchasePrice} (after discounts)`);
        return true;
      }
    }
    
    console.log(`ℹ️ No recent supplier invoice found for product ${this.product}`);
    return false;
  } catch (error) {
    console.error('Error syncing purchase price from invoices for product:', this.product, error);
    return false;
  }
};

// Static method to update all discount information (enhanced to include purchase discounts)
dealerPricingSchema.statics.updateAllDiscountInfo = async function(dealerType = null) {
  try {
    // Get all existing pricing records
    const existingPricingRecords = await this.find({ isActive: true });
    let updatedCount = 0;

    console.log(`🔄 Updating both sales and purchase discount info for ${existingPricingRecords.length} existing pricing records (dealerType: ${dealerType || 'any'})`);

    // Update existing pricing records with both sales and purchase discounts
    for (const pricing of existingPricingRecords) {
      await pricing.updateAllDiscountInfo(dealerType);
      
      // Also try to sync purchase price from recent invoices
      await pricing.syncPurchasePriceFromInvoices();
      
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
          purchasePriceSource: 'product_master',
          isActive: true,
          createdBy: null // System created
        });

        // Update both sales and purchase discount info for the new pricing record
        await newPricing.updateAllDiscountInfo(dealerType);
        
        // Try to sync purchase price from invoices
        await newPricing.syncPurchasePriceFromInvoices();
        
        await newPricing.save();
        updatedCount++;
        
        console.log(`Created pricing record for product ${product._id} with rate slab price ₹${product.rateSlabs[0].rate} (dealerType: ${dealerType || 'any'})`);
      } catch (error) {
        console.error(`Error creating pricing record for product ${product._id}:`, error);
        // Continue with other products even if one fails
      }
    }

    console.log(`Updated comprehensive discount info for ${updatedCount} pricing records (${existingPricingRecords.length} existing + ${productsWithoutPricing.length} new) with dealerType: ${dealerType || 'any'}`);
    return updatedCount;
  } catch (error) {
    console.error('Error updating all discount info:', error);
    throw error;
  }
};

// Static method to sync all purchase prices from supplier invoices
dealerPricingSchema.statics.syncAllPurchasePricesFromInvoices = async function() {
  try {
    const pricingRecords = await this.find({ isActive: true });
    let syncedCount = 0;
    
    console.log(`🔄 Syncing purchase prices from supplier invoices for ${pricingRecords.length} products`);
    
    for (const pricing of pricingRecords) {
      const synced = await pricing.syncPurchasePriceFromInvoices();
      if (synced) {
        await pricing.save();
        syncedCount++;
      }
    }
    
    console.log(`✅ Synced purchase prices for ${syncedCount} products from supplier invoices`);
    return syncedCount;
  } catch (error) {
    console.error('Error syncing all purchase prices from invoices:', error);
    throw error;
  }
};

// Prevent duplicate pricing entries for same product (when active)
dealerPricingSchema.index({ product: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

export default mongoose.model('DealerPricing', dealerPricingSchema);

