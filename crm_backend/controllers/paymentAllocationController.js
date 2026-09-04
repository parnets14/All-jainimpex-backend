import mongoose from 'mongoose';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { voucherSchema } from '../models/Voucher.js';
import { dealerSchema } from '../models/Dealer.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { generateAllocationNumber } from '../services/voucherNumberService.js';

const getModels = (dbConnection) => ({
  PaymentAllocation: dbConnection.models.PaymentAllocation
    || dbConnection.model('PaymentAllocation', paymentAllocationSchema),
  Voucher: dbConnection.models.Voucher
    || dbConnection.model('Voucher', voucherSchema),
  Dealer: dbConnection.models.Dealer
    || dbConnection.model('Dealer', dealerSchema),
  DealerInvoice: dbConnection.models.DealerInvoice
    || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
  SupplierInvoice: dbConnection.models.SupplierInvoice
    || dbConnection.model('SupplierInvoice', supplierInvoiceSchema)
});

const createAllocationError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const MONEY_SCALE = 100;
const toMinorUnits = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const scaled = amount * MONEY_SCALE;
  const units = Math.round(scaled);
  return Math.abs(scaled - units) <= 1e-6 ? units : null;
};
const fromMinorUnits = (units) => units / MONEY_SCALE;

const isAllocationNumberDuplicate = (error) => error?.code === 11000
  && (error?.keyPattern?.allocationNumber
    || error?.keyValue?.allocationNumber
    || /allocationNumber/i.test(error?.message || ''));

const expectedNumericCondition = (field, expected, allowLegacyMissing = expected === 0) => {
  if (!allowLegacyMissing) return { [field]: expected };
  return {
    $or: [
      { [field]: expected },
      { [field]: null },
      { [field]: { $exists: false } }
    ]
  };
};

const normalizeAllocationRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createAllocationError(400, 'A valid voucher ID and a non-empty allocations array are required');
  }

  const seenInvoiceIds = new Set();
  let hasOpeningBalance = false;

  return rows.map((row) => {
    const targetType = row?.targetType ?? 'Invoice';
    if (!['Invoice', 'OpeningBalance'].includes(targetType)) {
      throw createAllocationError(400, 'targetType must be Invoice or OpeningBalance');
    }

    const rawAmount = row?.allocatedAmount;
    const isNumericString = typeof rawAmount === 'string'
      && rawAmount.trim() !== ''
      && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawAmount.trim());
    const amountInMinorUnits = toMinorUnits(rawAmount);
    if ((typeof rawAmount !== 'number' && !isNumericString)
      || amountInMinorUnits == null
      || amountInMinorUnits <= 0) {
      throw createAllocationError(400, 'Every allocation amount must be a positive number with at most two decimal places');
    }

    if (targetType === 'OpeningBalance') {
      if (row?.invoiceId != null && String(row.invoiceId).trim() !== '') {
        throw createAllocationError(400, 'OpeningBalance allocations must omit invoiceId');
      }
      if (hasOpeningBalance) {
        throw createAllocationError(400, 'Opening balance cannot appear more than once in one voucher allocation');
      }
      hasOpeningBalance = true;
      return { targetType, allocatedAmount: fromMinorUnits(amountInMinorUnits) };
    }

    const rawInvoiceId = String(row?.invoiceId || '');
    if (!mongoose.isValidObjectId(rawInvoiceId)) {
      throw createAllocationError(400, 'Every Invoice allocation must reference a valid invoice');
    }
    const invoiceId = new mongoose.Types.ObjectId(rawInvoiceId).toString();
    if (seenInvoiceIds.has(invoiceId)) {
      throw createAllocationError(400, 'An invoice cannot appear more than once in one allocation request');
    }
    seenInvoiceIds.add(invoiceId);
    return { targetType, invoiceId, allocatedAmount: fromMinorUnits(amountInMinorUnits) };
  });
};

const runAllocationTransaction = async (dbConnection, work, maxAttempts = 5) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await dbConnection.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } catch (error) {
      if (isAllocationNumberDuplicate(error)) {
        if (attempt < maxAttempts) continue;
        throw createAllocationError(409, 'Could not reserve a unique allocation number; please retry');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw createAllocationError(409, 'Could not reserve a unique allocation number; please retry');
};

/**
 * Canonical allocation primitive. It joins an existing session when supplied,
 * allowing a multi-voucher plan to commit or roll back as one transaction.
 */
const allocateVoucherBatch = async ({
  dbConnection,
  voucherId,
  rows,
  userId,
  notes,
  expectedPartyId = null,
  expectedPartyType = null,
  expectedVoucherType = null,
  staleStateStatus = 400
}, { session: existingSession = null } = {}) => {
  if (!mongoose.isValidObjectId(voucherId)) {
    throw createAllocationError(400, 'A valid voucher ID and a non-empty allocations array are required');
  }

  const normalizedRows = normalizeAllocationRows(rows);
  const execute = async (session) => {
    const {
      PaymentAllocation,
      Voucher,
      Dealer,
      DealerInvoice,
      SupplierInvoice
    } = getModels(dbConnection);
    const voucher = await Voucher.findById(voucherId).session(session);

    if (!voucher) throw createAllocationError(404, 'Voucher not found');
    if (!['Dealer', 'Supplier'].includes(voucher.partyType)
      || !voucher.partyId
      || !mongoose.isValidObjectId(voucher.partyId)) {
      throw createAllocationError(400, 'Voucher must have a valid Dealer or Supplier party');
    }
    if (voucher.status !== 'Posted') {
      throw createAllocationError(staleStateStatus, 'Can only allocate posted vouchers');
    }

    const requiredVoucherType = voucher.partyType === 'Dealer' ? 'Receipt' : 'Payment';
    if (voucher.voucherType !== requiredVoucherType) {
      throw createAllocationError(400, `${voucher.partyType} allocations require a Posted ${requiredVoucherType} voucher`);
    }
    if ((expectedPartyId && String(voucher.partyId) !== String(expectedPartyId))
      || (expectedPartyType && voucher.partyType !== expectedPartyType)
      || (expectedVoucherType && voucher.voucherType !== expectedVoucherType)) {
      throw createAllocationError(409, 'Voucher details changed while planning the allocation; please retry');
    }

    const voucherTotal = Number(voucher.totalAmount);
    const allocatedAmount = Number(voucher.allocatedAmount ?? 0);
    const voucherTotalInMinorUnits = toMinorUnits(voucherTotal);
    const allocatedInMinorUnits = toMinorUnits(allocatedAmount);
    const expectedUnallocatedInMinorUnits = voucherTotalInMinorUnits == null
      || allocatedInMinorUnits == null
      ? null
      : voucherTotalInMinorUnits - allocatedInMinorUnits;
    const expectedUnallocatedAmount = expectedUnallocatedInMinorUnits == null
      ? NaN
      : fromMinorUnits(expectedUnallocatedInMinorUnits);
    const storedUnallocatedAmount = voucher.unallocatedAmount == null
      ? expectedUnallocatedAmount
      : Number(voucher.unallocatedAmount);
    const storedUnallocatedInMinorUnits = toMinorUnits(storedUnallocatedAmount);

    if (voucherTotalInMinorUnits == null || voucherTotalInMinorUnits < 0
      || allocatedInMinorUnits == null || allocatedInMinorUnits < 0
      || storedUnallocatedInMinorUnits == null || storedUnallocatedInMinorUnits < 0
      || expectedUnallocatedInMinorUnits == null || expectedUnallocatedInMinorUnits < 0
      || allocatedInMinorUnits > voucherTotalInMinorUnits
      || storedUnallocatedInMinorUnits !== expectedUnallocatedInMinorUnits) {
      throw createAllocationError(400, 'Voucher has invalid or inconsistent allocation balances');
    }

    const totalAllocatedInMinorUnits = normalizedRows.reduce(
      (sum, row) => sum + toMinorUnits(row.allocatedAmount),
      0
    );
    const totalAllocated = fromMinorUnits(totalAllocatedInMinorUnits);
    if (totalAllocatedInMinorUnits > expectedUnallocatedInMinorUnits) {
      throw createAllocationError(
        staleStateStatus,
        `Total allocation (₹${totalAllocated}) cannot exceed unallocated amount (₹${expectedUnallocatedAmount})`
      );
    }

    const isSupplier = voucher.partyType === 'Supplier';
    const InvoiceModel = isSupplier ? SupplierInvoice : DealerInvoice;
    const ownerField = isSupplier ? 'supplier' : 'dealer';
    const invoiceRows = normalizedRows.filter((row) => row.targetType === 'Invoice');
    const openingRow = normalizedRows.find((row) => row.targetType === 'OpeningBalance');

    if (openingRow && isSupplier) {
      throw createAllocationError(400, 'Opening balance can only be allocated from a Dealer Receipt');
    }

    const invoiceIds = invoiceRows.map((row) => row.invoiceId);
    const invoices = invoiceIds.length > 0
      ? await InvoiceModel.find({ _id: { $in: invoiceIds } }).session(session)
      : [];
    const invoicesById = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
    const allocationDate = new Date();

    let dealer = null;
    let openingSnapshot = null;
    if (openingRow) {
      dealer = await Dealer.findById(voucher.partyId).session(session);
      if (!dealer) throw createAllocationError(404, 'Dealer not found');

      const openingInMinorUnits = toMinorUnits(dealer.openingBalance);
      const previouslyAllocatedRaw = Number(dealer.openingBalanceAllocated ?? 0);
      const previouslyAllocatedInMinorUnits = toMinorUnits(previouslyAllocatedRaw);
      const rowAmountInMinorUnits = toMinorUnits(openingRow.allocatedAmount);
      if (dealer.openingBalanceType !== 'Dr'
        || openingInMinorUnits == null || openingInMinorUnits <= 0
        || previouslyAllocatedInMinorUnits == null || previouslyAllocatedInMinorUnits < 0
        || previouslyAllocatedInMinorUnits > openingInMinorUnits) {
        throw createAllocationError(400, 'Dealer does not have an allocatable Dr opening balance');
      }

      const remainingInMinorUnits = openingInMinorUnits
        - previouslyAllocatedInMinorUnits
        - rowAmountInMinorUnits;
      if (remainingInMinorUnits < 0) {
        throw createAllocationError(staleStateStatus, 'Opening balance allocation exceeds the remaining opening balance');
      }

      openingSnapshot = {
        targetType: 'OpeningBalance',
        targetLabel: 'Opening Balance',
        originalAmount: fromMinorUnits(openingInMinorUnits),
        originalDate: dealer.openingBalanceDate,
        previouslyAllocated: fromMinorUnits(previouslyAllocatedInMinorUnits),
        allocatedAmount: openingRow.allocatedAmount,
        remainingAmount: fromMinorUnits(remainingInMinorUnits),
        paymentStatus: remainingInMinorUnits === 0 ? 'Full' : 'Partial',
        expectedAllocatedAmount: previouslyAllocatedRaw,
        nextAllocatedAmount: fromMinorUnits(previouslyAllocatedInMinorUnits + rowAmountInMinorUnits),
        allowLegacyMissing: dealer.$isDefault('openingBalanceAllocated')
          || dealer.openingBalanceAllocated == null
      };
    }

    const invoiceSnapshots = new Map();
    for (const row of invoiceRows) {
      const invoice = invoicesById.get(row.invoiceId);
      if (!invoice) throw createAllocationError(404, `Invoice ${row.invoiceId} not found`);
      if (!invoice[ownerField] || String(invoice[ownerField]) !== String(voucher.partyId)) {
        throw createAllocationError(400, `Invoice ${invoice.invoiceNumber} does not belong to the voucher party`);
      }
      if (invoice.status !== 'Approved'
        || invoice.isDeleted === true
        || invoice.isDraft === true
        || invoice.paymentStatus === 'Paid') {
        throw createAllocationError(staleStateStatus, `Invoice ${invoice.invoiceNumber} is not eligible for allocation`);
      }

      const expectedPaidAmount = Number(invoice.paidAmount ?? 0);
      const rawInvoiceTotal = Number(
        isSupplier ? (invoice.supplierBilledTotal ?? invoice.totalAmount) : invoice.totalAmount
      );
      const paidInMinorUnits = toMinorUnits(expectedPaidAmount);
      const invoiceTotalInMinorUnits = toMinorUnits(rawInvoiceTotal);
      const rowAmountInMinorUnits = toMinorUnits(row.allocatedAmount);
      if (invoiceTotalInMinorUnits == null || invoiceTotalInMinorUnits < 0
        || paidInMinorUnits == null || paidInMinorUnits < 0
        || paidInMinorUnits > invoiceTotalInMinorUnits) {
        throw createAllocationError(400, `Invoice ${invoice.invoiceNumber} has invalid payment totals`);
      }

      const remainingInMinorUnits = invoiceTotalInMinorUnits - paidInMinorUnits - rowAmountInMinorUnits;
      if (remainingInMinorUnits < 0) {
        throw createAllocationError(staleStateStatus, `Allocation for invoice ${invoice.invoiceNumber} exceeds pending amount`);
      }

      const originalAmount = fromMinorUnits(invoiceTotalInMinorUnits);
      const previouslyAllocated = fromMinorUnits(paidInMinorUnits);
      invoiceSnapshots.set(row.invoiceId, {
        targetType: 'Invoice',
        targetLabel: invoice.invoiceNumber,
        invoice,
        expectedPaidAmount,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        originalAmount,
        originalDate: invoice.invoiceDate,
        previouslyAllocated,
        allocatedAmount: row.allocatedAmount,
        remainingAmount: fromMinorUnits(remainingInMinorUnits),
        paymentStatus: remainingInMinorUnits === 0 ? 'Full' : 'Partial',
        // Legacy metadata aliases.
        invoiceDate: invoice.invoiceDate,
        invoiceAmount: originalAmount,
        previouslyPaid: previouslyAllocated
      });
    }

    const preparedAllocations = normalizedRows.map((row) => (
      row.targetType === 'OpeningBalance' ? openingSnapshot : invoiceSnapshots.get(row.invoiceId)
    ));
    const persistedAllocations = preparedAllocations.map((allocation) => {
      const {
        invoice,
        expectedPaidAmount,
        expectedAllocatedAmount,
        nextAllocatedAmount,
        allowLegacyMissing,
        ...persisted
      } = allocation;
      return persisted;
    });

    const allocationNumber = await generateAllocationNumber(allocationDate, dbConnection, session);
    const [paymentAllocation] = await PaymentAllocation.create([{
      allocationNumber,
      allocationDate,
      voucherId: voucher._id,
      voucherNumber: voucher.voucherNumber,
      voucherType: voucher.voucherType,
      totalAmount: voucher.totalAmount,
      partyId: voucher.partyId,
      partyType: voucher.partyType,
      partyName: voucher.partyName,
      allocations: persistedAllocations,
      totalAllocated,
      notes,
      createdBy: userId
    }], { session });

    const nextAllocatedInMinorUnits = allocatedInMinorUnits + totalAllocatedInMinorUnits;
    const nextUnallocatedInMinorUnits = voucherTotalInMinorUnits - nextAllocatedInMinorUnits;
    const voucherResult = await Voucher.updateOne({
      _id: voucher._id,
      status: 'Posted',
      partyType: voucher.partyType,
      partyId: voucher.partyId,
      voucherType: requiredVoucherType,
      totalAmount: voucher.totalAmount,
      $and: [
        expectedNumericCondition('allocatedAmount', allocatedAmount),
        expectedNumericCondition('unallocatedAmount', storedUnallocatedAmount, voucher.unallocatedAmount == null)
      ]
    }, {
      $set: {
        allocatedAmount: fromMinorUnits(nextAllocatedInMinorUnits),
        unallocatedAmount: fromMinorUnits(nextUnallocatedInMinorUnits),
        allocationType: nextAllocatedInMinorUnits >= voucherTotalInMinorUnits
          ? 'AgainstReference'
          : 'Mixed'
      },
      $push: {
        allocations: {
          $each: persistedAllocations.map((allocation) => ({ ...allocation, allocationDate }))
        }
      }
    }, { session });
    if (voucherResult.matchedCount !== 1) {
      throw createAllocationError(409, 'Voucher balance changed while allocating; please retry');
    }

    if (openingSnapshot) {
      const dealerResult = await Dealer.updateOne({
        _id: dealer._id,
        openingBalance: dealer.openingBalance,
        openingBalanceType: 'Dr',
        $and: [expectedNumericCondition(
          'openingBalanceAllocated',
          openingSnapshot.expectedAllocatedAmount,
          openingSnapshot.allowLegacyMissing
        )]
      }, {
        $set: { openingBalanceAllocated: openingSnapshot.nextAllocatedAmount }
      }, { session });
      if (dealerResult.matchedCount !== 1) {
        throw createAllocationError(409, 'Opening balance changed while allocating; please retry');
      }
    }

    if (invoiceRows.length > 0) {
      const invoiceOperations = invoiceRows.map((row) => {
        const allocation = invoiceSnapshots.get(row.invoiceId);
        const totalConditions = isSupplier && allocation.invoice.supplierBilledTotal == null
          ? [{
              $or: [
                { supplierBilledTotal: null },
                { supplierBilledTotal: { $exists: false } }
              ]
            }, { totalAmount: allocation.invoice.totalAmount }]
          : [{
              [isSupplier ? 'supplierBilledTotal' : 'totalAmount']:
                isSupplier ? allocation.invoice.supplierBilledTotal : allocation.invoice.totalAmount
            }];
        const nextPaidAmount = fromMinorUnits(
          toMinorUnits(allocation.previouslyAllocated) + toMinorUnits(allocation.allocatedAmount)
        );
        const invoiceUpdate = {
          paidAmount: nextPaidAmount,
          paymentStatus: allocation.remainingAmount === 0 ? 'Paid' : 'Partial'
        };
        if (!isSupplier) invoiceUpdate.pendingAmount = allocation.remainingAmount;

        return {
          updateOne: {
            filter: {
              _id: allocation.invoiceId,
              [ownerField]: voucher.partyId,
              status: 'Approved',
              paymentStatus: { $ne: 'Paid' },
              isDeleted: { $ne: true },
              isDraft: { $ne: true },
              $and: [
                expectedNumericCondition('paidAmount', allocation.expectedPaidAmount),
                ...totalConditions
              ]
            },
            update: { $set: invoiceUpdate }
          }
        };
      });
      const invoiceResult = await InvoiceModel.bulkWrite(invoiceOperations, { session, ordered: true });
      if (invoiceResult.matchedCount !== invoiceRows.length) {
        throw createAllocationError(409, 'An invoice balance changed while allocating; please retry');
      }
    }

    return paymentAllocation;
  };

  return existingSession ? execute(existingSession) : runAllocationTransaction(dbConnection, execute);
};

const sendAllocationError = (res, error, operation) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`❌ Error ${operation}:`, error);
    console.error('Error stack:', error.stack);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? `Error ${operation}` : error.message,
    error: statusCode >= 500 ? error.message : undefined,
    details: statusCode >= 500 && process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
};

export const createPaymentAllocation = async (req, res) => {
  try {
    const paymentAllocation = await allocateVoucherBatch({
      dbConnection: req.dbConnection,
      voucherId: req.body.voucherId,
      rows: req.body.allocations,
      userId: req.user._id,
      notes: req.body.notes
    });
    return res.status(201).json({
      success: true,
      message: 'Payment allocation created successfully',
      data: paymentAllocation
    });
  } catch (error) {
    return sendAllocationError(res, error, 'creating payment allocation');
  }
};

export const createPaymentAllocationBatch = async (req, res) => {
  try {
    const { voucherAllocations, notes } = req.body;
    if (!Array.isArray(voucherAllocations) || voucherAllocations.length === 0) {
      throw createAllocationError(400, 'voucherAllocations must be a non-empty array');
    }

    const seenVoucherIds = new Set();
    for (const group of voucherAllocations) {
      if (!mongoose.isValidObjectId(group?.voucherId)) {
        throw createAllocationError(400, 'Every voucher allocation must contain a valid voucherId');
      }
      const voucherId = new mongoose.Types.ObjectId(group.voucherId).toString();
      if (seenVoucherIds.has(voucherId)) {
        throw createAllocationError(400, 'A voucher cannot appear more than once in a batch request');
      }
      seenVoucherIds.add(voucherId);
      normalizeAllocationRows(group.allocations);
    }

    const paymentAllocations = await runAllocationTransaction(
      req.dbConnection,
      async (session) => {
        const results = [];
        for (const group of voucherAllocations) {
          results.push(await allocateVoucherBatch({
            dbConnection: req.dbConnection,
            voucherId: group.voucherId,
            rows: group.allocations,
            userId: req.user._id,
            notes
          }, { session }));
        }
        return results;
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Payment allocation batch created successfully',
      data: paymentAllocations
    });
  } catch (error) {
    return sendAllocationError(res, error, 'creating payment allocation batch');
  }
};

export const getPaymentAllocations = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const { partyId, voucherId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = {};
    if (partyId) query.partyId = partyId;
    if (voucherId) query.voucherId = voucherId;
    if (startDate || endDate) {
      query.allocationDate = {};
      if (startDate) query.allocationDate.$gte = new Date(startDate);
      if (endDate) query.allocationDate.$lte = new Date(endDate);
    }
    const skip = (page - 1) * limit;
    const allocations = await PaymentAllocation.find(query)
      .populate('voucherId')
      .populate('partyId')
      .populate('allocations.invoiceId')
      .populate('createdBy', 'name email')
      .sort({ allocationDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await PaymentAllocation.countDocuments(query);
    return res.status(200).json({
      success: true,
      data: allocations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching payment allocations:', error);
    return res.status(500).json({ success: false, message: 'Error fetching payment allocations', error: error.message });
  }
};

export const getPaymentAllocationById = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const allocation = await PaymentAllocation.findById(req.params.id)
      .populate('voucherId')
      .populate('partyId')
      .populate('allocations.invoiceId')
      .populate('createdBy', 'name email');
    if (!allocation) {
      return res.status(404).json({ success: false, message: 'Payment allocation not found' });
    }
    return res.status(200).json({ success: true, data: allocation });
  } catch (error) {
    console.error('Error fetching payment allocation:', error);
    return res.status(500).json({ success: false, message: 'Error fetching payment allocation', error: error.message });
  }
};

export const getOutstandingInvoices = async (req, res) => {
  try {
    const { Dealer, DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const { partyId, partyType } = req.query;
    if (!mongoose.isValidObjectId(partyId)) {
      return res.status(400).json({ success: false, message: 'A valid Party ID is required' });
    }

    if (!['Dealer', 'Supplier'].includes(partyType)) {
      return res.status(400).json({ success: false, message: 'partyType must be Dealer or Supplier' });
    }

    if (partyType === 'Supplier') {
      const supplierInvoices = await SupplierInvoice.find({
        supplier: partyId,
        status: 'Approved',
        isDeleted: { $ne: true },
        isDraft: { $ne: true },
        paymentStatus: { $ne: 'Paid' }
      }).sort({ invoiceDate: 1 });
      const outstanding = supplierInvoices.map((invoice) => {
        const total = Number(invoice.supplierBilledTotal ?? invoice.totalAmount);
        const paid = Number(invoice.paidAmount ?? 0);
        return {
          _id: invoice._id,
          targetType: 'Invoice',
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          totalAmount: total,
          paidAmount: paid,
          pendingAmount: total - paid,
          paymentStatus: invoice.paymentStatus,
          dueDate: invoice.dueDate
        };
      }).filter((invoice) => invoice.pendingAmount > 0);
      const totalOutstanding = outstanding.reduce((sum, invoice) => sum + invoice.pendingAmount, 0);
      return res.status(200).json({
        success: true,
        invoices: outstanding,
        openingBalance: null,
        summary: { totalInvoices: outstanding.length, totalOutstanding }
      });
    }

    const [dealer, invoices] = await Promise.all([
      Dealer.findById(partyId),
      DealerInvoice.find({
        dealer: partyId,
        status: 'Approved',
        isDeleted: { $ne: true },
        isDraft: { $ne: true },
        paymentStatus: { $ne: 'Paid' },
        $or: [
          { pendingAmount: { $gt: 0 } },
          { pendingAmount: null },
          { pendingAmount: { $exists: false } }
        ]
      }).sort({ invoiceDate: 1 })
    ]);
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const outstandingInvoices = invoices.map((invoice) => ({
      _id: invoice._id,
      targetType: 'Invoice',
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount ?? 0,
      pendingAmount: invoice.pendingAmount != null
        ? invoice.pendingAmount
        : invoice.totalAmount - (invoice.paidAmount ?? 0),
      paymentStatus: invoice.paymentStatus,
      dueDate: invoice.dueDate
    })).filter((invoice) => invoice.pendingAmount > 0);

    const openingOriginal = toMinorUnits(dealer.openingBalance);
    const openingAllocated = toMinorUnits(dealer.openingBalanceAllocated ?? 0);
    if (openingOriginal == null || openingOriginal < 0
      || openingAllocated == null || openingAllocated < 0
      || openingAllocated > openingOriginal) {
      throw createAllocationError(400, 'Dealer has invalid opening balance allocation totals');
    }
    const openingRemaining = openingOriginal - openingAllocated;
    const openingBalance = dealer.openingBalanceType === 'Dr' && openingRemaining > 0
      ? {
          targetType: 'OpeningBalance',
          originalAmount: fromMinorUnits(openingOriginal),
          allocatedAmount: fromMinorUnits(openingAllocated),
          remainingAmount: fromMinorUnits(openingRemaining),
          openingBalanceType: dealer.openingBalanceType,
          openingBalanceDate: dealer.openingBalanceDate
        }
      : null;
    const invoiceOutstanding = outstandingInvoices.reduce((sum, invoice) => sum + invoice.pendingAmount, 0);

    return res.status(200).json({
      success: true,
      invoices: outstandingInvoices,
      openingBalance,
      summary: {
        totalInvoices: outstandingInvoices.length,
        totalOutstanding: invoiceOutstanding + (openingBalance?.remainingAmount ?? 0)
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error('Error fetching outstanding invoices:', error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Error fetching outstanding invoices' : error.message,
      error: statusCode >= 500 ? error.message : undefined
    });
  }
};

export const getUnadjustedPayments = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const { partyId, voucherType = 'Receipt' } = req.query;
    if (!mongoose.isValidObjectId(partyId)) {
      return res.status(400).json({ success: false, message: 'A valid Party ID is required' });
    }
    if (!['Receipt', 'Payment'].includes(voucherType)) {
      return res.status(400).json({ success: false, message: 'voucherType must be Receipt or Payment' });
    }
    const requiredPartyType = voucherType === 'Receipt' ? 'Dealer' : 'Supplier';
    const vouchers = await Voucher.find({
      partyId,
      partyType: requiredPartyType,
      voucherType,
      status: 'Posted'
    }).sort({ voucherDate: -1 });
    const unadjustedPayments = vouchers.map((voucher) => {
      const allocatedAmount = voucher.allocatedAmount ?? 0;
      const unallocatedAmount = voucher.unallocatedAmount != null
        ? voucher.unallocatedAmount
        : voucher.totalAmount - allocatedAmount;
      return {
        _id: voucher._id,
        voucherNumber: voucher.voucherNumber,
        voucherDate: voucher.voucherDate,
        totalAmount: voucher.totalAmount,
        allocatedAmount,
        unallocatedAmount,
        transactionMode: voucher.transactionMode,
        narration: voucher.narration
      };
    }).filter((voucher) => voucher.unallocatedAmount > 0);
    const totalUnadjusted = unadjustedPayments.reduce((sum, voucher) => sum + voucher.unallocatedAmount, 0);
    return res.status(200).json({
      success: true,
      payments: unadjustedPayments,
      summary: { totalPayments: unadjustedPayments.length, totalUnadjusted }
    });
  } catch (error) {
    console.error('Error fetching unadjusted payments:', error);
    return res.status(500).json({ success: false, message: 'Error fetching unadjusted payments', error: error.message });
  }
};

export const autoAllocatePayments = async (req, res) => {
  try {
    const { Voucher, Dealer, DealerInvoice } = getModels(req.dbConnection);
    const { partyId } = req.body;
    if (!mongoose.isValidObjectId(partyId)) {
      return res.status(400).json({ success: false, message: 'A valid dealer partyId is required' });
    }

    const [dealer, vouchers, invoices] = await Promise.all([
      Dealer.findById(partyId),
      Voucher.find({
        partyId,
        partyType: 'Dealer',
        voucherType: 'Receipt',
        status: 'Posted'
      }).sort({ voucherDate: 1 }),
      DealerInvoice.find({
        dealer: partyId,
        status: 'Approved',
        isDeleted: { $ne: true },
        isDraft: { $ne: true },
        paymentStatus: { $ne: 'Paid' },
        $or: [
          { pendingAmount: { $gt: 0 } },
          { pendingAmount: null },
          { pendingAmount: { $exists: false } }
        ]
      })
    ]);
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const voucherRemaining = [];
    for (const voucher of vouchers) {
      const total = toMinorUnits(voucher.totalAmount);
      const allocated = toMinorUnits(voucher.allocatedAmount ?? 0);
      const expectedRemaining = total == null || allocated == null ? null : total - allocated;
      const storedRemaining = toMinorUnits(
        voucher.unallocatedAmount == null ? fromMinorUnits(expectedRemaining) : voucher.unallocatedAmount
      );
      if (total == null || total < 0 || allocated == null || allocated < 0
        || expectedRemaining == null || expectedRemaining < 0
        || storedRemaining == null || storedRemaining !== expectedRemaining) {
        throw createAllocationError(400, `Voucher ${voucher.voucherNumber} has invalid or inconsistent allocation balances`);
      }
      if (expectedRemaining > 0) voucherRemaining.push({ voucher, remaining: expectedRemaining });
    }
    if (voucherRemaining.length === 0) {
      throw createAllocationError(400, 'No unadjusted payments available for this dealer');
    }
    const totalAvailableInMinorUnits = voucherRemaining.reduce((sum, item) => sum + item.remaining, 0);

    const openingOriginal = toMinorUnits(dealer.openingBalance);
    const openingAllocated = toMinorUnits(dealer.openingBalanceAllocated ?? 0);
    if (openingOriginal == null || openingOriginal < 0
      || openingAllocated == null || openingAllocated < 0
      || openingAllocated > openingOriginal) {
      throw createAllocationError(400, 'Dealer has invalid opening balance allocation totals');
    }
    const openingRemaining = dealer.openingBalanceType === 'Dr'
      ? openingOriginal - openingAllocated
      : 0;

    const now = new Date();
    const sortedInvoices = invoices.map((invoice) => {
      const total = toMinorUnits(invoice.totalAmount);
      const paid = toMinorUnits(invoice.paidAmount ?? 0);
      const pending = toMinorUnits(invoice.pendingAmount ?? (invoice.totalAmount - (invoice.paidAmount ?? 0)));
      if (total == null || total < 0 || paid == null || paid < 0
        || pending == null || pending <= 0 || paid > total || pending > total) {
        throw createAllocationError(400, `Invoice ${invoice.invoiceNumber} has invalid payment balances`);
      }
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      const isOverdue = dueDate ? dueDate < now : false;
      const daysUntilDue = dueDate ? Math.ceil((dueDate - now) / 86400000) : 9999;
      return { invoice, pending, isOverdue, daysUntilDue };
    }).sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.daysUntilDue !== b.daysUntilDue) return a.daysUntilDue - b.daysUntilDue;
      return new Date(a.invoice.invoiceDate) - new Date(b.invoice.invoiceDate);
    });

    if (openingRemaining <= 0 && sortedInvoices.length === 0) {
      throw createAllocationError(400, 'No outstanding opening balance or invoices found for this dealer');
    }

    const allocationsByVoucher = new Map();
    const addPlanRow = (voucher, row) => {
      const voucherId = String(voucher._id);
      if (!allocationsByVoucher.has(voucherId)) allocationsByVoucher.set(voucherId, { voucherId, rows: [] });
      allocationsByVoucher.get(voucherId).rows.push(row);
    };
    const distribute = (requested, makeRow) => {
      let left = requested;
      for (const item of voucherRemaining) {
        if (left <= 0) break;
        if (item.remaining <= 0) continue;
        const amount = Math.min(left, item.remaining);
        addPlanRow(item.voucher, makeRow(fromMinorUnits(amount)));
        item.remaining -= amount;
        left -= amount;
      }
      return requested - left;
    };

    let globalRemaining = totalAvailableInMinorUnits;
    let plannedOpeningInMinorUnits = 0;
    if (openingRemaining > 0 && globalRemaining > 0) {
      const requested = Math.min(openingRemaining, globalRemaining);
      plannedOpeningInMinorUnits = distribute(requested, (allocatedAmount) => ({
        targetType: 'OpeningBalance',
        allocatedAmount
      }));
      globalRemaining -= plannedOpeningInMinorUnits;
    }

    for (const { invoice, pending } of sortedInvoices) {
      if (globalRemaining <= 0) break;
      const requested = Math.min(pending, globalRemaining);
      const distributed = distribute(requested, (allocatedAmount) => ({
        targetType: 'Invoice',
        invoiceId: String(invoice._id),
        allocatedAmount
      }));
      globalRemaining -= distributed;
    }
    if (allocationsByVoucher.size === 0) throw createAllocationError(400, 'No allocations could be made');

    const createdAllocations = await runAllocationTransaction(
      req.dbConnection,
      async (session) => {
        const results = [];
        for (const group of allocationsByVoucher.values()) {
          results.push(await allocateVoucherBatch({
            dbConnection: req.dbConnection,
            voucherId: group.voucherId,
            rows: group.rows,
            userId: req.user._id,
            notes: 'Auto-allocated',
            expectedPartyId: partyId,
            expectedPartyType: 'Dealer',
            expectedVoucherType: 'Receipt',
            staleStateStatus: 409
          }, { session }));
        }
        return results;
      }
    );

    const totalAllocated = createdAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.totalAllocated ?? 0),
      0
    );
    const invoiceOutcomes = new Map();
    let openingBalanceAllocated = 0;
    for (const allocation of createdAllocations) {
      for (const row of allocation.allocations) {
        if ((row.targetType ?? 'Invoice') === 'OpeningBalance') {
          openingBalanceAllocated += Number(row.allocatedAmount ?? 0);
        } else {
          invoiceOutcomes.set(String(row.invoiceId), Number(row.remainingAmount));
        }
      }
    }
    const invoicesFullyPaid = [...invoiceOutcomes.values()].filter((remaining) => remaining === 0).length;
    const invoicesPartiallyPaid = invoiceOutcomes.size - invoicesFullyPaid;
    const totalAvailable = fromMinorUnits(totalAvailableInMinorUnits);

    return res.status(201).json({
      success: true,
      message: `Auto-allocation complete. ₹${totalAllocated.toLocaleString('en-IN')} allocated across ${invoiceOutcomes.size} invoice(s)`,
      data: {
        allocations: createdAllocations,
        summary: {
          totalAvailable,
          totalAllocated,
          openingBalanceAllocated,
          remainingUnallocated: totalAvailable - totalAllocated,
          invoicesFullyPaid,
          invoicesPartiallyPaid,
          totalInvoicesProcessed: invoiceOutcomes.size,
          vouchersUsed: allocationsByVoucher.size
        }
      }
    });
  } catch (error) {
    return sendAllocationError(res, error, 'in auto-allocate payments');
  }
};
