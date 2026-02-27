import mongoose from 'mongoose';

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
  
  // Allocations against invoices
  allocations: [{
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DealerInvoice',
      required: true
    },
    invoiceNumber: {
      type: String,
      required: true
    },
    invoiceDate: Date,
    invoiceAmount: {
      type: Number,
      required: true
    },
    previouslyPaid: {
      type: Number,
      default: 0
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
    }
  }],
  
  totalAllocated: {
    type: Number,
    required: true
  },
  
  notes: String,
  
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

// Indexes
paymentAllocationSchema.index({ voucherId: 1 });
paymentAllocationSchema.index({ partyId: 1, allocationDate: -1 });
paymentAllocationSchema.index({ 'allocations.invoiceId': 1 });

const PaymentAllocation = mongoose.model('PaymentAllocation', paymentAllocationSchema);

export default PaymentAllocation;
