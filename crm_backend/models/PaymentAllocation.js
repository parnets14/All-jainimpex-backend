import mongoose from 'mongoose';

const allocationRowSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['Invoice', 'OpeningBalance'],
    default: 'Invoice',
    required: true
  },
  targetLabel: {
    type: String,
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref() {
      return this.ownerDocument()?.partyType === 'Supplier'
        ? 'SupplierInvoice'
        : 'DealerInvoice';
    },
    required() {
      return this.targetType === 'Invoice';
    },
    validate: {
      validator(value) {
        return this.targetType === 'Invoice' ? value != null : value == null;
      },
      message: 'Invoice targets require invoiceId and OpeningBalance targets must omit it'
    }
  },
  invoiceNumber: String,
  // Generic immutable target snapshots used by both invoice and opening-balance rows.
  originalAmount: {
    type: Number,
    required: true
  },
  originalDate: Date,
  previouslyAllocated: {
    type: Number,
    default: 0,
    required: true
  },
  allocatedAmount: {
    type: Number,
    required: true
  },
  remainingAmount: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['Partial', 'Full'],
    required: true
  },
  // Legacy invoice snapshot names retained for existing consumers.
  invoiceDate: Date,
  invoiceAmount: Number,
  previouslyPaid: Number
}, { _id: true });

const paymentAllocationSchema = new mongoose.Schema({
  allocationNumber: {
    type: String,
    required: true,
    unique: true
  },
  allocationDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  // Source voucher
  voucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher',
    required: true
  },
  voucherNumber: String,
  voucherType: String,
  totalAmount: {
    type: Number,
    required: true
  },

  // Party details
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  partyType: String,
  partyName: String,

  allocations: [allocationRowSchema],

  totalAllocated: {
    type: Number,
    required: true
  },

  notes: String,

  // Reversal lifecycle. Accounting allocations are never deleted.
  status: {
    type: String,
    enum: ['Active', 'Reversed'],
    default: 'Active',
    index: true
  },
  reversedAt: Date,
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reversalReason: String,
  reversalKey: {
    type: String,
    trim: true
  },

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

paymentAllocationSchema.index({ voucherId: 1 });
paymentAllocationSchema.index({ partyId: 1, allocationDate: -1 });
paymentAllocationSchema.index({ 'allocations.invoiceId': 1 });
paymentAllocationSchema.index(
  { reversalKey: 1 },
  { unique: true, partialFilterExpression: { reversalKey: { $type: 'string' } } }
);

const PaymentAllocation = mongoose.model('PaymentAllocation', paymentAllocationSchema);

export { paymentAllocationSchema };

export default PaymentAllocation;
