import mongoose from 'mongoose';

/**
 * Stores the manual "tick" state of the year-end checklist for a financial year.
 * Auto-detected items (books balanced, depreciation posted, year closed) are
 * computed live and NOT stored here — only the human-confirmed steps are saved.
 */
const yearEndChecklistSchema = new mongoose.Schema({
  financialYear: { type: String, required: true, unique: true, trim: true }, // "2025-26"
  // key -> { done, note, updatedBy, updatedAt }
  manualItems: {
    type: Map,
    of: new mongoose.Schema({
      done: { type: Boolean, default: false },
      note: { type: String, default: '' },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedAt: { type: Date, default: Date.now },
    }, { _id: false }),
    default: {},
  },
}, { timestamps: true });

export { yearEndChecklistSchema };

export default mongoose.model('YearEndChecklist', yearEndChecklistSchema);
