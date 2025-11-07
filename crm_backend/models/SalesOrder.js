import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  productCode: String,
  productName: String,
  HSNCode: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  gst: {
    type: Number,
    default: 0
  },
  gstAmount: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    required: true
  },
  warehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Warehouse"
  },
  warehouseName: String
});

const salesOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    required: true
  },
  dealerName: String,
  dealerCode: String,
  dealerType: String,
  region: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region"
  },
  pinCode: String,
  products: [productSchema],
  orderDate: {
    type: Date,
    required: true
  },
  deliveryDate: Date,
  creditDays: {
    type: Number,
    default: 30
  },
  dueDate: Date,
  grossAmount: {
    type: Number,
    required: true
  },
  totalGst: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["Pending", "Confirmed", "Processing", "Delivered", "Cancelled", "Rejected"],
    default: "Pending"
  },
  type: {
    type: String,
    enum: ["Retail Sales Order", "Wholesale Sales Order", "Enterprise Sales Order", "Reseller Sales Order", "Independent Sales Order"],
    required: true
  },
  remarks: String,
  paymentDate: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate dates and amounts
salesOrderSchema.pre("save", function(next) {
  // Calculate due date
  if (this.orderDate && this.creditDays) {
    const dueDate = new Date(this.orderDate);
    dueDate.setDate(dueDate.getDate() + this.creditDays);
    this.dueDate = dueDate;
  }

  // Calculate amounts
  this.grossAmount = this.products.reduce((sum, product) => {
    return sum + (product.quantity * product.unitPrice);
  }, 0);

  this.totalGst = this.products.reduce((sum, product) => {
    return sum + product.gstAmount;
  }, 0);

  this.totalAmount = this.grossAmount + this.totalGst - this.discountAmount;

  next();
});

// Pre-save for product calculations
salesOrderSchema.pre("save", function(next) {
  this.products.forEach(product => {
    const baseAmount = product.quantity * product.unitPrice;
    product.gstAmount = (baseAmount * product.gst) / 100;
    product.totalPrice = baseAmount + product.gstAmount;
  });
  next();
});

// Generate order number
salesOrderSchema.pre("save", async function(next) {
  if (!this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("SalesOrder").countDocuments();
    this.orderNumber = `SO-${year}-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

// Update stock when order is confirmed
salesOrderSchema.post("save", async function(doc, next) {
  if (doc.status === "Confirmed" && doc.isModified("status")) {
    try {
      const Stock = mongoose.model("Stock");
      
      for (const product of doc.products) {
        // Update stock for the specific warehouse
        await Stock.findOneAndUpdate(
          { 
            productId: product.product,
            warehouseId: product.warehouse
          },
          { 
            $inc: { 
              blockedQty: product.quantity,
              netStock: -product.quantity
            }
          }
        );
        
        // Also update total product stock
        const Product = mongoose.model("Product");
        await Product.findByIdAndUpdate(
          product.product,
          { $inc: { stock: -product.quantity } }
        );
      }
    } catch (error) {
      console.error("Error updating stock:", error);
    }
  }
  
  // Restore stock if order is cancelled or rejected
  if ((doc.status === "Cancelled" || doc.status === "Rejected") && doc.isModified("status")) {
    try {
      const Stock = mongoose.model("Stock");
      const Product = mongoose.model("Product");
      
      for (const product of doc.products) {
        // Restore stock in warehouse
        await Stock.findOneAndUpdate(
          { 
            productId: product.product,
            warehouseId: product.warehouse
          },
          { 
            $inc: { 
              blockedQty: -product.quantity,
              netStock: product.quantity
            }
          }
        );
        
        // Restore total product stock
        await Product.findByIdAndUpdate(
          product.product,
          { $inc: { stock: product.quantity } }
        );
      }
    } catch (error) {
      console.error("Error restoring stock:", error);
    }
  }
  
  next();
});

export default mongoose.model("SalesOrder", salesOrderSchema);