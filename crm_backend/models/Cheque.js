import mongoose from "mongoose";

const chequeSchema = new mongoose.Schema(
  {
    // Basic Cheque Information
    chequeNo: {
      type: String,
      required: [true, "Cheque number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    amount: {
      type: Number,
      required: [true, "Cheque amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    date: {
      type: Date,
      required: [true, "Cheque date is required"],
    },
    
    // Bank Information
    bankName: {
      type: String,
      required: [true, "Bank name is required"],
      trim: true,
    },
    bankBranch: {
      type: String,
      trim: true,
    },
    bankAccountNo: {
      type: String,
      trim: true,
    },
    
    // Dealer Information
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      required: [true, "Dealer is required"],
    },
    
    // Status Information
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: {
        values: ["Not Deposited", "Deposited", "Cleared", "Bounced"],
        message: "Status must be one of: Not Deposited, Deposited, Cleared, Bounced",
      },
      default: "Not Deposited",
    },
    
    // Additional Information
    remarks: {
      type: String,
      trim: true,
    },
    
    // Deposit Information
    depositDate: {
      type: Date,
    },
    clearingDate: {
      type: Date,
    },
    bounceDate: {
      type: Date,
    },
    bounceReason: {
      type: String,
      trim: true,
    },
    
    // System Fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    
    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Generate cheque number
chequeSchema.statics.generateChequeNumber = async function () {
  try {
    const lastCheque = await this.findOne().sort({ createdAt: -1 });
    if (lastCheque && lastCheque.chequeNo) {
      const lastNumber = parseInt(lastCheque.chequeNo.replace("CHQ", ""));
      return `CHQ${String(lastNumber + 1).padStart(6, "0")}`;
    }
    return "CHQ000001";
  } catch (error) {
    console.error("Error generating cheque number:", error);
    return `CHQ${Date.now().toString().slice(-6)}`;
  }
};

// Virtual for dealer information
chequeSchema.virtual("dealerInfo", {
  ref: "Dealer",
  localField: "dealerId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for status color
chequeSchema.virtual("statusColor").get(function () {
  const statusColors = {
    "Not Deposited": "blue",
    "Deposited": "yellow",
    "Cleared": "green",
    "Bounced": "red",
  };
  return statusColors[this.status] || "gray";
});

// Virtual for formatted amount
chequeSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(this.amount);
});

// Indexes for better performance
chequeSchema.index({ chequeNo: 1 });
chequeSchema.index({ dealerId: 1 });
chequeSchema.index({ status: 1 });
chequeSchema.index({ date: -1 });
chequeSchema.index({ amount: -1 });
chequeSchema.index({ bankName: "text" });
chequeSchema.index({ isDeleted: 1 });
chequeSchema.index({ createdAt: -1 });

// Ensure virtual fields are serialized
chequeSchema.set("toJSON", { virtuals: true });
chequeSchema.set("toObject", { virtuals: true });

// Pre-save middleware to update status dates
chequeSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    const now = new Date();
    switch (this.status) {
      case "Deposited":
        this.depositDate = now;
        break;
      case "Cleared":
        this.clearingDate = now;
        break;
      case "Bounced":
        this.bounceDate = now;
        break;
    }
  }
  next();
});

// Static method to get cheque statistics
chequeSchema.statics.getStats = async function (filters = {}) {
  try {
    const matchStage = { isDeleted: false };
    
    // Apply filters
    if (filters.dealerId) {
      matchStage.dealerId = new mongoose.Types.ObjectId(filters.dealerId);
    }
    if (filters.status) {
      matchStage.status = filters.status;
    }
    if (filters.startDate && filters.endDate) {
      matchStage.date = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate),
      };
    }

    const stats = await this.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          clearedCount: {
            $sum: { $cond: [{ $eq: ["$status", "Cleared"] }, 1, 0] },
          },
          clearedAmount: {
            $sum: { $cond: [{ $eq: ["$status", "Cleared"] }, "$amount", 0] },
          },
          pendingCount: {
            $sum: {
              $cond: [
                { $in: ["$status", ["Not Deposited", "Deposited"]] },
                1,
                0,
              ],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [
                { $in: ["$status", ["Not Deposited", "Deposited"]] },
                "$amount",
                0,
              ],
            },
          },
          bouncedCount: {
            $sum: { $cond: [{ $eq: ["$status", "Bounced"] }, 1, 0] },
          },
          bouncedAmount: {
            $sum: { $cond: [{ $eq: ["$status", "Bounced"] }, "$amount", 0] },
          },
        },
      },
    ]);

    return stats[0] || {
      totalCount: 0,
      totalAmount: 0,
      clearedCount: 0,
      clearedAmount: 0,
      pendingCount: 0,
      pendingAmount: 0,
      bouncedCount: 0,
      bouncedAmount: 0,
    };
  } catch (error) {
    console.error("Error getting cheque stats:", error);
    throw error;
  }
};

export default mongoose.model("Cheque", chequeSchema);




