import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema({
  paymentNumber: {
    type: String,
    unique: true
  },
  supplierInvoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SupplierInvoice",
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
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
  
  // Invoice details for reference
  invoiceNumber: {
    type: String,
    required: true
  },
  invoiceAmount: {
    type: Number,
    required: true
  },
  remainingAmount: {
    type: Number,
    required: true
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
supplierPaymentSchema.pre("save", async function(next) {
  if (this.isNew && !this.paymentNumber) {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      // Find the last payment of today
      const lastPayment = await this.constructor.findOne({
        paymentNumber: { $regex: `^SP-${dateStr}-` }
      }).sort({ paymentNumber: -1 });
      
      let sequence = 1;
      if (lastPayment) {
        const lastSequence = parseInt(lastPayment.paymentNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }
      
      this.paymentNumber = `SP-${dateStr}-${sequence.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error("Error generating payment number:", error);
      // Fallback to timestamp-based number
      this.paymentNumber = `SP-${Date.now()}`;
    }
  }
  next();
});

// Index for better performance
supplierPaymentSchema.index({ paymentNumber: 1 });
supplierPaymentSchema.index({ supplierInvoice: 1 });
supplierPaymentSchema.index({ supplier: 1 });
supplierPaymentSchema.index({ paymentDate: -1 });
supplierPaymentSchema.index({ status: 1 });

const SupplierPayment = mongoose.model("SupplierPayment", supplierPaymentSchema);

// Export schema for multi-database support
export { supplierPaymentSchema };

export default SupplierPayment;
