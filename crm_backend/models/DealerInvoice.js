import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
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
  discountAmount: {
    type: Number,
    default: 0
  },
  discountPercentage: {
    type: Number,
    default: 0
  },
  appliedDiscounts: [{
    discountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscountMapping"
    },
    discountName: String,
    discountValue: Number,
    discountType: String // "percentage" or "fixed"
  }],
  pointsEarned: {
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

const dealerInvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: String,
  dealerCode: String,
  dealerType: String,
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region"
  },
  regionName: String,
  pinCode: String,
  
  // Customer Information (can be different from dealer)
  customerName: String,
  customerAddress: String,
  customerPhone: String,
  customerEmail: String,
  customerGST: String,
  
  // Sales Order Reference
  salesOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SalesOrder"
  },
  salesOrderNumber: String,
  
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
  items: [invoiceItemSchema],
  
  // Financial Calculations
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  totalDiscount: {
    type: Number,
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
  totalPoints: {
    type: Number,
    default: 0
  },
  
  // Status and Tracking
  status: {
    type: String,
    enum: ["Draft", "Pending", "Approved", "Dispatched", "Delivered", "Cancelled"],
    default: "Draft"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partial", "Paid", "Overdue"],
    default: "Pending"
  },
  paymentDate: Date,
  
  // Dispatch Information
  dispatchDate: Date,
  trackingNumber: String,
  courierName: String,
  
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
dealerInvoiceSchema.pre("save", function(next) {
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

  if (this.totalDiscount === undefined || this.totalDiscount === 0) {
    this.totalDiscount = this.items.reduce((sum, item) => {
      return sum + (item.discountAmount || 0);
    }, 0);
  }

  if (this.totalGst === undefined || this.totalGst === 0) {
    this.totalGst = this.items.reduce((sum, item) => {
      return sum + (item.gstAmount || 0);
    }, 0);
  }

  if (this.totalPoints === undefined || this.totalPoints === 0) {
    this.totalPoints = this.items.reduce((sum, item) => {
      return sum + (item.pointsEarned || 0);
    }, 0);
  }

  // Always calculate totalAmount from the current values
  this.totalAmount = this.subtotal - this.totalDiscount + this.totalGst;

  next();
});

// Pre-save for item calculations
dealerInvoiceSchema.pre("save", function(next) {
  this.items.forEach(item => {
    const baseAmount = item.quantity * item.unitPrice;
    const discountAmount = (baseAmount * item.discountPercentage) / 100;
    const amountAfterDiscount = baseAmount - discountAmount;
    item.gstAmount = (amountAfterDiscount * item.gst) / 100;
    item.totalPrice = amountAfterDiscount + item.gstAmount;
    item.discountAmount = discountAmount;
  });
  next();
});

// Generate invoice number
dealerInvoiceSchema.pre("save", async function(next) {
  if (!this.invoiceNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("DealerInvoice").countDocuments();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

// Update stock when invoice is dispatched
dealerInvoiceSchema.post("save", async function(doc, next) {
  if (doc.status === "Dispatched" && doc.isModified("status")) {
    try {
      const Stock = mongoose.model("Stock");
      
      for (const item of doc.items) {
        // Update stock for the specific warehouse
        await Stock.findOneAndUpdate(
          { 
            productId: item.product,
            warehouseId: item.warehouse
          },
          { 
            $inc: { 
              dispatchedQty: item.quantity,
              netStock: -item.quantity
            }
          }
        );
      }
    } catch (error) {
      console.error("Error updating stock on dispatch:", error);
    }
  }
  
  next();
});

// Index for better query performance
dealerInvoiceSchema.index({ invoiceNumber: 1 });
dealerInvoiceSchema.index({ dealer: 1 });
dealerInvoiceSchema.index({ invoiceDate: -1 });
dealerInvoiceSchema.index({ status: 1 });
dealerInvoiceSchema.index({ paymentStatus: 1 });
dealerInvoiceSchema.index({ salesOrder: 1 });

export default mongoose.model("DealerInvoice", dealerInvoiceSchema);
