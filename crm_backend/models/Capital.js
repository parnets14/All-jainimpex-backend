import mongoose from 'mongoose';

const capitalSchema = new mongoose.Schema({
  ownerName: {
    type: String,
    required: true,
    trim: true
  },
  capitalType: {
    type: String,
    enum: ['Owner Capital', 'Partner Capital', 'Share Capital', 'Retained Earnings'],
    required: true
  },
  openingBalance: {
    type: Number,
    required: true,
    default: 0
  },
  currentBalance: {
    type: Number,
    required: true,
    default: 0
  },
  additions: {
    type: Number,
    default: 0
  },
  withdrawals: {
    type: Number,
    default: 0
  },
  profitShare: {
    type: Number,
    default: 0
  },
  financialYear: {
    type: String,
    required: true
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Capital = mongoose.model('Capital', capitalSchema);

export default Capital;
