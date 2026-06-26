import mongoose from 'mongoose';

// Point 9 — Sales-exec dealer-visit punch (arrival + leave).
// SE selects a dealer → punch IN on arrival, punch OUT on leaving.
// Captures dealer, time-in, time-out, duration and GPS for each.
const dealerVisitSchema = new mongoose.Schema({
  salesExecutive: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dealer: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', required: true },
  date: { type: Date, required: true, default: () => new Date().setHours(0, 0, 0, 0) },

  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  durationMin: { type: Number, default: 0 },

  inLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    address: { type: String, default: '' },
  },
  outLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    address: { type: String, default: '' },
  },

  status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
  purpose: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

dealerVisitSchema.index({ salesExecutive: 1, date: 1 });
dealerVisitSchema.index({ dealer: 1, date: 1 });
dealerVisitSchema.index({ status: 1 });

export { dealerVisitSchema };
export default mongoose.model('DealerVisit', dealerVisitSchema);
