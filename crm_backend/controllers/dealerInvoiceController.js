import mongoose from 'mongoose';
import { dealerInvoiceSchema } from "../models/DealerInvoice.js";
import { salesOrderSchema } from "../models/SalesOrder.js";
import { dealerSchema } from "../models/Dealer.js";
import { productSchema } from "../models/Product.js";
import { discountMappingSchema } from "../models/DiscountMapping.js";
import { pointsSchema } from "../models/Points.js";
import { stockMovementSchema } from "../models/Stock.js";
import { dealerLedgerSchema } from "../models/DealerLedger.js";
import { notificationSchema } from "../models/Notification.js";
import { paymentAllocationSchema } from "../models/PaymentAllocation.js";
import { dealerPaymentSchema } from "../models/DealerPayment.js";
import { voucherSchema } from "../models/Voucher.js";
import { userSchema } from "../models/User.js";
import { regionSchema } from "../models/Region.js";
import { warehouseSchema } from "../models/Warehouse.js";
import { sendPushNotification } from '../services/firebaseNotificationService.js';
import StockMovementService from '../services/stockMovementService.js';
import StockArrivalService from '../services/stockArrivalService.js';
import { assertPeriodOpen, handlePeriodLockError } from '../services/periodLockService.js';
import { recordUpdate, recordCancel } from '../services/auditTrailService.js';
import { createDealerInvoiceEntry, reverseDealerInvoiceEntry } from '../services/accountingService.js';
import { userHasPermission } from '../middleware/routePermissions.js';
import {
  acquireDealerCreditLock,
  evaluateDealerCredit,
  getDealerCreditExposure
} from '../services/dealerCreditService.js';
import {
  calculateDiscountLine,
  calculateOneTimeInvoicePriceIncrease,
  normalizeRateMap,
  resolveDealerExtraDiscountBySpecificity
} from '../utils/sequentialDiscountPolicy.js';

// Helper function to get models from company-specific connection
const getModels = (dbConnection) => {
  return {
    DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
    Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
    Product: dbConnection.models.Product || dbConnection.model('Product', productSchema),
    DiscountMapping: dbConnection.models.DiscountMapping || dbConnection.model('DiscountMapping', discountMappingSchema),
    Points: dbConnection.models.Points || dbConnection.model('Points', pointsSchema),
    StockMovement: dbConnection.models.StockMovement || dbConnection.model('StockMovement', stockMovementSchema),
    DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
    Notification: dbConnection.models.Notification || dbConnection.model('Notification', notificationSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
    DealerPayment: dbConnection.models.DealerPayment || dbConnection.model('DealerPayment', dealerPaymentSchema),
    Voucher: dbConnection.models.Voucher || dbConnection.model('Voucher', voucherSchema),
    User: dbConnection.models.User || dbConnection.model('User', userSchema),
    Region: dbConnection.models.Region || dbConnection.model('Region', regionSchema),
    Warehouse: dbConnection.models.Warehouse || dbConnection.model('Warehouse', warehouseSchema),
  };
};

const createDiscountPolicyError = (message, code) => {
  const error = new Error(message);
  error.name = 'DiscountPolicyError';
  error.code = code;
  return error;
};

const objectIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const findExistingInvoiceItem = (existingItems, submittedItem, submittedIndex) => {
  if (!Array.isArray(existingItems) || existingItems.length === 0) return null;

  const submittedProductId = objectIdString(
    submittedItem?.product?._id || submittedItem?.product || submittedItem?.productId
  );
  const hasSameProduct = (item) => {
    const existingProductId = objectIdString(item?.product?._id || item?.product);
    return Boolean(submittedProductId) && existingProductId === submittedProductId;
  };
  const submittedLineId = objectIdString(
    submittedItem?.sourceSalesOrderLineId || submittedItem?._id
  );
  if (submittedLineId) {
    const identityMatch = existingItems.find((item) => {
      const existingLineId = objectIdString(item?.sourceSalesOrderLineId || item?._id);
      return existingLineId && existingLineId === submittedLineId;
    });
    // A stable line ID is not sufficient on its own: never let a replacement
    // product inherit another line's increase actor/timestamp.
    if (identityMatch) return hasSameProduct(identityMatch) ? identityMatch : null;
  }

  const indexedItem = existingItems[submittedIndex];
  return indexedItem && hasSameProduct(indexedItem) ? indexedItem : null;
};

const canonicalizeOneTimePriceIncrease = ({
  submittedItem,
  existingItem,
  discountCalculation,
  gstPercentage,
  pricingInputs,
  actor,
  actorId
}) => {
  const hasSubmittedPercentage = hasOwn(submittedItem, 'oneTimePriceIncreasePercentage');
  const requestedPercentage = hasSubmittedPercentage
    ? submittedItem.oneTimePriceIncreasePercentage
    : (existingItem?.oneTimePriceIncreasePercentage || 0);
  const hasSubmittedReason = hasOwn(submittedItem, 'oneTimePriceIncreaseReason');
  const existingReason = String(existingItem?.oneTimePriceIncreaseReason || '').trim();
  const reason = String(
    hasSubmittedReason
      ? (submittedItem.oneTimePriceIncreaseReason || '')
      : existingReason
  ).trim();
  const existingOverride = Boolean(existingItem?.oneTimePriceIncreaseAboveMrpOverride);
  const hasSubmittedOverride = hasOwn(submittedItem, 'oneTimePriceIncreaseAboveMrpOverride');
  if (hasSubmittedOverride
      && typeof submittedItem.oneTimePriceIncreaseAboveMrpOverride !== 'boolean') {
    throw createDiscountPolicyError(
      'oneTimePriceIncreaseAboveMrpOverride must be a Boolean value.',
      'INVALID_MRP_OVERRIDE_FLAG'
    );
  }
  const requestedOverride = hasSubmittedOverride
    ? submittedItem.oneTimePriceIncreaseAboveMrpOverride
    : existingOverride;
  const actorRole = String(actor?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const actorIsSuperAdmin = actorRole === 'super_admin';
  const requestedPercentageNumber = requestedPercentage === ''
    || requestedPercentage === null
    || requestedPercentage === undefined
    ? 0
    : Number(requestedPercentage);
  const existingPercentage = Number(existingItem?.oneTimePriceIncreasePercentage || 0);
  const percentageIsUnchanged = Boolean(existingItem)
    && Number.isFinite(requestedPercentageNumber)
    && Math.abs(existingPercentage - requestedPercentageNumber) <= 0.000001;
  const reasonIsUnchanged = Boolean(existingItem) && reason === existingReason;
  const currentPriceBeforeIncrease = Number(discountCalculation.finalAmount);
  const existingPriceBeforeIncrease = Number(existingItem?.priceBeforeIncrease);
  const priceBeforeIncreaseIsUnchanged = Boolean(existingItem)
    && Number.isFinite(existingPriceBeforeIncrease)
    && Math.abs(existingPriceBeforeIncrease - currentPriceBeforeIncrease) <= 0.000001;
  const existingMrpPerUnit = Number(existingItem?.mrp) > 0
    ? Number(existingItem.mrp)
    : Number(existingItem?.unitPrice || 0) * (1 + Number(existingItem?.gst || 0) / 100);
  const currentQuantity = Number(pricingInputs?.quantity);
  const currentMrpPerUnit = Number(pricingInputs?.mrpPerUnit);
  const currentUnitPrice = Number(pricingInputs?.unitPrice);
  const currentGstPercentage = Number(pricingInputs?.gstPercentage);
  const quantityIsUnchanged = Boolean(existingItem)
    && Number.isFinite(currentQuantity)
    && Math.abs(Number(existingItem.quantity || 0) - currentQuantity) <= 0.000001;
  const mrpIsUnchanged = Boolean(existingItem)
    && Number.isFinite(currentMrpPerUnit)
    && Math.abs(existingMrpPerUnit - currentMrpPerUnit) <= 0.000001;
  const unitPriceIsUnchanged = Boolean(existingItem)
    && Number.isFinite(currentUnitPrice)
    && Math.abs(Number(existingItem.unitPrice || 0) - currentUnitPrice) <= 0.000001;
  const gstIsUnchanged = Boolean(existingItem)
    && Number.isFinite(currentGstPercentage)
    && Math.abs(Number(existingItem.gst || 0) - currentGstPercentage) <= 0.000001;
  const existingGrossAmount = Number(existingItem?.quantity || 0) * existingMrpPerUnit;
  const grossAmountIsUnchanged = Boolean(existingItem)
    && Number(existingGrossAmount.toFixed(2))
      === Number(Number(discountCalculation.grossAmount || 0).toFixed(2));
  const stageSignature = (stages = []) => JSON.stringify(stages.map((stage) => ({
    key: stage?.key || null,
    kind: stage?.kind || null,
    levelName: stage?.levelName || null,
    ratePercentage: Number(Number(stage?.ratePercentage || 0).toFixed(6))
  })));
  const existingOrderedStages = existingItem?.discountPolicySnapshot?.orderedStages;
  const stagesAreUnchanged = !Array.isArray(existingOrderedStages)
    || stageSignature(existingOrderedStages) === stageSignature(pricingInputs?.stages || []);
  const protectedPricingInputsAreUnchanged = Boolean(existingItem)
    && quantityIsUnchanged
    && mrpIsUnchanged
    && unitPriceIsUnchanged
    && gstIsUnchanged
    && priceBeforeIncreaseIsUnchanged
    && grossAmountIsUnchanged
    && stagesAreUnchanged;
  const requestedOverrideStateChanged = requestedOverride !== existingOverride;
  const protectedOverrideInputsChanged = (requestedOverride || existingOverride)
    && (!percentageIsUnchanged
      || !reasonIsUnchanged
      || !protectedPricingInputsAreUnchanged);

  if (!actorIsSuperAdmin && (requestedOverrideStateChanged || protectedOverrideInputsChanged)) {
    throw createDiscountPolicyError(
      'Only a Super Admin may enable, disable, or change pricing inputs for an above-MRP invoice override.',
      'MRP_OVERRIDE_FORBIDDEN'
    );
  }

  const maximumFinalAmount = requestedOverride
    ? null
    : Number(discountCalculation.grossAmount || 0);
  const increase = calculateOneTimeInvoicePriceIncrease({
    priceBeforeIncrease: discountCalculation.finalAmount,
    increasePercentage: requestedPercentage,
    gstPercentage,
    maximumFinalAmount
  });
  const roundedGrossAmount = Number(Number(discountCalculation.grossAmount || 0).toFixed(2));
  const effectiveOverride = requestedOverride
    && increase.oneTimePriceIncreasePercentage > 0
    && increase.finalAmount > roundedGrossAmount;

  if (!actorIsSuperAdmin && effectiveOverride !== existingOverride) {
    throw createDiscountPolicyError(
      'Only a Super Admin may change the effective above-MRP invoice override state.',
      'MRP_OVERRIDE_FORBIDDEN'
    );
  }

  if (increase.oneTimePriceIncreasePercentage > 0 && !reason) {
    throw createDiscountPolicyError(
      'A reason is required when applying a one-time invoice price increase.',
      'ONE_TIME_PRICE_INCREASE_REASON_REQUIRED'
    );
  }

  if (increase.oneTimePriceIncreasePercentage <= 0) {
    return {
      ...increase,
      oneTimePriceIncreaseAboveMrpOverride: false,
      oneTimePriceIncreaseReason: null,
      oneTimePriceIncreaseAppliedBy: null,
      oneTimePriceIncreaseAppliedAt: null
    };
  }

  const effectiveOverrideIsUnchanged = Boolean(existingItem)
    && effectiveOverride === existingOverride;
  const auditIsUnchanged = percentageIsUnchanged
    && reasonIsUnchanged
    && protectedPricingInputsAreUnchanged
    && effectiveOverrideIsUnchanged;
  const authenticatedActorId = actor?._id || actorId || null;

  return {
    ...increase,
    oneTimePriceIncreaseAboveMrpOverride: effectiveOverride,
    oneTimePriceIncreaseReason: reason,
    oneTimePriceIncreaseAppliedBy: auditIsUnchanged
      ? (existingItem.oneTimePriceIncreaseAppliedBy || authenticatedActorId)
      : authenticatedActorId,
    oneTimePriceIncreaseAppliedAt: auditIsUnchanged
      ? (existingItem.oneTimePriceIncreaseAppliedAt || new Date())
      : new Date()
  };
};

const resolveAndValidateDealerExtraDiscount = ({ submittedItem, dealer, product }) => {
  const configuredRate = resolveDealerExtraDiscountBySpecificity(dealer, product);
  if (hasOwn(submittedItem, 'dealerExtraDiscount')) {
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

const normalizeComparableLevels = (levels) => JSON.stringify([...(levels || [])].map(String).sort());
const normalizeComparableRates = (rates) => JSON.stringify(
  Object.entries(normalizeRateMap(rates)).sort(([left], [right]) => left.localeCompare(right))
);

const getInvoiceMrpPerUnit = (item, gstPercentage, sourceLine = null) => {
  // Sales Order unitPrice is already GST-inclusive MRP. It is the trusted base
  // for linked lines and must never be grossed up again.
  if (sourceLine) return Number(sourceLine.unitPrice || 0);
  const mrp = Number(item.mrp);
  if (Number.isFinite(mrp) && mrp > 0) return mrp;
  return Number(item.unitPrice || 0) * (1 + Number(gstPercentage || 0) / 100);
};

const getInvoiceReferenceUnitPrice = (item, mrpPerUnit, gstPercentage, sourceLine = null) => {
  if (!sourceLine) return Number(item.unitPrice || 0);
  const divisor = 1 + Number(gstPercentage || 0) / 100;
  return divisor > 0 ? Number((mrpPerUnit / divisor).toFixed(6)) : mrpPerUnit;
};

const buildSalesOrderLineMatcher = (sourceLines = []) => {
  const unusedIndexes = new Set(sourceLines.map((_, index) => index));
  const productLineCounts = sourceLines.reduce((counts, line) => {
    const productId = objectIdString(line.product);
    counts.set(productId, (counts.get(productId) || 0) + 1);
    return counts;
  }, new Map());

  return (submittedItem) => {
    const submittedProductId = objectIdString(
      submittedItem.product?._id || submittedItem.product || submittedItem.productId
    );
    const submittedSourceLineId = objectIdString(
      submittedItem.sourceSalesOrderLineId || submittedItem.salesOrderLineId
    );

    if (submittedSourceLineId) {
      const matchedIndex = sourceLines.findIndex((line) => (
        objectIdString(line._id) === submittedSourceLineId
      ));
      if (matchedIndex < 0) {
        throw createDiscountPolicyError(
          `sourceSalesOrderLineId ${submittedSourceLineId} does not exist on the linked sales order.`,
          'SALES_ORDER_LINE_NOT_FOUND'
        );
      }
      if (!unusedIndexes.has(matchedIndex)) {
        throw createDiscountPolicyError(
          `sourceSalesOrderLineId ${submittedSourceLineId} was submitted more than once.`,
          'DUPLICATE_SALES_ORDER_LINE_ID'
        );
      }
      if (objectIdString(sourceLines[matchedIndex].product) !== submittedProductId) {
        throw createDiscountPolicyError(
          `sourceSalesOrderLineId ${submittedSourceLineId} does not belong to the submitted product.`,
          'SALES_ORDER_LINE_PRODUCT_MISMATCH'
        );
      }
      unusedIndexes.delete(matchedIndex);
      return sourceLines[matchedIndex];
    }

    if ((productLineCounts.get(submittedProductId) || 0) > 1) {
      throw createDiscountPolicyError(
        'sourceSalesOrderLineId is required for duplicate product lines on a linked sales order.',
        'SOURCE_SALES_ORDER_LINE_ID_REQUIRED'
      );
    }

    const matchedIndex = sourceLines.findIndex((line, index) => (
      unusedIndexes.has(index) && objectIdString(line.product) === submittedProductId
    ));
    if (matchedIndex < 0) return null;
    unusedIndexes.delete(matchedIndex);
    return sourceLines[matchedIndex];
  };
};

const getSubmittedOrSource = (submittedItem, sourceLine, field, fallback) => (
  hasOwn(submittedItem, field) ? submittedItem[field] : (sourceLine?.[field] ?? fallback)
);

const haveDiscountDrivingFieldsChanged = (submittedItem, sourceLine) => {
  const dealerExtra = getSubmittedOrSource(submittedItem, sourceLine, 'dealerExtraDiscount', 0);
  const promisedTarget = getSubmittedOrSource(
    submittedItem,
    sourceLine,
    'promisedEffectiveDiscountPercentage',
    null
  );

  return Math.abs(Number(dealerExtra || 0) - Number(sourceLine.dealerExtraDiscount || 0)) > 0.01
    || Number(promisedTarget ?? -1) !== Number(sourceLine.promisedEffectiveDiscountPercentage ?? -1);
};

const sourceAppliedDiscounts = (sourceLine) => {
  if (Array.isArray(sourceLine.appliedDiscounts)) return sourceLine.appliedDiscounts;
  const appliedDiscount = sourceLine.appliedDiscount;
  if (!appliedDiscount?.discountId) return [];
  return [{
    discountId: appliedDiscount.discountId,
    discountName: appliedDiscount.discountName,
    discountValue: Number(appliedDiscount.directDiscountPercentage || 0),
    discountType: appliedDiscount.discountType,
    directDiscountPercentage: Number(appliedDiscount.directDiscountPercentage || 0),
    levels: appliedDiscount.levels || [],
    targetType: appliedDiscount.targetType,
    maxDiscountPercentage: appliedDiscount.maxDiscountPercentage,
    masterDiscountCap: appliedDiscount.masterDiscountCap ?? null,
    combinedLevelDiscountCap: appliedDiscount.combinedLevelDiscountCap
      ?? appliedDiscount.maxDiscountPercentage
      ?? null
  }];
};

const canonicalizeInvoiceItems = async ({
  items,
  dealer,
  dbConnection,
  actorId,
  salesOrderId,
  existingItems = [],
  session = null
}) => {
  const { Product, DiscountMapping, User, SalesOrder } = getModels(dbConnection);
  const applySession = (query) => session ? query.session(session) : query;
  const submittedLineIdentities = new Set();
  for (const submittedItem of items || []) {
    const submittedLineIdentity = objectIdString(
      submittedItem?.sourceSalesOrderLineId || submittedItem?._id
    );
    if (!submittedLineIdentity) continue;
    if (submittedLineIdentities.has(submittedLineIdentity)) {
      throw createDiscountPolicyError(
        `Invoice line identity ${submittedLineIdentity} was submitted more than once.`,
        'DUPLICATE_INVOICE_LINE_ID'
      );
    }
    submittedLineIdentities.add(submittedLineIdentity);
  }
  let linkedSalesOrder = null;
  let matchSourceLine = null;
  const matchedExistingItemIdentities = new Set();

  if (salesOrderId) {
    linkedSalesOrder = await applySession(SalesOrder.findById(salesOrderId)).lean();
    if (!linkedSalesOrder) {
      throw createDiscountPolicyError('The linked sales order no longer exists.', 'SALES_ORDER_NOT_FOUND');
    }
    if (objectIdString(linkedSalesOrder.dealer) !== objectIdString(dealer?._id)) {
      throw createDiscountPolicyError(
        'The linked sales order belongs to a different dealer.',
        'SALES_ORDER_DEALER_MISMATCH'
      );
    }
    matchSourceLine = buildSalesOrderLineMatcher(linkedSalesOrder.products || []);
  }

  let liveActorContextPromise = null;
  const getLiveActorContext = () => {
    if (!liveActorContextPromise) {
      liveActorContextPromise = (async () => {
        const actor = actorId
          ? await applySession(
            User.findById(actorId)
              .select('role allowedDiscountLevels')
          ).lean()
          : null;
        const enforceLevelPermissions = true;
        return {
          actor,
          enforceLevelPermissions,
          bypassLevelPermission: false,
          allowedDiscountLevels: actor?.allowedDiscountLevels || []
        };
      })();
    }
    return liveActorContextPromise;
  };

  const canonicalizeItem = async (submittedItem, submittedIndex) => {
    const productId = submittedItem.product?._id || submittedItem.product || submittedItem.productId;
    const existingItem = findExistingInvoiceItem(existingItems, submittedItem, submittedIndex);
    if (existingItem) {
      const existingItemIdentity = objectIdString(
        existingItem.sourceSalesOrderLineId || existingItem._id
      );
      if (existingItemIdentity && matchedExistingItemIdentities.has(existingItemIdentity)) {
        throw createDiscountPolicyError(
          `Existing invoice line ${existingItemIdentity} was matched more than once.`,
          'DUPLICATE_INVOICE_LINE_ID'
        );
      }
      if (existingItemIdentity) matchedExistingItemIdentities.add(existingItemIdentity);
    }
    const product = await applySession(
      Product.findById(productId)
        .select('itemName productCode HSNCode brand category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5 gst')
    ).lean();
    if (!product) {
      throw createDiscountPolicyError(
        `Product not found for invoice line ${submittedItem.productName || productId}`,
        'PRODUCT_NOT_FOUND'
      );
    }

    const sourceLine = matchSourceLine ? matchSourceLine(submittedItem, submittedIndex) : null;
    if (linkedSalesOrder && !sourceLine) {
      throw createDiscountPolicyError(
        `Invoice line ${submittedItem.productName || product.itemName} could not be matched to an unused line in sales order ${linkedSalesOrder.orderNumber}.`,
        'SALES_ORDER_LINE_NOT_FOUND'
      );
    }

    if (sourceLine) {
      if (haveDiscountDrivingFieldsChanged(submittedItem, sourceLine)) {
        throw createDiscountPolicyError(
          `Linked invoice line ${sourceLine.productName || sourceLine._id} must keep the Sales Order dealer-extra discount and promised discount unchanged.`,
          'LINKED_SALES_ORDER_DISCOUNT_MUTATION_NOT_ALLOWED'
        );
      }

      const sourcePolicySnapshot = sourceLine.discountPolicySnapshot || null;
      const persistedOrderedStages = sourcePolicySnapshot?.orderedStages;
      const hasPersistedDiscountSignal = Number(sourceLine.discountAmount || 0) > 0
        || Number(sourceLine.discountPercentage || 0) > 0
        || Number(sourceLine.dealerExtraDiscount || 0) > 0
        || Number(sourceLine.appliedDiscount?.directDiscountPercentage || 0) > 0
        || (sourceLine.selectedDiscountLevels || []).length > 0;
      if ((!Array.isArray(persistedOrderedStages) || persistedOrderedStages.length === 0)
          && hasPersistedDiscountSignal) {
        throw createDiscountPolicyError(
          `Sales Order line ${sourceLine.productName || sourceLine._id} has a historical discount but no ordered policy snapshot. Reprice the Sales Order explicitly before creating or syncing its invoice.`,
          'SALES_ORDER_POLICY_SNAPSHOT_REQUIRED'
        );
      }

      const sourceStages = (persistedOrderedStages || []).map((stage) => ({
        key: stage.key,
        kind: stage.kind,
        levelName: stage.levelName || null,
        ratePercentage: Number(stage.ratePercentage || 0)
      }));
      const directStages = sourceStages.filter((stage) => stage.kind === 'direct');
      const dealerExtraStages = sourceStages.filter((stage) => stage.kind === 'dealer_extra');
      const mappingLevels = sourcePolicySnapshot?.levels
        || sourceLine.appliedDiscount?.levels
        || [];
      const selectedDiscountLevels = [...new Set(
        (submittedItem.selectedDiscountLevels || []).map(String)
      )];
      const manualDiscountLevels = normalizeRateMap(submittedItem.manualDiscountLevels);
      const stages = [...directStages];

      for (const levelName of selectedDiscountLevels) {
        const level = mappingLevels.find((definition) => definition.levelName === levelName);
        if (!level) {
          throw createDiscountPolicyError(
            `Discount level "${levelName}" is not available for ${sourceLine.productName || product.itemName}`,
            'DISCOUNT_LEVEL_NOT_FOUND'
          );
        }
        const configuredRate = Number(level.discountPercentage ?? level.ratePercentage ?? 0);
        const requestedRate = manualDiscountLevels[levelName] !== undefined
          ? Number(manualDiscountLevels[levelName])
          : configuredRate;
        if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > configuredRate) {
          throw createDiscountPolicyError(
            `Discount level "${levelName}" for ${sourceLine.productName || product.itemName} must be between 0 and ${configuredRate}%`,
            'DISCOUNT_LEVEL_RATE_EXCEEDED'
          );
        }
        if (requestedRate > 0) {
          stages.push({
            key: `level:${levelName}`,
            kind: 'level',
            levelName,
            ratePercentage: requestedRate
          });
        }
      }
      stages.push(...dealerExtraStages);

      const masterDiscountCap = sourcePolicySnapshot?.masterDiscountCap ?? null;
      if (stages.some((stage) => stage.ratePercentage > 0)
          && (masterDiscountCap === null || masterDiscountCap === undefined || masterDiscountCap === '')) {
        throw createDiscountPolicyError(
          `Sales Order line ${sourceLine.productName || sourceLine._id} has a discounted snapshot without a master discount cap. Reprice the Sales Order explicitly after configuring the mapping.`,
          'MASTER_DISCOUNT_CAP_NOT_CONFIGURED'
        );
      }
      const combinedLevelDiscountCap = sourcePolicySnapshot?.combinedLevelDiscountCap
        ?? sourceLine.appliedDiscount?.combinedLevelDiscountCap
        ?? sourceLine.appliedDiscount?.maxDiscountPercentage
        ?? null;
      if (stages.some((stage) => stage.kind === 'level' && stage.ratePercentage > 0)
          && combinedLevelDiscountCap === null) {
        throw createDiscountPolicyError(
          `Sales Order line ${sourceLine.productName || sourceLine._id} has invoice level discounts without a combined level cap.`,
          'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED'
        );
      }

      const sourceGstPercentage = Number(sourceLine.gst ?? product.gst ?? 0);
      const submittedGstPercentage = Number(submittedItem.gst);
      if (hasOwn(submittedItem, 'gst')
          && (!Number.isFinite(submittedGstPercentage)
            || Math.abs(submittedGstPercentage - sourceGstPercentage) > 0.01)) {
        throw createDiscountPolicyError(
          `Linked invoice line ${sourceLine.productName || sourceLine._id} must use the Sales Order GST rate of ${sourceGstPercentage}%.`,
          'LINKED_SALES_ORDER_GST_MISMATCH'
        );
      }

      const {
        actor,
        enforceLevelPermissions,
        bypassLevelPermission,
        allowedDiscountLevels
      } = await getLiveActorContext();
      const gstPercentage = sourceGstPercentage;
      const mrpPerUnit = getInvoiceMrpPerUnit(submittedItem, gstPercentage, sourceLine);
      const invoiceUnitPrice = getInvoiceReferenceUnitPrice(
        submittedItem,
        mrpPerUnit,
        gstPercentage,
        sourceLine
      );
      const calculation = calculateDiscountLine({
        baseAmount: Number(submittedItem.quantity || 0) * mrpPerUnit,
        stages,
        gstPercentage,
        promisedEffectiveDiscountPercentage: sourceLine.promisedEffectiveDiscountPercentage,
        masterDiscountCap,
        combinedLevelDiscountCap,
        allowedDiscountLevels,
        enforceLevelPermissions,
        bypassLevelPermission
      });
      const priceIncrease = canonicalizeOneTimePriceIncrease({
        submittedItem,
        existingItem,
        discountCalculation: calculation,
        gstPercentage,
        pricingInputs: {
          quantity: submittedItem.quantity,
          mrpPerUnit,
          unitPrice: invoiceUnitPrice,
          gstPercentage,
          stages: calculation.stages
        },
        actor,
        actorId
      });
      const capturedAt = new Date();
      const invoicePolicySnapshot = sourcePolicySnapshot ? {
        ...sourcePolicySnapshot,
        flowVersion: 'linked-invoice-levels-v2',
        sourceSalesOrderLineId: sourceLine._id,
        sourcePolicyCapturedAt: sourcePolicySnapshot.capturedAt || null,
        orderedStages: calculation.stages.map((stage) => ({
          key: stage.key,
          kind: stage.kind,
          levelName: stage.levelName || null,
          ratePercentage: stage.ratePercentage
        })),
        capturedAt
      } : null;
      const invoicePermissionSnapshot = {
        actorUserId: actor?._id || actorId || null,
        actorRole: actor?.role || null,
        allowedDiscountLevels,
        enforceLevelPermissions,
        bypassLevelPermission,
        capturedAt
      };

      return {
        ...submittedItem,
        // Preserve an explicit source identity; invoice _id remains aligned for
        // backward-compatible draft clients.
        _id: sourceLine._id,
        sourceSalesOrderLineId: sourceLine._id,
        product: product._id,
        unitPrice: invoiceUnitPrice,
        mrp: mrpPerUnit,
        productCode: sourceLine.productCode || product.productCode,
        productName: sourceLine.productName || product.itemName,
        HSNCode: sourceLine.HSNCode || product.HSNCode,
        gst: gstPercentage,
        selectedDiscountLevels,
        manualDiscountLevels: new Map(Object.entries(manualDiscountLevels)),
        dealerExtraDiscount: Number(sourceLine.dealerExtraDiscount || 0),
        discountPercentage: stages
          .filter((stage) => stage.kind === 'direct' || stage.kind === 'level')
          .reduce((sum, stage) => sum + stage.ratePercentage, 0),
        discountAmount: calculation.discountAmount,
        priceBeforeIncrease: priceIncrease.priceBeforeIncrease,
        oneTimePriceIncreasePercentage: priceIncrease.oneTimePriceIncreasePercentage,
        oneTimePriceIncreaseAmount: priceIncrease.oneTimePriceIncreaseAmount,
        oneTimePriceIncreaseAboveMrpOverride: priceIncrease.oneTimePriceIncreaseAboveMrpOverride,
        oneTimePriceIncreaseReason: priceIncrease.oneTimePriceIncreaseReason,
        oneTimePriceIncreaseAppliedBy: priceIncrease.oneTimePriceIncreaseAppliedBy,
        oneTimePriceIncreaseAppliedAt: priceIncrease.oneTimePriceIncreaseAppliedAt,
        gstAmount: priceIncrease.gstAmount,
        totalPrice: priceIncrease.finalAmount,
        effectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
        promisedEffectiveDiscountPercentage: sourceLine.promisedEffectiveDiscountPercentage ?? null,
        requiredSequentialStageRatePercentage: calculation.requiredSequentialStageRatePercentage,
        sourceSalesOrderRequiredSequentialStageRatePercentage:
          sourceLine.requiredSequentialStageRatePercentage ?? null,
        masterDiscountCapApplied: calculation.masterDiscountCapApplied,
        combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
        levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage,
        discountFamilyKey: sourceLine.discountFamilyKey
          || sourcePolicySnapshot?.discountFamilyKey
          || null,
        discountPolicySnapshot: invoicePolicySnapshot,
        discountPermissionSnapshot: invoicePermissionSnapshot,
        appliedDiscounts: sourceAppliedDiscounts(sourceLine)
      };
    }

    const {
      actor,
      enforceLevelPermissions,
      bypassLevelPermission,
      allowedDiscountLevels
    } = await getLiveActorContext();
    const liveSubmittedItem = sourceLine ? {
      ...submittedItem,
      selectedDiscountLevels: getSubmittedOrSource(submittedItem, sourceLine, 'selectedDiscountLevels', []),
      manualDiscountLevels: getSubmittedOrSource(submittedItem, sourceLine, 'manualDiscountLevels', {}),
      promisedEffectiveDiscountPercentage: getSubmittedOrSource(
        submittedItem,
        sourceLine,
        'promisedEffectiveDiscountPercentage',
        null
      )
    } : submittedItem;

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
    const selectedDiscountLevels = [...new Set((liveSubmittedItem.selectedDiscountLevels || []).map(String))];
    const manualDiscountLevels = normalizeRateMap(liveSubmittedItem.manualDiscountLevels);
    const dealerExtraDiscount = resolveAndValidateDealerExtraDiscount({
      submittedItem: liveSubmittedItem,
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

    for (const levelName of selectedDiscountLevels) {
      const level = mappingLevels.find(levelDefinition => levelDefinition.levelName === levelName);
      if (!level) {
        const error = new Error(`Discount level "${levelName}" is not available for ${product.itemName}`);
        error.name = 'DiscountPolicyError';
        error.code = 'DISCOUNT_LEVEL_NOT_FOUND';
        throw error;
      }
      const configuredRate = Number(level.discountPercentage || 0);
      const requestedRate = manualDiscountLevels[levelName] !== undefined
        ? Number(manualDiscountLevels[levelName])
        : configuredRate;
      if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > configuredRate) {
        const error = new Error(`Discount level "${levelName}" for ${product.itemName} must be between 0 and ${configuredRate}%`);
        error.name = 'DiscountPolicyError';
        error.code = 'DISCOUNT_LEVEL_RATE_EXCEEDED';
        throw error;
      }
      if (requestedRate > 0) {
        stages.push({ key: `level:${levelName}`, kind: 'level', levelName, ratePercentage: requestedRate });
      }
    }

    if (dealerExtraDiscount > 0) {
      stages.push({ key: 'dealer-extra', kind: 'dealer_extra', ratePercentage: dealerExtraDiscount });
    }

    if (!mapping && stages.length > 0) {
      const error = new Error(`No applicable discount mapping exists for ${product.itemName}`);
      error.name = 'DiscountPolicyError';
      error.code = 'DISCOUNT_MAPPING_NOT_FOUND';
      throw error;
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

    const gstPercentage = Number(submittedItem.gst ?? product.gst ?? 0);
    const mrpPerUnit = getInvoiceMrpPerUnit(submittedItem, gstPercentage, sourceLine);
    const invoiceUnitPrice = getInvoiceReferenceUnitPrice(
      submittedItem,
      mrpPerUnit,
      gstPercentage,
      sourceLine
    );
    const grossAmount = Number(submittedItem.quantity || 0) * mrpPerUnit;
    const calculation = calculateDiscountLine({
      baseAmount: grossAmount,
      stages,
      gstPercentage,
      promisedEffectiveDiscountPercentage: liveSubmittedItem.promisedEffectiveDiscountPercentage,
      masterDiscountCap: mapping?.masterDiscountCap ?? null,
      combinedLevelDiscountCap,
      allowedDiscountLevels,
      enforceLevelPermissions,
      bypassLevelPermission
    });
    const priceIncrease = canonicalizeOneTimePriceIncrease({
      submittedItem,
      existingItem,
      discountCalculation: calculation,
      gstPercentage,
      pricingInputs: {
        quantity: submittedItem.quantity,
        mrpPerUnit,
        unitPrice: invoiceUnitPrice,
        gstPercentage,
        stages: calculation.stages
      },
      actor,
      actorId
    });

    const discountFamilyKey = product.subcategory
      ? `subcategory:${product.subcategory}`
      : null;
    const capturedAt = new Date();
    const normalizedLevels = mappingLevels.map(level => ({
      levelName: level.levelName,
      discountPercentage: Number(level.discountPercentage || 0),
      description: level.description || ''
    }));
    const discountPolicySnapshot = mapping ? {
      flowVersion: 'standalone-invoice-levels-v2',
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
      orderedStages: calculation.stages.map(stage => ({
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
      ...(sourceLine ? {
        _id: sourceLine._id,
        sourceSalesOrderLineId: sourceLine._id
      } : {}),
      product: product._id,
      unitPrice: invoiceUnitPrice,
      mrp: mrpPerUnit,
      productCode: submittedItem.productCode || product.productCode,
      productName: submittedItem.productName || product.itemName,
      HSNCode: submittedItem.HSNCode || product.HSNCode,
      gst: gstPercentage,
      selectedDiscountLevels,
      manualDiscountLevels: new Map(Object.entries(manualDiscountLevels)),
      dealerExtraDiscount,
      discountPercentage: stages
        .filter(stage => stage.kind === 'direct' || stage.kind === 'level')
        .reduce((sum, stage) => sum + stage.ratePercentage, 0),
      discountAmount: calculation.discountAmount,
      priceBeforeIncrease: priceIncrease.priceBeforeIncrease,
      oneTimePriceIncreasePercentage: priceIncrease.oneTimePriceIncreasePercentage,
      oneTimePriceIncreaseAmount: priceIncrease.oneTimePriceIncreaseAmount,
      oneTimePriceIncreaseAboveMrpOverride: priceIncrease.oneTimePriceIncreaseAboveMrpOverride,
      oneTimePriceIncreaseReason: priceIncrease.oneTimePriceIncreaseReason,
      oneTimePriceIncreaseAppliedBy: priceIncrease.oneTimePriceIncreaseAppliedBy,
      oneTimePriceIncreaseAppliedAt: priceIncrease.oneTimePriceIncreaseAppliedAt,
      gstAmount: priceIncrease.gstAmount,
      totalPrice: priceIncrease.finalAmount,
      effectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
      promisedEffectiveDiscountPercentage: calculation.promisedEffectiveDiscountPercentage,
      requiredSequentialStageRatePercentage: calculation.requiredSequentialStageRatePercentage,
      // Standalone invoices have no Sales Order source stage. Explicitly clear
      // any client-supplied value so this provenance field cannot be spoofed.
      sourceSalesOrderRequiredSequentialStageRatePercentage: null,
      masterDiscountCapApplied: calculation.masterDiscountCapApplied,
      combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
      levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage,
      discountFamilyKey,
      discountPolicySnapshot,
      discountPermissionSnapshot,
      appliedDiscounts: mapping ? [{
        discountId: mapping._id,
        discountName: mapping.discountName,
        discountValue: directDiscountPercentage,
        discountType: mapping.discountType,
        directDiscountPercentage,
        levels: normalizedLevels,
        targetType: mapping.targetType,
        masterDiscountCap: mapping.masterDiscountCap,
        combinedLevelDiscountCap
      }] : []
    };
  };

  let canonicalizedItems;
  if (session) {
    canonicalizedItems = [];
    for (const [submittedIndex, submittedItem] of (items || []).entries()) {
      canonicalizedItems.push(await canonicalizeItem(submittedItem, submittedIndex));
    }
  } else {
    canonicalizedItems = await Promise.all((items || []).map(canonicalizeItem));
  }

  const unmatchedExistingOverrides = (existingItems || []).filter((existingItem) => {
    if (existingItem?.oneTimePriceIncreaseAboveMrpOverride !== true) return false;
    const identity = objectIdString(existingItem.sourceSalesOrderLineId || existingItem._id);
    return !identity || !matchedExistingItemIdentities.has(identity);
  });
  if (unmatchedExistingOverrides.length > 0) {
    const { actor } = await getLiveActorContext();
    const actorRole = String(actor?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (actorRole !== 'super_admin') {
      throw createDiscountPolicyError(
        'Only a Super Admin may remove or replace an invoice line with an active above-MRP override.',
        'MRP_OVERRIDE_FORBIDDEN'
      );
    }
  }

  return canonicalizedItems;
};

// Generate unique invoice number
const generateInvoiceNumber = async (dbConnection) => {
  try {
    const { DealerInvoice } = getModels(dbConnection);
    const currentYear = new Date().getFullYear();
    const prefix = `INV-${currentYear}-`;
    
    // Find the highest invoice number for this year
    const lastInvoice = await DealerInvoice.findOne({
      invoiceNumber: { $regex: `^${prefix}` }
    }).sort({ invoiceNumber: -1 });
    
    let nextNumber = 1;
    if (lastInvoice) {
      // Extract the number from the last invoice
      const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    // Format with leading zeros (4 digits)
    const invoiceNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    
    // Double-check uniqueness
    const existingInvoice = await DealerInvoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return `${prefix}${(nextNumber + 1).toString().padStart(4, '0')}`;
    }
    
    return invoiceNumber;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    const timestamp = Date.now().toString().slice(-6);
    return `INV-${new Date().getFullYear()}-${timestamp}`;
  }
};

// @desc    Get all dealer invoices
// @route   GET /api/dealer-invoices
// @access  Private
export const getDealerInvoices = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, SalesOrder, PaymentAllocation, DealerPayment } = getModels(req.dbConnection);
    
    const {
      page = 1,
      limit = 10,
      search,
      status,
      paymentStatus,
      dealer,
      region,
      startDate,
      endDate,
      salesOrder,
      isDraft,
      showCancelled = 'false' // New parameter to show/hide cancelled invoices
    } = req.query;

    // Build query object
    const query = {};
    
    // By default, exclude cancelled/deleted invoices
    if (showCancelled !== 'true') {
      query.isDeleted = { $ne: true };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { dealerName: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { salesOrderNumber: { $regex: search, $options: "i" } }
      ];
    }

    // Filter by status
    if (status && status !== "all") {
      query.status = status;
    }

    // Explicit draft filtering keeps dashboard recent-invoice pagination correct.
    if (isDraft === 'true') {
      query.isDraft = true;
    } else if (isDraft === 'false') {
      query.isDraft = { $ne: true };
      if (!status || status === 'all') query.status = { $ne: 'Draft' };
    }

    // Filter by payment status
    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }

    // Filter by dealer
    if (dealer) {
      query.dealer = dealer;
    }

    // Filter by region
    if (region) {
      query.region = region;
    }

    // Filter by sales order
    if (salesOrder) {
      query.salesOrder = salesOrder;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const invoices = await DealerInvoice.find(query)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("deletedBy", "name email") // Populate who cancelled the invoice
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.oneTimePriceIncreaseAppliedBy", "name email")
      .populate("items.warehouse", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean() // Convert to plain JavaScript objects for modification
      .exec();

    const invoiceIds = invoices.map(invoice => invoice._id);
    const invoiceIdSet = new Set(invoiceIds.map(String));

    // Batch payment enrichment for the entire page. The previous implementation
    // issued two sequential queries per invoice (2N queries); this keeps the
    // response contract while reducing it to two queries total.
    const [paymentAllocations, approvedLegacyPayments, total] = await Promise.all([
      invoiceIds.length > 0
        ? PaymentAllocation.find({
          'allocations.invoiceId': { $in: invoiceIds },
          $or: [{ status: 'Active' }, { status: null }, { status: { $exists: false } }]
        })
          .select('allocationNumber allocationDate voucherId allocations.invoiceId allocations.allocatedAmount')
          .populate('voucherId', 'voucherNumber voucherDate voucherType transactionMode')
          .lean()
        : [],
      invoiceIds.length > 0
        ? DealerPayment.find({
          dealerInvoice: { $in: invoiceIds },
          status: 'Approved',
          $or: [
            { receiptVoucherIds: { $exists: false } },
            { receiptVoucherIds: { $size: 0 } }
          ]
        })
          .select('dealerInvoice paymentNumber paymentDate paymentMethod paymentAmount paymentType')
          .lean()
        : [],
      DealerInvoice.countDocuments(query)
    ]);

    const allocationsByInvoice = new Map();
    paymentAllocations.forEach(paymentAllocation => {
      (paymentAllocation.allocations || []).forEach(allocation => {
        const invoiceId = allocation.invoiceId?.toString();
        if (!invoiceId || !invoiceIdSet.has(invoiceId)) return;
        if (!allocationsByInvoice.has(invoiceId)) allocationsByInvoice.set(invoiceId, []);
        allocationsByInvoice.get(invoiceId).push({
          allocationNumber: paymentAllocation.allocationNumber,
          allocationDate: paymentAllocation.allocationDate,
          voucherNumber: paymentAllocation.voucherId?.voucherNumber || 'N/A',
          voucherDate: paymentAllocation.voucherId?.voucherDate,
          voucherType: paymentAllocation.voucherId?.voucherType || 'Receipt',
          paymentMethod: paymentAllocation.voucherId?.transactionMode || 'N/A',
          allocatedAmount: allocation.allocatedAmount || 0,
          allocationId: paymentAllocation._id
        });
      });
    });

    const legacyPaymentsByInvoice = new Map();
    approvedLegacyPayments.forEach(payment => {
      const invoiceId = payment.dealerInvoice?.toString();
      if (!invoiceId) return;
      if (!legacyPaymentsByInvoice.has(invoiceId)) legacyPaymentsByInvoice.set(invoiceId, []);
      legacyPaymentsByInvoice.get(invoiceId).push({
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        paymentAmount: payment.paymentAmount,
        paymentType: payment.paymentType,
        paymentId: payment._id
      });
    });

    invoices.forEach(invoice => {
      const invoiceId = invoice._id.toString();
      invoice.paymentAllocations = allocationsByInvoice.get(invoiceId) || [];
      invoice.oldPayments = legacyPaymentsByInvoice.get(invoiceId) || [];
    });

    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Get dealer invoices error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer invoices"
    });
  }
};

const normalizeDiscountHistoryLine = (line, sourceMetadata) => {
  const quantity = Number(line.quantity || 0);
  const unitPrice = Number(line.unitPrice || 0);
  const gstPercentage = Number(line.gst || 0);
  const invoiceMrp = Number(line.mrp);
  const grossUnitPrice = sourceMetadata.source === 'dealer_invoice'
    ? (Number.isFinite(invoiceMrp) && invoiceMrp > 0
      ? invoiceMrp
      : unitPrice * (1 + gstPercentage / 100))
    : unitPrice;
  const grossAmount = quantity * grossUnitPrice;
  const discountAmount = Number(line.discountAmount || 0);
  const hasPersistedEffectiveDiscount = line.effectiveDiscountPercentage !== null
    && line.effectiveDiscountPercentage !== undefined
    && Number.isFinite(Number(line.effectiveDiscountPercentage));
  const effectiveDiscountPercentage = hasPersistedEffectiveDiscount
    ? Number(line.effectiveDiscountPercentage)
    : grossAmount > 0 && Number.isFinite(discountAmount)
      ? (discountAmount / grossAmount) * 100
      : Number(line.discountPercentage || 0);
  const selectedDiscountLevels = Array.isArray(line.selectedDiscountLevels)
    && line.selectedDiscountLevels.length > 0
    ? line.selectedDiscountLevels.map(String)
    : line.selectedDiscountLevel !== null && line.selectedDiscountLevel !== undefined
      ? [String(line.selectedDiscountLevel)]
      : [];

  return {
    product: line.product,
    productCode: line.productCode || null,
    productName: line.productName || null,
    quantity,
    unitPrice,
    mrp: line.mrp ?? null,
    grossAmount,
    discountAmount,
    effectiveDiscountPercentage,
    promisedEffectiveDiscountPercentage: line.promisedEffectiveDiscountPercentage ?? null,
    requiredSequentialStageRatePercentage: line.requiredSequentialStageRatePercentage ?? null,
    selectedDiscountLevels,
    manualDiscountLevels: { ...normalizeRateMap(line.manualDiscountLevels) },
    dealerExtraDiscount: Number(line.dealerExtraDiscount || 0),
    discountPolicySnapshot: line.discountPolicySnapshot || null,
    discountPermissionSnapshot: line.discountPermissionSnapshot || null,
    discountFamilyKey: line.discountFamilyKey,
    ...sourceMetadata
  };
};

const buildDiscountHistory = ({ document, lines, source, reference, date }) => {
  const sourceMetadata = {
    source,
    reference,
    referenceId: document._id,
    date
  };
  const normalizedLines = lines.map(line => normalizeDiscountHistoryLine(line, sourceMetadata));
  const familyGrossAmount = normalizedLines.reduce(
    (sum, line) => sum + Number(line.grossAmount || 0),
    0
  );
  const familyDiscountAmount = normalizedLines.reduce(
    (sum, line) => sum + Number(line.discountAmount || 0),
    0
  );
  const familyEffectiveDiscountPercentage = familyGrossAmount > 0
    ? (familyDiscountAmount / familyGrossAmount) * 100
    : 0;

  return {
    ...sourceMetadata,
    status: document.status,
    approvedAt: document.approvedAt || null,
    familyGrossAmount,
    familyDiscountAmount,
    familyEffectiveDiscountPercentage,
    invoiceSubtotal: source === 'dealer_invoice' ? Number(document.subtotal || 0) : null,
    invoiceTotalDiscount: source === 'dealer_invoice' ? Number(document.totalDiscount || 0) : null,
    invoiceTotalAmount: source === 'dealer_invoice' ? Number(document.totalAmount || 0) : null,
    lines: normalizedLines
  };
};

// @desc    Get the latest finalized discount used for a dealer and product family
// @route   GET /api/dealer-invoices/last-finalized-discount/:dealerId/:subcategoryId
// @access  Private
export const getLastFinalizedDealerFamilyDiscount = async (req, res) => {
  try {
    const { dealerId, subcategoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(dealerId) || !mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dealer or subcategory ID"
      });
    }

    const { DealerInvoice, SalesOrder } = getModels(req.dbConnection);
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);
    const familyKey = `subcategory:${new mongoose.Types.ObjectId(subcategoryId).toString()}`;

    const [invoiceCandidates, salesOrderCandidates] = await Promise.all([
      DealerInvoice.aggregate([
        {
          $match: {
            dealer: dealerObjectId,
            isDraft: { $ne: true },
            isDeleted: { $ne: true },
            status: { $in: ["Approved", "Dispatched", "Delivered"] },
            "items.discountFamilyKey": familyKey
          }
        },
        {
          $addFields: {
            _discountEventDate: {
              $ifNull: ["$approvedAt", { $ifNull: ["$invoiceDate", "$createdAt"] }]
            }
          }
        },
        { $sort: { _discountEventDate: -1, _id: -1 } },
        { $limit: 1 }
      ]),
      SalesOrder.aggregate([
        {
          $match: {
            dealer: dealerObjectId,
            status: { $in: ["Confirmed", "Processing", "In Transit", "Delivered"] },
            "products.discountFamilyKey": familyKey
          }
        },
        {
          $addFields: {
            _discountEventDate: {
              $ifNull: [
                "$discountFinalizedAt",
                { $ifNull: ["$approvedAt", { $ifNull: ["$orderDate", "$createdAt"] }] }
              ]
            }
          }
        },
        { $sort: { _discountEventDate: -1, _id: -1 } },
        { $limit: 1 }
      ])
    ]);

    const invoice = invoiceCandidates[0] || null;
    const salesOrder = salesOrderCandidates[0] || null;
    const invoiceEventTime = invoice?._discountEventDate
      ? new Date(invoice._discountEventDate).getTime()
      : Number.NEGATIVE_INFINITY;
    const salesOrderEventTime = salesOrder?._discountEventDate
      ? new Date(salesOrder._discountEventDate).getTime()
      : Number.NEGATIVE_INFINITY;

    if (invoice && invoiceEventTime >= salesOrderEventTime) {
      const matchingLines = (invoice.items || []).filter(item => item.discountFamilyKey === familyKey);
      return res.json({
        success: true,
        history: buildDiscountHistory({
          document: invoice,
          lines: matchingLines,
          source: "dealer_invoice",
          reference: invoice.invoiceNumber || String(invoice._id),
          date: invoice._discountEventDate
        })
      });
    }

    if (salesOrder) {
      const matchingLines = (salesOrder.products || []).filter(product => product.discountFamilyKey === familyKey);
      return res.json({
        success: true,
        history: buildDiscountHistory({
          document: salesOrder,
          lines: matchingLines,
          source: "sales_order",
          reference: salesOrder.orderNumber || String(salesOrder._id),
          date: salesOrder._discountEventDate
        })
      });
    }

    return res.json({ success: true, history: null });
  } catch (error) {
    console.error("Get last finalized dealer family discount error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching dealer family discount history"
    });
  }
};

// @desc    Get the latest finalized invoice discount for a dealer and product family
// @route   GET /api/sales-orders/dealer-family-last-invoice-discount/:dealerId/:subcategoryId
// @access  Private (Sales Order dashboard permission)
export const getLastFinalizedDealerInvoiceFamilyDiscount = async (req, res) => {
  try {
    const { dealerId, subcategoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(dealerId) || !mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dealer or subcategory ID"
      });
    }

    const { DealerInvoice, Product } = getModels(req.dbConnection);
    const dealerObjectId = new mongoose.Types.ObjectId(dealerId);
    const subcategoryObjectId = new mongoose.Types.ObjectId(subcategoryId);
    const familyKey = `subcategory:${subcategoryObjectId.toString()}`;

    // Current invoices persist discountFamilyKey. Product IDs provide a safe
    // fallback only for legacy lines where that snapshot is absent.
    const familyProductIds = await Product.distinct('_id', { subcategory: subcategoryObjectId });
    const invoiceFamilyMatchers = [
      { "items.discountFamilyKey": familyKey }
    ];
    if (familyProductIds.length > 0) {
      invoiceFamilyMatchers.push({
        items: {
          $elemMatch: {
            product: { $in: familyProductIds },
            discountFamilyKey: { $in: [null, ''] }
          }
        }
      });
    }

    const invoiceCandidates = await DealerInvoice.aggregate([
      {
        $match: {
          dealer: dealerObjectId,
          isDraft: { $ne: true },
          isDeleted: { $ne: true },
          status: { $in: ["Approved", "Dispatched", "Delivered"] },
          $or: invoiceFamilyMatchers
        }
      },
      {
        $addFields: {
          _discountEventDate: {
            $ifNull: ["$approvedAt", { $ifNull: ["$invoiceDate", "$createdAt"] }]
          }
        }
      },
      { $sort: { _discountEventDate: -1, _id: -1 } },
      { $limit: 1 }
    ]);

    const invoice = invoiceCandidates[0] || null;
    if (!invoice) {
      return res.json({ success: true, history: null });
    }

    const familyProductIdSet = new Set(familyProductIds.map(objectIdString));
    const matchingLines = (invoice.items || []).filter(item => {
      const persistedFamilyKey = String(item.discountFamilyKey || '').trim();
      if (persistedFamilyKey) return persistedFamilyKey === familyKey;
      return familyProductIdSet.has(objectIdString(item.product));
    });

    if (matchingLines.length === 0) {
      return res.json({ success: true, history: null });
    }

    return res.json({
      success: true,
      history: buildDiscountHistory({
        document: invoice,
        lines: matchingLines,
        source: "dealer_invoice",
        reference: invoice.invoiceNumber || String(invoice._id),
        date: invoice._discountEventDate
      })
    });
  } catch (error) {
    console.error("Get last finalized dealer invoice family discount error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching the last invoice family discount"
    });
  }
};

// @desc    Get single dealer invoice
// @route   GET /api/dealer-invoices/:id
// @access  Private
export const getDealerInvoice = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { DealerInvoice } = getModels(req.dbConnection);
    
    const invoice = await DealerInvoice.findById(req.params.id)
      .populate("dealer", "name code dealerType contactPerson phone email address gst pan")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber orderDate deliveryDate")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("items.product", "itemName productCode HSNCode description")
      .populate("items.oneTimePriceIncreaseAppliedBy", "name email")
      .populate("items.warehouse", "name address")
      .populate("items.appliedDiscounts.discountId", "mappingType levels validFrom validTo");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    res.json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error("Get dealer invoice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer invoice"
    });
  }
};

// @desc    Get dealer's confirmed and above sales orders for invoice creation
// @route   GET /api/dealer-invoices/sales-orders/:dealerId
// @access  Private
export const getDealerSalesOrders = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { SalesOrder } = getModels(req.dbConnection);
    
    const { dealerId } = req.params;
    const { status = "Delivered" } = req.query;

    // Get sales orders that are confirmed or above, including In Transit.
    const salesOrders = await SalesOrder.find({
      dealer: dealerId,
      status: { $in: ["Confirmed", "Processing", "In Transit", "Delivered", "Completed"] }
    })
      .populate("products.product", "itemName productCode HSNCode description brand category subcategory")
      .populate("products.warehouse", "name")
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .sort({ orderDate: -1 })
      .lean();

    res.json({
      success: true,
      salesOrders
    });
  } catch (error) {
    console.error("Get dealer sales orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dealer sales orders"
    });
  }
};

// @desc    Calculate discounts and points for products
// @route   POST /api/dealer-invoices/calculate-discounts
// @access  Private
export const calculateDiscountsAndPoints = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { Dealer, Product, DiscountMapping, User } = getModels(req.dbConnection);
    
    const { items, dealerId } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items array is required"
      });
    }

    const dealer = dealerId
      ? await Dealer.findById(dealerId).select('dealerType extraDiscounts').lean()
      : null;
    const actor = req.user?._id
      ? await User.findById(req.user._id).select('role allowedDiscountLevels').lean()
      : null;
    const enforceLevelPermissions = true;
    const allowedDiscountLevels = actor?.allowedDiscountLevels || [];

    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("subcategory", "name")
        .populate("subcategory1", "name")
        .populate("subcategory2", "name");

      if (!product) {
        continue;
      }

      // Use the proper findApplicableDiscounts method from DiscountMapping
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        item.productId, 'sales', dealer?.dealerType || null, req.dbConnection
      );

      // MRP = product.mrp or unitPrice × (1 + gst/100)
      const mrpPerUnit = product.mrp || (product.unitPrice * (1 + (product.gst || 0) / 100));
      const grossAmount = item.quantity * mrpPerUnit;

      // Build the same canonical stage order used by invoice persistence:
      // direct, submitted selected levels, then authoritative dealer extra.
      const selectedDiscountLevels = [...new Set((
        item.selectedDiscountLevels || item.selectedLevels || []
      ).map(String))];
      const manualDiscountLevels = normalizeRateMap(item.manualDiscountLevels);
      const mapping = applicableDiscounts[0] || null;
      const mappingLevels = mapping?.levels || [];
      const stages = [];
      let directDiscountPercentage = 0;
      let masterDiscountCap = mapping?.masterDiscountCap ?? null;
      const combinedLevelDiscountCap = mapping?.combinedLevelDiscountCap
        ?? mapping?.maxDiscountPercentage
        ?? null;
      let appliedDiscounts = [];

      if (selectedDiscountLevels.length > 0 && combinedLevelDiscountCap === null) {
        throw createDiscountPolicyError(
          `Combined selected-level discount cap is not configured for the applicable sales mapping on ${product.itemName}.`,
          'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED'
        );
      }

      if (mapping && (mapping.discountType === 'direct' || mapping.discountType === 'both')) {
        directDiscountPercentage = Number(mapping.directDiscountPercentage || 0);
        if (directDiscountPercentage > 0) {
          stages.push({ key: 'direct', kind: 'direct', ratePercentage: directDiscountPercentage });
        }
      }

      const levelBreakdown = [];
      for (const levelName of selectedDiscountLevels) {
        const level = mappingLevels.find(levelDefinition => levelDefinition.levelName === levelName);
        if (!level) {
          throw createDiscountPolicyError(
            `Discount level "${levelName}" is not available for ${product.itemName}`,
            'DISCOUNT_LEVEL_NOT_FOUND'
          );
        }
        const configuredRate = Number(level.discountPercentage || 0);
        const requestedRate = manualDiscountLevels[levelName] !== undefined
          ? Number(manualDiscountLevels[levelName])
          : configuredRate;
        if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > configuredRate) {
          throw createDiscountPolicyError(
            `Discount level "${levelName}" for ${product.itemName} must be between 0 and ${configuredRate}%`,
            'DISCOUNT_LEVEL_RATE_EXCEEDED'
          );
        }
        if (requestedRate > 0) {
          stages.push({ key: `level:${levelName}`, kind: 'level', levelName, ratePercentage: requestedRate });
          levelBreakdown.push({ levelName, discountPercentage: requestedRate });
        }
      }

      const dealerExtraDiscount = dealer
        ? resolveDealerExtraDiscountBySpecificity(dealer, product)
        : 0;
      if (dealerExtraDiscount > 0) {
        stages.push({ key: 'dealer-extra', kind: 'dealer_extra', ratePercentage: dealerExtraDiscount });
      }
      if (!mapping && stages.length > 0) {
        throw createDiscountPolicyError(
          `No applicable discount mapping exists for ${product.itemName}`,
          'DISCOUNT_MAPPING_NOT_FOUND'
        );
      }

      const calculation = calculateDiscountLine({
        baseAmount: grossAmount,
        stages,
        gstPercentage: Number(product.gst || 0),
        masterDiscountCap,
        combinedLevelDiscountCap,
        allowedDiscountLevels,
        enforceLevelPermissions,
        bypassLevelPermission: false
      });
      const currentAmount = calculation.finalAmount;
      const totalDiscountAmount = calculation.discountAmount;
      const effectiveDiscountPct = calculation.effectiveDiscountPercentage;

      if (mapping) {
        appliedDiscounts = [{
          discountId: mapping._id,
          discountName: mapping.discountName,
          discountValue: directDiscountPercentage,
          discountType: mapping.discountType,
          directDiscountPercentage,
          levels: mappingLevels.map(level => ({
            levelName: level.levelName,
            discountPercentage: Number(level.discountPercentage || 0)
          })),
          targetType: mapping.targetType,
          masterDiscountCap,
          combinedLevelDiscountCap
        }];
      }

      // Final amount already includes GST (MRP based)
      const finalAmount = parseFloat(currentAmount.toFixed(2));
      
      // Reverse-calculate GST for tax display
      const gstRate = product.gst || 0;
      const gstAmount = gstRate > 0 
        ? parseFloat((finalAmount - finalAmount / (1 + gstRate / 100)).toFixed(2))
        : 0;

      // Points calculation
      let pointsEarned = 0;
      // Points logic can remain as-is or be updated later

      processedItems.push({
        product: product._id,
        productCode: product.productCode,
        productName: product.itemName,
        HSNCode: product.HSNCode,
        unit: product.unit,
        alternateUnit: product.alternateUnit,
        alternateUnitQuantity: product.alternateUnitQuantity,
        category: product.category?.name || '',
        subcategory: product.subcategory?.name || '',
        brand: product.brand?.name || '',
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        mrp: mrpPerUnit,
        gst: gstRate,
        gstAmount: gstAmount,
        selectedDiscountLevels,
        manualDiscountLevels,
        dealerExtraDiscount,
        discountPercentage: stages
          .filter(stage => stage.kind === 'direct' || stage.kind === 'level')
          .reduce((sum, stage) => sum + stage.ratePercentage, 0),
        discountAmount: parseFloat(totalDiscountAmount.toFixed(2)),
        effectiveDiscountPercentage: effectiveDiscountPct,
        masterDiscountCapApplied: calculation.masterDiscountCapApplied,
        combinedLevelDiscountCapApplied: calculation.combinedLevelDiscountCapApplied,
        levelDiscountTotalPercentage: calculation.levelDiscountTotalPercentage,
        appliedDiscounts,
        pointsEarned,
        totalPrice: finalAmount,
        warehouse: item.warehouseId,
        warehouseName: item.warehouseName
      });
    }

    res.json({
      success: true,
      items: processedItems
    });
  } catch (error) {
    console.error("Calculate discounts and points error:", error);
    if (error?.name === 'DiscountPolicyError' || error instanceof RangeError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code || 'DISCOUNT_POLICY_INVALID'
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error while calculating discounts and points"
    });
  }
};

// @desc    Create new dealer invoice
// @route   POST /api/dealer-invoices
// @access  Private
export const createDealerInvoice = async (req, res) => {
  try {
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, Product, SalesOrder, Stock, StockMovement, DealerLedger, Points, Notification } = getModels(req.dbConnection);
    
    console.log("Creating dealer invoice with data:", {
      dealerId: req.body.dealerId,
      itemsCount: req.body.items?.length,
      subtotal: req.body.subtotal,
      totalAmount: req.body.totalAmount
    });
    
    const {
      dealerId,
      salesOrderId,
      customerInfo,
      items: requestedItems,
      creditDays = 30, // This will be overridden based on sales type
      remarks,
      internalNotes,
      subtotal: frontendSubtotal,
      totalDiscount: frontendTotalDiscount,
      totalGst: frontendTotalGst,
      totalAmount: frontendTotalAmount,
      totalPoints
    } = req.body;
    let items = requestedItems;
    
    // ── RECALCULATE AND VALIDATE TOTALS ──────────────────────────────────
    // All calculations are MRP-based (GST inclusive). unitPrice is just reference (base price before GST).
    // Discounts are applied sequentially on MRP. totalAmount = sum of item finals after discounts.
    // GST is reverse-calculated from the final amount for display only.
    let calculatedSubtotal = 0;
    let calculatedTotalDiscount = 0;
    let calculatedTotalIncrease = 0;
    let calculatedTotalGst = 0;
    let calculatedTotalAmount = 0;
    
    if (items && items.length > 0) {
      items.forEach(item => {
        const quantity = item.quantity || 0;
        // Use mrp (GST inclusive) for subtotal, NOT unitPrice (which is base price for reference only)
        const mrp = item.mrp || item.unitPrice || 0;
        const grossAmount = quantity * mrp;
        
        calculatedSubtotal += grossAmount;
        calculatedTotalDiscount += (item.discountAmount || 0);
        calculatedTotalIncrease += (item.oneTimePriceIncreaseAmount || 0);
        calculatedTotalGst += (item.gstAmount || 0);
        // totalAmount = sum of each item's final amount (MRP after sequential discounts)
        calculatedTotalAmount += (item.totalPrice || (grossAmount - (item.discountAmount || 0)));
      });
    }
    
    // Log calculation comparison
    console.log('💰 Total Calculation Comparison:');
    console.log('  Frontend:', { subtotal: frontendSubtotal, discount: frontendTotalDiscount, gst: frontendTotalGst, total: frontendTotalAmount });
    console.log('  Backend:', { subtotal: calculatedSubtotal, discount: calculatedTotalDiscount, gst: calculatedTotalGst, total: calculatedTotalAmount });
    
    // Use backend calculations (more reliable)
    // subtotal = MRP × Qty (GST inclusive gross)
    // totalDiscount = sum of sequential discount amounts
    // totalGst = reverse-calculated GST from final amounts (for display only)
    // totalAmount = subtotal - totalDiscount (since MRP already includes GST, no need to add GST back)
    let subtotal = calculatedSubtotal;
    let totalDiscount = calculatedTotalDiscount;
    let totalIncrease = calculatedTotalIncrease;
    let totalGst = calculatedTotalGst;
    let totalAmount = calculatedTotalAmount;
    // ── END RECALCULATION ─────────────────────────────────────────────────

    // Validate required fields
    if (!dealerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID and items are required"
      });
    }

    // Get dealer information
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // Replace client-computed discounts and amounts with the server canonical result.
    items = await canonicalizeInvoiceItems({
      items,
      dealer,
      dbConnection: req.dbConnection,
      actorId: req.user._id,
      salesOrderId
    });

    calculatedSubtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.mrp || item.unitPrice || 0), 0);
    calculatedTotalDiscount = items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
    calculatedTotalIncrease = items.reduce(
      (sum, item) => sum + Number(item.oneTimePriceIncreaseAmount || 0),
      0
    );
    calculatedTotalGst = items.reduce((sum, item) => sum + Number(item.gstAmount || 0), 0);
    calculatedTotalAmount = items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    subtotal = calculatedSubtotal;
    totalDiscount = calculatedTotalDiscount;
    totalIncrease = calculatedTotalIncrease;
    totalGst = calculatedTotalGst;
    totalAmount = calculatedTotalAmount;

    // Determine sales type from items and calculate appropriate credit days
    let determinedSalesType = 'Regular Sale'; // Default
    let appropriateCreditDays = creditDays; // Start with provided value
    
    console.log('🔍 Analyzing items for sales type:', items.map(item => ({
      productName: item.productName,
      salesType: item.salesType
    })));
    
    // Check if any item has CD Sales type
    const hasCDSales = items.some(item => item.salesType === 'CD Sales');
    const hasRegularSales = items.some(item => item.salesType === 'Regular Sale' || !item.salesType);
    
    console.log('📊 Sales type analysis:', { hasCDSales, hasRegularSales });
    
    if (hasCDSales && !hasRegularSales) {
      // All items are CD Sales
      determinedSalesType = 'CD Sales';
      appropriateCreditDays = dealer.creditDaysCD || dealer.creditDays || creditDays;
      console.log('✅ All CD Sales - Using CD credit days:', appropriateCreditDays);
    } else if (hasRegularSales && !hasCDSales) {
      // All items are Regular Sales
      determinedSalesType = 'Regular Sale';
      appropriateCreditDays = dealer.creditDaysRegular || dealer.creditDays || creditDays;
      console.log('✅ All Regular Sales - Using Regular credit days:', appropriateCreditDays);
    } else if (hasCDSales && hasRegularSales) {
      // Mixed sales - use the longer credit period (typically CD Sales has longer credit)
      const cdDays = dealer.creditDaysCD || dealer.creditDays || 0;
      const regularDays = dealer.creditDaysRegular || dealer.creditDays || 0;
      appropriateCreditDays = Math.max(cdDays, regularDays, creditDays);
      determinedSalesType = 'Mixed'; // Indicate mixed sales
      console.log('✅ Mixed Sales - Using longer credit period:', appropriateCreditDays);
    }
    
    console.log(`📋 Sales Type Determination:`, {
      hasCDSales,
      hasRegularSales,
      determinedSalesType,
      providedCreditDays: creditDays,
      appropriateCreditDays,
      dealerCreditDaysCD: dealer.creditDaysCD,
      dealerCreditDaysRegular: dealer.creditDaysRegular,
      dealerCreditDays: dealer.creditDays
    });

    // Canonicalization above is the sole discount-policy authority.

    // Get sales order if provided
    let salesOrder = null;
    if (salesOrderId) {
      salesOrder = await SalesOrder.findById(salesOrderId);
      if (!salesOrder) {
        return res.status(404).json({
          success: false,
          message: "Sales order not found"
        });
      }

      // ── DUPLICATE INVOICE CHECK ──────────────────────────────────────────
      // Block creation if a non-cancelled invoice already exists for this SO
      const existingInvoice = await DealerInvoice.findOne({
        salesOrder: salesOrderId,
        status: { $nin: ['Cancelled', 'Rejected'] },
        isDeleted: { $ne: true }
      });

      if (existingInvoice) {
        const isDraft = existingInvoice.isDraft || existingInvoice.status === 'Draft';
        return res.status(400).json({
          success: false,
          message: isDraft
            ? `A draft invoice already exists for sales order ${salesOrder.orderNumber}. Please approve or delete the existing draft before creating a new one.`
            : `Invoice ${existingInvoice.invoiceNumber} already exists for sales order ${salesOrder.orderNumber}. Cannot create duplicate invoice.`,
          existingInvoiceId: existingInvoice._id,
          existingInvoiceNumber: existingInvoice.invoiceNumber || 'DRAFT',
          isDraft
        });
      }
      // ── END DUPLICATE CHECK ──────────────────────────────────────────────
    }

    // DON'T generate invoice number for drafts - will be generated on approval
    // const invoiceNumber = await generateInvoiceNumber(); // REMOVED

    // Create invoice data as DRAFT
    // NOTE: Do NOT set invoiceNumber for drafts — leaving it undefined allows
    // the sparse unique index to permit multiple drafts without conflict
    const invoiceData = {
      // invoiceNumber is intentionally omitted (undefined) for drafts
      invoiceDate: null,   // No date for drafts
      isDraft: true,       // Mark as draft
      status: "Draft",     // Set status to Draft
      dealer: dealerId,
      dealerName: dealer.name,
      dealerCode: dealer.code,
      dealerType: dealer.dealerType,
      region: dealer.regionId,
      pinCode: dealer.address?.split(',').pop()?.trim() || "",
      salesOrder: salesOrderId,
      salesOrderNumber: salesOrder?.orderNumber || "",
      creditDays: appropriateCreditDays, // Use the determined credit days based on sales type
      items,
      remarks,
      internalNotes,
      subtotal: subtotal || 0,
      totalDiscount: totalDiscount || 0,
      totalIncrease: totalIncrease || 0,
      totalGst: totalGst || 0,
      totalAmount: totalAmount || 0,
      totalPoints: totalPoints || 0,
      createdBy: req.user._id
    };

    // Add customer information if provided
    if (customerInfo) {
      invoiceData.customerName = customerInfo.name || dealer.name;
      invoiceData.customerAddress = customerInfo.address || dealer.address;
      invoiceData.customerPhone = customerInfo.phone || dealer.phone;
      invoiceData.customerEmail = customerInfo.email || dealer.email;
      invoiceData.customerGST = customerInfo.gst || dealer.gst;
    }

    // Create the invoice as DRAFT
    const invoice = new DealerInvoice(invoiceData);
    await invoice.save();

    console.log(`✅ Draft invoice created: ${invoice._id} (no invoice number yet)`);

    // DON'T create dealer ledger entry for drafts - will be created on approval
    // Ledger entry creation moved to approval step
    
    /* REMOVED - Will be done on approval
    // Create dealer ledger entry for the invoice
    try {
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: dealerId },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: dealerId,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        entryDate: invoice.invoiceDate,
        transactionType: "Invoice",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: invoice.totalAmount,
        // Use the determined sales type from invoice creation
        salesType: determinedSalesType,
        // Use the appropriate credit days that were calculated
        creditDaysApplied: appropriateCreditDays,
        debitAmount: invoice.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + invoice.totalAmount,
        description: `Invoice ${invoice.invoiceNumber} (${determinedSalesType})`,
        creditDays: appropriateCreditDays,
        dueDate: invoice.dueDate,
        pointsEarned: invoice.totalPoints || 0,
        schemeAmount: invoice.totalDiscount || 0,
        createdBy: req.user._id
      });
      
      await ledgerEntry.save();
      console.log(`Created ledger entry for invoice: ${invoice.invoiceNumber}`);
    } catch (ledgerError) {
      console.error("Error creating ledger entry for invoice:", ledgerError);
      // Don't fail the invoice creation if ledger entry fails
    }

    // Create notification for dealer about invoice generation
    try {
      // Build notification message
      let message = `Invoice ${invoice.invoiceNumber} has been generated for an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      
      // Include sales order number if available
      if (salesOrder && salesOrder.orderNumber) {
        message = `Invoice ${invoice.invoiceNumber} has been generated for your purchase order ${salesOrder.orderNumber} with an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      }
      */
      
      /* REMOVED - Notifications will be sent on approval
      const title = salesOrder && salesOrder.orderNumber 
        ? `Invoice Generated for Order ${salesOrder.orderNumber}`
        : `Invoice ${invoice.invoiceNumber} Generated`;
      
      // Create notification
      await Notification.create({
        dealer: dealerId,
        type: 'system',
        title: title,
        message: message,
        orderId: salesOrderId || null,
        orderNumber: salesOrder?.orderNumber || null,
        status: null,
        read: false,
        priority: 'high',
        metadata: {
          originalType: 'invoice_created',
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.totalAmount,
          salesOrderNumber: salesOrder?.orderNumber || null
        }
      });
      
      console.log(`📧 Notification created for dealer ${dealerId} (${dealer.name}): Invoice ${invoice.invoiceNumber} generated`);
    } catch (notificationError) {
      console.error('Error creating notification for invoice:', notificationError);
      // Don't fail the invoice creation if notification fails
    }

    // Create notification for points earned if points > 0
    if (invoice.totalPoints && invoice.totalPoints > 0) {
      try {
        const pointsMessage = salesOrder && salesOrder.orderNumber
          ? `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber} for your purchase order ${salesOrder.orderNumber}.`
          : `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber}.`;
        
        await Notification.create({
          dealer: dealerId,
          type: 'system',
          title: 'Points Earned! 🎉',
          message: pointsMessage,
          orderId: salesOrderId || null,
          orderNumber: salesOrder?.orderNumber || null,
          status: null,
          read: false,
          priority: 'high',
          metadata: {
            originalType: 'points_earned',
            invoiceId: invoice._id.toString(),
            invoiceNumber: invoice.invoiceNumber,
            pointsEarned: invoice.totalPoints,
            salesOrderNumber: salesOrder?.orderNumber || null
          }
        });
        
        console.log(`🎉 Points notification created for dealer ${dealerId} (${dealer.name}): ${invoice.totalPoints} points earned from invoice ${invoice.invoiceNumber}`);
      } catch (pointsNotificationError) {
        console.error('Error creating points notification:', pointsNotificationError);
        // Don't fail the invoice creation if notification fails
      }
    }
    */

    // Populate the created invoice
    const populatedInvoice = await DealerInvoice.findById(invoice._id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.oneTimePriceIncreaseAppliedBy", "name email")
      .populate("items.warehouse", "name");

    res.status(201).json({
      success: true,
      message: "Draft invoice created successfully. Approve to generate invoice number.",
      invoice: populatedInvoice
    });
  } catch (error) {
    console.error("Create dealer invoice error:", error);
    
    if (error?.name === 'DiscountPolicyError' || error instanceof RangeError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code || 'DISCOUNT_POLICY_INVALID',
        violations: error.violations || []
      });
    }

    // Handle duplicate key error on invoiceNumber (null) — fix stale non-sparse index
    if (error.code === 11000 && error.keyPattern?.invoiceNumber) {
      try {
        console.log('🔧 Fixing stale invoiceNumber index (dropping non-sparse and recreating as sparse)...');
        const collection = req.dbConnection.collection('dealerinvoices');
        await collection.dropIndex('invoiceNumber_1');
        await collection.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true });
        console.log('✅ Index fixed. Please retry creating the invoice.');
        return res.status(409).json({
          success: false,
          message: "Database index was repaired. Please try creating the invoice again."
        });
      } catch (indexError) {
        console.error('Failed to fix index:', indexError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: "Server error while creating dealer invoice"
    });
  }
};

// @desc    Approve draft invoice (generate invoice number, create ledger entry)
// @route   PUT /api/dealer-invoices/:id/approve
// @access  Private
export const approveDealerInvoice = async (req, res) => {
  const session = await req.dbConnection.startSession();
  
  try {
    // Get models from company-specific connection
    const { DealerInvoice, Dealer, Product, SalesOrder, Stock, StockMovement, DealerLedger, Points, Notification } = getModels(req.dbConnection);
    
    await session.startTransaction();
    
    const invoice = await DealerInvoice.findById(req.params.id).session(session);
    
    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }
    
    if (invoice.status !== "Draft" || invoice.isDraft !== true || invoice.isDeleted === true) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: "Only active draft invoices can be approved"
      });
    }
    
    console.log(`📋 Approving draft invoice ${invoice._id}...`);

    // ── QUANTITY SYNC CHECK ──────────────────────────────────────────────────
    // If this invoice is linked to a sales order, verify quantities match.
    // If the SO was edited (partial dispatch / quantity reduction) after the
    // draft was created and the user didn't click Sync, block approval.
    if (invoice.salesOrder) {
      const linkedSO = await SalesOrder.findById(invoice.salesOrder).session(session);
      if (!linkedSO) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: "Cannot approve because the linked sales order no longer exists."
        });
      }

      const sourceLinesById = new Map();
      const sourceLinesByProduct = new Map();
      for (const productLine of linkedSO.products || []) {
        const sourceLineId = objectIdString(productLine._id);
        const productId = objectIdString(productLine.product?._id || productLine.product);
        sourceLinesById.set(sourceLineId, productLine);
        const lines = sourceLinesByProduct.get(productId) || [];
        lines.push(productLine);
        sourceLinesByProduct.set(productId, lines);
      }

      const invoiceQtyBySourceId = new Map();
      const productNames = new Map();
      const identityErrors = [];
      for (const item of invoice.items || []) {
        const productId = objectIdString(item.product?._id || item.product);
        const explicitSourceLineId = objectIdString(item.sourceSalesOrderLineId);
        const productCandidates = sourceLinesByProduct.get(productId) || [];
        let sourceLineId = explicitSourceLineId;

        if (!sourceLineId) {
          if (productCandidates.length > 1) {
            identityErrors.push({
              productName: item.productName || productId,
              code: 'SOURCE_SALES_ORDER_LINE_ID_REQUIRED',
              message: 'sourceSalesOrderLineId is required for duplicate product lines.'
            });
            continue;
          }
          sourceLineId = objectIdString(productCandidates[0]?._id);
        }

        const sourceLine = sourceLinesById.get(sourceLineId);
        if (!sourceLine || objectIdString(sourceLine.product) !== productId) {
          identityErrors.push({
            productName: item.productName || productId,
            sourceSalesOrderLineId: sourceLineId || null,
            code: 'SALES_ORDER_LINE_NOT_FOUND',
            message: 'Invoice source line does not match the linked sales order.'
          });
          continue;
        }
        if (invoiceQtyBySourceId.has(sourceLineId)) {
          identityErrors.push({
            productName: item.productName || productId,
            sourceSalesOrderLineId: sourceLineId,
            code: 'DUPLICATE_SALES_ORDER_LINE_ID',
            message: 'The same Sales Order line is used by more than one invoice item.'
          });
          continue;
        }

        invoiceQtyBySourceId.set(sourceLineId, Number(item.quantity || 0));
        productNames.set(sourceLineId, item.productName || sourceLine.productName || productId);
      }

      if (identityErrors.length > 0) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'Cannot approve — linked invoice line identity is ambiguous or invalid. Sync the invoice with sourceSalesOrderLineId values.',
          code: identityErrors[0].code,
          identityErrors
        });
      }

      const mismatches = [];
      for (const [sourceLineId, productLine] of sourceLinesById.entries()) {
        const salesOrderQty = Number(productLine.quantity || 0);
        const invoiceQty = invoiceQtyBySourceId.get(sourceLineId) || 0;
        if (salesOrderQty !== invoiceQty) {
          mismatches.push({
            sourceSalesOrderLineId: sourceLineId,
            productName: productNames.get(sourceLineId) || productLine.productName || sourceLineId,
            invoiceQty,
            salesOrderQty,
            removed: invoiceQty === 0
          });
        }
      }

      if (mismatches.length > 0) {
        await session.abortTransaction();
        const detail = mismatches
          .map(mismatch => `• ${mismatch.productName}: invoice has ${mismatch.invoiceQty}, sales order has ${mismatch.salesOrderQty}`)
          .join('\n');
        return res.status(409).json({
          success: false,
          message: `Cannot approve — invoice quantities don't match the linked sales order (${linkedSO.orderNumber}). Please use the Sync button to update the invoice before approving.`,
          mismatches,
          detail
        });
      }

      // Rebuild every linked line from the Sales Order's persisted ordered stages.
      // This both rejects driver mutations and overwrites any stale/tampered draft
      // monetary or snapshot fields before approval side effects are created.
      const dealerForReplay = await Dealer.findById(invoice.dealer)
        .select('dealerType extraDiscounts')
        .session(session)
        .lean();
      if (!dealerForReplay) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'Cannot approve because the invoice dealer no longer exists.'
        });
      }
      // Approval validates persisted level choices against the user who last
      // selected/canonicalized them, not against the approver. Approval rights
      // and discount-level ownership are separate responsibilities.
      const persistedLevelActorIds = [...new Set(
        invoice.items
          .filter((item) => (item.selectedDiscountLevels || []).length > 0)
          .map((item) => objectIdString(item.discountPermissionSnapshot?.actorUserId))
          .filter(Boolean)
      )];
      const levelAuthorizationActorId = persistedLevelActorIds.length === 1
        ? persistedLevelActorIds[0]
        : (objectIdString(invoice.createdBy) || req.user._id);
      const replayedItems = await canonicalizeInvoiceItems({
        items: invoice.items.map(item => item.toObject()),
        existingItems: invoice.items.map(item => item.toObject()),
        dealer: dealerForReplay,
        dbConnection: req.dbConnection,
        actorId: levelAuthorizationActorId,
        salesOrderId: invoice.salesOrder,
        session
      });
      invoice.set('items', replayedItems);

      // Serialize approval against partial dispatch without changing order business data.
      // A concurrent SalesOrder write either prevents this version match or causes a
      // transaction write conflict, so only one transaction can commit its snapshot.
      const serializationFilter = linkedSO.__v == null
        ? { _id: linkedSO._id, __v: { $exists: false } }
        : { _id: linkedSO._id, __v: linkedSO.__v };
      const serializationResult = await SalesOrder.collection.updateOne(
        serializationFilter,
        { $inc: { __v: 1 }, $currentDate: { updatedAt: true } },
        { session }
      );
      const serializedCount = serializationResult.matchedCount
        ?? serializationResult.result?.n
        ?? 0;
      if (serializedCount !== 1) {
        throw createDiscountPolicyError(
          'The linked Sales Order changed during approval. Sync the invoice and try again.',
          'SALES_ORDER_CHANGED_DURING_APPROVAL'
        );
      }
    }
    // ── END QUANTITY AND POLICY SYNC CHECK ─────────────────────────────────

    // Generate invoice number NOW
    invoice.invoiceNumber = await generateInvoiceNumber(req.dbConnection);
    invoice.invoiceDate = new Date();
    invoice.status = "Approved";
    invoice.isDraft = false;
    invoice.approvedBy = req.user._id;
    invoice.approvedAt = new Date();
    
    // Calculate due date based on credit days
    invoice.dueDate = new Date();
    invoice.dueDate.setDate(invoice.dueDate.getDate() + (invoice.creditDays || 30));
    
    await invoice.save({ session });
    
    console.log(`✅ Invoice number generated: ${invoice.invoiceNumber}`);
    
    // CRITICAL FIX: Remove/Reverse the sales order ledger entry to prevent double blocking
    if (invoice.salesOrder) {
      try {
        console.log(`🔄 Checking for sales order ledger entry to remove/reverse...`);
        
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        if (salesOrder) {
          // Find the "Order Confirmed" ledger entry for this sales order
          const orderLedgerEntry = await DealerLedger.findOne({
            dealer: invoice.dealer,
            transactionType: "Order Confirmed",
            description: { $regex: salesOrder.orderNumber }
          }).session(session);
          
          if (orderLedgerEntry) {
            console.log(`✅ Found order ledger entry: ${orderLedgerEntry._id}`);
            console.log(`   Amount blocked by order: ₹${orderLedgerEntry.debitAmount.toLocaleString()}`);
            
            // Get the last entry for running balance calculation
            const lastEntry = await DealerLedger.findOne(
              { dealer: invoice.dealer },
              {},
              { sort: { 'createdAt': -1 } }
            ).session(session);
            
            let previousBalance = lastEntry ? lastEntry.runningBalance : 0;
            
            // Create REVERSE entry to unblock the order amount
            const reverseLedgerEntry = new DealerLedger({
              dealer: invoice.dealer,
              dealerName: invoice.dealerName,
              dealerCode: invoice.dealerCode,
              entryDate: invoice.invoiceDate,
              transactionType: "Order Confirmed - Reversed",
              description: `Reversed: Order ${salesOrder.orderNumber} (Invoice ${invoice.invoiceNumber} generated)`,
              remarks: `Credit unblocked - order ${salesOrder.orderNumber} converted to invoice ${invoice.invoiceNumber}. This reverses the credit block from order confirmation.`,
              debitAmount: 0,
              creditAmount: orderLedgerEntry.debitAmount, // Unblock the order amount
              runningBalance: previousBalance - orderLedgerEntry.debitAmount,
              status: "Active",
              createdBy: req.user._id
            });
            
            await reverseLedgerEntry.save({ session });
            console.log(`✅ Reversed order ledger entry - Unblocked: ₹${orderLedgerEntry.debitAmount.toLocaleString()}`);
            console.log(`   New running balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);
          } else {
            console.log(`ℹ️ No order ledger entry found for ${salesOrder.orderNumber} - may not have been confirmed or already reversed`);
          }
        }
      } catch (reverseError) {
        console.error("❌ Error reversing order ledger entry:", reverseError);
        throw reverseError;
      }
    }
    
    // NOW create ledger entry for the invoice
    try {
      const dealer = await Dealer.findById(invoice.dealer).session(session);
      
      // A Sales Order over-limit approval covers only the exposure recorded when
      // it was approved. An invoice-only increase must not silently extend it.
      let approvedOrderExposure = null;
      let approvedOrderNumber = null;
      if (invoice.salesOrder) {
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        const approvedExposure = Number(salesOrder?.creditOverlimit?.newOutstanding);
        if (salesOrder?.creditOverlimit?.isOverlimit
            && salesOrder.creditOverlimit.approvedBy
            && Number.isFinite(approvedExposure)) {
          approvedOrderExposure = approvedExposure;
          approvedOrderNumber = salesOrder.orderNumber;
        }
      }

      await acquireDealerCreditLock(req.dbConnection, invoice.dealer, session);
      const creditExposure = await getDealerCreditExposure(
        req.dbConnection,
        invoice.dealer,
        { excludeSalesOrderId: invoice.salesOrder, session }
      );
      const creditEvaluation = evaluateDealerCredit({
        creditLimit: creditExposure.creditLimit,
        existingExposure: creditExposure.totalExposure,
        candidateAmount: invoice.totalAmount
      });
      const orderApprovalCoversCurrentExposure = approvedOrderExposure !== null
        && creditEvaluation.projectedExposure <= approvedOrderExposure + 0.01;

      if (!creditExposure.limitConfigured) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          code: 'DEALER_CREDIT_LIMIT_REQUIRED',
          message: 'Cannot approve invoice because the dealer credit limit is not configured.'
        });
      }

      console.log('💳 Canonical Dealer Invoice Credit Check:', {
        ledgerBalance: creditExposure.ledgerBalance,
        uninvoicedSalesOrders: creditExposure.uninvoicedSalesOrderAmount,
        ...creditEvaluation,
        approvedOrderExposure,
        orderApprovalCoversCurrentExposure
      });

      if (creditEvaluation.isOverlimit && !orderApprovalCoversCurrentExposure) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: approvedOrderExposure !== null
            ? `Cannot approve invoice - adjusted exposure exceeds the amount approved on Sales Order ${approvedOrderNumber}. New credit approval is required.`
            : `Cannot approve invoice - Credit limit exceeded by ₹${creditEvaluation.overlimitAmount.toLocaleString('en-IN')}`,
          code: approvedOrderExposure !== null
            ? 'SALES_ORDER_APPROVED_EXPOSURE_EXCEEDED'
            : 'DEALER_CREDIT_LIMIT_EXCEEDED',
          creditLimitInfo: {
            creditLimit: creditEvaluation.creditLimit,
            currentOutstanding: creditEvaluation.currentOutstanding,
            ledgerBalance: creditExposure.ledgerBalance,
            confirmedOrdersAmount: creditExposure.uninvoicedSalesOrderAmount,
            invoiceAmount: creditEvaluation.candidateAmount,
            newOutstanding: creditEvaluation.projectedExposure,
            approvedOrderExposure,
            overlimitAmount: creditEvaluation.overlimitAmount,
            availableCredit: creditEvaluation.availableCredit
          }
        });
      }

      if (creditEvaluation.isOverlimit && orderApprovalCoversCurrentExposure) {
        console.log(`✅ Sales Order ${approvedOrderNumber} approval covers adjusted exposure up to ₹${approvedOrderExposure.toLocaleString('en-IN')}`);
      }
      
      // Get the last entry for this dealer to calculate running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: invoice.dealer },
        {},
        { sort: { 'createdAt': -1 } }
      ).session(session);
      
      let previousBalance = 0;
      if (lastEntry) {
        previousBalance = lastEntry.runningBalance;
      }
      
      // Determine sales type from items
      let determinedSalesType = 'Regular Sale';
      const hasCDSales = invoice.items.some(item => item.salesType === 'CD Sales');
      const hasRegularSales = invoice.items.some(item => item.salesType === 'Regular Sale' || !item.salesType);
      
      if (hasCDSales && !hasRegularSales) {
        determinedSalesType = 'CD Sales';
      } else if (hasCDSales && hasRegularSales) {
        determinedSalesType = 'Mixed';
      }
      
      const ledgerEntry = new DealerLedger({
        dealer: invoice.dealer,
        dealerName: invoice.dealerName,
        dealerCode: invoice.dealerCode,
        entryDate: invoice.invoiceDate,
        transactionType: "Invoice",
        invoice: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceValue: invoice.totalAmount,
        salesType: determinedSalesType,
        creditDaysApplied: invoice.creditDays,
        debitAmount: invoice.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + invoice.totalAmount,
        description: `Invoice ${invoice.invoiceNumber} (${determinedSalesType})`,
        creditDays: invoice.creditDays,
        dueDate: invoice.dueDate,
        pointsEarned: invoice.totalPoints || 0,
        schemeAmount: invoice.totalDiscount || 0,
        createdBy: req.user._id
      });
      
      await ledgerEntry.save({ session });
      console.log(`✅ Ledger entry created for invoice: ${invoice.invoiceNumber}`);
    } catch (ledgerError) {
      console.error("Error creating ledger entry:", ledgerError);
      throw ledgerError; // Fail the transaction if ledger creation fails
    }
    
    // GL posting is part of the same transaction as invoice approval and the
    // dealer subledger. Missing accounts or an unbalanced journal abort approval.
    await createDealerInvoiceEntry(invoice, req.dbConnection, req.user._id, {
      session,
      throwOnError: true,
    });

    // NOW create notifications
    try {
      const salesOrder = invoice.salesOrder ? await SalesOrder.findById(invoice.salesOrder).session(session) : null;
      
      // Invoice generated notification
      let message = `Invoice ${invoice.invoiceNumber} has been generated for an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      if (salesOrder && salesOrder.orderNumber) {
        message = `Invoice ${invoice.invoiceNumber} has been generated for your purchase order ${salesOrder.orderNumber} with an amount of ₹${invoice.totalAmount.toLocaleString()}.`;
      }
      
      const title = salesOrder && salesOrder.orderNumber 
        ? `Invoice Generated for Order ${salesOrder.orderNumber}`
        : `Invoice ${invoice.invoiceNumber} Generated`;
      
      await Notification.create([{
        dealer: invoice.dealer,
        type: 'system',
        title: title,
        message: message,
        orderId: invoice.salesOrder || null,
        orderNumber: salesOrder?.orderNumber || null,
        status: null,
        read: false,
        priority: 'high',
        metadata: {
          originalType: 'invoice_created',
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.totalAmount,
          salesOrderNumber: salesOrder?.orderNumber || null
        }
      }], { session });
      
      console.log(`✅ Notification created for invoice: ${invoice.invoiceNumber}`);

      // Send push notification
      try {
        const dealerDoc = await Dealer.findById(invoice.dealer).select('fcmToken').lean();
        if (dealerDoc?.fcmToken) {
          await sendPushNotification({
            token: dealerDoc.fcmToken,
            title,
            body: message,
            data: { type: 'invoice', invoiceId: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber },
          });
        }
      } catch (pushErr) { console.error('Push error (non-fatal):', pushErr.message); }
      
      // Points earned notification
      if (invoice.totalPoints && invoice.totalPoints > 0) {
        const pointsMessage = salesOrder && salesOrder.orderNumber
          ? `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber} for your purchase order ${salesOrder.orderNumber}.`
          : `You have earned ${invoice.totalPoints} points from invoice ${invoice.invoiceNumber}.`;
        
        await Notification.create([{
          dealer: invoice.dealer,
          type: 'system',
          title: 'Points Earned! 🎉',
          message: pointsMessage,
          orderId: invoice.salesOrder || null,
          orderNumber: salesOrder?.orderNumber || null,
          status: null,
          read: false,
          priority: 'high',
          metadata: {
            originalType: 'points_earned',
            invoiceId: invoice._id.toString(),
            invoiceNumber: invoice.invoiceNumber,
            pointsEarned: invoice.totalPoints,
            salesOrderNumber: salesOrder?.orderNumber || null
          }
        }], { session });
        
        console.log(`✅ Points notification created: ${invoice.totalPoints} points`);
      }
    } catch (notificationError) {
      console.error('Error creating notifications:', notificationError);
      // Don't fail the transaction if notification fails
    }
    
    await session.commitTransaction();
    
    // Populate and return the approved invoice
    const populatedInvoice = await DealerInvoice.findById(invoice._id)
      .populate("dealer", "name code dealerType")
      .populate("region", "name")
      .populate("salesOrder", "orderNumber")
      .populate("items.product", "itemName productCode HSNCode")
      .populate("items.oneTimePriceIncreaseAppliedBy", "name email")
      .populate("items.warehouse", "name")
      .populate("approvedBy", "name email");
    
    console.log(`🎉 Invoice approved successfully: ${invoice.invoiceNumber}`);
    
    res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} approved successfully`,
      invoice: populatedInvoice
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Approve invoice error:", error);
    if (error?.name === 'DiscountPolicyError' || error instanceof RangeError) {
      return res.status(409).json({
        success: false,
        message: error.message,
        code: error.code || 'DISCOUNT_POLICY_INVALID',
        violations: error.violations || []
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error while approving invoice",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Update dealer invoice
// @route   PUT /api/dealer-invoices/:id
// @access  Private
export const updateDealerInvoice = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);
    const { id } = req.params;

    const invoice = await DealerInvoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Dealer invoice not found"
      });
    }

    if (invoice.status !== "Draft" || invoice.isDraft !== true || invoice.isDeleted === true) {
      return res.status(409).json({
        success: false,
        message: "Only active draft invoices can be edited"
      });
    }

    await assertPeriodOpen(req.dbConnection, invoice.invoiceDate, 'dealer invoice');
    
    const beforeDoc = invoice.toObject();
    let canonicalItems = null;
    if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
      const dealer = await Dealer.findById(invoice.dealer).select('dealerType extraDiscounts').lean();
      if (!dealer) {
        return res.status(409).json({ success: false, message: "Invoice dealer no longer exists" });
      }
      canonicalItems = await canonicalizeInvoiceItems({
        items: req.body.items,
        existingItems: invoice.items.map((item) => item.toObject()),
        dealer,
        dbConnection: req.dbConnection,
        actorId: req.user._id,
        salesOrderId: invoice.salesOrder
      });
    }

    const allowedFields = ["items", "creditDays", "remarks", "internalNotes", "printSettings"];
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        invoice.set(field, field === "items" ? canonicalItems : req.body[field]);
      }
    }

    if (req.body.customerInfo && typeof req.body.customerInfo === "object") {
      const customerFieldMap = {
        name: "customerName",
        address: "customerAddress",
        phone: "customerPhone",
        email: "customerEmail",
        gst: "customerGST"
      };
      for (const [requestField, modelField] of Object.entries(customerFieldMap)) {
        if (Object.prototype.hasOwnProperty.call(req.body.customerInfo, requestField)) {
          invoice.set(modelField, req.body.customerInfo[requestField]);
        }
      }
    }

    const changedFields = invoice.modifiedPaths();
    await invoice.save();
    const afterDoc = invoice.toObject();

    await recordUpdate(req.dbConnection, {
      entity: 'DealerInvoice',
      entityId: invoice._id,
      documentNumber: invoice.invoiceNumber,
      before: beforeDoc,
      after: afterDoc,
      fields: changedFields,
      req
    });

    await invoice.populate([
      { path: "dealer", select: "name code dealerType" },
      { path: "region", select: "name" },
      { path: "salesOrder", select: "orderNumber" },
      { path: "items.product", select: "itemName productCode HSNCode" },
      { path: "items.oneTimePriceIncreaseAppliedBy", select: "name email" },
      { path: "items.warehouse", select: "name" }
    ]);

    return res.json({
      success: true,
      message: "Draft invoice updated successfully",
      invoice
    });
  } catch (error) {
    if (handlePeriodLockError(error, res)) return;
    if (error?.name === "DiscountPolicyError" || error instanceof RangeError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: error.code || "DISCOUNT_POLICY_INVALID",
        violations: error.violations || []
      });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    console.error("Update dealer invoice error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating dealer invoice"
    });
  }
};

// @desc    Delete dealer invoice
// @desc    Delete Draft or Cancel Approved Invoice
// @route   DELETE /api/dealer-invoices/:id
// @access  Private
export const deleteDealerInvoice = async (req, res) => {
  const session = await req.dbConnection.startSession();
  
  try {
    // Get models from company-specific connection
    const { DealerInvoice, DealerLedger, PaymentAllocation, DealerPayment, Voucher, StockMovement, Points, SalesOrder } = getModels(req.dbConnection);
    
    await session.startTransaction();
    
    const { reason } = req.body;
    const cancellationDate = new Date();
    const invoice = await DealerInvoice.findById(req.params.id).session(session);

    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    const isDraftDeletion = invoice.status === "Draft" && invoice.isDraft === true;
    const isApprovedCancellation = invoice.status === "Approved" && invoice.isDraft === false;

    if (!isDraftDeletion && !isApprovedCancellation) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Only draft invoices can be deleted and only approved invoices can be cancelled"
      });
    }

    const requiredPermission = isDraftDeletion ? "invoices.delete" : "invoices.cancel";
    const hasStatusPermission = req.user?.role === "super_admin"
      || userHasPermission(req.user?.permissions, [requiredPermission, "invoice"]);

    if (!hasStatusPermission) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${requiredPermission}`
      });
    }

    console.log(`📄 Invoice ${invoice._id}, Status: ${invoice.status}, Draft: ${invoice.isDraft}`);

    // Draft deletion validates its document date. An approved cancellation
    // validates the exact date used by every reversal record.
    await assertPeriodOpen(
      req.dbConnection,
      isApprovedCancellation ? cancellationDate : invoice.invoiceDate,
      'dealer invoice cancellation',
      { session }
    );

    await acquireDealerCreditLock(req.dbConnection, invoice.dealer, session);

    // CASE 1: Delete Draft Invoice (permanently delete)
    if (invoice.status === "Draft" || invoice.isDraft) {
      console.log(`🗑️ Permanently deleting draft invoice ${invoice._id}`);
      
      // Release sales order
      if (invoice.salesOrder) {
        await SalesOrder.findByIdAndUpdate(
          invoice.salesOrder,
          { status: "Confirmed" },
          { session }
        );
        console.log(`✅ Sales order ${invoice.salesOrder} released`);
      }
      
      // Permanently delete the draft
      await DealerInvoice.findByIdAndDelete(invoice._id).session(session);
      
      await session.commitTransaction();

      try {
        await recordCancel(req.dbConnection, {
          entity: 'DealerInvoice',
          entityId: invoice._id,
          documentNumber: invoice.invoiceNumber || 'DRAFT',
          req,
          reason: 'Draft invoice deleted',
        });
      } catch (auditError) {
        console.error('Draft invoice deletion audit failed after commit:', auditError.message);
      }
      
      return res.json({
        success: true,
        message: "Draft invoice deleted successfully"
      });
    }

    // CASE 2: Cancel Approved Invoice (soft delete)
    if (invoice.status === "Approved") {
      console.log(`❌ Cancelling approved invoice ${invoice.invoiceNumber}`);
      
      // Prevent cancellation if payment has been made
      if (invoice.paidAmount && invoice.paidAmount > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Cannot cancel invoice with payments. Please refund payments first."
        });
      }

      // SOFT DELETE: Mark as cancelled
      invoice.isDeleted = true;
      invoice.deletedAt = cancellationDate;
      invoice.deletedBy = req.user._id;
      invoice.deletionReason = reason || 'No reason provided';
      invoice.cancellationReason = reason || 'No reason provided';
      invoice.status = 'Cancelled';
      
      await invoice.save({ session });
      console.log(`✅ Invoice marked as cancelled`);
      
      // RELEASE SALES ORDER
    let salesOrderReleased = false;
    if (invoice.salesOrder) {
      try {
        const salesOrder = await SalesOrder.findById(invoice.salesOrder).session(session);
        
        if (salesOrder) {
          console.log(`📋 Releasing sales order ${salesOrder.orderNumber} - setting status back to Confirmed`);
          
          // Set status back to Confirmed so it can be invoiced again
          salesOrder.status = 'Confirmed';
          await salesOrder.save({ session });
          salesOrderReleased = true;
          
          console.log(`✅ Sales order ${salesOrder.orderNumber} released - can create new invoice`);
        }
      } catch (soError) {
        console.error('Error releasing Sales Order during invoice cancellation:', soError);
        throw soError;
      }
    }
    
    // REVERSE STOCK MOVEMENTS: Restore stock that was deducted
    let stockReversed = false;
    let reversedStockKeys = [];
    try {
      const stockMovements = await StockMovement.find({
        referenceNo: invoice.invoiceNumber,
        referenceType: 'INVOICE'
      }).session(session);
      
      if (stockMovements.length > 0) {
        console.log(`📦 Reversing ${stockMovements.length} stock movements`);

        await StockMovementService.acquireStockLocks(
          req.dbConnection,
          stockMovements.map((movement) => StockMovementService.stockKey(
            movement.productId,
            movement.warehouseId
          )),
          session
        );
        await StockMovementService.appendMovements(
          stockMovements.map((movement) => ({
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            type: movement.type === 'OUT' ? 'IN' : 'OUT',
            quantity: movement.quantity,
            referenceNo: invoice.invoiceNumber,
            referenceType: 'INVOICE_CANCELLATION',
            operationKey: `INVOICE_CANCELLATION:${invoice._id}:${movement._id}`,
            movementRole: 'REVERSAL',
            date: cancellationDate,
            remarks: `Reversal of invoice ${invoice.invoiceNumber} cancellation`,
            createdBy: req.user._id
          })),
          { dbConnection: req.dbConnection, session, locksAcquired: true }
        );

        reversedStockKeys = stockMovements.map((movement) => ({
          productId: movement.productId,
          warehouseId: movement.warehouseId
        }));
        stockReversed = true;
        console.log(`✅ Stock movements reversed`);
      } else {
        console.log(`ℹ️ No stock movements found for invoice ${invoice.invoiceNumber}`);
      }
    } catch (stockError) {
      console.error('Error reversing stock during invoice cancellation:', stockError);
      throw stockError;
    }
    
    // REVERSE LEDGER ENTRIES: Remove dealer ledger entries
    let ledgerReversed = false;
    try {
      const ledgerEntries = await DealerLedger.find({
        invoiceNumber: invoice.invoiceNumber
      }).session(session);
      
      if (ledgerEntries.length > 0) {
        console.log(`💰 Reversing ${ledgerEntries.length} ledger entries`);
        
        for (const entry of ledgerEntries) {
          // Create reverse entry
          const reverseEntry = new DealerLedger({
            dealer: entry.dealer,
            transactionType: 'Adjustment', // Use valid enum value
            invoiceNumber: invoice.invoiceNumber,
            entryDate: cancellationDate,
            debitAmount: entry.creditAmount || 0, // Reverse: debit becomes credit
            creditAmount: entry.debitAmount || 0, // Reverse: credit becomes debit
            runningBalance: 0, // Will be calculated by pre-save hook
            description: `Cancellation of invoice ${invoice.invoiceNumber}`,
            remarks: `Reversal entry for cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason || 'No reason provided'}`,
            createdBy: req.user._id
          });
          
          await reverseEntry.save({ session });
        }
        
        ledgerReversed = true;
        console.log(`✅ Ledger entries reversed`);
      } else {
        console.log(`ℹ️ No ledger entries found for invoice ${invoice.invoiceNumber}`);
      }
    } catch (ledgerError) {
      console.error('Error reversing dealer ledger during invoice cancellation:', ledgerError);
      throw ledgerError;
    }

    await reverseDealerInvoiceEntry(
      invoice,
      req.dbConnection,
      req.user._id,
      reason || 'No reason provided',
      { session, throwOnError: true, reversalDate: cancellationDate }
    );
    
    await session.commitTransaction();

    if (reversedStockKeys.length > 0) {
      try {
        await StockArrivalService.refreshStockKeys(reversedStockKeys, req.dbConnection);
      } catch (refreshError) {
        console.error('Invoice-cancellation stock queue refresh failed:', refreshError.message);
      }
    }
    
    console.log(`✅ Invoice ${invoice.invoiceNumber} cancelled successfully`);

    try {
      await recordCancel(req.dbConnection, {
        entity: 'DealerInvoice',
        entityId: invoice._id,
        documentNumber: invoice.invoiceNumber,
        req,
        reason: reason || 'No reason provided',
      });
    } catch (auditError) {
      console.error('Invoice cancellation audit failed after commit:', auditError.message);
    }

    return res.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} cancelled successfully. Sales order released for new invoice.`,
      data: {
        invoiceNumber: invoice.invoiceNumber,
        salesOrderReleased,
        stockReversed,
        ledgerReversed
      }
    });
    } // Close CASE 2: Cancel Approved Invoice
    
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (handlePeriodLockError(error, res)) return;
    console.error("Cancel dealer invoice error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling dealer invoice",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get invoice statistics
// @route   GET /api/dealer-invoices/stats/overview
// @access  Private
export const getInvoiceStats = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const { startDate, endDate, dealerId } = req.query;
    const filter = {
      isDraft: { $ne: true },
      isDeleted: { $ne: true },
      status: { $nin: ['Draft', 'Cancelled'] }
    };

    if (dealerId) filter.dealer = dealerId;
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) {
        const start = new Date(startDate);
        if (Number.isNaN(start.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid startDate' });
        }
        start.setHours(0, 0, 0, 0);
        filter.invoiceDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid endDate' });
        }
        end.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = end;
      }
      if (filter.invoiceDate.$gte && filter.invoiceDate.$lte
        && filter.invoiceDate.$gte > filter.invoiceDate.$lte) {
        return res.status(400).json({ success: false, message: 'startDate cannot be after endDate' });
      }
    }

    const [
      totalInvoices,
      totalAmount,
      outstandingResult,
      collectedResult,
      pendingInvoices,
      approvedInvoices,
      dispatchedInvoices,
      deliveredInvoices,
      paidInvoices,
      overdueInvoices,
      statusBreakdown
    ] = await Promise.all([
      DealerInvoice.countDocuments(filter),
      DealerInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
      ]),
      DealerInvoice.aggregate([
        { $match: { ...filter, paymentStatus: { $in: ["Pending", "Partial", "Overdue"] } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $max: [
                  { $subtract: ["$totalAmount", { $ifNull: ["$paidAmount", 0] }] },
                  0
                ]
              }
            }
          }
        }
      ]),
      DealerInvoice.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$paidAmount", 0] } } } }
      ]),
      DealerInvoice.countDocuments({ ...filter, status: "Pending" }),
      DealerInvoice.countDocuments({ ...filter, status: "Approved" }),
      DealerInvoice.countDocuments({ ...filter, status: "Dispatched" }),
      DealerInvoice.countDocuments({ ...filter, status: "Delivered" }),
      DealerInvoice.countDocuments({ ...filter, paymentStatus: "Paid" }),
      DealerInvoice.countDocuments({
        ...filter,
        paymentStatus: { $in: ["Pending", "Partial", "Overdue"] },
        dueDate: { $lt: new Date(), $exists: true, $ne: null }
      }),
      DealerInvoice.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            paidAmount: { $sum: { $ifNull: ['$paidAmount', 0] } }
          }
        },
        { $sort: { count: -1, _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalInvoices,
        totalAmount: totalAmount[0]?.total || 0,
        outstandingAmount: outstandingResult[0]?.total || 0,
        paidAmount: collectedResult[0]?.total || 0,
        pendingInvoices,
        approvedInvoices,
        dispatchedInvoices,
        deliveredInvoices,
        paidInvoices,
        overdueInvoices,
        statusBreakdown
      }
    });
  } catch (error) {
    console.error("Get invoice stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching invoice statistics"
    });
  }
};
