import mongoose from "mongoose";

const supplierLedgerSchema = new mongoose.Schema({
  // Reference to supplier
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
    required: true
  },
  supplierName: String,
  supplierCode: String,
  
  // Ledger Entry Details
  entryDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Transaction Type
  transactionType: {
    type: String,
    enum: ["Invoice", "Payment", "Debit Note", "Adjustment", "Opening Balance"],
    required: true
  },
  
  // Invoice Information (if applicable)
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SupplierInvoice"
  },
  invoiceNumber: String,
  invoiceValue: {
    type: Number,
    default: 0
  },
  
  // Debit Note Information (if applicable)
  debitNote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DebitNote"
  },
  debitNoteNumber: String,
  debitAmount: {
    type: Number,
    default: 0
  },
  
  // Payment Information
  paymentMade: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Cheque", "UPI", "Bank Transfer", "Debit Note", "Adjustment"]
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
supplierLedgerSchema.pre("save", async function(next) {
  if (this.isNew) {
    // Get the last entry for this supplier to calculate running balance
    const lastEntry = await this.constructor.findOne(
      { supplier: this.supplier },
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
supplierLedgerSchema.index({ supplier: 1, entryDate: -1 });
supplierLedgerSchema.index({ transactionType: 1 });
supplierLedgerSchema.index({ status: 1 });

const SupplierLedger = mongoose.model("SupplierLedger", supplierLedgerSchema);

export default SupplierLedger;
