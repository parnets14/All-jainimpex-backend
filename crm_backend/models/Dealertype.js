import mongoose from "mongoose";

const dealerTypeSchema = new mongoose.Schema(
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
export { dealerTypeSchema };

export default mongoose.model("Dealertype", dealerTypeSchema);
