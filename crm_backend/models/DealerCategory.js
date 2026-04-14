import mongoose from "mongoose";

const dealerCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Export schema for multi-database support
export { dealerCategorySchema };

export default mongoose.model("DealerCategory", dealerCategorySchema);
