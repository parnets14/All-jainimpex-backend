import mongoose from 'mongoose';

// Company-wide HRMS configuration (a single document per company DB).
// Admin-editable. Drives overtime, late, lunch/shortfall, and no-punch alert.
const hrmsSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true }, // singleton

  // ── Overtime (Point 5) ──
  // OT counts from each employee's own shift end once they cross the buffer.
  otBufferMinutes: { type: Number, default: 30 },
  otRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perHour' },
  otRate: { type: Number, default: 0 },          // ₹ per hour or per minute

  // ── Late entry deduction (Point 7) ──
  lateGraceMinutes: { type: Number, default: 15 },
  lateDeductionMode: { type: String, enum: ['proportional', 'slab', 'count'], default: 'proportional' },
  lateProportionalUsesFullTime: { type: Boolean, default: false }, // deduct full late time vs only excess over grace
  lateRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perMinute' },
  lateRate: { type: Number, default: 0 },        // for proportional mode
  lateSlabHalfDayMinutes: { type: Number, default: 0 },  // cross => half-day cut
  lateSlabFullDayMinutes: { type: Number, default: 0 },  // cross => full-day cut
  lateCountPerMonth: { type: Number, default: 3 },       // for count mode: N lates
  lateCountEqualsDays: { type: Number, default: 1 },     // = this many days' salary cut

  // ── Lunch / working-hours shortfall (Point 2) ──
  allowedLunchMinutes: { type: Number, default: 45 },
  shortfallGraceMinutes: { type: Number, default: 0 },
  shortfallRateMode: { type: String, enum: ['perHour', 'perMinute'], default: 'perMinute' },
  shortfallRate: { type: Number, default: 0 },

  // ── No-punch-in alert (Point 8) ──
  noPunchAlertTime: { type: String, default: '13:30' }, // fixed clock time HH:mm

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export { hrmsSettingsSchema };
export default mongoose.model('HrmsSettings', hrmsSettingsSchema);
