import mongoose from 'mongoose';

const routeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Route code is required'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Route name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    areas: [{
      type: String,
      trim: true,
    }],
    pinCodes: [{
      type: String,
      trim: true,
    }],
    salesExecutive: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    visitDays: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    }],
    estimatedDuration: {
      type: Number, // in hours
      min: 0,
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalDealers: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Generate route code
routeSchema.statics.generateRouteCode = async function () {
  try {
    const lastRoute = await this.findOne().sort({ createdAt: -1 });
    if (lastRoute && lastRoute.code) {
      const lastNumber = parseInt(lastRoute.code.replace('RT', ''));
      return `RT${String(lastNumber + 1).padStart(4, '0')}`;
    }
    return 'RT1001';
  } catch (error) {
    console.error('Error generating route code:', error);
    return `RT${Date.now().toString().slice(-4)}`;
  }
};

// Index for better search performance
routeSchema.index({ name: 'text', description: 'text' });
routeSchema.index({ salesExecutive: 1 });
routeSchema.index({ isActive: 1 });
routeSchema.index({ createdAt: -1 });

// Export schema for multi-database support
export { routeSchema };

export default mongoose.model('Route', routeSchema);
