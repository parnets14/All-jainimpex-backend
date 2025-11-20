import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dealer",
      required: [true, "Dealer is required"],
      index: true,
    },
    type: {
      type: String,
      required: [true, "Notification type is required"],
      enum: ["order_status", "payment", "credit", "offer", "system"],
      default: "order_status",
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesOrder",
      default: null,
    },
    orderNumber: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      default: null, // Order status if type is order_status
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
notificationSchema.index({ dealer: 1, read: 1, createdAt: -1 });
notificationSchema.index({ dealer: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;










