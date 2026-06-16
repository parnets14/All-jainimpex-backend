// services/auditTrailService.js
// Append-only audit/edit log for financial documents (MCA Rule 3(1)).
//
// IMPORTANT: these helpers must NEVER throw — audit logging is best-effort and
// must not break the business transaction it is recording. Failures are logged
// to the console only.

import { auditTrailSchema } from '../models/AuditTrail.js';

const getModels = (dbConnection) => ({
  AuditTrail:
    dbConnection.models.AuditTrail ||
    dbConnection.model('AuditTrail', auditTrailSchema),
});

// Fields that are noise and should never appear in the diff
const IGNORED_FIELDS = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'id',
]);

/**
 * Normalise a value for stable comparison/storage.
 */
const normalise = (v) => {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (mongooseIsObjectId(v)) return v.toString();
  return v;
};

const mongooseIsObjectId = (v) =>
  v && typeof v === 'object' && typeof v.toHexString === 'function';

const isEqual = (a, b) => {
  const na = normalise(a);
  const nb = normalise(b);
  if (typeof na === 'object' && typeof nb === 'object') {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return na === nb;
};

/**
 * Compute a field-level diff between two plain objects.
 * @param {Object} before
 * @param {Object} after
 * @param {string[]} [fields] - optional whitelist of fields to compare
 * @returns {Array<{field,oldValue,newValue}>}
 */
export const diff = (before = {}, after = {}, fields = null) => {
  const changes = [];
  const keys = fields && fields.length
    ? fields
    : Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));

  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const oldVal = before ? before[key] : undefined;
    const newVal = after ? after[key] : undefined;
    if (!isEqual(oldVal, newVal)) {
      changes.push({
        field: key,
        oldValue: normalise(oldVal),
        newValue: normalise(newVal),
      });
    }
  }
  return changes;
};

const userInfo = (req, explicitUser) => {
  const user = explicitUser || req?.user || {};
  return {
    performedBy: user._id || null,
    performedByName: user.name || user.email || '',
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
  };
};

/**
 * Low-level writer. Never throws.
 */
const write = async (dbConnection, record) => {
  try {
    if (!dbConnection) return null;
    const { AuditTrail } = getModels(dbConnection);
    return await AuditTrail.create(record);
  } catch (err) {
    console.error('⚠️  [AUDIT] Failed to write audit trail:', err.message);
    return null;
  }
};

/**
 * Record a document creation.
 */
export const recordCreate = async (dbConnection, { entity, entityId, documentNumber, req, user }) => {
  return write(dbConnection, {
    entity,
    entityId,
    documentNumber: documentNumber || '',
    action: 'CREATE',
    changes: [],
    ...userInfo(req, user),
  });
};

/**
 * Record an edit with a before/after diff. Skips writing if nothing changed.
 */
export const recordUpdate = async (dbConnection, { entity, entityId, documentNumber, before, after, fields, req, user, reason }) => {
  const changes = diff(before, after, fields);
  if (changes.length === 0) return null;
  return write(dbConnection, {
    entity,
    entityId,
    documentNumber: documentNumber || '',
    action: 'UPDATE',
    changes,
    reason: reason || '',
    ...userInfo(req, user),
  });
};

/**
 * Record a status change (e.g. Approved → Cancelled, Pending → Approved).
 */
export const recordStatusChange = async (dbConnection, { entity, entityId, documentNumber, oldStatus, newStatus, req, user, reason }) => {
  return write(dbConnection, {
    entity,
    entityId,
    documentNumber: documentNumber || '',
    action: 'STATUS_CHANGE',
    changes: [{ field: 'status', oldValue: oldStatus ?? null, newValue: newStatus ?? null }],
    reason: reason || '',
    ...userInfo(req, user),
  });
};

/**
 * Record a cancellation.
 */
export const recordCancel = async (dbConnection, { entity, entityId, documentNumber, req, user, reason }) => {
  return write(dbConnection, {
    entity,
    entityId,
    documentNumber: documentNumber || '',
    action: 'CANCEL',
    changes: [],
    reason: reason || '',
    ...userInfo(req, user),
  });
};

/**
 * Record a deletion.
 */
export const recordDelete = async (dbConnection, { entity, entityId, documentNumber, req, user, reason }) => {
  return write(dbConnection, {
    entity,
    entityId,
    documentNumber: documentNumber || '',
    action: 'DELETE',
    changes: [],
    reason: reason || '',
    ...userInfo(req, user),
  });
};

export default {
  diff,
  recordCreate,
  recordUpdate,
  recordStatusChange,
  recordCancel,
  recordDelete,
};
