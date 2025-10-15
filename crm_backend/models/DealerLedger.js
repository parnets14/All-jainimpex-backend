import mongoose from "mongoose";

const dealerLedgerSchema = new mongoose.Schema({
  // Reference to dealer
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: String,
  dealerCode: String,
  
  // Ledger Entry Details
  entryDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Transaction Type
  transactionType: {
    type: String,
    enum: ["Invoice", "Payment", "Credit Note", "Adjustment", "Opening Balance"],
    required: true
  },
  
  // Invoice Information (if applicable)
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DealerInvoice"
  },
  invoiceNumber: String,
  invoiceValue: {
    type: Number,
    default: 0
  },
  
  // Credit Note Information (if applicable)
  creditNote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CreditNote"
  },
  creditNoteNumber: String,
  creditAmount: {
    type: Number,
    default: 0
  },
  
  // Payment Information
  paymentReceived: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Cheque", "UPI", "Bank Transfer", "Credit Note", "Adjustment"]
  },
  
  // Cheque Details (if payment method is Cheque)
  chequeDetails: {
    chequeNo: String,
    bankName: String,
    chequeDate: Date,
    clearDate: Date,
    status: {
      type: String,
      enum: ["Pending", "Cleared", "Bounced"],
      default: "Pending"
    }
  },
  
  // UPI Details (if payment method is UPI)
  upiDetails: {
    upiId: String,
    transactionId: String,
    referenceNo: String
  },
  
  // Bank Transfer Details (if payment method is Bank Transfer)
  bankTransferDetails: {
    bankName: String,
    accountNumber: String,
    transactionId: String,
    referenceNo: String
  },
  
  // Financial Calculations
  debitAmount: {
    type: Number,
    default: 0
  },
  creditAmount: {
    type: Number,
    default: 0
  },
  runningBalance: {
    type: Number,
    required: true
  },
  
  // Additional Information
  description: String,
  remarks: String,
  
  // Credit Terms
  creditDays: {
    type: Number,
    default: 0
  },
  dueDate: Date,
  
  // Points and Schemes
  pointsEarned: {
    type: Number,
    default: 0
  },
  pointsRedeemed: {
    type: Number,
    default: 0
  },
  schemeAmount: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ["Active", "Settled", "Overdue", "Cancelled"],
    default: "Active"
  },
  
  // Aging Information
  agingDays: {
    type: Number,
    default: 0
  },
  
  // System Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate running balance
dealerLedgerSchema.pre("save", async function(next) {
  if (this.isNew) {
    // Get the last entry for this dealer to calculate running balance
    const lastEntry = await this.constructor.findOne(
      { dealer: this.dealer },
      {},
      { sort: { 'createdAt': -1 } }
    );
    
    let previousBalance = 0;
    if (lastEntry) {
      previousBalance = lastEntry.runningBalance;
    }
    
    // Calculate new running balance
    this.runningBalance = previousBalance + this.debitAmount - this.creditAmount;
    
    // Set aging days
    if (this.dueDate) {
      const today = new Date();
      const dueDate = new Date(this.dueDate);
      this.agingDays = Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));
    }
  }
  next();
});

// Indexes for better performance
dealerLedgerSchema.index({ dealer: 1, entryDate: -1 });
dealerLedgerSchema.index({ dealer: 1, status: 1 });
dealerLedgerSchema.index({ invoice: 1 });
dealerLedgerSchema.index({ creditNote: 1 });
dealerLedgerSchema.index({ entryDate: -1 });
dealerLedgerSchema.index({ runningBalance: 1 });

// Virtual for outstanding amount
dealerLedgerSchema.virtual('outstandingAmount').get(function() {
  return Math.max(0, this.runningBalance);
});

// Virtual for payment status
dealerLedgerSchema.virtual('paymentStatus').get(function() {
  if (this.runningBalance <= 0) return 'Settled';
  if (this.agingDays > 0) return 'Overdue';
  return 'Pending';
});

export default mongoose.model("DealerLedger", dealerLedgerSchema);


