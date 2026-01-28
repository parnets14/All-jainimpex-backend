// models/Supplier.js
import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // GSTIN is optional
          const gstinRegex =
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/;
          return gstinRegex.test(v);
        },
        message: "Please enter a valid GSTIN (e.g., 22ABCDE1234F1Z5)",
      },
    },
    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return /^[0-9]{10}$/.test(v);
        },
        message: "Please enter a valid 10-digit phone number",
      },
    },
    phone2: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true; // Optional
          return /^[0-9]{10}$/.test(v);
        },
        message: "Please enter a valid 10-digit phone number",
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          if (!v) return true; // Optional
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: "Please enter a valid email address",
      },
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    schemeTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchemeType",
      required: true,
    },
    paymentTermId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTerm",
      required: true,
    },
    customPaymentTerm: {
      type: String,
      trim: true,
    },
    creditDays: {
      type: Number,
      default: 30,
      min: 0,
      max: 365,
      required: true
    },
    bankName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    extraDiscounts: [{
      targetType: {
        type: String,
        enum: ['brand', 'category', 'subcategory', 'extendedSubcategory', 'product'],
        required: true
      },
      targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
      },
      targetName: {
        type: String,
        required: true
      },
      discountPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100
      },
      description: {
        type: String,
        trim: true
      },
      isActive: {
        type: Boolean,
        default: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for search functionality
supplierSchema.index({
  name: "text",
  code: "text",
  gstin: "text",
  contactPerson: "text",
  companyName: "text",
});

// Virtual for lastUpdated (using updatedAt timestamp)
supplierSchema.virtual("lastUpdated").get(function () {
  if (!this.updatedAt) return null;
  const date = new Date(this.updatedAt);
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
});

// Virtual for createdDate (using createdAt timestamp)
supplierSchema.virtual("createdDate").get(function () {
  if (!this.createdAt) return null;
  const date = new Date(this.createdAt);
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
});

// Ensure virtual fields are serialized
supplierSchema.set("toJSON", { virtuals: true });

const Supplier = mongoose.model("Supplier", supplierSchema);
export default Supplier;
