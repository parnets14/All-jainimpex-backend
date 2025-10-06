// models/PaymentTerm.js
import mongoose from "mongoose";

const paymentTermSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  days: {
    type: Number,
    default: null
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const PaymentTerm = mongoose.model('PaymentTerm', paymentTermSchema);
export default PaymentTerm;