import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  productCode: String,
  productName: String,
  description: String,
  HSNCode: String,
  unit: String,
  alternateUnit: String,
  alternateUnitQuantity: Number,
  category: String,
  subcategory: String,
  brand: String,
  productType: String,
  salesType: String,
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
  // Detailed discount information
  selectedDiscountLevels: [String], // Array of selected level names
  manualDiscountLevels: {
    type: Map,
    of: Number // Map of levelName -> manual percentage
  },
  dealerExtraDiscount: {
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
    discountType: String, // "percentage" or "fixed"
    directDiscountPercentage: Number,
    levels: [{
      levelName: String,
      discountPercentage: Number
    }],
    targetType: String,
    maxDiscountPercentage: Number
  }],
  mrp: {
    type: Number,
    min: 0,
    default: null,
    comment: 'MRP per unit (GST inclusive). When set, used as base for discount calculations instead of unitPrice + GST'
  },
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
    sparse: true, // Allow null for drafts, but unique when set
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
    default: null // Null for drafts, set on approval
  },
  dueDate: Date,
  creditDays: {
    type: Number,
    default: 30
  },
  
  // Draft Status
  isDraft: {
    type: Boolean,
    default: true,
    index: true
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
  paidAmount: {
    type: Number,
    default: 0
  },
  pendingAmount: {
    type: Number,
    default: null // Calculated as totalAmount - paidAmount; null means not yet set
  },
  paymentDate: Date,
  
  // Soft Delete Fields
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  deletionReason: String,
  cancellationReason: String,
  
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
  internalNotes: String,
  
  // Print Settings
  printSettings: {
    type: Object,
    default: {
      // Product columns
      showSerialNumber: true,
      showProductCode: true,
      showProductName: true,
      showDescription: false,
      showHSNCode: true,
      showUnit: true,
      showAlternateUnit: false,
      showCategory: false,
      showSubcategory: false,
      showBrand: false,
      showProductType: false,
      showSalesType: false,
      showQuantity: true,
      showRate: true,
      showAmount: true,
      showDiscount: true,
      showGST: true,
      showTotal: true,
      
      // Invoice sections
      showCompanyLogo: true,
      showCompanyDetails: true,
      showTermsAndConditions: true,
      showBankDetails: true,
      showSignature: true,
      showPointsEarned: true,
      showWarehouse: false,
      
      // Layout options
      fontSize: 'medium', // small, medium, large
      orientation: 'portrait', // portrait, landscape
      showImages: false
    }
  }
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

  // NOTE: Financial totals are calculated AFTER the sequential discount hook below
  // (see the second pre-save hook which handles item calculations and then totals)
  next();
});

// Pre-save for item calculations — Sequential discount on MRP (GST inclusive)
dealerInvoiceSchema.pre("save", function(next) {
  this.items.forEach(item => {
    // Determine MRP per unit (GST inclusive price used as discount base):
    // 1. If item.mrp is explicitly set → use it directly (post-migration: mrp IS the GST-inclusive price)
    // 2. Otherwise → calculate from unitPrice + GST (legacy behavior for pre-migration data)
    const mrpPerUnit = item.mrp && item.mrp > 0
      ? item.mrp
      : item.unitPrice * (1 + (item.gst || 0) / 100);
    const grossAmount = item.quantity * mrpPerUnit; // Total MRP for all units
    
    // Apply discounts SEQUENTIALLY (not flat additive)
    // Order: Direct discount first, then each level discount, then dealer extra
    let currentAmount = grossAmount;
    let totalDiscountAmount = 0;
    
    // 1. Apply direct/base discount percentage
    if (item.discountPercentage && item.discountPercentage > 0) {
      const discAmt = currentAmount * (item.discountPercentage / 100);
      currentAmount -= discAmt;
      totalDiscountAmount += discAmt;
    }
    
    // 2. Apply each level discount sequentially (from appliedDiscounts levels)
    if (item.appliedDiscounts && item.appliedDiscounts.length > 0) {
      for (const discount of item.appliedDiscounts) {
        if (discount.levels && discount.levels.length > 0) {
          for (const level of discount.levels) {
            if (level.discountPercentage && level.discountPercentage > 0) {
              const levelAmt = currentAmount * (level.discountPercentage / 100);
              currentAmount -= levelAmt;
              totalDiscountAmount += levelAmt;
            }
          }
        }
      }
    }
    
    // 3. Apply dealer extra discount (if any)
    if (item.dealerExtraDiscount && item.dealerExtraDiscount > 0) {
      const extraAmt = currentAmount * (item.dealerExtraDiscount / 100);
      currentAmount -= extraAmt;
      totalDiscountAmount += extraAmt;
    }
    
    // Final amount already includes GST (since MRP includes GST)
    item.totalPrice = parseFloat(currentAmount.toFixed(2));
    item.discountAmount = parseFloat(totalDiscountAmount.toFixed(2));
    
    // Reverse-calculate GST amount for tax breakdown display
    // GST portion = finalAmount - finalAmount / (1 + gst/100)
    const gstRate = item.gst || 0;
    if (gstRate > 0) {
      item.gstAmount = parseFloat((currentAmount - currentAmount / (1 + gstRate / 100)).toFixed(2));
    } else {
      item.gstAmount = 0;
    }
  });

  // Calculate invoice-level totals from the processed items
  // subtotal = MRP × qty for all items (GST inclusive)
  this.subtotal = this.items.reduce((sum, item) => {
    const mrpPerUnit = item.mrp && item.mrp > 0 ? item.mrp : item.unitPrice * (1 + (item.gst || 0) / 100);
    return sum + (item.quantity * mrpPerUnit);
  }, 0);

  this.totalDiscount = this.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
  this.totalGst = this.items.reduce((sum, item) => sum + (item.gstAmount || 0), 0);
  this.totalPoints = this.items.reduce((sum, item) => sum + (item.pointsEarned || 0), 0);

  // totalAmount = sum of item totalPrices (MRP after sequential discounts, GST already included)
  this.totalAmount = this.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  next();
});

// Generate invoice number (only for non-draft invoices)
dealerInvoiceSchema.pre("save", async function(next) {
  // Only generate invoice number if:
  // 1. Invoice doesn't have a number yet
  // 2. Invoice is NOT a draft (isDraft = false)
  if (!this.invoiceNumber && !this.isDraft) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("DealerInvoice").countDocuments({ isDraft: false });
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
// Note: invoiceNumber index is defined on the field itself with sparse:true - no duplicate needed
dealerInvoiceSchema.index({ dealer: 1 });
dealerInvoiceSchema.index({ invoiceDate: -1 });
dealerInvoiceSchema.index({ status: 1 });
dealerInvoiceSchema.index({ paymentStatus: 1 });
dealerInvoiceSchema.index({ salesOrder: 1 });

// Export schema for multi-database support
export { dealerInvoiceSchema };

export default mongoose.model("DealerInvoice", dealerInvoiceSchema);
