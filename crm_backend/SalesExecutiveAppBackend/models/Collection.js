import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  collectionNumber: {
    type: String,
    unique: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  dealerName: String,
  dealerCode: String,
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMode: {
    type: String,
    required: true,
    enum: ['Cash', 'Cheque', 'NEFT', 'Bank Transfer']
  },
  // Cheque details
  chequeNumber: String,
  chequeDate: Date,
  bankName: String,
  // Bank transfer details
  transactionId: String,
  // Receipt image
  receiptImage: String,
  // Collection date
  collectionDate: {
    type: Date,
    default: Date.now
  },
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  // Notes
  notes: String,
  // Audit fields
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collectedByName: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String
}, {
  timestamps: true
});

// Generate collection number before saving
collectionSchema.pre('save', async function(next) {
  if (this.isNew && !this.collectionNumber) {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      const lastCollection = await this.constructor.findOne({
        collectionNumber: { $regex: `^COL-${dateStr}-` }
      }).sort({ collectionNumber: -1 });
      
      let sequence = 1;
      if (lastCollection) {
        const lastSequence = parseInt(lastCollection.collectionNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }
      
      this.collectionNumber = `COL-${dateStr}-${sequence.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating collection number:', error);
      this.collectionNumber = `COL-${Date.now()}`;
    }
  }
  next();
});

// Indexes
collectionSchema.index({ collectionNumber: 1 });
collectionSchema.index({ dealer: 1 });
collectionSchema.index({ collectedBy: 1 });
collectionSchema.index({ collectionDate: -1 });
collectionSchema.index({ status: 1 });

// Export schema for multi-database support
export { collectionSchema };

export default mongoose.model('Collection', collectionSchema);
