import mongoose from "mongoose";

const creditNoteSchema = new mongoose.Schema({
  creditNoteNumber: {
    type: String,
    unique: true
  },
  
  // Reference to original invoice
  originalInvoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DealerInvoice",
    required: true
  },
  originalInvoiceNumber: {
    type: String,
    required: true
  },
  
  // Dealer Information
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: String,
  dealerCode: String,
  
  // Credit Note Details
  creditNoteDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Credit Amount Details
  creditAmount: {
    type: Number,
    required: true,
    min: 0
  },
  creditReason: {
    type: String,
    required: true,
    trim: true
  },
  
  // Status Management
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected", "Partial"],
    default: "Pending"
  },
  
  // Approval Information
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Financial Calculations
  originalInvoiceAmount: {
    type: Number,
    required: true
  },
  remainingAmount: {
    type: Number,
    required: true
  },
  
  // Additional Information
  remarks: String,
  internalNotes: String,
  
  // Payment Method Information
  paymentMethod: {
    type: String,
    enum: ["Cash", "UPI", "Cheque", "Bank Transfer"],
    required: true
  },
  
  // Cheque Information (if payment method is Cheque)
  chequeDetails: {
    chequeNo: String,
    bankName: String,
    chequeDate: Date,
    chequeAmount: Number,
    remarks: String
  },
  
  // Reference to Cheque Management record (if applicable)
  chequeRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cheque"
  },
  
  // UPI Information (if payment method is UPI)
  upiDetails: {
    upiId: String,
    transactionId: String,
    remarks: String
  },
  
  // Bank Transfer Information (if payment method is Bank Transfer)
  bankTransferDetails: {
    bankName: String,
    accountNumber: String,
    transactionId: String,
    remarks: String
  },
  
  // System Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate credit note number
creditNoteSchema.pre("save", async function(next) {
  if (this.isNew) {
    // Generate sequential credit note number
    const lastCreditNote = await this.constructor.findOne({}, {}, { sort: { 'createdAt': -1 } });
    let nextNumber = 1;
    if (lastCreditNote && lastCreditNote.creditNoteNumber) {
      const lastNum = parseInt(lastCreditNote.creditNoteNumber.split("-")[1]);
      nextNumber = lastNum + 1;
    }
    this.creditNoteNumber = `CN-${String(nextNumber).padStart(3, "0")}`;
  }
  next();
});

// Indexes for better performance
creditNoteSchema.index({ originalInvoice: 1 });
creditNoteSchema.index({ dealer: 1 });
creditNoteSchema.index({ creditNoteDate: 1 });
creditNoteSchema.index({ status: 1 });
creditNoteSchema.index({ creditNoteNumber: 1 });

export default mongoose.model("CreditNote", creditNoteSchema);
