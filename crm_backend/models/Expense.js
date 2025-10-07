import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  type: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ExpenseType",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  person: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  document: {
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "approved",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, {
  timestamps: true,
});

expenseSchema.index({ date: -1 });
expenseSchema.index({ type: 1 });
expenseSchema.index({ status: 1 });

export default mongoose.model("Expense", expenseSchema);