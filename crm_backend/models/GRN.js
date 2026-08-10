import mongoose from 'mongoose';

const grnSchema = new mongoose.Schema({
  grnNo: {
    type: String,
    required: true,
    unique: true
  },
  // Support multiple POs in one GRN
  poId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  // Array of all PO IDs included in this GRN (for multi-PO support)
  poIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  }],
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
  grnDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Draft', 'Received', 'Partially Received', 'Cancelled', 'Completed'],
    default: 'Draft'
  },
  items: [{
    serialNo: {
      type: Number,
      default: null  // User can manually enter; if null, auto-assigned
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    // Which PO this line item came from (for multi-PO GRNs)
    sourcePOId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null
    },
    sourcePONumber: {
      type: String,
      default: ''
    },
    poQuantity: {
      type: Number,
      required: true
    },
    companyBillQuantity: {
      type: Number,
      default: 0  // What supplier's bill/invoice says
    },
    receivedQuantity: {
      type: Number,
      required: true
    },
    damageQuantity: {
      type: Number,
      default: 0
    },
    acceptedQuantity: {
      type: Number,
      required: true
    },
    shortageQuantity: {
      type: Number,
      default: 0  // companyBillQuantity - receivedQuantity (display/records)
    },
    unitPrice: {
      type: Number,
      required: true
    },
    gst: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    },
    // Store purchase discount info for reference
    purchaseDiscount: {
      hasDiscount: { type: Boolean, default: false },
      directDiscountPercentage: { type: Number, default: 0 },
      floatingDiscountPercentage: { type: Number, default: 0 },
      floatingDiscountRange: {
        min: { type: Number, default: 0 },
        max: { type: Number, default: 0 },
        enabled: { type: Boolean, default: false }
      }
    }
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  // Specific notes for different scenarios
  shortageNote: { type: String, default: '' },
  excessNote:   { type: String, default: '' },
  damageNote:   { type: String, default: '' },
  generalNote:  { type: String, default: '' },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Two-stage workflow
  receivedBy: {
    type: String,
    default: ''
  },
  receivedAt: {
    type: Date,
    default: null
  },
  inspectedBy: {
    type: String,
    default: ''
  },
  inspectedAt: {
    type: Date,
    default: null
  },
  // Auto-created POs tracking
  autoCreatedPOs: [{
    poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    poNumber: { type: String },
    reason: { type: String, enum: ['excess', 'shortage'] },
    quantity: { type: Number },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    createdAt: { type: Date, default: Date.now }
  }],
  // Invoice tracking
  isInvoiceCreated: {
    type: Boolean,
    default: false
  },
  supplierInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierInvoice',
    default: null
  },
  invoiceCreatedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
grnSchema.index({ supplierId: 1, grnDate: -1 });
grnSchema.index({ status: 1 });
grnSchema.index({ 'poIds': 1 });

export { grnSchema };
export default mongoose.model('GRN', grnSchema);
