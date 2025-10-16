import mongoose from "mongoose";

const supplierInvoiceItemSchema = new mongoose.Schema({
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
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse"
  },
  warehouseName: String
});

const supplierInvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
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
  
  // GRN Reference
  grn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GRN",
    required: true
  },
  grnNumber: String,
  
  // Purchase Order Reference
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PurchaseOrder"
  },
  purchaseOrderNumber: String,
  
  // Invoice Details
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: Date,
  creditDays: {
    type: Number,
    default: 30
  },
  
  // Items
  items: [supplierInvoiceItemSchema],
  
  // Financial Calculations
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
  
  // Status and Tracking
  status: {
    type: String,
    enum: ["Draft", "Pending", "Approved", "Paid", "Cancelled"],
    default: "Draft"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partial", "Paid", "Overdue"],
    default: "Pending"
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentDate: Date,
  
  // Approval Information
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: Date,
  
  // System Fields
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

// Pre-save middleware to calculate amounts and dates
supplierInvoiceSchema.pre("save", function(next) {
  // Calculate due date
  if (this.invoiceDate && this.creditDays) {
    const dueDate = new Date(this.invoiceDate);
    dueDate.setDate(dueDate.getDate() + this.creditDays);
    this.dueDate = dueDate;
  }

  // Calculate financial amounts (only if not already provided)
  if (this.subtotal === undefined || this.subtotal === 0) {
    this.subtotal = this.items.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);
  }

  if (this.totalGst === undefined || this.totalGst === 0) {
    this.totalGst = this.items.reduce((sum, item) => {
      return sum + (item.gstAmount || 0);
    }, 0);
  }

  // Always calculate totalAmount from the current values
  this.totalAmount = this.subtotal + this.totalGst;

  next();
});

// Pre-save for item calculations
supplierInvoiceSchema.pre("save", function(next) {
  this.items.forEach(item => {
    const baseAmount = item.quantity * item.unitPrice;
    item.gstAmount = (baseAmount * item.gst) / 100;
    item.totalPrice = baseAmount + item.gstAmount;
  });
  next();
});

// Generate invoice number
supplierInvoiceSchema.pre("save", async function(next) {
  if (!this.invoiceNumber) {
    try {
      const year = new Date().getFullYear();
      const count = await this.constructor.countDocuments();
      this.invoiceNumber = `SI-${year}-${String(count + 1).padStart(4, "0")}`;
    } catch (error) {
      console.error("Error generating invoice number:", error);
      // Fallback: generate based on timestamp
      this.invoiceNumber = `SI-${Date.now()}`;
    }
  }
  next();
});

// Index for better query performance
supplierInvoiceSchema.index({ supplier: 1 });
supplierInvoiceSchema.index({ invoiceDate: -1 });
supplierInvoiceSchema.index({ status: 1 });
supplierInvoiceSchema.index({ paymentStatus: 1 });
supplierInvoiceSchema.index({ grn: 1 });
supplierInvoiceSchema.index({ purchaseOrder: 1 });

export default mongoose.model("SupplierInvoice", supplierInvoiceSchema);
