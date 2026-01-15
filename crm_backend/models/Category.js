import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
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

// Compound index for unique category names per brand
categorySchema.index({ name: 1, brand: 1 }, { unique: true });

// Add text search index
categorySchema.index({ name: "text", description: "text" });

export default mongoose.model("Category", categorySchema);
