import mongoose from "mongoose";

// Audit log of edits made from the Price List screen
// (product name, internal rate, MRP). Stored per-company.
const productPriceListHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productCode: String,
    productName: String,
    field: {
      type: String,
      enum: ["itemName", "internalRate", "mrp"],
      required: true,
    },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    changedByName: String,
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

productPriceListHistorySchema.index({ product: 1, changedAt: -1 });

// Export schema for multi-database support
export { productPriceListHistorySchema };

export default mongoose.model(
  "ProductPriceListHistory",
  productPriceListHistorySchema
);
