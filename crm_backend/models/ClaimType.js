import mongoose from "mongoose";

const claimTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    // NOTE: unique is enforced per-company via the index below, not globally
  },
  description: {
    type: String,
    trim: true,
  },
  maxAmount: {
    type: Number,
    default: null,
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

// Per-connection unique index (each company DB gets its own index)
claimTypeSchema.index({ name: 1 }, { unique: true });

// Export schema for multi-database support
export { claimTypeSchema };

export default mongoose.model("ClaimType", claimTypeSchema);