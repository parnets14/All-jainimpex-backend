import mongoose from 'mongoose';

const fixedAssetSchema = new mongoose.Schema({
  assetName: {
    type: String,
    required: true,
    trim: true
  },
  assetCode: {
    type: String,
    unique: true,
    trim: true
  },
  assetCategory: {
    type: String,
    enum: ['Land', 'Building', 'Machinery', 'Furniture', 'Vehicles', 'Computers', 'Office Equipment', 'Other'],
    required: true
  },
  purchaseDate: {
    type: Date,
    required: true
  },
  purchaseValue: {
    type: Number,
    required: true,
    min: 0
  },
  currentValue: {
    type: Number,
    required: true,
    min: 0
  },
  depreciationMethod: {
    type: String,
    enum: ['Straight Line', 'Written Down Value', 'None'],
    default: 'Straight Line'
  },
  depreciationRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  accumulatedDepreciation: {
    type: Number,
    default: 0,
    min: 0
  },
  usefulLife: {
    type: Number, // in years
    default: 0
  },
  location: String,
  serialNumber: String,
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  status: {
    type: String,
    enum: ['Active', 'Under Maintenance', 'Disposed', 'Sold'],
    default: 'Active'
  },
  disposalDate: Date,
  disposalValue: Number,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Auto-generate asset code
fixedAssetSchema.pre('save', async function(next) {
  if (!this.assetCode) {
    const count = await this.constructor.countDocuments();
    this.assetCode = `FA${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

const FixedAsset = mongoose.model('FixedAsset', fixedAssetSchema);

export default FixedAsset;
