import mongoose from 'mongoose';

const routePlanSchema = new mongoose.Schema({
  salesExecutive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  startLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: String
  },
  endLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: String
  },
  dealers: [{
    dealer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer',
      required: true
    },
    plannedVisitTime: Date,
    actualVisitTime: Date,
    status: {
      type: String,
      enum: ['pending', 'visited', 'skipped'],
      default: 'pending'
    },
    visitOrder: Number,
    remarks: String,
    visitData: {
      orderTaken: Boolean,
      orderAmount: Number,
      paymentReceived: Boolean,
      paymentAmount: Number,
      location: {
        latitude: Number,
        longitude: Number,
        address: String
      }
    }
  }],
  totalDistance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  remarks: String
}, {
  timestamps: true
});

// Index for geospatial queries
routePlanSchema.index({ 'startLocation': '2dsphere' });
routePlanSchema.index({ 'endLocation': '2dsphere' });

// Index for efficient queries
routePlanSchema.index({ salesExecutive: 1, date: -1 });
routePlanSchema.index({ status: 1 });

// Export schema for multi-database support
export { routePlanSchema };

export default mongoose.model('RoutePlan', routePlanSchema);
