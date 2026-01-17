import mongoose from "mongoose";

const dealerSchema = new mongoose.Schema(
  {
    // Basic Information
    code: {
      type: String,
      required: [true, "Dealer code is required"],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Dealer name is required"],
      trim: true,
    },
    contactPerson: {
      type: String,
      required: [true, "Contact person is required"],
      trim: true,
    },

    // Contact Information
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    // Google Places location data
    location: {
      formattedAddress: {
        type: String,
        trim: true,
      },
      coordinates: {
        lat: {
          type: Number,
        },
        lng: {
          type: Number,
        },
      },
      placeId: {
        type: String,
        trim: true,
      },
      addressComponents: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
      },
    },
    altAddress: {
      type: String,
      trim: true,
    },

    // Business Information
    dealerType: {
      type: String,
      required: [true, "Dealer type is required"],
      trim: true,
    },
    dealerCategory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DealerCategory",
        required: true,
      },
    ],
    
    // Product Hierarchy Permissions - Brand-first approach
    allowedBrands: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
    }],
    allowedCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    }],
    allowedSubcategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
    }],
    allowedExtendedSubcategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExtendedSubcategory",
    }],
    
    // Legacy field - kept for backward compatibility
    categoryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    // Regional Information
    regionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Region",
      required: [true, "Region is required"],
    },
    salesExecutiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sales executive is required"],
    },

    // Financial Information
    creditLimit: {
      type: Number,
      default: 0,
      min: [0, "Credit limit cannot be negative"],
    },
    creditDays: {
      type: Number,
      default: 0,
      min: [0, "Credit days cannot be negative"],
    },
    salesTarget: {
      type: Number,
      default: 0,
      min: [0, "Sales target cannot be negative"],
    },

    // Legal Information
    gst: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Only validate if GST is provided (not empty)
          return (
            !v ||
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
          );
        },
        message: "Invalid GST number format. Format should be 22AAAAA0000A1Z5",
      },
    },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function (v) {
          // Only validate if PAN is provided (not empty)
          return !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
        },
        message: "Invalid PAN number format. Format should be ABCDE1234F",
      },
    },
    aadhar: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Only validate if Aadhar is provided (not empty)
          return !v || /^[0-9]{12}$/.test(v);
        },
        message: "Invalid Aadhar number format. Must be 12 digits",
      },
    },

    // Profile Image
    image: {
      type: String,
      trim: true,
    },

    // Documents - using Mixed type to avoid casting issues
    panDocument: [mongoose.Schema.Types.Mixed],
    aadharDocument: [mongoose.Schema.Types.Mixed],
    gstDocument: [mongoose.Schema.Types.Mixed],
    documents: [mongoose.Schema.Types.Mixed],

    // Status and Statistics
    isActive: {
      type: Boolean,
      default: true,
    },
    totalOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // System Fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Generate dealer code
dealerSchema.statics.generateDealerCode = async function () {
  try {
    const lastDealer = await this.findOne().sort({ createdAt: -1 });
    if (lastDealer && lastDealer.code) {
      const lastNumber = parseInt(lastDealer.code.replace("DLR", ""));
      return `DLR${String(lastNumber + 1).padStart(4, "0")}`;
    }
    return "DLR1001";
  } catch (error) {
    console.error("Error generating dealer code:", error);
    return `DLR${Date.now().toString().slice(-4)}`;
  }
};

// Index for better search performance
dealerSchema.index({ name: "text", contactPerson: "text", phone: "text" });
dealerSchema.index({ dealerType: 1 });
dealerSchema.index({ regionId: 1 });
dealerSchema.index({ isActive: 1 });
dealerSchema.index({ createdAt: -1 });

export default mongoose.model("Dealer", dealerSchema);
