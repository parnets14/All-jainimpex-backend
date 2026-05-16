import mongoose from 'mongoose';

const deliveryAssignmentSchema = new mongoose.Schema({
  deliveryExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  salesOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  deliverySequence: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['assigned', 'in_transit', 'delivered', 'failed', 'rescheduled', 'pending_reschedule'],
    default: 'assigned'
  },
  deliveryOTP: {
    type: String
  },
  otpVerified: {
    type: Boolean,
    default: false
  },
  otpGeneratedAt: {
    type: Date
  },
  otpResendCount: {
    type: Number,
    default: 0
  },
  otpAttempts: {
    type: Number,
    default: 0
  },
  deliveryTime: {
    type: Date
  },
  podImages: [{
    type: String  // URLs to uploaded images
  }],
  failureReason: {
    type: String
  },
  failureDetails: {
    reason: String,
    note: String,
    images: [String],
    failedAt: Date,
    failedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    location: {
      latitude: Number,
      longitude: Number
    }
  },
  rescheduleReason: {
    type: String
  },
  rescheduledDate: {
    type: Date
  },
  rescheduleRequest: {
    requestedDate: Date,
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: Date,
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    approvedDate: Date, // Final approved date (may be different from requested)
    rejectionReason: String,
    rejectedAt: Date
  },
  rescheduleHistory: [{
    originalDate: Date,
    rescheduledTo: Date,
    reason: String,
    rescheduledAt: {
      type: Date,
      default: Date.now
    },
    rescheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date
  }],
  reassignmentHistory: [{
    fromExecutive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    toExecutive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    reassignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reassignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  failedAt: {
    type: Date
  },
  deliveryLocation: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  notes: {
    type: String
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentCollected: {
    type: Boolean,
    default: false
  },
  paymentCollectedAt: {
    type: Date
  },
  // Admin confirmation fields
  adminConfirmed: {
    type: Boolean,
    default: false
  },
  adminConfirmedAt: {
    type: Date
  },
  adminConfirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminRejection: {
    reason: String,
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
deliveryAssignmentSchema.index({ deliveryExecutive: 1, scheduledDate: -1 });
deliveryAssignmentSchema.index({ status: 1 });
deliveryAssignmentSchema.index({ salesOrder: 1 });

// Generate OTP for delivery verification
deliveryAssignmentSchema.methods.generateDeliveryOTP = function() {
  this.deliveryOTP = Math.floor(100000 + Math.random() * 900000).toString();
  return this.deliveryOTP;
};

// Mark as delivered
deliveryAssignmentSchema.methods.markDelivered = async function(podImages, location) {
  this.status = 'delivered';
  this.deliveryTime = new Date();
  this.podImages = podImages;
  if (location) {
    this.deliveryLocation = location;
  }
  await this.save();
};

// Mark as failed
deliveryAssignmentSchema.methods.markFailed = async function(reason, location) {
  this.status = 'failed';
  this.failureReason = reason;
  if (location) {
    this.deliveryLocation = location;
  }
  await this.save();
};

// Reschedule delivery
deliveryAssignmentSchema.methods.reschedule = async function(newDate, reason) {
  this.status = 'rescheduled';
  this.rescheduledDate = newDate;
  this.rescheduleReason = reason;
  await this.save();
};

export { deliveryAssignmentSchema };
export default mongoose.model('DeliveryAssignment', deliveryAssignmentSchema);
