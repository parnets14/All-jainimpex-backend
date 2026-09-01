import mongoose from 'mongoose';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { voucherSchema } from '../models/Voucher.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { supplierInvoiceSchema } from '../models/SupplierInvoice.js';
import { generateAllocationNumber } from '../services/voucherNumberService.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    PaymentAllocation: dbConnection.models.PaymentAllocation || 
                       dbConnection.model('PaymentAllocation', paymentAllocationSchema),
    Voucher: dbConnection.models.Voucher || 
             dbConnection.model('Voucher', voucherSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    SupplierInvoice: dbConnection.models.SupplierInvoice || 
                   dbConnection.model('SupplierInvoice', supplierInvoiceSchema)
  };
};

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
  if (!allowLegacyMissing) {
    return { [field]: expected };
  }

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
  return rows.map((row) => {
    const rawInvoiceId = String(row?.invoiceId || '');
    const rawAmount = row?.allocatedAmount;
    const isNumericString = typeof rawAmount === 'string'
      && rawAmount.trim() !== ''
      && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawAmount.trim());

    if (!mongoose.isValidObjectId(rawInvoiceId)) {
      throw createAllocationError(400, 'Every allocation must reference a valid invoice');
    }

    const invoiceId = new mongoose.Types.ObjectId(rawInvoiceId).toString();
    const normalizedAmount = Number(rawAmount);
    const amountInMinorUnits = toMinorUnits(normalizedAmount);
    if ((typeof rawAmount !== 'number' && !isNumericString)
      || !Number.isFinite(normalizedAmount)
      || amountInMinorUnits == null
      || amountInMinorUnits <= 0) {
      throw createAllocationError(400, 'Every allocation amount must be a positive number with at most two decimal places');
    }

    if (seenInvoiceIds.has(invoiceId)) {
      throw createAllocationError(400, 'An invoice cannot appear more than once in one allocation request');
    }
    seenInvoiceIds.add(invoiceId);

    return { invoiceId, allocatedAmount: fromMinorUnits(amountInMinorUnits) };
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
        if (attempt < maxAttempts) {
          continue;
        }
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
 * Atomically allocates one voucher across one or more invoices. Every persisted
 * balance is read again in the transaction and all writes use expected-value
 * filters so a stale concurrent request fails instead of over-allocating.
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
  requireOutstandingDealerInvoice = false,
  staleStateStatus = 400
}, { session: existingSession = null } = {}) => {
  if (!mongoose.isValidObjectId(voucherId)) {
    throw createAllocationError(400, 'A valid voucher ID and a non-empty allocations array are required');
  }

  const normalizedRows = normalizeAllocationRows(rows);
  const execute = async (session) => {
    const { PaymentAllocation, Voucher, DealerInvoice, SupplierInvoice } = getModels(dbConnection);
    const voucher = await Voucher.findById(voucherId).session(session);

    if (!voucher) {
      throw createAllocationError(404, 'Voucher not found');
    }
    if (!['Dealer', 'Supplier'].includes(voucher.partyType)
      || !voucher.partyId
      || !mongoose.isValidObjectId(voucher.partyId)) {
      throw createAllocationError(400, 'Voucher must have a valid Dealer or Supplier party');
    }
    if (voucher.status !== 'Posted') {
      throw createAllocationError(staleStateStatus, 'Can only allocate posted vouchers');
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
    if (totalAllocatedInMinorUnits <= 0
      || totalAllocatedInMinorUnits > expectedUnallocatedInMinorUnits) {
      throw createAllocationError(
        staleStateStatus,
        `Total allocation (₹${totalAllocated}) must be positive and cannot exceed unallocated amount (₹${expectedUnallocatedAmount})`
      );
    }

    const isSupplier = voucher.partyType === 'Supplier';
    const InvoiceModel = isSupplier ? SupplierInvoice : DealerInvoice;
    const ownerField = isSupplier ? 'supplier' : 'dealer';
    const invoiceIds = normalizedRows.map((row) => row.invoiceId);
    const invoices = await InvoiceModel.find({ _id: { $in: invoiceIds } }).session(session);
    const invoicesById = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
    const allocationDate = new Date();

    const preparedAllocations = normalizedRows.map((row) => {
      const invoice = invoicesById.get(row.invoiceId);
      if (!invoice) {
        throw createAllocationError(404, `Invoice ${row.invoiceId} not found`);
      }
      if (!invoice[ownerField]
        || String(invoice[ownerField]) !== String(voucher.partyId)) {
        throw createAllocationError(400, `Invoice ${invoice.invoiceNumber} does not belong to the voucher party`);
      }
      if (requireOutstandingDealerInvoice
        && (isSupplier
          || invoice.status !== 'Approved'
          || invoice.isDeleted === true
          || invoice.isDraft === true
          || invoice.paymentStatus === 'Paid')) {
        throw createAllocationError(409, `Invoice ${invoice.invoiceNumber} is no longer eligible for auto-allocation`);
      }

      const expectedPaidAmount = Number(invoice.paidAmount ?? 0);
      const rawInvoiceTotal = Number(
        isSupplier
          ? (invoice.supplierBilledTotal ?? invoice.totalAmount)
          : invoice.totalAmount
      );
      const paidInMinorUnits = toMinorUnits(expectedPaidAmount);
      const invoiceTotalInMinorUnits = toMinorUnits(rawInvoiceTotal);
      const rowAmountInMinorUnits = toMinorUnits(row.allocatedAmount);
      if (invoiceTotalInMinorUnits == null || invoiceTotalInMinorUnits < 0
        || paidInMinorUnits == null || paidInMinorUnits < 0
        || paidInMinorUnits > invoiceTotalInMinorUnits) {
        throw createAllocationError(400, `Invoice ${invoice.invoiceNumber} has invalid payment totals`);
      }

      const remainingInMinorUnits = invoiceTotalInMinorUnits
        - paidInMinorUnits
        - rowAmountInMinorUnits;
      if (remainingInMinorUnits < 0) {
        throw createAllocationError(staleStateStatus, `Allocation for invoice ${invoice.invoiceNumber} exceeds pending amount`);
      }

      const invoiceTotal = fromMinorUnits(invoiceTotalInMinorUnits);
      const previouslyPaid = fromMinorUnits(paidInMinorUnits);
      const remainingAmount = fromMinorUnits(remainingInMinorUnits);
      return {
        invoice,
        expectedPaidAmount,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceAmount: invoiceTotal,
        previouslyPaid,
        allocatedAmount: row.allocatedAmount,
        remainingAmount,
        paymentStatus: remainingInMinorUnits === 0 ? 'Full' : 'Partial'
      };
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
      allocations: preparedAllocations.map(({
        invoice,
        expectedPaidAmount,
        ...allocation
      }) => allocation),
      totalAllocated,
      notes,
      createdBy: userId
    }], { session });

    const nextAllocatedInMinorUnits = allocatedInMinorUnits + totalAllocatedInMinorUnits;
    const nextUnallocatedInMinorUnits = voucherTotalInMinorUnits - nextAllocatedInMinorUnits;
    const nextAllocatedAmount = fromMinorUnits(nextAllocatedInMinorUnits);
    const nextUnallocatedAmount = fromMinorUnits(nextUnallocatedInMinorUnits);
    const voucherResult = await Voucher.updateOne({
      _id: voucher._id,
      status: 'Posted',
      partyType: voucher.partyType,
      partyId: voucher.partyId,
      totalAmount: voucher.totalAmount,
      $and: [
        expectedNumericCondition('allocatedAmount', allocatedAmount),
        expectedNumericCondition('unallocatedAmount', storedUnallocatedAmount, voucher.unallocatedAmount == null)
      ]
    }, {
      $set: {
        allocatedAmount: nextAllocatedAmount,
        unallocatedAmount: nextUnallocatedAmount,
        allocationType: nextAllocatedInMinorUnits >= voucherTotalInMinorUnits
          ? 'AgainstReference'
          : 'Mixed'
      },
      $push: {
        allocations: {
          $each: preparedAllocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            invoiceNumber: allocation.invoiceNumber,
            allocatedAmount: allocation.allocatedAmount,
            allocationDate
          }))
        }
      }
    }, { session });

    if (voucherResult.matchedCount !== 1) {
      throw createAllocationError(409, 'Voucher balance changed while allocating; please retry');
    }

    const invoiceOperations = preparedAllocations.map((allocation) => {
      const totalConditions = isSupplier && allocation.invoice.supplierBilledTotal == null
        ? [
            {
              $or: [
                { supplierBilledTotal: null },
                { supplierBilledTotal: { $exists: false } }
              ]
            },
            { totalAmount: allocation.invoice.totalAmount }
          ]
        : [{
            [isSupplier ? 'supplierBilledTotal' : 'totalAmount']:
              isSupplier ? allocation.invoice.supplierBilledTotal : allocation.invoice.totalAmount
          }];
      const nextPaidAmount = fromMinorUnits(
        toMinorUnits(allocation.previouslyPaid) + toMinorUnits(allocation.allocatedAmount)
      );
      const invoiceUpdate = {
        paidAmount: nextPaidAmount,
        paymentStatus: allocation.remainingAmount === 0 ? 'Paid' : 'Partial'
      };
      if (!isSupplier) {
        invoiceUpdate.pendingAmount = allocation.remainingAmount;
      }

      return {
        updateOne: {
          filter: {
            _id: allocation.invoiceId,
            [ownerField]: voucher.partyId,
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
    if (invoiceResult.matchedCount !== preparedAllocations.length) {
      throw createAllocationError(409, 'An invoice balance changed while allocating; please retry');
    }

    return paymentAllocation;
  };

  if (existingSession) {
    return execute(existingSession);
  }
  return runAllocationTransaction(dbConnection, execute);
};

/**
 * Create payment allocation
 * POST /api/payment-allocations
 */
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
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('❌ Error creating payment allocation:', error);
      console.error('Error stack:', error.stack);
    }

    return res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Error creating payment allocation' : error.message,
      error: statusCode >= 500 ? error.message : undefined,
      details: statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? error.stack
        : undefined
    });
  }
};

/**
 * Get all payment allocations
 * GET /api/payment-allocations
 */
export const getPaymentAllocations = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const {
      partyId,
      voucherId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;
    
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
    
    res.status(200).json({
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
    res.status(500).json({
      success: false,
      message: 'Error fetching payment allocations',
      error: error.message
    });
  }
};

/**
 * Get payment allocation by ID
 * GET /api/payment-allocations/:id
 */
export const getPaymentAllocationById = async (req, res) => {
  try {
    const { PaymentAllocation } = getModels(req.dbConnection);
    const allocation = await PaymentAllocation.findById(req.params.id)
      .populate('voucherId')
      .populate('partyId')
      .populate('allocations.invoiceId')
      .populate('createdBy', 'name email');
    
    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: 'Payment allocation not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: allocation
    });
    
  } catch (error) {
    console.error('Error fetching payment allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment allocation',
      error: error.message
    });
  }
};

/**
 * Get outstanding invoices for a party
 * GET /api/outstanding-invoices
 */
export const getOutstandingInvoices = async (req, res) => {
  try {
    const { DealerInvoice, SupplierInvoice } = getModels(req.dbConnection);
    const { partyId, partyType } = req.query;
    
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }

    // Supplier outstanding (purchase invoices) — no pendingAmount field, compute it
    if (partyType === 'Supplier') {
      const supInvoices = await SupplierInvoice.find({
        supplier: partyId,
        status: 'Approved',
        paymentStatus: { $ne: 'Paid' }
      }).sort({ invoiceDate: 1 });

      const outstanding = supInvoices
        .map(inv => {
          const paid = inv.paidAmount || 0;
          const invoiceTotal = inv.supplierBilledTotal || inv.totalAmount;
          const pending = invoiceTotal - paid;
          return {
            _id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            totalAmount: invoiceTotal,
            paidAmount: paid,
            pendingAmount: pending,
            paymentStatus: inv.paymentStatus,
            dueDate: inv.dueDate
          };
        })
        .filter(inv => inv.pendingAmount > 0);

      const totalOutstanding = outstanding.reduce((sum, inv) => sum + inv.pendingAmount, 0);

      return res.status(200).json({
        success: true,
        invoices: outstanding,
        summary: {
          totalInvoices: outstanding.length,
          totalOutstanding
        }
      });
    }

    const invoices = await DealerInvoice.find({
      dealer: partyId,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { pendingAmount: null },
        { pendingAmount: { $exists: false } }
      ]
    }).sort({ invoiceDate: 1 });
    
    const outstandingInvoices = invoices.map(invoice => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount || 0,
      pendingAmount: invoice.pendingAmount != null ? invoice.pendingAmount : (invoice.totalAmount - (invoice.paidAmount || 0)),
      paymentStatus: invoice.paymentStatus,
      dueDate: invoice.dueDate
    }));
    
    const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + inv.pendingAmount, 0);
    
    res.status(200).json({
      success: true,
      invoices: outstandingInvoices,
      summary: {
        totalInvoices: outstandingInvoices.length,
        totalOutstanding
      }
    });
    
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching outstanding invoices',
      error: error.message
    });
  }
};

/**
 * Get unadjusted payments for a party
 * GET /api/unadjusted-payments
 */
export const getUnadjustedPayments = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const { partyId, voucherType = 'Receipt' } = req.query;
    
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }
    
    // Find all posted vouchers for this party (don't filter by unallocatedAmount yet)
    const vouchers = await Voucher.find({
      partyId,
      voucherType,
      status: 'Posted'
    }).sort({ voucherDate: -1 });
    
    // Calculate unallocatedAmount on-the-fly if undefined (for legacy vouchers)
    const unadjustedPayments = vouchers
      .map(voucher => {
        const allocatedAmount = voucher.allocatedAmount || 0;
        const unallocatedAmount = voucher.unallocatedAmount !== undefined 
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
      })
      .filter(v => v.unallocatedAmount > 0); // Filter after calculation
    
    const totalUnadjusted = unadjustedPayments.reduce((sum, v) => sum + v.unallocatedAmount, 0);
    
    res.status(200).json({
      success: true,
      payments: unadjustedPayments,
      summary: {
        totalPayments: unadjustedPayments.length,
        totalUnadjusted
      }
    });
    
  } catch (error) {
    console.error('Error fetching unadjusted payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unadjusted payments',
      error: error.message
    });
  }
};

/**
 * Auto-allocate payments for a dealer
 * POST /api/payment-allocations/auto-allocate
 * 
 * Automatically distributes all available payment balance across outstanding invoices
 * in priority order:
 *   1. Overdue invoices (past due date) — oldest overdue first
 *   2. Nearest to expiry (credit days almost up) — closest to due date next
 *   3. Normal (still within credit period) — oldest first
 */
export const autoAllocatePayments = async (req, res) => {
  try {
    const { Voucher, DealerInvoice } = getModels(req.dbConnection);
    const { partyId } = req.body;

    if (!mongoose.isValidObjectId(partyId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid dealer partyId is required'
      });
    }

    // 1. Get all unadjusted payments (Receipts) for this dealer, oldest first (FIFO)
    const vouchers = await Voucher.find({
      partyId,
      partyType: 'Dealer',
      voucherType: 'Receipt',
      status: 'Posted'
    }).sort({ voucherDate: 1 });

    // Validate persisted balances before building an automatic allocation plan.
    const unadjustedVouchers = [];
    for (const voucher of vouchers) {
      const voucherTotal = Number(voucher.totalAmount);
      const allocatedAmount = Number(voucher.allocatedAmount ?? 0);
      const expectedUnallocatedAmount = voucherTotal - allocatedAmount;
      const storedUnallocatedAmount = voucher.unallocatedAmount == null
        ? expectedUnallocatedAmount
        : Number(voucher.unallocatedAmount);

      if (!Number.isFinite(voucherTotal) || voucherTotal < 0
        || !Number.isFinite(allocatedAmount) || allocatedAmount < 0
        || !Number.isFinite(storedUnallocatedAmount) || storedUnallocatedAmount < 0
        || !Number.isFinite(expectedUnallocatedAmount) || expectedUnallocatedAmount < 0
        || allocatedAmount > voucherTotal
        || Math.abs(storedUnallocatedAmount - expectedUnallocatedAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Voucher ${voucher.voucherNumber} has invalid or inconsistent allocation balances`
        });
      }

      if (expectedUnallocatedAmount > 0) {
        unadjustedVouchers.push({
          voucher,
          unallocatedAmount: expectedUnallocatedAmount
        });
      }
    }

    if (unadjustedVouchers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unadjusted payments available for this dealer'
      });
    }

    const totalAvailable = unadjustedVouchers.reduce((sum, v) => sum + v.unallocatedAmount, 0);

    // 2. Get all outstanding invoices for this dealer
    const invoices = await DealerInvoice.find({
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
    });

    if (invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No outstanding invoices found for this dealer'
      });
    }

    for (const invoice of invoices) {
      const invoiceTotal = Number(invoice.totalAmount);
      const paidAmount = Number(invoice.paidAmount ?? 0);
      const pendingAmount = Number(
        invoice.pendingAmount ?? (invoiceTotal - paidAmount)
      );
      if (!Number.isFinite(invoiceTotal) || invoiceTotal < 0
        || !Number.isFinite(paidAmount) || paidAmount < 0
        || !Number.isFinite(pendingAmount) || pendingAmount <= 0
        || paidAmount > invoiceTotal
        || pendingAmount > invoiceTotal) {
        return res.status(400).json({
          success: false,
          message: `Invoice ${invoice.invoiceNumber} has invalid payment balances`
        });
      }
    }

    // 3. Sort invoices by priority
    const now = new Date();
    const sortedInvoices = invoices
      .map(invoice => {
        const pendingAmount = invoice.pendingAmount != null
          ? invoice.pendingAmount
          : (invoice.totalAmount - (invoice.paidAmount || 0));
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        const isOverdue = dueDate ? dueDate < now : false;
        // Days until due (negative = overdue)
        const daysUntilDue = dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : 9999;

        return {
          invoice,
          pendingAmount,
          dueDate,
          isOverdue,
          daysUntilDue
        };
      })
      .filter(item => item.pendingAmount > 0)
      .sort((a, b) => {
        // Priority 1: Overdue invoices first (oldest overdue = most negative daysUntilDue)
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;

        if (a.isOverdue && b.isOverdue) {
          // Both overdue: oldest overdue first (most negative daysUntilDue first)
          return a.daysUntilDue - b.daysUntilDue;
        }

        // Priority 2: Nearest to expiry (smallest positive daysUntilDue)
        // Priority 3: Normal — oldest invoice first (by invoiceDate)
        if (a.daysUntilDue !== b.daysUntilDue) {
          return a.daysUntilDue - b.daysUntilDue;
        }

        // Tie-breaker: oldest invoice date first
        return new Date(a.invoice.invoiceDate) - new Date(b.invoice.invoiceDate);
      });

    // 4. Distribute payments across invoices using FIFO across vouchers
    let globalRemaining = totalAvailable;
    const allocationPlan = []; // { voucherId, invoiceId, amount }

    // Track remaining per voucher
    const voucherRemaining = unadjustedVouchers.map(v => ({
      ...v,
      remaining: v.unallocatedAmount
    }));

    for (const { invoice, pendingAmount } of sortedInvoices) {
      if (globalRemaining <= 0) break;

      const allocateForInvoice = Math.min(pendingAmount, globalRemaining);
      let leftForInvoice = allocateForInvoice;

      // Distribute this invoice's allocation across vouchers (FIFO)
      for (const vInfo of voucherRemaining) {
        if (leftForInvoice <= 0) break;
        if (vInfo.remaining <= 0) continue;

        const amountFromVoucher = Math.min(leftForInvoice, vInfo.remaining);
        allocationPlan.push({
          voucher: vInfo.voucher,
          invoice,
          amount: amountFromVoucher
        });

        vInfo.remaining -= amountFromVoucher;
        leftForInvoice -= amountFromVoucher;
      }

      globalRemaining -= allocateForInvoice;
    }

    if (allocationPlan.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No allocations could be made'
      });
    }

    // 5. Group only stable IDs and amounts; no stale documents are used for writes.
    const allocationsByVoucher = new Map();
    for (const item of allocationPlan) {
      const voucherId = item.voucher._id.toString();
      if (!allocationsByVoucher.has(voucherId)) {
        allocationsByVoucher.set(voucherId, {
          voucherId,
          rows: []
        });
      }
      allocationsByVoucher.get(voucherId).rows.push({
        invoiceId: item.invoice._id.toString(),
        allocatedAmount: item.amount
      });
    }

    // 6. Execute the complete plan in one transaction through the canonical primitive.
    // Every voucher and invoice is re-read and conditionally updated in this snapshot.
    const createdAllocations = await runAllocationTransaction(
      req.dbConnection,
      async (session) => {
        const results = [];
        for (const group of allocationsByVoucher.values()) {
          const allocation = await allocateVoucherBatch({
            dbConnection: req.dbConnection,
            voucherId: group.voucherId,
            rows: group.rows,
            userId: req.user._id,
            notes: 'Auto-allocated',
            expectedPartyId: partyId,
            expectedPartyType: 'Dealer',
            expectedVoucherType: 'Receipt',
            requireOutstandingDealerInvoice: true,
            staleStateStatus: 409
          }, { session });
          results.push(allocation);
        }
        return results;
      }
    );

    // 7. Build the summary only from committed allocation rows.
    const totalAllocated = createdAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.totalAllocated || 0),
      0
    );
    const invoiceOutcomes = new Map();
    for (const allocation of createdAllocations) {
      for (const row of allocation.allocations) {
        invoiceOutcomes.set(String(row.invoiceId), Number(row.remainingAmount));
      }
    }
    const invoicesFullyPaid = [...invoiceOutcomes.values()]
      .filter((remainingAmount) => remainingAmount === 0).length;
    const invoicesPartiallyPaid = invoiceOutcomes.size - invoicesFullyPaid;

    res.status(201).json({
      success: true,
      message: `Auto-allocation complete. ₹${totalAllocated.toLocaleString('en-IN')} allocated across ${invoiceOutcomes.size} invoice(s)`,
      data: {
        allocations: createdAllocations,
        summary: {
          totalAvailable,
          totalAllocated,
          remainingUnallocated: totalAvailable - totalAllocated,
          invoicesFullyPaid,
          invoicesPartiallyPaid,
          totalInvoicesProcessed: invoiceOutcomes.size,
          vouchersUsed: allocationsByVoucher.size
        }
      }
    });

  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('❌ Error in auto-allocate payments:', error);
      console.error('Error stack:', error.stack);
    }
    return res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Error in auto-allocate payments' : error.message,
      error: statusCode >= 500 ? error.message : undefined,
      details: statusCode >= 500 && process.env.NODE_ENV === 'development'
        ? error.stack
        : undefined
    });
  }
};
