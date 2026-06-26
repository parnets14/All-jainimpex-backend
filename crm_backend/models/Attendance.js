import mongoose from 'mongoose';

const punchMarkSchema = new mongoose.Schema({
  time: Date,
  location: String,
  faceVerified: Boolean,
  source: { type: String, default: 'web' }, // web | face | biometric | manual
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
  breakMinutes: Number,   // total gap time between sessions (lunch/breaks)
  lateMinutes: Number,
  overtime: Number
}, {
  timestamps: true
});

// Compound index for unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Pre-save: compute derived punchIn/punchOut + working/break hours.
attendanceSchema.pre('save', function(next) {
  const completed = (this.sessions || []).filter(s => s.in && s.in.time && s.out && s.out.time);

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

    // worked = sum of completed session durations
    let workedMs = 0;
    completed.forEach(s => { workedMs += (new Date(s.out.time) - new Date(s.in.time)); });
    this.workingHours = parseFloat((workedMs / 3600000).toFixed(2));

    // break = (last out - first in) - worked  (only when we have a span)
    if (firstIn && firstIn.time && lastClosed && lastClosed.time) {
      const spanMs = new Date(lastClosed.time) - new Date(firstIn.time);
      this.breakMinutes = Math.max(0, Math.round((spanMs - workedMs) / 60000));
    }

    // basic status (Point 7 will refine late logic vs shift)
    if (firstIn && firstIn.time) {
      const t = new Date(firstIn.time);
      const lt = new Date(t); lt.setHours(9, 30, 0, 0);
      if (t > lt) { this.lateMinutes = Math.round((t - lt) / 60000); this.status = 'Late'; }
      else if (this.status === 'Absent') { this.status = 'Present'; }
    }
  } else if (this.punchIn && this.punchIn.time && this.punchOut && this.punchOut.time) {
    // ── Legacy single-punch fallback ──
    const hours = (this.punchOut.time - this.punchIn.time) / (1000 * 60 * 60);
    this.workingHours = parseFloat(hours.toFixed(2));
    const punchInTime = new Date(this.punchIn.time);
    const lateThreshold = new Date(punchInTime);
    lateThreshold.setHours(9, 30, 0, 0);
    if (punchInTime > lateThreshold) {
      this.lateMinutes = Math.round((punchInTime - lateThreshold) / (1000 * 60));
      this.status = 'Late';
    } else {
      this.status = 'Present';
    }
  }
  next();
});

// Export schema for multi-database support
export { attendanceSchema };

export default mongoose.model('Attendance', attendanceSchema);
