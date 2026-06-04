import mongoose from 'mongoose';

// Generic key-value settings store, scoped per company (via multi-db connections)
const appSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

export { appSettingsSchema };
export default mongoose.model('AppSettings', appSettingsSchema);
