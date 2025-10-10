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
    this.subtotal = this.lines.reduce((sum, line) => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      return sum + (quantity * price);
    }, 0);
    
    this.gstTotal = this.lines.reduce((sum, line) => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      const gstRate = Number(line.gst) || 0;
      const lineSubtotal = quantity * price;
      return sum + (lineSubtotal * (gstRate / 100));
    }, 0);
    
    this.total = this.subtotal + this.gstTotal;
    
    // Update line totals and ensure all required fields are set
    this.lines.forEach(line => {
      const quantity = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      const gstRate = Number(line.gst) || 0;
      
      line.total = (quantity * price) * (1 + gstRate / 100);
      
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

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);