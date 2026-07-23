import mongoose from 'mongoose';

const dailySummarySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  // Attendance
  checkInTime: { type: Date, default: null },
  checkOutTime: { type: Date, default: null },
  workDurationMin: { type: Number, default: 0 }, // total minutes worked

  // Tracking
  totalDistanceKm: { type: Number, default: 0 },
  trailPoints: { type: Number, default: 0 },
  activeTimeMin: { type: Number, default: 0 },   // first fix → last fix
  idleTimeMin: { type: Number, default: 0 },     // time spent stationary
  movingTimeMin: { type: Number, default: 0 },   // activeTime - idleTime

  // Dealer visits
  dealersVisited: { type: Number, default: 0 },
  dealersAssigned: { type: Number, default: 0 },
  visitCoveragePercent: { type: Number, default: 0 },

  // Orders & collections
  ordersPlaced: { type: Number, default: 0 },
  orderValue: { type: Number, default: 0 },
  collectionsCount: { type: Number, default: 0 },
  collectionAmount: { type: Number, default: 0 },

  // Meta
  userName: { type: String, default: '' },
  userPhone: { type: String, default: '' },
}, {
  timestamps: true,
});

// One summary per user per day
dailySummarySchema.index({ user: 1, date: 1 }, { unique: true });
dailySummarySchema.index({ date: -1 });

export { dailySummarySchema };
export default mongoose.model('SEDailySummary', dailySummarySchema);
