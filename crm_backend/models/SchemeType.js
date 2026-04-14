// models/SchemeType.js
import mongoose from "mongoose";

const schemeTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const SchemeType = mongoose.model('SchemeType', schemeTypeSchema);

// Export schema for multi-database support
export { schemeTypeSchema };

export default SchemeType;