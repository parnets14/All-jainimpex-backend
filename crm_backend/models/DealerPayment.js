import mongoose from "mongoose";

const dealerPaymentSchema = new mongoose.Schema({
  paymentNumber: {
    type: String,
    unique: true
  },
  dealerInvoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DealerInvoice",
    required: function() {
      return this.paymentCategory === "Invoice Payment";
    }
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  
  // Payment Category - NEW
  paymentCategory: {
    type: String,
    enum: ["Invoice Payment", "Advance Payment"],
    default: "Invoice Payment",
    required: true
  },
  
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ["Cash", "Cheque", "UPI", "Bank Transfer"]
  },
  paymentType: {
    type: String,
    required: true,
    enum: ["Full", "Partial"]
  },
  status: {
    type: String,
    required: true,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending"
  },
  
  // Payment method specific details
  chequeDetails: {
    chequeNo: {
      type: String,
      required: function() {
        return this.paymentMethod === "Cheque";
      }
    },
    bankName: {
      type: String,
      required: function() {
        return this.paymentMethod === "Cheque";
      }
    },
    chequeDate: {
      type: Date,
      required: function() {
        return this.paymentMethod === "Cheque";
      }
    },
    remarks: String
  },
  
  upiDetails: {
    upiId: {
      type: String,
      required: function() {
        return this.paymentMethod === "UPI";
      }
    },
    transactionId: {
      type: String,
      required: function() {
        return this.paymentMethod === "UPI";
      }
    },
    remarks: String
  },
  
  bankTransferDetails: {
    bankName: {
      type: String,
      required: function() {
        return this.paymentMethod === "Bank Transfer";
      }
    },
    accountNumber: {
      type: String,
      required: function() {
        return this.paymentMethod === "Bank Transfer";
      }
    },
    transactionId: {
      type: String,
      required: function() {
        return this.paymentMethod === "Bank Transfer";
      }
    },
    remarks: String
  },
  
  remarks: {
    type: String,
    default: ""
  },
  
  // Invoice details for reference (conditionally required)
  invoiceNumber: {
    type: String,
    required: function() {
      return this.paymentCategory === "Invoice Payment";
    }
  },
  invoiceAmount: {
    type: Number,
    required: function() {
      return this.paymentCategory === "Invoice Payment";
    }
  },
  remainingAmount: {
    type: Number,
    required: function() {
      return this.paymentCategory === "Invoice Payment";
    }
  },
  
  // Advance Payment Details
  advanceDetails: {
    isAdvance: {
      type: Boolean,
      default: false
    },
    advanceAmount: {
      type: Number,
      default: 0
    },
    adjustedAmount: {
      type: Number,
      default: 0
    },
    remainingAdvance: {
      type: Number,
      default: 0
    },
    adjustedAgainstInvoices: [{
      invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DealerInvoice"
      },
      invoiceNumber: String,
      adjustedAmount: Number,
      adjustedDate: Date
    }]
  },
  
  // Source of payment (App or Web)
  source: {
    type: String,
    enum: ["App", "Web"],
    default: "Web"
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  }
}, {
  timestamps: true
});

// Generate payment number before saving
dealerPaymentSchema.pre("save", async function(next) {
  if (this.isNew && !this.paymentNumber) {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      // Find the last payment of today
      const lastPayment = await this.constructor.findOne({
        paymentNumber: { $regex: `^DP-${dateStr}-` }
      }).sort({ paymentNumber: -1 });
      
      let sequence = 1;
      if (lastPayment) {
        const lastSequence = parseInt(lastPayment.paymentNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }
      
      this.paymentNumber = `DP-${dateStr}-${sequence.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error("Error generating payment number:", error);
      // Fallback to timestamp-based number
      this.paymentNumber = `DP-${Date.now()}`;
    }
  }
  next();
});

// Index for better performance
dealerPaymentSchema.index({ paymentNumber: 1 });
dealerPaymentSchema.index({ dealerInvoice: 1 });
dealerPaymentSchema.index({ dealer: 1 });
dealerPaymentSchema.index({ paymentDate: -1 });
dealerPaymentSchema.index({ status: 1 });
dealerPaymentSchema.index({ source: 1 });

const DealerPayment = mongoose.model("DealerPayment", dealerPaymentSchema);

export default DealerPayment;

