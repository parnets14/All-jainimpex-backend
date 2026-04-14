import mongoose from 'mongoose';

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
  lateMinutes: Number,
  overtime: Number
}, {
  timestamps: true
});

// Compound index for unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Pre-save middleware to calculate working hours and status
attendanceSchema.pre('save', function(next) {
  if (this.punchIn && this.punchOut) {
    const hours = (this.punchOut.time - this.punchIn.time) / (1000 * 60 * 60);
    this.workingHours = parseFloat(hours.toFixed(2));
    
    // Calculate late minutes (if punch in after 9:30 AM)
    const punchInTime = new Date(this.punchIn.time);
    const lateThreshold = new Date(punchInTime);
    lateThreshold.setHours(9, 30, 0, 0); // 9:30 AM
    
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