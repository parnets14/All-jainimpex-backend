import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  balance: {
    type: Number,
    required: true
  },
  referenceNo: {
    type: String,
    required: true
  },
  referenceType: {
    type: String,
    enum: ['GRN', 'SALE', 'ADJUSTMENT', 'TRANSFER', 'INVOICE', 'INVOICE_CANCELLATION'],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  remarks: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const stockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default stockMovement;