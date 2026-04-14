import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  loanNumber: {
    type: String,
    unique: true,
    required: true
  },
  loanType: {
    type: String,
    enum: ['Term Loan', 'Working Capital', 'Overdraft', 'Credit Card', 'Personal Loan', 'Vehicle Loan', 'Other'],
    required: true
  },
  lenderName: {
    type: String,
    required: true,
    trim: true
  },
  lenderType: {
    type: String,
    enum: ['Bank', 'NBFC', 'Individual', 'Other'],
    default: 'Bank'
  },
  principalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  interestRate: {
    type: Number,
    required: true,
    min: 0
  },
  loanTenure: {
    type: Number, // in months
    required: true
  },
  disbursementDate: {
    type: Date,
    required: true
  },
  maturityDate: {
    type: Date,
    required: true
  },
  emiAmount: {
    type: Number,
    default: 0
  },
  outstandingPrincipal: {
    type: Number,
    required: true
  },
  outstandingInterest: {
    type: Number,
    default: 0
  },
  totalOutstanding: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Closed', 'Overdue', 'Restructured'],
    default: 'Active'
  },
  purpose: String,
  collateral: String,
  bankAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount'
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Loan = mongoose.model('Loan', loanSchema);

// Export schema for multi-database support
export { loanSchema };

export default Loan;
