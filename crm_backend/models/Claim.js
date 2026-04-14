import mongoose from "mongoose";

const claimSchema = new mongoose.Schema({
  type: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ClaimType",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  approvedAmount: {
    type: Number,
    default: 0,
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
    enum: ["pending", "approved", "rejected", "partially_approved"],
    default: "pending",
  },
  remarks: {
    type: String,
    trim: true,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  approvalDate: {
    type: Date,
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid"],
    default: "unpaid",
  },
  transactionNo: {
    type: String,
    trim: true,
  },
  paymentRemarks: {
    type: String,
    trim: true,
  },
  paymentDate: {
    type: Date,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, {
  timestamps: true,
});

claimSchema.index({ status: 1 });
claimSchema.index({ paymentStatus: 1 });
claimSchema.index({ createdAt: -1 });

// Export schema for multi-database support
export { claimSchema };

export default mongoose.model("Claim", claimSchema);