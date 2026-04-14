import mongoose from 'mongoose';

const stockAdjustmentItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productCode: {
    type: String,
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  currentStock: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    default: 0
  },
  totalValue: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String,
    default: ''
  }
});

const stockAdjustmentSchema = new mongoose.Schema({
  adjustmentNo: {
    type: String,
    unique: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  adjustmentType: {
    type: String,
    enum: ['ADD', 'REMOVE'],
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'Opening Stock',
      'Stock Found',
      'Damaged Stock',
      'Expired Stock',
      'Theft/Loss',
      'Manual Correction',
      'Physical Count Adjustment',
      'Other'
    ]
  },
  adjustmentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  items: [stockAdjustmentItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalQuantity: {
    type: Number,
    default: 0
  },
  totalValue: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Draft', 'Completed', 'Cancelled'],
    default: 'Completed'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Generate adjustment number before saving
stockAdjustmentSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.adjustmentNo) {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Find the last adjustment for today
      const lastAdjustment = await this.constructor.findOne({
        adjustmentNo: { $regex: `^ADJ-${year}${month}${day}-` }
      }).sort({ adjustmentNo: -1 });
      
      let sequence = 1;
      if (lastAdjustment && lastAdjustment.adjustmentNo) {
        const lastSequence = parseInt(lastAdjustment.adjustmentNo.split('-').pop());
        sequence = lastSequence + 1;
      }
      
      this.adjustmentNo = `ADJ-${year}${month}${day}-${String(sequence).padStart(3, '0')}`;
    }
    
    // Calculate totals
    if (this.items && this.items.length > 0) {
      this.totalItems = this.items.length;
      this.totalQuantity = this.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      this.totalValue = this.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
      
      // Calculate item total values
      this.items.forEach(item => {
        item.totalValue = (item.quantity || 0) * (item.unitPrice || 0);
      });
    } else {
      this.totalItems = 0;
      this.totalQuantity = 0;
      this.totalValue = 0;
    }
    
    next();
  } catch (error) {
    console.error('Error in StockAdjustment pre-save middleware:', error);
    // Set fallback values to prevent validation errors
    if (!this.adjustmentNo) {
      this.adjustmentNo = `ADJ-${Date.now()}`;
    }
    this.totalItems = this.items?.length || 0;
    this.totalQuantity = this.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
    this.totalValue = this.items?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0) || 0;
    next();
  }
});

// Export schema for multi-database support
export { stockAdjustmentSchema };

export default mongoose.model('StockAdjustment', stockAdjustmentSchema);