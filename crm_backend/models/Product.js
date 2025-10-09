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
    trim: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
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
  gst: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true
  },
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
  minStockLevel: {
    type: Number,
    required: true,
    min: 0,
    default: 0
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Calculate amount for each rate slab and total amount before saving
productSchema.pre('save', function(next) {
  // Calculate amount for each rate slab
  this.rateSlabs.forEach(slab => {
    slab.amount = slab.quantity * slab.rate;
  });

  // Calculate subtotal from rate slabs
  const subtotal = this.rateSlabs.reduce((total, slab) => {
    return total + (slab.quantity * slab.rate);
  }, 0);

  // Calculate total amount with GST
  const gstAmount = subtotal * (this.gst / 100);
  this.totalAmount = subtotal + gstAmount;

  next();
});

// Auto-generate product code before saving if not provided
productSchema.pre('save', async function(next) {
  if (!this.productCode || this.productCode.trim() === '') {
    try {
      const brandDoc = await mongoose.model('Brand').findById(this.brand);
      const categoryDoc = await mongoose.model('Category').findById(this.category);
      const subcategoryDoc = await mongoose.model('Subcategory').findById(this.subcategory);

      if (brandDoc && categoryDoc && subcategoryDoc) {
        const brandInitial = brandDoc.name.substring(0, 1).toUpperCase();
        const categoryInitial = categoryDoc.name.substring(0, 1).toUpperCase();
        const subcategoryInitial = subcategoryDoc.name.substring(0, 1).toUpperCase();
        
        // Count existing products with same brand, category, subcategory
        const count = await mongoose.model('Product').countDocuments({
          brand: this.brand,
          category: this.category,
          subcategory: this.subcategory
        });
        
        const postfix = String(count + 1).padStart(3, '0');
        this.productCode = `${brandInitial}${categoryInitial}${subcategoryInitial}${postfix}`;
      } else {
        return next(new Error('Brand, category, and subcategory must be valid for auto-generating product code'));
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Index for better performance
productSchema.index({ productCode: 1 });
productSchema.index({ itemName: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ status: 1 });

export default mongoose.model('Product', productSchema);