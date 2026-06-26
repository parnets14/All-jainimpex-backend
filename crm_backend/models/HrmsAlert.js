import mongoose from 'mongoose';

// Admin-facing HRMS alerts (Point 8: no-punch-in alert). Kept separate from the
// dealer Notification system so existing flows are untouched.
const hrmsAlertSchema = new mongoose.Schema({
  type: { type: String, default: 'no_punch_in' }, // no_punch_in | other
  date: { type: Date, required: true },            // the day the alert concerns
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  employeeName: { type: String },
  message: { type: String },
  read: { type: Boolean, default: false },
}, { timestamps: true });

// One alert per employee per day per type (idempotent cron)
hrmsAlertSchema.index({ type: 1, employee: 1, date: 1 }, { unique: true });

export { hrmsAlertSchema };
export default mongoose.model('HrmsAlert', hrmsAlertSchema);
