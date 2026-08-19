import mongoose from 'mongoose';

// Logs every time an SE opens the app AFTER they have checked out for the day.
// Purpose: admin visibility into post-checkout app usage (privacy compliance).
const postCheckoutActivitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: () => new Date().setHours(0, 0, 0, 0),
  },
  openedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0],
    },
    address: {
      type: String,
      default: '',
    },
  },
  // Which screen/action the SE performed (optional, for future use)
  action: {
    type: String,
    default: 'app_open',
  },
}, { timestamps: true });

postCheckoutActivitySchema.index({ user: 1, date: -1 });
postCheckoutActivitySchema.index({ date: -1, openedAt: -1 });

export { postCheckoutActivitySchema };
export default mongoose.model('PostCheckoutActivity', postCheckoutActivitySchema);
