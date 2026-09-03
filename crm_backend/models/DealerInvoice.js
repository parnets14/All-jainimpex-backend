import mongoose from "mongoose";
import {
  calculateDiscountLine,
  calculateOneTimeInvoicePriceIncrease
} from "../utils/sequentialDiscountPolicy.js";

const invoiceItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  sourceSalesOrderLineId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
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
  promisedEffectiveDiscountPercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  requiredSequentialStageRatePercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  // Immutable reference copied from the linked Sales Order line. Unlike the
  // live required stage above, invoice-level discounts do not recalculate it.
  sourceSalesOrderRequiredSequentialStageRatePercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  effectiveDiscountPercentage: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  masterDiscountCapApplied: {
    type: Boolean,
    default: false
  },
  combinedLevelDiscountCapApplied: {
    type: Boolean,
    default: false
  },
  levelDiscountTotalPercentage: {
    type: Number,
    default: 0,
    min: 0
  },
  discountFamilyKey: {
    type: String,
    default: null,
    trim: true
  },
  discountPolicySnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  discountPermissionSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
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
    maxDiscountPercentage: Number,
    masterDiscountCap: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },
    combinedLevelDiscountCap: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    }
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
  // Exceptional invoice-only increase applied after all discount stages.
  // Discount amount/effective percentage remain the pre-increase authority.
  priceBeforeIncrease: {
    type: Number,
    default: 0,
    min: 0
  },
  oneTimePriceIncreasePercentage: {
    type: Number,
    default: 0,
    min: 0
  },
  oneTimePriceIncreaseAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  oneTimePriceIncreaseAboveMrpOverride: {
    type: Boolean,
    default: false
  },
  oneTimePriceIncreaseReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500
  },
  oneTimePriceIncreaseAppliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  oneTimePriceIncreaseAppliedAt: {
    type: Date,
    default: null
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
  totalIncrease: {
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

// Pre-save for item calculations — Sequential discount on MRP (GST inclusive).
// Status/payment-only saves must never rewrite historical invoice amounts.
dealerInvoiceSchema.pre("save", function(next) {
  if (!this.isNew && !this.isModified("items")) return next();

  try {
    this.items.forEach(item => {
      const mrpPerUnit = item.mrp && item.mrp > 0
        ? item.mrp
        : item.unitPrice * (1 + (item.gst || 0) / 100);
      const grossAmount = item.quantity * mrpPerUnit;
      const appliedDiscount = item.appliedDiscounts?.[0];
      const policySnapshot = item.discountPolicySnapshot || {};
      const permissionSnapshot = item.discountPermissionSnapshot || {};
      const persistedOrderedStages = policySnapshot.orderedStages;
      const hasPersistedDiscountSignal = Number(item.discountAmount || 0) > 0
        || Number(item.discountPercentage || 0) > 0
        || Number(item.dealerExtraDiscount || 0) > 0
        || Number(appliedDiscount?.directDiscountPercentage || 0) > 0
        || (item.selectedDiscountLevels || []).length > 0;

      if ((!Array.isArray(persistedOrderedStages) || persistedOrderedStages.length === 0)
          && hasPersistedDiscountSignal) {
        const error = new Error(
          `Invoice line ${item.productName || item.product} has a discount but no ordered policy snapshot. Reprice the source Sales Order or invoice line before saving.`
        );
        error.name = "DiscountPolicyError";
        error.code = "REPRICE_DISCOUNTS_REQUIRED";
        throw error;
      }

      const stages = (persistedOrderedStages || []).map(stage => ({
        key: stage.key,
        kind: stage.kind,
        levelName: stage.levelName || null,
        ratePercentage: Number(stage.ratePercentage || 0)
      }));
      const masterDiscountCap = policySnapshot.masterDiscountCap
        ?? appliedDiscount?.masterDiscountCap
        ?? null;
      const combinedLevelDiscountCap = policySnapshot.combinedLevelDiscountCap
        ?? appliedDiscount?.combinedLevelDiscountCap
        ?? appliedDiscount?.maxDiscountPercentage
        ?? null;
      const calculation = calculateDiscountLine({
        baseAmount: grossAmount,
        stages,
        gstPercentage: item.gst || 0,
        promisedEffectiveDiscountPercentage: item.promisedEffectiveDiscountPercentage,
        masterDiscountCap,
        combinedLevelDiscountCap,
        allowedDiscountLevels: permissionSnapshot.allowedDiscountLevels || [],
        enforceLevelPermissions: permissionSnapshot.enforceLevelPermissions === true,
        bypassLevelPermission: permissionSnapshot.bypassLevelPermission === true
      });

      const requestedAboveMrpOverride = item.oneTimePriceIncreaseAboveMrpOverride === true;
      const maximumFinalAmount = requestedAboveMrpOverride ? null : grossAmount;
      const priceIncrease = calculateOneTimeInvoicePriceIncrease({
        priceBeforeIncrease: calculation.finalAmount,
        increasePercentage: item.oneTimePriceIncreasePercentage || 0,
        gstPercentage: item.gst || 0,
        maximumFinalAmount
      });
      if (priceIncrease.oneTimePriceIncreasePercentage > 0
          && !String(item.oneTimePriceIncreaseReason || '').trim()) {
        const error = new Error(
          `Invoice line ${item.productName || item.product} requires a reason for its one-time price increase.`
        );
        error.name = "DiscountPolicyError";
        error.code = "ONE_TIME_PRICE_INCREASE_REASON_REQUIRED";
        throw error;
      }

      const exceedsMrp = priceIncrease.oneTimePriceIncreasePercentage > 0
        && priceIncrease.finalAmount > Number(grossAmount.toFixed(2));
      const effectiveAboveMrpOverride = requestedAboveMrpOverride && exceedsMrp;
      if (effectiveAboveMrpOverride
          && (!item.oneTimePriceIncreaseAppliedBy || !item.oneTimePriceIncreaseAppliedAt)) {
        const error = new Error(
          `Invoice line ${item.productName || item.product} requires an authenticated actor and timestamp for its above-MRP override.`
        );
        error.name = "DiscountPolicyError";
        error.code = "MRP_OVERRIDE_AUDIT_REQUIRED";
        throw error;
      }

      item.priceBeforeIncrease = priceIncrease.priceBeforeIncrease;
      item.oneTimePriceIncreasePercentage = priceIncrease.oneTimePriceIncreasePercentage;
      item.oneTimePriceIncreaseAmount = priceIncrease.oneTimePriceIncreaseAmount;
      item.oneTimePriceIncreaseAboveMrpOverride = effectiveAboveMrpOverride;
      item.totalPrice = priceIncrease.finalAmount;
      item.discountAmount = calculation.discountAmount;
      item.gstAmount = priceIncrease.gstAmount;
      item.effectiveDiscountPercentage = calculation.effectiveDiscountPercentage;
      item.requiredSequentialStageRatePercentage = calculation.requiredSequentialStageRatePercentage;
      item.masterDiscountCapApplied = calculation.masterDiscountCapApplied;
      item.combinedLevelDiscountCapApplied = calculation.combinedLevelDiscountCapApplied;
      item.levelDiscountTotalPercentage = calculation.levelDiscountTotalPercentage;
    });

    this.subtotal = this.items.reduce((sum, item) => {
      const mrpPerUnit = item.mrp && item.mrp > 0
        ? item.mrp
        : item.unitPrice * (1 + (item.gst || 0) / 100);
      return sum + item.quantity * mrpPerUnit;
    }, 0);
    this.totalDiscount = this.items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
    this.totalIncrease = this.items.reduce(
      (sum, item) => sum + (item.oneTimePriceIncreaseAmount || 0),
      0
    );
    this.totalGst = this.items.reduce((sum, item) => sum + (item.gstAmount || 0), 0);
    this.totalPoints = this.items.reduce((sum, item) => sum + (item.pointsEarned || 0), 0);
    this.totalAmount = this.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    next();
  } catch (error) {
    next(error);
  }
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
dealerInvoiceSchema.index({ dealer: 1, status: 1, salesOrder: 1 });
dealerInvoiceSchema.index({ invoiceDate: -1 });
dealerInvoiceSchema.index({ status: 1 });
dealerInvoiceSchema.index({ paymentStatus: 1 });
dealerInvoiceSchema.index({ salesOrder: 1 });

// Export schema for multi-database support
export { dealerInvoiceSchema };

export default mongoose.model("DealerInvoice", dealerInvoiceSchema);
