import mongoose from 'mongoose';
import { hrmsSettingsSchema } from './HrmsSettings.js';
import { calculateAttendanceTime } from '../utils/attendanceTime.js';

const punchMarkSchema = new mongoose.Schema({
  time: Date,
  location: String,
  faceVerified: Boolean,
  source: { type: String, default: 'web' }, // web | face | biometric | manual | sales_executive_app (legacy: app)
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  in: punchMarkSchema,
  out: punchMarkSchema,
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  // NEW: multiple in/out sessions per day (Point 10). punchIn/punchOut below are
  // kept as derived first-in / last-out for backward compatibility.
  sessions: { type: [sessionSchema], default: [] },
  punchIn: {
    time: Date,
    location: String,
    faceVerified: Boolean
  },
  punchOut: {
    time: Date,
    location: String,
    faceVerified: Boolean
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half Day', 'Leave'],
    default: 'Absent'
  },
  leaveType: {
    type: String,
    enum: ['Paid Leave', 'Unpaid Leave', 'Sick Leave', 'Casual Leave', null],
    default: null
  },
  reason: String,
  workingHours: Number,
  breakMinutes: Number,   // actual positive gaps between completed sessions
  deductedBreakMinutes: Number, // max(configured lunch, actual break)
  configuredLunchMinutes: Number,
  lateMinutes: Number,
  overtime: Number,

  // ── Absent Review & Excuse ──
  // Set when an absent day is processed (auto free-leave or admin review).
  //   pending  = absent, waiting for super-admin to review (2nd+ absence of month)
  //   auto_paid = auto-applied free monthly paid leave (no cut)
  //   excused  = admin marked Paid Leave (no cut)
  //   unexcused = admin marked Unpaid (salary cut with multiplier)
  reviewStatus: {
    type: String,
    enum: ['none', 'pending', 'auto_paid', 'excused', 'unexcused'],
    default: 'none'
  },
  reviewReason: { type: String, default: '' },     // reason text (preset or manual "Other")
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  // Penalty multiplier for unpaid absence: deduction = (salary/daysInMonth) × this.
  absentDeductionMultiplier: { type: Number, default: 1 },
}, {
  timestamps: true
});

// Compound index for unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Pre-save: compute derived punchIn/punchOut + working/break hours.
// Uses the employee's shiftStart for late detection (falls back to 10:00 if not set).
attendanceSchema.pre('save', async function(next) {
  const completed = (this.sessions || []).filter(s => s.in && s.in.time && s.out && s.out.time);

  // Resolve the employee's shift start and company lunch setting.
  let shiftStartHour = 10, shiftStartMin = 0;
  let allowedLunchMinutes = 45;
  try {
    const db = this.constructor.db;
    const Employee = db?.models?.Employee || this.model('Employee');
    if (Employee && this.employee) {
      const emp = await Employee.findById(this.employee).select('shiftStart').lean();
      if (emp && emp.shiftStart && emp.shiftStart.includes(':')) {
        const [h, m] = emp.shiftStart.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) { shiftStartHour = h; shiftStartMin = m; }
      }
    }
    const HrmsSettings = db?.models?.HrmsSettings || db?.model('HrmsSettings', hrmsSettingsSchema);
    const settings = HrmsSettings
      ? await HrmsSettings.findOne({ key: 'default' }).select('allowedLunchMinutes').lean()
      : null;
    if (settings?.allowedLunchMinutes != null) {
      allowedLunchMinutes = Math.max(0, Number(settings.allowedLunchMinutes) || 0);
    }
  } catch (e) { /* use fallbacks */ }

  const time = calculateAttendanceTime(this, { allowedLunchMinutes });

  if (this.sessions && this.sessions.length > 0) {
    // ── Multi-punch mode ──
    const firstIn = this.sessions[0].in;
    const lastClosed = completed.length ? completed[completed.length - 1].out : null;
    if (firstIn && firstIn.time) {
      this.punchIn = { time: firstIn.time, location: firstIn.location, faceVerified: firstIn.faceVerified };
    }
    if (lastClosed && lastClosed.time) {
      this.punchOut = { time: lastClosed.time, location: lastClosed.location, faceVerified: lastClosed.faceVerified };
    }

    // Credited work excludes at least configured lunch and the full actual
    // break when it is longer. The shared calculator also merges overlaps.
    this.workingHours = time.creditedWorkingHours;
    this.breakMinutes = time.completedActualBreakMinutes;
    this.deductedBreakMinutes = time.deductedBreakMinutes;
    this.configuredLunchMinutes = time.configuredLunchMinutes;

    // Late detection using employee's actual shift start in IST (independent
    // of the Node server's local timezone).
    if (firstIn && firstIn.time) {
      const t = new Date(new Date(firstIn.time).getTime() + 5.5 * 3600000);
      const punchMinutes = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
      const shiftMinutes = shiftStartHour * 60 + shiftStartMin;
      if (punchMinutes > shiftMinutes) {
        this.lateMinutes = Math.round(punchMinutes - shiftMinutes);
        this.status = 'Late';
      } else if (this.status === 'Absent' || this.status === 'Late') {
        this.lateMinutes = 0;
        this.status = 'Present';
      }
    }
  } else if (this.punchIn && this.punchIn.time && this.punchOut && this.punchOut.time) {
    // ── Legacy single-punch fallback ──
    this.workingHours = time.creditedWorkingHours;
    this.breakMinutes = time.completedActualBreakMinutes;
    this.deductedBreakMinutes = time.deductedBreakMinutes;
    this.configuredLunchMinutes = time.configuredLunchMinutes;
    const punchInTime = new Date(new Date(this.punchIn.time).getTime() + 5.5 * 3600000);
    const punchMinutes = punchInTime.getUTCHours() * 60 + punchInTime.getUTCMinutes() + punchInTime.getUTCSeconds() / 60;
    const shiftMinutes = shiftStartHour * 60 + shiftStartMin;
    if (punchMinutes > shiftMinutes) {
      this.lateMinutes = Math.round(punchMinutes - shiftMinutes);
      this.status = 'Late';
    } else {
      this.lateMinutes = 0;
      this.status = 'Present';
    }
  }
  next();
});

// Export schema for multi-database support
export { attendanceSchema };

export default mongoose.model('Attendance', attendanceSchema);
