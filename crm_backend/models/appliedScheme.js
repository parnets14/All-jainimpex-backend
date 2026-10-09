import mongoose from 'mongoose';

/* -------------------------------------------------------------------------
 * Applied-scheme opt-in records.
 *
 * Shared by `SalesOrder` and `DealerInvoice` — the two documents that carry a
 * salesman's choice about which schemes to actually give.
 *
 * The absent-vs-empty distinction is the whole point of this schema, so do not
 * "simplify" it to `default: []`:
 *   - field ABSENT  → no gate. The engine counts every matching scheme, which
 *                     is the behaviour that existed before this field. Older
 *                     documents and API callers that never send it keep working.
 *   - ARRAY (even empty) → gate ON. Only the listed schemes count; an empty
 *                     array means the salesman gave nothing on this document.
 * ------------------------------------------------------------------------- */

export const appliedSchemeSchema = new mongoose.Schema({
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scheme' },
  schemeCode: { type: String, default: '' },
  schemeName: { type: String, default: '' },
  // Whether the document alone already crossed the slab when it was saved.
  // Informational only: a scheme may be ticked while still in progress, because
  // a cumulative offer (buy 10 get 1 free) completes across several orders.
  eligibleAtOrder: { type: Boolean, default: false },
  // For free item rewards: 'now' (added on this order directly) or 'later' (pending in Schemes & Rewards).
  freeItemAction: { type: String, enum: ['now', 'later'], default: 'later' }
}, { _id: false });

/**
 * Normalise whatever the client posted into rows this schema accepts.
 *
 * Accepts a list of ids (`["<id>"]`) or the richer rows the eligibility panel
 * sends (`[{ schemeId, schemeCode, schemeName, eligibleAtOrder, freeItemAction }]`).
 * Returns `undefined` when the client sent nothing, so the caller can leave the
 * field absent and preserve the legacy no-gate behaviour.
 */
export const normalizeAppliedSchemes = (raw) => {
  if (!Array.isArray(raw)) return undefined;

  const rows = raw
    .map((row) => {
      if (typeof row === 'string') {
        return { schemeId: row, schemeCode: '', schemeName: '', eligibleAtOrder: false, freeItemAction: 'later' };
      }
      if (row && typeof row === 'object' && row.schemeId) {
        return {
          schemeId: row.schemeId,
          schemeCode: row.schemeCode || '',
          schemeName: row.schemeName || '',
          eligibleAtOrder: Boolean(row.eligibleAtOrder),
          freeItemAction: row.freeItemAction === 'now' ? 'now' : 'later'
        };
      }
      return null;
    })
    .filter(Boolean);

  // A non-empty input that yields nothing means every entry was malformed.
  // Report that as "nothing was sent" rather than "send nothing": an empty
  // array switches the gate ON with nothing allowed, which would silently strip
  // every scheme from the order. Malformed input must fail open, not closed.
  if (raw.length > 0 && rows.length === 0) return undefined;

  return rows;
};

/** Scheme ids for the engine gate, or null when no gate was requested. */
export const appliedSchemeIdList = (applied) =>
  Array.isArray(applied) ? applied.map((row) => String(row.schemeId)) : null;

export default appliedSchemeSchema;
