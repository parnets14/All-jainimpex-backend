import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Static method to get next sequence
counterSchema.statics.getNextSequence = async function(counterId) {
  const counter = await this.findByIdAndUpdate(
    counterId,
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return counter.sequence;
};

export default mongoose.model('Counter', counterSchema);
