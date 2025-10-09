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
purchaseOrderSchema.pre('save', function(next) {
  this.subtotal = this.lines.reduce((sum, line) => sum + (line.quantity * line.price), 0);
  this.gstTotal = this.lines.reduce((sum, line) => {
    const lineSubtotal = line.quantity * line.price;
    return sum + (lineSubtotal * (line.gst / 100));
  }, 0);
  this.total = this.subtotal + this.gstTotal;
  
  // Update line totals and ensure all required fields are set
  this.lines.forEach(line => {
    line.total = (line.quantity * line.price) * (1 + line.gst / 100);
    // Ensure the new fields have default values if not set
    line.lastPrice = line.lastPrice || 0;
    line.currentPrice = line.currentPrice || 0;
    line.last30DayPurchaseQuantity = line.last30DayPurchaseQuantity || 0;
  });
  
  next();
});

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);