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
    required: true,
    min: 0
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
    enum: ['GRN', 'SALE', 'ADJUSTMENT', 'TRANSFER', 'INVOICE', 'INVOICE_CANCELLATION', 'OPENING'],
    required: true
  },
  // Deterministic identity for retry-safe online stock operations. Legacy rows
  // intentionally omit this field and remain valid.
  operationKey: {
    type: String,
    default: null,
    trim: true
  },
  // Only the first movement in a retriable request carries these fields. The
  // partial unique index turns it into an idempotency marker for that request.
  requestKey: {
    type: String,
    default: null,
    trim: true
  },
  requestFingerprint: {
    type: String,
    default: null,
    minlength: 64,
    maxlength: 64
  },
  movementRole: {
    type: String,
    enum: [
      'RECEIPT',
      'RESERVATION',
      'RESERVATION_RELEASE',
      'DELIVERY',
      'ADJUSTMENT',
      'TRANSFER_OUT',
      'TRANSFER_IN',
      'OPENING',
      'REVERSAL'
    ],
    default: null
  },
  salesOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    default: null
  },
  salesOrderLine: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Optional per-unit cost/valuation rate (used by opening stock & valuation).
  // Does not affect existing quantity/balance logic.
  rate: {
    type: Number,
    default: null
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

// A write to this row inside a transaction serializes every mutation for one
// product/warehouse key. All callers acquire multiple keys in sorted order.
const stockMutationLockSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  key: {
    type: String,
    required: true,
    unique: true,
    immutable: true
  },
  version: {
    type: Number,
    default: 0
  },
  leaseToken: {
    type: String,
    default: null
  },
  leaseExpiresAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Indexes must be declared before compiling the default model so tenant and
// default connections receive the same definitions.
stockMovementSchema.index({ productId: 1, warehouseId: 1 });
stockMovementSchema.index({ productId: 1, warehouseId: 1, date: -1, createdAt: -1 });
stockMovementSchema.index(
  { operationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { operationKey: { $type: 'string' } }
  }
);
stockMovementSchema.index({ salesOrder: 1, movementRole: 1, salesOrderLine: 1 });
stockMovementSchema.index(
  { referenceType: 1, requestKey: 1 },
  {
    unique: true,
    partialFilterExpression: { requestKey: { $type: 'string' } }
  }
);

const stockMovement = mongoose.models.StockMovement
  || mongoose.model('StockMovement', stockMovementSchema);

export { stockMovementSchema, stockMutationLockSchema };

export default stockMovement;
