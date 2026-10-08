import { schemeSchema } from '../models/Scheme.js';
import { schemeProgressSchema } from '../models/SchemeProgress.js';
import { schemeApplicationSchema } from '../models/SchemeApplication.js';
import { dealerSchema } from '../models/Dealer.js';
import { routeSchema } from '../models/Route.js';
import { regionSchema } from '../models/Region.js';
import { productSchema } from '../models/Product.js';
import { creditNoteSchema } from '../models/CreditNote.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import schemeEngine from '../services/schemeEngine.js';
import { sanitizeSchemePayload } from '../utils/schemeScopePolicy.js';

/**
 * Escape a user string before it goes into a RegExp.
 *
 * A raw `new RegExp(search)` throws on input like "(" — a 500 from a search box —
 * and lets a crafted pattern change the query. Escape it.
 */
const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getModels = (dbConnection) => ({
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema),
  SchemeProgress: dbConnection.models.SchemeProgress
    || dbConnection.model('SchemeProgress', schemeProgressSchema),
  SchemeApplication: dbConnection.models.SchemeApplication
    || dbConnection.model('SchemeApplication', schemeApplicationSchema),
  Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
  Route: dbConnection.models.Route || dbConnection.model('Route', routeSchema),
  Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
  Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
  CreditNote: dbConnection.models.CreditNote || dbConnection.model('CreditNote', creditNoteSchema),
  DealerLedger: dbConnection.models.DealerLedger
    || dbConnection.model('DealerLedger', dealerLedgerSchema)
});

const populateScheme = (query) => query
  .populate('scope.brand', 'name')
  .populate('scope.category', 'name')
  .populate('scope.subcategory', 'name')
  .populate('scope.products', 'itemName productCode')
  .populate('scope.mixGroups.brand', 'name')
  .populate('scope.mixGroups.category', 'name')
  .populate('scope.mixGroups.subcategory', 'name')
  .populate('scope.mixGroups.products', 'itemName productCode')
  .populate('productSlabs.product', 'itemName productCode')
  .populate('slabs.reward.freeItemProduct', 'itemName productCode')
  .populate('createdBy', 'name')
  .populate('updatedBy', 'name');

const slugCode = (value) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, '')
  .slice(0, 40);

// ---------------------------------------------------------------------------
// Scheme CRUD
// ---------------------------------------------------------------------------

// @desc    List schemes with filters
// @route   GET /api/schemes
export const getSchemes = async (req, res) => {
  try {
    const { Scheme } = getModels(req.dbConnection);
    const {
      page = 1, limit = 20, search, status, appliesTo, scopeLevel,
      schemeCode, brand, category, subcategory, activeOn
    } = req.query;

    const query = {};
    if (appliesTo) query.appliesTo = appliesTo;
    if (status) query.status = status;
    if (schemeCode) query.schemeCode = { $regex: slugCode(schemeCode), $options: 'i' };
    if (scopeLevel) query['scope.level'] = scopeLevel;
    if (brand) query['scope.brand'] = brand;
    if (category) query['scope.category'] = category;
    if (subcategory) query['scope.subcategory'] = subcategory;

    if (search) {
      query.$or = [
        { schemeCode: { $regex: search, $options: 'i' } },
        { schemeName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // "Live right now" filter used by the register/report screens.
    if (activeOn === 'true') {
      const at = new Date();
      query.status = 'Active';
      query.validFrom = { $lte: at };
      query.validTo = { $gte: at };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [schemes, total] = await Promise.all([
      populateScheme(Scheme.find(query)).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      Scheme.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: schemes,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('getSchemes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get one scheme
// @route   GET /api/schemes/:id
export const getScheme = async (req, res) => {
  try {
    const { Scheme } = getModels(req.dbConnection);
    const scheme = await populateScheme(Scheme.findById(req.params.id));
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });
    res.json({ success: true, data: scheme });
  } catch (error) {
    console.error('getScheme error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const validateSlabs = (slabs) => {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return 'At least one slab is required';
  }
  const ordered = [...slabs].sort((a, b) => Number(a.from) - Number(b.from));

  // When a ladder uses payment terms, several rungs legitimately share the SAME
  // from/to band (one per payment condition). Overlap is only a mistake *within*
  // the same payment window, so rungs are grouped by their terms before checking.
  const termsKey = (slab) => {
    const t = slab.reward ? slab.paymentTerms || {} : slab.paymentTerms || {};
    const from = Number(t.fromCreditDays || 0);
    const to = t.toCreditDays === null || t.toCreditDays === undefined ? 'null' : Number(t.toCreditDays);
    return `${from}:${to}`;
  };
  const groups = new Map();
  for (const slab of ordered) {
    const key = termsKey(slab);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slab);
  }

  for (const lane of groups.values()) {
    for (let i = 0; i < lane.length; i += 1) {
      const slab = lane[i];
      const next = lane[i + 1];
      if (next && slab.to !== null && slab.to !== undefined && Number(slab.to) >= Number(next.from)) {
        const label = slab.paymentTerms?.label || '';
        return `Slab ${slab.from}-${slab.to}${label ? ` (${label})` : ''} overlaps ${next.from}-${next.to ?? 'open'}${label ? ` (${label})` : ''}`;
      }
    }
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const slab = ordered[i];
    if (!Number.isFinite(Number(slab.from)) || Number(slab.from) < 0) {
      return `Slab ${i + 1}: "from" must be a non-negative number`;
    }
    if (slab.to !== null && slab.to !== undefined && Number(slab.to) < Number(slab.from)) {
      return `Slab ${i + 1}: "to" cannot be lower than "from"`;
    }
    if (!slab.reward || !slab.reward.type) {
      return `Slab ${i + 1}: reward type is required`;
    }
    // Payment terms, when supplied, must describe a sane window.
    const terms = slab.paymentTerms;
    if (terms && (terms.fromCreditDays !== undefined || terms.toCreditDays !== undefined)) {
      const from = Number(terms.fromCreditDays || 0);
      const to = terms.toCreditDays === null || terms.toCreditDays === undefined
        ? null
        : Number(terms.toCreditDays);
      if (!Number.isFinite(from) || from < 0) {
        return `Slab ${i + 1}: payment terms "fromCreditDays" must be 0 or more`;
      }
      if (to !== null && (!Number.isFinite(to) || to < from)) {
        return `Slab ${i + 1}: payment terms "toCreditDays" cannot be lower than "fromCreditDays"`;
      }
    }
  }
  return null;
};

/**
 * Per-product ladders: every group needs a product and a legal ladder of its own.
 */
const validateProductSlabs = (groups) => {
  if (groups === undefined || groups === null) return null;
  if (!Array.isArray(groups)) return 'Product-wise slabs must be a list';
  const seen = new Set();
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    if (!group || !group.product) {
      return `Product-wise ladder ${i + 1}: select a product`;
    }
    const id = String(group.product);
    if (seen.has(id)) {
      return `Product-wise ladder ${i + 1}: product selected more than once`;
    }
    seen.add(id);
    const err = validateSlabs(group.slabs);
    if (err) return `Product-wise ladder ${i + 1}: ${err}`;
  }
  return null;
};

/**
 * Ratio groups must add up sensibly. Ratios are normalised against their own sum,
 * so any positive weighting works — but a group cannot claim more than 100%.
 */
const validateMixRatios = (scope) => {
  const groups = scope?.mixGroups || [];
  for (let i = 0; i < groups.length; i += 1) {
    const ratio = Number(groups[i].ratioPercentage || 0);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      return `Mix group ${i + 1}: ratio must be between 0 and 100`;
    }
  }
  return null;
};

/**
 * Turn a mongoose CastError into something an admin can act on.
 *
 * The blank-selector bug surfaced as a raw
 *   "Cast to ObjectId failed for value "" (type string) at path "category""
 * which tells a non-technical user nothing. Any future uncastable field now gets
 * a message naming the field instead.
 */
const describeCastError = (error) => {
  if (error?.name !== 'ValidationError' || !error.errors) return null;
  const cast = Object.values(error.errors).find((entry) => entry?.name === 'CastError');
  if (!cast) return null;
  const field = String(cast.path || '').split('.').pop() || 'a field';
  return `Invalid value for "${field}". Please re-select it and save again.`;
};

// @desc    Create a scheme
// @route   POST /api/schemes
export const createScheme = async (req, res) => {
  try {
    const { Scheme } = getModels(req.dbConnection);
    // The builder posts every scope selector, including the ones the chosen
    // level does not use, as empty strings — which mongoose cannot cast to an
    // ObjectId. Drop the blanks before validation so a Brand-scoped scheme
    // saves without the admin having to fill category/subcategory too.
    const body = sanitizeSchemePayload(req.body || {});

    const schemeCode = slugCode(body.schemeCode);
    if (!schemeCode) {
      return res.status(400).json({ success: false, message: 'Scheme code is required' });
    }
    if (!body.schemeName) {
      return res.status(400).json({ success: false, message: 'Scheme name is required' });
    }
    if (!body.scope || !body.scope.level) {
      return res.status(400).json({ success: false, message: 'Scope level is required' });
    }

    const slabError = validateSlabs(body.slabs);
    if (slabError) {
      return res.status(400).json({ success: false, message: slabError });
    }

    const productSlabError = validateProductSlabs(body.productSlabs);
    if (productSlabError) {
      return res.status(400).json({ success: false, message: productSlabError });
    }

    const ratioError = validateMixRatios(body.scope);
    if (ratioError) {
      return res.status(400).json({ success: false, message: ratioError });
    }

    // Scheme code must be unique per company.
    const duplicate = await Scheme.findOne({ schemeCode });
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `Scheme code "${schemeCode}" already exists. Please use a unique code.`
      });
    }

    if (body.validFrom && body.validTo && new Date(body.validTo) < new Date(body.validFrom)) {
      return res.status(400).json({
        success: false,
        message: 'Valid To date must be after Valid From date'
      });
    }

    const scheme = await Scheme.create({
      ...body,
      schemeCode,
      appliesTo: body.appliesTo || 'dealer',
      status: body.status || 'Active',
      createdBy: req.user._id
    });

    const populated = await populateScheme(Scheme.findById(scheme._id));
    res.status(201).json({
      success: true,
      message: `Scheme ${scheme.schemeCode} created successfully`,
      data: populated
    });
  } catch (error) {
    console.error('createScheme error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Scheme code already exists. Please use a unique code.'
      });
    }
    const castMessage = describeCastError(error);
    if (castMessage) {
      return res.status(400).json({ success: false, message: castMessage });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update a scheme
// @route   PUT /api/schemes/:id
export const updateScheme = async (req, res) => {
  try {
    const { Scheme } = getModels(req.dbConnection);
    // Same blank-selector problem as createScheme: switching a scheme's scope
    // level re-sends the untouched selectors as "".
    const body = sanitizeSchemePayload(req.body || {});

    const scheme = await Scheme.findById(req.params.id);
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });

    if (body.schemeCode) {
      const schemeCode = slugCode(body.schemeCode);
      if (schemeCode !== scheme.schemeCode) {
        const duplicate = await Scheme.findOne({ schemeCode, _id: { $ne: scheme._id } });
        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: `Scheme code "${schemeCode}" already exists. Please use a unique code.`
          });
        }
        scheme.schemeCode = schemeCode;
      }
    }

    if (Array.isArray(body.slabs)) {
      const slabError = validateSlabs(body.slabs);
      if (slabError) return res.status(400).json({ success: false, message: slabError });
      scheme.slabs = body.slabs;
    }

    if (body.productSlabs !== undefined) {
      const productSlabError = validateProductSlabs(body.productSlabs);
      if (productSlabError) return res.status(400).json({ success: false, message: productSlabError });
      scheme.productSlabs = body.productSlabs;
    }

    if (body.scope !== undefined) {
      const ratioError = validateMixRatios(body.scope);
      if (ratioError) return res.status(400).json({ success: false, message: ratioError });
    }

    const assignable = [
      'schemeName', 'description', 'appliesTo', 'scope', 'condition',
      'redemptionMode', 'allowRepeat', 'dealerScope', 'validFrom', 'validTo',
      'status', 'priority'
    ];
    for (const key of assignable) {
      if (body[key] !== undefined) scheme[key] = body[key];
    }
    scheme.updatedBy = req.user._id;

    await scheme.save();
    const populated = await populateScheme(Scheme.findById(scheme._id));
    res.json({ success: true, message: 'Scheme updated successfully', data: populated });
  } catch (error) {
    console.error('updateScheme error:', error);
    const castMessage = describeCastError(error);
    if (castMessage) {
      return res.status(400).json({ success: false, message: castMessage });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete a scheme
// @route   DELETE /api/schemes/:id
export const deleteScheme = async (req, res) => {
  try {
    const { Scheme, SchemeProgress, SchemeApplication } = getModels(req.dbConnection);
    const scheme = await Scheme.findById(req.params.id);
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });

    // Once rewards have been given, keep the scheme for the audit trail.
    const applications = await SchemeApplication.countDocuments({ scheme: scheme._id });
    if (applications > 0) {
      scheme.status = 'Cancelled';
      scheme.updatedBy = req.user._id;
      await scheme.save();
      return res.json({
        success: true,
        message: `Scheme has ${applications} redemption record(s) and was cancelled instead of deleted.`,
        softDeleted: true
      });
    }

    await SchemeProgress.deleteMany({ scheme: scheme._id });
    await Scheme.deleteOne({ _id: scheme._id });
    res.json({ success: true, message: 'Scheme removed successfully' });
  } catch (error) {
    console.error('deleteScheme error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check scheme code availability
// @route   GET /api/schemes/check-code
export const checkSchemeCode = async (req, res) => {
  try {
    const { Scheme } = getModels(req.dbConnection);
    const schemeCode = slugCode(req.query.schemeCode);
    if (!schemeCode) return res.json({ success: true, available: false, message: 'Code is required' });
    const existing = await Scheme.findOne({ schemeCode }).select('_id schemeName').lean();
    res.json({
      success: true,
      available: !existing,
      schemeCode,
      existingName: existing?.schemeName || null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

// @desc    Scheme dashboard stats
// @route   GET /api/schemes/stats
export const getSchemeStats = async (req, res) => {
  try {
    const { Scheme, SchemeApplication } = getModels(req.dbConnection);
    const at = new Date();

    const [total, active, upcoming, expired, byStatus, pending, given] = await Promise.all([
      Scheme.countDocuments({}),
      Scheme.countDocuments({ status: 'Active', validFrom: { $lte: at }, validTo: { $gte: at } }),
      Scheme.countDocuments({ validFrom: { $gt: at } }),
      Scheme.countDocuments({ $or: [{ status: 'Expired' }, { validTo: { $lt: at } }] }),
      Scheme.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      SchemeApplication.countDocuments({ status: 'Pending' }),
      SchemeApplication.aggregate([
        { $match: { status: { $in: ['Given', 'Partially Given'] } } },
        { $group: { _id: null, amount: { $sum: '$givenAmount' }, points: { $sum: '$givenPoints' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalSchemes: total,
        activeSchemes: active,
        upcomingSchemes: upcoming,
        expiredSchemes: expired,
        pendingRedemptions: pending,
        totalGivenAmount: given[0]?.amount || 0,
        totalGivenPoints: given[0]?.points || 0,
        byStatus: byStatus.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {})
      }
    });
  } catch (error) {
    console.error('getSchemeStats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Progress / detection
// ---------------------------------------------------------------------------

// @desc    Advisory preview for the Sales Order screen (writes nothing)
// @route   POST /api/schemes/preview
export const previewSchemes = async (req, res) => {
  try {
    const { dealerId, lines, creditDays } = req.body || {};
    if (!dealerId) {
      return res.status(400).json({ success: false, message: 'dealerId is required' });
    }
    const result = await schemeEngine.previewSchemesForLines(req.dbConnection, {
      dealerId,
      lines: Array.isArray(lines) ? lines : [],
      paymentTerms: creditDays === undefined || creditDays === null ? null : Number(creditDays)
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('previewSchemes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Dealer x scheme progress buckets (register)
// @route   GET /api/schemes/progress
export const getSchemeProgress = async (req, res) => {
  try {
    const { SchemeProgress, Dealer, Route, Region } = getModels(req.dbConnection);
    const {
      page = 1, limit = 20, dealer, scheme, schemeCode, route, region,
      hasPending = 'false', achieved, rewardType, search, from, to
    } = req.query;

    const query = {};
    if (dealer) query.dealer = dealer;
    if (scheme) query.scheme = scheme;
    if (schemeCode) query.schemeCode = { $regex: escapeRegex(schemeCode), $options: 'i' };
    if (from) query.windowFrom = { $gte: new Date(from) };
    if (to) query.windowTo = { $lte: new Date(to) };

    // Route / region filters resolve to a dealer id set first. These are ObjectIds
    // — passing a NAME here throws a CastError, which is what the old name-based
    // dropdown did.
    const and = [];
    if (route || region) {
      const dealerQuery = {};
      if (route) dealerQuery.routeId = route;
      if (region) dealerQuery.regionId = region;
      const dealerIds = await Dealer.find(dealerQuery).select('_id').lean();
      and.push({ dealer: { $in: dealerIds.map((d) => d._id) } });
    }

    // An achievement that still counts (not queued for revocation).
    const LIVE = { revocationPending: { $ne: true } };

    // "Who actually achieved this offer?" — the headline question this screen
    // answers. `achieved=false` is the complement, i.e. still in progress.
    if (achieved === 'true') {
      query.achievements = { $elemMatch: LIVE };
    } else if (achieved === 'false') {
      query.achievements = { $not: { $elemMatch: LIVE } };
    }

    // "Show me buckets that still owe the dealer something."
    // isDeferred: the slab reward is granted manually from this module
    // (points / credit note / cashback / gift), so it is not auto-applied.
    if (hasPending === 'true') {
      query.achievements = {
        $elemMatch: { ...LIVE, autoApplied: false, redeemed: { $ne: true } }
      };
    }

    if (rewardType) {
      query.achievements = { $elemMatch: { ...LIVE, rewardType } };
    }

    // Free-text across dealer and scheme. Done server-side so it filters the whole
    // collection rather than the current page.
    if (search) {
      const re = new RegExp(escapeRegex(String(search).trim()), 'i');
      and.push({
        $or: [
          { schemeCode: re },
          { schemeName: re },
          { dealerName: re },
          { dealerCode: re }
        ]
      });
    }
    if (and.length > 0) query.$and = and;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Headline counts for the CURRENT filter, independent of paging — so
    // "12 dealers achieved" stays true on page 3.
    const [rows, total, achievedCount, owingCount] = await Promise.all([
      SchemeProgress.find(query)
        .populate('dealer', 'name code dealerType routeId regionId')
        .populate({ path: 'dealer', populate: [{ path: 'routeId', select: 'name code' }, { path: 'regionId', select: 'name' }] })
        .populate('scheme', 'schemeCode schemeName status validFrom validTo')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      SchemeProgress.countDocuments(query),
      SchemeProgress.countDocuments({ ...query, achievements: { $elemMatch: LIVE } }),
      SchemeProgress.countDocuments({
        ...query,
        achievements: { $elemMatch: { ...LIVE, autoApplied: false, redeemed: { $ne: true } } }
      })
    ]);

    res.json({
      success: true,
      data: rows,
      summary: {
        total,
        achieved: achievedCount,
        owing: owingCount,
        inProgress: Math.max(0, total - achievedCount)
      },
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('getSchemeProgress error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Per-dealer scheme summary for the entitlement register
// @route   GET /api/schemes/entitlements
export const getSchemeEntitlements = async (req, res) => {
  try {
    const { SchemeApplication } = getModels(req.dbConnection);
    const {
      page = 1, limit = 20, status, rewardType, scheme, schemeCode, dealer,
      route, region, search, from, to
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (rewardType) query.rewardType = rewardType;
    if (scheme) query.scheme = scheme;
    if (schemeCode) query.schemeCode = { $regex: schemeCode, $options: 'i' };
    if (dealer) query.dealer = dealer;
    if (route) query.route = route;
    if (region) query.region = region;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    if (search) {
      query.$or = [
        { schemeCode: { $regex: search, $options: 'i' } },
        { schemeName: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { dealerCode: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [rows, total] = await Promise.all([
      SchemeApplication.find(query)
        .populate('dealer', 'name code')
        .populate('scheme', 'schemeCode schemeName')
        // Per-product rewards (item #3) name the product they belong to.
        .populate('product', 'itemName productCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      SchemeApplication.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('getSchemeEntitlements error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

// @desc    Edit an entitlement before giving it
// @route   PATCH /api/schemes/entitlements/:id
export const editEntitlement = async (req, res) => {
  try {
    const { SchemeApplication } = getModels(req.dbConnection);
    const application = await SchemeApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Entitlement not found' });
    }
    if (application.status === 'Given') {
      return res.status(400).json({ success: false, message: 'This entitlement has already been given' });
    }

    const before = {
      rewardType: application.rewardType,
      rewardPoints: application.rewardPoints,
      rewardPercentage: application.rewardPercentage,
      rewardAmount: application.rewardAmount,
      rewardFreeItemQuantity: application.rewardFreeItemQuantity
    };

    const editable = [
      'rewardType', 'rewardPoints', 'rewardPercentage', 'rewardAmount',
      'rewardFreeItemQuantity', 'rewardFreeItemProduct', 'rewardGiftName',
      'rewardDescription', 'remarks'
    ];
    for (const key of editable) {
      if (req.body[key] !== undefined) application[key] = req.body[key];
    }

    application.editHistory.push({
      action: 'edited',
      changes: { before, after: {
        rewardType: application.rewardType,
        rewardPoints: application.rewardPoints,
        rewardPercentage: application.rewardPercentage,
        rewardAmount: application.rewardAmount,
        rewardFreeItemQuantity: application.rewardFreeItemQuantity
      } },
      note: req.body.note || 'Entitlement edited before giving',
      performedBy: req.user._id,
      performedByName: req.user.name || '',
      performedAt: new Date()
    });

    await application.save();
    res.json({ success: true, message: 'Entitlement updated', data: application });
  } catch (error) {
    console.error('editEntitlement error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Reject an entitlement
// @route   POST /api/schemes/entitlements/:id/reject
export const rejectEntitlement = async (req, res) => {
  try {
    const { SchemeApplication } = getModels(req.dbConnection);
    const application = await SchemeApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Entitlement not found' });
    }
    if (application.status === 'Given') {
      return res.status(400).json({ success: false, message: 'This entitlement has already been given' });
    }

    application.status = 'Rejected';
    application.rejectionReason = req.body.reason || '';
    application.editHistory.push({
      action: 'rejected',
      note: req.body.reason || 'Rejected',
      performedBy: req.user._id,
      performedByName: req.user.name || '',
      performedAt: new Date()
    });
    await application.save();

    res.json({ success: true, message: 'Entitlement rejected', data: application });
  } catch (error) {
    console.error('rejectEntitlement error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Process (give) an entitlement. This is the ONLY place a deferred reward is
 * actually handed over — points ledger, credit note, or dealer ledger credit.
 */
// @desc    Process / give an entitlement
// @route   POST /api/schemes/entitlements/:id/process
export const processEntitlement = async (req, res) => {
  const session = await req.dbConnection.startSession();
  try {
    const { SchemeApplication, Dealer, CreditNote, DealerLedger } = getModels(req.dbConnection);
    const { partial = false, remarks } = req.body || {};

    let result = null;
    await session.withTransaction(async () => {
      const application = await SchemeApplication.findById(req.params.id).session(session);
      if (!application) {
        throw Object.assign(new Error('Entitlement not found'), { statusCode: 404 });
      }
      if (application.status === 'Given') {
        throw Object.assign(new Error('This entitlement has already been given'), { statusCode: 400 });
      }
      if (application.status === 'Rejected') {
        throw Object.assign(new Error('This entitlement was rejected'), { statusCode: 400 });
      }

      const dealer = await Dealer.findById(application.dealer).session(session);

      // Amount actually handed over. Partial redemption gives half unless the
      // caller supplied explicit values.
      const fullAmount = Number(application.rewardAmount || 0);
      const giveAmount = partial
        ? Number(req.body.giveAmount ?? fullAmount / 2)
        : fullAmount;
      const givePoints = partial && application.rewardPoints
        ? Number(req.body.givePoints ?? Math.floor(application.rewardPoints / 2))
        : Number(application.rewardPoints || 0);
      const giveQuantity = partial && application.rewardFreeItemQuantity
        ? Number(req.body.giveQuantity ?? 0)
        : Number(application.rewardFreeItemQuantity || 0);

      application.givenAmount += giveAmount;
      application.givenPoints += givePoints;
      application.givenQuantity += giveQuantity;
      application.remarks = remarks || application.remarks;

      if (application.rewardType === 'creditNote' && giveAmount > 0) {
        const creditNote = await CreditNote.create([{
          dealer: application.dealer,
          dealerName: application.dealerName || dealer?.name || '',
          amount: giveAmount,
          reason: `Scheme reward ${application.schemeCode} — ${application.schemeName}`,
          note: `Auto-created from scheme entitlement. Slab ${application.slabLabel || application.slabSeq}.`,
          date: new Date(),
          status: 'Pending',
          createdBy: req.user._id
        }], { session });
        application.creditNote = creditNote[0]._id;
        application.creditNoteNumber = creditNote[0].creditNoteNumber || '';
      }

      if ((application.rewardType === 'cashback' || application.rewardType === 'discount')
          && giveAmount > 0 && dealer) {
        const lastEntry = await DealerLedger.findOne({ dealer: dealer._id })
          .sort({ createdAt: -1 })
          .session(session);
        const previousBalance = lastEntry ? Number(lastEntry.runningBalance || 0) : 0;
        const ledgerEntry = await DealerLedger.create([{
          dealer: dealer._id,
          dealerName: dealer.name,
          dealerCode: dealer.code,
          entryDate: new Date(),
          transactionType: 'Credit Note',
          invoiceNumber: application.schemeCode,
          invoiceValue: giveAmount,
          debitAmount: 0,
          creditAmount: giveAmount,
          runningBalance: previousBalance - giveAmount,
          description: `Scheme reward ${application.schemeCode} (${application.rewardType})`,
          createdBy: req.user._id
        }], { session });
        application.ledgerEntry = ledgerEntry[0]._id;
      }

      // Decide final status.
      const amountSettled = fullAmount === 0 || application.givenAmount >= fullAmount - 0.01;
      const pointsSettled = Number(application.rewardPoints || 0) === 0
        || application.givenPoints >= Number(application.rewardPoints || 0) - 0.01;
      const quantitySettled = Number(application.rewardFreeItemQuantity || 0) === 0
        || application.givenQuantity >= Number(application.rewardFreeItemQuantity || 0) - 0.01;
      const settled = amountSettled && pointsSettled && quantitySettled;

      application.status = settled ? 'Given' : 'Partially Given';
      if (settled) {
        application.processedBy = req.user._id;
        application.processedByName = req.user.name || '';
        application.processedAt = new Date();
      }
      application.editHistory.push({
        action: 'processed',
        note: settled ? 'Reward given in full' : 'Reward given partially',
        changes: { giveAmount, givePoints, giveQuantity, status: application.status },
        performedBy: req.user._id,
        performedByName: req.user.name || '',
        performedAt: new Date()
      });

      await application.save({ session });
      result = application;
    });

    res.json({
      success: true,
      message: result.status === 'Given'
        ? 'Reward processed successfully'
        : 'Partial reward processed successfully',
      data: result
    });
  } catch (error) {
    console.error('processEntitlement error:', error);
    if (session.inTransaction()) {
      try { await session.abortTransaction(); } catch (e) { /* ignore */ }
    }
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// @desc    Scheme-wise report: who availed which offer and how much
// @route   GET /api/schemes/reports/summary
export const getSchemeReport = async (req, res) => {
  try {
    const { SchemeApplication } = getModels(req.dbConnection);
    const { from, to, status, rewardType } = req.query;

    const match = {};
    if (status) match.status = status;
    if (rewardType) match.rewardType = rewardType;
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const byScheme = await SchemeApplication.aggregate([
      { $match: match },
      {
        $group: {
          _id: { scheme: '$scheme', schemeCode: '$schemeCode', schemeName: '$schemeName' },
          beneficiaries: { $addToSet: '$dealer' },
          totalGivenAmount: { $sum: '$givenAmount' },
          totalGivenPoints: { $sum: '$givenPoints' },
          totalGivenQuantity: { $sum: '$givenQuantity' },
          applications: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          given: {
            $sum: { $cond: [{ $in: ['$status', ['Given', 'Partially Given']] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          schemeCode: '$_id.schemeCode',
          schemeName: '$_id.schemeName',
          beneficiaryCount: { $size: '$beneficiaries' },
          totalGivenAmount: 1,
          totalGivenPoints: 1,
          totalGivenQuantity: 1,
          applications: 1,
          pending: 1,
          given: 1,
          _id: 0
        }
      },
      { $sort: { totalGivenAmount: -1, applications: -1 } }
    ]);

    const byRoute = await SchemeApplication.aggregate([
      { $match: match },
      {
        $group: {
          _id: { route: '$route', routeName: '$routeName', schemeCode: '$schemeCode' },
          beneficiaries: { $addToSet: '$dealer' },
          totalGivenAmount: { $sum: '$givenAmount' },
          totalGivenPoints: { $sum: '$givenPoints' }
        }
      },
      {
        $project: {
          routeName: '$_id.routeName',
          schemeCode: '$_id.schemeCode',
          beneficiaryCount: { $size: '$beneficiaries' },
          totalGivenAmount: 1,
          totalGivenPoints: 1,
          _id: 0
        }
      },
      { $sort: { totalGivenAmount: -1 } }
    ]);

    res.json({ success: true, data: { byScheme, byRoute } });
  } catch (error) {
    console.error('getSchemeReport error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Dealer-wise report for one scheme
// @route   GET /api/schemes/:id/report
export const getSchemeDealerReport = async (req, res) => {
  try {
    const { SchemeApplication, Scheme } = getModels(req.dbConnection);
    const { status } = req.query;
    const scheme = await Scheme.findById(req.params.id).select('schemeCode schemeName').lean();
    if (!scheme) return res.status(404).json({ success: false, message: 'Scheme not found' });

    const match = { scheme: scheme._id };
    if (status) match.status = status;

    const rows = await SchemeApplication.find(match)
      .populate('dealer', 'name code dealerType')
      .sort({ createdAt: -1 })
      .lean();

    const dealers = new Map();
    for (const row of rows) {
      const key = String(row.dealer?._id || row.dealer);
      if (!dealers.has(key)) {
        dealers.set(key, {
          dealerId: key,
          dealerName: row.dealerName || row.dealer?.name || '',
          dealerCode: row.dealerCode || row.dealer?.code || '',
          routeName: row.routeName || '',
          applications: 0,
          slabs: [],
          givenAmount: 0,
          givenPoints: 0,
          givenQuantity: 0,
          pending: 0
        });
      }
      const entry = dealers.get(key);
      entry.applications += 1;
      entry.givenAmount += Number(row.givenAmount || 0);
      entry.givenPoints += Number(row.givenPoints || 0);
      entry.givenQuantity += Number(row.givenQuantity || 0);
      if (row.status === 'Pending') entry.pending += 1;
      entry.slabs.push({
        applicationId: row._id,
        slabSeq: row.slabSeq,
        slabLabel: row.slabLabel,
        measuredValue: row.measuredValue,
        rewardType: row.rewardType,
        status: row.status,
        givenAmount: row.givenAmount,
        givenPoints: row.givenPoints
      });
    }

    res.json({
      success: true,
      scheme: { schemeId: scheme._id, schemeCode: scheme.schemeCode, schemeName: scheme.schemeName },
      data: Array.from(dealers.values())
    });
  } catch (error) {
    console.error('getSchemeDealerReport error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Distinct filter options for the register screens
// @route   GET /api/schemes/filter-options
export const getSchemeFilterOptions = async (req, res) => {
  try {
    const { Scheme, Route, Region } = getModels(req.dbConnection);
    const [schemes, routes, regions] = await Promise.all([
      Scheme.find({}).select('schemeCode schemeName status').sort({ schemeCode: 1 }).lean(),
      Route.find({}).select('name code').sort({ name: 1 }).lean(),
      Region.find({}).select('name').sort({ name: 1 }).lean()
    ]);
    res.json({
      success: true,
      data: {
        schemes: schemes.map((s) => ({
          schemeId: s._id,
          schemeCode: s.schemeCode,
          schemeName: s.schemeName,
          status: s.status
        })),
        // id + name, and sourced from the MASTERS.
        //
        // These used to be `SchemeApplication.distinct('routeName')` — bare names,
        // and empty until the first reward existed. The Progress/Rewards filters
        // resolve a dealer set by `routeId`/`regionId`, so a name is not merely
        // unhelpful, it is a CastError.
        routes: routes.map((r) => ({ _id: r._id, name: r.name || r.code || '' })),
        regions: regions.map((r) => ({ _id: r._id, name: r.name || '' })),
        rewardTypes: ['points', 'freeItem', 'discount', 'creditNote', 'cashback', 'gift']
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  getSchemes,
  getScheme,
  createScheme,
  updateScheme,
  deleteScheme,
  checkSchemeCode,
  getSchemeStats,
  previewSchemes,
  getSchemeProgress,
  getSchemeEntitlements,
  editEntitlement,
  rejectEntitlement,
  processEntitlement,
  getSchemeReport,
  getSchemeDealerReport,
  getSchemeFilterOptions
};
