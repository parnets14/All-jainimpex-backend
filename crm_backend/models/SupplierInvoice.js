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
  // Purchase discount information for this item
  purchaseDiscount: {
    directDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    directDiscountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    supplierExtraDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    supplierExtraDiscountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    floatingDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    floatingDiscountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalDiscountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    applicableDiscounts: [{
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PurchaseDiscountMapping"
      },
      name: String,
      directDiscountPercentage: Number,
      floatingDiscountEnabled: Boolean,
      floatingDiscountMin: Number,
      floatingDiscountMax: Number
    }]
  },
  // Legacy discount fields for backward compatibility
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  subtotal: {
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
  
  // Purchase Discount Information (new structure)
  totalDirectDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalFloatingDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Purchase discount summary
  purchaseDiscountSummary: {
    directDiscountApplied: {
      type: Boolean,
      default: false
    },
    floatingDiscountApplied: {
      type: Boolean,
      default: false
    },
    totalSavings: {
      type: Number,
      default: 0,
      min: 0
    },
    savingsPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  
  // Legacy Discount Information (for backward compatibility)
  directDiscountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  floatingDiscountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalDiscountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalDiscountAmount: {
    type: Number,
    default: 0,
    min: 0
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

  // Calculate purchase discount amounts (new structure)
  if (this.totalDirectDiscount === undefined) {
    this.totalDirectDiscount = this.items.reduce((sum, item) => {
      return sum + (item.purchaseDiscount?.directDiscountAmount || 0);
    }, 0);
  }

  if (this.totalFloatingDiscount === undefined) {
    this.totalFloatingDiscount = this.items.reduce((sum, item) => {
      return sum + (item.purchaseDiscount?.floatingDiscountAmount || 0);
    }, 0);
  }

  if (this.totalDiscount === undefined) {
    this.totalDiscount = this.totalDirectDiscount + this.totalFloatingDiscount;
  }

  // Update purchase discount summary
  if (this.purchaseDiscountSummary) {
    this.purchaseDiscountSummary.directDiscountApplied = this.totalDirectDiscount > 0;
    this.purchaseDiscountSummary.floatingDiscountApplied = this.totalFloatingDiscount > 0;
    this.purchaseDiscountSummary.totalSavings = this.totalDiscount;
    this.purchaseDiscountSummary.savingsPercentage = this.subtotal > 0 ? ((this.totalDiscount / this.subtotal) * 100) : 0;
  }

  // Legacy discount calculations (for backward compatibility)
  this.totalDiscountPercentage = (this.directDiscountPercentage || 0) + (this.floatingDiscountPercentage || 0);
  this.totalDiscountAmount = Math.max(this.totalDiscount, (this.subtotal * this.totalDiscountPercentage) / 100);

  // Calculate totalAmount: subtotal - discount + GST
  this.totalAmount = this.subtotal - this.totalDiscount + this.totalGst;

  next();
});

// Pre-save for item calculations
supplierInvoiceSchema.pre("save", function(next) {
  this.items.forEach(item => {
    const baseAmount = item.quantity * item.unitPrice;
    
    // Set subtotal for the item
    if (!item.subtotal) {
      item.subtotal = baseAmount;
    }
    
    // Calculate purchase discounts if present
    if (item.purchaseDiscount) {
      const directDiscount = (baseAmount * (item.purchaseDiscount.directDiscountPercentage || 0)) / 100;
      const afterDirectDiscount = baseAmount - directDiscount;
      const floatingDiscount = (afterDirectDiscount * (item.purchaseDiscount.floatingDiscountPercentage || 0)) / 100;
      const totalDiscount = directDiscount + floatingDiscount;
      const afterAllDiscounts = baseAmount - totalDiscount;
      
      // Update purchase discount amounts
      item.purchaseDiscount.directDiscountAmount = directDiscount;
      item.purchaseDiscount.floatingDiscountAmount = floatingDiscount;
      item.purchaseDiscount.totalDiscountAmount = totalDiscount;
      item.purchaseDiscount.totalDiscountPercentage = baseAmount > 0 ? ((totalDiscount / baseAmount) * 100) : 0;
      
      // Update legacy discount fields for backward compatibility
      item.discountAmount = totalDiscount;
      item.discountPercentage = item.purchaseDiscount.totalDiscountPercentage;
      
      // Calculate GST on discounted amount
      item.gstAmount = (afterAllDiscounts * (item.gst || 0)) / 100;
      item.totalPrice = afterAllDiscounts + item.gstAmount;
    } else {
      // No purchase discount - calculate normally
      item.gstAmount = (baseAmount * (item.gst || 0)) / 100;
      item.totalPrice = baseAmount + item.gstAmount;
    }
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

// Export schema for multi-database support
export { supplierInvoiceSchema };

export default mongoose.model("SupplierInvoice", supplierInvoiceSchema);
