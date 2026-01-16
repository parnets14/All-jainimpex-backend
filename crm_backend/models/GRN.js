import mongoose from 'mongoose';

const grnSchema = new mongoose.Schema({
  grnNo: {
    type: String,
    required: true,
    unique: true
  },
  poId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
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
  grnDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Draft', 'Received', 'Partially Received', 'Cancelled', 'Completed'],
    default: 'Received'
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    poQuantity: {
      type: Number,
      required: true
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receivedBy: {
    type: String,
    default: ''
  },
  inspectedBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Note: GRN number is generated in the controller, not here
// This ensures better control and prevents race conditions

export default mongoose.model('GRN', grnSchema);