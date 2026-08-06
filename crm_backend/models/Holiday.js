import mongoose from 'mongoose';

// Company-wide holiday calendar.
// Holidays are paid non-working days (like weekly off). Employees are NOT marked
// absent on holidays, and salary is not deducted for these days.
const holidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Holiday date is required'],
  },
  name: {
    type: String,
    required: [true, 'Holiday name is required'],
    trim: true,
  },
  type: {
    type: String,
    enum: ['national', 'festival', 'company'],
    default: 'national',
  },
  // Optional: restrict to specific departments (empty = applies to all)
  departments: {
    type: [String],
    default: [],
  },
  year: {
    type: Number,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// Unique: one holiday entry per date
holidaySchema.index({ date: 1 }, { unique: true });
holidaySchema.index({ year: 1 });

export { holidaySchema };
export default mongoose.model('Holiday', holidaySchema);
