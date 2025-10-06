import mongoose from "mongoose";

const pointsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["purchase", "sale"],
    required: true
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subcategory",
    required: true
  },
  calculationType: {
    type: String,
    enum: ["amount", "units"],
    required: true
  },
  inputValue: {
    type: Number,
    required: true,
    min: 0
  },
  points: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
pointsSchema.index({ type: 1, date: -1 });
pointsSchema.index({ brand: 1, category: 1, subcategory: 1 });

const Points = mongoose.model("Points", pointsSchema);
export default Points;