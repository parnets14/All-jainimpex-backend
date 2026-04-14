import mongoose from "mongoose";

const expenseTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, {
  timestamps: true,
});

expenseTypeSchema.index({ name: 1 }, { unique: true });

// Export schema for multi-database support
export { expenseTypeSchema };

export default mongoose.model("ExpenseType", expenseTypeSchema);