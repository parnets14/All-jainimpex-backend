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
  dealerPrice:  { type: Number, default: 0 },   // base sellingPrice from DealerPricing
  gst:          { type: Number, default: 0 },
  totalPrice:   { type: Number, default: 0 },   // dealerPrice * qty (excl. GST, before discount)
  brand:        { type: String },
  category:     { type: String },
  subcategory:  { type: String },

  // ── Discount fields ──────────────────────────────────────────────────────
  discountMappingId:       { type: mongoose.Schema.Types.ObjectId, ref: 'DiscountMapping', default: null },
  discountMappingName:     { type: String, default: '' },
  directDiscountPct:       { type: Number, default: 0 },   // auto-applied, not limited by max
  selectedDiscountLevels:  [{ type: String }],             // level names chosen by SE
  manualDiscountLevels:    { type: mongoose.Schema.Types.Mixed, default: {} }, // { levelName: enteredPct }
  levelDiscountPct:        { type: Number, default: 0 },   // sum of selected level %s
  dealerExtraDiscountPct:  { type: Number, default: 0 },   // from dealer.extraDiscounts
  totalDiscountPct:        { type: Number, default: 0 },   // direct + level + extra
  discountAmount:          { type: Number, default: 0 },   // ₹ discount on this line
  finalPrice:              { type: Number, default: 0 },   // after discount, before GST
  gstAmount:               { type: Number, default: 0 },   // GST on finalPrice
  lineTotal:               { type: Number, default: 0 },   // finalPrice + gstAmount

  // Warehouse
  warehouseId:   { type: String, default: '' },
  warehouseName: { type: String, default: '' },
  isOutOfStock:  { type: Boolean, default: false },
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
  grossAmount:         { type: Number, default: 0 },
  totalDiscount:       { type: Number, default: 0 },   // total ₹ discount across all products
  totalGst:            { type: Number, default: 0 },
  totalAmount:         { type: Number, default: 0 },   // after discount + GST

  // Dealer note
  notes: { type: String, trim: true },

  // Workflow status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true,
  },

  // Source: which app submitted this request
  source: {
    type: String,
    enum: ['Dealer', 'SE'],   // SE = Sales Executive App
    default: 'Dealer',
    index: true,
  },

  // Sales Executive who submitted (only for source: 'SE')
  salesExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  salesExecutiveName: { type: String, default: null },

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

// Auto-generate request number: DOR-YYYY-NNNN (dealer) or SER-YYYY-NNNN (SE)
dealerOrderRequestSchema.statics.generateRequestNumber = async function (source = 'Dealer') {
  const year   = new Date().getFullYear();
  const prefix = source === 'SE' ? `SER-${year}-` : `DOR-${year}-`;
  const last   = await this.findOne({ requestNumber: { $regex: `^${prefix}` } })
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
