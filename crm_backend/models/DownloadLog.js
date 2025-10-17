import mongoose from "mongoose";

const downloadLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    reportName: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      required: true,
    },
    reportType: {
      type: String,
      enum: ["EXCEL", "PDF", "CSV", "JSON"],
      default: "EXCEL",
    },
    fileSize: {
      type: Number, // in bytes
      default: 0,
    },
    downloadUrl: {
      type: String,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "SUCCESS",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
downloadLogSchema.index({ user: 1, timestamp: -1 });
downloadLogSchema.index({ module: 1, timestamp: -1 });
downloadLogSchema.index({ username: 1, timestamp: -1 });
downloadLogSchema.index({ reportName: 1, timestamp: -1 });
downloadLogSchema.index({ timestamp: -1 });

const DownloadLog = mongoose.model("DownloadLog", downloadLogSchema);

export default DownloadLog;
