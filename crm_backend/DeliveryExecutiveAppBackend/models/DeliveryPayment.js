import mongoose from 'mongoose';

const deliveryPaymentSchema = new mongoose.Schema({
  deliveryAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment',
    required: true
  },
  deliveryExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  salesOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true
  },
  paymentMode: {
    type: String,
    enum: ['cash', 'cheque', 'upi', 'account', 'mixed'],
    required: true
  },
  cashAmount: {
    type: Number,
    default: 0
  },
  chequeDetails: [{
    chequeNumber: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true
    },
    chequeDate: {
      type: Date,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    chequeImage: {
      type: String  // URL to uploaded cheque image
    }
  }],
  upiDetails: {
    transactionId: {
      type: String
    },
    upiId: {
      type: String
    },
    amount: {
      type: Number,
      default: 0
    },
    screenshot: {
      type: String  // URL to UPI payment screenshot
    }
  },
  accountDetails: {
    transactionId: {
      type: String
    },
    accountNumber: {
      type: String
    },
    ifscCode: {
      type: String
    },
    bankName: {
      type: String
    },
    amount: {
      type: Number,
      default: 0
    },
    screenshot: {
      type: String  // URL to account transfer screenshot
    }
  },
  totalAmount: {
    type: Number,
    required: true
  },
  receiptImage: {
    type: String  // URL to uploaded receipt image
  },
  collectedAt: {
    type: Date,
    default: Date.now
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedAt: {
    type: Date
  },
  verificationDate: {
    type: Date
  },
  verificationNotes: {
    type: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
deliveryPaymentSchema.index({ deliveryExecutive: 1, collectedAt: -1 });
deliveryPaymentSchema.index({ verificationStatus: 1 });
deliveryPaymentSchema.index({ dealer: 1 });

// Calculate total amount before saving
deliveryPaymentSchema.pre('save', function(next) {
  if (this.isModified('cashAmount') || this.isModified('chequeDetails') || 
      this.isModified('upiDetails') || this.isModified('accountDetails')) {
    const chequeTotal = this.chequeDetails.reduce((sum, cheque) => sum + cheque.amount, 0);
    const upiTotal = this.upiDetails?.amount || 0;
    const accountTotal = this.accountDetails?.amount || 0;
    this.totalAmount = this.cashAmount + chequeTotal + upiTotal + accountTotal;
  }
  next();
});

// Verify payment
deliveryPaymentSchema.methods.verify = async function(verifiedBy, notes) {
  this.verificationStatus = 'verified';
  this.verifiedBy = verifiedBy;
  this.verificationDate = new Date();
  if (notes) {
    this.verificationNotes = notes;
  }
  await this.save();
};

// Reject payment
deliveryPaymentSchema.methods.reject = async function(verifiedBy, notes) {
  this.verificationStatus = 'rejected';
  this.verifiedBy = verifiedBy;
  this.verificationDate = new Date();
  this.verificationNotes = notes;
  await this.save();
};

export default mongoose.model('DeliveryPayment', deliveryPaymentSchema);
