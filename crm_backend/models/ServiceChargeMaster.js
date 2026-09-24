import mongoose from "mongoose";

const serviceChargeMasterSchema = new mongoose.Schema({
  chargeName: {
    type: String,
    required: true,
    trim: true,
    // Will be auto-capitalized in pre-save hook
  },
  description: {
    type: String,
    default: "",
    trim: true
  },
  sacCode: {
    type: String,
    default: "",
    trim: true,
    validate: {
      validator: function(v) {
        // SAC code should be 6 digits starting with 99 (if provided)
        return !v || /^99\d{4}$/.test(v);
      },
      message: 'SAC code must be 6 digits starting with 99 (e.g., 996511)'
    }
  },
  taxApplicable: {
    type: Boolean,
    default: false
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    validate: {
      validator: function(v) {
        // If tax applicable, rate must be > 0
        if (this.taxApplicable && v === 0) {
          return false;
        }
        return true;
      },
      message: 'Tax rate must be greater than 0 when tax is applicable'
    }
  },
  // Link to Account Master for ledger posting
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AccountMaster",
    default: null
  },
  accountName: {
    type: String,
    default: ""
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Auto-capitalize charge name
serviceChargeMasterSchema.pre("save", function(next) {
  if (this.chargeName) {
    // Capitalize first letter of each word
    this.chargeName = this.chargeName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // If tax not applicable, ensure tax rate is 0
  if (!this.taxApplicable) {
    this.taxRate = 0;
  }
  
  next();
});

// Index for faster queries
serviceChargeMasterSchema.index({ chargeName: 1 });
serviceChargeMasterSchema.index({ isActive: 1 });

export { serviceChargeMasterSchema };
export default mongoose.model("ServiceChargeMaster", serviceChargeMasterSchema);
