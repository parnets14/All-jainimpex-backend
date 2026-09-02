// Sales Order Controller - Fixed duplicate function declarations
import { salesOrderSchema } from "../models/SalesOrder.js";
import { productSchema } from "../models/Product.js";
import { dealerSchema } from "../models/Dealer.js";
import { stockMovementSchema } from "../models/Stock.js";
import { userSchema } from "../models/User.js";
import { notificationSchema } from "../models/Notification.js";
import { warehouseSchema } from "../models/Warehouse.js";
import { regionSchema } from "../models/Region.js";
import { discountMappingSchema } from "../models/DiscountMapping.js";
import { notifyCreditLimitExceeded, sendAdminNotification } from "../services/adminNotificationService.js";
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import { sendPushNotification } from '../services/firebaseNotificationService.js';
import {
  calculateDiscountLine,
  calculateRequiredSequentialStageRatePercentage,
  normalizeRateMap,
  resolveDealerExtraDiscountBySpecificity
} from '../utils/sequentialDiscountPolicy.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
    Notification: dbConnection.models.Notification || dbConnection.model('Notification', notificationSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
    Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
    DiscountMapping: dbConnection.models.DiscountMapping || dbConnection.model('DiscountMapping', discountMappingSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
  };
};

const createDiscountPolicyError = (message, code) => {
  const error = new Error(message);
  error.name = 'DiscountPolicyError';
  error.code = code;
  return error;
};

const objectIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';

const resolveAndValidateDealerExtraDiscount = ({ submittedItem, dealer, product }) => {
  const configuredRate = resolveDealerExtraDiscountBySpecificity(dealer, product);
  if (Object.prototype.hasOwnProperty.call(submittedItem, 'dealerExtraDiscount')) {
    const submittedRate = Number(submittedItem.dealerExtraDiscount);
    if (!Number.isFinite(submittedRate) || Math.abs(submittedRate - configuredRate) > 0.01) {
      throw createDiscountPolicyError(
        `Dealer extra discount for ${product.itemName} is configured at ${configuredRate}%; remove the submitted value or send the configured rate.`,
        'DEALER_EXTRA_DISCOUNT_MISMATCH'
      );
    }
  }
  return configuredRate;
};

const sendDiscountPolicyError = (res, error) => {
  if (error?.name !== 'DiscountPolicyError' && !(error instanceof RangeError)) return false;

  res.status(400).json({
    success: false,
    message: error.message,
    code: error.code || (error instanceof RangeError ? 'INVALID_DISCOUNT_RATE' : 'DISCOUNT_POLICY_INVALID'),
    ...(error.violations ? { violations: error.violations } : {})
  });
  return true;
};

const canonicalizeSalesOrderProducts = async ({ products, dealer, dbConnection, actorId }) => {
  const { Product, DiscountMapping, User } = getModels(dbConnection);
  const actor = actorId
    ? await User.findById(actorId).select('role allowedDiscountLevels').lean()
    : null;
  const enforceLevelPermissions = true;
  const bypassLevelPermission = false;
  const allowedDiscountLevels = actor?.allowedDiscountLevels || [];

  return Promise.all((products || []).map(async (submittedItem) => {
    const productId = submittedItem.product?._id || submittedItem.product || submittedItem.productId;
    const product = await Product.findById(productId)
      .select('itemName productCode HSNCode internalRate brand category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5 gst rateSlabs salesType')
      .lean();
    if (!product) {
      throw createDiscountPolicyError(
        `Product not found for sales order line ${submittedItem.productName || productId}`,
        'PRODUCT_NOT_FOUND'
      );
    }

    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales',
      dealer?.dealerType || null,
      dbConnection
    );
    const mapping = applicableDiscounts[0] || null;
    const combinedLevelDiscountCap = mapping?.combinedLevelDiscountCap
      ?? mapping?.maxDiscountPercentage
      ?? null;
    // Sales Orders capture only automatic commercial terms. User-assigned
    // level discounts are retained in the mapping snapshot for reference and
    // become executable only when an invoice creator explicitly selects them.
    const selectedDiscountLevels = [];
    const manualDiscountLevels = {};
    const dealerExtraDiscount = resolveAndValidateDealerExtraDiscount({
      submittedItem,
      dealer,
      product
    });
    const mappingLevels = mapping?.levels || [];
    const stages = [];

    const directDiscountPercentage = mapping && (mapping.discountType === 'direct' || mapping.discountType === 'both')
      ? Number(mapping.directDiscountPercentage || 0)
      : 0;
    if (directDiscountPercentage > 0) {
      stages.push({ key: 'direct', kind: 'direct', ratePercentage: directDiscountPercentage });
    }

    if (dealerExtraDiscount > 0) {
      stages.push({ key: 'dealer-extra', kind: 'dealer_extra', ratePercentage: dealerExtraDiscount });
    }
    if (!mapping && stages.length > 0) {
      throw createDiscountPolicyError(
        `No applicable discount mapping exists for ${product.itemName}`,
        'DISCOUNT_MAPPING_NOT_FOUND'
      );
    }
    if (stages.some((stage) => stage.ratePercentage > 0)
        && mapping
        && (mapping.masterDiscountCap === null
        || mapping.masterDiscountCap === undefined
        || mapping.masterDiscountCap === '')) {
      throw createDiscountPolicyError(
        `Master discount cap is not configured for the applicable sales mapping on ${product.itemName}.`,
        'MASTER_DISCOUNT_CAP_NOT_CONFIGURED'
      );
    }
    const hasSelectedLevelStages = stages.some(
      (stage) => stage.kind === 'level' && stage.ratePercentage > 0
    );
    if (hasSelectedLevelStages && combinedLevelDiscountCap === null) {
      throw createDiscountPolicyError(
        `Combined selected-level discount cap is not configured for the applicable sales mapping on ${product.itemName}.`,
        'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED'
      );
    }

    const quantity = Number(submittedItem.quantity || 0);
    const unitPrice = Number(submittedItem.unitPrice ?? product.rateSlabs?.[0]?.rate ?? 0);
    const calculation = calculateDiscountLine({
      baseAmount: quantity * unitPrice,
      stages,
      gstPercentage: Number(submittedItem.gst ?? product.gst ?? 0),
      promisedEffectiveDiscountPercentage: submittedItem.promisedEffectiveDiscountPercentage,
      masterDiscountCap: mapping?.masterDiscountCap ?? null,
      combinedLevelDiscountCap,
      allowedDiscountLevels,
      enforceLevelPermissions,
      bypassLevelPermission
    });

    const discountFamilyKey = product.subcategory
      ? `subcategory:${product.subcategory}`
      : null;
    const capturedAt = new Date();
    const normalizedLevels = mappingLevels.map((level) => ({
      levelName: level.levelName,
      discountPercentage: Number(level.discountPercentage || 0),
      description: level.description || ''
    }));
    const discountPolicySnapshot = mapping ? {
      flowVersion: 'sales-order-base-v2',
      discountMappingId: mapping._id,
      discountMappingName: mapping.discountName,
      mappingUpdatedAt: mapping.updatedAt || null,
      discountFamilyKey,
      discountType: mapping.discountType,
      directDiscountPercentage,
      levels: normalizedLevels,
      dealerExtraDiscountPercentage: dealerExtraDiscount,
      masterDiscountCap: mapping.masterDiscountCap,
      combinedLevelDiscountCap,
      orderedStages: calculation.stages.map((stage) => ({
        key: stage.key,
        kind: stage.kind,
        levelName: stage.levelName || null,
        ratePercentage: stage.ratePercentage
      })),
      capturedAt
    } : null;
    const discountPermissionSnapshot = {
      actorUserId: actor?._id || actorId || null,
      actorRole: actor?.role || null,
      allowedDiscountLevels,
      enforceLevelPermissions,
      bypassLevelPermission,
      capturedAt
    };

    return {
      ...submittedItem,
      product: product._id,
      productCode: product.productCode,
      productName: product.itemName,
      HSNCode: product.HSNCode,
      internalRate: product.internalRate || null,
      quantity,
      unitPrice,
      gst: Number(submittedItem.gst ?? product.gst ?? 0),
      salesType: submittedItem.salesType || product.salesType || 'Regular Sale',
      selectedDiscountLevels,
      manualDiscountLevels,
      dealerExtraDiscount,
      discountPercentage: stages
        .filter((stage) => stage.kind === 'direct' || stage.kind === 'level')
        .reduce((sum, stage) => sum + stage.ratePercentage, 0),
      discountAmount: calculation.discountAmount,
      gstAmount: calculation.gstAmount,
      totalPrice: calculation.finalAmount,
      effectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
      promisedEffectiveDiscountPercentage: calculation.promisedEffectiveDiscountPercentage,
      requiredSequentialStageRatePercentage: calculation.requiredSequentialStageRatePercentage,
      masterDiscountCapApplied: calculation.masterDiscountCapApplied,
      combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
      levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage,
      discountFamilyKey,
      discountType: mapping?.discountType || null,
      discountPolicySnapshot,
      discountPermissionSnapshot,
      appliedDiscount: mapping ? {
        discountId: mapping._id,
        discountName: mapping.discountName,
        discountType: mapping.discountType,
        targetType: mapping.targetType,
        directDiscountPercentage,
        levels: normalizedLevels,
        masterDiscountCap: mapping.masterDiscountCap,
        combinedLevelDiscountCap
      } : null
    };
  }));
};

const calculateCanonicalCreditLineAmount = (product) => {
  const grossAmount = Number(product.quantity || 0) * Number(product.unitPrice || 0);
  const orderedStages = product.discountPolicySnapshot?.orderedStages || [];
  let creditStages = orderedStages.filter(
    (stage) => stage.kind === 'direct' || stage.kind === 'dealer_extra'
  );

  // Legacy persisted lines may predate ordered snapshots. Reconstruct only the
  // conservative direct + dealer-extra stages from server-persisted fields.
  if (orderedStages.length === 0) {
    creditStages = [];
    const directRate = Number(product.appliedDiscount?.directDiscountPercentage || 0);
    const dealerExtraRate = Number(product.dealerExtraDiscount || 0);
    if (directRate > 0) {
      creditStages.push({ key: 'direct', kind: 'direct', ratePercentage: directRate });
    }
    if (dealerExtraRate > 0) {
      creditStages.push({
        key: 'dealer-extra',
        kind: 'dealer_extra',
        ratePercentage: dealerExtraRate
      });
    }
  }

  return calculateDiscountLine({
    baseAmount: grossAmount,
    stages: creditStages,
    // Legacy lines predate policy caps. A neutral 100% ceiling preserves their
    // persisted direct/dealer-extra terms without weakening current snapshots.
    masterDiscountCap: orderedStages.length === 0
      ? 100
      : (product.discountPolicySnapshot?.masterDiscountCap ?? null)
  }).finalAmount;
};

const isCreditEligibleProduct = (product) => Boolean(
  product?.warehouse
  && product.warehouse !== 'No Stock'
  && product.warehouseName !== 'No Stock'
);

const hasCreditEligibilityChanged = (storedProducts = [], updatedProducts = []) => {
  if (storedProducts.length !== updatedProducts.length) return true;
  return updatedProducts.some((product, index) => (
    isCreditEligibleProduct(product) !== isCreditEligibleProduct(storedProducts[index])
  ));
};

const calculateCanonicalOrderTotals = (products = []) => ({
  grossAmount: products.reduce((sum, product) => sum + Number(product.quantity || 0) * Number(product.unitPrice || 0), 0),
  totalGst: products.reduce((sum, product) => sum + Number(product.gstAmount || 0), 0),
  discountAmount: products.reduce((sum, product) => sum + Number(product.discountAmount || 0), 0),
  totalAmount: products.reduce((sum, product) => sum + Number(product.totalPrice || 0), 0)
});

const normalizeComparableLevels = (levels) => JSON.stringify([...(levels || [])].map(String).sort());
const normalizeComparableRateMap = (rates) => JSON.stringify(
  Object.entries(normalizeRateMap(rates)).sort(([left], [right]) => left.localeCompare(right))
);
const normalizeComparableStages = (stages) => JSON.stringify((stages || []).map((stage) => ({
  key: stage?.key || null,
  kind: stage?.kind || null,
  levelName: stage?.levelName || null,
  ratePercentage: Number(stage?.ratePercentage || 0)
})));
const isFinalizedSalesOrderStatus = (status) => (
  ['Confirmed', 'Processing', 'In Transit', 'Delivered'].includes(String(status || '').trim())
);

const getDiscountDriverChangeReasons = (storedProducts = [], submittedProducts = []) => {
  if (storedProducts.length !== submittedProducts.length) return ['product line count'];

  const reasons = [];
  submittedProducts.forEach((submitted, index) => {
    const stored = storedProducts[index];
    const lineLabel = stored?.productName || submitted?.productName || `line ${index + 1}`;
    const submittedProductId = submitted.product?._id || submitted.product || submitted.productId;
    const storedProductId = stored.product?._id || stored.product;
    if (String(submittedProductId) !== String(storedProductId)) reasons.push(`${lineLabel}: product identity`);
    if (Number(submitted.gst ?? 0) !== Number(stored.gst ?? 0)) reasons.push(`${lineLabel}: GST`);
    if (Number(submitted.dealerExtraDiscount || 0) !== Number(stored.dealerExtraDiscount || 0)) {
      reasons.push(`${lineLabel}: dealer extra discount`);
    }
    if (normalizeComparableLevels(submitted.selectedDiscountLevels)
        !== normalizeComparableLevels(stored.selectedDiscountLevels)) {
      reasons.push(`${lineLabel}: selected discount levels`);
    }
    if (normalizeComparableRateMap(submitted.manualDiscountLevels)
        !== normalizeComparableRateMap(stored.manualDiscountLevels)) {
      reasons.push(`${lineLabel}: manual discount levels`);
    }
    if (Object.prototype.hasOwnProperty.call(submitted, 'discountPolicySnapshot')
        && normalizeComparableStages(submitted.discountPolicySnapshot?.orderedStages)
          !== normalizeComparableStages(stored.discountPolicySnapshot?.orderedStages)) {
      reasons.push(`${lineLabel}: direct/persisted discount policy`);
    }
    if (Object.prototype.hasOwnProperty.call(submitted, 'appliedDiscount')) {
      const submittedMappingId = objectIdString(submitted.appliedDiscount?.discountId);
      const storedMappingId = objectIdString(stored.appliedDiscount?.discountId);
      const submittedDirectRate = Number(submitted.appliedDiscount?.directDiscountPercentage || 0);
      const storedDirectRate = Number(stored.appliedDiscount?.directDiscountPercentage || 0);
      if (submittedMappingId !== storedMappingId || submittedDirectRate !== storedDirectRate) {
        reasons.push(`${lineLabel}: direct discount policy`);
      }
    }
  });
  return [...new Set(reasons)];
};

const haveReplayableAmountInputsChanged = (storedProducts = [], submittedProducts = []) => {
  if (storedProducts.length !== submittedProducts.length) return false;
  return submittedProducts.some((submitted, index) => (
    Number(submitted.quantity) !== Number(storedProducts[index].quantity)
    || Number(submitted.unitPrice) !== Number(storedProducts[index].unitPrice)
  ));
};

const mergeMissingCanonicalInputs = (storedProducts, submittedProducts) => submittedProducts.map((submitted, index) => {
  const stored = storedProducts[index];
  const submittedProductId = submitted.product?._id || submitted.product || submitted.productId;
  const storedProductId = stored?.product?._id || stored?.product;
  if (!stored || String(submittedProductId) !== String(storedProductId)) return submitted;

  const hasSubmitted = (field) => Object.prototype.hasOwnProperty.call(submitted, field);
  return {
    ...submitted,
    quantity: hasSubmitted('quantity') ? submitted.quantity : stored.quantity,
    unitPrice: hasSubmitted('unitPrice') ? submitted.unitPrice : stored.unitPrice,
    gst: hasSubmitted('gst') ? submitted.gst : stored.gst,
    selectedDiscountLevels: hasSubmitted('selectedDiscountLevels')
      ? (submitted.selectedDiscountLevels || [])
      : stored.selectedDiscountLevels,
    manualDiscountLevels: hasSubmitted('manualDiscountLevels')
      ? (submitted.manualDiscountLevels || {})
      : stored.manualDiscountLevels,
    dealerExtraDiscount: hasSubmitted('dealerExtraDiscount')
      ? submitted.dealerExtraDiscount
      : stored.dealerExtraDiscount,
    promisedEffectiveDiscountPercentage: hasSubmitted('promisedEffectiveDiscountPercentage')
      ? submitted.promisedEffectiveDiscountPercentage
      : stored.promisedEffectiveDiscountPercentage
  };
});

const mergeNonFinancialProductUpdates = (storedProducts, submittedProducts) => submittedProducts.map((submitted, index) => {
  const stored = storedProducts[index]?.toObject ? storedProducts[index].toObject() : storedProducts[index];
  const warehouseWasSubmitted = Object.prototype.hasOwnProperty.call(submitted, 'warehouse');
  const submittedRealWarehouse = warehouseWasSubmitted
    && submitted.warehouse
    && submitted.warehouse !== 'No Stock';
  const promiseWasSubmitted = Object.prototype.hasOwnProperty.call(
    submitted,
    'promisedEffectiveDiscountPercentage'
  );
  const promisedEffectiveDiscountPercentage = promiseWasSubmitted
    ? (submitted.promisedEffectiveDiscountPercentage === ''
      ? null
      : submitted.promisedEffectiveDiscountPercentage)
    : stored.promisedEffectiveDiscountPercentage;
  const requiredSequentialStageRatePercentage = calculateRequiredSequentialStageRatePercentage({
    currentEffectiveDiscountPercentage: Number(stored.effectiveDiscountPercentage || 0),
    promisedEffectiveDiscountPercentage
  });
  return {
    ...stored,
    warehouse: submitted.warehouse ?? stored.warehouse,
    warehouseName: submitted.warehouseName
      ?? (submittedRealWarehouse && stored.warehouseName === 'No Stock' ? null : stored.warehouseName),
    promisedEffectiveDiscountPercentage,
    requiredSequentialStageRatePercentage,
    // Stock availability fields are server-owned and recalculated after warehouse edits.
    stockStatus: stored.stockStatus,
    availableQuantity: stored.availableQuantity,
    stockArrivedAt: stored.stockArrivedAt,
    stockCheckedAt: stored.stockCheckedAt
  };
});

const replayPersistedSalesOrderProducts = (storedProducts, submittedProducts) => {
  const nonFinancialProducts = mergeNonFinancialProductUpdates(storedProducts, submittedProducts);
  return submittedProducts.map((submitted, index) => {
    const stored = storedProducts[index]?.toObject
      ? storedProducts[index].toObject()
      : storedProducts[index];
    const policySnapshot = stored?.discountPolicySnapshot || null;
    const permissionSnapshot = stored?.discountPermissionSnapshot || null;
    let stages = policySnapshot?.orderedStages;
    const hasPersistedDiscountSignal = Number(stored?.discountAmount || 0) > 0
      || Number(stored?.discountPercentage || 0) > 0
      || Number(stored?.dealerExtraDiscount || 0) > 0
      || Number(stored?.appliedDiscount?.directDiscountPercentage || 0) > 0
      || (stored?.selectedDiscountLevels || []).length > 0;
    if (!Array.isArray(stages) || stages.length === 0) {
      if (hasPersistedDiscountSignal) {
        throw createDiscountPolicyError(
          `Sales order line ${stored?.productName || index + 1} has no ordered discount snapshot. Send repriceDiscounts: true to use current policy.`,
          'REPRICE_DISCOUNTS_REQUIRED'
        );
      }
      stages = [];
    }

    const normalizedStages = stages.map((stage) => ({
      key: stage.key,
      kind: stage.kind,
      levelName: stage.levelName || null,
      ratePercentage: Number(stage.ratePercentage || 0)
    }));
    if (normalizedStages.some((stage) => stage.ratePercentage > 0)
        && (policySnapshot?.masterDiscountCap === null
          || policySnapshot?.masterDiscountCap === undefined
          || policySnapshot?.masterDiscountCap === '')) {
      throw createDiscountPolicyError(
        `Sales order line ${stored?.productName || index + 1} has a discounted snapshot without a master discount cap. Send repriceDiscounts: true after configuring the mapping.`,
        'MASTER_DISCOUNT_CAP_NOT_CONFIGURED'
      );
    }
    const combinedLevelDiscountCap = policySnapshot?.combinedLevelDiscountCap
      ?? stored?.appliedDiscount?.combinedLevelDiscountCap
      ?? stored?.appliedDiscount?.maxDiscountPercentage
      ?? null;
    if (normalizedStages.some((stage) => stage.kind === 'level' && stage.ratePercentage > 0)
        && combinedLevelDiscountCap === null) {
      throw createDiscountPolicyError(
        `Sales order line ${stored?.productName || index + 1} has selected level discounts without a combined level cap. Send repriceDiscounts: true after configuring the mapping.`,
        'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED'
      );
    }

    const quantity = Number(submitted.quantity);
    const unitPrice = Number(submitted.unitPrice);
    const gstPercentage = Number(stored.gst || 0);
    const calculation = calculateDiscountLine({
      baseAmount: quantity * unitPrice,
      stages: normalizedStages,
      gstPercentage,
      promisedEffectiveDiscountPercentage: nonFinancialProducts[index].promisedEffectiveDiscountPercentage,
      masterDiscountCap: policySnapshot?.masterDiscountCap ?? null,
      combinedLevelDiscountCap,
      allowedDiscountLevels: permissionSnapshot?.allowedDiscountLevels || [],
      enforceLevelPermissions: permissionSnapshot?.enforceLevelPermissions === true,
      bypassLevelPermission: permissionSnapshot?.bypassLevelPermission === true
    });

    return {
      ...nonFinancialProducts[index],
      quantity,
      unitPrice,
      discountAmount: calculation.discountAmount,
      gstAmount: calculation.gstAmount,
      totalPrice: calculation.finalAmount,
      effectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
      requiredSequentialStageRatePercentage: calculation.requiredSequentialStageRatePercentage,
      masterDiscountCapApplied: calculation.masterDiscountCapApplied,
      combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
      levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage
    };
  });
};

const getPersistedEffectiveDiscountPercentage = (product) => {
  const persistedEffective = Number(product.effectiveDiscountPercentage);
  if (product.effectiveDiscountPercentage !== null
      && product.effectiveDiscountPercentage !== undefined
      && Number.isFinite(persistedEffective)) {
    return persistedEffective;
  }
  const grossAmount = Number(product.quantity || 0) * Number(product.unitPrice || 0);
  return grossAmount > 0 ? Number(product.discountAmount || 0) / grossAmount * 100 : 0;
};

const discountAmountForQuantity = (product, quantity, effectiveDiscountPercentage) => {
  const grossAmount = Number(quantity || 0) * Number(product.unitPrice || 0);
  return Math.round((grossAmount * effectiveDiscountPercentage / 100 + Number.EPSILON) * 100) / 100;
};

/**
 * Calculate the true current credit outstanding for a dealer.
 * Matches the logic in dealerController.getDealerPaymentStatus:
 *   outstanding = (ledger debit - ledger credit) - paymentAllocations + confirmedOrdersNotYetInvoiced
 *
 * @param {object} dbConnection - Company-specific database connection
 * @param {string} dealerId
 * @param {string|null} excludeOrderId  - pass a sales order _id to exclude it from confirmed-orders sum (for edit re-check)
 * @param {object|null} session - optional MongoDB session for transactional callers
 * @returns {Promise<number>}
 */
const getDealerCreditOutstanding = async (
  dbConnection,
  dealerId,
  excludeOrderId = null,
  session = null
) => {
  const { DealerLedger, DealerInvoice, PaymentAllocation, SalesOrder, Dealer } = getModels(dbConnection);
  const applySession = (query) => session ? query.session(session) : query;

  // 1. Ledger balance (invoices - payments)
  const ledgerEntries = await applySession(DealerLedger.find({ dealer: dealerId }));
  const ledgerBalance = ledgerEntries.reduce(
    (sum, e) => sum + (e.debitAmount || 0) - (e.creditAmount || 0),
    0
  );

  // 2. Payment allocations (reduce outstanding)
  const paymentAllocations = await applySession(
    PaymentAllocation.find({ partyId: dealerId }).lean()
  );
  const totalAllocated = paymentAllocations.reduce(
    (sum, a) => sum + (a.totalAllocated || 0),
    0
  );

  const invoiceOutstanding = ledgerBalance - totalAllocated;

  // 3. Confirmed/Processing orders not yet invoiced
  const confirmedOrders = await applySession(SalesOrder.find({
    dealer: dealerId,
    status: { $in: ['Confirmed', 'Processing', 'In Transit'] }
  }).populate(
    'products.product',
    'brand category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5'
  ).lean());

  const invoicedOrderIds = await applySession(DealerInvoice.distinct('salesOrder', {
    dealer: dealerId,
    salesOrder: { $ne: null },
    status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
    isDraft: { $ne: true }
  }));
  const invoicedSet = new Set(invoicedOrderIds.map(id => id.toString()));

  // Fetch dealer extra discounts once for matching
  const dealerData = await applySession(
    Dealer.findById(dealerId).select('extraDiscounts').lean()
  );
  const extraDiscounts = (dealerData?.extraDiscounts || []).filter(d => d.isActive !== false);

  // Legacy lines without creditAmount are resolved with the same authoritative
  // Product hierarchy and specificity order as current Sales Order pricing.
  const getDealerExtraDiscountPct = (productDoc) => (
    resolveDealerExtraDiscountBySpecificity({ extraDiscounts }, productDoc)
  );

  const confirmedAmount = confirmedOrders.reduce((sum, order) => {
    if (invoicedSet.has(order._id.toString())) return sum;
    if (excludeOrderId && order._id.toString() === excludeOrderId.toString()) return sum;

    const storedCreditAmount = Number(order.creditAmount);
    if (order.creditAmount !== null && order.creditAmount !== undefined && Number.isFinite(storedCreditAmount)) {
      return sum + storedCreditAmount;
    }

    // Legacy fallback: MRP is GST inclusive. Preserve the stored line discount,
    // then apply the current dealer-extra percentage sequentially without adding GST again.
    const orderTotal = (order.products || []).reduce((lineSum, productLine) => {
      const grossAmount = Number(productLine.quantity || 0) * Number(productLine.unitPrice || 0);
      const amountAfterStoredDiscount = grossAmount - Number(productLine.discountAmount || 0);
      const extraPercentage = getDealerExtraDiscountPct(productLine.product);
      return lineSum + amountAfterStoredDiscount * (1 - extraPercentage / 100);
    }, 0);
    return sum + orderTotal;
  }, 0);

  return invoiceOutstanding + confirmedAmount;
};

// Generate unique order number
const generateOrderNumber = async (dbConnection, session = null) => {
  try {
    const { SalesOrder } = getModels(dbConnection);
    const applySession = (query) => session ? query.session(session) : query;
    const currentYear = new Date().getFullYear();
    const prefix = `SO-${currentYear}-`;

    // Find the highest order number for this year
    const lastOrder = await applySession(SalesOrder.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 }));

    let nextNumber = 1;
    if (lastOrder) {
      // Extract the number from the last order
      const lastNumber = parseInt(lastOrder.orderNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    // Format with leading zeros (4 digits)
    const orderNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;

    // Double-check uniqueness (in case of race conditions)
    const existingOrder = await applySession(SalesOrder.findOne({ orderNumber }));
    if (existingOrder) {
      // If somehow it exists, try the next number
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }

    return orderNumber;
  } catch (error) {
    if (session) throw error;
    console.error('Error generating order number:', error);
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString().slice(-6);
    return `SO-${new Date().getFullYear()}-${timestamp}`;
  }
};

// @desc    Get all sales orders
// @route   GET /api/sales-orders
// @access  Private
export const getSalesOrders = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Dealer, Product, User, DealerInvoice } = getModels(req.dbConnection);

    const {
      page = 1,
      limit = 10,
      search,
      status,
      dealer,
      region,
      startDate,
      endDate,
      type,
      stockArrived,
      hideDelivered,
      // Advanced filters
      dateRange,
      expired,
      orderType,
      warehouse,
      dealerType,
      creditDaysRange,
      minAmount,
      maxAmount,
      product
    } = req.query;

    // Build query object
    const query = {};

    // Exclude Delivered orders by default unless explicitly requested
    if (hideDelivered === 'true') {
      query.status = { $ne: 'Delivered' };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { "products.productName": { $regex: search, $options: "i" } }
      ];

    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Filter by stock arrived
    if (stockArrived === 'true' || stockArrived === true) {
      // Stock Arrived is an actionable queue: historically out-of-stock,
      // currently ready, and still awaiting confirmation.
      query.status = 'Pending';
      query.isExpired = { $ne: true };
      query.isOutOfStock = true;
      query['orderStockStatus.overallStatus'] = 'ready';
    }

    // Filter by dealer
    if (dealer) {
      query.dealer = dealer;
    }

    // Filter by product
    if (product) {
      query['products.product'] = product;
    }

    // Filter by region
    if (region) {
      query.region = region;
    }

    // Filter by order type (legacy param)
    if (type) {
      query.type = type;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate) query.orderDate.$gte = new Date(startDate);
      if (endDate) query.orderDate.$lte = new Date(endDate);
    }

    // Advanced: dateRange preset (overrides startDate/endDate if set)
    if (dateRange && dateRange !== "all" && !startDate && !endDate) {
      const now = new Date();
      const rangeStart = new Date();
      if (dateRange === "1day") rangeStart.setDate(now.getDate() - 1);
      else if (dateRange === "7days") rangeStart.setDate(now.getDate() - 7);
      else if (dateRange === "30days") rangeStart.setDate(now.getDate() - 30);
      else if (dateRange === "6months") rangeStart.setMonth(now.getMonth() - 6);
      else if (dateRange === "1year") rangeStart.setFullYear(now.getFullYear() - 1);
      query.orderDate = { $gte: rangeStart, $lte: now };
    }

    // Advanced: Expiry status filter
    if (!(stockArrived === 'true' || stockArrived === true) && expired && expired !== "all") {
      const now = new Date();
      if (expired === "expired") {
        query.isExpired = true;
      } else if (expired === "notExpired") {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { isExpired: false },
            { isExpired: { $exists: false } }
          ]
        });
      } else if (expired === "expiringSoon") {
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(now.getDate() + 7);
        query.$and = query.$and || [];
        query.$and.push({
          expiryDate: { $gte: now, $lte: sevenDaysLater },
          isExpired: { $ne: true }
        });
      }
    }

    // Advanced: Order type (CD vs Regular vs Out of Stock)
    if (orderType && orderType !== "all") {
      if (orderType === "cd") {
        query.salesType = "CD Sales";
      } else if (orderType === "regular") {
        query.salesType = "Regular Sale";
      } else if (orderType === "outOfStock") {
        query.isOutOfStock = true;
      }
    }

    // Advanced: Warehouse filter (filter orders that have products in this warehouse)
    if (warehouse) {
      query['products.warehouse'] = warehouse;
    }

    // Advanced: Dealer type filter
    if (dealerType) {
      query.dealerType = dealerType;
    }

    // Advanced: Credit days range filter
    if (creditDaysRange && creditDaysRange !== "all") {
      if (creditDaysRange === "0") {
        query.creditDays = 0;
      } else if (creditDaysRange === "1-7") {
        query.creditDays = { $gte: 1, $lte: 7 };
      } else if (creditDaysRange === "8-15") {
        query.creditDays = { $gte: 8, $lte: 15 };
      } else if (creditDaysRange === "16-30") {
        query.creditDays = { $gte: 16, $lte: 30 };
      } else if (creditDaysRange === "30+") {
        query.creditDays = { $gt: 30 };
      }
    }

    // Advanced: Amount range filter
    if (minAmount || maxAmount) {
      query.totalAmount = {};
      if (minAmount) query.totalAmount.$gte = parseFloat(minAmount);
      if (maxAmount) query.totalAmount.$lte = parseFloat(maxAmount);
    }

    // Execute query with pagination
    const salesOrders = await SalesOrder.find(query)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product", "productCode itemName HSNCode gst rateSlabs salesType")
      .populate("products.warehouse", "name")
      .populate("products.appliedDiscount.discountId", "discountName discountType targetType")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination and the authoritative actionable Stock Arrived count.
    const [total, stockArrivedCount] = await Promise.all([
      SalesOrder.countDocuments(query),
      SalesOrder.countDocuments({
        status: 'Pending',
        isExpired: { $ne: true },
        isOutOfStock: true,
        'orderStockStatus.overallStatus': 'ready'
      })
    ]);

    // Calculate additional analytics for each order
    // Bulk-lookup which orders have invoices (one query instead of N)
    const orderIds = salesOrders.map(o => o._id);
    const invoicedOrderIds = await DealerInvoice.distinct('salesOrder', {
      salesOrder: { $in: orderIds },
      status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
      isDraft: { $ne: true }
    });
    const invoicedSet = new Set(invoicedOrderIds.map(id => id.toString()));

    const ordersWithAnalytics = salesOrders.map(order => {
      const totalItems = order.products ? order.products.reduce((sum, product) => sum + (product.quantity || 0), 0) : 0;
      return {
        ...order,
        totalItems,
        hasInvoice: invoicedSet.has(order._id.toString()),
        isOverdue: order.dueDate && new Date(order.dueDate) < new Date() && order.status !== "Delivered" && order.status !== "Cancelled"
      };
    });

    res.json({
      success: true,
      salesOrders: ordersWithAnalytics,
      stockArrivedCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Sales Orders Error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: "Error fetching sales orders",
      error: error.message
    });
  }
};

// @desc    Get single sales order
// @route   GET /api/sales-orders/:id
// @access  Private
export const getSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, DealerInvoice } = getModels(req.dbConnection);

    const salesOrder = await SalesOrder.findById(req.params.id)
      .populate("dealer", "name code contactPerson phone email address dealerType gstNumber panNumber")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("products.appliedDiscount.discountId", "discountName discountType targetType")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email")
      .lean();

    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    const invoice = await DealerInvoice.findOne({
      salesOrder: salesOrder._id,
      status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
      isDraft: { $ne: true }
    })
      .select('_id invoiceNumber invoiceDate status totalAmount paymentStatus')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      salesOrder: {
        ...salesOrder,
        hasInvoice: Boolean(invoice),
        invoice: invoice || null
      }
    });
  } catch (error) {
    console.error("Get Sales Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sales order",
      error: error.message
    });
  }
};

// @desc    Create new sales order
// @route   POST /api/sales-orders
// @access  Private
export const createSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification, Warehouse } = getModels(req.dbConnection);

    console.log("Received request body:", req.body);

    const {
      dealer,
      region,
      pinCode,
      products,
      orderDate,
      deliveryDate,
      creditDays,
      type,
      salesType,
      remarks,
      status,
      isOutOfStock,
      stockValidation
    } = req.body;

    // Generate unique order number
    const orderNumber = await generateOrderNumber(req.dbConnection);
    console.log("Generated order number:", orderNumber);

    // Validate dealer exists
    const dealerData = await Dealer.findById(dealer);
    if (!dealerData) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    const canonicalProducts = await canonicalizeSalesOrderProducts({
      products,
      dealer: dealerData,
      dbConnection: req.dbConnection,
      actorId: req.user._id
    });

    // Use dealer's credit days if not provided in request
    const finalCreditDays = creditDays !== undefined && creditDays !== null
      ? parseInt(creditDays)
      : (dealerData.creditDays || 30);

    // Validate credit days don't exceed dealer's limits
    if (creditDays !== undefined && creditDays !== null) {
      const requestedCreditDays = parseInt(creditDays);

      // Determine which limit to check based on salesType
      let maxCreditDays = 0;
      if (salesType === 'Regular Sale') {
        maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
      } else if (salesType === 'CD Sales') {
        maxCreditDays = dealerData.creditDaysCD || dealerData.creditDays || 0;
      } else {
        // Default to regular if not specified
        maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
      }

      if (requestedCreditDays > maxCreditDays && maxCreditDays > 0) {
        return res.status(400).json({
          success: false,
          message: `Credit days (${requestedCreditDays}) cannot exceed dealer's limit of ${maxCreditDays} days for ${salesType || 'Regular Sale'}.`
        });
      }
    }

    // Calculate order totals first (needed for credit limit check)
    // IMPORTANT: Only include IN-STOCK products in credit limit calculation
    const tempValidatedProducts = [];
    for (const item of canonicalProducts) {
      // Skip out-of-stock products (no warehouse or warehouse is "No Stock")
      const hasStock = item.warehouse && item.warehouse !== "No Stock";
      if (!hasStock) {
        console.log(`⏭️ Skipping product ${item.productName} from credit limit calculation (out of stock)`);
        continue;
      }

      tempValidatedProducts.push({
        effectiveBaseAmount: calculateCanonicalCreditLineAmount(item)
      });
    }

    const orderTotalAmount = tempValidatedProducts.reduce((sum, p) => sum + p.effectiveBaseAmount, 0);

    console.log(`💰 Credit Limit Calculation - In-Stock Products Only:`, {
      totalProducts: canonicalProducts.length,
      inStockProducts: tempValidatedProducts.length,
      orderAmount: orderTotalAmount
    });

    // CREDIT LIMIT CHECK: If dealer has a credit limit and order exceeds it, force Pending status
    if (dealerData.creditLimit && dealerData.creditLimit > 0) {
      const currentOutstanding = await getDealerCreditOutstanding(req.dbConnection, dealerData._id);
      // Use creditAmount (conservative: direct + dealer extra only) for the check
      const creditCheckAmount = orderTotalAmount;
      const newOutstanding = currentOutstanding + creditCheckAmount;

      console.log(`💳 Credit Limit Check (createSalesOrder):`, {
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: orderTotalAmount,
        newOutstanding,
        overlimit: newOutstanding - dealerData.creditLimit
      });

      if (newOutstanding > dealerData.creditLimit) {
        const overlimitAmount = newOutstanding - dealerData.creditLimit;
        console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)} - forcing status to Pending`);
        req.body.status = "Pending";

        // Notify admin about credit limit breach
        try { notifyCreditLimitExceeded(dealerData.name, '', overlimitAmount, req.company); } catch(e) {}
        req.body.creditOverlimit = {
          isOverlimit: true,
          creditLimit: dealerData.creditLimit,
          currentOutstanding,
          orderAmount: orderTotalAmount,
          newOutstanding,
          overlimitAmount,
          requiresApproval: true
        };
      }
    }

    // Validate and process each product
    const validatedProducts = [];

    // Resolve the company's single (default) warehouse — used for out-of-stock
    // lines so incoming stock (GRN or manual adjustment) can auto-update them.
    let defaultWarehouse = null;
    if (isOutOfStock || canonicalProducts.some(it => !it.warehouse || it.warehouse === "No Stock")) {
      defaultWarehouse =
        (await Warehouse.findOne({ isActive: true, status: "active" }).sort({ createdAt: 1 })) ||
        (await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 })) ||
        (await Warehouse.findOne({}).sort({ createdAt: 1 }));
    }

    for (const item of canonicalProducts) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName || item.product}`
        });
      }

      // Validate warehouse exists (skip if warehouse is "No Stock" for out-of-stock orders)
      if (item.warehouse && item.warehouse !== "No Stock") {
        const warehouse = await Warehouse.findById(item.warehouse);

        if (!warehouse) {
          return res.status(400).json({
            success: false,
            message: `Warehouse not found: ${item.warehouse}`
          });
        }

        // For out-of-stock orders, skip stock validation
        if (!isOutOfStock) {
          // For regular orders, validate stock availability
          const stock = await StockMovement.findOne({
            productId: item.product,
            warehouseId: item.warehouse
          });

          if (stock && stock.netStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${stock.netStock}, Required: ${item.quantity}`
            });
          }
        }

        console.log(`Product ${product.itemName} validated for warehouse ${warehouse.name}`);
      } else if (item.warehouse === "No Stock") {
        console.log(`Product ${product.itemName} has no warehouse assigned (out-of-stock order)`);
      }

      // Build the persisted line from server-canonical discount amounts.
      validatedProducts.push({
        ...item,
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        HSNCode: product.HSNCode,
        internalRate: product.internalRate || null,
        warehouse: (item.warehouse && item.warehouse !== "No Stock")
          ? item.warehouse
          : (defaultWarehouse?._id || null),
        warehouseName: (item.warehouse && item.warehouse !== "No Stock")
          ? item.warehouseName
          : "No Stock"
      });
    }

    // Calculate order totals from canonical lines.
    const { grossAmount, totalGst, discountAmount, totalAmount } = calculateCanonicalOrderTotals(validatedProducts);

    // Calculate due date
    let dueDate = null;
    if (orderDate && finalCreditDays) {
      dueDate = new Date(orderDate);
      dueDate.setDate(dueDate.getDate() + finalCreditDays);
    }

    // Determine initial status based on stock availability
    // Use req.body.status in case credit limit check overrode it to "Pending"
    let initialStatus = req.body.status || status || "Pending";

    // For out-of-stock orders, force status to Pending and prevent status changes
    if (isOutOfStock) {
      initialStatus = "Pending";
      console.log("🚨 Creating out-of-stock sales order - status locked to Pending");
    }

    // Create sales order
    console.log("Creating sales order with orderNumber:", orderNumber);
    console.log("All values:", {
      orderNumber,
      dealer,
      dealerName: dealerData.name,
      dealerCode: dealerData.code,
      dealerType: dealerData.dealerType,
      region,
      pinCode,
      products: validatedProducts.length,
      orderDate,
      deliveryDate,
      creditDays: finalCreditDays,
      grossAmount,
      totalGst,
      totalAmount,
      type,
      remarks,
      isOutOfStock: isOutOfStock || false,
      stockValidation: stockValidation || []
    });

    // Initialize stock tracking fields for ALL orders (not just out-of-stock)
    // This ensures stock status is always available for display
    for (const product of validatedProducts) {
      if (isOutOfStock) {
        // Out-of-stock orders: mark as waiting
        product.stockStatus = 'waiting';
        product.availableQuantity = 0;
        product.stockCheckedAt = new Date();
      } else {
        // In-stock orders: mark as available (stock was validated during creation)
        product.stockStatus = 'available';
        product.availableQuantity = product.quantity;
        product.stockCheckedAt = new Date();
      }
    }

    const salesOrder = new SalesOrder({
      orderNumber,
      dealer,
      dealerName: dealerData.name,
      dealerCode: dealerData.code,
      dealerType: dealerData.dealerType,
      region,
      pinCode,
      products: validatedProducts,
      orderDate,
      deliveryDate,
      creditDays: finalCreditDays,
      dueDate,
      grossAmount,
      totalGst,
      discountAmount,
      totalAmount,
      type,
      salesType: salesType || 'Regular Sale',
      remarks,
      status: initialStatus,
      discountFinalizedAt: isFinalizedSalesOrderStatus(initialStatus) ? new Date() : null,
      createdBy: req.user._id,
      // Out-of-stock fields
      isOutOfStock: isOutOfStock || false,
      stockValidation: stockValidation || [],
      // Credit overlimit fields
      creditOverlimit: req.body.creditOverlimit || undefined,
      // Credit check amount is derived from canonical direct + dealer-extra stages.
      creditAmount: orderTotalAmount,
      // Initialize order-level stock status for ALL orders
      orderStockStatus: {
        totalProducts: validatedProducts.length,
        availableProducts: isOutOfStock ? 0 : validatedProducts.length,
        partialProducts: 0,
        waitingProducts: isOutOfStock ? validatedProducts.length : 0,
        overallStatus: isOutOfStock ? 'waiting' : 'ready',
        lastChecked: new Date()
      }
    });

    // Automatically set 15-day expiry for Pending orders
    if (salesOrder.status === "Pending") {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now

      salesOrder.expiryDate = expiryDate;
      salesOrder.expiryReason = 'Automatic 15-day expiry for pending order';
      salesOrder.expiryHistory.push({
        action: 'set',
        previousDate: null,
        newDate: expiryDate,
        reason: 'Automatic 15-day expiry set on order creation',
        performedBy: req.user._id,
        performedAt: new Date()
      });

      console.log(`📅 Automatic expiry set for pending order ${orderNumber}: ${expiryDate.toISOString()}`);
    }

    // Save sales order
    await salesOrder.save();

    // Handle stock updates based on initial status (only for in-stock orders)
    if (!isOutOfStock) {
      if (salesOrder.status === "Confirmed") {
        console.log("Order created with Confirmed status - blocking stock");
        for (const product of salesOrder.products) {
          if (product.warehouse) { // Only process if warehouse is not null
            // Get current balance before creating the movement
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;

            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
            console.log(`Blocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
      } else if (salesOrder.status === "Delivered") {
        console.log("Order created with Delivered status - permanently reducing stock");
        for (const product of salesOrder.products) {
          if (product.warehouse) { // Only process if warehouse is not null
            // Get current balance before creating the movement
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;

            // Create stock movement for delivered order (permanent reduction)
            const deliveryMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
              createdBy: req.user._id
            });
            await deliveryMovement.save();
            console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
      }
    } else {
      console.log("🚨 Out-of-stock order created - no stock movements will be made until stock is available");
    }

    // Populate the created order for response
    const populatedOrder = await SalesOrder.findById(salesOrder._id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: isOutOfStock ?
        "Out-of-stock sales order created successfully. Status is locked to Pending until stock is available." :
        "Sales order created successfully",
      salesOrder: populatedOrder
    });

    // Send push notification to dealer (non-blocking, after response)
    try {
      const dealerDoc = await Dealer.findById(salesOrder.dealer).select('fcmToken').lean();
      if (dealerDoc?.fcmToken) {
        const soTitle = 'Sales Order Created';
        const soMsg   = `Sales order ${salesOrder.orderNumber} has been created for you. Total: Rs. ${(salesOrder.totalAmount || 0).toLocaleString('en-IN')}.`;
        await Notification.create({
          dealer: salesOrder.dealer,
          type: 'order_status',
          title: soTitle,
          message: soMsg,
          orderId: salesOrder._id,
          orderNumber: salesOrder.orderNumber,
          status: salesOrder.status,
          priority: 'high',
          metadata: { originalType: 'sales_order_created' },
        });
        await sendPushNotification({
          token: dealerDoc.fcmToken,
          title: soTitle,
          body: soMsg,
          data: { type: 'order_status', orderId: salesOrder._id.toString(), orderNumber: salesOrder.orderNumber },
        });
      }
    } catch (notifErr) { console.error('SO notification error (non-fatal):', notifErr.message); }
  } catch (error) {
    console.error("Create Sales Order Error:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    if (error.errors) {
      console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
    }

    if (sendDiscountPolicyError(res, error)) return;

    // Handle duplicate order number error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Order number already exists"
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      const details = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
        kind: error.errors[key].kind
      }));
      console.error('❌ Validation Error Details:', details);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
        details: details
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating sales order",
      error: error.message
    });
  }
};

// @desc    Update sales order status (approval/rejection)
// @route   PATCH /api/sales-orders/:id/status
// @access  Private
export const updateSalesOrderStatus = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement, Dealer, User, Notification, DealerInvoice, DealerLedger } = getModels(req.dbConnection);

    const { status, remarks, products } = req.body; // products array with warehouse info
    const { id } = req.params;

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Enforce the order lifecycle on the server so every UI and API caller
    // receives the same legal transitions and stock/credit safeguards.
    const originalStatus = salesOrder.status ? String(salesOrder.status).trim() : '';
    const allowedTransitions = {
      Pending: ['Confirmed', 'Cancelled', 'Rejected'],
      Confirmed: ['Processing', 'Delivered', 'Cancelled', 'Rejected'],
      Processing: ['In Transit', 'Delivered', 'Cancelled', 'Rejected'],
      'In Transit': ['Delivered', 'Cancelled', 'Rejected']
    };
    const stockReservedStatuses = ['Confirmed', 'Processing', 'In Transit'];
    const allowedNextStatuses = allowedTransitions[originalStatus] || [];

    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: allowedNextStatuses.length > 0
          ? `Cannot change Sales Order status from ${originalStatus} to ${status}. Allowed next statuses: ${allowedNextStatuses.join(', ')}.`
          : `Sales Order status ${originalStatus || 'Unknown'} is terminal and cannot be changed.`
      });
    }

    if (['Cancelled', 'Rejected'].includes(status) && !String(remarks || '').trim()) {
      return res.status(400).json({
        success: false,
        message: `Remarks are required when marking a Sales Order as ${status}.`
      });
    }

    if (['Cancelled', 'Rejected'].includes(status)) {
      const activeInvoice = await DealerInvoice.findOne({
        salesOrder: salesOrder._id,
        status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
        isDraft: { $ne: true }
      })
        .select('invoiceNumber status')
        .lean();
      if (activeInvoice) {
        const invoiceLabel = activeInvoice.invoiceNumber
          ? `invoice ${activeInvoice.invoiceNumber}`
          : 'an active invoice';
        return res.status(400).json({
          success: false,
          message: `Cannot mark this Sales Order as ${status} while ${invoiceLabel} exists. Cancel or reject the invoice first.`
        });
      }
    }

    // Update product warehouses if provided in request (when status is updated from web)
    let warehouseAssigned = false;
    if (products && Array.isArray(products) && products.length > 0) {
      for (let i = 0; i < salesOrder.products.length && i < products.length; i++) {
        if (products[i].warehouse) {
          // Check if warehouse changed from null/"No Stock" to actual warehouse
          const oldWarehouse = salesOrder.products[i].warehouse;
          const newWarehouse = products[i].warehouse;

          if (!oldWarehouse && newWarehouse) {
            warehouseAssigned = true;
          }

          salesOrder.products[i].warehouse = newWarehouse;
          salesOrder.products[i].warehouseName = products[i].warehouseName || null;
        }
      }
    }

    const statusesRequiringWarehouse = ['Confirmed', 'Processing', 'In Transit', 'Delivered'];
    if (statusesRequiringWarehouse.includes(status)) {
      const missingWarehouseLine = salesOrder.products.find(
        (product) => !product.warehouse || product.warehouse === 'No Stock'
      );
      if (missingWarehouseLine) {
        return res.status(400).json({
          success: false,
          message: `Warehouse must be assigned for ${missingWarehouseLine.productName || 'every product'} before changing status to ${status}.`
        });
      }
    }

    // AUTOMATIC: If warehouse is assigned to out-of-stock order, keep tracking stock arrival
    // DO NOT clear isOutOfStock flag - we need it to track stock arrival status
    if (salesOrder.isOutOfStock && warehouseAssigned) {
      console.log("🎯 Warehouse assigned to out-of-stock order - keeping isOutOfStock=true for stock tracking");
      // salesOrder.isOutOfStock = false;  // REMOVED: Keep flag for stock tracking
      salesOrder.stockValidation = [];  // Clear validation since warehouse is now assigned
    }

    // Out-of-stock orders may enter the normal lifecycle only after every line
    // has been rechecked as ready. A ready Pending order is converted to normal
    // reserved-stock handling as part of the same Confirmed transition.
    const readyOutOfStockConfirmation = salesOrder.isOutOfStock
      && status === 'Confirmed'
      && salesOrder.orderStockStatus?.overallStatus === 'ready';
    if (salesOrder.isOutOfStock
        && status !== 'Cancelled'
        && status !== 'Rejected'
        && !readyOutOfStockConfirmation) {
      return res.status(400).json({
        success: false,
        message: "Cannot change status of out-of-stock orders until stock arrives. Current stock status: " + (salesOrder.orderStockStatus?.overallStatus || 'unknown')
      });
    }

    // Recalculate confirmation exposure from the same conservative canonical
    // basis used by create/edit/partial-dispatch (direct + dealer-extra only).
    // Ready out-of-stock lines become credit-eligible when they are confirmed.
    if (status === 'Confirmed') {
      const creditEligibleProducts = readyOutOfStockConfirmation
        ? salesOrder.products
        : salesOrder.products.filter(isCreditEligibleProduct);
      const confirmationCreditAmount = creditEligibleProducts.reduce(
        (sum, product) => sum + calculateCanonicalCreditLineAmount(product),
        0
      );
      salesOrder.creditAmount = confirmationCreditAmount;

      const dealerData = await Dealer.findById(salesOrder.dealer);
      const previousCreditOverlimit = salesOrder.creditOverlimit?.toObject?.()
        || salesOrder.creditOverlimit
        || {};

      if (dealerData?.creditLimit && dealerData.creditLimit > 0) {
        const currentOutstanding = await getDealerCreditOutstanding(
          req.dbConnection,
          salesOrder.dealer,
          salesOrder._id
        );
        const newOutstanding = currentOutstanding + confirmationCreditAmount;
        const overlimitAmount = Math.max(0, newOutstanding - dealerData.creditLimit);
        const isOverlimit = overlimitAmount > 0;
        const approvedExposure = Number(previousCreditOverlimit.newOutstanding);
        const approvalCoversCurrentExposure = isOverlimit
          && Boolean(previousCreditOverlimit.approvedBy)
          && Number.isFinite(approvedExposure)
          && newOutstanding <= approvedExposure + 0.01;

        salesOrder.creditOverlimit = {
          isOverlimit,
          creditLimit: dealerData.creditLimit,
          currentOutstanding,
          orderAmount: confirmationCreditAmount,
          newOutstanding,
          overlimitAmount,
          requiresApproval: isOverlimit && !approvalCoversCurrentExposure,
          approvedBy: approvalCoversCurrentExposure ? previousCreditOverlimit.approvedBy : null,
          approvedAt: approvalCoversCurrentExposure ? previousCreditOverlimit.approvedAt : null,
          approvalNotes: approvalCoversCurrentExposure ? previousCreditOverlimit.approvalNotes : null
        };

        if (isOverlimit && !approvalCoversCurrentExposure) {
          // Persist the refreshed exposure for the Super Admin approval flow,
          // but leave status and stock unchanged.
          await salesOrder.save();
          return res.status(400).json({
            success: false,
            message: `Cannot confirm order - Credit limit exceeded by ₹${overlimitAmount.toLocaleString()}. Super Admin approval required.`,
            creditOverlimit: salesOrder.creditOverlimit
          });
        }
      } else {
        salesOrder.creditOverlimit = {
          isOverlimit: false,
          creditLimit: Number(dealerData?.creditLimit || 0),
          currentOutstanding: 0,
          orderAmount: confirmationCreditAmount,
          newOutstanding: confirmationCreditAmount,
          overlimitAmount: 0,
          requiresApproval: false,
          approvedBy: null,
          approvedAt: null,
          approvalNotes: null
        };
      }
    }

    // Recheck and reserve stock for normal orders and for ready out-of-stock
    // orders entering the normal lifecycle.
    if (status === 'Confirmed' && (!salesOrder.isOutOfStock || readyOutOfStockConfirmation)) {
      // CRITICAL: Verify stock availability for all products BEFORE confirming
      const stockShortages = [];

      for (const product of salesOrder.products) {
        if (product.warehouse) {
          // Get current balance
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });

          const currentBalance = latestMovement ? latestMovement.balance : 0;

          // Check if enough stock available
          if (currentBalance < product.quantity) {
            const productDetails = await Product.findById(product.product);
            stockShortages.push({
              productName: productDetails?.itemName || product.productName || 'Unknown',
              productCode: productDetails?.productCode || 'N/A',
              required: product.quantity,
              available: currentBalance,
              shortage: product.quantity - currentBalance
            });
          }
        }
      }

      // If there are stock shortages, provide guidance on splitting the order
      if (stockShortages.length > 0) {
        console.log("⚠️ Stock shortage detected during confirmation:", stockShortages);

        // Calculate total available vs required
        const totalRequired = stockShortages.reduce((sum, s) => sum + s.required, 0);
        const totalAvailable = stockShortages.reduce((sum, s) => sum + s.available, 0);
        const totalShortage = stockShortages.reduce((sum, s) => sum + s.shortage, 0);

        // Build detailed error message with splitting suggestion
        const shortageDetails = stockShortages.map(s =>
          `  • ${s.productName} (${s.productCode}): Need ${s.required}, Available ${s.available}, Short ${s.shortage}`
        ).join('\n');

        return res.status(400).json({
          success: false,
          message: `Cannot confirm order - Insufficient stock for ${stockShortages.length} product(s)`,
          stockShortages: stockShortages,
          details: shortageDetails,
          suggestion: {
            action: 'split_order',
            message: `This order should be split into two orders:

📦 Order 1 (In-Stock): ${totalAvailable} units - Can be confirmed immediately
⏳ Order 2 (Pending): ${totalShortage} units - Will be fulfilled when stock arrives

To split this order:
1. Cancel this order (${salesOrder.orderNumber})
2. Create a new order with ${totalAvailable} units (available stock)
3. Create another order with ${totalShortage} units (mark as out-of-stock)

OR wait for stock to arrive and this order will be auto-processed.`,
            totalRequired: totalRequired,
            totalAvailable: totalAvailable,
            totalShortage: totalShortage
          }
        });
      }

      // Update order with approval info
      salesOrder.approvedBy = req.user._id;
      salesOrder.approvedAt = new Date();
    }

    // Handle stock restoration for rejected or cancelled orders (only for previously confirmed orders)
    // Note: Stock restoration is handled via StockMovement IN records below

    // Handle stock management based on status changes. Ready out-of-stock
    // confirmations use this same reservation path before the tracking flag is cleared.
    if (!salesOrder.isOutOfStock || readyOutOfStockConfirmation) {
      if (status === "Confirmed" && originalStatus !== "Confirmed") {
        // Block stock for confirmed orders - but check if already blocked
        const existingBlock = await StockMovement.findOne({
          referenceNo: salesOrder.orderNumber,
          referenceType: 'SALE',
          type: 'OUT',
          remarks: { $regex: /Stock Blocked/ }
        });

        if (existingBlock) {
          console.log(`Stock already blocked for order ${salesOrder.orderNumber} - skipping duplicate block`);
        } else {
        console.log("Blocking stock for confirmed order");
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement

            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;

            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
            console.log(`Blocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
          }
        }
        } // end if !existingBlock
      } else if (status === "Delivered") {
        // Confirmed and Processing orders already have reserved stock.
        console.log(`Order delivered - ${stockReservedStatuses.includes(originalStatus) ? "unblocking and permanently reducing stock" : "permanently reducing stock"}`);
        for (const product of salesOrder.products) {
          if (product.warehouse) {
            // Get current balance before creating the movement

            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;

            if (stockReservedStatuses.includes(originalStatus)) {
              // Step 1: Unblock the stock reserved when the order was confirmed
              const unblockMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'IN',
                quantity: product.quantity,
                balance: currentBalance + product.quantity,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (Delivered)`,
                createdBy: req.user._id
              });
              await unblockMovement.save();
              console.log(`Unblocked ${product.quantity} units for order ${salesOrder.orderNumber} - product ${product.product} in warehouse ${product.warehouse}`);

              // Step 2: Permanently reduce stock
              const newBalance = currentBalance; // Balance stays same because we unblocked then reduced
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
              console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Final balance: ${newBalance}`);
            } else {
              // Direct delivery from Pending - reduce stock permanently
              const newBalance = currentBalance - product.quantity;
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
              console.log(`Order ${salesOrder.orderNumber} delivered - stock permanently reduced for product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
            }
          }
        }
      } else if ((status === "Cancelled" || status === "Rejected") && stockReservedStatuses.includes(originalStatus)) {
        // Restore stock reserved when the order entered Confirmed, including
        // orders that subsequently advanced to Processing.
        console.log("Unblocking stock for cancelled/rejected order");

        // Restore only the still-reserved quantity for each product/warehouse.
        // This is quantity-aware, so partial-dispatch IN movements release only
        // their reduced quantity and do not suppress restoration of the remainder.
        const [outMovements, priorReleaseMovements] = await Promise.all([
          StockMovement.find({
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            type: 'OUT'
          }),
          StockMovement.find({
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            type: 'IN'
          })
        ]);

        const movementKey = (productId, warehouseId) => `${productId}:${warehouseId}`;
        const reservationGroups = new Map();
        for (const movement of outMovements) {
          const key = movementKey(movement.productId, movement.warehouseId);
          const group = reservationGroups.get(key) || {
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            blockedQuantity: 0,
            releasedQuantity: 0
          };
          group.blockedQuantity += Number(movement.quantity || 0);
          reservationGroups.set(key, group);
        }
        for (const movement of priorReleaseMovements) {
          const key = movementKey(movement.productId, movement.warehouseId);
          const group = reservationGroups.get(key);
          if (group) group.releasedQuantity += Number(movement.quantity || 0);
        }

        const restoredGroups = [];
        for (const group of reservationGroups.values()) {
          const quantityToRestore = Math.max(0, group.blockedQuantity - group.releasedQuantity);
          if (quantityToRestore <= 0) continue;

          const latestMovement = await StockMovement.findOne({
            productId: group.productId,
            warehouseId: group.warehouseId
          }).sort({ date: -1, createdAt: -1 });
          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance + quantityToRestore;

          await new StockMovement({
            productId: group.productId,
            warehouseId: group.warehouseId,
            type: 'IN',
            quantity: quantityToRestore,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${status})`,
            createdBy: req.user._id
          }).save();
          restoredGroups.push(group);
          console.log(`Restored ${quantityToRestore} units for ${group.productId} in ${group.warehouseId}. Balance: ${currentBalance} -> ${newBalance}`);
        }

        if (outMovements.length === 0) {
          console.log(`No reserved OUT movements found for order ${salesOrder.orderNumber}; no stock restoration was required.`);
        }

        // Check whether released stock can fulfill waiting orders.
        for (const group of restoredGroups) {
          try {
            const StockArrivalService = (await import("../services/stockArrivalService.js")).default;
            const checkResult = await StockArrivalService.checkWaitingOrdersForStock(
              group.productId,
              group.warehouseId,
              0,
              req.dbConnection
            );
            if (checkResult.notifiedOrders > 0) {
              console.log(`Notified ${checkResult.notifiedOrders} waiting orders about stock availability`);
            }
          } catch (error) {
            console.error("Error checking waiting orders:", error);
          }
        }
      } else if ((status === "Cancelled" || status === "Rejected") && !stockReservedStatuses.includes(originalStatus)) {
        console.log("Order had no reserved stock to restore");
      }
    } else {
      console.log("🚨 Out-of-stock order - no stock movements will be made");
    }

    if (readyOutOfStockConfirmation) {
      // Reservation succeeded using freshly rechecked stock. The order now uses
      // the normal reserved-stock lifecycle and must no longer bypass movement handling.
      salesOrder.isOutOfStock = false;
      salesOrder.stockValidation = [];
      for (const product of salesOrder.products) {
        product.stockStatus = 'available';
        product.availableQuantity = product.quantity;
        product.stockCheckedAt = new Date();
      }
      salesOrder.orderStockStatus = {
        totalProducts: salesOrder.products.length,
        availableProducts: salesOrder.products.length,
        partialProducts: 0,
        waitingProducts: 0,
        overallStatus: 'ready',
        lastChecked: new Date()
      };
    }

    // Credit limit is tracked via getDealerCreditOutstanding which reads confirmed orders
    // directly from SalesOrder collection - no ledger entries needed for credit blocking.

    // Update order status and remarks. Record the discount finalization event only
    // when the order first enters a finalized status; unrelated edits do not refresh it.
    if (!isFinalizedSalesOrderStatus(originalStatus) && isFinalizedSalesOrderStatus(status)) {
      salesOrder.discountFinalizedAt = new Date();
    }
    salesOrder.status = status;
    if (status !== 'Pending') {
      // Stock Arrived is an actionable Pending-order queue, not a historical status.
      salesOrder.stockAvailable = false;
    }
    if (remarks) {
      salesOrder.remarks = remarks;
    }

    // IMPORTANT: Cancel expiry when status changes from Pending to any other status
    if (originalStatus === "Pending" && status !== "Pending" && salesOrder.expiryDate) {
      console.log(`📅 Cancelling expiry for order ${salesOrder.orderNumber} - status changed from Pending to ${status}`);

      salesOrder.expiryHistory.push({
        action: 'cancelled',
        previousDate: salesOrder.expiryDate,
        newDate: null,
        reason: `Expiry automatically cancelled - order status changed from Pending to ${status}`,
        performedBy: req.user._id,
        performedAt: new Date()
      });

      salesOrder.expiryDate = null;
      salesOrder.expiryReason = null;
      salesOrder.isExpired = false;
    }

    await salesOrder.save();

    // NOTE: Credit limit blocking moved to invoice approval stage
    // Sales orders no longer block credit limit on confirmation
    // Credit limit is blocked when invoice is approved, not when order is confirmed

    // REMOVE/REVERSE LEDGER ENTRY when order is CANCELLED or REJECTED (if it was previously Confirmed)
    // NOTE: This is kept for backward compatibility with old orders that had ledger entries
    if ((status === "Cancelled" || status === "Rejected") && stockReservedStatuses.includes(originalStatus)) {
      try {
        console.log(`💳 Checking for ledger entry to reverse for order ${salesOrder.orderNumber}`);




        // Check if there's a ledger entry for this order (old orders might have one)
        const existingLedgerEntry = await DealerLedger.findOne({
          dealer: salesOrder.dealer,
          transactionType: "Order Confirmed",
          description: { $regex: salesOrder.orderNumber }
        });

        if (existingLedgerEntry) {
          console.log(`✅ Found existing ledger entry to reverse`);

          // Get dealer details
          const dealer = await Dealer.findById(salesOrder.dealer);
          if (!dealer) {
            console.error(`❌ Dealer not found for order ${salesOrder.orderNumber}`);
          } else {
            // Create reverse ledger entry to unblock credit limit
            const reverseLedgerEntry = new DealerLedger({
              dealer: salesOrder.dealer,
              dealerName: dealer.name,
              dealerCode: dealer.code,
              entryDate: new Date(),
              transactionType: "Order Confirmed - Reversed",
              salesType: salesOrder.salesType || 'Regular Sale',
              debitAmount: 0,
              creditAmount: salesOrder.totalAmount, // Decrease outstanding (unblock credit)
              description: `Order ${status} - ${salesOrder.orderNumber}`,
              remarks: `Credit limit unblocked - order ${salesOrder.orderNumber} was ${status.toLowerCase()}. Amount released: ₹${salesOrder.totalAmount.toLocaleString()}`,
              status: "Active",
              createdBy: req.user._id
            });

            await reverseLedgerEntry.save();
            console.log(`✅ Reverse ledger entry created - Credit limit unblocked: ₹${salesOrder.totalAmount.toLocaleString()} for order ${salesOrder.orderNumber}`);
            console.log(`   Running Balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
          }
        } else {
          console.log(`ℹ️ No ledger entry found for order ${salesOrder.orderNumber} - nothing to reverse`);
        }
      } catch (ledgerError) {
        console.error('❌ Error creating reverse ledger entry:', ledgerError);
        // Don't fail the request if ledger creation fails
      }
    }

    // Create notification for dealer about status change (for any status change)
    if (originalStatus !== status) {
      try {
        const statusMessages = {
          'Confirmed': `Your order ${salesOrder.orderNumber} has been confirmed.`,
          'Processing': `Your order ${salesOrder.orderNumber} is now being processed.`,
          'In Transit': `Your order ${salesOrder.orderNumber} is in transit.`,
          'Delivered': `Your order ${salesOrder.orderNumber} has been delivered.`,
          'Rejected': `Your order ${salesOrder.orderNumber} has been rejected.`,
          'Cancelled': `Your order ${salesOrder.orderNumber} has been cancelled.`
        };

        const statusTitles = {
          'Confirmed': 'Order Confirmed',
          'Processing': 'Order Processing',
          'In Transit': 'Order In Transit',
          'Delivered': 'Order Delivered',
          'Rejected': 'Order Rejected',
          'Cancelled': 'Order Cancelled'
        };

        const message = statusMessages[status] || `Your order ${salesOrder.orderNumber} status has been updated to ${status}.`;
        const title = statusTitles[status] || `Order ${status}`;

        // Determine priority based on status
        let priority = 'medium';
        if (status === 'Delivered' || status === 'Confirmed') {
          priority = 'high';
        } else if (status === 'Rejected' || status === 'Cancelled') {
          priority = 'high';
        }

        // Create and save notification
        await Notification.create({
          dealer: salesOrder.dealer,
          type: 'order_status',
          title: title,
          message: message,
          orderId: salesOrder._id,
          orderNumber: salesOrder.orderNumber,
          status: status,
          read: false,
          priority: priority
        });

        // Send push notification to dealer
        try {
          const dealerForPush = await Dealer.findById(salesOrder.dealer).select('fcmToken').lean();
          if (dealerForPush?.fcmToken) {
            await sendPushNotification({
              token: dealerForPush.fcmToken,
              title,
              body: message,
              data: {
                type: 'order_status',
                orderId: salesOrder._id.toString(),
                orderNumber: salesOrder.orderNumber,
                status,
              },
            });
          }
        } catch (pushErr) {
          console.error('Push notification error (non-fatal):', pushErr.message);
        }

        console.log(`📧 Notification created for dealer ${salesOrder.dealer}: ${message} (Status changed from ${originalStatus} to ${status})`);
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
        // Don't fail the request if notification fails
      }
    }

    // Populate updated order for response
    const updatedOrder = await SalesOrder.findById(id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: `Order ${status.toLowerCase()} successfully`,
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Update Sales Order Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating sales order status",
      error: error.message
    });
  }
};

// @desc    Assign warehouse to out-of-stock order and clear out-of-stock flag
// @route   PATCH /api/sales-orders/:id/assign-warehouse
// @access  Private
export const assignWarehouseToOutOfStockOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement } = getModels(req.dbConnection);

    const { id } = req.params;
    const { products } = req.body; // Array of { productIndex, warehouse, warehouseName }

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Verify this is an out-of-stock order
    if (!salesOrder.isOutOfStock) {
      return res.status(400).json({
        success: false,
        message: "This order is not marked as out-of-stock"
      });
    }

    // Verify stock availability for all products with assigned warehouses
    for (const productUpdate of products) {
      const product = salesOrder.products[productUpdate.productIndex];

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product at index ${productUpdate.productIndex} not found`
        });
      }

      if (productUpdate.warehouse) {
        // Check stock availability
        const stock = await StockMovement.findOne({
          productId: product.product,
          warehouseId: productUpdate.warehouse
        });

        if (!stock) {
          return res.status(400).json({
            success: false,
            message: `Product ${product.productName} not available in selected warehouse`
          });
        }

        if (stock.netStock < product.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.productName}. Available: ${stock.netStock}, Required: ${product.quantity}`
          });
        }
      }
    }

    // Update warehouses for products
    for (const productUpdate of products) {
      if (productUpdate.warehouse) {
        salesOrder.products[productUpdate.productIndex].warehouse = productUpdate.warehouse;
        salesOrder.products[productUpdate.productIndex].warehouseName = productUpdate.warehouseName;
      }
    }

    // Keep out-of-stock flag for stock tracking - DO NOT clear it
    // The flag is needed to track stock arrival status
    // salesOrder.isOutOfStock = false;  // REMOVED: Keep flag for stock tracking
    salesOrder.stockValidation = []; // Clear validation results since warehouse is assigned

    await salesOrder.save();

    // Populate updated order for response
    const updatedOrder = await SalesOrder.findById(id)
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("approvedBy", "name email")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Warehouse assigned successfully. Order is now ready to be confirmed.",
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Assign Warehouse Error:", error);
    res.status(500).json({
      success: false,
      message: "Error assigning warehouse",
      error: error.message
    });
  }
};

// @desc    Update sales order
// @route   PUT /api/sales-orders/:id
// @access  Private
export const updateSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification, DealerLedger } = getModels(req.dbConnection);

    const { id } = req.params;

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow editing of Pending, Confirmed, and Processing orders
    // Delivered, Cancelled, and Rejected orders cannot be edited
    const editableStatuses = ["Pending", "Confirmed", "Processing"];

    // Normalize status for comparison (trim whitespace, ensure proper case)
    const currentStatus = salesOrder.status ? String(salesOrder.status).trim() : null;

    // Debug logging
    console.log("🔍 Update Sales Order - Status Check:");
    console.log("  - Order ID:", id);
    console.log("  - Order Number:", salesOrder.orderNumber);
    console.log("  - Current Status (raw):", salesOrder.status);
    console.log("  - Current Status (normalized):", currentStatus);
    console.log("  - Status Type:", typeof salesOrder.status);
    console.log("  - Editable Statuses:", editableStatuses);
    console.log("  - Is Editable:", editableStatuses.includes(currentStatus));

    if (!currentStatus || !editableStatuses.includes(currentStatus)) {
      const errorMessage = `Can only edit orders with status "Pending", "Confirmed", or "Processing". Current status: ${currentStatus || 'undefined'}. Orders with status "Delivered", "Cancelled", or "Rejected" cannot be edited.`;
      console.log("❌ Edit Rejected:", errorMessage);
      return res.status(400).json({
        success: false,
        message: errorMessage
      });
    }

    console.log("✅ Edit Allowed for status:", currentStatus);

    const unsafeUpdateKey = Object.keys(req.body).find(
      (key) => key.startsWith('$') || key.includes('.')
    );
    if (unsafeUpdateKey) {
      throw createDiscountPolicyError(
        `Unsupported Sales Order update field "${unsafeUpdateKey}". Submit products as a complete array so discount policy can be validated.`,
        'UNSAFE_SALES_ORDER_UPDATE_SHAPE'
      );
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'products')
        && (!Array.isArray(req.body.products) || req.body.products.length === 0)) {
      throw createDiscountPolicyError(
        'products must be submitted as a non-empty array for Sales Order updates.',
        'INVALID_SALES_ORDER_PRODUCTS'
      );
    }

    // Current stock lifecycle fields are server-owned. Clients may submit only
    // business inputs such as products, quantities, warehouses, and status.
    delete req.body.orderStockStatus;
    delete req.body.stockAvailable;
    delete req.body.stockAvailableNotifiedAt;
    if (Array.isArray(req.body.products)) {
      req.body.products = req.body.products.map((product) => {
        const sanitizedProduct = { ...product };
        delete sanitizedProduct.stockStatus;
        delete sanitizedProduct.availableQuantity;
        delete sanitizedProduct.stockArrivedAt;
        delete sanitizedProduct.stockCheckedAt;
        return sanitizedProduct;
      });
    }

    // This recency field is server-owned and cannot be refreshed or forged by
    // unrelated client edits.
    delete req.body.discountFinalizedAt;

    if (Object.prototype.hasOwnProperty.call(req.body, 'repriceDiscounts')
        && typeof req.body.repriceDiscounts !== 'boolean') {
      throw createDiscountPolicyError(
        'repriceDiscounts must be a boolean when provided.',
        'INVALID_REPRICE_DISCOUNTS_FLAG'
      );
    }
    const repriceDiscounts = req.body.repriceDiscounts === true;
    delete req.body.repriceDiscounts;

    const requestedDealerId = req.body.dealer?._id || req.body.dealer;
    const dealerChanged = Boolean(requestedDealerId)
      && objectIdString(requestedDealerId) !== objectIdString(salesOrder.dealer);
    if (dealerChanged && !repriceDiscounts) {
      throw createDiscountPolicyError(
        'Changing the dealer changes discount policy. Resubmit with repriceDiscounts: true to apply current policy and permissions.',
        'REPRICE_DISCOUNTS_REQUIRED'
      );
    }

    // Explicit repricing may omit products; in that case reprice every persisted line.
    if (repriceDiscounts && !Array.isArray(req.body.products)) {
      req.body.products = salesOrder.products.map((product) => product.toObject());
    }

    let canonicalProductInputsChanged = false;
    let creditEligibilityChanged = false;
    if (Array.isArray(req.body.products)) {
      req.body.products = mergeMissingCanonicalInputs(salesOrder.products, req.body.products);
      const driverChangeReasons = getDiscountDriverChangeReasons(
        salesOrder.products,
        req.body.products
      );
      if (driverChangeReasons.length > 0 && !repriceDiscounts) {
        throw createDiscountPolicyError(
          `Discount-driving changes require explicit repricing (${driverChangeReasons.join('; ')}). Resubmit with repriceDiscounts: true.`,
          'REPRICE_DISCOUNTS_REQUIRED'
        );
      }

      const replayableAmountInputsChanged = haveReplayableAmountInputsChanged(
        salesOrder.products,
        req.body.products
      );
      if (repriceDiscounts) {
        const dealerData = await Dealer.findById(requestedDealerId || salesOrder.dealer);
        if (!dealerData) {
          return res.status(404).json({ success: false, message: "Dealer not found" });
        }
        const productsForRepricing = req.body.products.map((productLine) => {
          const serverResolvedLine = { ...productLine };
          delete serverResolvedLine.dealerExtraDiscount;
          delete serverResolvedLine.discountPolicySnapshot;
          delete serverResolvedLine.discountPermissionSnapshot;
          delete serverResolvedLine.appliedDiscount;
          return serverResolvedLine;
        });
        req.body.products = await canonicalizeSalesOrderProducts({
          products: productsForRepricing,
          dealer: dealerData,
          dbConnection: req.dbConnection,
          actorId: req.user._id
        });
      } else if (replayableAmountInputsChanged) {
        req.body.products = replayPersistedSalesOrderProducts(
          salesOrder.products,
          req.body.products
        );
      } else {
        req.body.products = mergeNonFinancialProductUpdates(salesOrder.products, req.body.products);
      }

      canonicalProductInputsChanged = repriceDiscounts || replayableAmountInputsChanged;
      creditEligibilityChanged = hasCreditEligibilityChanged(salesOrder.products, req.body.products);
    }

    // Client-computed order totals are never authoritative.
    delete req.body.grossAmount;
    delete req.body.totalGst;
    delete req.body.discountAmount;
    delete req.body.totalAmount;
    delete req.body.creditAmount;

    // Validate products if they are being updated
    if (req.body.products) {
      console.log("Update order - received products:", req.body.products);
      for (const item of req.body.products) {
        console.log("Validating product item:", item);
        console.log("Product ID to validate:", item.product);

        if (!item.product) {
          return res.status(400).json({
            success: false,
            message: `Product ID is missing in product data: ${JSON.stringify(item)}`
          });
        }

        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({
            success: false,
            message: `Product not found: ${item.product}`
          });
        }

        // Validate warehouse stock if warehouse is specified
        if (item.warehouse) {
          const stock = await StockMovement.findOne({
            productId: item.product,
            warehouseId: item.warehouse
          });

          if (!stock) {
            return res.status(400).json({
              success: false,
              message: `Product ${product.itemName} not available in selected warehouse`
            });
          }

          if (stock.netStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName} in ${stock.warehouse}. Available: ${stock.netStock}`
            });
          }
        }
      }

      // RE-CHECK CREDIT LIMIT when products are being edited
      // CRITICAL FIX: Only re-check credit limit when products ACTUALLY CHANGE (quantity, price, or products added/removed)
      // Do NOT recalculate when just changing status from Pending to Confirmed
      console.log("🔍 Checking if products actually changed...");

      // Compare new products with existing products to detect actual changes
      let productsActuallyChanged = canonicalProductInputsChanged || creditEligibilityChanged;

      // If order is already approved by Super Admin, still re-check if amount increased
      const orderAlreadyApproved = salesOrder.creditOverlimit &&
                                   salesOrder.creditOverlimit.isOverlimit &&
                                   salesOrder.creditOverlimit.approvedBy;

      if (orderAlreadyApproved) {
        console.log("   ℹ️ Order was previously approved - will still re-check if amount increased");
      }

      // Check if number of products changed
      if (req.body.products.length !== salesOrder.products.length) {
        productsActuallyChanged = true;
        console.log("   ✓ Product count changed");
      } else {
        // Check if any product quantity or price changed
        for (let i = 0; i < req.body.products.length; i++) {
          const newProduct = req.body.products[i];
          const oldProduct = salesOrder.products[i];

          // Extract IDs for comparison
          const newProductId = typeof newProduct.product === 'object' ? newProduct.product._id : newProduct.product;
          const oldProductId = typeof oldProduct.product === 'object' ? oldProduct.product._id : oldProduct.product;

          if (newProductId.toString() !== oldProductId.toString()) {
            productsActuallyChanged = true;
            console.log(`   ✓ Product changed at index ${i}`);
            break;
          }

          if (Number(newProduct.quantity) !== Number(oldProduct.quantity)) {
            productsActuallyChanged = true;
            console.log(`   ✓ Quantity changed at index ${i}: ${oldProduct.quantity} → ${newProduct.quantity}`);
            break;
          }

          if (Math.abs(Number(newProduct.unitPrice) - Number(oldProduct.unitPrice)) > 0.001) {
            productsActuallyChanged = true;
            console.log(`   ✓ Unit price changed at index ${i}: ${oldProduct.unitPrice} → ${newProduct.unitPrice}`);
            break;
          }

          if (Math.abs(Number(newProduct.discountAmount || 0) - Number(oldProduct.discountAmount || 0)) > 0.001) {
            productsActuallyChanged = true;
            console.log(`   ✓ Discount changed at index ${i}`);
            break;
          }
        }
      }

      if (!productsActuallyChanged) {
        console.log("   ✅ No product changes detected - skipping credit limit recalculation");
        console.log("   ℹ️ This is likely just a status change (e.g., Pending → Confirmed)");
      } else {
        console.log("   ⚠️ Products changed - performing credit limit re-check");
        console.log("   Order creditOverlimit:", salesOrder.creditOverlimit);
        console.log("   Previously approved?", salesOrder.creditOverlimit?.approvedBy ? 'YES' : 'NO');
        console.log("   Original order amount:", salesOrder.totalAmount);

        // Get dealer data
        const dealerData = await Dealer.findById(salesOrder.dealer);
        if (!dealerData) {
          return res.status(404).json({
            success: false,
            message: "Dealer not found"
          });
        }

        // Calculate new order totals with updated products
        const updatedValidatedProducts = [];
        for (const item of req.body.products) {
          const product = await Product.findById(item.product);
          if (!product) continue;

          // Skip out-of-stock products from credit calculation
          const hasStock = item.warehouse
            && item.warehouse !== "No Stock"
            && item.warehouseName !== "No Stock";
          if (!hasStock) {
            console.log(`⏭️ Skipping product ${product.itemName} from credit limit calculation (out of stock)`);
            continue;
          }

          updatedValidatedProducts.push({
            effectiveBaseAmount: calculateCanonicalCreditLineAmount(item)
          });
        }

        const newTotalAmount = updatedValidatedProducts.reduce((sum, p) => sum + p.effectiveBaseAmount, 0);
        const originalOrderAmount = salesOrder.creditAmount ?? salesOrder.totalAmount ?? 0;

        console.log(`💰 Order Amount Comparison:`, {
          original: originalOrderAmount,
          new: newTotalAmount,
          difference: newTotalAmount - originalOrderAmount,
          increased: newTotalAmount > originalOrderAmount
        });

        // Check credit limit if dealer has one set
        if (dealerData.creditLimit && dealerData.creditLimit > 0) {
          // Get correct outstanding: exclude this order itself (it's being edited), then add new amount
          const baseOutstanding = await getDealerCreditOutstanding(req.dbConnection, salesOrder.dealer, salesOrder._id);
          // baseOutstanding already excludes this order, so just add the new total
          const newOutstanding = baseOutstanding + newTotalAmount;
          const adjustedOutstanding = baseOutstanding; // for logging clarity

          console.log(`💳 Credit Limit Re-Check:`, {
            creditLimit: dealerData.creditLimit,
            baseOutstanding,
            originalOrderAmount,
            newOrderAmount: newTotalAmount,
            newOutstanding,
            overlimit: newOutstanding - dealerData.creditLimit,
            wasApproved: !!salesOrder.creditOverlimit?.approvedBy
          });

          // If credit limit exceeded, check if we need new approval
          if (newOutstanding > dealerData.creditLimit) {
            const overlimitAmount = newOutstanding - dealerData.creditLimit;

            // Check if amount increased from previously approved amount
            const amountIncreased = newTotalAmount > originalOrderAmount;
            const wasApproved = salesOrder.creditOverlimit && salesOrder.creditOverlimit.approvedBy;

            if (amountIncreased && wasApproved) {
              console.log(`⚠️ CRITICAL: Order amount increased from ₹${originalOrderAmount.toFixed(2)} to ₹${newTotalAmount.toFixed(2)}`);
              console.log(`⚠️ Previous approval is NO LONGER VALID - Requires NEW Super Admin approval`);

              // Store previous approval info for audit trail
              const previousApproval = {
                approvedBy: salesOrder.creditOverlimit.approvedBy,
                approvedAt: salesOrder.creditOverlimit.approvedAt,
                approvedAmount: originalOrderAmount,
                approvalNotes: salesOrder.creditOverlimit.approvalNotes
              };

              // Reset credit approval and force status back to Pending
              req.body.status = "Pending";
              req.body.creditOverlimit = {
                isOverlimit: true,
                creditLimit: dealerData.creditLimit,
                currentOutstanding: baseOutstanding,
                orderAmount: newTotalAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true,
                approvedBy: null, // Reset approval
                approvedAt: null,
                approvalNotes: null,
                previousApproval: previousApproval // Store history
              };

              console.log(`🔄 Order status RESET to Pending - Requires NEW Super Admin approval`);
              console.log(`📋 Previous approval stored in history for audit trail`);
            } else if (!wasApproved) {
              console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)} - Requires approval`);

              // First time exceeding limit or not previously approved
              req.body.status = "Pending";
              req.body.creditOverlimit = {
                isOverlimit: true,
                creditLimit: dealerData.creditLimit,
                currentOutstanding: baseOutstanding,
                orderAmount: newTotalAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true,
                approvedBy: null,
                approvedAt: null
              };

              console.log(`🔄 Order status set to Pending - Requires Super Admin approval`);
            } else {
              // Amount decreased or stayed same, keep existing approval
              console.log(`✅ Order amount did not increase - keeping existing approval`);
            }
          } else {
            // Credit limit is fine - clear any previous overlimit flags
            console.log(`✅ Credit limit check passed - Order within limit`);
            req.body.creditOverlimit = {
              isOverlimit: false,
              creditLimit: dealerData.creditLimit,
              currentOutstanding: baseOutstanding,
              orderAmount: newTotalAmount,
              newOutstanding,
              overlimitAmount: 0,
              requiresApproval: false
            };
          }
        }
      }
    }

    // Store original status before update
    const originalStatus = salesOrder.status;
    const newStatus = req.body.status;

    // CRITICAL: Credit limit check when status is being changed to Confirmed
    if (newStatus === "Confirmed" && originalStatus !== "Confirmed") {
      // Check both the saved order AND any updated creditOverlimit from this request
      const effectiveCreditOverlimit = req.body.creditOverlimit || salesOrder.creditOverlimit;

      // Block if flagged as overlimit and not approved (including freshly reset approvals)
      if (effectiveCreditOverlimit &&
          effectiveCreditOverlimit.isOverlimit &&
          !effectiveCreditOverlimit.approvedBy) {
        return res.status(400).json({
          success: false,
          message: `Cannot confirm order - Credit limit exceeded by ₹${(effectiveCreditOverlimit.overlimitAmount || 0).toLocaleString()}. Super Admin approval required.`
        });
      }

      // Skip live check if order was already approved by Super Admin
      const alreadyApproved = effectiveCreditOverlimit &&
                              effectiveCreditOverlimit.isOverlimit &&
                              effectiveCreditOverlimit.approvedBy;

      if (!alreadyApproved) {
        // Live credit limit check in case it was never flagged
        const dealerForCheck = await Dealer.findById(salesOrder.dealer);
        if (dealerForCheck && dealerForCheck.creditLimit && dealerForCheck.creditLimit > 0) {
          const currentOutstanding = await getDealerCreditOutstanding(req.dbConnection, salesOrder.dealer, salesOrder._id);
          const orderAmount = req.body.products
            ? req.body.products
              .filter(isCreditEligibleProduct)
              .reduce((sum, product) => sum + calculateCanonicalCreditLineAmount(product), 0)
            : (salesOrder.creditAmount ?? salesOrder.totalAmount);
          const newOutstanding = currentOutstanding + orderAmount;

          if (newOutstanding > dealerForCheck.creditLimit) {
            const overlimitAmount = newOutstanding - dealerForCheck.creditLimit;
            await SalesOrder.findByIdAndUpdate(salesOrder._id, {
              creditOverlimit: {
                isOverlimit: true,
                creditLimit: dealerForCheck.creditLimit,
                currentOutstanding,
                orderAmount,
                newOutstanding,
                overlimitAmount,
                requiresApproval: true
              }
            });
            return res.status(400).json({
              success: false,
              message: `Cannot confirm order - Credit limit exceeded by ₹${overlimitAmount.toLocaleString()}. Super Admin approval required.`,
              creditOverlimit: { isOverlimit: true, overlimitAmount, creditLimit: dealerForCheck.creditLimit }
            });
          }
        }
      }
    }

    // If status is being changed, handle stock management
    if (newStatus && newStatus !== originalStatus) {
      // When changing to Confirmed, Processing, or Delivered, ensure warehouses are selected
      const statusesRequiringWarehouse = ['Confirmed', 'Processing', 'Delivered'];
      if (statusesRequiringWarehouse.includes(newStatus)) {
        const productsToCheck = req.body.products || salesOrder.products;
        for (const product of productsToCheck) {
          if (!product.warehouse) {
            return res.status(400).json({
              success: false,
              message: `Warehouse must be selected for all products before updating status to ${newStatus}`
            });
          }
        }
      }

      // Handle stock management for status changes (reuse logic from updateSalesOrderStatus)
      // For Confirmed status - block stock
      if (newStatus === "Confirmed" && originalStatus !== "Confirmed") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance - product.quantity;

            const blockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
              createdBy: req.user._id
            });
            await blockMovement.save();
          }
        }
      }
      // For Delivered status - permanently reduce stock
      else if (newStatus === "Delivered") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            if (originalStatus === "Confirmed") {
              // Step 1: Unblock the previously blocked stock
              const unblockMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'IN',
                quantity: product.quantity,
                balance: currentBalance + product.quantity,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (Delivered)`,
                createdBy: req.user._id
              });
              await unblockMovement.save();

              // Step 2: Permanently reduce stock
              const newBalance = currentBalance; // Balance stays same because we unblocked then reduced
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
            } else {
              // Direct delivery - reduce stock permanently
              const newBalance = currentBalance - product.quantity;
              const deliveryMovement = new StockMovement({
                productId: product.product,
                warehouseId: product.warehouse,
                type: 'OUT',
                quantity: product.quantity,
                balance: newBalance,
                referenceNo: salesOrder.orderNumber,
                referenceType: 'SALE',
                date: new Date(),
                remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
                createdBy: req.user._id
              });
              await deliveryMovement.save();
            }
          }
        }
      }
      // For Cancelled/Rejected - restore stock if it was Confirmed
      else if ((newStatus === "Cancelled" || newStatus === "Rejected") && originalStatus === "Confirmed") {

        for (const product of req.body.products || salesOrder.products) {
          if (product.warehouse) {
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });

            const currentBalance = latestMovement ? latestMovement.balance : 0;
            const newBalance = currentBalance + product.quantity;

            const unblockMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'IN',
              quantity: product.quantity,
              balance: newBalance,
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${newStatus})`,
              createdBy: req.user._id
            });
            await unblockMovement.save();
          }
        }
      }
    }

    // Update the sales order
    // Preserve isOutOfStock from existing order if not explicitly set in request
    if (req.body.isOutOfStock === undefined || req.body.isOutOfStock === null) {
      req.body.isOutOfStock = salesOrder.isOutOfStock;
    }
    // If order was originally out-of-stock, keep it that way unless explicitly cleared
    if (salesOrder.isOutOfStock && req.body.isOutOfStock === false) {
      // Only allow clearing isOutOfStock if all products now have a real warehouse
      const allProductsHaveWarehouse = (req.body.products || salesOrder.products).every(
        p => p.warehouse && p.warehouse !== 'No Stock'
      );
      if (!allProductsHaveWarehouse) {
        req.body.isOutOfStock = true;
      }
    }

    // Derive aggregate totals from canonical lines (or unchanged persisted lines).
    if (req.body.products && canonicalProductInputsChanged) {
      const canonicalTotals = calculateCanonicalOrderTotals(req.body.products);
      req.body.grossAmount = canonicalTotals.grossAmount;
      req.body.totalGst = canonicalTotals.totalGst;
      req.body.discountAmount = canonicalTotals.discountAmount;
      req.body.totalAmount = canonicalTotals.totalAmount;
    }
    if (req.body.products && (canonicalProductInputsChanged || creditEligibilityChanged)) {
      req.body.creditAmount = req.body.products
        .filter(isCreditEligibleProduct)
        .reduce((sum, product) => sum + calculateCanonicalCreditLineAmount(product), 0);
    }

    const effectiveUpdatedStatus = req.body.status || salesOrder.status;
    const effectiveExpiredState = req.body.isExpired ?? salesOrder.isExpired;
    if (effectiveUpdatedStatus !== 'Pending' || effectiveExpiredState === true) {
      req.body.stockAvailable = false;
    } else if (salesOrder.isOutOfStock && salesOrder.orderStockStatus?.overallStatus === 'ready') {
      req.body.stockAvailable = true;
      if (!salesOrder.stockAvailableNotifiedAt) {
        req.body.stockAvailableNotifiedAt = new Date();
      }
    }
    const enteredFinalizedStatus = !isFinalizedSalesOrderStatus(salesOrder.status)
      && isFinalizedSalesOrderStatus(effectiveUpdatedStatus);
    if (enteredFinalizedStatus || (repriceDiscounts && isFinalizedSalesOrderStatus(effectiveUpdatedStatus))) {
      req.body.discountFinalizedAt = new Date();
    }

    let updatedOrder = await SalesOrder.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .populate("dealer", "name code contactPerson phone email address dealerType")
      .populate("region", "name")
      .populate("products.product")
      .populate("products.warehouse", "name")
      .populate("createdBy", "name email");

    if (req.body.products
        && !updatedOrder.isExpired
        && !['Delivered', 'Cancelled', 'Rejected', 'Expired'].includes(updatedOrder.status)) {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      const stockRefresh = await StockArrivalService.checkOrderStockStatus(
        updatedOrder._id,
        req.dbConnection,
        { force: true }
      );

      if (stockRefresh.success) {
        updatedOrder = await SalesOrder.findById(id)
          .populate("dealer", "name code contactPerson phone email address dealerType")
          .populate("region", "name")
          .populate("products.product")
          .populate("products.warehouse", "name")
          .populate("createdBy", "name email");
      }
    }

    // If status changed, trigger notification (for any status change)
    if (newStatus && newStatus !== originalStatus) {
      try {

        const statusMessages = {
          'Confirmed': `Your order ${updatedOrder.orderNumber} has been confirmed.`,
          'Processing': `Your order ${updatedOrder.orderNumber} is now being processed.`,
          'Delivered': `Your order ${updatedOrder.orderNumber} has been delivered.`,
          'Rejected': `Your order ${updatedOrder.orderNumber} has been rejected.`,
          'Cancelled': `Your order ${updatedOrder.orderNumber} has been cancelled.`
        };

        const statusTitles = {
          'Confirmed': 'Order Confirmed',
          'Processing': 'Order Processing',
          'Delivered': 'Order Delivered',
          'Rejected': 'Order Rejected',
          'Cancelled': 'Order Cancelled'
        };

        const message = statusMessages[newStatus] || `Your order ${updatedOrder.orderNumber} status has been updated to ${newStatus}.`;
        const title = statusTitles[newStatus] || `Order ${newStatus}`;

        let priority = 'medium';
        if (newStatus === 'Delivered' || newStatus === 'Confirmed') {
          priority = 'high';
        } else if (newStatus === 'Rejected' || newStatus === 'Cancelled') {
          priority = 'high';
        }

        await Notification.create({
          dealer: updatedOrder.dealer,
          type: 'order_status',
          title: title,
          message: message,
          orderId: updatedOrder._id,
          orderNumber: updatedOrder.orderNumber,
          status: newStatus,
          read: false,
          priority: priority
        });

        // Send push notification to dealer
        try {
          const dealerForPush = await Dealer.findById(updatedOrder.dealer).select('fcmToken').lean();
          if (dealerForPush?.fcmToken) {
            await sendPushNotification({
              token: dealerForPush.fcmToken,
              title,
              body: message,
              data: {
                type: 'order_status',
                orderId: updatedOrder._id.toString(),
                orderNumber: updatedOrder.orderNumber,
                status: newStatus,
              },
            });
          }
        } catch (pushErr) {
          console.error('Push notification error (non-fatal):', pushErr.message);
        }

        console.log(`📧 Notification created for dealer ${updatedOrder.dealer}: ${message} (Status changed from ${originalStatus} to ${newStatus})`);
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      // NOTE: Credit limit blocking moved to invoice approval stage
      // Sales orders no longer block credit limit on confirmation
      // Credit limit is blocked when invoice is approved, not when order is confirmed

      // REMOVE/REVERSE LEDGER ENTRY when order is CANCELLED or REJECTED (if it was previously Confirmed)
      // NOTE: This is kept for backward compatibility with old orders that had ledger entries
      if ((newStatus === "Cancelled" || newStatus === "Rejected") && originalStatus === "Confirmed") {
        try {
          console.log(`💳 Checking for ledger entry to reverse for order ${updatedOrder.orderNumber}`);




          // Check if there's a ledger entry for this order (old orders might have one)
          const existingLedgerEntry = await DealerLedger.findOne({
            dealer: updatedOrder.dealer._id || updatedOrder.dealer,
            transactionType: "Order Confirmed",
            description: { $regex: updatedOrder.orderNumber }
          });

          if (existingLedgerEntry) {
            console.log(`✅ Found existing ledger entry to reverse`);

            // Get dealer details
            const dealer = await Dealer.findById(updatedOrder.dealer);
            if (!dealer) {
              console.error(`❌ Dealer not found for order ${updatedOrder.orderNumber}`);
            } else {
              // Create reverse ledger entry to unblock credit limit
              const reverseLedgerEntry = new DealerLedger({
                dealer: updatedOrder.dealer._id || updatedOrder.dealer,
                dealerName: dealer.name,
                dealerCode: dealer.code,
                entryDate: new Date(),
                transactionType: "Adjustment",
                salesType: updatedOrder.salesType || 'Regular Sale',
                debitAmount: 0,
                creditAmount: updatedOrder.totalAmount, // Decrease outstanding (unblock credit)
                description: `Order ${newStatus} - ${updatedOrder.orderNumber}`,
                remarks: `Credit limit unblocked - order ${updatedOrder.orderNumber} was ${newStatus.toLowerCase()}. Amount released: ₹${updatedOrder.totalAmount.toLocaleString()}`,
                status: "Active",
                createdBy: req.user._id
              });

              await reverseLedgerEntry.save();
              console.log(`✅ Reverse ledger entry created - Credit limit unblocked: ₹${updatedOrder.totalAmount.toLocaleString()} for order ${updatedOrder.orderNumber}`);
              console.log(`   Running Balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
            }
          } else {
            console.log(`ℹ️ No ledger entry found for order ${updatedOrder.orderNumber} - nothing to reverse`);
          }
        } catch (ledgerError) {
          console.error('❌ Error creating reverse ledger entry:', ledgerError);
          // Don't fail the request if ledger creation fails
        }
      }
    }

    res.json({
      success: true,
      message: "Sales order updated successfully",
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Update Sales Order Error:", error);

    if (sendDiscountPolicyError(res, error)) return;

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating sales order",
      error: error.message
    });
  }
};

// @desc    Delete sales order
// @route   DELETE /api/sales-orders/:id
// @access  Private
export const deleteSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);

    const { id } = req.params;

    // Find the sales order
    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow deletion of pending orders
    if (salesOrder.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only delete pending orders"
      });
    }

    // Delete the sales order
    await SalesOrder.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Sales order deleted successfully"
    });
  } catch (error) {
    console.error("Delete Sales Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting sales order",
      error: error.message
    });
  }
};

// @desc    Get available stock for a product
// @route   GET /api/sales-orders/product/:productId/stock
// @access  Private
export const getProductStock = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Product, StockMovement } = getModels(req.dbConnection);

    const { productId } = req.params;
    const { warehouse } = req.query;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Build query for stock
    let query = { productId };
    if (warehouse) {
      query.warehouseId = warehouse;
    }

    // Get stock information
    const stock = await StockMovement.find(query)
      .populate("warehouseId", "name code address")
      .sort({ netStock: -1 })
      .lean();

    // Format response
    const formattedStock = stock.map(item => ({
      _id: item._id,
      productId: item.productId,
      productCode: item.productCode,
      itemName: item.itemName,
      warehouseId: item.warehouseId,
      warehouse: item.warehouse,
      basePrice: item.basePrice,
      gst: item.gst,
      totalPrice: item.totalPrice,
      totalQty: item.totalQty,
      damagedQty: item.damagedQty,
      blockedQty: item.blockedQty,
      netStock: item.netStock,
      minStockLevel: item.minStockLevel,
      isLowStock: item.netStock <= item.minStockLevel
    }));

    res.json({
      success: true,
      product: {
        _id: product._id,
        itemName: product.itemName,
        productCode: product.productCode,
        HSNCode: product.HSNCode,
        gst: product.gst
      },
      stock: formattedStock
    });
  } catch (error) {
    console.error("Get Product Stock Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching product stock",
      error: error.message
    });
  }
};

// @desc    Get sales order statistics
// @route   GET /api/sales-orders/stats/summary
// @access  Private
export const getSalesOrderStats = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { startDate, endDate, dealer, region, type } = req.query;
    const matchQuery = {};

    if (startDate || endDate) {
      matchQuery.orderDate = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid startDate' });
        }
        start.setHours(0, 0, 0, 0);
        matchQuery.orderDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid endDate' });
        }
        end.setHours(23, 59, 59, 999);
        matchQuery.orderDate.$lte = end;
      }
      if (matchQuery.orderDate.$gte && matchQuery.orderDate.$lte
        && matchQuery.orderDate.$gte > matchQuery.orderDate.$lte) {
        return res.status(400).json({ success: false, message: 'startDate cannot be after endDate' });
      }
    }
    if (dealer) matchQuery.dealer = dealer;
    if (region) matchQuery.region = region;
    if (type) matchQuery.type = type;

    const finalizedStatuses = ['Confirmed', 'Delivered'];
    const finalizedMatch = { ...matchQuery, status: { $in: finalizedStatuses } };

    const [stats, statusStats, monthlyTrendsDescending, topDealers, topProducts] = await Promise.all([
      SalesOrder.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            allOrderValue: { $sum: '$totalAmount' },
            totalValue: {
              $sum: {
                $cond: [{ $in: ['$status', finalizedStatuses] }, '$totalAmount', 0]
              }
            },
            pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
            confirmedOrders: { $sum: { $cond: [{ $eq: ['$status', 'Confirmed'] }, 1, 0] } },
            processingOrders: { $sum: { $cond: [{ $eq: ['$status', 'Processing'] }, 1, 0] } },
            inTransitOrders: { $sum: { $cond: [{ $eq: ['$status', 'In Transit'] }, 1, 0] } },
            deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
            cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
            pendingCreditApprovals: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$creditOverlimit.requiresApproval', true] },
                      { $eq: [{ $ifNull: ['$creditOverlimit.approvedBy', null] }, null] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            totalItems: { $sum: { $sum: '$products.quantity' } }
          }
        }
      ]),
      SalesOrder.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
            minOrderValue: { $min: '$totalAmount' },
            maxOrderValue: { $max: '$totalAmount' }
          }
        },
        { $sort: { count: -1, _id: 1 } }
      ]),
      SalesOrder.aggregate([
        { $match: finalizedMatch },
        {
          $group: {
            _id: {
              year: { $year: '$orderDate' },
              month: { $month: '$orderDate' }
            },
            orderCount: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]),
      SalesOrder.aggregate([
        { $match: finalizedMatch },
        {
          $group: {
            _id: '$dealer',
            dealerName: { $first: '$dealerName' },
            orderCount: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' }
          }
        },
        { $sort: { totalValue: -1 } },
        { $limit: 10 }
      ]),
      SalesOrder.aggregate([
        { $match: finalizedMatch },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.product',
            productName: { $first: '$products.productName' },
            totalQuantity: { $sum: '$products.quantity' },
            totalValue: { $sum: '$products.totalPrice' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalValue: -1 } },
        { $limit: 10 }
      ])
    ]);

    const summary = stats[0] || {
      totalOrders: 0,
      allOrderValue: 0,
      totalValue: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      processingOrders: 0,
      inTransitOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      pendingCreditApprovals: 0,
      totalItems: 0
    };
    const finalizedOrderCount = Number(summary.confirmedOrders || 0)
      + Number(summary.deliveredOrders || 0);

    res.json({
      success: true,
      stats: {
        ...summary,
        confirmedDeliveredValue: Number(summary.totalValue || 0),
        averageFinalizedOrderValue: finalizedOrderCount > 0
          ? Number(summary.totalValue || 0) / finalizedOrderCount
          : 0
      },
      statusStats,
      monthlyTrends: [...monthlyTrendsDescending].reverse(),
      topDealers,
      topProducts
    });
  } catch (error) {
    console.error("Get Sales Order Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sales order statistics",
      error: error.message
    });
  }
};

// @desc    Get sales orders for a specific dealer
// @route   GET /api/sales-orders/dealer/:dealerId
// @access  Private
export const getSalesOrdersByDealer = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);

    const { dealerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Validate dealer exists
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Build query
    const query = { dealer: dealerId };
    if (status && status !== "all") {
      query.status = status;
    }

    // Get sales orders
    const salesOrders = await SalesOrder.find(query)
      .populate("region", "name")
      .populate("products.product", "productCode itemName HSNCode")
      .populate("products.warehouse", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count
    const total = await SalesOrder.countDocuments(query);

    // Calculate dealer statistics
    const dealerStats = await SalesOrder.aggregate([
      { $match: { dealer: dealerId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: "$totalAmount" },
          pendingOrders: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
          completedOrders: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
          avgOrderValue: { $avg: "$totalAmount" }
        }
      }
    ]);

    res.json({
      success: true,
      salesOrders,
      dealer: {
        _id: dealer._id,
        name: dealer.name,
        dealerType: dealer.dealerType,
        phone: dealer.phone,
        email: dealer.email
      },
      stats: dealerStats[0] || {
        totalOrders: 0,
        totalValue: 0,
        pendingOrders: 0,
        completedOrders: 0,
        avgOrderValue: 0
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Sales Orders By Dealer Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dealer sales orders",
      error: error.message
    });
  }
};

// @desc    Get overdue sales orders
// @route   GET /api/sales-orders/overdue
// @access  Private
export const getOverdueSalesOrders = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);

    const { page = 1, limit = 10 } = req.query;
    const today = new Date();

    // Find orders that are overdue (due date passed but not delivered/cancelled)
    const query = {
      dueDate: { $lt: today },
      status: { $nin: ["Delivered", "Cancelled", "Rejected"] }
    };

    const overdueOrders = await SalesOrder.find(query)
      .populate("dealer", "name contactPerson phone email")
      .populate("region", "name")
      .populate("products.product", "productCode itemName")
      .sort({ dueDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await SalesOrder.countDocuments(query);

    // Calculate overdue days for each order
    const ordersWithOverdueDays = overdueOrders.map(order => {
      const dueDate = new Date(order.dueDate);
      const overdueDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
      return {
        ...order,
        overdueDays,
        isCritical: overdueDays > 30 // Critical if overdue more than 30 days
      };
    });

    res.json({
      success: true,
      overdueOrders: ordersWithOverdueDays,
      totalOverdue: total,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get Overdue Sales Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching overdue sales orders",
      error: error.message
    });
  }
};

// @desc    Get pending quantities from out-of-stock orders
// @route   GET /api/sales-orders/pending-quantities
// @access  Private
export const getPendingQuantities = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);

    const { productId, warehouseId } = req.query;

    // Build query for out-of-stock orders that are still pending (exclude expired)
    const query = {
      isOutOfStock: true,
      status: "Pending",
      $or: [
        { isExpired: { $ne: true } }, // Not expired
        { isExpired: { $exists: false } } // Or isExpired field doesn't exist
      ]
    };

    // If specific product or warehouse requested, filter further
    if (productId || warehouseId) {
      query.$and = [];

      if (productId) {
        query.$and.push({ "products.product": productId });
      }

      if (warehouseId) {
        query.$and.push({ "products.warehouse": warehouseId });
      }
    }

    // Get all out-of-stock pending orders
    const outOfStockOrders = await SalesOrder.find(query)
      .populate("dealer", "name")
      .populate("products.product") // Populate ALL product fields for wishlist compatibility
      .populate("products.warehouse", "name")
      .lean();

    // Aggregate pending quantities by product and warehouse
    const pendingQuantities = {};

    outOfStockOrders.forEach(order => {
      order.products.forEach(product => {
        const productKey = `${product.product._id}-${product.warehouse}`;

        if (!pendingQuantities[productKey]) {
          pendingQuantities[productKey] = {
            productId: product.product._id,
            productName: product.product.itemName,
            productCode: product.product.productCode,
            warehouseId: product.warehouse,
            warehouseName: product.warehouseName,
            totalPendingQuantity: 0,
            orders: []
          };
        }

        pendingQuantities[productKey].totalPendingQuantity += product.quantity;
        pendingQuantities[productKey].orders.push({
          orderNumber: order.orderNumber,
          dealerName: order.dealer?.name || order.dealerName,
          quantity: product.quantity,
          orderDate: order.orderDate,
          dueDate: order.dueDate
        });
      });
    });

    // Convert to array format
    const pendingQuantitiesArray = Object.values(pendingQuantities);

    res.json({
      success: true,
      pendingQuantities: pendingQuantitiesArray,
      totalOutOfStockOrders: outOfStockOrders.length,
      summary: {
        totalProducts: pendingQuantitiesArray.length,
        totalPendingQuantity: pendingQuantitiesArray.reduce((sum, item) => sum + item.totalPendingQuantity, 0)
      }
    });
  } catch (error) {
    console.error("Get Pending Quantities Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending quantities",
      error: error.message
    });
  }
};


// ============================================================================
// DUAL CREDIT DAYS & AUTO-SPLIT ORDERS IMPLEMENTATION
// ============================================================================

/**
 * Helper function to create a single sales order
 * Extracted from createSalesOrder for reusability in auto-split logic
 */
async function createSingleSalesOrder(dbConnection, orderData, userId) {
  const { SalesOrder, Product, Dealer, StockMovement, User, Notification, Warehouse } = getModels(dbConnection);

  const {
    dealer,
    region,
    pinCode,
    deliveryAddress,
    deliveryCity,
    deliveryArea,
    deliveryPinCode,
    deliveryLatitude,
    deliveryLongitude,
    products,
    orderDate,
    deliveryDate,
    creditDays,
    type,
    remarks,
    status,
    isOutOfStock,
    stockValidation,
    salesType, // NEW: 'Regular Sale' or 'CD Sales'
    creditDaysApplied // NEW: Actual credit days applied
  } = orderData;

  // Generate unique order number
  const orderNumber = await generateOrderNumber(dbConnection);
  console.log("Generated order number:", orderNumber);

  // Validate dealer exists
  const dealerData = await Dealer.findById(dealer);
  if (!dealerData) {
    throw new Error("Dealer not found");
  }

  const canonicalProducts = await canonicalizeSalesOrderProducts({
    products,
    dealer: dealerData,
    dbConnection,
    actorId: userId
  });

  // Validate credit days don't exceed dealer's limits
  if (creditDays !== undefined && creditDays !== null) {
    const requestedCreditDays = parseInt(creditDays);

    // Determine which limit to check based on salesType
    let maxCreditDays = 0;
    if (salesType === 'Regular Sale') {
      maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
    } else if (salesType === 'CD Sales') {
      maxCreditDays = dealerData.creditDaysCD || dealerData.creditDays || 0;
    } else {
      // Default to regular if not specified
      maxCreditDays = dealerData.creditDaysRegular || dealerData.creditDays || 0;
    }

    if (requestedCreditDays > maxCreditDays && maxCreditDays > 0) {
      throw new Error(`Credit days (${requestedCreditDays}) cannot exceed dealer's limit of ${maxCreditDays} days for ${salesType || 'Regular Sale'}.`);
    }
  }

  // Validate and process each product
  const validatedProducts = [];

  // Resolve the company's single (default) warehouse — used for out-of-stock
  // lines so incoming stock (GRN or manual adjustment) can auto-update them.
  let defaultWarehouse = null;
  if (isOutOfStock || canonicalProducts.some(it => !it.warehouse || it.warehouse === "No Stock")) {
    defaultWarehouse =
      (await Warehouse.findOne({ isActive: true, status: "active" }).sort({ createdAt: 1 })) ||
      (await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 })) ||
      (await Warehouse.findOne({}).sort({ createdAt: 1 }));
  }

  for (const item of canonicalProducts) {
    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product not found: ${item.productName || item.product}`);
    }

    // Validate warehouse exists (skip if warehouse is "No Stock" for out-of-stock orders)
    if (item.warehouse && item.warehouse !== "No Stock") {
      const warehouse = await Warehouse.findById(item.warehouse);

      if (!warehouse) {
        throw new Error(`Warehouse not found: ${item.warehouse}`);
      }

      // For out-of-stock orders, skip stock validation
      if (!isOutOfStock) {
        // For regular orders, validate stock availability
        const stock = await StockMovement.findOne({
          productId: item.product,
          warehouseId: item.warehouse
        });

        if (stock && stock.netStock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${stock.netStock}, Required: ${item.quantity}`);
        }
      }

      console.log(`Product ${product.itemName} validated for warehouse ${warehouse.name}`);
    } else if (item.warehouse === "No Stock") {
      console.log(`Product ${product.itemName} has no warehouse assigned (out-of-stock order)`);
    }

    // Build the persisted line from server-canonical discount amounts.
    validatedProducts.push({
      ...item,
      product: product._id,
      productCode: product.productCode,
      productName: product.itemName,
      HSNCode: product.HSNCode,
      internalRate: product.internalRate || null,
      salesType: item.salesType || product.salesType || 'Regular Sale',
      warehouse: (item.warehouse && item.warehouse !== "No Stock")
        ? item.warehouse
        : (defaultWarehouse?._id || null),
      warehouseName: (item.warehouse && item.warehouse !== "No Stock")
        ? item.warehouseName
        : "No Stock",
      stockStatus: isOutOfStock ? 'waiting' : 'available',
      availableQuantity: isOutOfStock ? 0 : item.quantity,
      stockCheckedAt: new Date()
    });
  }

  // Calculate order totals from canonical lines.
  const { grossAmount, totalGst, discountAmount, totalAmount } = calculateCanonicalOrderTotals(validatedProducts);

  // Determine initial status (declare before credit limit check)
  let initialStatus = status || "Pending";

  // For out-of-stock orders, force status to Pending
  if (isOutOfStock) {
    initialStatus = "Pending";
    console.log("🚨 Creating out-of-stock sales order - status locked to Pending");
  }

  // Check credit limit if dealer has one set
  // IMPORTANT: Only count IN-STOCK products towards credit limit
  let creditOverlimitData = undefined;
  const inStockProductsForCredit = validatedProducts.filter(p => p.stockStatus === 'available');
  const canonicalCreditAmount = inStockProductsForCredit.reduce(
    (sum, product) => sum + calculateCanonicalCreditLineAmount(product),
    0
  );
  if (dealerData.creditLimit && dealerData.creditLimit > 0) {
    // Calculate amount for IN-STOCK products only
    const inStockProducts = inStockProductsForCredit;
    const inStockTotalAmount = canonicalCreditAmount;

    console.log(`� Credit Limit Calculation - In-eStock Products Only:`, {
      totalProducts: validatedProducts.length,
      inStockProducts: inStockProducts.length,
      outOfStockProducts: validatedProducts.length - inStockProducts.length,
      inStockAmount: inStockTotalAmount,
      totalOrderAmount: totalAmount
    });

    // Get dealer's current outstanding balance (correct calculation)
    const currentOutstanding = await getDealerCreditOutstanding(dbConnection, dealer);
    const newOutstanding = currentOutstanding + inStockTotalAmount;

    console.log(`💳 Credit Limit Check (Single Order):`, {
      creditLimit: dealerData.creditLimit,
      currentOutstanding,
      orderAmount: inStockTotalAmount,
      newOutstanding,
      overlimit: newOutstanding - dealerData.creditLimit
    });

    // If credit limit exceeded, force status to Pending and add credit overlimit info
    if (newOutstanding > dealerData.creditLimit) {
      const overlimitAmount = newOutstanding - dealerData.creditLimit;
      console.log(`⚠️ Credit limit exceeded by ₹${overlimitAmount.toFixed(2)}`);

      // Force status to Pending for approval
      initialStatus = "Pending";
      creditOverlimitData = {
        isOverlimit: true,
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: inStockTotalAmount, // Show in-stock amount
        newOutstanding,
        overlimitAmount,
        requiresApproval: true
      };
    }
  }

  // Calculate due date
  let dueDate = null;
  if (orderDate && creditDays) {
    dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + creditDays);
  }

  // Create sales order
  const salesOrder = new SalesOrder({
    orderNumber,
    dealer,
    dealerName: dealerData.name,
    dealerCode: dealerData.code,
    dealerType: dealerData.dealerType,
    region,
    pinCode,
    deliveryAddress,
    deliveryCity,
    deliveryArea,
    deliveryPinCode,
    deliveryLatitude,
    deliveryLongitude,
    products: validatedProducts,
    orderDate,
    deliveryDate,
    creditDays,
    salesType, // NEW: Set the sales type
    creditDaysApplied, // NEW: Set the applied credit days
    dueDate,
    grossAmount,
    totalGst,
    discountAmount,
    totalAmount,
    type,
    remarks,
    status: initialStatus,
    discountFinalizedAt: isFinalizedSalesOrderStatus(initialStatus) ? new Date() : null,
    createdBy: userId,
    isOutOfStock: isOutOfStock || false,
    stockValidation: stockValidation || [],
    creditOverlimit: creditOverlimitData, // Add credit overlimit data
    creditAmount: canonicalCreditAmount,
    // Initialize order-level stock status (fixes "Unknown" display + enables tracking)
    orderStockStatus: {
      totalProducts: validatedProducts.length,
      availableProducts: isOutOfStock ? 0 : validatedProducts.length,
      partialProducts: 0,
      waitingProducts: isOutOfStock ? validatedProducts.length : 0,
      overallStatus: isOutOfStock ? 'waiting' : 'ready',
      lastChecked: new Date()
    }
  });

  // Automatically set 15-day expiry for Pending orders
  if (salesOrder.status === "Pending") {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now

    salesOrder.expiryDate = expiryDate;
    salesOrder.expiryReason = 'Automatic 15-day expiry for pending order';
    salesOrder.expiryHistory.push({
      action: 'set',
      previousDate: null,
      newDate: expiryDate,
      reason: 'Automatic 15-day expiry set on order creation',
      performedBy: userId,
      performedAt: new Date()
    });

    console.log(`📅 Automatic expiry set for pending order ${orderNumber}: ${expiryDate.toISOString()}`);
  }

  // Save sales order
  await salesOrder.save();

  // Handle stock updates based on initial status (only for in-stock orders)
  if (!isOutOfStock) {
    if (salesOrder.status === "Confirmed") {
      console.log("Order created with Confirmed status - blocking stock");
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });

          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance - product.quantity;

          const blockMovement = new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
            createdBy: userId
          });
          await blockMovement.save();
        }
      }
    } else if (salesOrder.status === "Delivered") {
      console.log("Order created with Delivered status - permanently reducing stock");
      for (const product of salesOrder.products) {
        if (product.warehouse) {
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });

          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance - product.quantity;

          const deliveryMovement = new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
            createdBy: userId
          });
          await deliveryMovement.save();
        }
      }
    }
  }

  // Populate the created order for response
  const populatedOrder = await SalesOrder.findById(salesOrder._id)
    .populate("dealer", "name code contactPerson phone email address dealerType creditDaysRegular creditDaysCD")
    .populate("region", "name")
    .populate("products.product")
    .populate("products.warehouse", "name")
    .populate("createdBy", "name email");

  return populatedOrder;
}

/**
 * @desc    Create sales order with auto-split for CD Sales and Regular Sales
 * @route   POST /api/sales-orders/auto-split
 * @access  Private
 */
export const createSalesOrderWithAutoSplit = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, StockMovement, User, Notification } = getModels(req.dbConnection);

    console.log("🚀 createSalesOrderWithAutoSplit called");
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const { dealer, products, ...orderData } = req.body;

    // Validate dealer exists
    const dealerData = await Dealer.findById(dealer);
    if (!dealerData) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    console.log("✅ Dealer found:", dealerData.name);
    console.log("📊 Dealer credit days - Regular:", dealerData.creditDaysRegular, "CD:", dealerData.creditDaysCD);

    // Get full product details to check salesType
    const productDetails = await Promise.all(
      products.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw createDiscountPolicyError(`Product not found: ${item.product}`, 'PRODUCT_NOT_FOUND');
        }
        return {
          ...item,
          salesType: product.salesType
        };
      })
    );

    console.log("📦 Product details loaded:", productDetails.length, "products");

    // Separate products by salesType
    const regularProducts = productDetails.filter(p => p.salesType === 'Regular Sale');
    const cdProducts = productDetails.filter(p => p.salesType === 'CD Sales');

    console.log("🔵 Regular Sale products:", regularProducts.length);
    console.log("🟢 CD Sales products:", cdProducts.length);

    // Validate every split group's discount policy before the first order is persisted.
    await Promise.all([
      regularProducts.length > 0
        ? canonicalizeSalesOrderProducts({
          products: regularProducts,
          dealer: dealerData,
          dbConnection: req.dbConnection,
          actorId: req.user._id
        })
        : Promise.resolve([]),
      cdProducts.length > 0
        ? canonicalizeSalesOrderProducts({
          products: cdProducts,
          dealer: dealerData,
          dbConnection: req.dbConnection,
          actorId: req.user._id
        })
        : Promise.resolve([])
    ]);

    const createdOrders = [];

    // Create Regular Sales Order if there are regular products
    if (regularProducts.length > 0) {
      console.log("\n📝 Creating Regular Sales Order...");
      const regularOrderData = {
        ...orderData,
        dealer,
        products: regularProducts,
        salesType: 'Regular Sale',
        creditDays: dealerData.creditDaysRegular || dealerData.creditDays || 30,
        creditDaysApplied: dealerData.creditDaysRegular || dealerData.creditDays || 30
      };

      const regularOrder = await createSingleSalesOrder(req.dbConnection, regularOrderData, req.user._id);
      createdOrders.push(regularOrder);
      console.log("✅ Regular Sales Order created:", regularOrder.orderNumber);
    }

    // Create CD Sales Order if there are CD products
    if (cdProducts.length > 0) {
      console.log("\n📝 Creating CD Sales Order...");
      const cdOrderData = {
        ...orderData,
        dealer,
        products: cdProducts,
        salesType: 'CD Sales',
        creditDays: dealerData.creditDaysCD || dealerData.creditDays || 30,
        creditDaysApplied: dealerData.creditDaysCD || dealerData.creditDays || 30
      };

      const cdOrder = await createSingleSalesOrder(req.dbConnection, cdOrderData, req.user._id);
      createdOrders.push(cdOrder);
      console.log("✅ CD Sales Order created:", cdOrder.orderNumber);
    }

    // Return response
    if (createdOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products to create order"
      });
    } else if (createdOrders.length === 1) {
      console.log("\n✅ Single order created successfully");
      res.status(201).json({
        success: true,
        message: "Sales order created successfully",
        salesOrder: createdOrders[0],
        isSplit: false
      });
    } else {
      console.log("\n✅ Orders split successfully - 2 orders created");
      res.status(201).json({
        success: true,
        message: "Orders created successfully! Your order was split into Regular and CD Sales orders.",
        salesOrders: createdOrders,
        isSplit: true,
        regularOrder: createdOrders.find(o => o.salesType === 'Regular Sale'),
        cdOrder: createdOrders.find(o => o.salesType === 'CD Sales')
      });
    }

  } catch (error) {
    console.error("❌ Create Sales Order with Auto-Split Error:", error);

    if (sendDiscountPolicyError(res, error)) return;

    // Handle duplicate order number error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Order number already exists"
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating sales order",
      error: error.message
    });
  }
};


// @desc    Set expiry date for pending order
// @route   PATCH /api/sales-orders/:id/set-expiry
// @access  Private
export const setOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { expiryDate, reason } = req.body;
    const { id } = req.params;

    if (!expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Expiry date is required"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // Only allow setting expiry for pending orders
    if (salesOrder.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only set expiry for pending orders"
      });
    }

    const newExpiryDate = new Date(expiryDate);
    const now = new Date();

    if (newExpiryDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Expiry date must be in the future"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'set',
      previousDate: salesOrder.expiryDate,
      newDate: newExpiryDate,
      reason: reason || 'Initial expiry date set',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.expiryDate = newExpiryDate;
    salesOrder.expiryReason = reason || 'Pending order expiry';
    salesOrder.isExpired = false;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Expiry date set successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Set Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error setting expiry date",
      error: error.message
    });
  }
};

// @desc    Extend expiry date for pending order
// @route   PATCH /api/sales-orders/:id/extend-expiry
// @access  Private
export const extendOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { newExpiryDate, reason } = req.body;
    const { id } = req.params;

    if (!newExpiryDate) {
      return res.status(400).json({
        success: false,
        message: "New expiry date is required"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Order does not have an expiry date set"
      });
    }

    const extendedDate = new Date(newExpiryDate);
    const now = new Date();

    if (extendedDate <= now) {
      return res.status(400).json({
        success: false,
        message: "New expiry date must be in the future"
      });
    }

    // Allow extending even if order is expired - just check that new date is in future
    // Remove the check: if (extendedDate <= salesOrder.expiryDate)

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'extended',
      previousDate: salesOrder.expiryDate,
      newDate: extendedDate,
      reason: reason || 'Expiry date extended',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    const wasExpired = salesOrder.isExpired === true;
    salesOrder.expiryDate = extendedDate;
    salesOrder.expiryExtendedCount += 1;
    salesOrder.isExpired = false; // Reset if was expired

    // Both automatic expiry (Expired) and manual expiry (Cancelled) reopen to Pending.
    if (wasExpired && ['Expired', 'Cancelled'].includes(salesOrder.status)) {
      salesOrder.status = "Pending";
    }

    await salesOrder.save();

    let responseOrder = salesOrder;
    if (salesOrder.status === 'Pending') {
      const StockArrivalService = (await import('../services/stockArrivalService.js')).default;
      await StockArrivalService.checkOrderStockStatus(salesOrder._id, req.dbConnection, { force: true });
      responseOrder = await SalesOrder.findById(salesOrder._id);
    }

    res.json({
      success: true,
      message: "Expiry date extended successfully",
      salesOrder: responseOrder
    });
  } catch (error) {
    console.error("Extend Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error extending expiry date",
      error: error.message
    });
  }
};

// @desc    Expire order immediately
// @route   PATCH /api/sales-orders/:id/expire-now
// @access  Private
export const expireOrderNow = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (salesOrder.isExpired) {
      return res.status(400).json({
        success: false,
        message: "Order is already expired"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'expired',
      previousDate: salesOrder.expiryDate,
      newDate: new Date(),
      reason: reason || 'Manually expired',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.isExpired = true;
    salesOrder.expiredAt = new Date();
    salesOrder.status = "Cancelled"; // Auto-cancel expired orders
    salesOrder.stockAvailable = false;
    salesOrder.remarks = (salesOrder.remarks || '') + ` [EXPIRED: ${reason || 'Manually expired'}]`;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Order expired successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Expire Order Now Error:", error);
    res.status(500).json({
      success: false,
      message: "Error expiring order",
      error: error.message
    });
  }
};

// @desc    Get orders expiring soon (within specified days)
// @route   GET /api/sales-orders/expiring-soon
// @access  Private
export const getOrdersExpiringSoon = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { days = 1 } = req.query; // Default to 1 day

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const expiringOrders = await SalesOrder.find({
      expiryDate: {
        $gte: now,
        $lte: futureDate
      },
      isExpired: false,
      status: "Pending"
    })
      .populate("dealer", "name code contactPerson phone email")
      .populate("region", "name")
      .populate("products.product", "productCode itemName")
      .sort({ expiryDate: 1 })
      .lean();

    // Calculate hours until expiry for each order
    const ordersWithTimeLeft = expiringOrders.map(order => {
      const timeLeft = order.expiryDate - now;
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      const daysLeft = Math.floor(hoursLeft / 24);

      return {
        ...order,
        hoursUntilExpiry: hoursLeft,
        daysUntilExpiry: daysLeft,
        isUrgent: hoursLeft <= 24
      };
    });

    res.json({
      success: true,
      count: ordersWithTimeLeft.length,
      orders: ordersWithTimeLeft
    });
  } catch (error) {
    console.error("Get Expiring Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching expiring orders",
      error: error.message
    });
  }
};

// @desc    Cancel expiry (remove expiry date)
// @route   PATCH /api/sales-orders/:id/cancel-expiry
// @access  Private
export const cancelOrderExpiry = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Order does not have an expiry date set"
      });
    }

    // Add to expiry history
    salesOrder.expiryHistory.push({
      action: 'cancelled',
      previousDate: salesOrder.expiryDate,
      newDate: null,
      reason: reason || 'Expiry cancelled',
      performedBy: req.user._id,
      performedAt: new Date()
    });

    salesOrder.expiryDate = null;
    salesOrder.expiryReason = null;
    salesOrder.isExpired = false;

    await salesOrder.save();

    res.json({
      success: true,
      message: "Expiry cancelled successfully",
      salesOrder
    });
  } catch (error) {
    console.error("Cancel Order Expiry Error:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling expiry",
      error: error.message
    });
  }
};

// @desc    Approve credit overlimit order
// @route   PATCH /api/sales-orders/:id/approve-credit-overlimit
// @access  Private (Super Admin only)
export const approveCreditOverlimit = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { approvalNotes } = req.body;
    const { id } = req.params;

    // Check if user is super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: "Only Super Admin can approve credit overlimit orders"
      });
    }

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (!salesOrder.creditOverlimit || !salesOrder.creditOverlimit.isOverlimit) {
      return res.status(400).json({
        success: false,
        message: "Order does not have credit overlimit"
      });
    }

    if (salesOrder.creditOverlimit.approvedBy) {
      return res.status(400).json({
        success: false,
        message: "Order already approved"
      });
    }

    // Update credit overlimit approval
    salesOrder.creditOverlimit.approvedBy = req.user._id;
    salesOrder.creditOverlimit.approvedAt = new Date();
    salesOrder.creditOverlimit.approvalNotes = approvalNotes || 'Credit overlimit approved';
    salesOrder.creditOverlimit.requiresApproval = false;

    // DON'T auto-confirm the order - keep it Pending for manual review
    // The order should be manually confirmed after credit approval
    // This allows for additional verification before stock is blocked

    await salesOrder.save();

    res.json({
      success: true,
      message: "Credit overlimit approved successfully. Order remains Pending - please confirm manually to proceed.",
      salesOrder
    });
  } catch (error) {
    console.error("Approve Credit Overlimit Error:", error);
    res.status(500).json({
      success: false,
      message: "Error approving credit overlimit",
      error: error.message
    });
  }
};

// Check stock availability for out-of-stock orders (called after purchase order received)
export const checkStockAvailabilityForOutOfStockOrders = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { productIds = [], warehouseId } = req.body;
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;

    console.log('🔍 Checking stock availability for products:', productIds);
    console.log('📦 Trigger warehouse:', warehouseId);

    // Candidate lookup is only a trigger optimization. The canonical refresh below
    // checks each line against its own assigned warehouse.
    const outOfStockOrders = await SalesOrder.find({
      isOutOfStock: true,
      status: 'Pending',
      isExpired: { $ne: true },
      'products.product': { $in: productIds }
    }).populate('dealer', 'name code');

    console.log(`📋 Found ${outOfStockOrders.length} out-of-stock orders to check`);

    let notifiedCount = 0;
    const notifiedOrders = [];

    for (const order of outOfStockOrders) {
      const result = await StockArrivalService.checkOrderStockStatus(order._id, req.dbConnection);
      const enteredReadyQueue = result.success && result.enteredReadyQueue === true;

      if (enteredReadyQueue) {
        console.log(`✅ Stock available for order ${order.orderNumber}`);
        notifiedOrders.push({
          orderNumber: order.orderNumber,
          dealerName: order.dealerName,
          stockStatus: result.products
        });
        notifiedCount++;
      } else {
        console.log(`⏳ Stock not yet sufficient for order ${order.orderNumber}`);
      }
    }

    console.log(`📢 Notified ${notifiedCount} orders about stock arrival`);

    res.json({
      success: true,
      notifiedCount,
      notifiedOrders,
      message: `Checked ${outOfStockOrders.length} orders, notified ${notifiedCount} about stock arrival`
    });

  } catch (error) {
    console.error('❌ Error checking stock availability:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};





// Auto-expire orders that have passed their expiry date
export const autoExpireOrders = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const now = new Date();

    // Find all orders with expiry date in the past that are not yet expired
    const ordersToExpire = await SalesOrder.find({
      expiryDate: { $lt: now },
      isExpired: false,
      status: { $in: ["Pending"] } // Only expire pending orders
    });

    let expiredCount = 0;

    for (const order of ordersToExpire) {
      order.isExpired = true;
      order.expiredAt = now;
      order.status = "Expired"; // Change status to Expired
      order.stockAvailable = false;

      order.expiryHistory.push({
        action: 'expired',
        previousDate: order.expiryDate,
        newDate: null,
        reason: 'Order automatically expired after deadline passed',
        performedBy: null, // System action
        performedAt: now
      });

      await order.save();
      expiredCount++;
    }

    console.log(`✅ Auto-expired ${expiredCount} orders`);

    res.json({
      success: true,
      expiredCount,
      message: `${expiredCount} orders automatically expired`
    });
  } catch (error) {
    console.error("Auto Expire Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Error auto-expiring orders",
      error: error.message
    });
  }
};


// @desc    Get stock status for a specific order
// @route   GET /api/sales-orders/:id/stock-status
// @access  Private
export const getOrderStockStatus = async (req, res) => {
  try {
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;

    const result = await StockArrivalService.checkOrderStockStatus(req.params.id, req.dbConnection);

    res.json(result);
  } catch (error) {
    console.error('Get Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting order stock status',
      error: error.message
    });
  }
};

// @desc    Manually refresh stock status for an order
// @route   POST /api/sales-orders/:id/refresh-stock-status
// @access  Private
export const refreshOrderStockStatus = async (req, res) => {
  try {
    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;

    const result = await StockArrivalService.checkOrderStockStatus(req.params.id, req.dbConnection);

    res.json({
      success: true,
      message: 'Stock status refreshed successfully',
      ...result
    });
  } catch (error) {
    console.error('Refresh Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing order stock status',
      error: error.message
    });
  }
};

// @desc    Manually refresh stock status for an order by order number
// @route   POST /api/sales-orders/refresh-by-order-number/:orderNumber
// @access  Private
export const refreshOrderStockStatusByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    // Find order by order number
    const order = await SalesOrder.findOne({ orderNumber });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order ${orderNumber} not found`
      });
    }

    const StockArrivalService = (await import('../services/stockArrivalService.js')).default;

    const result = await StockArrivalService.checkOrderStockStatus(order._id, req.dbConnection);

    res.json({
      success: true,
      message: `Stock status refreshed successfully for order ${orderNumber}`,
      ...result
    });
  } catch (error) {
    console.error('Refresh Order Stock Status By Order Number Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing order stock status',
      error: error.message
    });
  }
};

// @desc    Migrate/fix orderStockStatus for all existing orders that have 'unknown' overallStatus
// @route   POST /api/sales-orders/migrate-stock-status
// @access  Private (Admin only)
export const migrateOrderStockStatus = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    // Find all orders where overallStatus is 'unknown' or orderStockStatus is missing
    const orders = await SalesOrder.find({
      $or: [
        { 'orderStockStatus.overallStatus': 'unknown' },
        { 'orderStockStatus.overallStatus': { $exists: false } },
        { orderStockStatus: { $exists: false } }
      ]
    });

    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const products = order.products || [];
      const total = products.length;

      let overallStatus;
      let availableCount = 0;
      let waitingCount = 0;
      let partialCount = 0;

      // Cancelled/Rejected: mark as ready (no stock tracking needed)
      if (['Cancelled', 'Rejected'].includes(order.status)) {
        overallStatus = 'ready';
        availableCount = total;
      } else if (order.status === 'Delivered') {
        overallStatus = 'ready';
        availableCount = total;
      } else {
        // Compute from product-level stockStatus
        const unknownProducts = products.filter(p => !p.stockStatus || p.stockStatus === 'unknown');

        if (unknownProducts.length === total) {
          // All unknown — infer from order flags
          if (order.isOutOfStock) {
            overallStatus = 'waiting';
            waitingCount = total;
          } else {
            // Confirmed/Processing/In Transit without explicit tracking = stock was available
            overallStatus = 'ready';
            availableCount = total;
          }
        } else {
          availableCount = products.filter(p => p.stockStatus === 'available').length;
          waitingCount = products.filter(p => p.stockStatus === 'waiting').length;
          partialCount = products.filter(p => p.stockStatus === 'partial').length;

          if (availableCount === total) overallStatus = 'ready';
          else if (waitingCount === total) overallStatus = 'waiting';
          else if (availableCount > 0 || partialCount > 0) overallStatus = 'partial';
          else overallStatus = 'waiting';
        }
      }

      order.orderStockStatus = {
        totalProducts: total,
        availableProducts: availableCount,
        partialProducts: partialCount,
        waitingProducts: waitingCount,
        overallStatus,
        lastChecked: new Date()
      };

      await order.save();
      updated++;
    }

    res.json({
      success: true,
      message: `Migration complete: ${updated} orders updated, ${skipped} skipped`,
      updated,
      skipped
    });
  } catch (error) {
    console.error('Migrate Order Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error migrating order stock status',
      error: error.message
    });
  }
};

// @desc    Manually trigger stock status refresh for all waiting/partial orders
// @route   POST /api/sales-orders/auto-refresh-stock-status
// @access  Private
export const autoRefreshAllStockStatus = async (req, res) => {
  try {
    const { runStockStatusRefresh } = await import('../cron/stockStatusRefresh.js');
    const result = await runStockStatusRefresh();
    res.json({
      success: true,
      message: `Stock status refreshed: ${result.updated} orders updated`,
      ...result
    });
  } catch (error) {
    console.error('Auto Refresh Stock Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing stock status',
      error: error.message
    });
  }
};

// @desc    Migrate/fix all existing orders to recalculate discount-aware totals
// @route   POST /api/sales-orders/migrate-discount-totals
// @access  Private (Super Admin)
// @desc    Partial dispatch — reduce confirmed order qty, unblock stock, optionally create new SO or deviation
// @route   PATCH /api/sales-orders/:id/partial-dispatch
// @access  Private
export const partialDispatch = async (req, res) => {
  let session = null;
  class PartialDispatchHttpError extends Error {
    constructor(status, payload) {
      super(payload.message);
      this.name = 'PartialDispatchHttpError';
      this.status = status;
      this.payload = payload;
    }
  }

  try {
    const { SalesOrder, DealerInvoice, StockMovement, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;
    const { products, action } = req.body;
    // products: [{ productId, newQty, reason }]
    // action: 'new_order' | 'deviation'

    session = await req.dbConnection.startSession();
    const transactionResult = await session.withTransaction(async () => {
      const fail = (status, payload) => {
        throw new PartialDispatchHttpError(status, payload);
      };

      const salesOrder = await SalesOrder.findById(id).session(session);
    if (!salesOrder) return fail(404, { success: false, message: 'Sales order not found' });
    if (salesOrder.status !== 'Confirmed') {
      return fail(400, { success: false, message: 'Partial dispatch only allowed for Confirmed orders' });
    }

    // Check no APPROVED invoice exists (draft invoices don't block partial dispatch)
    const existingInvoice = await DealerInvoice.findOne({
      salesOrder: id,
      status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
      isDraft: { $ne: true }
    }).session(session);
    if (existingInvoice) {
      return fail(400, { success: false, message: 'Cannot do partial dispatch — invoice already created for this order' });
    }

    if (!['new_order', 'deviation'].includes(action)) {
      return fail(400, {
        success: false,
        message: "action must be either 'new_order' or 'deviation'"
      });
    }
    if (!Array.isArray(products) || products.length === 0) {
      return fail(400, { success: false, message: 'products must be a non-empty array' });
    }

    // Resolve and validate every request line before changing stock or the order.
    // sourceSalesOrderLineId is authoritative; productId is accepted only when unique.
    const dispatchPlans = [];
    const usedSourceLineIds = new Set();
    for (const update of products) {
      const requestedSourceLineId = objectIdString(
        update.sourceSalesOrderLineId || update.salesOrderLineId
      );
      const requestedProductId = objectIdString(update.productId || update.product);
      let orderProduct = null;

      if (requestedSourceLineId) {
        orderProduct = salesOrder.products.find(
          (productLine) => objectIdString(productLine._id) === requestedSourceLineId
        );
        if (!orderProduct) {
          return fail(400, {
            success: false,
            code: 'SALES_ORDER_LINE_NOT_FOUND',
            message: `sourceSalesOrderLineId ${requestedSourceLineId} does not exist on this Sales Order.`
          });
        }
        if (requestedProductId && objectIdString(orderProduct.product) !== requestedProductId) {
          return fail(400, {
            success: false,
            code: 'SALES_ORDER_LINE_PRODUCT_MISMATCH',
            message: `sourceSalesOrderLineId ${requestedSourceLineId} does not belong to productId ${requestedProductId}.`
          });
        }
      } else {
        if (!requestedProductId) {
          return fail(400, {
            success: false,
            code: 'SALES_ORDER_LINE_ID_REQUIRED',
            message: 'Each partial-dispatch item requires sourceSalesOrderLineId or productId.'
          });
        }
        const productMatches = salesOrder.products.filter(
          (productLine) => objectIdString(productLine.product) === requestedProductId
        );
        if (productMatches.length > 1) {
          return fail(400, {
            success: false,
            code: 'SOURCE_SALES_ORDER_LINE_ID_REQUIRED',
            message: `sourceSalesOrderLineId is required because productId ${requestedProductId} appears on multiple Sales Order lines.`
          });
        }
        orderProduct = productMatches[0] || null;
        if (!orderProduct) {
          return fail(400, {
            success: false,
            code: 'SALES_ORDER_LINE_NOT_FOUND',
            message: `Product ${requestedProductId} does not exist on this Sales Order.`
          });
        }
      }

      const sourceLineId = objectIdString(orderProduct._id);
      if (usedSourceLineIds.has(sourceLineId)) {
        return fail(400, {
          success: false,
          code: 'DUPLICATE_SALES_ORDER_LINE_ID',
          message: `Sales Order line ${sourceLineId} was submitted more than once.`
        });
      }
      usedSourceLineIds.add(sourceLineId);

      const newQty = Number(update.newQty);
      if (!Number.isInteger(newQty) || newQty < 0) {
        return fail(400, {
          success: false,
          message: `newQty must be a non-negative integer for ${orderProduct.productName}`
        });
      }
      if (newQty >= Number(orderProduct.quantity)) continue;
      dispatchPlans.push({ update, orderProduct, newQty, sourceLineId });
    }

    const deviations = [];
    const remainingProducts = []; // for new order

    for (const { update, orderProduct, newQty, sourceLineId } of dispatchPlans) {
      const originalQty = orderProduct.quantity;
      const originalLine = orderProduct.toObject();
      const effectiveDiscountPercentage = getPersistedEffectiveDiscountPercentage(originalLine);
      const reducedQty = originalQty - newQty;

      // Unblock the reduced qty from stock (for qty=0 this unblocks the full original qty)
      if (orderProduct.warehouse) {
        const latestMovement = await StockMovement.findOne({
          productId: orderProduct.product,
          warehouseId: orderProduct.warehouse
        }).sort({ date: -1, createdAt: -1 }).session(session);

        const currentBalance = latestMovement ? latestMovement.balance : 0;
        const newBalance = currentBalance + reducedQty;

        await new StockMovement({
          productId: orderProduct.product,
          warehouseId: orderProduct.warehouse,
          type: 'IN',
          quantity: reducedQty,
          balance: newBalance,
          referenceNo: salesOrder.orderNumber,
          referenceType: 'SALE',
          date: new Date(),
          remarks: newQty === 0
            ? `Stock Fully Unblocked - Order ${salesOrder.orderNumber} (product skipped in dispatch)`
            : `Stock Unblocked - Order ${salesOrder.orderNumber} Partial Dispatch (${originalQty} → ${newQty})`,
          createdBy: req.user._id
        }).save({ session });
      }

      if (newQty === 0) {
        salesOrder.products = salesOrder.products.filter(
          (productLine) => objectIdString(productLine._id) !== sourceLineId
        );
      } else {
        orderProduct.quantity = newQty;
        orderProduct.discountAmount = discountAmountForQuantity(
          originalLine,
          newQty,
          effectiveDiscountPercentage
        );
      }

      deviations.push({
        sourceSalesOrderLineId: originalLine._id,
        productId: orderProduct.product,
        productName: orderProduct.productName,
        originalQty,
        dispatchedQty: newQty,
        reducedQty,
        reason: update.reason || (newQty === 0 ? 'Product not available — skipped from dispatch' : ''),
        createdAt: new Date(),
        createdBy: req.user._id,
        newOrderCreated: action === 'new_order',
        newOrderNumber: ''
      });

      if (action === 'new_order') {
        remainingProducts.push({
          ...originalLine,
          quantity: reducedQty,
          discountAmount: discountAmountForQuantity(
            originalLine,
            reducedQty,
            effectiveDiscountPercentage
          )
        });
      }
    }

    if (deviations.length === 0) {
      return fail(400, { success: false, message: 'No quantity reductions found. All new quantities must be less than original.' });
    }

    // Push deviations to order
    salesOrder.deviations.push(...deviations);

    // Quantity reductions must immediately reduce the confirmed order's canonical
    // direct + dealer-extra credit exposure.
    const retainedCreditAmount = salesOrder.products
      .filter(isCreditEligibleProduct)
      .reduce((sum, product) => sum + calculateCanonicalCreditLineAmount(product), 0);
    salesOrder.creditAmount = retainedCreditAmount;

    const dealerData = await Dealer.findById(salesOrder.dealer)
      .select('creditLimit')
      .session(session)
      .lean();
    if (dealerData?.creditLimit && dealerData.creditLimit > 0) {
      const currentOutstanding = await getDealerCreditOutstanding(
        req.dbConnection,
        salesOrder.dealer,
        salesOrder._id,
        session
      );
      const newOutstanding = currentOutstanding + retainedCreditAmount;
      const overlimitAmount = Math.max(0, newOutstanding - dealerData.creditLimit);
      const existingApproval = salesOrder.creditOverlimit?.approvedBy ? {
        approvedBy: salesOrder.creditOverlimit.approvedBy,
        approvedAt: salesOrder.creditOverlimit.approvedAt,
        approvalNotes: salesOrder.creditOverlimit.approvalNotes
      } : {};
      const isOverlimit = overlimitAmount > 0;
      salesOrder.creditOverlimit = {
        isOverlimit,
        creditLimit: dealerData.creditLimit,
        currentOutstanding,
        orderAmount: retainedCreditAmount,
        newOutstanding,
        overlimitAmount,
        requiresApproval: isOverlimit && !existingApproval.approvedBy,
        ...(isOverlimit ? existingApproval : {})
      };
    } else {
      salesOrder.creditOverlimit = {
        isOverlimit: false,
        creditLimit: Number(dealerData?.creditLimit || 0),
        currentOutstanding: 0,
        orderAmount: retainedCreditAmount,
        newOutstanding: retainedCreditAmount,
        overlimitAmount: 0,
        requiresApproval: false,
        approvedBy: null,
        approvedAt: null,
        approvalNotes: null
      };
    }

    // Recalculate order totals (pre-save hook will do this, but mark modified)
    salesOrder.markModified('products');
    await salesOrder.save({ session });

    let newOrder = null;
    if (action === 'new_order' && remainingProducts.length > 0) {
      const orderNumber = await generateOrderNumber(req.dbConnection, session);
      const remainderCreditAmount = remainingProducts
        .filter(isCreditEligibleProduct)
        .reduce((sum, product) => sum + calculateCanonicalCreditLineAmount(product), 0);
      let remainderCreditOverlimit;
      if (dealerData?.creditLimit && dealerData.creditLimit > 0) {
        // Rebuild the normal-creation basis without double-counting the retained
        // source: outside outstanding + retained exposure + remainder exposure.
        const outstandingExcludingRetained = await getDealerCreditOutstanding(
          req.dbConnection,
          salesOrder.dealer,
          salesOrder._id,
          session
        );
        const currentOutstanding = outstandingExcludingRetained + retainedCreditAmount;
        const newOutstanding = currentOutstanding + remainderCreditAmount;
        const overlimitAmount = Math.max(0, newOutstanding - dealerData.creditLimit);
        const isOverlimit = overlimitAmount > 0;
        remainderCreditOverlimit = {
          isOverlimit,
          creditLimit: dealerData.creditLimit,
          currentOutstanding,
          orderAmount: remainderCreditAmount,
          newOutstanding,
          overlimitAmount,
          requiresApproval: isOverlimit,
          approvedBy: null,
          approvedAt: null,
          approvalNotes: null
        };
      } else {
        remainderCreditOverlimit = {
          isOverlimit: false,
          creditLimit: Number(dealerData?.creditLimit || 0),
          currentOutstanding: 0,
          orderAmount: remainderCreditAmount,
          newOutstanding: remainderCreditAmount,
          overlimitAmount: 0,
          requiresApproval: false,
          approvedBy: null,
          approvedAt: null,
          approvalNotes: null
        };
      }
      newOrder = new SalesOrder({
        orderNumber,
        dealer: salesOrder.dealer,
        dealerName: salesOrder.dealerName,
        dealerCode: salesOrder.dealerCode,
        dealerType: salesOrder.dealerType,
        region: salesOrder.region,
        pinCode: salesOrder.pinCode,
        products: remainingProducts.map(p => {
          const persistedLine = { ...p };
          delete persistedLine._id;
          return {
            ...persistedLine,
            gstAmount: 0,
            totalPrice: 0
          };
        }),
        orderDate: salesOrder.orderDate,
        deliveryDate: salesOrder.deliveryDate,
        creditDays: salesOrder.creditDays,
        salesType: salesOrder.salesType,
        type: salesOrder.type,
        status: 'Pending',
        remarks: `Remaining qty from partial dispatch of ${salesOrder.orderNumber}`,
        grossAmount: 0, totalGst: 0, totalAmount: 0, // recalculated by pre-save
        creditAmount: remainderCreditAmount,
        creditOverlimit: remainderCreditOverlimit,
        createdBy: req.user._id
      });

      // Set 15-day auto-expiry for the new pending order
      const newOrderExpiry = new Date();
      newOrderExpiry.setDate(newOrderExpiry.getDate() + 15);
      newOrder.expiryDate = newOrderExpiry;
      newOrder.expiryReason = 'Automatic 15-day expiry for pending order (partial dispatch remainder)';
      newOrder.expiryHistory.push({
        action: 'set',
        previousDate: null,
        newDate: newOrderExpiry,
        reason: `Automatic 15-day expiry set — remaining qty from partial dispatch of ${salesOrder.orderNumber}`,
        performedBy: req.user._id,
        performedAt: new Date()
      });

      await newOrder.save({ session });

      // Update deviation records with new order number
      for (const dev of salesOrder.deviations.slice(-deviations.length)) {
        dev.newOrderNumber = newOrder.orderNumber;
      }
      salesOrder.markModified('deviations');
      await salesOrder.save({ session });
    }

      return {
        deviationCount: deviations.length,
        deviations,
        newOrder: newOrder ? { orderNumber: newOrder.orderNumber, _id: newOrder._id } : null
      };
    });

    const updatedOrder = await SalesOrder.findById(id)
      .populate('dealer', 'name code')
      .populate('products.product')
      .populate('products.warehouse', 'name')
      .lean();

    res.json({
      success: true,
      message: `Partial dispatch saved. ${transactionResult.deviationCount} product(s) reduced.`,
      salesOrder: updatedOrder,
      deviations: transactionResult.deviations,
      newOrder: transactionResult.newOrder
    });
  } catch (error) {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('partialDispatch abort error:', abortError);
      }
    }
    if (error instanceof PartialDispatchHttpError) {
      return res.status(error.status).json(error.payload);
    }
    console.error('partialDispatch error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } finally {
    if (session) await session.endSession();
  }
};

// @desc    Get all sales orders that have dispatch deviations
// @route   GET /api/sales-orders/dispatch-deviations
// @access  Private
export const getDispatchDeviations = async (req, res) => {
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const {
      fromDate, toDate, search, dealer,
      page = 1, limit = 20
    } = req.query;

    const query = { 'deviations.0': { $exists: true } }; // only orders with at least 1 deviation

    if (dealer) query.dealer = dealer;
    if (fromDate || toDate) {
      query.orderDate = {};
      if (fromDate) query.orderDate.$gte = new Date(fromDate);
      if (toDate) query.orderDate.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { dealerName: { $regex: search, $options: 'i' } },
        { 'deviations.productName': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await SalesOrder.countDocuments(query);

    const orders = await SalesOrder.find(query)
      .select('orderNumber dealerName orderDate status deviations')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Flatten: one row per deviation entry
    const rows = [];
    for (const order of orders) {
      for (const dev of order.deviations || []) {
        rows.push({
          _id: `${order._id}_${dev._id || dev.productId}`,
          orderNumber: order.orderNumber,
          dealerName: order.dealerName,
          orderDate: order.orderDate,
          orderStatus: order.status,
          productName: dev.productName,
          originalQty: dev.originalQty,
          dispatchedQty: dev.dispatchedQty,
          reducedQty: dev.reducedQty,
          reason: dev.reason,
          createdAt: dev.createdAt,
          newOrderCreated: dev.newOrderCreated,
          newOrderNumber: dev.newOrderNumber
        });
      }
    }

    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalCount: total,
        limit: parseInt(limit),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('getDispatchDeviations error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const migrateDiscountTotals = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);

    const orders = await SalesOrder.find({}).lean();
    let fixed = 0;
    let skipped = 0;

    for (const order of orders) {
      if (!order.products || order.products.length === 0) { skipped++; continue; }

      let gross = 0, totalGst = 0, totalDiscount = 0;
      const updatedProducts = order.products.map(p => {
        // Sales Order unitPrice is GST-inclusive MRP. Discounts reduce that
        // amount directly; GST is reverse-calculated for tax reporting only.
        const baseAmount = Number(p.quantity || 0) * Number(p.unitPrice || 0);
        const discAmt = Number(p.discountAmount || 0);
        const finalAmount = baseAmount - discAmt;
        const gstRate = Number(p.gst || 0);
        const gstAmt = gstRate > 0
          ? Number((finalAmount - finalAmount / (1 + gstRate / 100)).toFixed(2))
          : 0;
        const totalPrice = Number(finalAmount.toFixed(2));
        gross += baseAmount;
        totalGst += gstAmt;
        totalDiscount += discAmt;
        return { ...p, gstAmount: gstAmt, totalPrice };
      });

      const correctTotal = updatedProducts.reduce(
        (sum, product) => sum + Number(product.totalPrice || 0),
        0
      );

      // Only update if something actually changed
      const needsUpdate =
        Math.abs((order.discountAmount || 0) - totalDiscount) > 0.01 ||
        Math.abs((order.totalGst || 0) - totalGst) > 0.01 ||
        Math.abs((order.totalAmount || 0) - correctTotal) > 0.01;

      if (!needsUpdate) { skipped++; continue; }

      await SalesOrder.findByIdAndUpdate(order._id, {
        $set: {
          grossAmount: gross,
          discountAmount: totalDiscount,
          totalGst,
          totalAmount: correctTotal,
          products: updatedProducts
        }
      });
      fixed++;
    }

    res.json({
      success: true,
      message: `Migration complete: ${fixed} orders fixed, ${skipped} skipped (already correct or empty)`,
      fixed,
      skipped,
      total: orders.length
    });
  } catch (error) {
    console.error('Migrate Discount Totals Error:', error);
    res.status(500).json({ success: false, message: 'Migration failed', error: error.message });
  }
};


