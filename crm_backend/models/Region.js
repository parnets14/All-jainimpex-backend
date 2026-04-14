import mongoose from 'mongoose';

const regionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 10
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for better performance
regionSchema.index({ name: 1 });
regionSchema.index({ status: 1 });
regionSchema.index({ code: 1 });
regionSchema.index({ createdAt: -1 });

// Pre-save middleware to generate code if not provided
regionSchema.pre('save', function(next) {
  if (!this.code && this.name) {
    // Generate code from name (first 3 letters, uppercase)
    this.code = this.name.substring(0, 3).toUpperCase();
  }
  next();
});

// Export schema for multi-database support
export { regionSchema };

export default mongoose.model('Region', regionSchema);
