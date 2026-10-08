import { pointsSchema } from '../models/Points.js';

/* -------------------------------------------------------------------------
 * Purchase scheme evaluation (the "Purchasing Points" module).
 *
 * This service is the runtime consumer of the `Points` model. It answers one
 * question: given the lines of a goods receipt (or a supplier invoice), which
 * configured purchase schemes qualify, and what reward does each one pay?
 *
 * Relationship to the dealer-facing engine:
 *   - `services/schemeEngine.js`  -> `Scheme`  model -> DEALER offers (sale side)
 *   - `services/schemeService.js` -> `Points`  model -> PURCHASE offers (buy side)
 *   They share no code and no collection. This file only ever touches `Points`.
 *
 * Two rules that the previous version got wrong and that are load-bearing:
 *   1. `Points` has NO `status` field. Filtering on it returned zero rows
 *      forever, which is why auto-apply silently never fired. Expiry is
 *      expressed purely through `validFrom` / `validTo`.
 *   2. Everything is read through `dbConnection`, never through the module-level
 *      default connection — the app is multi-tenant (one DB per company).
 *
 * Slab selection is HIGHEST QUALIFYING ONLY, matching the rest of the codebase.
 * Tiers never stack.
 * ------------------------------------------------------------------------- */

const getModels = (dbConnection) => ({
  Points: dbConnection.models.Points || dbConnection.model('Points', pointsSchema)
});

/* ----------------------------- pure helpers ----------------------------- */
/* Exported so they can be unit-tested without a database.                  */

/**
 * Normalise a ref to its string id. Accepts a raw ObjectId, a populated
 * document, or a string, so callers never have to care which they hold.
 */
export const idOf = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

/**
 * Does one GRN/invoice line fall inside the scheme's scope?
 *
 * `Points` scope is a rigid brand + category + subcategory triple, so all three
 * must line up. A dimension the scheme leaves unset acts as a wildcard. A
 * dimension the scheme DOES set but the line cannot supply is treated as a
 * mismatch — better to skip a scheme than to pay out on a guess.
 */
export const itemMatchesScope = (scheme = {}, item = {}) => {
  const dimensions = [
    [scheme.brand, item.brand],
    [scheme.category, item.category],
    [scheme.subcategory, item.subcategory]
  ];

  for (const [schemeValue, itemValue] of dimensions) {
    const wanted = idOf(schemeValue);
    if (!wanted) continue;
    if (idOf(itemValue) !== wanted) return false;
  }
  return true;
};

/**
 * Slabs in a normalised shape.
 *
 * Hydrated documents expose `effectiveSlabs()`, which synthesises a one-tier
 * ladder from the legacy single-threshold fields. Plain objects (tests, lean
 * reads) get the same treatment here so behaviour cannot diverge.
 */
export const slabsFor = (scheme = {}) => {
  if (typeof scheme.effectiveSlabs === 'function') {
    return scheme.effectiveSlabs() || [];
  }
  if (Array.isArray(scheme.slabs) && scheme.slabs.length > 0) {
    return [...scheme.slabs].sort((a, b) => Number(a.from || 0) - Number(b.from || 0));
  }
  if (scheme.inputValue !== null && scheme.inputValue !== undefined) {
    return [{
      seq: 1,
      from: Number(scheme.inputValue),
      to: null,
      label: `${scheme.inputValue}+ (legacy)`,
      reward: {
        points: Number(scheme.points || 0),
        extraQuantity: Number(scheme.extraQuantity || 0),
        discountPercentage: Number(scheme.discountPercentage || 0),
        cashbackAmount: Number(scheme.cashbackAmount || 0),
        description: ''
      }
    }];
  }
  return [];
};

/** Highest qualifying slab only. Returns null when nothing qualifies. */
export const resolvePurchaseSlab = (slabs = [], measuredValue = 0) => {
  const value = Number(measuredValue) || 0;
  let best = null;

  for (const slab of slabs || []) {
    const from = Number(slab.from ?? 0);
    const rawTo = slab.to;
    const to = rawTo === null || rawTo === undefined ? null : Number(rawTo);

    if (value < from) continue;
    if (to !== null && value > to) continue;

    if (!best || from > Number(best.from ?? 0)) best = slab;
  }
  return best;
};

/** Measure the qualifying lines on the scheme's own basis. */
export const measurePurchaseItems = (items = [], basis = 'amount') => {
  const list = Array.isArray(items) ? items : [];
  return list.reduce((sum, item) => {
    const quantity = Number(item.acceptedQuantity ?? item.quantity ?? 0) || 0;
    if (basis === 'units') return sum + quantity;
    return sum + quantity * (Number(item.unitPrice || 0) || 0);
  }, 0);
};

/**
 * Turn a slab's reward block into concrete numbers.
 *
 * A slab may carry several rewards at once (points AND a discount, say), so we
 * report all of them rather than picking one. The percentage discount needs the
 * monetary value even when the scheme is measured in units, hence `amountValue`
 * is a separate argument.
 */
export const computeSlabReward = (slab = {}, amountValue = 0) => {
  const reward = slab.reward || {};
  const discountPercentage = Number(reward.discountPercentage || 0);
  const amount = Number(amountValue || 0);

  return {
    points: Number(reward.points || 0),
    extraQuantity: Number(reward.extraQuantity || 0),
    discountPercentage,
    discountAmount: discountPercentage > 0
      ? Math.floor(amount * (discountPercentage / 100))
      : 0,
    cashbackAmount: Number(reward.cashbackAmount || 0),
    description: reward.description || ''
  };
};

/** True when a computed reward actually pays something. */
export const rewardHasValue = (reward = {}) => (
  Number(reward.points || 0) > 0 ||
  Number(reward.extraQuantity || 0) > 0 ||
  Number(reward.discountAmount || 0) > 0 ||
  Number(reward.cashbackAmount || 0) > 0
);

/** Human-readable one-liner for the audit trail and the GRN screen. */
export const describeReward = (reward = {}, basis = 'amount', measuredValue = 0) => {
  if (reward.description) return reward.description;

  const measured = basis === 'amount'
    ? `₹${Math.round(Number(measuredValue) || 0).toLocaleString('en-IN')}`
    : `${Number(measuredValue) || 0} units`;

  const parts = [];
  if (reward.points > 0) parts.push(`${reward.points} points`);
  if (reward.extraQuantity > 0) parts.push(`${reward.extraQuantity} extra units`);
  if (reward.discountAmount > 0) {
    parts.push(`${reward.discountPercentage}% discount (₹${reward.discountAmount.toLocaleString('en-IN')})`);
  }
  if (reward.cashbackAmount > 0) {
    parts.push(`₹${reward.cashbackAmount.toLocaleString('en-IN')} cashback`);
  }
  if (parts.length === 0) return '';

  return `${parts.join(' + ')} on ${measured}`;
};

/* ------------------------------- service -------------------------------- */

class SchemeService {
  /**
   * Evaluate every live purchase scheme against a set of lines.
   *
   * @param {Object} dbConnection - tenant connection (never the default one)
   * @param {Object} payload
   * @param {Array}  payload.items          - lines carrying quantity/price + scope ids
   * @param {string} payload.autoApplyField - 'autoApplyGRN' | 'autoApplySupplierInvoice'
   * @param {Date}   [payload.at]           - evaluation instant (defaults to now)
   * @returns {Promise<Object>} { schemes, totalPoints, totalExtraQuantity,
   *                             totalDiscountAmount, totalCashbackAmount, totalMonetaryValue }
   */
  async evaluatePurchaseSchemes(dbConnection, {
    items = [],
    autoApplyField = 'autoApplyGRN',
    at = new Date()
  } = {}) {
    const empty = {
      schemes: [],
      totalPoints: 0,
      totalExtraQuantity: 0,
      totalDiscountAmount: 0,
      totalCashbackAmount: 0,
      totalMonetaryValue: 0
    };

    if (!dbConnection) {
      console.error('evaluatePurchaseSchemes called without a dbConnection');
      return empty;
    }

    const { Points } = getModels(dbConnection);
    const when = at instanceof Date ? at : new Date(at);

    // NOTE: no `status` filter — `Points` has no such field. Validity windows
    // are the only liveness signal the model carries.
    const schemes = await Points.find({
      type: 'purchase',
      [autoApplyField]: true,
      validFrom: { $lte: when },
      validTo: { $gte: when }
    });

    if (!schemes || schemes.length === 0) return empty;

    const lines = Array.isArray(items) ? items : [];
    const applied = [];

    for (const scheme of schemes) {
      const scoped = lines.filter((line) => itemMatchesScope(scheme, line));
      if (scoped.length === 0) continue;

      const basis = scheme.calculationType === 'units' ? 'units' : 'amount';
      const measuredValue = measurePurchaseItems(scoped, basis);
      // The discount reward is percentage-based, so it always needs the money
      // figure even when the scheme qualifies on unit counts.
      const amountValue = measurePurchaseItems(scoped, 'amount');

      const slab = resolvePurchaseSlab(slabsFor(scheme), measuredValue);
      if (!slab) continue;

      const reward = computeSlabReward(slab, amountValue);
      if (!rewardHasValue(reward)) continue;

      applied.push({
        schemeId: scheme._id,
        schemeCode: scheme.schemeCode || '',
        schemeName: scheme.schemeName || scheme.description || '',
        slabSeq: slab.seq ?? null,
        slabLabel: slab.label || '',
        basis,
        measuredValue,
        points: reward.points,
        extraQuantity: reward.extraQuantity,
        discountAmount: reward.discountAmount,
        cashbackAmount: reward.cashbackAmount,
        description: describeReward(reward, basis, measuredValue),
        autoApplied: true,
        appliedAt: when.toISOString()
      });
    }

    const totalDiscountAmount = applied.reduce((sum, row) => sum + row.discountAmount, 0);
    const totalCashbackAmount = applied.reduce((sum, row) => sum + row.cashbackAmount, 0);

    return {
      schemes: applied,
      totalPoints: applied.reduce((sum, row) => sum + row.points, 0),
      totalExtraQuantity: applied.reduce((sum, row) => sum + row.extraQuantity, 0),
      totalDiscountAmount,
      totalCashbackAmount,
      // Points and free units are not money, so they are deliberately excluded
      // from the monetary roll-up rather than being silently added to it.
      totalMonetaryValue: totalDiscountAmount + totalCashbackAmount
    };
  }

  /**
   * Purchase schemes that opt in to firing on a goods receipt.
   * @param {Object} dbConnection
   * @param {Object} grnData - { items: [...], at? }
   */
  async checkAndApplyPurchaseSchemesForGRN(dbConnection, grnData = {}) {
    return this.evaluatePurchaseSchemes(dbConnection, {
      items: grnData.items || [],
      autoApplyField: 'autoApplyGRN',
      at: grnData.at || new Date()
    });
  }

  /**
   * Purchase schemes that opt in to firing on a supplier invoice.
   * @param {Object} dbConnection
   * @param {Object} invoiceData - { items: [...], at? }
   */
  async checkAndApplyPurchaseSchemes(dbConnection, invoiceData = {}) {
    return this.evaluatePurchaseSchemes(dbConnection, {
      items: invoiceData.items || [],
      autoApplyField: 'autoApplySupplierInvoice',
      at: invoiceData.at || new Date()
    });
  }
}

export default new SchemeService();
