import mongoose from 'mongoose';

const accountingSequenceSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  value: {
    type: Number,
    required: true,
    min: 0,
  },
}, {
  timestamps: true,
  versionKey: false,
});

export { accountingSequenceSchema };
export default mongoose.model('AccountingSequence', accountingSequenceSchema);
