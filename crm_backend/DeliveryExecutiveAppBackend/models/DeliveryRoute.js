import mongoose from 'mongoose';

const deliveryRouteSchema = new mongoose.Schema({
  deliveryExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  deliveries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAssignment'
  }],
  optimizedRoute: [{
    sequence: {
      type: Number,
      required: true
    },
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryAssignment'
    },
    estimatedTime: {
      type: Number  // in minutes
    },
    distance: {
      type: Number  // in kilometers
    }
  }],
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  totalDistance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
deliveryRouteSchema.index({ deliveryExecutive: 1, date: -1 });
deliveryRouteSchema.index({ status: 1 });

// Start route
deliveryRouteSchema.methods.start = async function() {
  this.status = 'active';
  this.startTime = new Date();
  await this.save();
};

// Complete route
deliveryRouteSchema.methods.complete = async function(totalDistance) {
  this.status = 'completed';
  this.endTime = new Date();
  if (totalDistance) {
    this.totalDistance = totalDistance;
  }
  await this.save();
};

// Calculate route statistics
deliveryRouteSchema.methods.getStatistics = function() {
  const totalDeliveries = this.deliveries.length;
  const estimatedTime = this.optimizedRoute.reduce((sum, stop) => sum + (stop.estimatedTime || 0), 0);
  const estimatedDistance = this.optimizedRoute.reduce((sum, stop) => sum + (stop.distance || 0), 0);
  
  return {
    totalDeliveries,
    estimatedTime,
    estimatedDistance,
    actualDistance: this.totalDistance,
    duration: this.startTime && this.endTime 
      ? Math.round((this.endTime - this.startTime) / (1000 * 60)) // in minutes
      : null
  };
};

export default mongoose.model('DeliveryRoute', deliveryRouteSchema);
