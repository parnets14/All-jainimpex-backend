import { schemeSchema } from '../models/Scheme.js';
import { schemeProgressSchema } from '../models/SchemeProgress.js';
import { schemeApplicationSchema } from '../models/SchemeApplication.js';
import { productSchema } from '../models/Product.js';
import { dealerSchema } from '../models/Dealer.js';

/**
 * schemeEngine — the single server-authoritative implementation of offer
 * matching, slab evaluation and progress accumulation.
 *
 * Design rules (agreed with the business):
 *  1. Sales type (Regular Sale / CD Sales) is NOT a matching dimension. A split
 *     order only changes filing/credit-days; a brand/category/subcategory scheme
 *     applies to both types and their quantities accumulate together.
 *  2. Slab selection is HIGHEST QUALIFYING ONLY, never additive.
 *  3. Progress is shown on the Sales Order as ADVISORY only. Achievements are
 *     frozen only when a Dealer Invoice is approved.
 *  4. Progress is keyed on dealer + scheme + window and accumulates line-level
 *     contributions, so it survives order splitting, partial dispatch and
 *     cancellation.
 */

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value._id) return value._id.toString();
  return value.toString();
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const getSchemeModels = (dbConnection) => ({
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema),
  SchemeProgress: dbConnection.models.SchemeProgress
    || dbConnection.model('SchemeProgress', schemeProgressSchema),
  SchemeApplication: dbConnection.models.SchemeApplication
    || dbConnection.model('SchemeApplication', schemeApplicationSchema),
  Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
  Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema)
});

// ---------------------------------------------------------------------------
// Pure helpers (no DB) — unit-testable
// ---------------------------------------------------------------------------

/**
 * Normalise one source line into the shape the matcher understands.
 * Accepts either a Sales Order line or a Dealer Invoice line.
 */
export const normalizeLine = (line = {}) => {
  const product = line.product || {};
  return {
    productId: toId(line.productId || line.product || product),
    productCode: line.productCode || product.productCode || '',
    productName: line.productName || product.productName || product.itemName || '',
    brandId: toId(line.brandId || product.brand || line.brand),
    categoryId: toId(line.categoryId || product.category || line.category),
    subcategoryId: toId(line.subcategoryId || product.subcategory || line.subcategory),
    brandName: typeof line.brand === 'string' ? line.brand : (product.brand?.name || ''),
    categoryName: typeof line.category === 'string' ? line.category : (product.category?.name || ''),
    subcategoryName: typeof line.subcategory === 'string'
      ? line.subcategory
      : (product.subcategory?.name || ''),
    salesType: line.salesType || product.salesType || '',
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice || line.mrp),
    amount: toNumber(line.amount ?? (toNumber(line.quantity) * toNumber(line.unitPrice || line.mrp)))
  };
};

/**
 * Fill in the product hierarchy (brand / category / subcategory) on raw lines.
 *
 * WHY THIS EXISTS
 * A scheme can be scoped to a brand, category or subcategory, and
 * `lineMatchesScope` compares IDS. But neither source document carries them:
 *
 *   - a Sales Order line stores only `product`, `productCode`, `productName` —
 *     there is no brand on the order at all;
 *   - a Dealer Invoice line stores the brand as a NAME string.
 *
 * So a brand-scoped scheme matched NOTHING on the way in and recorded zero
 * progress: it sat at "still in progress" forever, however much the dealer
 * bought. (A `product`-scoped scheme was unaffected, because the product id IS on
 * the line — which is why this hid for so long.)
 *
 * The hierarchy lives on the Product master, so resolve it once per document.
 * Lines that already carry the ids (the Sales Order preview sends them) are left
 * alone, and a product that cannot be found passes through untouched.
 */
export const enrichLinesWithProductScope = async (dbConnection, lines = []) => {
  const raw = Array.isArray(lines) ? lines : [];
  if (raw.length === 0) return raw;

  const normalized = raw.map(normalizeLine);
  const missing = normalized.some((n) => !n.brandId || !n.categoryId || !n.subcategoryId);
  if (!missing) return raw;

  const ids = [...new Set(normalized.map((n) => n.productId).filter(Boolean))];
  if (ids.length === 0) return raw;

  // Never let this break recording. A scheme scoped to "all products" does not
  // need the hierarchy at all, and losing every scheme's progress because one
  // lookup failed would be far worse than losing the brand-scoped ones.
  let products = [];
  try {
    const { Product } = getSchemeModels(dbConnection);
    products = await Product.find({ _id: { $in: ids } })
      .select('brand category subcategory itemName productCode')
      .lean();
  } catch (error) {
    console.error('schemeEngine: could not resolve product hierarchy —', error.message);
    return raw;
  }

  const byId = new Map(products.map((p) => [String(p._id), p]));

  return raw.map((line, index) => {
    const n = normalized[index];
    const product = byId.get(String(n.productId));
    if (!product) return line;
    return {
      ...line,
      brandId: n.brandId || toId(product.brand),
      categoryId: n.categoryId || toId(product.category),
      subcategoryId: n.subcategoryId || toId(product.subcategory),
      productCode: n.productCode || product.productCode || '',
      productName: n.productName || product.itemName || ''
    };
  });
};

/**
 * Does one line fall inside a scheme's scope?
 * Sales type is deliberately ignored — CD and Regular both count.
 */
export const lineMatchesScope = (line, scope = {}) => {
  const level = scope.level || 'all';
  if (level === 'all') return true;

  const inList = (list, id) => {
    if (!list || list.length === 0) return null; // not constrained
    return list.some((entry) => toId(entry) === id);
  };

  if (level === 'brand') {
    const hit = inList(scope.brand ? [scope.brand] : [], line.brandId);
    return hit === null ? true : hit;
  }
  if (level === 'category') {
    const hit = inList(scope.category ? [scope.category] : [], line.categoryId);
    return hit === null ? true : hit;
  }
  if (level === 'subcategory') {
    const hit = inList(scope.subcategory ? [scope.subcategory] : [], line.subcategoryId);
    return hit === null ? true : hit;
  }
  if (level === 'product') {
    const hit = inList(scope.products || [], line.productId);
    return hit === null ? true : hit;
  }
  if (level === 'mix') {
    // The line only needs to belong to at least one group; the per-group minimum
    // is enforced separately by evaluateMixGroups.
    return (scope.mixGroups || []).some((group) => mixGroupMatchesLine(group, line));
  }
  return false;
};

export const mixGroupMatchesLine = (group = {}, line = {}) => {
  const hasProducts = Array.isArray(group.products) && group.products.length > 0;
  if (hasProducts) {
    return group.products.some((p) => toId(p) === line.productId);
  }
  if (group.brand && toId(group.brand) !== line.brandId) return false;
  if (group.category && toId(group.category) !== line.categoryId) return false;
  if (group.subcategory && toId(group.subcategory) !== line.subcategoryId) return false;
  return Boolean(group.brand || group.category || group.subcategory);
};

/**
 * Does the dealer fall inside the scheme's dealer targeting?
 */
export const dealerMatchesScope = (dealer = {}, dealerScope = {}) => {
  const any = (list) => Array.isArray(list) && list.length > 0;
  if (any(dealerScope.dealers)) {
    return dealerScope.dealers.some((d) => toId(d) === toId(dealer._id || dealer));
  }
  if (any(dealerScope.routes) && dealer.routeId) {
    if (!dealerScope.routes.some((r) => toId(r) === toId(dealer.routeId))) return false;
  }
  if (any(dealerScope.regions) && dealer.regionId) {
    if (!dealerScope.regions.some((r) => toId(r) === toId(dealer.regionId))) return false;
  }
  if (any(dealerScope.dealerTypes)) {
    const types = Array.isArray(dealer.dealerType) ? dealer.dealerType : [dealer.dealerType];
    if (!types.some((t) => dealerScope.dealerTypes.includes(t))) return false;
  }
  if (any(dealerScope.dealerCategories)) {
    const cats = dealer.dealerCategory || dealer.categoryIds || [];
    const ids = (Array.isArray(cats) ? cats : [cats]).map(toId).filter(Boolean);
    if (!dealerScope.dealerCategories.some((c) => ids.includes(toId(c)))) return false;
  }
  return true;
};

/**
 * Is the scheme live at a given moment?
 */
export const schemeIsLive = (scheme, at = new Date()) => {
  if (!scheme) return false;
  const status = scheme.status || 'Active';
  if (status !== 'Active') return false;
  const from = scheme.validFrom ? new Date(scheme.validFrom) : null;
  const to = scheme.validTo ? new Date(scheme.validTo) : null;
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
};

/**
 * Highest qualifying slab for a measured value. Never additive.
 *
 * `creditDays` (optional) restricts the candidate slabs to those whose payment-terms
 * window covers it. A slab with no payment terms (0 / null) always passes, so
 * schemes that never used the feature behave exactly as before.
 */
export const resolveSlab = (slabs = [], measuredValue = 0, creditDays = null) => {
  const value = toNumber(measuredValue);
  const hasCreditTarget = creditDays !== null && creditDays !== undefined;
  const days = toNumber(creditDays);

  const qualifying = slabs.filter((slab) => {
    const from = toNumber(slab.from);
    const to = slab.to === null || slab.to === undefined ? Infinity : toNumber(slab.to);
    if (value < from || value > to) return false;

    if (!hasCreditTarget) return true;

    const terms = slab.paymentTerms || {};
    const termsFrom = toNumber(terms.fromCreditDays);
    const termsTo =
      terms.toCreditDays === null || terms.toCreditDays === undefined
        ? null
        : toNumber(terms.toCreditDays);

    if (termsFrom === 0 && termsTo === null) return true;
    return days >= termsFrom && (termsTo === null || days <= termsTo);
  });

  if (qualifying.length === 0) return null;
  return qualifying.reduce((best, slab) =>
    (toNumber(slab.from) > toNumber(best.from) ? slab : best)
  );
};

/**
 * Does a scheme's slab set actually use payment terms anywhere?
 * Used to decide whether the payment dimension is worth reporting.
 */
export const slabsUsePaymentTerms = (slabs = []) =>
  (slabs || []).some((slab) => {
    const terms = slab.paymentTerms || {};
    const from = toNumber(terms.fromCreditDays);
    const to =
      terms.toCreditDays === null || terms.toCreditDays === undefined
        ? null
        : toNumber(terms.toCreditDays);
    return !(from === 0 && to === null);
  });

/**
 * Does a slab's payment window cover the given credit days?
 * Exported for the UI and tests.
 */
export const slabMatchesPaymentTerms = (slab, creditDays) => {
  const terms = slab?.paymentTerms || {};
  const termsFrom = toNumber(terms.fromCreditDays);
  const termsTo =
    terms.toCreditDays === null || terms.toCreditDays === undefined
      ? null
      : toNumber(terms.toCreditDays);
  if (termsFrom === 0 && termsTo === null) return true;
  const days = toNumber(creditDays);
  return days >= termsFrom && (termsTo === null || days <= termsTo);
};

/**
 * The next slab above the current measured value — powers the
 * "5 more to unlock" hint on the Sales Order.
 */
export const resolveNextSlab = (slabs = [], measuredValue = 0) => {
  const value = toNumber(measuredValue);
  const upcoming = (slabs || [])
    .filter((slab) => toNumber(slab.from) > value)
    .sort((a, b) => toNumber(a.from) - toNumber(b.from));
  return upcoming[0] || null;
};

/**
 * For a scheme whose scope is 'mix', verify every group met its minimum.
 * Returns { satisfied, groups: [{name, measuredQuantity, measuredAmount, ok}] }
 *
 * `basis` ('quantity' | 'amount') is the value ratios are computed on. Groups that
 * declare a `ratioPercentage` must ALSO reach that share of the total qualifying
 * value — that is the Ratio mode (Pipes 50% / Fittings 50%).
 */
export const evaluateMixGroups = (scope = {}, lines = [], basis = 'quantity') => {
  const groups = (scope.mixGroups || []).map((group) => {
    const matched = lines.filter((line) => mixGroupMatchesLine(group, line));
    const measuredQuantity = matched.reduce((s, l) => s + toNumber(l.quantity), 0);
    const measuredAmount = matched.reduce((s, l) => s + toNumber(l.amount), 0);
    const okQuantity = measuredQuantity >= toNumber(group.minQuantity);
    const okAmount = measuredAmount >= toNumber(group.minAmount);
    const value = basis === 'amount' ? measuredAmount : measuredQuantity;
    return {
      groupName: group.groupName || '',
      measuredQuantity,
      measuredAmount,
      measuredValue: value,
      minQuantity: toNumber(group.minQuantity),
      minAmount: toNumber(group.minAmount),
      ratioPercentage: toNumber(group.ratioPercentage),
      sharePercentage: 0,
      requiredShare: toNumber(group.ratioPercentage),
      ratioOk: true,
      ok: okQuantity && okAmount
    };
  });

  // Ratio pass. Only groups that declare a ratio participate; the declared ratios
  // are normalised against their own sum, so 50/50 and 70/30 both behave.
  //
  // The denominator is the RATIO groups' own total, NOT every group's. A scheme
  // may mix a mandatory group (min 5 pcs, no ratio) with ratio groups (Pipes 50 /
  // Fittings 50); including the mandatory group would dilute both shares and make
  // the 50/50 rule unsatisfiable no matter what the dealer bought.
  const ratioGroups = groups.filter((g) => g.ratioPercentage > 0);
  const ratioSum = ratioGroups.reduce((s, g) => s + g.ratioPercentage, 0);
  const ratioTotal = ratioGroups.reduce((s, g) => s + g.measuredValue, 0);

  if (ratioGroups.length > 0 && ratioTotal > 0) {
    for (const g of ratioGroups) {
      const required = ratioSum > 0 ? (g.ratioPercentage / ratioSum) * 100 : 0;
      g.sharePercentage = (g.measuredValue / ratioTotal) * 100;
      g.requiredShare = required;
      g.ratioOk = g.sharePercentage + 0.01 >= required; // tolerate float drift
      if (!g.ratioOk) g.ok = false;
    }
  } else if (ratioGroups.length > 0) {
    // Nothing measured -> no ratio group can hold its share.
    for (const g of ratioGroups) {
      g.sharePercentage = 0;
      g.requiredShare = ratioSum > 0 ? (g.ratioPercentage / ratioSum) * 100 : 0;
      g.ratioOk = false;
      g.ok = false;
    }
  }

  return { satisfied: groups.length > 0 && groups.every((g) => g.ok), groups };
};

/**
 * Resolve per-product ladders (schema item #3).
 *
 * Given a scheme's `productSlabs[]` and the qualifying lines, return one entry per
 * configured product with its own measured value and its own highest qualifying slab.
 * Each product is measured ONLY on its own lines, so Product A can be at slab 2 while
 * Product B is still at slab 1.
 */
export const evaluateProductSlabs = (productSlabs = [], lines = [], {
  basis = 'quantity',
  creditDays = null
} = {}) => {
  return (productSlabs || []).map((group) => {
    const productId = toId(group.product);
    const matched = lines.filter((line) => toId(line.productId) === productId);
    const measuredValue = measureLines(matched, basis);
    const slab = resolveSlab(group.slabs || [], measuredValue, creditDays);
    const nextSlab = resolveNextSlab(group.slabs || [], measuredValue);
    return {
      product: productId,
      label: group.label || '',
      measuredValue,
      matchedQuantity: matched.reduce((s, l) => s + toNumber(l.quantity), 0),
      matchedAmount: matched.reduce((s, l) => s + toNumber(l.amount), 0),
      slab,
      nextSlab,
      // A product with NO lines cannot earn its ladder, even when tier 1 starts at
      // 0 (which makes `resolveSlab` return that zero-reward tier). Without the
      // line check every configured product would report as "eligible" on every
      // basket, and the commit would freeze empty achievements for products the
      // dealer never bought.
      eligible: matched.length > 0 && Boolean(slab)
    };
  });
};

/**
 * Does a slab reward actually give the dealer anything?
 *
 * The recommended ladder layout starts rung 1 at `from: 0` with a ZERO reward, so
 * a small order earns nothing while still being "inside" the ladder. Committing
 * that tier would create a pending "0 points" row in the Rewards tab for every
 * dealer who bought anything in scope — noise, and not a reward. So a valueless
 * ladder is never committed.
 */
export const rewardHasValue = (reward = {}) =>
  toNumber(reward.points) > 0
  || toNumber(reward.percentage) > 0
  || toNumber(reward.amount) > 0
  || toNumber(reward.freeItemQuantity) > 0
  || Boolean(reward.giftName && String(reward.giftName).trim());

/**
 * The measured value for a set of lines under a scheme's basis.
 */
export const measureLines = (lines = [], basis = 'quantity') => {
  const quantity = lines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const amount = lines.reduce((sum, line) => sum + toNumber(line.amount), 0);
  return basis === 'amount' ? amount : quantity;
};

/**
 * Core matcher: given a dealer + lines, return every scheme that matches along
 * with the qualifying lines, current progress and the slab achieved.
 *
 * `existingProgressByScheme` maps schemeId -> measured value already banked from
 * earlier documents (so cumulative schemes show a running total).
 */
export const evaluateSchemes = ({
  schemes = [],
  dealer = {},
  lines = [],
  at = new Date(),
  existingProgressByScheme = {},
  paymentTerms = null
} = {}) => {
  const results = [];

  // Defensive: callers may hand us raw database lines ({ productId, quantity, mrp })
  // rather than normalized ones. Without this, `measureLines` reads `line.amount`
  // which only `normalizeLine` computes from mrp/unitPrice — so a raw line would
  // silently measure ₹0. normalizeLine is idempotent, so re-normalizing a line that
  // already went through it is harmless.
  const normalizedLines = lines.map(normalizeLine);

  for (const scheme of schemes) {
    if (!schemeIsLive(scheme, at)) continue;
    if (scheme.appliesTo && scheme.appliesTo !== 'dealer') continue;
    if (!dealerMatchesScope(dealer, scheme.dealerScope || {})) continue;

    const qualifyingLines = normalizedLines.filter((line) => lineMatchesScope(line, scheme.scope || {}));
    if (qualifyingLines.length === 0) continue;

    const basis = scheme.condition?.basis || 'quantity';
    const accumulation = scheme.condition?.accumulation || 'cumulative';
    const thisDocumentValue = measureLines(qualifyingLines, basis);

    // Mix scope must also satisfy every group minimum (and every declared ratio).
    let mixEvaluation = null;
    if ((scheme.scope?.level) === 'mix') {
      mixEvaluation = evaluateMixGroups(scheme.scope, qualifyingLines, basis);
    }

    // Cumulative schemes add what is already banked for this dealer.
    const banked = accumulation === 'cumulative'
      ? toNumber(existingProgressByScheme[toId(scheme._id)] || 0)
      : 0;
    const measuredValue = banked + thisDocumentValue;

    // Payment-terms dimension. `paymentTerms` may be a number (credit days) or an
    // object { creditDays }. Untargeted slabs always pass, so this is inert unless
    // the admin actually configured payment terms on a slab.
    const creditDays = paymentTerms === null || paymentTerms === undefined
      ? null
      : (typeof paymentTerms === 'object'
        ? toNumber(paymentTerms.creditDays)
        : toNumber(paymentTerms));
    const usesPaymentTerms = slabsUsePaymentTerms(scheme.slabs || []);

    const slab = resolveSlab(scheme.slabs || [], measuredValue, usesPaymentTerms ? creditDays : null);
    const nextSlab = resolveNextSlab(scheme.slabs || [], measuredValue);

    // Per-product ladders (item #3). Each product resolves its own ladder on its
    // own lines, independently of the scheme-level slab above.
    const productSlabEvaluation = (scheme.productSlabs || []).length > 0
      ? evaluateProductSlabs(scheme.productSlabs, qualifyingLines, {
        basis,
        creditDays: usesPaymentTerms ? creditDays : null
      })
      : null;
    const productSlabHits = (productSlabEvaluation || []).filter((p) => p.eligible);

    // A scheme is payable when a slab ACTUALLY resolved — on the flat ladder or on
    // any per-product ladder. A mix scope must additionally have every group
    // satisfied.
    //
    // This used to be `measuredValue >= slabs[0].from`, which is only a proxy and
    // is wrong once payment-term lanes split the ladder: a value can sit above the
    // lowest `from` in the array yet match no slab in the applicable lane (buy 5
    // with 30-day terms, when the 30-day ladder starts at 8). The proxy reported
    // that as eligible; nothing was ever handed over.
    const flatPays = Boolean(slab) && (!mixEvaluation || mixEvaluation.satisfied);
    const eligible = flatPays || productSlabHits.length > 0;

    results.push({
      scheme,
      schemeId: toId(scheme._id),
      schemeCode: scheme.schemeCode,
      schemeName: scheme.schemeName,
      basis,
      accumulation,
      qualifyingLines,
      thisDocumentValue,
      bankedValue: banked,
      measuredValue,
      mixEvaluation,
      creditDays,
      usesPaymentTerms,
      eligible,
      slab,
      nextSlab,
      productSlabEvaluation,
      productSlabHits,
      // What would be handed over right now, if anything.
      entitlement: slab ? { slab, reward: slab.reward, measuredValue } : null
    });
  }

  // Highest priority first so consumers can simply take [0] when they want one.
  return results.sort((a, b) => toNumber(b.scheme.priority) - toNumber(a.scheme.priority));
};

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------
/**
 * Load the schemes that could apply to a dealer, without evaluating lines.
 */
export const loadCandidateSchemes = async (dbConnection, { appliesTo = 'dealer', at = new Date() } = {}) => {
  const { Scheme } = getSchemeModels(dbConnection);
  return Scheme.find({
    appliesTo,
    status: 'Active',
    validFrom: { $lte: at },
    validTo: { $gte: at }
  })
    .populate('scope.brand', 'name')
    .populate('scope.category', 'name')
    .populate('scope.subcategory', 'name')
    .populate('scope.brand', 'name')
    .lean();
};

/**
 * Read the banked measured value per scheme for a dealer inside its window.
 * Returns { [schemeId]: measuredValue }.
 */
export const loadBankedProgress = async (dbConnection, dealerId, schemes = [], { session = null } = {}) => {
  const { SchemeProgress } = getSchemeModels(dbConnection);
  const ids = schemes.map((s) => toId(s._id)).filter(Boolean);
  if (ids.length === 0) return {};

  let query = SchemeProgress.find({ dealer: dealerId, scheme: { $in: ids } });
  if (session) query = query.session(session);
  const rows = await query.lean();

  const byScheme = {};
  for (const row of rows) {
    const key = toId(row.scheme);
    const value = row.basis === 'amount'
      ? toNumber(row.measuredAmount)
      : toNumber(row.measuredQuantity);
    byScheme[key] = toNumber(byScheme[key]) + value;
  }
  return byScheme;
};

/**
 * Preview used by the Sales Order screen. ADVISORY ONLY — writes nothing.
 *
 * Returns, per line, the schemes it qualifies for plus the running progress so
 * the salesperson can see "5/10 pcs — 5 more to unlock 1 free".
 */
export const previewSchemesForLines = async (dbConnection, { dealerId, lines = [], at = new Date(), paymentTerms = null } = {}) => {
  const { Dealer } = getSchemeModels(dbConnection);
  const dealer = dealerId ? await Dealer.findById(dealerId).lean() : null;
  if (!dealer) return { dealerId, schemes: [], lines: [] };

  const schemes = await loadCandidateSchemes(dbConnection, { appliesTo: 'dealer', at });
  const banked = await loadBankedProgress(dbConnection, dealerId, schemes);

  // Normally a no-op (the Sales Order screen sends brandId already), but the
  // invoice/preview callers may not — keep the two paths consistent.
  const scopedLines = await enrichLinesWithProductScope(dbConnection, lines);
  const normalizedLines = scopedLines.map(normalizeLine);
  const evaluated = evaluateSchemes({
    schemes,
    dealer,
    lines: normalizedLines,
    at,
    existingProgressByScheme: banked,
    paymentTerms
  });

  return {
    dealerId: toId(dealerId),
    dealerName: dealer.name,
    schemes: evaluated.map((entry) => ({
      schemeId: entry.schemeId,
      schemeCode: entry.schemeCode,
      schemeName: entry.schemeName,
      basis: entry.basis,
      accumulation: entry.accumulation,
      measuredValue: entry.measuredValue,
      thisDocumentValue: entry.thisDocumentValue,
      bankedValue: entry.bankedValue,
      eligible: entry.eligible,
      achievedSlab: entry.slab
        ? {
          slabSeq: entry.slab.seq,
          label: entry.slab.label,
          from: entry.slab.from,
          to: entry.slab.to,
          reward: entry.slab.reward
        }
        : null,
      nextSlab: entry.nextSlab
        ? {
          slabSeq: entry.nextSlab.seq,
          label: entry.nextSlab.label,
          from: entry.nextSlab.from,
          to: entry.nextSlab.to,
          reward: entry.nextSlab.reward,
          remaining: Math.max(0, toNumber(entry.nextSlab.from) - entry.measuredValue)
        }
        : null,
      matchingProductIds: entry.qualifyingLines.map((l) => l.productId).filter(Boolean),
      mixEvaluation: entry.mixEvaluation,
      // Per-product ladders (item #3) — one row per configured product.
      productSlabs: (entry.productSlabEvaluation || []).map((p) => ({
        productId: p.product,
        label: p.label,
        measuredValue: p.measuredValue,
        eligible: p.eligible,
        achievedSlab: p.slab
          ? {
            slabSeq: p.slab.seq,
            label: p.slab.label,
            from: p.slab.from,
            to: p.slab.to,
            reward: p.slab.reward
          }
          : null,
        nextSlab: p.nextSlab
          ? {
            slabSeq: p.nextSlab.seq,
            label: p.nextSlab.label,
            from: p.nextSlab.from,
            to: p.nextSlab.to,
            reward: p.nextSlab.reward,
            remaining: Math.max(0, toNumber(p.nextSlab.from) - p.measuredValue)
          }
          : null
      })),
      // Payment-terms dimension (item #11).
      usesPaymentTerms: entry.usesPaymentTerms,
      creditDays: entry.creditDays,
      // Ratio status (item #9) is inside mixEvaluation.groups[].{sharePercentage,ratioOk}
    }))
  };
};

/**
 * Build a contribution record from a source line + the scheme entry that matched
 * it. Used when committing a document into the progress bucket.
 */
export const buildContribution = ({
  line,
  documentType,
  documentId,
  documentNumber,
  lineId = null,
  orderGroupId = null,
  counted = true,
  exclusionReason = '',
  occurredAt = new Date(),
  mixGroupName = ''
}) => {
  const normalized = normalizeLine(line);
  return {
    documentType,
    documentId,
    documentNumber: documentNumber || '',
    lineId,
    orderGroupId,
    product: normalized.productId,
    productCode: normalized.productCode,
    productName: normalized.productName,
    brand: normalized.brandName,
    category: normalized.categoryName,
    subcategory: normalized.subcategoryName,
    salesType: normalized.salesType,
    quantity: normalized.quantity,
    unitPrice: normalized.unitPrice,
    amount: normalized.amount,
    mixGroupName,
    counted,
    exclusionReason,
    occurredAt
  };
};

/**
 * Pick the free product for a slab's freeItem reward out of the qualifying lines.
 *   sameProduct   -> the first qualifying product (repeat of what was bought)
 *   lowestPrice   -> the qualifying line with the lowest unit price
 *   equalOrLower  -> same as lowestPrice, but never above the highest qualifying price
 *   specificProduct -> the configured product
 */
export const resolveFreeItemProduct = (slab, qualifyingLines = []) => {
  const reward = slab?.reward || {};
  const rule = reward.freeItemRule || 'sameProduct';

  if (rule === 'specificProduct' && reward.freeItemProduct) {
    const match = qualifyingLines.find((l) => l.productId === toId(reward.freeItemProduct));
    return {
      productId: toId(reward.freeItemProduct),
      productName: match?.productName || '',
      unitPrice: match?.unitPrice ?? 0,
      rule
    };
  }

  if (qualifyingLines.length === 0) return null;

  const sorted = [...qualifyingLines].sort((a, b) => toNumber(a.unitPrice) - toNumber(b.unitPrice));

  if (rule === 'lowestPrice' || rule === 'equalOrLower') {
    const cheapest = sorted[0];
    return {
      productId: cheapest.productId,
      productName: cheapest.productName,
      unitPrice: cheapest.unitPrice,
      rule
    };
  }

  // sameProduct — recommend the most expensive qualifying line so the dealer
  // gets the best value out of "same product free".
  const dearest = sorted[sorted.length - 1];
  return {
    productId: dearest.productId,
    productName: dearest.productName,
    unitPrice: dearest.unitPrice,
    rule
  };
};

// ---------------------------------------------------------------------------
// Commit helpers — the ONLY writers into the progress buckets
// ---------------------------------------------------------------------------

/**
 * Record an order's lines into the dealer's progress buckets, replacing any
 * contribution previously recorded for the same document.
 *
 * ADVISORY. Measured totals update so the register shows live progress, but no
 * slab is crossed and nothing is handed over here — frozen at invoice approval.
 * Idempotent: saving the same order twice does not double-count.
 *
 * @returns {Promise<{buckets: number, replaced: number}>}
 */
export const recordOrderContributions = async (dbConnection, {
  dealerId,
  orderId,
  documentNumber = '',
  orderGroupId = null,
  lines = [],
  at = new Date(),
  session = null,
  // Opt-in gate. `null`/`undefined` = legacy behaviour (every matching scheme
  // counts). An ARRAY — including an empty one — restricts this document to
  // exactly those scheme ids, so a scheme the salesman did not tick is neither
  // counted nor left with a stale contribution from an earlier save.
  schemeIds = null
} = {}) => {
  const { SchemeProgress, Dealer } = getSchemeModels(dbConnection);
  const dealer = dealerId ? await Dealer.findById(dealerId).lean() : null;
  if (!dealer) return { buckets: 0, replaced: 0 };

  const schemes = await loadCandidateSchemes(dbConnection, { appliesTo: 'dealer', at });
  if (schemes.length === 0) return { buckets: 0, replaced: 0 };

  const gated = Array.isArray(schemeIds);
  const allowed = gated ? new Set(schemeIds.map(toId)) : null;

  const existing = await loadBankedProgress(dbConnection, dealerId, schemes, { session });
  // A Sales Order line carries no brand/category, so resolve the hierarchy from
  // the Product master before matching. Without this a brand-scoped scheme
  // records nothing at all.
  const scopedLines = await enrichLinesWithProductScope(dbConnection, lines);
  const normalizedLines = scopedLines.map(normalizeLine);

  const evaluated = evaluateSchemes({
    schemes,
    dealer,
    lines: normalizedLines,
    at,
    existingProgressByScheme: existing
  });

  let replaced = 0;
  for (const entry of evaluated) {
    const scheme = entry.scheme;

    if (gated && !allowed.has(toId(entry.schemeId))) {
      // Opted out on this order. If a previous save had counted it, take this
      // order's lines back out so the register reflects the current choice.
      const stale = await SchemeProgress.findOne({
        dealer: dealer._id,
        scheme: scheme._id,
        windowFrom: new Date(scheme.validFrom),
        windowTo: new Date(scheme.validTo)
      }).session(session);
      if (stale) {
        const before = stale.contributions.length;
        stale.contributions = stale.contributions.filter(
          (c) => !(toId(c.documentId) === toId(orderId) && c.documentType === 'SalesOrder')
        );
        if (stale.contributions.length !== before) {
          replaced += before - stale.contributions.length;
          stale.recomputeTotals();
          stale.refreshNextSlab(scheme.slabs || []);
          await stale.save({ session });
        }
      }
      continue;
    }

    const contributions = entry.qualifyingLines.map((line) => buildContribution({
      line,
      documentType: 'SalesOrder',
      documentId: orderId,
      documentNumber,
      orderGroupId,
      counted: true,
      occurredAt: at
    }));
    if (contributions.length === 0) continue;

    const bucket = await SchemeProgress.findOneAndUpdate(
      {
        dealer: dealer._id,
        scheme: scheme._id,
        windowFrom: new Date(scheme.validFrom),
        windowTo: new Date(scheme.validTo)
      },
      {
        $set: {
          dealerName: dealer.name || '',
          dealerCode: dealer.code || '',
          schemeCode: scheme.schemeCode,
          schemeName: scheme.schemeName || '',
          basis: entry.basis,
          allowRepeat: Boolean(scheme.allowRepeat)
        },
        $setOnInsert: { contributions: [], achievements: [] }
      },
      { upsert: true, new: true, session }
    );

    const before = bucket.contributions.length;
    bucket.contributions = bucket.contributions.filter(
      (c) => !(toId(c.documentId) === toId(orderId) && c.documentType === 'SalesOrder')
    );
    replaced += before - bucket.contributions.length;

    bucket.contributions.push(...contributions);
    bucket.recomputeTotals();
    bucket.refreshNextSlab(scheme.slabs || []);
    await bucket.save({ session });
  }

  return { buckets: evaluated.length, replaced };
};

/**
 * Retire the sales-order contributions an invoice supersedes.
 *
 * A CUMULATIVE scheme must count each piece of goods ONCE. The order recorded its
 * lines when it was placed; the invoice records the same lines again at approval.
 *
 * This has to run BEFORE the invoice is evaluated, not after. Doing it afterwards
 * left the evaluation measuring (order 3 + invoice 3 = 6) and crossing a slab at a
 * total the dealer never reached — handing out rewards too early. Retiring the
 * order's rows first means the invoice is judged on the real total.
 *
 * The rows are kept for audit; they simply stop counting.
 */
const supersededOrderProgress = async (dbConnection, {
  dealerId,
  salesOrderId,
  schemes = [],
  session = null
}) => {
  const { SchemeProgress } = getSchemeModels(dbConnection);
  const byScheme = {};
  const ids = (schemes || []).map((s) => toId(s._id)).filter(Boolean);
  if (ids.length === 0) return byScheme;

  let query = SchemeProgress.find({ dealer: dealerId, scheme: { $in: ids } });
  if (session) query = query.session(session);
  const rows = await query.lean();

  for (const row of rows) {
    const total = (row.contributions || [])
      .filter((c) => c.documentType === 'SalesOrder'
        && c.counted !== false
        && toId(c.documentId) === toId(salesOrderId))
      .reduce(
        (sum, c) => sum + (row.basis === 'amount' ? toNumber(c.amount) : toNumber(c.quantity)),
        0
      );
    if (total > 0) byScheme[toId(row.scheme)] = total;
  }
  return byScheme;
};

/**
 * Freeze the slabs crossed by an approved invoice's lines.
 *
 * This is where progress becomes an achievement. For each qualifying slab we
 * append an immutable achievement record:
 *   - autoAtInvoice rewards are flagged `autoApplied` (points / extra discount
 *     are handed over at invoice time);
 *   - manual rewards are left `autoApplied: false, redeemed: false` so the
 *     Rewards module picks them up as pending entitlements.
 *
 * Upgrades are IN PLACE — a dealer who moves from slab 1 to slab 2 keeps one
 * achievement at the higher slab, never two contradictory rows.
 *
 * Idempotent: re-approving the same invoice (idempotency key path) records
 * nothing new because the bucket is returned untouched when the invoice has
 * already frozen its slabs with no continuation and the measured value is
 * unchanged.
 *
 * @returns {Promise<Array<{schemeId, schemeCode, slabSeq, slabLabel, measuredValue,
 *                          rewardType, autoApplied, rewardSnapshot, entitlement}>>}
 */
export const commitInvoiceAchievements = async (dbConnection, {
  dealerId,
  invoiceId,
  documentNumber = '',
  lines = [],
  at = new Date(),
  // The sales order this invoice was raised against. For a cumulative scheme its
  // contributions are superseded by the invoice's, so the same goods are not
  // counted twice.
  salesOrderId = null,
  session = null,
  freeItemResolver = null,
  // Payment-terms dimension (item #11). Usually the invoice's creditDays.
  creditDays = null,
  // Opt-in gate inherited from the Sales Order the invoice was raised against.
  // `null`/`undefined` = legacy (every eligible scheme rewards). An ARRAY —
  // including an empty one — freezes only those schemes.
  schemeIds = null
} = {}) => {
  const { SchemeProgress, Dealer } = getSchemeModels(dbConnection);
  const dealer = dealerId ? await Dealer.findById(dealerId).lean() : null;
  if (!dealer) return [];

  const schemes = await loadCandidateSchemes(dbConnection, { appliesTo: 'dealer', at });
  if (schemes.length === 0) return [];

  const gated = Array.isArray(schemeIds);
  const allowed = gated ? new Set(schemeIds.map(toId)) : null;

  const existing = await loadBankedProgress(dbConnection, dealerId, schemes, { session });

  // A CUMULATIVE scheme must count each piece of goods ONCE.
  //
  // The sales order already banked these lines, and the invoice carries them
  // again — so without this the invoice would be evaluated against
  // (order 3 + invoice 3 = 6) and cross a slab at a total the dealer never
  // reached, handing out a reward too early.
  //
  // The order's rows stay counted (for a cumulative scheme the order IS the
  // running total); the superseded amount is only subtracted from what the
  // invoice is judged on.
  const superseded = salesOrderId
    ? await supersededOrderProgress(dbConnection, { dealerId, salesOrderId, schemes, session })
    : {};
  for (const [schemeId, value] of Object.entries(superseded)) {
    existing[schemeId] = Math.max(0, toNumber(existing[schemeId]) - value);
  }
  // A Dealer Invoice line carries the brand as a NAME, not an id — resolve the
  // hierarchy from the Product master before matching.
  const scopedLines = await enrichLinesWithProductScope(dbConnection, lines);
  const normalizedLines = scopedLines.map(normalizeLine);

  const evaluated = evaluateSchemes({
    schemes,
    dealer,
    lines: normalizedLines,
    at,
    existingProgressByScheme: existing,
    paymentTerms: creditDays
  });

  const frozen = [];
  for (const entry of evaluated) {
    if (gated && !allowed.has(toId(entry.schemeId))) continue;
    if (!entry.eligible) continue;

    const scheme = entry.scheme;

    // Every ladder that hit on this invoice: the scheme's flat ladder, plus one
    // entry per per-product ladder (item #3).
    //
    // A scheme may be configured with ONLY per-product ladders — that is the
    // natural way to express "Product A: 5 -> 1 free, Product B: 10 -> 1 free" —
    // so a null `entry.slab` is NOT a reason to skip the scheme. Previously it
    // was, which meant per-product rewards were previewed on the Sales Order but
    // never frozen into an achievement, so they never actually paid out.
    //
    // Ladders whose reward is empty are dropped: a "0 points" tier is a step in
    // the ladder, not something to hand over.
    const ladders = [];
    if (entry.slab && rewardHasValue(entry.slab.reward)) {
      ladders.push({
        slab: entry.slab,
        product: null,
        ladderLabel: '',
        measuredValue: entry.measuredValue
      });
    }
    for (const hit of entry.productSlabHits || []) {
      if (!rewardHasValue(hit.slab?.reward)) continue;
      ladders.push({
        slab: hit.slab,
        product: hit.product,
        ladderLabel: hit.label || '',
        measuredValue: hit.measuredValue
      });
    }
    if (ladders.length === 0) continue;

    const bucket = await SchemeProgress.findOneAndUpdate(
      {
        dealer: dealer._id,
        scheme: scheme._id,
        windowFrom: new Date(scheme.validFrom),
        windowTo: new Date(scheme.validTo)
      },
      {
        $set: {
          dealerName: dealer.name || '',
          dealerCode: dealer.code || '',
          schemeCode: scheme.schemeCode,
          schemeName: scheme.schemeName || '',
          basis: entry.basis,
          allowRepeat: Boolean(scheme.allowRepeat)
        },
        $setOnInsert: { contributions: [], achievements: [] }
      },
      { upsert: true, new: true, session }
    );

    // Keep the bucket honest: add this invoice's own lines as contributions so a
    // perInvoice scheme starts from a correct baseline.
    const contributions = entry.qualifyingLines.map((line) => buildContribution({
      line,
      documentType: 'DealerInvoice',
      documentId: invoiceId,
      documentNumber,
      counted: true,
      occurredAt: at
    }));
    // For a CUMULATIVE scheme the order's rows already represent these goods, so
    // adding the invoice's would double the bucket. For a perInvoice scheme the
    // order's rows never count towards the evaluation, so the invoice's are the
    // only record and must be added.
    const skipBecauseSuperseded = entry.accumulation === 'cumulative'
      && toNumber(superseded[toId(scheme._id)]) > 0;

    if (contributions.length > 0 && !skipBecauseSuperseded) {
      bucket.contributions = bucket.contributions.filter(
        (c) => !(toId(c.documentId) === toId(invoiceId) && c.documentType === 'DealerInvoice')
      );
      bucket.contributions.push(...contributions);
      bucket.recomputeTotals();
    }
    bucket.refreshNextSlab(scheme.slabs || []);

    const autoApplied = (scheme.redemptionMode || 'manual') === 'autoAtInvoice';

    // One pass per ladder. Achievement rows are scoped by product, so the flat
    // ladder and each product ladder upgrade independently of one another.
    for (const ladder of ladders) {
      const slab = ladder.slab;
      const reward = slab.reward || {};

      // Highest already-frozen achievement for THIS ladder.
      let existingIndex = -1;
      let existingSeq = -Infinity;
      bucket.achievements.forEach((a, index) => {
        if (a.revocationPending) return;
        if (toId(a.product) !== toId(ladder.product)) return;
        if (toNumber(a.slabSeq) > existingSeq) {
          existingSeq = toNumber(a.slabSeq);
          existingIndex = index;
        }
      });

      const snapshot = {
        type: reward.type,
        points: toNumber(reward.points),
        percentage: toNumber(reward.percentage),
        amount: toNumber(reward.amount),
        freeItemQuantity: toNumber(reward.freeItemQuantity),
        freeItemRule: reward.freeItemRule || '',
        giftName: reward.giftName || '',
        description: reward.description || ''
      };

      const nextEntry = {
        schemeId: toId(scheme._id),
        schemeCode: scheme.schemeCode,
        schemeName: scheme.schemeName || '',
        basis: entry.basis,
        accumulation: entry.accumulation,
        slabSeq: slab.seq,
        slabLabel: slab.label || '',
        // null for the flat ladder; the product id for a per-product ladder.
        product: toId(ladder.product),
        ladderLabel: ladder.ladderLabel,
        measuredValue: ladder.measuredValue,
        rewardType: reward.type,
        autoApplied,
        redemptionMode: scheme.redemptionMode || 'manual',
        // Carried so the entitlement step can enforce a one-time offer without a
        // second Scheme lookup.
        allowRepeat: Boolean(scheme.allowRepeat),
        rewardSnapshot: snapshot
      };

      const record = {
        slabSeq: slab.seq,
        slabLabel: slab.label || '',
        product: ladder.product,
        ladderLabel: ladder.ladderLabel,
        measuredValue: ladder.measuredValue,
        rewardType: reward.type,
        rewardSnapshot: snapshot,
        rewardDescription: reward.description || '',
        crossedByDocumentType: 'DealerInvoice',
        crossedByDocumentId: invoiceId,
        crossingDocumentNumber: documentNumber,
        achievedAt: at,
        autoApplied,
        autoAppliedAt: autoApplied ? at : null,
        autoAppliedDocumentId: autoApplied ? invoiceId : null,
        redeemed: autoApplied,
        redeemedAt: autoApplied ? at : null
      };

      const entitlement = autoApplied
        ? null
        : { slab, reward, measuredValue: ladder.measuredValue };

      if (existingIndex >= 0 && toNumber(slab.seq) === existingSeq) {
        // Same slab recomputed by a re-approval — refresh, do not duplicate.
        const current = bucket.achievements[existingIndex];
        current.measuredValue = ladder.measuredValue;
        current.rewardSnapshot = snapshot;
        frozen.push({ ...nextEntry, entitlement: null, duplicate: true });
      } else if (existingIndex >= 0 && toNumber(slab.seq) > existingSeq) {
        // Upgrade in place — one row per ladder, always the highest won slab.
        const current = bucket.achievements[existingIndex];
        Object.assign(current, record);
        frozen.push({ ...nextEntry, entitlement, upgradedFrom: existingSeq });
      } else {
        bucket.achievements.push(record);
        frozen.push({ ...nextEntry, entitlement });
      }
    }

    await bucket.save({ session });
  }

  if (freeItemResolver && typeof freeItemResolver === 'function') {
    for (const row of frozen) {
      if (row.rewardType === 'freeItem' && row.entitlement) {
        row.entitlement.freeItem = freeItemResolver(row, normalizedLines);
      }
    }
  }

  return frozen;
};

export default {
  getSchemeModels,
  normalizeLine,
  // Resolves brand/category/subcategory from the Product master. Without it a
  // brand-scoped scheme matches nothing, because neither a Sales Order line nor a
  // Dealer Invoice line carries those ids.
  enrichLinesWithProductScope,
  lineMatchesScope,
  mixGroupMatchesLine,
  dealerMatchesScope,
  schemeIsLive,
  resolveSlab,
  resolveNextSlab,
  slabsUsePaymentTerms,
  slabMatchesPaymentTerms,
  rewardHasValue,
  evaluateMixGroups,
  evaluateProductSlabs,
  measureLines,
  evaluateSchemes,
  loadCandidateSchemes,
  loadBankedProgress,
  previewSchemesForLines,
  buildContribution,
  resolveFreeItemProduct,
  recordOrderContributions,
  commitInvoiceAchievements
};
