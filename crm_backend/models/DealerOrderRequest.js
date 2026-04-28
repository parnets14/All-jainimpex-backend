import mongoose from 'mongoose';

const requestProductSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productCode:  { type: String },
  productName:  { type: String },
  HSNCode:      { type: String },
  quantity:     { type: Number, required: true, min: 1 },
  unit:         { type: String },
  dealerPrice:  { type: Number, default: 0 },   // sellingPrice from DealerPricing at request time
  gst:          { type: Number, default: 0 },
  totalPrice:   { type: Number, default: 0 },   // dealerPrice * qty (excl. GST)
  brand:        { type: String },
  category:     { type: String },
  subcategory:  { type: String },
}, { _id: false });

const dealerOrderRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true,
    index: true,
  },
  dealerName:  { type: String },
  dealerCode:  { type: String },
  dealerPhone: { type: String },

  products: [requestProductSchema],

  // Totals (calculated at request time, for reference only)
  grossAmount: { type: Number, default: 0 },
  totalGst:    { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },

  // Dealer note
  notes: { type: String, trim: true },

  // Workflow status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true,
  },

  // Admin actions
  rejectionReason: { type: String, trim: true },
  approvedAt:      { type: Date },
  rejectedAt:      { type: Date },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Linked Sales Orders (set after admin creates SO from this request)
  salesOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
  }],

  requestDate: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Auto-generate request number: DOR-YYYY-NNNN
dealerOrderRequestSchema.statics.generateRequestNumber = async function () {
  const year = new Date().getFullYear();
  const prefix = `DOR-${year}-`;
  const last = await this.findOne({ requestNumber: { $regex: `^${prefix}` } })
    .sort({ requestNumber: -1 });
  let next = 1;
  if (last) {
    const parts = last.requestNumber.split('-');
    next = parseInt(parts[2] || '0') + 1;
  }
  return `${prefix}${next.toString().padStart(4, '0')}`;
};

export { dealerOrderRequestSchema };
export default mongoose.model('DealerOrderRequest', dealerOrderRequestSchema);
