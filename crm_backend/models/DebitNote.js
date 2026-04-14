import mongoose from "mongoose";

const debitNoteItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  productCode: String,
  productName: String,
  HSNCode: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  gst: {
    type: Number,
    default: 0
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  }
});

const debitNoteSchema = new mongoose.Schema({
  debitNoteNumber: {
    type: String,
    required: true,
    unique: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
    required: true
  },
  supplierName: String,
  supplierCode: String,
  supplierGSTIN: String,
  supplierAddress: String,
  supplierPhone: String,
  supplierEmail: String,

  // Reference to original supplier invoice
  supplierInvoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SupplierInvoice",
    required: true
  },
  supplierInvoiceNumber: String,

  // Reference to GRN
  grn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GRN"
  },
  grnNumber: String,

  debitNoteDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  items: [debitNoteItemSchema],

  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  totalGst: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },

  reason: {
    type: String,
    required: true
  },
  description: String,

  status: {
    type: String,
    enum: ["Draft", "Pending", "Approved", "Rejected", "Cancelled"],
    default: "Draft"
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: Date,

  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  rejectedAt: Date,
  rejectionReason: String,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  remarks: String,
  internalNotes: String
}, {
  timestamps: true
});

// Pre-save middleware for calculations
debitNoteSchema.pre("save", function(next) {
  // Calculate GST and total for each item
  this.items.forEach(item => {
    const baseAmount = item.quantity * item.unitPrice;
    item.gstAmount = (baseAmount * item.gst) / 100;
    item.totalPrice = baseAmount + item.gstAmount;
  });

  // Calculate totals
  this.subtotal = this.items.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  this.totalGst = this.items.reduce((sum, item) => {
    return sum + (item.gstAmount || 0);
  }, 0);

  this.totalAmount = this.subtotal + this.totalGst;
  next();
});

// Pre-validate middleware to ensure calculations are done
debitNoteSchema.pre("validate", function(next) {
  // Calculate GST and total for each item
  this.items.forEach(item => {
    const baseAmount = item.quantity * item.unitPrice;
    item.gstAmount = (baseAmount * item.gst) / 100;
    item.totalPrice = baseAmount + item.gstAmount;
  });

  // Calculate totals
  this.subtotal = this.items.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  this.totalGst = this.items.reduce((sum, item) => {
    return sum + (item.gstAmount || 0);
  }, 0);

  this.totalAmount = this.subtotal + this.totalGst;
  next();
});

// Generate debit note number
debitNoteSchema.pre("save", async function(next) {
  if (!this.debitNoteNumber) {
    try {
      const year = new Date().getFullYear();
      const count = await this.constructor.countDocuments();
      this.debitNoteNumber = `DN-${year}-${String(count + 1).padStart(4, "0")}`;
    } catch (error) {
      console.error("Error generating debit note number:", error);
      // Fallback: generate based on timestamp
      this.debitNoteNumber = `DN-${Date.now()}`;
    }
  }
  next();
});

// Index for better query performance
debitNoteSchema.index({ supplier: 1 });
debitNoteSchema.index({ supplierInvoice: 1 });
debitNoteSchema.index({ debitNoteDate: -1 });
debitNoteSchema.index({ status: 1 });

// Export schema for multi-database support
export { debitNoteSchema };

export default mongoose.model("DebitNote", debitNoteSchema);
