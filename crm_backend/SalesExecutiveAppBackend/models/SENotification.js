import mongoose from 'mongoose';

const seNotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'order_request_approved',
      'order_request_rejected',
      'claim_approved',
      'claim_rejected',
      'claim_paid',
      'target_assigned',
      'collection_approved',
      'collection_rejected',
      'general',
    ],
    default: 'general',
  },
  title:   { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  isRead:  { type: Boolean, default: false, index: true },
  data:    { type: mongoose.Schema.Types.Mixed, default: {} }, // extra payload (requestId, etc.)
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
}, { timestamps: true });

seNotificationSchema.index({ user: 1, createdAt: -1 });
seNotificationSchema.index({ user: 1, isRead: 1 });

export { seNotificationSchema };
export default mongoose.model('SENotification', seNotificationSchema);
