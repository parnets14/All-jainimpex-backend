import mongoose from 'mongoose';

/**
 * Append-only audit trail (edit log) of changes to financial documents.
 *
 * Designed to satisfy India's MCA Rule 3(1), Companies (Accounts) Rules:
 * every create / edit / cancel / delete of a financial transaction is logged
 * with who made the change, when, and the before → after values. Records are
 * never updated or deleted (no such endpoints are exposed).
 */
const auditChangeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const auditTrailSchema = new mongoose.Schema({
  // The document type, e.g. 'DealerInvoice', 'JournalVoucher', 'Expense'
  entity: { type: String, required: true, index: true },
  // The document's _id
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  // Human-readable reference (invoice no / voucher no) for quick lookup
  documentNumber: { type: String, default: '' },

  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'CANCEL', 'DELETE'],
    required: true,
  },

  // Field-level before → after diff (empty for pure CREATE/DELETE)
  changes: { type: [auditChangeSchema], default: [] },

  // Optional reason (cancellations, status changes, reopen, etc.)
  reason: { type: String, default: '' },

  // Who performed the change
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },

  ipAddress: { type: String, default: '' },
}, { timestamps: true });

// Fast lookups: per-document history, and global recent activity
auditTrailSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditTrailSchema.index({ createdAt: -1 });

export { auditTrailSchema };

export default mongoose.model('AuditTrail', auditTrailSchema);
