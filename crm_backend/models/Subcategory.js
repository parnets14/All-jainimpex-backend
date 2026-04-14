import mongoose from "mongoose";

const subcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Subcategory name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: [true, "Brand is required"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
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

// Compound index for unique subcategory names per category
subcategorySchema.index({ name: 1, category: 1 }, { unique: true });

// Add text search index
subcategorySchema.index({ name: "text", description: "text" });

// Index for brand-based filtering
subcategorySchema.index({ brand: 1 });

// Export schema for multi-database support
export { subcategorySchema };

export default mongoose.model("Subcategory", subcategorySchema);
