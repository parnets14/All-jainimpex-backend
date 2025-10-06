// models/Supplier.js
import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  gstin: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // GSTIN is optional
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/;
        return gstinRegex.test(v);
      },
      message: 'Please enter a valid GSTIN (e.g., 22ABCDE1234F1Z5)'
    }
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{10}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
  },
  phone2: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional
        return /^[0-9]{10}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  schemeTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchemeType',
    required: true
  },
  paymentTermId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentTerm',
    required: true
  },
  customPaymentTerm: {
    type: String,
    trim: true
  },
  bankName: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    trim: true
  },
  ifscCode: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for search functionality
supplierSchema.index({ 
  name: 'text', 
  code: 'text', 
  gstin: 'text', 
  contactPerson: 'text',
  companyName: 'text'
});

// Virtual for lastUpdated (using updatedAt timestamp)
supplierSchema.virtual('lastUpdated').get(function() {
  return this.updatedAt.toISOString().split('T')[0];
});

// Virtual for createdDate (using createdAt timestamp)
supplierSchema.virtual('createdDate').get(function() {
  return this.createdAt.toISOString().split('T')[0];
});

// Ensure virtual fields are serialized
supplierSchema.set('toJSON', { virtuals: true });

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;