import mongoose from 'mongoose';

// Maps a device card/enroll number to the employee's name, synced from the
// RealTime attendance database (Mst_Employee). Used to show names on the
// Biometric Punches screen without changing the punch records.
const biometricEmployeeSchema = new mongoose.Schema({
  cardNo: { type: String, required: true, unique: true, index: true },
  name:   { type: String, default: '' },
  empCode:{ type: String, default: '' },
}, { timestamps: true });

export { biometricEmployeeSchema };
export default mongoose.model('BiometricEmployee', biometricEmployeeSchema);
