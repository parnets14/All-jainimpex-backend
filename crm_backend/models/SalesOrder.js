import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
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
  warehouseName: String,
  // Discount fields
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
  discountType: {
    type: String,
    enum: ['direct', 'level_based', 'both'],
    default: null
  },
  selectedDiscountLevel: {
    type: Number,
    default: null
  },
  // SE order: level names chosen by the sales executive (e.g. ["Executive Discount"])
  selectedDiscountLevels: {
    type: [String],
    default: [],
  },
  // SE order: manual percentages given by SE per level (e.g. { "Executive Discount": 3 })
  manualDiscountLevels: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Applied discount information
  appliedDiscount: {
    discountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscountMapping"
    },
    discountName: String,
    discountType: String,
    targetType: String,
    selectedLevel: Number
  },
  // Stock arrival tracking fields
  stockStatus: {
    type: String,
    enum: ['waiting', 'partial', 'available', 'unknown'],
    default: 'unknown'
  },
  availableQuantity: {
    type: Number,
    default: 0
  },
  stockArrivedAt: {
    type: Date,
    default: null
  },
  stockCheckedAt: {
    type: Date,
    default: null
  }
});

const salesOrderSchema = new mongoose.Schema({
  orderNumber: {
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
  pinCode: String,
  // Delivery address fields (can be corrected/updated)
  deliveryAddress: String,
  deliveryCity: String,
  deliveryArea: String,
  deliveryPinCode: String,
  deliveryLatitude: Number,
  deliveryLongitude: Number,
  products: [productSchema],
  orderDate: {
    type: Date,
    required: true
  },
  deliveryDate: Date,
  creditDays: {
    type: Number,
    default: 30
  },
  salesType: {
    type: String,
    enum: ['Regular Sale', 'CD Sales'],
    required: true
  },
  creditDaysApplied: {
    type: Number,
    default: 0
  },
  dueDate: Date,
  grossAmount: {
    type: Number,
    required: true
  },
  totalGst: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
        status: {
          type: String,
          enum: ["Pending", "Confirmed", "Processing", "In Transit", "Delivered", "Cancelled", "Rejected", "Rescheduled", "Missing", "Expired"],
          default: "Pending"
        },
  type: {
    type: String,
    enum: ["Retail Sales Order", "Wholesale Sales Order", "Enterprise Sales Order", "Reseller Sales Order", "Independent Sales Order"],
    required: true
  },
  remarks: String,
  paymentDate: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Out-of-stock order fields
  isOutOfStock: {
    type: Boolean,
    default: false
  },
  stockAvailable: {
    type: Boolean,
    default: false
  },
  stockAvailableNotifiedAt: {
    type: Date,
    default: null
  },
  stockValidation: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    },
    productName: String,
    availableStock: {
      type: Number,
      default: 0
    },
    requestedQuantity: {
      type: Number,
      required: true
    },
    hasStock: {
      type: Boolean,
      default: true
    },
    shortfall: {
      type: Number,
      default: 0
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse"
    },
    warehouseName: String
  }],
  // Expiry/Deadline fields for pending orders
  expiryDate: {
    type: Date,
    default: null
  },
  expiryReason: {
    type: String,
    default: null
  },
  isExpired: {
    type: Boolean,
    default: false
  },
  expiredAt: {
    type: Date,
    default: null
  },
  expiryExtendedCount: {
    type: Number,
    default: 0
  },
  expiryHistory: [{
    action: {
      type: String,
      enum: ['set', 'extended', 'expired', 'cancelled'],
      required: true
    },
    previousDate: Date,
    newDate: Date,
    reason: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    performedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Credit Overlimit tracking
  creditOverlimit: {
    isOverlimit: {
      type: Boolean,
      default: false
    },
    creditLimit: Number,
    currentOutstanding: Number,
    orderAmount: Number,
    newOutstanding: Number,
    overlimitAmount: Number,
    requiresApproval: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    approvedAt: Date,
    approvalNotes: String
  },
  // Partial dispatch deviations
  deviations: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    originalQty: Number,
    dispatchedQty: Number,
    reducedQty: Number,
    reason: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    newOrderCreated: { type: Boolean, default: false },
    newOrderNumber: String
  }],

  // Order-level stock status summary
  orderStockStatus: {
    totalProducts: {
      type: Number,
      default: 0
    },
    availableProducts: {
      type: Number,
      default: 0
    },
    partialProducts: {
      type: Number,
      default: 0
    },
    waitingProducts: {
      type: Number,
      default: 0
    },
    overallStatus: {
      type: String,
      enum: ['ready', 'partial', 'waiting', 'unknown'],
      default: 'unknown'
    },
    lastChecked: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate product amounts first, then order totals
salesOrderSchema.pre("save", function(next) {
  // STEP 1: Calculate product-level amounts first
  // IMPORTANT: Respect existing discountAmount on each product
  this.products.forEach(product => {
    const baseAmount = product.quantity * product.unitPrice;
    const discAmt = product.discountAmount || 0;
    const discountedBase = baseAmount - discAmt;
    product.gstAmount = (discountedBase * product.gst) / 100;
    product.totalPrice = discountedBase + product.gstAmount;
  });

  // STEP 2: Calculate due date
  if (this.orderDate && this.creditDays) {
    const dueDate = new Date(this.orderDate);
    dueDate.setDate(dueDate.getDate() + this.creditDays);
    this.dueDate = dueDate;
  }

  // STEP 3: Calculate order-level amounts using updated product amounts
  this.grossAmount = this.products.reduce((sum, product) => {
    return sum + (product.quantity * product.unitPrice);
  }, 0);

  this.totalGst = this.products.reduce((sum, product) => {
    return sum + product.gstAmount;
  }, 0);

  // Order-level discountAmount = sum of all product discounts
  this.discountAmount = this.products.reduce((sum, product) => {
    return sum + (product.discountAmount || 0);
  }, 0);

  this.totalAmount = this.grossAmount + this.totalGst - this.discountAmount;

  next();
});

// Generate order number
salesOrderSchema.pre("save", async function(next) {
  if (!this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("SalesOrder").countDocuments();
    this.orderNumber = `SO-${year}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

// Update stock when order is confirmed
salesOrderSchema.post("save", async function(doc, next) {
  if (doc.status === "Confirmed" && doc.isModified("status")) {
    try {
      const Stock = mongoose.model("Stock");
      
      for (const product of doc.products) {
        // Update stock for the specific warehouse
        await Stock.findOneAndUpdate(
          { 
            productId: product.product,
            warehouseId: product.warehouse
          },
          { 
            $inc: { 
              blockedQty: product.quantity,
              netStock: -product.quantity
            }
          }
        );
        
        // Also update total product stock
        const Product = mongoose.model("Product");
        await Product.findByIdAndUpdate(
          product.product,
          { $inc: { stock: -product.quantity } }
        );
      }
    } catch (error) {
      console.error("Error updating stock:", error);
    }
  }
  
  // NOTE: Stock restoration for cancelled/rejected orders is handled in the controller
  // (updateSalesOrderStatus and updateSalesOrder functions) because isModified() 
  // doesn't work reliably in post('save') hooks
  
  next();
});

// Export schema for multi-database support
export { salesOrderSchema };

export default mongoose.model("SalesOrder", salesOrderSchema);