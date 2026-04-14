import mongoose from "mongoose";

const pointsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["purchase", "sale"],
    required: true
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
  calculationType: {
    type: String,
    enum: ["amount", "units"],
    required: true
  },
  inputValue: {
    type: Number,
    required: true,
    min: 0
  },
  // Benefit type and values
  benefitType: {
    type: String,
    enum: ["points", "extraQuantity", "discount", "cashback"],
    default: "points"
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  extraQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  cashbackAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Validity period for purchase schemes
  validFrom: {
    type: Date,
    default: Date.now
  },
  validTo: {
    type: Date,
    default: function() {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1); // Default 1 year validity
      return date;
    }
  },
  // Auto-apply settings
  autoApplyGRN: {
    type: Boolean,
    default: false
  },
  autoApplySupplierInvoice: {
    type: Boolean,
    default: false
  },
  // Description
  description: {
    type: String,
    default: ""
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

// Index for efficient querying
pointsSchema.index({ type: 1, date: -1 });
pointsSchema.index({ brand: 1, category: 1, subcategory: 1 });

const Points = mongoose.model("Points", pointsSchema);

// Export schema for multi-database support
export { pointsSchema };

export default Points;