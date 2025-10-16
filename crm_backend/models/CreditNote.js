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
  if (this.isNew && !this.creditNoteNumber) {
    try {
      // Use a more robust approach to generate sequential credit note number
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        // Get the highest existing credit note number
        const lastCreditNote = await this.constructor.findOne(
          { creditNoteNumber: { $regex: /^CN-\d+$/ } },
          {},
          { sort: { 'creditNoteNumber': -1 } }
        );
        
        let nextNumber = 1;
        
        if (lastCreditNote && lastCreditNote.creditNoteNumber) {
          const parts = lastCreditNote.creditNoteNumber.split("-");
          if (parts.length >= 2) {
            const lastNum = parseInt(parts[1]);
            if (!isNaN(lastNum) && lastNum > 0) {
              nextNumber = lastNum + 1;
            }
          }
        }
        
        const newCreditNoteNumber = `CN-${String(nextNumber).padStart(3, "0")}`;
        
        // Check if this number already exists (race condition protection)
        const existingCreditNote = await this.constructor.findOne({ 
          creditNoteNumber: newCreditNoteNumber 
        });
        
        if (!existingCreditNote) {
          this.creditNoteNumber = newCreditNoteNumber;
          break;
        }
        
        attempts++;
        
        // If we've tried too many times, use timestamp fallback
        if (attempts >= maxAttempts) {
          this.creditNoteNumber = `CN-${Date.now().toString().slice(-6)}`;
          break;
        }
      }
    } catch (error) {
      console.error("Error generating credit note number:", error);
      // Fallback to timestamp-based number if generation fails
      this.creditNoteNumber = `CN-${Date.now().toString().slice(-6)}`;
    }
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
