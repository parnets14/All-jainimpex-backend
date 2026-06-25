import mongoose from 'mongoose';

// Raw fingerprint punches pulled from the RealTime/AttendanceTracker database
// by the office-PC sync agent. This is an ADDITIVE store — Phase 1 only records
// the raw scans; Phase 2 will pair them into attendance sessions.
const biometricPunchSchema = new mongoose.Schema({
  // Device enrollment / card number (e.g. "00000035")
  cardNo: { type: String, required: true, index: true },

  // Wall-clock time of the scan (IST)
  punchAt: { type: Date, required: true, index: true },

  // Which physical device (single device today = "1")
  machineNo: { type: String, default: '1' },

  // Source row id from Tran_MachineRawPunch (only when synced via the .mdb agent;
  // null when read directly from the device).
  sourceId: { type: Number, default: null },

  // Filled in Phase 2 when we map cardNo -> employee
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  // Set true once Phase 2 has turned this into an attendance session
  processed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// A punch is uniquely identified by who + when + which device. Works for BOTH
// the .mdb agent and the direct-device agent, and makes ingestion idempotent.
biometricPunchSchema.index({ cardNo: 1, punchAt: 1, machineNo: 1 }, { unique: true });

export { biometricPunchSchema };
export default mongoose.model('BiometricPunch', biometricPunchSchema);
