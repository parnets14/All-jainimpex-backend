import mongoose from "mongoose";

const discountLevelSchema = new mongoose.Schema({
  level: {
    type: String,
    required: true,
    trim: true
  },
  discountPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  }
});

const discountMappingSchema = new mongoose.Schema({
  mappingType: {
    type: String,
    required: true,
    enum: ["sales", "purchase"],
    default: "sales"
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subcategory",
    required: true
  },
  levels: [discountLevelSchema],
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validTo: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ["Pending Approval", "Approved", "Rejected"],
    default: "Pending Approval"
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedDate: {
    type: Date
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for better query performance
discountMappingSchema.index({ mappingType: 1, status: 1 });
discountMappingSchema.index({ brand: 1, category: 1, subcategory: 1 });
discountMappingSchema.index({ validFrom: 1, validTo: 1 });

// Virtual for checking if discount is currently active
discountMappingSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'Approved' && 
         this.validFrom <= now && 
         this.validTo >= now;
});

export default mongoose.model("DiscountMapping", discountMappingSchema);