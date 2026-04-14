import mongoose from 'mongoose';

const cashAccountSchema = new mongoose.Schema({
  accountName: {
    type: String,
    default: 'Cash in Hand',
    required: true
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  openingDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  notes: String
}, {
  timestamps: true
});

// Singleton pattern - only one cash account
cashAccountSchema.statics.getCashAccount = async function() {
  let cashAccount = await this.findOne();
  if (!cashAccount) {
    cashAccount = await this.create({
      accountName: 'Cash in Hand',
      openingBalance: 0,
      currentBalance: 0
    });
  }
  return cashAccount;
};

const CashAccount = mongoose.model('CashAccount', cashAccountSchema);

// Export schema for multi-database support
export { cashAccountSchema };

export default CashAccount;
