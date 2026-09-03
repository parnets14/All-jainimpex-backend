import { randomUUID } from 'node:crypto';
import { dealerSchema } from '../models/Dealer.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { calculateDiscountLine } from '../utils/sequentialDiscountPolicy.js';

const CREDIT_RESERVED_ORDER_STATUSES = ['Confirmed', 'Processing', 'In Transit', 'Delivered'];
const NON_FINANCIAL_ORDER_LEDGER_TYPES = ['Order Confirmed', 'Order Confirmed - Reversed'];

const getModels = (dbConnection) => ({
  Dealer: dbConnection.models.Dealer || dbConnection.model('Dealer', dealerSchema),
  DealerLedger: dbConnection.models.DealerLedger || dbConnection.model('DealerLedger', dealerLedgerSchema),
  DealerInvoice: dbConnection.models.DealerInvoice || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
  SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema)
});

const applySession = (query, session) => (session ? query.session(session) : query);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeWarehouseMarker = (value) => String(value ?? '').trim().toLowerCase();

export const isSalesOrderCreditEligibleProduct = (product) => Boolean(
  product?.warehouse
  && normalizeWarehouseMarker(product.warehouse) !== 'no stock'
  && normalizeWarehouseMarker(product.warehouseName) !== 'no stock'
);

/**
 * Sales Order credit value intentionally ignores level/promise/reference discounts.
 * MRP/unitPrice is GST-inclusive, so GST is not added again. Only Direct and
 * Dealer Extra stages reduce the credit-reserved value, in sequential order.
 */
export const calculateSalesOrderLineCreditAmount = (product = {}) => {
  const grossAmount = Number(product.quantity || 0) * Number(product.unitPrice || 0);
  const orderedStages = product.discountPolicySnapshot?.orderedStages || [];
  let creditStages = orderedStages.filter(
    (stage) => stage.kind === 'direct' || stage.kind === 'dealer_extra'
  );

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

  return money(calculateDiscountLine({
    baseAmount: grossAmount,
    stages: creditStages,
    masterDiscountCap: orderedStages.length === 0
      ? 100
      : (product.discountPolicySnapshot?.masterDiscountCap ?? null)
  }).finalAmount);
};

export const calculateSalesOrderCreditAmount = (products = [], { includeAll = false } = {}) => money(
  products
    .filter((product) => includeAll || isSalesOrderCreditEligibleProduct(product))
    .reduce((sum, product) => sum + calculateSalesOrderLineCreditAmount(product), 0)
);

/**
 * Dealer Master remains the opening-balance source for legacy dealers. New
 * dealers also have a posted Opening Balance ledger row, so the master value is
 * used only when no non-cancelled opening posting exists.
 */
export const calculateDealerLedgerBalance = (dealer = {}, ledgerEntries = []) => {
  const financialEntries = ledgerEntries.filter((entry) => entry?.status !== 'Cancelled');
  const postedBalance = financialEntries.reduce(
    (sum, entry) => sum + Number(entry.debitAmount || 0) - Number(entry.creditAmount || 0),
    0
  );
  const hasPostedOpeningBalance = financialEntries.some(
    (entry) => entry.transactionType === 'Opening Balance'
  );
  const masterOpeningAmount = Number(dealer.openingBalance || 0);
  const masterOpeningBalance = !hasPostedOpeningBalance
    && Number.isFinite(masterOpeningAmount)
    && masterOpeningAmount > 0
    ? (dealer.openingBalanceType === 'Cr' ? -masterOpeningAmount : masterOpeningAmount)
    : 0;

  return money(postedBalance + masterOpeningBalance);
};

export const evaluateDealerCredit = ({
  creditLimit,
  existingExposure,
  candidateAmount = 0
}) => {
  const normalizedLimit = Number(creditLimit);
  const limitConfigured = Number.isFinite(normalizedLimit) && normalizedLimit > 0;
  const normalizedExisting = money(existingExposure);
  const normalizedCandidate = money(candidateAmount);
  const projectedExposure = money(normalizedExisting + normalizedCandidate);

  // Missing, zero, and invalid limits are configuration errors. Dealer Master
  // requires a finite positive limit, so these values must never behave as an
  // implicit unlimited-credit or valid no-credit policy.
  const overlimitAmount = limitConfigured
    ? money(Math.max(0, projectedExposure - normalizedLimit))
    : projectedExposure;

  return {
    creditLimit: limitConfigured ? money(normalizedLimit) : null,
    limitConfigured,
    currentOutstanding: normalizedExisting,
    orderAmount: normalizedCandidate,
    candidateAmount: normalizedCandidate,
    newOutstanding: projectedExposure,
    projectedExposure,
    availableCredit: limitConfigured ? money(Math.max(0, normalizedLimit - normalizedExisting)) : null,
    availableAfter: limitConfigured ? money(Math.max(0, normalizedLimit - projectedExposure)) : null,
    overlimitAmount,
    isOverlimit: !limitConfigured || overlimitAmount > 0
  };
};

/**
 * Single source of truth for dealer credit exposure.
 *
 * ledgerBalance: actual subledger receivable, including Opening Balance exactly
 * once. PaymentAllocation is deliberately not subtracted because the receipt
 * voucher has already posted a DealerLedger credit.
 *
 * uninvoicedSalesOrders: credit reserved by Confirmed/Processing/In Transit/
 * Delivered orders until an active non-draft invoice replaces the reservation.
 */
export const getDealerCreditExposure = async (
  dbConnection,
  dealerId,
  {
    excludeSalesOrderId = null,
    session = null,
    asOf = new Date()
  } = {}
) => {
  const { Dealer, DealerLedger, DealerInvoice, SalesOrder } = getModels(dbConnection);

  const dealerQuery = Dealer.findById(dealerId)
    .select('code name creditLimit creditDays creditDaysRegular creditDaysCD dealerType extraDiscounts ledgerPostingVersion openingBalance openingBalanceType openingBalanceDate')
    .lean();
  const ledgerQuery = DealerLedger.find({
    dealer: dealerId,
    transactionType: { $nin: NON_FINANCIAL_ORDER_LEDGER_TYPES },
    status: { $ne: 'Cancelled' }
  })
    .select('entryDate debitAmount creditAmount transactionType status')
    .sort({ entryDate: 1, createdAt: 1 })
    .lean();
  const ordersQuery = SalesOrder.find({
    dealer: dealerId,
    status: { $in: CREDIT_RESERVED_ORDER_STATUSES },
    ...(excludeSalesOrderId ? { _id: { $ne: excludeSalesOrderId } } : {})
  })
    .select('_id orderNumber status creditAmount totalAmount products')
    .lean();
  const invoicedOrderIdsQuery = DealerInvoice.distinct('salesOrder', {
    dealer: dealerId,
    salesOrder: { $ne: null },
    status: { $nin: ['Cancelled', 'Rejected', 'Draft'] },
    isDraft: { $ne: true },
    isDeleted: { $ne: true }
  });
  const outstandingInvoicesQuery = DealerInvoice.find({
    dealer: dealerId,
    status: 'Approved',
    isDraft: { $ne: true },
    isDeleted: { $ne: true },
    paymentStatus: { $ne: 'Paid' }
  })
    .select('invoiceNumber invoiceDate dueDate totalAmount paidAmount pendingAmount')
    .lean();

  const [dealer, ledgerEntries, reservedOrders, invoicedOrderIds, outstandingInvoices] = await Promise.all([
    applySession(dealerQuery, session),
    applySession(ledgerQuery, session),
    applySession(ordersQuery, session),
    applySession(invoicedOrderIdsQuery, session),
    applySession(outstandingInvoicesQuery, session)
  ]);

  if (!dealer) {
    const error = new Error('Dealer not found');
    error.statusCode = 404;
    throw error;
  }

  const ledgerBalance = calculateDealerLedgerBalance(dealer, ledgerEntries);

  const invoicedSet = new Set(invoicedOrderIds.filter(Boolean).map(String));
  const uninvoicedOrders = reservedOrders
    .filter((order) => !invoicedSet.has(String(order._id)))
    .map((order) => {
      const storedCreditAmount = Number(order.creditAmount);
      const amount = order.creditAmount !== null
        && order.creditAmount !== undefined
        && Number.isFinite(storedCreditAmount)
        ? money(storedCreditAmount)
        : calculateSalesOrderCreditAmount(order.products || []);
      return {
        salesOrderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        amount
      };
    });
  const uninvoicedSalesOrderAmount = money(
    uninvoicedOrders.reduce((sum, order) => sum + order.amount, 0)
  );
  const totalExposure = money(ledgerBalance + uninvoicedSalesOrderAmount);

  const normalizedAsOf = new Date(asOf);
  const invoiceBalances = outstandingInvoices.map((invoice) => {
    const totalAmount = Number(invoice.totalAmount || 0);
    const paidAmount = Number(invoice.paidAmount || 0);
    const pendingAmount = money(Math.max(
      0,
      invoice.pendingAmount == null ? totalAmount - paidAmount : Number(invoice.pendingAmount)
    ));
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      pendingAmount,
      isOverdue: pendingAmount > 0
        && dueDate instanceof Date
        && !Number.isNaN(dueDate.getTime())
        && dueDate < normalizedAsOf
    };
  });
  const overdueAmount = money(invoiceBalances.reduce(
    (sum, invoice) => sum + (invoice.isOverdue ? invoice.pendingAmount : 0),
    0
  ));

  const lastPaymentEntry = [...ledgerEntries]
    .reverse()
    .find((entry) => Number(entry.creditAmount || 0) > 0
      && !['Opening Balance', 'Order Confirmed - Reversed'].includes(entry.transactionType));

  const credit = evaluateDealerCredit({
    creditLimit: dealer.creditLimit,
    existingExposure: totalExposure,
    candidateAmount: 0
  });
  const utilizationPercent = credit.limitConfigured && credit.creditLimit > 0
    ? Math.round((totalExposure / credit.creditLimit) * 10000) / 100
    : (totalExposure > 0 ? 100 : 0);
  const status = credit.isOverlimit
    ? 'exceeded'
    : (utilizationPercent > 70 ? 'warning' : 'good');

  return {
    dealer,
    asOf: normalizedAsOf,
    ledgerBalance,
    invoiceOutstanding: ledgerBalance,
    confirmedOrdersAmount: uninvoicedSalesOrderAmount,
    uninvoicedSalesOrderAmount,
    uninvoicedOrders,
    totalCreditUsed: totalExposure,
    totalExposure,
    overdueAmount,
    outstandingInvoices: invoiceBalances,
    lastPaymentDate: lastPaymentEntry?.entryDate || null,
    lastPaymentAmount: money(lastPaymentEntry?.creditAmount || 0),
    creditLimit: credit.creditLimit,
    limitConfigured: credit.limitConfigured,
    availableCredit: credit.availableCredit,
    utilizationPercent,
    status,
    isOverlimit: credit.isOverlimit,
    canCreateOrder: overdueAmount <= 0 && credit.limitConfigured,
    blockReason: !credit.limitConfigured
      ? 'Dealer credit limit is not configured. Update Dealer Master before creating an order.'
      : (overdueAmount > 0
        ? `Payment overdue: ₹${overdueAmount.toLocaleString('en-IN')}. Please collect payment before creating new orders.`
        : null)
  };
};

export const buildCreditOverlimitSnapshot = (exposure, candidateAmount) => {
  const evaluation = evaluateDealerCredit({
    creditLimit: exposure.creditLimit,
    existingExposure: exposure.totalExposure,
    candidateAmount
  });

  return {
    isOverlimit: evaluation.isOverlimit,
    creditLimit: evaluation.creditLimit ?? 0,
    currentOutstanding: evaluation.currentOutstanding,
    orderAmount: evaluation.orderAmount,
    newOutstanding: evaluation.newOutstanding,
    overlimitAmount: evaluation.overlimitAmount,
    requiresApproval: evaluation.isOverlimit
  };
};

/** Serialize credit-affecting writes for one dealer inside an existing transaction. */
export const acquireDealerCreditLock = async (dbConnection, dealerId, session) => {
  if (!session) throw new Error('A MongoDB session is required for dealer credit locking');
  const { Dealer } = getModels(dbConnection);
  const result = await Dealer.updateOne(
    { _id: dealerId },
    { $inc: { ledgerPostingVersion: 1 } },
    { session }
  );
  if (result.matchedCount !== 1) {
    const error = new Error('Dealer not found while acquiring credit lock');
    error.statusCode = 404;
    throw error;
  }
};

export { CREDIT_RESERVED_ORDER_STATUSES };


/**
 * Cross-process lease used around non-transactional Sales Order confirmation.
 * A short expiry prevents a crashed process from permanently blocking a dealer.
 */
export const acquireDealerCreditLease = async (
  dbConnection,
  dealerId,
  { waitMs = 15000, leaseMs = 60000 } = {}
) => {
  const { Dealer } = getModels(dbConnection);
  const token = randomUUID();
  const deadline = Date.now() + waitMs;

  while (Date.now() <= deadline) {
    const now = new Date();
    const locked = await Dealer.findOneAndUpdate(
      {
        _id: dealerId,
        $or: [
          { creditLockToken: null },
          { creditLockToken: { $exists: false } },
          { creditLockExpiresAt: { $lte: now } },
          { creditLockExpiresAt: null }
        ]
      },
      {
        $set: {
          creditLockToken: token,
          creditLockExpiresAt: new Date(now.getTime() + leaseMs)
        }
      },
      { new: true }
    ).select('+creditLockToken');

    if (locked?.creditLockToken === token) return token;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const error = new Error('Another credit-affecting operation is in progress for this dealer. Please retry.');
  error.statusCode = 409;
  error.code = 'DEALER_CREDIT_OPERATION_IN_PROGRESS';
  throw error;
};

export const releaseDealerCreditLease = async (dbConnection, dealerId, token) => {
  if (!token) return;
  const { Dealer } = getModels(dbConnection);
  await Dealer.updateOne(
    { _id: dealerId, creditLockToken: token },
    { $set: { creditLockToken: null, creditLockExpiresAt: null } }
  );
};
