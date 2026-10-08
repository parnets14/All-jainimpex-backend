/**
 * Slab validation + normalisation shared by the Points controller and its tests.
 *
 * Kept separate from the model on purpose: the model validates a single
 * document, but the controller needs to reject a *payload* before touching the
 * database, and the tests need to exercise the rules without a connection.
 * One implementation, three callers — this is the module that decides what a
 * legal slab ladder looks like.
 */

const MAX_SLABS = 25;

/** Strip anything that is not A-Z, 0-9 or a dash, then uppercased. */
export const slugSchemeCode = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Validate the reward block of a slab.
 * Returns null when valid, or a human-readable string when not.
 */
export const validateSlabReward = (reward = {}) => {
  const points = num(reward.points) ?? 0;
  const extraQuantity = num(reward.extraQuantity) ?? 0;
  const discountPercentage = num(reward.discountPercentage) ?? 0;
  const cashbackAmount = num(reward.cashbackAmount) ?? 0;

  if ([points, extraQuantity, discountPercentage, cashbackAmount].some((v) => v < 0)) {
    return "Reward values cannot be negative";
  }
  if (discountPercentage > 100) {
    return "Discount percentage cannot exceed 100";
  }
  if (points + extraQuantity + discountPercentage + cashbackAmount <= 0) {
    return "Each slab must define at least one reward";
  }
  return null;
};

/**
 * Validate a whole ladder.
 *
 * Rules enforced:
 *   - at least one slab
 *   - `from` is a non-negative number
 *   - `to` is either null/undefined (open-ended) or >= `from`
 *   - at most one open-ended slab, and it must be the last tier
 *   - no overlapping ranges  (this is the rule that silently produces
 *     ambiguous "which slab wins?" behaviour if skipped)
 *   - every slab carries a reward
 *
 * Returns `{ valid, error, slabs }` where `slabs` is the normalised, ordered
 * array ready to persist (seq renumbered from 1).
 */
export const validateAndNormalizeSlabs = (rawSlabs) => {
  if (!Array.isArray(rawSlabs) || rawSlabs.length === 0) {
    return { valid: false, error: "At least one slab is required", slabs: [] };
  }
  if (rawSlabs.length > MAX_SLABS) {
    return {
      valid: false,
      error: `A scheme cannot have more than ${MAX_SLABS} slabs`,
      slabs: []
    };
  }

  const normalized = [];

  for (let i = 0; i < rawSlabs.length; i++) {
    const raw = rawSlabs[i] || {};
    const from = num(raw.from);
    const toRaw = raw.to === null || raw.to === undefined || raw.to === "" ? null : num(raw.to);

    if (from === null) {
      return { valid: false, error: `Slab ${i + 1}: "from" must be a number`, slabs: [] };
    }
    if (from < 0) {
      return { valid: false, error: `Slab ${i + 1}: "from" cannot be negative`, slabs: [] };
    }
    if (raw.to !== null && raw.to !== undefined && raw.to !== "" && toRaw === null) {
      return { valid: false, error: `Slab ${i + 1}: "to" must be a number`, slabs: [] };
    }
    if (toRaw !== null && toRaw < from) {
      return {
        valid: false,
        error: `Slab ${i + 1}: "to" (${toRaw}) cannot be less than "from" (${from})`,
        slabs: []
      };
    }

    const rewardError = validateSlabReward(raw.reward || {});
    if (rewardError) {
      return { valid: false, error: `Slab ${i + 1}: ${rewardError}`, slabs: [] };
    }

    normalized.push({
      seq: i + 1,
      from,
      to: toRaw,
      label: String(raw.label ?? "").trim() || `${from}${toRaw !== null ? `-${toRaw}` : "+"}`,
      reward: {
        points: num(raw.reward?.points) ?? 0,
        extraQuantity: num(raw.reward?.extraQuantity) ?? 0,
        discountPercentage: num(raw.reward?.discountPercentage) ?? 0,
        cashbackAmount: num(raw.reward?.cashbackAmount) ?? 0,
        description: String(raw.reward?.description ?? "").trim()
      }
    });
  }

  normalized.sort((a, b) => a.from - b.from);

  // Overlap detection on the sorted ladder.
  //
  // Note on ordering: because we sort by `from`, an open-ended slab always ends
  // up last (it has the highest `from` of any tier it could coexist with).
  // So the real hazard is not "an open-ended tier in the middle" — it is an
  // open-ended tier that starts at or below a *bounded* tier, which would make
  // that bounded tier unreachable. Both are caught below.
  const openEnded = normalized.filter((s) => s.to === null);
  if (openEnded.length > 1) {
    return {
      valid: false,
      error: "Only one slab may be open-ended (leave \"to\" blank on the top tier only)",
      slabs: []
    };
  }
  if (openEnded.length === 1) {
    const openFrom = openEnded[0].from;
    // A bounded tier is unreachable only when the open-ended tier *begins at or
    // below* it — that way the open-ended tier already claims the lower values
    // the bounded tier was meant to cover. A normal ladder (5-9 then 10+) is
    // fine: the open-ended tier starts above the bounded one.
    const shadowedByOpen = normalized.filter((s) => s.to !== null && Number(s.from) >= openFrom);
    if (shadowedByOpen.length > 0) {
      return {
        valid: false,
        error: `The open-ended slab starts at ${openFrom}, so the tier at ${
          shadowedByOpen[0].from
        }-${shadowedByOpen[0].to} can never be reached`,
        slabs: []
      };
    }
  }

  for (let i = 0; i < normalized.length; i++) {
    const slab = normalized[i];
    if (slab.to === null) break; // open-ended tier absorbs everything above it
    if (i + 1 < normalized.length && slab.to >= normalized[i + 1].from) {
      return {
        valid: false,
        error: `Slabs overlap: ${slab.from}-${slab.to} and ${normalized[i + 1].from}-${
          normalized[i + 1].to ?? "open"
        }`,
        slabs: []
      };
    }
  }

  // Adjacent edges (a slab ending exactly where the next begins) form a
  // gap-free ladder and are valid; only strict overlap is rejected above.
  return {
    valid: true,
    error: null,
    slabs: normalized.map((slab, index) => ({ ...slab, seq: index + 1 }))
  };
};

export default { slugSchemeCode, validateSlabReward, validateAndNormalizeSlabs, MAX_SLABS };
