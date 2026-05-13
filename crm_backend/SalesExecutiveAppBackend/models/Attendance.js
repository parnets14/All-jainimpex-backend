import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
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
  checkInTime: {
    type: Date,
    default: null,
  },
  checkOutTime: {
    type: Date,
    default: null,
  },
  checkInLocation: {
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
  checkOutLocation: {
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
  checkInSelfie: {
    type: String,
    default: '',
  },
  checkOutSelfie: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'late'],
    default: 'present',
  },
  lateReason: {
    type: String,
    default: '',
  },
  remarks: {
    type: String,
    default: '',
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Index for faster queries
attendanceSchema.index({ user: 1, date: 1 });
attendanceSchema.index({ date: 1 });

// Method to check if user is late
attendanceSchema.methods.isLate = function() {
  if (!this.checkInTime) return false;
  
  const checkInHour = this.checkInTime.getHours();
  const checkInMinute = this.checkInTime.getMinutes();
  
  // Assuming office starts at 9:30 AM
  const lateThreshold = 9 * 60 + 30; // 9:30 in minutes
  const checkInMinutes = checkInHour * 60 + checkInMinute;
  
  return checkInMinutes > lateThreshold;
};

// Static method to get today's attendance for a user
attendanceSchema.statics.getTodayAttendance = async function(userId) {
  const today = new Date().setHours(0, 0, 0, 0);
  return await this.findOne({
    user: userId,
    date: today,
  });
};

// Export schema for multi-database support
export { attendanceSchema };

export default mongoose.model('SEAttendance', attendanceSchema);
