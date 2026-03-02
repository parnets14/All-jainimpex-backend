import mongoose from 'mongoose';

const voucherSchema = new mongoose.Schema({
  // Voucher identification
  voucherNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  voucherType: {
    type: String,
    enum: ['Receipt', 'Payment', 'Contra', 'Journal'],
    required: true,
    index: true
  },
  voucherDate: {
    type: Date,
    required: true,
    index: true
  },
  financialYear: {
    type: String,
    required: true
  },
  
  // Party details
  partyType: {
    type: String,
    enum: ['Dealer', 'Supplier', 'Other', 'Internal', 'Family/Friends'],
    required: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'partyType'
  },
  partyName: String,
  
  // Transaction details
  transactionMode: {
    type: String,
    enum: ['Cash', 'Bank', 'Cheque', 'UPI', 'NEFT', 'RTGS', 'Card', 'Internal'],
    required: true
  },
  
  // Bank details (for bank transactions)
  bankAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount'
  },
  bankAccountName: String,
  
  // Cheque details
  chequeNumber: String,
  chequeDate: Date,
  chequeBank: String,
  chequeStatus: {
    type: String,
    enum: ['Pending', 'Cleared', 'Bounced', 'Cancelled']
  },
  
  // UPI/Online details
  upiTransactionId: String,
  referenceNumber: String,
  
  // Amount details
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  allocatedAmount: {
    type: Number,
    default: 0
  },
  unallocatedAmount: {
    type: Number,
    default: 0
  },
  
  // Allocation type
  allocationType: {
    type: String,
    enum: ['OnAccount', 'AgainstReference', 'Mixed'],
    default: 'OnAccount'
  },
  
  // Cash splitting for compliance
  isCashSplit: {
    type: Boolean,
    default: false
  },
  parentVoucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher'
  },
  splitSequence: Number,
  totalSplits: Number,
  originalAmount: Number,
  splitReason: {
    type: String,
    default: 'Cash limit compliance (₹10,000/day)'
  },
  splitDirection: {
    type: String,
    enum: ['forward', 'backward'],
    default: 'backward'
  },
  splitFrequency: {
    type: Number,
    enum: [1, 2, 3],
    default: 1
  },
  hasConflicts: {
    type: Boolean,
    default: false
  },
  conflictResolution: String,
  
  // Invoice allocations
  allocations: [{
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DealerInvoice'
    },
    invoiceNumber: String,
    invoiceAmount: Number,
    allocatedAmount: Number,
    allocationDate: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Contra voucher details (for internal transfers)
  contraDetails: {
    fromAccount: {
      accountType: {
        type: String,
        enum: ['Cash', 'Bank']
      },
      accountId: mongoose.Schema.Types.ObjectId,
      accountName: String
    },
    toAccount: {
      accountType: {
        type: String,
        enum: ['Cash', 'Bank']
      },
      accountId: mongoose.Schema.Types.ObjectId,
      accountName: String
    }
  },
  
  // Additional details
  narration: String,
  notes: String,
  internalNotes: String,
  attachments: [{
    fileName: String,
    fileUrl: String,
    uploadedAt: Date
  }],
  
  // Status and workflow
  status: {
    type: String,
    enum: ['Draft', 'Posted', 'Cancelled', 'Reversed'],
    default: 'Posted',
    index: true
  },
  
  // Cancellation details
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelReason: String,
  
  // Reversal details
  reversedAt: Date,
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reversalVoucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voucher'
  },
  
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
voucherSchema.index({ voucherDate: 1, voucherType: 1 });
voucherSchema.index({ partyId: 1, voucherDate: -1 });
voucherSchema.index({ status: 1, voucherDate: -1 });
voucherSchema.index({ 'allocations.invoiceId': 1 });

// Calculate unallocated amount before save
voucherSchema.pre('save', function(next) {
  if (this.isModified('allocatedAmount') || this.isModified('totalAmount')) {
    this.unallocatedAmount = this.totalAmount - this.allocatedAmount;
  }
  next();
});

const Voucher = mongoose.model('Voucher', voucherSchema);

export default Voucher;
