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
import { sendPushNotification } from '../services/firebaseNotificationService.js';
import {
  calculateDiscountLine,
  calculateRequiredSequentialStageRatePercentage,
  normalizeRateMap,
  resolveDealerExtraDiscountBySpecificity
} from '../utils/sequentialDiscountPolicy.js';
import StockMovementService from '../services/stockMovementService.js';
import StockArrivalService from '../services/stockArrivalService.js';
import { buildProductSearchConditions } from '../utils/productSearch.js';
import {
  acquireDealerCreditLease,
  acquireDealerCreditLock,
  buildCreditOverlimitSnapshot,
  calculateSalesOrderCreditAmount,
  calculateSalesOrderLineCreditAmount,
  getDealerCreditExposure,
  isSalesOrderCreditEligibleProduct,
  releaseDealerCreditLease
} from '../services/dealerCreditService.js';

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
  };
};

const createDiscountPolicyError = (message, code) => {
  const error = new Error(message);
  error.name = 'DiscountPolicyError';
  error.code = code;
  return error;
};

const objectIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';

const getOutstandingReservationGroups = async (StockMovement, salesOrder) => {
  const movements = await StockMovement.find({
    referenceType: 'SALE',
    $and: [
      {
        $or: [
          { salesOrder: salesOrder._id },
          { referenceNo: salesOrder.orderNumber }
        ]
      },
      {
        $or: [
          { movementRole: { $in: ['RESERVATION', 'RESERVATION_RELEASE'] } },
          {
            movementRole: null,
            remarks: { $regex: /(Stock Blocked|Stock(?: Fully)? Unblocked)/i }
          }
        ]
      }
    ]
  }).lean();

  const groups = new Map();
  for (const movement of movements) {
    const key = StockMovementService.stockKey(movement.productId, movement.warehouseId);
    const group = groups.get(key) || {
      productId: movement.productId,
      warehouseId: movement.warehouseId,
      blockedQuantity: 0,
      releasedQuantity: 0
    };
    const isReservation = movement.movementRole === 'RESERVATION'
      || (!movement.movementRole
        && movement.type === 'OUT'
        && /Stock Blocked/i.test(String(movement.remarks || '')));
    const isRelease = movement.movementRole === 'RESERVATION_RELEASE'
      || (!movement.movementRole
        && movement.type === 'IN'
        && /Stock(?: Fully)? Unblocked/i.test(String(movement.remarks || '')));
    if (isReservation) group.blockedQuantity += Number(movement.quantity || 0);
    if (isRelease) group.releasedQuantity += Number(movement.quantity || 0);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      outstandingQuantity: Math.max(0, group.blockedQuantity - group.releasedQuantity)
    }))
    .filter((group) => group.outstandingQuantity > 0);
};

const hasOutstandingReservations = async (StockMovement, salesOrder) => (
  (await getOutstandingReservationGroups(StockMovement, salesOrder)).length > 0
);

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

const calculateCanonicalCreditLineAmount = calculateSalesOrderLineCreditAmount;
const isCreditEligibleProduct = isSalesOrderCreditEligibleProduct;

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
 * Compatibility wrapper for existing callers. The implementation lives in the
 * shared dealer credit service used by every Sales Order/Dealer/Invoice path.
 */
const getDealerCreditOutstanding = async (
  dbConnection,
  dealerId,
  excludeOrderId = null,
  session = null
) => {
  const exposure = await getDealerCreditExposure(dbConnection, dealerId, {
    excludeSalesOrderId: excludeOrderId,
    session
  });
  return exposure.totalExposure;
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
      const literalSearch = String(search)
        .trim()
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        ...(literalSearch ? [
          { orderNumber: { $regex: literalSearch, $options: "i" } },
          { dealerName: { $regex: literalSearch, $options: "i" } },
        ] : []),
        ...buildProductSearchConditions(search, ["products.productName"]),
      ];

      if (query.$or.length === 0) delete query.$or;
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
      .populate("approvedBy", "name email role")
      .populate("createdBy", "name email role")
      .populate("creditOverlimit.approvedBy", "name email role")
      .populate("creditOverlimit.rejectedBy", "name email role")
      .populate("creditOverlimit.history.performedBy", "name email role")
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
      .populate("approvedBy", "name email role")
      .populate("createdBy", "name email role")
      .populate("creditOverlimit.approvedBy", "name email role")
      .populate("creditOverlimit.rejectedBy", "name email role")
      .populate("creditOverlimit.history.performedBy", "name email role")
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

    const dealerId = salesOrder.dealer?._id || salesOrder.dealer;
    const liveExposure = await getDealerCreditExposure(req.dbConnection, dealerId, {
      excludeSalesOrderId: salesOrder._id
    });
    const liveCreditStatus = buildCreditOverlimitSnapshot(
      liveExposure,
      Number(salesOrder.creditAmount ?? calculateSalesOrderCreditAmount(salesOrder.products || []))
    );

    res.json({
      success: true,
      salesOrder: {
        ...salesOrder,
        liveCreditStatus: {
          ...liveCreditStatus,
          ledgerBalance: liveExposure.ledgerBalance,
          confirmedOrdersAmount: liveExposure.uninvoicedSalesOrderAmount,
          totalCreditUsedBeforeOrder: liveExposure.totalExposure,
          overdueAmount: liveExposure.overdueAmount,
          asOf: liveExposure.asOf
        },
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

// @desc    Preview the exact server-authoritative credit result before save
// @route   POST /api/sales-orders/credit-preview
// @access  Private
export const previewSalesOrderCredit = async (req, res) => {
  try {
    const { Dealer } = getModels(req.dbConnection);
    const { dealer: dealerId, products = [], excludeSalesOrderId = null } = req.body;

    if (!dealerId || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dealer and at least one product are required for credit preview.'
      });
    }

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    const canonicalProducts = await canonicalizeSalesOrderProducts({
      products,
      dealer,
      dbConnection: req.dbConnection,
      actorId: req.user._id
    });
    const exposure = await getDealerCreditExposure(req.dbConnection, dealerId, {
      excludeSalesOrderId
    });
    const candidateCreditAmount = calculateSalesOrderCreditAmount(canonicalProducts);
    const evaluation = buildCreditOverlimitSnapshot(exposure, candidateCreditAmount);

    const lines = canonicalProducts.map((product) => {
      const orderedStages = product.discountPolicySnapshot?.orderedStages || [];
      const directDiscountPercentage = orderedStages
        .filter((stage) => stage.kind === 'direct')
        .reduce((sum, stage) => sum + Number(stage.ratePercentage || 0), 0);
      const dealerExtraDiscountPercentage = orderedStages
        .filter((stage) => stage.kind === 'dealer_extra')
        .reduce((sum, stage) => sum + Number(stage.ratePercentage || 0), 0);
      const eligible = isCreditEligibleProduct(product);
      return {
        product: product.product,
        productName: product.productName,
        quantity: Number(product.quantity || 0),
        unitPrice: Number(product.unitPrice || 0),
        grossAmount: Number(product.quantity || 0) * Number(product.unitPrice || 0),
        directDiscountPercentage,
        dealerExtraDiscountPercentage,
        eligible,
        exclusionReason: eligible ? null : 'No Stock or warehouse not assigned',
        creditAmount: eligible ? calculateCanonicalCreditLineAmount(product) : 0
      };
    });

    return res.json({
      success: true,
      creditStatus: {
        ...evaluation,
        limitConfigured: exposure.limitConfigured,
        ledgerBalance: exposure.ledgerBalance,
        invoiceOutstanding: exposure.invoiceOutstanding,
        confirmedOrdersAmount: exposure.uninvoicedSalesOrderAmount,
        totalCreditUsedBeforeOrder: exposure.totalExposure,
        overdueAmount: exposure.overdueAmount,
        canCreateOrder: exposure.canCreateOrder,
        blockReason: exposure.blockReason,
        asOf: exposure.asOf
      },
      lines
    });
  } catch (error) {
    console.error('Sales Order credit preview error:', error);
    if (sendDiscountPolicyError(res, error)) return;
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Unable to calculate credit preview'
    });
  }
};

// @desc    Create new sales order
// @route   POST /api/sales-orders
// @access  Private
export const createSalesOrder = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, Dealer, User, Notification, Warehouse } = getModels(req.dbConnection);

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

    // Canonical credit value: GST-inclusive MRP reduced sequentially by Direct
    // and Dealer Extra only. No Stock/unassigned lines reserve no credit.
    const orderTotalAmount = calculateSalesOrderCreditAmount(canonicalProducts);
    const creditExposure = await getDealerCreditExposure(req.dbConnection, dealerData._id);

    if (!creditExposure.limitConfigured) {
      return res.status(400).json({
        success: false,
        code: 'DEALER_CREDIT_LIMIT_REQUIRED',
        message: 'Dealer credit limit is not configured. Update Dealer Master before creating an order.'
      });
    }
    if (creditExposure.overdueAmount > 0) {
      return res.status(400).json({
        success: false,
        code: 'DEALER_PAYMENT_OVERDUE',
        message: creditExposure.blockReason,
        paymentStatus: {
          overdueAmount: creditExposure.overdueAmount,
          totalOutstanding: creditExposure.ledgerBalance,
          canCreateOrder: false
        }
      });
    }

    const creditOverlimitSnapshot = buildCreditOverlimitSnapshot(
      creditExposure,
      orderTotalAmount
    );
    req.body.creditOverlimit = {
      ...creditOverlimitSnapshot,
      history: creditOverlimitSnapshot.isOverlimit ? [{
        action: 'requested',
        creditLimit: creditOverlimitSnapshot.creditLimit,
        currentOutstanding: creditOverlimitSnapshot.currentOutstanding,
        orderAmount: creditOverlimitSnapshot.orderAmount,
        newOutstanding: creditOverlimitSnapshot.newOutstanding,
        overlimitAmount: creditOverlimitSnapshot.overlimitAmount,
        performedBy: req.user._id,
        performedAt: new Date(),
        notes: 'Credit approval requested when Sales Order was created.'
      }] : []
    };

    console.log('💳 Canonical Credit Check (createSalesOrder):', {
      ledgerBalance: creditExposure.ledgerBalance,
      uninvoicedSalesOrders: creditExposure.uninvoicedSalesOrderAmount,
      ...creditOverlimitSnapshot
    });

    if (creditOverlimitSnapshot.isOverlimit) {
      req.body.status = 'Pending';
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
          const currentStock = await StockMovementService.getCurrentStock(
            item.product,
            item.warehouse,
            req.dbConnection
          );

          if (currentStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${currentStock}, Required: ${item.quantity}`
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

    // New orders always enter the Pending lifecycle. Confirmation must use the
    // dedicated status endpoint so stock, overdue, credit and approval checks run.
    let initialStatus = 'Pending';

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
    try {
      await StockArrivalService.refreshAllPendingOrders(req.dbConnection);
    } catch (refreshError) {
      console.error('New Sales Order stock queue refresh failed (non-critical):', refreshError.message);
    }

    if (creditOverlimitSnapshot.isOverlimit) {
      try {
        await notifyCreditLimitExceeded(
          dealerData.name,
          orderNumber,
          creditOverlimitSnapshot.overlimitAmount,
          req.company
        );
      } catch (notificationError) {
        console.error('Credit-limit notification failed:', notificationError.message);
      }
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

    // Persist the in-app notification even when the dealer has no push token.
    try {
      const dealerDoc = await Dealer.findById(salesOrder.dealer).select('fcmToken').lean();
      const soTitle = 'Sales Order Created';
      const soMsg = `Sales order ${salesOrder.orderNumber} has been created for you. Total: Rs. ${(salesOrder.totalAmount || 0).toLocaleString('en-IN')}.`;
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
      if (dealerDoc?.fcmToken) {
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
const updateSalesOrderStatusUnlocked = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement, Dealer, User, Notification, DealerInvoice, DealerLedger } = getModels(req.dbConnection);

    const { status, remarks, products } = req.body; // products array with warehouse info
    const { id } = req.params;

    // Find the sales order
    let salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    // A previous confirmation attempt may have committed one or more deterministic
    // reservation rows before the status save failed. Those rows already own this
    // order's FIFO allocation, so a retry must heal the status instead of letting
    // its own OUT movements make the readiness refresh reject it.
    const recoveringConfirmation = status === 'Confirmed'
      && salesOrder.status === 'Pending'
      && Boolean(await StockMovement.exists({
        salesOrder: salesOrder._id,
        referenceType: 'SALE',
        movementRole: 'RESERVATION'
      }));

    if (status === 'Confirmed' && salesOrder.status === 'Pending' && !recoveringConfirmation) {
      await StockArrivalService.refreshAllPendingOrders(req.dbConnection);
      salesOrder = await SalesOrder.findById(id);
      if (salesOrder.orderStockStatus?.overallStatus !== 'ready') {
        return res.status(409).json({
          success: false,
          code: 'SALES_ORDER_NOT_FIFO_READY',
          message: 'This Sales Order is not next in the stock allocation queue or does not have complete stock yet.'
        });
      }
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

    // Status changes cannot also move stock to another warehouse. That would
    // bypass the stock keys leased by this transition. Use the dedicated
    // Pending-order warehouse assignment action first.
    if (Array.isArray(products)) {
      const warehouseChanged = salesOrder.products.some((line, index) => {
        const submittedWarehouse = products[index]?.warehouse;
        return submittedWarehouse
          && objectIdString(submittedWarehouse) !== objectIdString(line.warehouse);
      });
      if (warehouseChanged) {
        return res.status(409).json({
          success: false,
          code: 'ASSIGN_WAREHOUSE_BEFORE_STATUS_CHANGE',
          message: 'Warehouse changes are not allowed in a status update. Assign the warehouse while the order is Pending, then retry.'
        });
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

    // Out-of-stock orders may enter the normal lifecycle only after every line
    // has been rechecked as ready. A ready Pending order is converted to normal
    // reserved-stock handling as part of the same Confirmed transition.
    const readyOutOfStockConfirmation = salesOrder.isOutOfStock
      && status === 'Confirmed'
      && (salesOrder.orderStockStatus?.overallStatus === 'ready' || recoveringConfirmation);
    if (salesOrder.isOutOfStock
        && status !== 'Cancelled'
        && status !== 'Rejected'
        && !readyOutOfStockConfirmation) {
      return res.status(400).json({
        success: false,
        message: "Cannot change status of out-of-stock orders until stock arrives. Current stock status: " + (salesOrder.orderStockStatus?.overallStatus || 'unknown')
      });
    }

    // Recalculate confirmation exposure from the shared canonical service.
    if (status === 'Confirmed') {
      const confirmationCreditAmount = calculateSalesOrderCreditAmount(
        salesOrder.products,
        { includeAll: readyOutOfStockConfirmation }
      );
      salesOrder.creditAmount = confirmationCreditAmount;

      const previousCreditOverlimit = salesOrder.creditOverlimit?.toObject?.()
        || salesOrder.creditOverlimit
        || {};
      const exposure = await getDealerCreditExposure(req.dbConnection, salesOrder.dealer, {
        excludeSalesOrderId: salesOrder._id
      });

      if (!exposure.limitConfigured) {
        return res.status(400).json({
          success: false,
          code: 'DEALER_CREDIT_LIMIT_REQUIRED',
          message: 'Cannot confirm order because the dealer credit limit is not configured.'
        });
      }
      if (exposure.overdueAmount > 0) {
        return res.status(400).json({
          success: false,
          code: 'DEALER_PAYMENT_OVERDUE',
          message: exposure.blockReason,
          paymentStatus: {
            overdueAmount: exposure.overdueAmount,
            totalOutstanding: exposure.ledgerBalance,
            canCreateOrder: false
          }
        });
      }

      const refreshedSnapshot = buildCreditOverlimitSnapshot(
        exposure,
        confirmationCreditAmount
      );
      const approvedExposure = Number(previousCreditOverlimit.newOutstanding);
      const approvalCoversCurrentExposure = refreshedSnapshot.isOverlimit
        && Boolean(previousCreditOverlimit.approvedBy)
        && Number.isFinite(approvedExposure)
        && refreshedSnapshot.newOutstanding <= approvedExposure + 0.01;

      const previousHistory = previousCreditOverlimit.history?.map((entry) => (
        entry.toObject ? entry.toObject() : entry
      )) || [];
      const approvalInvalidated = refreshedSnapshot.isOverlimit
        && Boolean(previousCreditOverlimit.approvedBy)
        && !approvalCoversCurrentExposure;
      salesOrder.creditOverlimit = {
        ...refreshedSnapshot,
        requiresApproval: refreshedSnapshot.isOverlimit && !approvalCoversCurrentExposure,
        approvedBy: approvalCoversCurrentExposure ? previousCreditOverlimit.approvedBy : null,
        approvedAt: approvalCoversCurrentExposure ? previousCreditOverlimit.approvedAt : null,
        approvalNotes: approvalCoversCurrentExposure ? previousCreditOverlimit.approvalNotes : null,
        history: approvalInvalidated ? [
          ...previousHistory,
          {
            action: 'invalidated',
            creditLimit: refreshedSnapshot.creditLimit,
            currentOutstanding: refreshedSnapshot.currentOutstanding,
            orderAmount: refreshedSnapshot.orderAmount,
            newOutstanding: refreshedSnapshot.newOutstanding,
            overlimitAmount: refreshedSnapshot.overlimitAmount,
            performedBy: req.user._id,
            performedAt: new Date(),
            notes: 'Approval invalidated because live exposure increased before confirmation.'
          }
        ] : previousHistory
      };

      if (refreshedSnapshot.isOverlimit && !approvalCoversCurrentExposure) {
        await salesOrder.save();
        return res.status(400).json({
          success: false,
          code: 'CREDIT_APPROVAL_REQUIRED',
          message: `Cannot confirm order - Credit limit exceeded by ₹${refreshedSnapshot.overlimitAmount.toLocaleString('en-IN')}. Super Admin approval required.`,
          creditOverlimit: salesOrder.creditOverlimit
        });
      }
    }

    // Recheck and reserve stock for normal orders and for ready out-of-stock
    // orders entering the normal lifecycle.
    let pendingReservations = [];
    if (status === 'Confirmed' && (!salesOrder.isOutOfStock || readyOutOfStockConfirmation)) {
      // Verify all still-unreserved lines while the product/warehouse leases are held.
      // Grouping avoids over-promising when the same stock key appears more than once.
      const stockShortages = [];
      const requiredByKey = new Map();

      for (const product of salesOrder.products) {
        if (!product.warehouse) continue;
        const operationKey = `SO:${salesOrder._id}:RESERVE:${product._id}`;
        const existingReservation = await StockMovement.exists({ operationKey });
        if (existingReservation) continue;

        const key = StockMovementService.stockKey(product.product, product.warehouse);
        const requirement = requiredByKey.get(key) || {
          productId: product.product,
          warehouseId: product.warehouse,
          required: 0,
          lines: []
        };
        requirement.required += Number(product.quantity || 0);
        requirement.lines.push({ product, operationKey });
        requiredByKey.set(key, requirement);
      }

      for (const requirement of requiredByKey.values()) {
        const currentBalance = await StockMovementService.getCurrentStock(
          requirement.productId,
          requirement.warehouseId,
          req.dbConnection
        );
        if (currentBalance < requirement.required) {
          const productDetails = await Product.findById(requirement.productId);
          stockShortages.push({
            productName: productDetails?.itemName || requirement.lines[0]?.product?.productName || 'Unknown',
            productCode: productDetails?.productCode || 'N/A',
            required: requirement.required,
            available: currentBalance,
            shortage: requirement.required - currentBalance
          });
        }
        pendingReservations.push(...requirement.lines);
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
    if (!salesOrder.isOutOfStock
        || readyOutOfStockConfirmation
        || status === 'Cancelled'
        || status === 'Rejected') {
      if (status === "Confirmed" && originalStatus !== "Confirmed") {
        console.log("Blocking stock for confirmed order");
        for (const reservation of pendingReservations) {
          const { product, operationKey } = reservation;
          const currentBalance = await StockMovementService.getCurrentStock(
            product.product,
            product.warehouse,
            req.dbConnection
          );
          const newBalance = currentBalance - Number(product.quantity || 0);

          await new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            operationKey,
            movementRole: 'RESERVATION',
            salesOrder: salesOrder._id,
            salesOrderLine: product._id,
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Stock Blocked`,
            createdBy: req.user._id
          }).save();
          console.log(`Blocked ${product.quantity} units of product ${product.product} in warehouse ${product.warehouse}. Balance: ${currentBalance} -> ${newBalance}`);
        }
      } else if (status === "Delivered") {
        console.log("Order delivered - converting each reservation into a permanent delivery movement");
        for (const product of salesOrder.products) {
          if (!product.warehouse) continue;
          if (!stockReservedStatuses.includes(originalStatus)) {
            throw new Error(`Order ${salesOrder.orderNumber} has no reserved stock to deliver`);
          }

          const releaseKey = `SO:${salesOrder._id}:DELIVERY_RELEASE:${product._id}`;
          const deliveryKey = `SO:${salesOrder._id}:DELIVERY:${product._id}`;
          if (!(await StockMovement.exists({ operationKey: releaseKey }))) {
            const currentBalance = await StockMovementService.getCurrentStock(
              product.product,
              product.warehouse,
              req.dbConnection
            );
            await new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'IN',
              quantity: product.quantity,
              balance: currentBalance + Number(product.quantity || 0),
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              operationKey: releaseKey,
              movementRole: 'RESERVATION_RELEASE',
              salesOrder: salesOrder._id,
              salesOrderLine: product._id,
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (Delivered)`,
              createdBy: req.user._id
            }).save();
          }

          if (!(await StockMovement.exists({ operationKey: deliveryKey }))) {
            const currentBalance = await StockMovementService.getCurrentStock(
              product.product,
              product.warehouse,
              req.dbConnection
            );
            await new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: product.quantity,
              balance: currentBalance - Number(product.quantity || 0),
              referenceNo: salesOrder.orderNumber,
              referenceType: 'SALE',
              operationKey: deliveryKey,
              movementRole: 'DELIVERY',
              salesOrder: salesOrder._id,
              salesOrderLine: product._id,
              date: new Date(),
              remarks: `Order ${salesOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
              createdBy: req.user._id
            }).save();
          }
        }
      } else if (status === "Cancelled" || status === "Rejected") {
        // Pending can still hold deterministic reservation rows after an
        // interrupted confirmation. Reconcile actual reservation roles rather
        // than inferring reservation ownership from the persisted status.
        console.log("Reconciling reserved stock for cancelled/rejected order");
        const reservationGroups = await getOutstandingReservationGroups(
          StockMovement,
          salesOrder
        );

        for (const group of reservationGroups) {
          const quantityToRestore = group.outstandingQuantity;
          const releaseOperationKey = `SO:${salesOrder._id}:FINAL_RELEASE:${group.productId}:${group.warehouseId}`;
          if (await StockMovement.exists({ operationKey: releaseOperationKey })) continue;

          const currentBalance = await StockMovementService.getCurrentStock(
            group.productId,
            group.warehouseId,
            req.dbConnection
          );
          const newBalance = currentBalance + quantityToRestore;

          await new StockMovement({
            productId: group.productId,
            warehouseId: group.warehouseId,
            type: 'IN',
            quantity: quantityToRestore,
            balance: newBalance,
            referenceNo: salesOrder.orderNumber,
            referenceType: 'SALE',
            operationKey: releaseOperationKey,
            movementRole: 'RESERVATION_RELEASE',
            salesOrder: salesOrder._id,
            date: new Date(),
            remarks: `Order ${salesOrder.orderNumber} - Stock Unblocked (${status})`,
            createdBy: req.user._id
          }).save();
          console.log(`Restored ${quantityToRestore} units for ${group.productId} in ${group.warehouseId}. Balance: ${currentBalance} -> ${newBalance}`);
        }

        if (reservationGroups.length === 0) {
          console.log(`No outstanding reservations found for order ${salesOrder.orderNumber}; no stock restoration was required.`);
        }
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

    if (['Confirmed', 'Delivered', 'Cancelled', 'Rejected'].includes(status)) {
      try {
        await StockArrivalService.refreshStockKeys(
          salesOrder.products
            .filter((line) => line.product && line.warehouse)
            .map((line) => ({ productId: line.product, warehouseId: line.warehouse })),
          req.dbConnection
        );
      } catch (refreshError) {
        console.error('Post-transition stock queue refresh failed:', refreshError.message);
      }
    }

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

export const updateSalesOrderStatus = async (req, res) => {
  const { SalesOrder } = getModels(req.dbConnection);
  let order = null;
  let creditLeaseToken = null;
  let orderLease = null;
  let stockLease = null;
  try {
    // Take the lifecycle lease before reading product keys. Generic edits,
    // expiry actions, and other status transitions share this same order key.
    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${req.params.id}`]
    );

    order = await SalesOrder.findById(req.params.id)
      .select('dealer products.product products.warehouse')
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Sales order not found' });
    }

    const stockKeys = (order.products || [])
      .filter((line) => line.product && line.warehouse)
      .map((line) => StockMovementService.stockKey(line.product, line.warehouse));
    stockLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      stockKeys
    );

    if (req.body.status === 'Confirmed') {
      creditLeaseToken = await acquireDealerCreditLease(
        req.dbConnection,
        order.dealer
      );
    }
    return await updateSalesOrderStatusUnlocked(req, res);
  } catch (error) {
    console.error('Sales Order status serialization error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Error updating Sales Order status',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (creditLeaseToken && order?.dealer) {
      try {
        await releaseDealerCreditLease(req.dbConnection, order.dealer, creditLeaseToken);
      } catch (releaseError) {
        console.error('Failed to release dealer credit lease:', releaseError.message);
      }
    }
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release Sales Order stock lease:', releaseError.message);
      }
    }
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release Sales Order lifecycle lease:', releaseError.message);
      }
    }
  }
};

// @desc    Assign warehouse to out-of-stock order and clear out-of-stock flag
// @route   PATCH /api/sales-orders/:id/assign-warehouse
// @access  Private
export const assignWarehouseToOutOfStockOrder = async (req, res) => {
  let orderLease = null;
  let stockLease = null;
  try {
    // Get models from company-specific connection
    const { SalesOrder, Product, StockMovement } = getModels(req.dbConnection);

    const { id } = req.params;
    const { products } = req.body; // Array of { productIndex, warehouse, warehouseName }

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

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

    if (salesOrder.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        message: 'Warehouse assignment is only allowed while the Sales Order is Pending.'
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product warehouse assignment is required.'
      });
    }

    stockLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      products
        .map((update) => {
          const line = salesOrder.products[update.productIndex];
          return line?.product && update.warehouse
            ? StockMovementService.stockKey(line.product, update.warehouse)
            : null;
        })
        .filter(Boolean)
    );

    // Re-read the lifecycle after taking the order lock.
    const lockedStatus = await SalesOrder.findById(id).select('status').lean();
    if (lockedStatus?.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        message: 'Sales Order status changed while assigning the warehouse. Refresh and try again.'
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
        const currentStock = await StockMovementService.getCurrentStock(
          product.product,
          productUpdate.warehouse,
          req.dbConnection
        );

        if (currentStock < product.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.productName}. Available: ${currentStock}, Required: ${product.quantity}`
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
    await StockArrivalService.checkOrderStockStatus(salesOrder._id, req.dbConnection);

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
      message: "Warehouse assigned successfully. Stock readiness has been recalculated.",
      salesOrder: updatedOrder
    });
  } catch (error) {
    console.error("Assign Warehouse Error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error assigning warehouse",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release warehouse-assignment stock lease:', releaseError.message);
      }
    }
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release warehouse-assignment Sales Order lease:', releaseError.message);
      }
    }
  }
};

// @desc    Update sales order
// @route   PUT /api/sales-orders/:id
// @access  Private
const updateSalesOrderUnlocked = async (req, res) => {
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
    const originalUpdatedAt = salesOrder.updatedAt;

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

    const reservationSensitiveFields = [
      'products',
      'dealer',
      'isOutOfStock',
      'salesType',
      'type',
      'repriceDiscounts'
    ];
    const attemptedReservationField = reservationSensitiveFields.find((field) => (
      Object.prototype.hasOwnProperty.call(req.body, field)
    ));
    const interruptedReservation = currentStatus === 'Pending'
      && attemptedReservationField
      && await hasOutstandingReservations(StockMovement, salesOrder);
    if ((currentStatus !== 'Pending' || interruptedReservation) && attemptedReservationField) {
      return res.status(409).json({
        success: false,
        code: 'RESERVED_ORDER_STOCK_EDIT_FORBIDDEN',
        message: `Cannot edit ${attemptedReservationField} while stock is reserved. Use Partial Dispatch for quantity reductions or cancel the order first.`
      });
    }

    const requestedStatus = req.body.status == null ? currentStatus : String(req.body.status).trim();
    if (requestedStatus !== currentStatus) {
      return res.status(409).json({
        success: false,
        code: 'USE_STATUS_TRANSITION_ENDPOINT',
        message: 'Status changes are not allowed through Sales Order edit. Use the dedicated status action.'
      });
    }

    // Never accept lifecycle, approval, calculated amount or audit ownership
    // fields from a generic edit payload.
    delete req.body.status;
    delete req.body.creditOverlimit;
    delete req.body.creditAmount;
    delete req.body.approvedBy;
    delete req.body.approvedAt;
    delete req.body.createdBy;
    delete req.body.expiryHistory;
    delete req.body.grossAmount;
    delete req.body.totalGst;
    delete req.body.discountAmount;
    delete req.body.totalAmount;

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

        // Validate live stock only for normal Pending orders. Out-of-stock
        // orders intentionally remain editable while waiting for replenishment.
        const effectiveOutOfStock = req.body.isOutOfStock ?? salesOrder.isOutOfStock;
        if (item.warehouse && !effectiveOutOfStock) {
          const currentStock = await StockMovementService.getCurrentStock(
            item.product,
            item.warehouse,
            req.dbConnection
          );

          if (currentStock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.itemName}. Available: ${currentStock}, Required: ${item.quantity}`
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

        const exposure = await getDealerCreditExposure(req.dbConnection, salesOrder.dealer, {
          excludeSalesOrderId: salesOrder._id
        });
        if (!exposure.limitConfigured) {
          return res.status(400).json({
            success: false,
            code: 'DEALER_CREDIT_LIMIT_REQUIRED',
            message: 'Dealer credit limit is not configured. Update Dealer Master before editing this order.'
          });
        }
        if (exposure.overdueAmount > 0) {
          return res.status(400).json({
            success: false,
            code: 'DEALER_PAYMENT_OVERDUE',
            message: exposure.blockReason
          });
        }

        const refreshedSnapshot = buildCreditOverlimitSnapshot(exposure, newTotalAmount);
        const approvedExposure = Number(salesOrder.creditOverlimit?.newOutstanding);
        const approvalStillCovers = refreshedSnapshot.isOverlimit
          && Boolean(salesOrder.creditOverlimit?.approvedBy)
          && Number.isFinite(approvedExposure)
          && refreshedSnapshot.newOutstanding <= approvedExposure + 0.01;

        const previousHistory = salesOrder.creditOverlimit?.history?.map((entry) => (
          entry.toObject ? entry.toObject() : entry
        )) || [];
        const approvalInvalidated = refreshedSnapshot.isOverlimit
          && Boolean(salesOrder.creditOverlimit?.approvedBy)
          && !approvalStillCovers;
        req.body.creditAmount = newTotalAmount;
        req.body.creditOverlimit = {
          ...refreshedSnapshot,
          requiresApproval: refreshedSnapshot.isOverlimit && !approvalStillCovers,
          approvedBy: approvalStillCovers ? salesOrder.creditOverlimit.approvedBy : null,
          approvedAt: approvalStillCovers ? salesOrder.creditOverlimit.approvedAt : null,
          approvalNotes: approvalStillCovers ? salesOrder.creditOverlimit.approvalNotes : null,
          history: approvalInvalidated ? [
            ...previousHistory,
            {
              action: 'invalidated',
              creditLimit: refreshedSnapshot.creditLimit,
              currentOutstanding: refreshedSnapshot.currentOutstanding,
              orderAmount: refreshedSnapshot.orderAmount,
              newOutstanding: refreshedSnapshot.newOutstanding,
              overlimitAmount: refreshedSnapshot.overlimitAmount,
              performedBy: req.user._id,
              performedAt: new Date(),
              notes: 'Previous approval no longer covers the edited exposure.'
            }
          ] : previousHistory
        };

        if (refreshedSnapshot.isOverlimit && !approvalStillCovers && currentStatus !== 'Pending') {
          return res.status(409).json({
            success: false,
            code: 'CREDIT_REAPPROVAL_REQUIRED_BEFORE_EDIT',
            message: 'This edit would exceed the approved credit exposure. Move the order through the controlled approval workflow before changing finalized quantities or prices.',
            creditOverlimit: refreshedSnapshot
          });
        }

        console.log('💳 Canonical Credit Re-Check (updateSalesOrder):', {
          ledgerBalance: exposure.ledgerBalance,
          uninvoicedSalesOrders: exposure.uninvoicedSalesOrderAmount,
          ...req.body.creditOverlimit
        });
      }
    }

    // Store original status before update
    const originalStatus = salesOrder.status;
    const newStatus = req.body.status;

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

    let updatedOrder = await SalesOrder.findOneAndUpdate(
      {
        _id: id,
        status: currentStatus,
        ...(originalUpdatedAt ? { updatedAt: originalUpdatedAt } : {})
      },
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

    if (!updatedOrder) {
      return res.status(409).json({
        success: false,
        code: 'SALES_ORDER_EDIT_CONFLICT',
        message: 'Sales Order changed while it was being edited. Refresh and try again.'
      });
    }

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

export const updateSalesOrder = async (req, res) => {
  let orderLease = null;
  try {
    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${req.params.id}`]
    );
    return await updateSalesOrderUnlocked(req, res);
  } catch (error) {
    console.error('Sales Order edit serialization error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Error updating Sales Order',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release Sales Order edit lease:', releaseError.message);
      }
    }
  }
};

// @desc    Delete sales order
// @route   DELETE /api/sales-orders/:id
// @access  Private
export const deleteSalesOrder = async (req, res) => {
  let orderLease = null;
  let stockLease = null;
  try {
    const { SalesOrder, StockMovement } = getModels(req.dbConnection);
    const { id } = req.params;

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({ success: false, message: "Sales order not found" });
    }
    if (salesOrder.status !== 'Pending') {
      return res.status(400).json({ success: false, message: "Can only delete pending orders" });
    }

    stockLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      salesOrder.products
        .filter((line) => line.product && line.warehouse)
        .map((line) => StockMovementService.stockKey(line.product, line.warehouse))
    );

    const unexpectedReservation = await StockMovement.exists({
      referenceNo: salesOrder.orderNumber,
      referenceType: 'SALE',
      type: 'OUT',
      $or: [
        { movementRole: 'RESERVATION' },
        { remarks: { $regex: /Stock Blocked/i } }
      ]
    });
    if (unexpectedReservation) {
      return res.status(409).json({
        success: false,
        code: 'PENDING_ORDER_HAS_STOCK_RESERVATION',
        message: 'This Pending order has reservation movements and cannot be deleted. Retry confirmation or reconcile the order first.'
      });
    }

    const deletedOrder = await SalesOrder.findOneAndDelete({ _id: id, status: 'Pending' });
    if (!deletedOrder) {
      return res.status(409).json({
        success: false,
        code: 'SALES_ORDER_DELETE_CONFLICT',
        message: 'Sales Order status changed while it was being deleted. Refresh and try again.'
      });
    }

    try {
      await StockArrivalService.refreshAllPendingOrders(req.dbConnection);
    } catch (refreshError) {
      console.error('Post-delete stock queue refresh failed (non-critical):', refreshError.message);
    }
    return res.json({ success: true, message: "Sales order deleted successfully" });
  } catch (error) {
    console.error("Delete Sales Order Error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error deleting sales order",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release Sales Order deletion stock lease:', releaseError.message);
      }
    }
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release Sales Order deletion lifecycle lease:', releaseError.message);
      }
    }
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
      .sort({ date: -1, createdAt: -1 })
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
export async function createSingleSalesOrder(dbConnection, orderData, userId, company = null) {
  const { SalesOrder, Product, Dealer, User, Notification, Warehouse } = getModels(dbConnection);

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
        const currentStock = await StockMovementService.getCurrentStock(
          item.product,
          item.warehouse,
          dbConnection
        );

        if (currentStock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.itemName} in ${warehouse.name}. Available: ${currentStock}, Required: ${item.quantity}`);
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

  // Every new split order enters Pending. Confirmation is the only operation
  // allowed to reserve stock and consume credit.
  let initialStatus = 'Pending';

  // For out-of-stock orders, force status to Pending
  if (isOutOfStock) {
    initialStatus = "Pending";
    console.log("🚨 Creating out-of-stock sales order - status locked to Pending");
  }

  const canonicalCreditAmount = calculateSalesOrderCreditAmount(validatedProducts);
  const creditExposure = await getDealerCreditExposure(dbConnection, dealer);
  if (!creditExposure.limitConfigured) {
    const error = new Error('Dealer credit limit is not configured. Update Dealer Master before creating an order.');
    error.statusCode = 400;
    error.code = 'DEALER_CREDIT_LIMIT_REQUIRED';
    throw error;
  }
  if (creditExposure.overdueAmount > 0) {
    const error = new Error(creditExposure.blockReason);
    error.statusCode = 400;
    error.code = 'DEALER_PAYMENT_OVERDUE';
    throw error;
  }

  const creditOverlimitData = buildCreditOverlimitSnapshot(
    creditExposure,
    canonicalCreditAmount
  );
  creditOverlimitData.history = creditOverlimitData.isOverlimit ? [{
    action: 'requested',
    creditLimit: creditOverlimitData.creditLimit,
    currentOutstanding: creditOverlimitData.currentOutstanding,
    orderAmount: creditOverlimitData.orderAmount,
    newOutstanding: creditOverlimitData.newOutstanding,
    overlimitAmount: creditOverlimitData.overlimitAmount,
    performedBy: userId,
    performedAt: new Date(),
    notes: 'Credit approval requested when split Sales Order was created.'
  }] : [];
  if (creditOverlimitData.isOverlimit) {
    initialStatus = 'Pending';
  }

  console.log('💳 Canonical Credit Check (createSingleSalesOrder):', {
    ledgerBalance: creditExposure.ledgerBalance,
    uninvoicedSalesOrders: creditExposure.uninvoicedSalesOrderAmount,
    ...creditOverlimitData
  });

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
  try {
    await StockArrivalService.refreshAllPendingOrders(dbConnection);
  } catch (refreshError) {
    console.error('Split Sales Order stock queue refresh failed (non-critical):', refreshError.message);
  }

  const notificationTitle = 'Sales Order Created';
  const notificationMessage = `Sales order ${salesOrder.orderNumber} has been created for you. Total: Rs. ${(salesOrder.totalAmount || 0).toLocaleString('en-IN')}.`;
  try {
    await Notification.create({
      dealer: salesOrder.dealer,
      type: 'order_status',
      title: notificationTitle,
      message: notificationMessage,
      orderId: salesOrder._id,
      orderNumber: salesOrder.orderNumber,
      status: salesOrder.status,
      priority: 'high',
      metadata: { originalType: 'sales_order_created' }
    });
    if (dealerData.fcmToken) {
      await sendPushNotification({
        token: dealerData.fcmToken,
        title: notificationTitle,
        body: notificationMessage,
        data: {
          type: 'order_status',
          orderId: salesOrder._id.toString(),
          orderNumber: salesOrder.orderNumber
        }
      });
    }
    if (creditOverlimitData.isOverlimit) {
      await notifyCreditLimitExceeded(
        dealerData.name,
        salesOrder.orderNumber,
        creditOverlimitData.overlimitAmount,
        company
      );
    }
  } catch (notificationError) {
    console.error('Split Sales Order notification failed:', notificationError.message);
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

      const regularOrder = await createSingleSalesOrder(
        req.dbConnection,
        regularOrderData,
        req.user._id,
        req.company
      );
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

      const cdOrder = await createSingleSalesOrder(
        req.dbConnection,
        cdOrderData,
        req.user._id,
        req.company
      );
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
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

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
  let orderLease = null;
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { expiryDate, reason } = req.body;
    const { id } = req.params;

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

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
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error setting expiry date",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release set-expiry Sales Order lease:', releaseError.message);
      }
    }
  }
};

// @desc    Extend expiry date for pending order
// @route   PATCH /api/sales-orders/:id/extend-expiry
// @access  Private
export const extendOrderExpiry = async (req, res) => {
  let orderLease = null;
  try {
    const { SalesOrder, StockMovement } = getModels(req.dbConnection);
    const { newExpiryDate, reason } = req.body;
    const { id } = req.params;

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

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

    if (!['Pending', 'Expired'].includes(salesOrder.status)) {
      return res.status(409).json({
        success: false,
        code: 'ONLY_PENDING_OR_EXPIRED_ORDER_CAN_EXTEND_EXPIRY',
        message: 'Expiry can only be extended for Pending or Expired Sales Orders.'
      });
    }
    if (salesOrder.status === 'Expired'
        && await hasOutstandingReservations(StockMovement, salesOrder)) {
      return res.status(409).json({
        success: false,
        code: 'PENDING_ORDER_HAS_STOCK_RESERVATION',
        message: 'This expired order has unresolved reservation movements and cannot be reopened until they are reconciled.'
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

    // An expired order can be reopened under the lifecycle lease. Cancelled
    // orders stay terminal and must be recreated instead of silently reopened.
    if (wasExpired && salesOrder.status === 'Expired') {
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
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error extending expiry date",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release extend-expiry Sales Order lease:', releaseError.message);
      }
    }
  }
};

// @desc    Expire order immediately
// @route   PATCH /api/sales-orders/:id/expire-now
// @access  Private
export const expireOrderNow = async (req, res) => {
  let orderLease = null;
  try {
    const { SalesOrder, StockMovement } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

    const salesOrder = await SalesOrder.findById(id).lean();
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }
    if (salesOrder.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        code: 'ONLY_PENDING_ORDER_CAN_EXPIRE',
        message: 'Only Pending Sales Orders can be expired. Cancel a reserved order through the normal status action so stock is released safely.'
      });
    }
    if (salesOrder.isExpired) {
      return res.status(400).json({
        success: false,
        message: "Order is already expired"
      });
    }
    if (await hasOutstandingReservations(StockMovement, salesOrder)) {
      return res.status(409).json({
        success: false,
        code: 'PENDING_ORDER_HAS_STOCK_RESERVATION',
        message: 'This Pending order has reservation movements. Retry confirmation or cancel/reject it through the normal status action so stock is released.'
      });
    }

    const expiredAt = new Date();
    const expiryReason = String(reason || 'Manually expired').trim();
    const expiredOrder = await SalesOrder.findOneAndUpdate(
      { _id: id, status: 'Pending', isExpired: { $ne: true } },
      {
        $set: {
          isExpired: true,
          expiredAt,
          status: 'Expired',
          stockAvailable: false,
          remarks: `${salesOrder.remarks || ''} [EXPIRED: ${expiryReason}]`.trim()
        },
        $push: {
          expiryHistory: {
            action: 'expired',
            previousDate: salesOrder.expiryDate,
            newDate: expiredAt,
            reason: expiryReason,
            performedBy: req.user._id,
            performedAt: expiredAt
          }
        }
      },
      { new: true, runValidators: true }
    );

    if (!expiredOrder) {
      return res.status(409).json({
        success: false,
        code: 'SALES_ORDER_EXPIRY_CONFLICT',
        message: 'Sales Order changed while expiry was being applied. Refresh and try again.'
      });
    }

    try {
      await StockArrivalService.refreshAllPendingOrders(req.dbConnection);
    } catch (refreshError) {
      console.error('Post-expiry stock queue refresh failed (non-critical):', refreshError.message);
    }

    return res.json({
      success: true,
      message: 'Order expired successfully',
      salesOrder: expiredOrder
    });
  } catch (error) {
    console.error("Expire Order Now Error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error expiring order",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release manual-expiry Sales Order lease:', releaseError.message);
      }
    }
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
  let orderLease = null;
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { reason } = req.body;
    const { id } = req.params;

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

    const salesOrder = await SalesOrder.findById(id);
    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found"
      });
    }

    if (salesOrder.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        code: 'ONLY_PENDING_ORDER_CAN_CANCEL_EXPIRY',
        message: 'Expiry can only be cancelled while the Sales Order is Pending.'
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
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : "Error cancelling expiry",
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release cancel-expiry Sales Order lease:', releaseError.message);
      }
    }
  }
};

// @desc    Approve credit overlimit order
// @route   PATCH /api/sales-orders/:id/approve-credit-overlimit
// @access  Private (Super Admin only)
export const approveCreditOverlimit = async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin can approve credit overlimit orders'
    });
  }

  const session = await req.dbConnection.startSession();
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    const { approvalNotes } = req.body;
    let approvedOrder;
    let noLongerOverlimit = false;

    await session.withTransaction(async () => {
      const salesOrder = await SalesOrder.findById(req.params.id).session(session);
      if (!salesOrder) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }
      const hasValidApprovalLifecycle = salesOrder.status === 'Pending'
        && salesOrder.creditOverlimit?.isOverlimit === true
        && salesOrder.creditOverlimit?.requiresApproval === true
        && !salesOrder.creditOverlimit?.approvedBy
        && !salesOrder.creditOverlimit?.rejectedBy;
      if (!hasValidApprovalLifecycle) {
        const error = new Error('Credit-overlimit approval is no longer pending for this Sales Order');
        error.statusCode = 409;
        error.code = 'CREDIT_OVERLIMIT_LIFECYCLE_CONFLICT';
        throw error;
      }

      await acquireDealerCreditLock(req.dbConnection, salesOrder.dealer, session);
      const exposure = await getDealerCreditExposure(req.dbConnection, salesOrder.dealer, {
        excludeSalesOrderId: salesOrder._id,
        session
      });
      if (!exposure.limitConfigured) {
        const error = new Error('Dealer credit limit is not configured. Update Dealer Master before approval.');
        error.statusCode = 400;
        error.code = 'DEALER_CREDIT_LIMIT_REQUIRED';
        throw error;
      }
      if (exposure.overdueAmount > 0) {
        const error = new Error(exposure.blockReason);
        error.statusCode = 400;
        error.code = 'DEALER_PAYMENT_OVERDUE';
        throw error;
      }

      const orderAmount = calculateSalesOrderCreditAmount(salesOrder.products || []);
      salesOrder.creditAmount = orderAmount;
      const refreshedSnapshot = buildCreditOverlimitSnapshot(exposure, orderAmount);
      noLongerOverlimit = !refreshedSnapshot.isOverlimit;
      const existingHistory = salesOrder.creditOverlimit?.history?.map((entry) => (
        entry.toObject ? entry.toObject() : entry
      )) || [];
      const decisionAt = new Date();
      salesOrder.creditOverlimit = {
        ...refreshedSnapshot,
        requiresApproval: false,
        approvedBy: refreshedSnapshot.isOverlimit ? req.user._id : null,
        approvedAt: refreshedSnapshot.isOverlimit ? decisionAt : null,
        approvalNotes: refreshedSnapshot.isOverlimit
          ? (approvalNotes || 'Credit overlimit approved')
          : 'Credit exposure recalculated within limit; approval no longer required.',
        history: [
          ...existingHistory,
          {
            action: refreshedSnapshot.isOverlimit ? 'approved' : 'recalculated',
            creditLimit: refreshedSnapshot.creditLimit,
            currentOutstanding: refreshedSnapshot.currentOutstanding,
            orderAmount: refreshedSnapshot.orderAmount,
            newOutstanding: refreshedSnapshot.newOutstanding,
            overlimitAmount: refreshedSnapshot.overlimitAmount,
            performedBy: req.user._id,
            performedAt: decisionAt,
            notes: refreshedSnapshot.isOverlimit
              ? (approvalNotes || 'Credit overlimit approved')
              : 'Live exposure moved within limit.'
          }
        ]
      };
      await salesOrder.save({ session });
      approvedOrder = salesOrder;
    });

    return res.json({
      success: true,
      message: noLongerOverlimit
        ? 'Live exposure is now within the dealer credit limit. Approval is no longer required.'
        : 'Credit overlimit approved successfully. Order remains Pending - please confirm manually to proceed.',
      salesOrder: approvedOrder
    });
  } catch (error) {
    console.error('Approve Credit Overlimit Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Error approving credit overlimit',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    await session.endSession();
  }
};

// @desc    Reject a pending credit-overlimit request with an immutable reason
// @route   PATCH /api/sales-orders/:id/reject-credit-overlimit
// @access  Private (Super Admin only)
export const rejectCreditOverlimit = async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin can reject credit overlimit orders'
    });
  }

  const rejectionReason = String(req.body.rejectionReason || req.body.reason || '').trim();
  if (!rejectionReason) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required'
    });
  }

  const session = await req.dbConnection.startSession();
  try {
    const { SalesOrder } = getModels(req.dbConnection);
    let rejectedOrder;

    await session.withTransaction(async () => {
      const salesOrder = await SalesOrder.findById(req.params.id).session(session);
      if (!salesOrder) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }

      await acquireDealerCreditLock(req.dbConnection, salesOrder.dealer, session);

      const lifecycleFilter = {
        _id: salesOrder._id,
        status: 'Pending',
        'creditOverlimit.isOverlimit': true,
        'creditOverlimit.requiresApproval': true,
        'creditOverlimit.approvedBy': null,
        'creditOverlimit.rejectedBy': null
      };
      const rejectedAt = new Date();
      const existingHistory = salesOrder.creditOverlimit?.history?.map((entry) => (
        entry.toObject ? entry.toObject() : entry
      )) || [];
      const rejectionEvent = {
        action: 'rejected',
        creditLimit: salesOrder.creditOverlimit?.creditLimit,
        currentOutstanding: salesOrder.creditOverlimit?.currentOutstanding,
        orderAmount: salesOrder.creditOverlimit?.orderAmount,
        newOutstanding: salesOrder.creditOverlimit?.newOutstanding,
        overlimitAmount: salesOrder.creditOverlimit?.overlimitAmount,
        performedBy: req.user._id,
        performedAt: rejectedAt,
        notes: rejectionReason
      };

      rejectedOrder = await SalesOrder.findOneAndUpdate(
        lifecycleFilter,
        {
          $set: {
            status: 'Rejected',
            remarks: rejectionReason,
            'creditOverlimit.requiresApproval': false,
            'creditOverlimit.rejectedBy': req.user._id,
            'creditOverlimit.rejectedAt': rejectedAt,
            'creditOverlimit.rejectionReason': rejectionReason,
            'creditOverlimit.history': [...existingHistory, rejectionEvent]
          }
        },
        { new: true, session, runValidators: true }
      );

      if (!rejectedOrder) {
        const error = new Error('Credit-overlimit rejection is no longer pending for this Sales Order');
        error.statusCode = 409;
        error.code = 'CREDIT_OVERLIMIT_LIFECYCLE_CONFLICT';
        throw error;
      }
    });

    return res.json({
      success: true,
      message: 'Credit-overlimit request rejected and Sales Order marked Rejected.',
      salesOrder: rejectedOrder
    });
  } catch (error) {
    console.error('Reject Credit Overlimit Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code,
      message: error.statusCode ? error.message : 'Error rejecting credit overlimit',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    await session.endSession();
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
    const { SalesOrder, StockMovement } = getModels(req.dbConnection);
    const now = new Date();

    // Find all orders with expiry date in the past that are not yet expired
    const ordersToExpire = await SalesOrder.find({
      expiryDate: { $lt: now },
      isExpired: false,
      status: { $in: ["Pending"] } // Only expire pending orders
    });

    let expiredCount = 0;

    for (const order of ordersToExpire) {
      let orderLease = null;
      try {
        orderLease = await StockMovementService.acquireStockLeases(
          req.dbConnection,
          [`SALES_ORDER:${order._id}`]
        );

        if (await hasOutstandingReservations(StockMovement, order)) {
          console.warn(`Skipping expiry for ${order.orderNumber}: unresolved stock reservation exists.`);
          continue;
        }

        const expiredOrder = await SalesOrder.findOneAndUpdate(
          {
            _id: order._id,
            expiryDate: { $lt: now },
            isExpired: false,
            status: 'Pending'
          },
          {
            $set: {
              isExpired: true,
              expiredAt: now,
              status: 'Expired',
              stockAvailable: false
            },
            $push: {
              expiryHistory: {
                action: 'expired',
                previousDate: order.expiryDate,
                newDate: null,
                reason: 'Order automatically expired after deadline passed',
                performedBy: null,
                performedAt: now
              }
            }
          },
          { new: true, runValidators: true }
        );
        if (expiredOrder) expiredCount++;
      } finally {
        if (orderLease) {
          try {
            await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
          } catch (releaseError) {
            console.error('Failed to release auto-expiry Sales Order lease:', releaseError.message);
          }
        }
      }
    }

    console.log(`✅ Auto-expired ${expiredCount} orders`);

    if (expiredCount > 0) {
      try {
        await StockArrivalService.refreshAllPendingOrders(req.dbConnection);
      } catch (refreshError) {
        console.error('Auto-expiry stock queue refresh failed (non-critical):', refreshError.message);
      }
    }

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
  let orderLease = null;
  let stockLease = null;
  class PartialDispatchHttpError extends Error {
    constructor(status, payload) {
      super(payload.message);
      this.name = 'PartialDispatchHttpError';
      this.status = status;
      this.payload = payload;
    }
  }

  try {
    const { SalesOrder, DealerInvoice, StockMovement } = getModels(req.dbConnection);
    const { id } = req.params;
    const { products, action } = req.body;
    // products: [{ productId, newQty, reason }]
    // action: 'new_order' | 'deviation'

    orderLease = await StockMovementService.acquireStockLeases(
      req.dbConnection,
      [`SALES_ORDER:${id}`]
    );

    const leaseSource = await SalesOrder.findById(id)
      .select('products.product products.warehouse')
      .lean();
    if (leaseSource) {
      stockLease = await StockMovementService.acquireStockLeases(
        req.dbConnection,
        (leaseSource.products || [])
          .filter((line) => line.product && line.warehouse)
          .map((line) => StockMovementService.stockKey(line.product, line.warehouse))
      );
    }

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

    await acquireDealerCreditLock(req.dbConnection, salesOrder.dealer, session);
    const outsideCreditExposure = await getDealerCreditExposure(
      req.dbConnection,
      salesOrder.dealer,
      { excludeSalesOrderId: salesOrder._id, session }
    );
    if (!outsideCreditExposure.limitConfigured) {
      return fail(400, {
        success: false,
        code: 'DEALER_CREDIT_LIMIT_REQUIRED',
        message: 'Dealer credit limit is not configured. Update Dealer Master before partial dispatch.'
      });
    }
    const previousCreditAmount = calculateSalesOrderCreditAmount(salesOrder.products || []);
    const previousCreditOverlimit = salesOrder.creditOverlimit?.toObject
      ? salesOrder.creditOverlimit.toObject()
      : { ...(salesOrder.creditOverlimit || {}) };
    const previousCreditHistory = previousCreditOverlimit.history?.map((entry) => (
      entry.toObject ? entry.toObject() : entry
    )) || [];

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

    await StockMovementService.acquireStockLocks(
      req.dbConnection,
      dispatchPlans
        .filter(({ orderProduct }) => orderProduct.warehouse)
        .map(({ orderProduct }) => StockMovementService.stockKey(
          orderProduct.product,
          orderProduct.warehouse
        )),
      session
    );

    const deviations = [];
    const remainingProducts = []; // for new order

    for (const { update, orderProduct, newQty, sourceLineId } of dispatchPlans) {
      const originalQty = orderProduct.quantity;
      const originalLine = orderProduct.toObject();
      const effectiveDiscountPercentage = getPersistedEffectiveDiscountPercentage(originalLine);
      const reducedQty = originalQty - newQty;

      // Unblock the reduced qty from stock (for qty=0 this unblocks the full original qty)
      if (orderProduct.warehouse) {
        await StockMovementService.appendMovements([{
          productId: orderProduct.product,
          warehouseId: orderProduct.warehouse,
          type: 'IN',
          quantity: reducedQty,
          referenceNo: salesOrder.orderNumber,
          referenceType: 'SALE',
          operationKey: `SO:${salesOrder._id}:PARTIAL_RELEASE:${orderProduct._id}:${originalQty}:${newQty}`,
          movementRole: 'RESERVATION_RELEASE',
          salesOrder: salesOrder._id,
          salesOrderLine: orderProduct._id,
          date: new Date(),
          remarks: newQty === 0
            ? `Stock Fully Unblocked - Order ${salesOrder.orderNumber} (product skipped in dispatch)`
            : `Stock Unblocked - Order ${salesOrder.orderNumber} Partial Dispatch (${originalQty} → ${newQty})`,
          createdBy: req.user._id
        }], {
          dbConnection: req.dbConnection,
          session,
          locksAcquired: true
        });
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
    const retainedCreditAmount = calculateSalesOrderCreditAmount(salesOrder.products || []);
    salesOrder.creditAmount = retainedCreditAmount;

    const retainedCreditSnapshot = buildCreditOverlimitSnapshot(
      outsideCreditExposure,
      retainedCreditAmount
    );
    const recalculatedAt = new Date();
    salesOrder.creditOverlimit = {
      ...previousCreditOverlimit,
      ...retainedCreditSnapshot,
      // This order is already Confirmed and partial dispatch only reduces it.
      // Keep any historical approval and never create a retroactive approval request.
      requiresApproval: false,
      history: [
        ...previousCreditHistory,
        {
          action: 'recalculated',
          creditLimit: retainedCreditSnapshot.creditLimit,
          currentOutstanding: retainedCreditSnapshot.currentOutstanding,
          orderAmount: retainedCreditSnapshot.orderAmount,
          newOutstanding: retainedCreditSnapshot.newOutstanding,
          overlimitAmount: retainedCreditSnapshot.overlimitAmount,
          performedBy: req.user._id,
          performedAt: recalculatedAt,
          notes: `Partial dispatch reduced confirmed order credit exposure from ₹${previousCreditAmount.toLocaleString('en-IN')} to ₹${retainedCreditAmount.toLocaleString('en-IN')}.`
        }
      ]
    };

    // Recalculate order totals (pre-save hook will do this, but mark modified)
    salesOrder.markModified('products');
    await salesOrder.save({ session });

    let newOrder = null;
    if (action === 'new_order' && remainingProducts.length > 0) {
      const orderNumber = await generateOrderNumber(req.dbConnection, session);
      const remainderCreditAmount = calculateSalesOrderCreditAmount(remainingProducts);
      // Pending remainder exposure starts after outside exposure plus the retained
      // Confirmed source order, matching the normal creation basis.
      const remainderExposureBasis = {
        ...outsideCreditExposure,
        totalExposure: Number(outsideCreditExposure.totalExposure || 0) + retainedCreditAmount
      };
      const remainderSnapshot = buildCreditOverlimitSnapshot(
        remainderExposureBasis,
        remainderCreditAmount
      );
      const remainderRequestedAt = new Date();
      const remainderCreditOverlimit = {
        ...remainderSnapshot,
        approvedBy: null,
        approvedAt: null,
        approvalNotes: null,
        history: remainderSnapshot.isOverlimit ? [{
          action: 'requested',
          creditLimit: remainderSnapshot.creditLimit,
          currentOutstanding: remainderSnapshot.currentOutstanding,
          orderAmount: remainderSnapshot.orderAmount,
          newOutstanding: remainderSnapshot.newOutstanding,
          overlimitAmount: remainderSnapshot.overlimitAmount,
          performedBy: req.user._id,
          performedAt: remainderRequestedAt,
          notes: `Credit approval requested for partial-dispatch remainder of ${salesOrder.orderNumber}.`
        }] : []
      };
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
        stockKeys: dispatchPlans
          .filter(({ orderProduct }) => orderProduct.warehouse)
          .map(({ orderProduct }) => ({
            productId: orderProduct.product,
            warehouseId: orderProduct.warehouse
          })),
        newOrder: newOrder ? { orderNumber: newOrder.orderNumber, _id: newOrder._id } : null
      };
    });

    try {
      await StockArrivalService.refreshStockKeys(transactionResult.stockKeys, req.dbConnection);
    } catch (refreshError) {
      console.error('Partial-dispatch stock queue refresh failed:', refreshError.message);
    }

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
    if (stockLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, stockLease);
      } catch (releaseError) {
        console.error('Failed to release partial-dispatch stock lease:', releaseError.message);
      }
    }
    if (orderLease) {
      try {
        await StockMovementService.releaseStockLeases(req.dbConnection, orderLease);
      } catch (releaseError) {
        console.error('Failed to release partial-dispatch Sales Order lease:', releaseError.message);
      }
    }
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
      const literalSearch = String(search)
        .trim()
        .slice(0, 100)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        ...(literalSearch ? [
          { orderNumber: { $regex: literalSearch, $options: 'i' } },
          { dealerName: { $regex: literalSearch, $options: 'i' } },
        ] : []),
        ...buildProductSearchConditions(search, ['deviations.productName']),
      ];

      if (query.$or.length === 0) delete query.$or;
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


