import { turnoverDiscountSchema } from '../models/TurnoverDiscount.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { supplierSchema } from '../models/Supplier.js';
import { productSchema } from '../models/Product.js';
import { brandSchema } from '../models/Brand.js';
import { categorySchema } from '../models/Category.js';
import { subcategorySchema } from '../models/Subcategory.js';
import { userSchema } from '../models/User.js';
import { notifyTurnoverAchieved } from '../services/adminNotificationService.js';

const getModels = (dbConnection) => ({
  TurnoverDiscount: dbConnection.models.TurnoverDiscount || dbConnection.model('TurnoverDiscount', turnoverDiscountSchema),
  SupplierInvoice: dbConnection.models.SupplierInvoice || dbConnection.model('SupplierInvoice', supplierInvoiceSchema),
  Supplier: dbConnection.models.Supplier || dbConnection.model('Supplier', supplierSchema),
  Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
  Brand: dbConnection.models.Brand || dbConnection.model('Brand', brandSchema),
  Category: dbConnection.models.Category || dbConnection.model('Category', categorySchema),
  Subcategory: dbConnection.models.Subcategory || dbConnection.model('Subcategory', subcategorySchema),
  User: dbConnection.models.User || dbConnection.model('User', userSchema),
});

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

// Returns { start, end, label } for the period containing refDate
const getPeriodRange = (periodType, refDate = new Date()) => {
  // Use UTC to avoid timezone-shifting dates
  const d = new Date(refDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  if (periodType === 'monthly') {
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const end   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    return { start, end, label };
  }

  if (periodType === 'quarterly') {
    const q = Math.floor(month / 3);
    const startMonth = q * 3;
    const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
    const end   = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
    const label = `${year}-Q${q + 1}`;
    return { start, end, label };
  }

  // yearly
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end   = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const label = `${year}`;
  return { start, end, label };
};

// Resolve which product IDs belong to a target scope
const resolveScopedProductIds = async (models, td) => {
  if (td.targetType === 'all') return null; // null => no product filter

  // Single product scope — return just that one ID
  if (td.targetType === 'product' && td.product) {
    // After .lean() + .populate(), td.product may be a plain object {_id, itemName} or raw ObjectId
    const pid = td.product?._id ? td.product._id.toString() : td.product.toString();
    return [pid];
  }

  const filter = {};
  const brandId  = td.brand?._id  || td.brand;
  const catId    = td.category?._id    || td.category;
  const subId    = td.subcategory?._id || td.subcategory;

  if (td.targetType === 'brand'       && brandId) filter.brand       = brandId;
  else if (td.targetType === 'category'    && catId)   filter.category    = catId;
  else if (td.targetType === 'subcategory' && subId)   filter.subcategory = subId;
  else return null;

  const products = await models.Product.find(filter).select('_id').lean();
  return products.map(p => p._id.toString());
};

// Compute purchase turnover for a supplier within [start,end].
// If productIdSet is null => use invoice.totalAmount (whole invoice).
// Otherwise sum matching item.totalPrice.
const computeTurnover = async (models, supplierId, start, end, productIdSet) => {
  const query = {
    invoiceDate: { $gte: start, $lte: end },
    status: { $nin: ['Cancelled'] },
  };
  // Only filter by supplier if one is set — null means "all suppliers"
  if (supplierId) query.supplier = supplierId?._id || supplierId;

  const invoices = await models.SupplierInvoice.find(query)
    .select('totalAmount grandTotal items invoiceDate supplier status')
    .lean();

  if (!productIdSet) {
    // whole invoice final amount
    return invoices.reduce((sum, inv) => sum + (inv.grandTotal ?? inv.totalAmount ?? 0), 0);
  }

  const set = new Set(productIdSet);
  let total = 0;
  for (const inv of invoices) {
    for (const item of (inv.items || [])) {
      const pid = item.product ? item.product.toString() : null;
      if (pid && set.has(pid)) {
        total += (item.totalPrice || 0);
      }
    }
  }
  return total;
};

// Compute progress for a single turnover discount doc (returns plain object)
const computeProgressForDoc = async (models, td) => {
  const productIdSet = await resolveScopedProductIds(models, td);
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
    const achievedAmount = await computeTurnover(models, td.supplier, start, end, productIdSet);
    const progressPct = p.targetAmount > 0 ? Math.min(100, (achievedAmount / p.targetAmount) * 100) : 0;
    const achieved = achievedAmount >= p.targetAmount && p.targetAmount > 0;
    periods.push({
      periodType: p.periodType,
      periodLabel: label,
      periodStart: start,
      periodEnd: end,
      targetAmount: p.targetAmount,
      discountPercentage: p.discountPercentage,
      achievedAmount,
      remainingAmount: Math.max(0, p.targetAmount - achievedAmount),
      progressPct: Math.round(progressPct * 100) / 100,
      achieved,
    });
  }

  return periods;
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const createTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const {
      supplier, targetType = 'all', brand, category, subcategory, product,
      targetName, periods, validFrom, validTo, description, isActive,
    } = req.body;

    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one period target is required' });
    }

    const supplierDoc = supplier
      ? await models.Supplier.findById(supplier).select('supplierName name').lean()
      : null;

    const doc = await models.TurnoverDiscount.create({
      supplier: supplier || null,
      supplierName: supplierDoc?.supplierName || supplierDoc?.name || '',
      targetType,
      brand:       targetType === 'brand'       ? (brand       || null) : null,
      category:    targetType === 'category'    ? (category    || null) : null,
      subcategory: targetType === 'subcategory' ? (subcategory || null) : null,
      product:     targetType === 'product'     ? (product     || null) : null,
      targetName: targetName || 'All Products',
      periods,
      validFrom: validFrom || Date.now(),
      validTo: validTo || undefined,
      description: description || '',
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Turnover discount created', data: doc });
  } catch (error) {
    console.error('createTurnoverDiscount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTurnoverDiscounts = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const { supplier, isActive, targetType } = req.query;

    const query = {};
    if (supplier) query.supplier = supplier;
    if (targetType) query.targetType = targetType;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const docs = await models.TurnoverDiscount.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('product', 'itemName productCode')
      .sort({ createdAt: -1 })
      .lean();

    // Attach live progress to each doc
    const withProgress = [];
    for (const td of docs) {
      const progress = await computeProgressForDoc(models, td);
      withProgress.push({ ...td, progress });
    }

    res.json({ success: true, data: withProgress });
  } catch (error) {
    console.error('getTurnoverDiscounts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const td = await models.TurnoverDiscount.findById(req.params.id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('product', 'itemName productCode')
      .lean();

    if (!td) return res.status(404).json({ success: false, message: 'Not found' });

    const progress = await computeProgressForDoc(models, td);
    res.json({ success: true, data: { ...td, progress } });
  } catch (error) {
    console.error('getTurnoverDiscount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const {
      supplier, targetType, brand, category, subcategory, product,
      targetName, periods, validFrom, validTo, description, isActive,
    } = req.body;

    const td = await models.TurnoverDiscount.findById(req.params.id);
    if (!td) return res.status(404).json({ success: false, message: 'Not found' });

    if (supplier !== undefined) {
      td.supplier = supplier || null;
      const supplierDoc = supplier
        ? await models.Supplier.findById(supplier).select('supplierName name').lean()
        : null;
      td.supplierName = supplierDoc?.supplierName || supplierDoc?.name || td.supplierName;
    }
    if (targetType !== undefined) {
      td.targetType = targetType;
      td.brand       = targetType === 'brand'       ? ((brand       || null) ?? td.brand)       : null;
      td.category    = targetType === 'category'    ? ((category    || null) ?? td.category)    : null;
      td.subcategory = targetType === 'subcategory' ? ((subcategory || null) ?? td.subcategory) : null;
      td.product     = targetType === 'product'     ? ((product     || null) ?? td.product)     : null;
    } else {
      if (brand       !== undefined) td.brand       = brand       || null;
      if (category    !== undefined) td.category    = category    || null;
      if (subcategory !== undefined) td.subcategory = subcategory || null;
      if (product     !== undefined) td.product     = product     || null;
    }
    if (targetName !== undefined) td.targetName = targetName;
    if (Array.isArray(periods) && periods.length > 0) td.periods = periods;
    if (validFrom !== undefined) td.validFrom = validFrom;
    if (validTo !== undefined) td.validTo = validTo;
    if (description !== undefined) td.description = description;
    if (isActive !== undefined) td.isActive = isActive;
    td.updatedBy = req.user._id;

    await td.save();
    res.json({ success: true, message: 'Turnover discount updated', data: td });
  } catch (error) {
    console.error('updateTurnoverDiscount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTurnoverDiscount = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    const td = await models.TurnoverDiscount.findByIdAndDelete(req.params.id);
    if (!td) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Turnover discount deleted' });
  } catch (error) {
    console.error('deleteTurnoverDiscount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Progress + achievement check (also used by cron / invoice hook)
// ---------------------------------------------------------------------------

// Evaluate all active turnover discounts, persist achievements, and fire
// notifications for newly-achieved period targets (single + multiple).
export const evaluateAchievements = async (dbConnection, company) => {
  const models = getModels(dbConnection);
  const now = new Date();
  const docs = await models.TurnoverDiscount.find({ isActive: true });

  for (const td of docs) {
    const productIdSet = await resolveScopedProductIds(models, td);
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

      const achievedAmount = await computeTurnover(models, td.supplier, start, end, productIdSet);
      const isAchieved = p.targetAmount > 0 && achievedAmount >= p.targetAmount;

      // find or create achievement record for this period label + type
      let ach = td.achievements.find(a => a.periodType === p.periodType && a.periodLabel === label);
      if (!ach) {
        ach = {
          periodType: p.periodType,
          periodLabel: label,
          achievedAmount,
          targetAmount: p.targetAmount,
          discountPercentage: p.discountPercentage,
          achieved: false,
          achievedAt: null,
          notified: false,
        };
        td.achievements.push(ach);
        ach = td.achievements[td.achievements.length - 1];
      } else {
        ach.achievedAmount = achievedAmount;
        ach.targetAmount = p.targetAmount;
        ach.discountPercentage = p.discountPercentage;
      }

      if (isAchieved && !ach.achieved) {
        ach.achieved = true;
        ach.achievedAt = now;
      }

      if (isAchieved && !ach.notified) {
        newlyAchieved.push({ periodType: p.periodType, label, discountPercentage: p.discountPercentage, targetAmount: p.targetAmount, achievedAmount });
        ach.notified = true;
      }
    }

    if (newlyAchieved.length > 0) {
      await td.save();
      try {
        await notifyTurnoverAchieved({
          supplierName: td.supplierName,
          targetName: td.targetName,
          achievements: newlyAchieved,
          turnoverId: td._id.toString(),
          company,
        });
      } catch (e) { /* silent */ }
    } else {
      // still persist updated running amounts
      await td.save();
    }
  }
};

export const resetTurnoverNotifications = async (req, res) => {
  try {
    const models = getModels(req.dbConnection);
    // Reset notified flag on all achieved achievements so they fire again
    const result = await models.TurnoverDiscount.updateMany(
      { 'achievements.achieved': true },
      { $set: { 'achievements.$[elem].notified': false } },
      { arrayFilters: [{ 'elem.achieved': true }] }
    );
    // Re-run evaluation to fire notifications (fire-and-forget to avoid timeout)
    evaluateAchievements(req.dbConnection, req.company).catch(e =>
      console.error('evaluateAchievements error:', e.message)
    );
    res.json({ success: true, message: 'Notifications reset and re-evaluated' });
  } catch (error) {
    console.error('resetTurnoverNotifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// HTTP endpoint: recompute + return progress and trigger notifications
export const getTurnoverProgress = async (req, res) => {
  try {
    await evaluateAchievements(req.dbConnection, req.company);
    const models = getModels(req.dbConnection);

    const docs = await models.TurnoverDiscount.find({ isActive: true })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('product', 'itemName productCode')
      .lean();

    const withProgress = [];
    for (const td of docs) {
      const progress = await computeProgressForDoc(models, td);
      withProgress.push({ ...td, progress });
    }

    res.json({ success: true, data: withProgress });
  } catch (error) {
    console.error('getTurnoverProgress error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
