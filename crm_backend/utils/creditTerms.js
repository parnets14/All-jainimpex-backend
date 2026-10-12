/**
 * Credit-terms resolution for dealer orders and invoices.
 *
 * WHY THIS EXISTS
 * `creditDays` is a value where **0 is meaningful** — it means "pay on demand".
 * `Dealer.creditDays` / `creditDaysRegular` / `creditDaysCD` all have
 * `default: 0`, so 0 is the NORMAL value for a dealer with no credit terms, not
 * an "unset" marker.
 *
 * The codebase was full of `||` chains like:
 *
 *     dealer.creditDaysRegular || dealer.creditDays || 30
 *
 * `||` falls through on 0, so a pay-on-demand dealer was silently given
 * **30 days** — and that value drives `dueDate`, which drives the overdue badge
 * and the aging report. The dealer who should be overdue immediately showed as
 * current for a month.
 *
 * These helpers use `??` (nullish) instead, so 0 survives and only a real
 * `null`/`undefined` falls through.
 */

/** A finite, non-negative number, or null when the value is unusable. */
const asDayCount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0) return null;
  return days;
};

/**
 * Resolve the credit days for a dealer + sales type.
 *
 * Order of preference:
 *   1. the sales-type-specific dealer value (`creditDaysCD` / `creditDaysRegular`)
 *   2. the dealer's general `creditDays`
 *   3. `fallback` — the caller's own default, used ONLY when the dealer has no
 *      value at all. Pass `fallback: null` when "unset" must stay visible.
 *
 * `0` at any level is a real answer and is returned as-is.
 *
 * @param {object} dealer  a Dealer document / lean object
 * @param {object} [options]
 * @param {string} [options.salesType]  'Regular Sale' | 'CD Sales' | 'Mixed' | other
 * @param {number|null} [options.fallback=30]  used only when the dealer has no value
 * @returns {number|null}
 */
export const resolveCreditDays = (dealer, { salesType = null, fallback = 30 } = {}) => {
  if (!dealer) return asDayCount(fallback);

  const general = asDayCount(dealer.creditDays);
  const regular = asDayCount(dealer.creditDaysRegular);
  const cd = asDayCount(dealer.creditDaysCD);

  if (salesType === 'Mixed') {
    // Mixed basket: use the longest of the DEALER's terms. The caller's
    // `fallback` must NOT join the comparison — it is a last resort, not a
    // competitor. Including it would make `Math.max(0, 0, 0, 30)` return 30 and
    // silently re-introduce the very bug this module exists to fix.
    const own = [regular, cd, general].filter((d) => d !== null);
    if (own.length > 0) return Math.max(...own);
    return asDayCount(fallback);
  }

  if (salesType === 'CD Sales') {
    return cd ?? general ?? asDayCount(fallback);
  }

  if (salesType === 'Regular Sale') {
    return regular ?? general ?? asDayCount(fallback);
  }

  // Unknown / unspecified sales type: the specific sub-values are not
  // meaningful, so prefer the general value.
  return general ?? regular ?? cd ?? asDayCount(fallback);
};

/**
 * Build a due date from a base date plus credit days.
 *
 * Mirrors the Sales Order / Dealer Invoice rule. Returns null when either input
 * is unusable, so a caller never persists an `Invalid Date`.
 *
 * @param {Date|string} baseDate
 * @param {number|string} creditDays  0 is valid and yields the base date itself
 * @returns {Date|null}
 */
export const addCreditDays = (baseDate, creditDays) => {
  if (!baseDate) return null;
  const days = asDayCount(creditDays);
  if (days === null) return null;
  const due = new Date(baseDate);
  if (Number.isNaN(due.getTime())) return null;
  due.setDate(due.getDate() + days);
  return due;
};

export default { resolveCreditDays, addCreditDays };
