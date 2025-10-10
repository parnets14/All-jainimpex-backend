import mongoose from 'mongoose';

const grnSchema = new mongoose.Schema({
  grnNo: {
    type: String,
    required: true,
    unique: true
  },
  poId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  grnDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Draft', 'Received', 'Partially Received', 'Cancelled', 'Completed'],
    default: 'Received'
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    poQuantity: {
      type: Number,
      required: true
    },
    receivedQuantity: {
      type: Number,
      required: true
    },
    damageQuantity: {
      type: Number,
      default: 0
    },
    acceptedQuantity: {
      type: Number,
      required: true
    },
    unitPrice: {
      type: Number,
      required: true
    },
    gst: {
      type: Number,
      required: true
    },
    totalPrice: {
      type: Number,
      required: true
    }
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receivedBy: {
    type: String,
    default: ''
  },
  inspectedBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Auto-generate GRN number - FIXED VERSION
grnSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      // Count GRNs created today
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      
      const count = await mongoose.model('GRN').countDocuments({
        createdAt: {
          $gte: startOfToday,
          $lte: endOfToday
        }
      });
      
      this.grnNo = `GRN-${year}${month}${day}-${String(count + 1).padStart(3, '0')}`;
      console.log('Generated GRN No:', this.grnNo);
    } catch (error) {
      console.error('Error generating GRN number:', error);
      // Fallback: generate based on timestamp
      this.grnNo = `GRN-${Date.now()}`;
    }
  }
  next();
});

export default mongoose.model('GRN', grnSchema);