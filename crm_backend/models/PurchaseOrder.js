// PurchaseOrder.js - Updated model
import mongoose from 'mongoose';

const purchaseOrderLineSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  gst: {
    type: Number,
    required: true,
    min: 0
  },
  // Add the new fields that frontend expects
  lastPrice: {
    type: Number,
    default: 0
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  last30DayPurchaseQuantity: {
    type: Number,
    default: 0
  },
  // Purchase discount information (for reference only - not applied to PO pricing)
  purchaseDiscount: {
    hasDiscount: {
      type: Boolean,
      default: false
    },
    directDiscountPercentage: {
      type: Number,
      default: 0
    },
    floatingDiscountRange: {
      enabled: {
        type: Boolean,
        default: false
      },
      min: {
        type: Number,
        default: 0
      },
      max: {
        type: Number,
        default: 0
      }
    },
    // User-entered floating discount for reference (not applied to PO)
    referenceFloatingDiscount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    potentialDiscountedPrice: {
      type: Number,
      default: 0
    },
    originalPrice: {
      type: Number,
      default: 0
    },
    applicableDiscounts: [{
      id: String,
      name: String,
      directDiscountPercentage: Number,
      floatingDiscountEnabled: Boolean,
      floatingDiscountMin: Number,
      floatingDiscountMax: Number
    }]
  },
  // Supplier extra discount information (for reference only)
  supplierExtraDiscount: {
    hasDiscount: {
      type: Boolean,
      default: false
    },
    discountPercentage: {
      type: Number,
      default: 0
    },
    targetType: String,
    targetName: String,
    description: String
  },
  total: {
    type: Number,
    required: true
  }
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    required: true,
    unique: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  orderDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expectedDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Completed'],
    default: 'Draft'
  },
  paymentTermsDays: {
    type: Number,
    required: true,
    default: 30
  },
  billingAddress: {
    type: String,
    required: true
  },
  shippingAddress: {
    type: String,
    required: true
  },
  lines: [purchaseOrderLineSchema],
  subtotal: {
    type: Number,
    required: true
  },
  gstTotal: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: String
}, {
  timestamps: true
});

// Calculate totals before saving
// In PurchaseOrder.js - Update the pre-save hook
purchaseOrderSchema.pre('save', function(next) {
  try {
    // MRP/price is GST-INCLUSIVE. subtotal = gross inclusive amount.
    this.subtotal = this.lines.reduce((sum, line) => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      return sum + (quantity * price);
    }, 0);

    // GST is already embedded in the inclusive price — reverse-calculate it
    // (do NOT add it on top).
    this.gstTotal = this.lines.reduce((sum, line) => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      const gstRate = Number(line.gst) || 0;
      const lineSubtotal = quantity * price;
      const embeddedGst = gstRate > 0 ? lineSubtotal - lineSubtotal / (1 + gstRate / 100) : 0;
      return sum + embeddedGst;
    }, 0);

    // Total equals the inclusive subtotal (GST already embedded).
    this.total = this.subtotal;

    // Update line totals and ensure all required fields are set
    this.lines.forEach(line => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;

      // Line total is the GST-inclusive amount (no GST added on top).
      line.total = quantity * price;

      // Ensure the new fields have default values if not set
      line.lastPrice = Number(line.lastPrice) || 0;
      line.currentPrice = Number(line.currentPrice) || 0;
      line.last30DayPurchaseQuantity = Number(line.last30DayPurchaseQuantity) || 0;
    });
    
    next();
  } catch (error) {
    console.error('❌ [MODEL_ERROR] Error in pre-save hook:', error);
    next(error);
  }
});

// Export schema for multi-database support
export { purchaseOrderSchema };

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);