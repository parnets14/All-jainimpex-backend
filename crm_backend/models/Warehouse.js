import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" }
  },
  contact: {
    phone: { type: String, default: "" },
    email: { type: String, lowercase: true, default: "" },
    managerName: { type: String, required: true }
  },
  capacity: {
    totalArea: { type: Number, default: 0 },
    usedArea: { type: Number, default: 0 },
    unit: { type: String, default: "sq.ft" }
  },
  status: {
    type: String,
    enum: ["active", "inactive", "maintenance"],
    default: "active"
  },
  facilities: [{
    type: String,
    enum: ["cold-storage", "racking", "forklift", "security", "cctv", "fire-safety", "loading-dock"]
  }],
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region",
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
warehouseSchema.index({ code: 1 });
warehouseSchema.index({ region: 1 });
warehouseSchema.index({ status: 1 });
warehouseSchema.index({ "address.city": 1 });
warehouseSchema.index({ "address.state": 1 });

// Virtual for available capacity
warehouseSchema.virtual("availableArea").get(function() {
  return this.capacity.totalArea - this.capacity.usedArea;
});

// Method to check if warehouse has capacity
warehouseSchema.methods.hasCapacity = function(requiredArea) {
  return this.availableArea >= requiredArea;
};

const Warehouse = mongoose.model("Warehouse", warehouseSchema);

export default Warehouse;