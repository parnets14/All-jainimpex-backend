import mongoose from 'mongoose';

const rateSlabSchema = new mongoose.Schema({
  quantity: {
    type: Number,
    required: true
  },
  rate: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    default: 0
  }
});

const productSchema = new mongoose.Schema({
  productCode: {
    type: String,
    required: false,
    unique: true,
    trim: true
  },
  HSNCode: {
    type: String,
    required: [true, 'HSN Code is required'],
    trim: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  aliasName: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  alternateUnit: {
    type: String,
    trim: true
  },
  // Simple unit relationship (e.g., 1 Box = 10 Pieces)
  alternateUnitQuantity: {
    type: Number,
    min: 0
  },
  gst: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  // PERMANENT STRUCTURE (Required)
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true
  },
  // OPTIONAL EXTENDED SUBCATEGORIES (5 levels)
  subcategory1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory3: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory4: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  subcategory5: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExtendedSubcategory',
    required: false
  },
  minStockLevel: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  rateSlabs: [rateSlabSchema],
  totalAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  salesType: {
    type: String,
    enum: ['CD Sales', 'Regular Sale'],
    default: 'Regular Sale',
    required: true
  },
  productType: {
    type: String,
    enum: ['Regular Product', 'AO Product'],
    default: 'Regular Product',
    required: true
  },
  images: {
    type: [String],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Calculate total amount with GST before saving
productSchema.pre('save', function(next) {
  // If unitPrice is provided but no rateSlabs exist, create a default rate slab
  if (this.unitPrice && (!this.rateSlabs || this.rateSlabs.length === 0)) {
    this.rateSlabs = [{
      quantity: 1,
      rate: this.unitPrice,
      amount: this.unitPrice
    }];
  }
  
  // Calculate amount for each rate slab
  this.rateSlabs.forEach(slab => {
    slab.amount = slab.quantity * slab.rate;
  });

  // Calculate total amount with GST using unitPrice (preferred) or first rate slab
  const basePrice = this.unitPrice || (this.rateSlabs[0]?.rate) || 0;
  if (basePrice && this.gst !== undefined) {
    const gstAmount = basePrice * (this.gst / 100);
    this.totalAmount = basePrice + gstAmount;
  }

  next();
});

// Auto-generate product code before saving if not provided
productSchema.pre('save', async function(next) {
  // Generate product code
  if (!this.productCode || this.productCode.trim() === '') {
    try {
      // Get the connection from the document
      const connection = this.db || this.$__.db || this.constructor.db;
      
      if (!connection) {
        console.warn('Cannot auto-generate product code - no database connection found');
        this.productCode = `PROD-${Date.now()}`;
        return next();
      }
      
      // Import schemas dynamically
      const { brandSchema } = await import('./Brand.js');
      const { categorySchema } = await import('./Category.js');
      const { subcategorySchema } = await import('./Subcategory.js');
      
      // Get or create models on this connection
      const Brand = connection.models.Brand || connection.model('Brand', brandSchema);
      const Category = connection.models.Category || connection.model('Category', categorySchema);
      const Subcategory = connection.models.Subcategory || connection.model('Subcategory', subcategorySchema);
      const Product = connection.models.Product || connection.model('Product', productSchema);
      
      const brandDoc = await Brand.findById(this.brand);
      const categoryDoc = await Category.findById(this.category);
      const subcategoryDoc = await Subcategory.findById(this.subcategory);

      if (brandDoc && categoryDoc && subcategoryDoc) {
        // Use first letter of brand, category, and subcategory
        const brandInitial = brandDoc.name.substring(0, 1).toUpperCase();
        const categoryInitial = categoryDoc.name.substring(0, 1).toUpperCase();
        const subcategoryInitial = subcategoryDoc.name.substring(0, 1).toUpperCase();
        
        // Count existing products with same brand, category, and subcategory
        const count = await Product.countDocuments({
          brand: this.brand,
          category: this.category,
          subcategory: this.subcategory
        });
        
        const postfix = String(count + 1).padStart(3, '0');
        this.productCode = `${brandInitial}${categoryInitial}${subcategoryInitial}${postfix}`;
      } else {
        // If related documents don't exist, generate a simple code
        console.warn('Cannot auto-generate product code - related documents not found. Brand/Category/Subcategory must exist first.');
        this.productCode = `PROD-${Date.now()}`;
      }
    } catch (error) {
      console.error('Error in product code auto-generation:', error);
      return next(error);
    }
  }
  next();
});

// Index for better performance
productSchema.index({ productCode: 1 });
productSchema.index({ itemName: 1 });
productSchema.index({ aliasName: 1 });
productSchema.index({ category: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ subcategory1: 1 });
productSchema.index({ subcategory2: 1 });
productSchema.index({ subcategory3: 1 });
productSchema.index({ subcategory4: 1 });
productSchema.index({ subcategory5: 1 });
productSchema.index({ status: 1 });

// Virtual field to get current price (unitPrice or first rate slab)
productSchema.virtual('currentPrice').get(function() {
  return this.unitPrice || (this.rateSlabs && this.rateSlabs[0]?.rate) || 0;
});

// Ensure virtual fields are serialized
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Export schema for multi-database support
export { productSchema };

export default mongoose.model('Product', productSchema);