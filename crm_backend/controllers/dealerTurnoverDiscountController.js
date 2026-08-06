import { dealerTurnoverDiscountSchema } from '../models/DealerTurnoverDiscount.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { dealerSchema } from '../models/Dealer.js';
import { dealerCategorySchema } from '../models/DealerCategory.js';
import { routeSchema } from '../models/Route.js';
import { userSchema } from '../models/User.js';
import { sendAdminNotification } from '../services/adminNotificationService.js';

const getModels = (db) => ({
  DealerTurnoverDiscount: db.models.DealerTurnoverDiscount || db.model('DealerTurnoverDiscount', dealerTurnoverDiscountSchema),
  DealerInvoice:   db.models.DealerInvoice   || db.model('DealerInvoice',   dealerInvoiceSchema),
  Dealer:          db.models.Dealer          || db.model('Dealer',          dealerSchema),
  DealerCategory:  db.models.DealerCategory  || db.model('DealerCategory',  dealerCategorySchema),
  Route:           db.models.Route           || db.model('Route',           routeSchema),
  User:            db.models.User            || db.model('User',            userSchema),
});

// ---------------------------------------------------------------------------
// Period helpers (UTC)
// ---------------------------------------------------------------------------
const getPeriodRange = (periodType, refDate = new Date()) => {
  const d = new Date(refDate);
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (periodType === 'monthly') {
    return {
      start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      end:   new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
      label: `${year}-${String(month + 1).padStart(2, '0')}`,
    };
  }
  if (periodType === 'quarterly') {
    const q = Math.floor(month / 3);
    const sm = q * 3;
    return {
      start: new Date(Date.UTC(year, sm, 1, 0, 0, 0, 0)),
      end:   new Date(Date.UTC(year, sm + 3, 0, 23, 59, 59, 999)),
      label: `${year}-Q${q + 1}`,
    };
  }
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end:   new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    label: `${year}`,
  };
};

// Resolve which dealer IDs belong to the target scope
const resolveDealerIds = async (models, td) => {
  if (td.targetType === 'all') return null; // no filter = all dealers

  if (td.targetType === 'dealer' && td.dealer) {
    return [(td.dealer?._id || td.dealer).toString()];
  }

  if (td.targetType === 'dealerCategory' && td.dealerCategory) {
    const catId = td.dealerCategory?._id || td.dealerCategory;
    const dealers = await models.Dealer.find({ dealerCategory: catId }).select('_id').lean();
    return dealers.map(d => d._id.toString());
  }

  if (td.targetType === 'route' && td.route) {
    const routeId = td.route?._id || td.route;
    const dealers = await models.Dealer.find({ routeId }).select('_id').lean();
    return dealers.map(d => d._id.toString());
  }

  return null;
};

// Compute sales turnover from approved dealer invoices within [start, end]
const computeDealerTurnover = async (models, dealerIdSet, start, end) => {
  const query = {
    invoiceDate: { $gte: start, $lte: end },
    status: { $nin: ['Cancelled', 'Draft'] },
    isDraft: { $ne: true },
  };
  if (dealerIdSet) query.dealer = { $in: dealerIdSet };

  const invoices = await models.DealerInvoice.find(query)
    .select('totalAmount dealer')
    .lean();

  return invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
};

// Compute progress for display
const computeProgressForDoc = async (models, td) => {
  const dealerIdSet = await resolveDealerIds(models, td);
  const now = new Date();
  const periods = [];
  for (const p of td.periods) {
    let start, end, label;
    if (p.periodType === 'custom' && p.customStartDate && p.customEndDate) {
      start = new Date(p.customStartDate);
      end   = new Date(p.customEndDate);
      label = `${start.toISOString().slice(0,10)}→${end.toISOString().slice(0,10)}`;
    } else {
      ({ start, end, label } = getPeriodRange(p.periodType, now));
    }
    const achievedAmount = await computeDealerTurnover(models, dealerIdSet, start, end);
    const progressPct = p.targetAmount > 0 ? Math.min(100, (achievedAmount / p.targetAmount) * 100) : 0;
    const achieved = p.targetAmount > 0 && achievedAmount >= p.targetAmount;
    periods.push({
      periodType: p.periodType, periodLabel: label, periodStart: start, periodEnd: end,
      targetAmount: p.targetAmount, discountPercentage: p.discountPercentage,
      achievedAmount, remainingAmount: Math.max(0, p.targetAmount - achievedAmount),
      progressPct: Math.round(progressPct * 100) / 100, achieved,
    });
  }
  return periods;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export const createDealerTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { targetType = 'all', dealer, dealerCategory, route, targetName, periods, validFrom, validTo, description, isActive } = req.body;

    if (!Array.isArray(periods) || periods.length === 0)
      return res.status(400).json({ success: false, message: 'At least one period target is required' });

    const doc = await models.DealerTurnoverDiscount.create({
      targetType,
      dealer:         targetType === 'dealer'         ? (dealer         || null) : null,
      dealerCategory: targetType === 'dealerCategory' ? (dealerCategory || null) : null,
      route:          targetType === 'route'          ? (route          || null) : null,
      targetName: targetName || 'All Dealers',
      periods, validFrom: validFrom || Date.now(), validTo: validTo || undefined,
      description: description || '', isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Dealer turnover discount created', data: doc });
  } catch (e) {
    console.error('createDealerTurnoverDiscount error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getDealerTurnoverDiscounts = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { targetType, isActive } = req.query;
    const query = {};
    if (targetType) query.targetType = targetType;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const docs = await models.DealerTurnoverDiscount.find(query)
      .populate('dealer', 'name code')
      .populate('dealerCategory', 'name')
      .populate('route', 'name code')
      .sort({ createdAt: -1 }).lean();

    const withProgress = [];
    for (const td of docs) {
      const progress = await computeProgressForDoc(models, td);
      withProgress.push({ ...td, progress });
    }
    res.json({ success: true, data: withProgress });
  } catch (e) {
    console.error('getDealerTurnoverDiscounts error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getDealerTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const td = await models.DealerTurnoverDiscount.findById(req.params.id)
      .populate('dealer', 'name code')
      .populate('dealerCategory', 'name')
      .populate('route', 'name code').lean();
    if (!td) return res.status(404).json({ success: false, message: 'Not found' });
    const progress = await computeProgressForDoc(models, td);
    res.json({ success: true, data: { ...td, progress } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateDealerTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { targetType, dealer, dealerCategory, route, targetName, periods, validFrom, validTo, description, isActive } = req.body;
    const td = await models.DealerTurnoverDiscount.findById(req.params.id);
    if (!td) return res.status(404).json({ success: false, message: 'Not found' });

    if (targetType !== undefined) {
      td.targetType = targetType;
      td.dealer         = targetType === 'dealer'         ? (dealer         || null) : null;
      td.dealerCategory = targetType === 'dealerCategory' ? (dealerCategory || null) : null;
      td.route          = targetType === 'route'          ? (route          || null) : null;
    } else {
      if (dealer         !== undefined) td.dealer         = dealer         || null;
      if (dealerCategory !== undefined) td.dealerCategory = dealerCategory || null;
      if (route          !== undefined) td.route          = route          || null;
    }
    if (targetName  !== undefined) td.targetName  = targetName;
    if (Array.isArray(periods) && periods.length > 0) td.periods = periods;
    if (validFrom   !== undefined) td.validFrom   = validFrom;
    if (validTo     !== undefined) td.validTo     = validTo;
    if (description !== undefined) td.description = description;
    if (isActive    !== undefined) td.isActive    = isActive;
    td.updatedBy = req.user._id;

    await td.save();
    res.json({ success: true, message: 'Dealer turnover discount updated', data: td });
  } catch (e) {
    console.error('updateDealerTurnoverDiscount error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteDealerTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const td = await models.DealerTurnoverDiscount.findByIdAndDelete(req.params.id);
    if (!td) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Dealer turnover discount deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// ---------------------------------------------------------------------------
// Achievement evaluation (called after each dealer invoice approval)
// ---------------------------------------------------------------------------
export const evaluateDealerAchievements = async (dbConnection, company) => {
  const models = getModels(dbConnection);
  const now = new Date();
  const docs = await models.DealerTurnoverDiscount.find({ isActive: true });

  for (const td of docs) {
    const dealerIdSet = await resolveDealerIds(models, td);
    const newlyAchieved = [];

    for (const p of td.periods) {
      let start, end, label;
      if (p.periodType === 'custom' && p.customStartDate && p.customEndDate) {
        start = new Date(p.customStartDate);
        end   = new Date(p.customEndDate);
        label = `${start.toISOString().slice(0,10)}→${end.toISOString().slice(0,10)}`;
      } else {
        ({ start, end, label } = getPeriodRange(p.periodType, now));
      }
      const achievedAmount = await computeDealerTurnover(models, dealerIdSet, start, end);
      const isAchieved = p.targetAmount > 0 && achievedAmount >= p.targetAmount;

      let ach = td.achievements.find(a => a.periodType === p.periodType && a.periodLabel === label);
      if (!ach) {
        ach = { periodType: p.periodType, periodLabel: label, achievedAmount, targetAmount: p.targetAmount, discountPercentage: p.discountPercentage, achieved: false, achievedAt: null, notified: false };
        td.achievements.push(ach);
        ach = td.achievements[td.achievements.length - 1];
      } else {
        ach.achievedAmount = achievedAmount;
        ach.targetAmount = p.targetAmount;
        ach.discountPercentage = p.discountPercentage;
      }

      if (isAchieved && !ach.achieved) { ach.achieved = true; ach.achievedAt = now; }

      if (isAchieved && !ach.notified) {
        newlyAchieved.push({ periodType: p.periodType, label, discountPercentage: p.discountPercentage, targetAmount: p.targetAmount, achievedAmount });
        ach.notified = true;
      }
    }

    await td.save();

    if (newlyAchieved.length > 0) {
      try {
        const periodLabel = (t) => ({ monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[t] || t);
        const multiple = newlyAchieved.length > 1;
        let message;
        if (multiple) {
          const parts = newlyAchieved.map(a => `${periodLabel(a.periodType)} (${a.discountPercentage}%)`).join(', ');
          message = `${td.targetName}: multiple dealer turnover targets achieved — ${parts}. You can now apply these discounts.`;
        } else {
          const a = newlyAchieved[0];
          message = `${td.targetName}: ${periodLabel(a.periodType)} sales turnover target of ₹${Math.round(a.targetAmount).toLocaleString()} achieved. Apply ${a.discountPercentage}% discount.`;
        }
        await sendAdminNotification({
          type: 'dealer_turnover_achieved',
          title: multiple ? 'Multiple Dealer Turnover Targets Achieved' : 'Dealer Turnover Target Achieved',
          message,
          priority: 'high',
          company,
          data: { targetName: td.targetName, turnoverId: td._id.toString(), achievementsCount: newlyAchieved.length },
        });
      } catch (e) { /* silent */ }
    }
  }
};

// HTTP: recompute + return progress
export const getDealerTurnoverProgress = async (req, res) => {
  try {
    await evaluateDealerAchievements(req.dbConnection, req.company);
    const models = getModels(req.dbConnection);
    const docs = await models.DealerTurnoverDiscount.find({ isActive: true })
      .populate('dealer', 'name code')
      .populate('dealerCategory', 'name')
      .populate('route', 'name code').lean();

    const withProgress = [];
    for (const td of docs) {
      const progress = await computeProgressForDoc(models, td);
      withProgress.push({ ...td, progress });
    }
    res.json({ success: true, data: withProgress });
  } catch (e) {
    console.error('getDealerTurnoverProgress error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
