import mongoose from 'mongoose';

const invoicePrintTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  settings: {
    // Product columns
    showSerialNumber: { type: Boolean, default: true },
    showProductCode: { type: Boolean, default: true },
    showProductName: { type: Boolean, default: true },
    showDescription: { type: Boolean, default: false },
    showHSNCode: { type: Boolean, default: true },
    showCategory: { type: Boolean, default: false },
    showSubcategory: { type: Boolean, default: false },
    showBrand: { type: Boolean, default: false },
    showUnit: { type: Boolean, default: true },
    showAlternateUnit: { type: Boolean, default: false },
    showQuantity: { type: Boolean, default: true },
    showRate: { type: Boolean, default: true },
    showAmount: { type: Boolean, default: true },
    showDiscount: { type: Boolean, default: true },
    showGST: { type: Boolean, default: true },
    showTotal: { type: Boolean, default: true },
    showProductType: { type: Boolean, default: false },
    showSalesType: { type: Boolean, default: false },
    
    // Invoice sections
    showCompanyLogo: { type: Boolean, default: true },
    showCompanyDetails: { type: Boolean, default: true },
    showInvoiceNumber: { type: Boolean, default: true },
    showInvoiceDate: { type: Boolean, default: true },
    showDueDate: { type: Boolean, default: true },
    showCustomerInfo: { type: Boolean, default: true },
    showCustomerGST: { type: Boolean, default: true },
    showBankDetails: { type: Boolean, default: true },
    showTermsAndConditions: { type: Boolean, default: true },
    showSignature: { type: Boolean, default: true },
    showPointsEarned: { type: Boolean, default: true },
    showSchemes: { type: Boolean, default: true },
    
    // Layout options
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    orientation: {
      type: String,
      enum: ['portrait', 'landscape'],
      default: 'portrait'
    },
    showProductImages: { type: Boolean, default: false },
    compactMode: { type: Boolean, default: false }
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isGlobal: {
    type: Boolean,
    default: false // If true, available to all users
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for better performance
invoicePrintTemplateSchema.index({ createdBy: 1 });
invoicePrintTemplateSchema.index({ isGlobal: 1 });
invoicePrintTemplateSchema.index({ isDefault: 1 });

export default mongoose.model('InvoicePrintTemplate', invoicePrintTemplateSchema);
