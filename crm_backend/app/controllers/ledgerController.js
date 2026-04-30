import { dealerLedgerSchema }  from '../../models/DealerLedger.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';

const getModels = (db) => ({
  DealerLedger:  db.models.DealerLedger  || db.model('DealerLedger',  dealerLedgerSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  DealerInvoice: db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema),
});

// ── helpers ───────────────────────────────────────────────────────────────────

// Build combined, deduplicated, sorted ledger entries for a dealer
// Sources: DealerLedger (old system + voucher-created payments) + DealerInvoice (new system)
async function buildCombinedEntries(db, dealerId, startDate, endDate) {
  const { DealerLedger, DealerInvoice } = getModels(db);

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    dateFilter.$lte = e;
  }

  // 1. Old ledger entries (invoices + payments created by old system / voucherController)
  const oldFilter = {
    dealer: dealerId,
    transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment', 'Credit Note'] },
  };
  if (startDate || endDate) oldFilter.entryDate = dateFilter;

  const oldEntries = await DealerLedger.find(oldFilter).lean();

  // Track invoice IDs already in old ledger to avoid double-counting
  const invoiceIdsInOldLedger = new Set(
    oldEntries
      .filter(e => e.transactionType === 'Invoice' && e.invoice)
      .map(e => (e.invoice?._id || e.invoice)?.toString())
      .filter(Boolean)
  );

  // Fetch paymentStatus for old-ledger invoice entries from DealerInvoice
  const oldInvoiceIds = oldEntries
    .filter(e => e.transactionType === 'Invoice' && e.invoice)
    .map(e => (e.invoice?._id || e.invoice));
  const invoiceStatusMap = {};
  if (oldInvoiceIds.length > 0) {
    const invDocs = await DealerInvoice.find({ _id: { $in: oldInvoiceIds } })
      .select('_id paymentStatus paidAmount totalAmount pendingAmount')
      .lean();
    invDocs.forEach(inv => {
      invoiceStatusMap[inv._id.toString()] = {
        paymentStatus: inv.paymentStatus,
        paidAmount: inv.paidAmount,
        totalAmount: inv.totalAmount,
        pendingAmount: inv.pendingAmount,
      };
    });
  }

  // 2. New-system invoices NOT already in old ledger
  const invFilter = { dealer: dealerId, isDeleted: false, isDraft: false };
  if (startDate || endDate) invFilter.invoiceDate = dateFilter;
  const invoices = await DealerInvoice.find(invFilter).lean();

  // 3. Combine
  const combined = [];

  oldEntries.forEach(e => {
    const invId = (e.invoice?._id || e.invoice)?.toString();
    const invStatus = invId ? invoiceStatusMap[invId] : null;
    combined.push({
      _id: e._id,
      entryDate: e.entryDate,
      transactionType: e.transactionType,
      invoiceNumber: e.invoiceNumber || '',
      creditNoteNumber: e.creditNoteNumber || '',
      debitAmount: e.debitAmount || 0,
      creditAmount: e.creditAmount || 0,
      description: e.description || e.remarks || '',
      paymentMethod: e.paymentMethod || '',
      chequeDetails: e.chequeDetails || null,
      upiDetails: e.upiDetails || null,
      creditDays: e.creditDays || 0,
      salesType: e.salesType || '',
      source: 'ledger',
      // Include payment status from the linked DealerInvoice (if any)
      paymentStatus: invStatus?.paymentStatus || null,
      paidAmount: invStatus?.paidAmount,
      pendingAmount: invStatus?.pendingAmount,
    });
  });

  invoices.forEach(inv => {
    if (invoiceIdsInOldLedger.has(inv._id.toString())) return;
    combined.push({
      _id: inv._id,
      entryDate: inv.invoiceDate,
      transactionType: 'Invoice',
      invoiceNumber: inv.invoiceNumber || '',
      creditNoteNumber: '',
      debitAmount: inv.totalAmount || 0,
      creditAmount: 0,
      description: 'Invoice ' + (inv.invoiceNumber || ''),
      paymentMethod: '',
      chequeDetails: null,
      upiDetails: null,
      creditDays: inv.creditDays || 0,
      salesType: inv.salesType || '',
      source: 'invoice',
      paymentStatus: inv.paymentStatus,
      paidAmount: inv.paidAmount,
    });
  });

  // Sort: ascending by DATE only (ignore time); same date → debit (invoice) before credit (payment)
  combined.sort((a, b) => {
    const da = new Date(a.entryDate); da.setHours(0, 0, 0, 0);
    const db = new Date(b.entryDate); db.setHours(0, 0, 0, 0);
    const diff = da - db;
    if (diff !== 0) return diff;
    // Same calendar date: invoices (debit) before payments (credit)
    return (a.debitAmount > 0 ? 0 : 1) - (b.debitAmount > 0 ? 0 : 1);
  });

  return combined;
}

// Calculate opening balance (sum of all entries BEFORE startDate)
async function calcOpeningBalance(db, dealerId, startDate) {
  if (!startDate) return 0;
  const { DealerLedger, DealerInvoice } = getModels(db);
  const before = new Date(startDate);

  const [oldBefore, invBefore] = await Promise.all([
    DealerLedger.find({ dealer: dealerId, entryDate: { $lt: before } }).lean(),
    DealerInvoice.find({ dealer: dealerId, isDeleted: false, isDraft: false, invoiceDate: { $lt: before } }).lean(),
  ]);

  const invIdsInOld = new Set(
    oldBefore
      .filter(e => e.transactionType === 'Invoice' && e.invoice)
      .map(e => (e.invoice?._id || e.invoice)?.toString())
      .filter(Boolean)
  );

  let bal = 0;
  oldBefore.forEach(e => { bal += (e.debitAmount || 0) - (e.creditAmount || 0); });
  invBefore.forEach(inv => {
    if (!invIdsInOld.has(inv._id.toString())) bal += inv.totalAmount || 0;
  });
  return bal;
}

// @desc    Get dealer's ledger (paginated, combined)
// @route   GET /api/app/ledger
export const getMyLedger = async (req, res) => {
  try {
    const { Dealer } = getModels(req.dbConnection);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const combined = await buildCombinedEntries(req.dbConnection, dealer._id, startDate, endDate);
    const openingBalance = await calcOpeningBalance(req.dbConnection, dealer._id, startDate);

    // Attach running balance (ascending order = oldest first)
    let bal = openingBalance;
    combined.forEach(e => {
      bal += e.debitAmount - e.creditAmount;
      e.runningBalance = bal;
    });

    // Paginate — send oldest first (ascending), frontend displays as-is
    const total = combined.length;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const page_entries = combined.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      ledger: page_entries,
      openingBalance,
      closingBalance: bal,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalEntries: total,
        hasNext: skip + page_entries.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('getMyLedger error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get ledger statement (with opening/closing balance)
// @route   GET /api/app/ledger/statement
export const getLedgerStatement = async (req, res) => {
  try {
    const { Dealer } = getModels(req.dbConnection);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const combined = await buildCombinedEntries(req.dbConnection, dealer._id, startDate, endDate);
    const openingBalance = await calcOpeningBalance(req.dbConnection, dealer._id, startDate);

    let bal = openingBalance;
    combined.forEach(e => {
      bal += e.debitAmount - e.creditAmount;
      e.runningBalance = bal;
    });

    res.json({
      success: true,
      statement: {
        openingBalance,
        closingBalance: bal,
        entries: combined,
        period: { startDate, endDate },
      },
    });
  } catch (error) {
    console.error('getLedgerStatement error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get outstanding amount
// @route   GET /api/app/ledger/outstanding
export const getOutstandingAmount = async (req, res) => {
  try {
    const { DealerLedger, DealerInvoice, Dealer } = getModels(req.dbConnection);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    // Combine both sources for accurate outstanding
    const [oldTotals, invTotals, invIdsInOld] = await Promise.all([
      DealerLedger.aggregate([
        { $match: { dealer: dealer._id } },
        { $group: { _id: null, totalDebit: { $sum: '$debitAmount' }, totalCredit: { $sum: '$creditAmount' } } },
      ]),
      DealerInvoice.find({ dealer: dealer._id, isDeleted: false, isDraft: false }).lean(),
      DealerLedger.find({ dealer: dealer._id, transactionType: 'Invoice', invoice: { $ne: null } })
        .select('invoice').lean(),
    ]);

    const invoiceIdsInOldLedger = new Set(
      invIdsInOld.map(e => (e.invoice?._id || e.invoice)?.toString()).filter(Boolean)
    );

    const oldDebit  = oldTotals[0]?.totalDebit  || 0;
    const oldCredit = oldTotals[0]?.totalCredit || 0;

    // Add new-system invoices not already in old ledger
    const newInvoiceTotal = invTotals
      .filter(inv => !invoiceIdsInOldLedger.has(inv._id.toString()))
      .reduce((s, inv) => s + (inv.totalAmount || 0), 0);

    const totalOutstanding = Math.max(0, oldDebit + newInvoiceTotal - oldCredit);
    const creditLimit      = dealer.creditLimit || 0;
    const availableBalance = Math.max(0, creditLimit - totalOutstanding);

    res.json({
      success: true,
      outstanding: {
        totalOutstanding,
        creditLimit,
        availableBalance,
        creditDaysRegular: dealer.creditDaysRegular || 0,
        creditDaysCD: dealer.creditDaysCD || 0,
      },
    });
  } catch (error) {
    console.error('getOutstandingAmount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get ageing buckets
// @route   GET /api/app/ledger/ageing
export const getAgeingBuckets = async (req, res) => {
  try {
    const { DealerLedger, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const now = new Date();
    const buckets = [
      { range: '0-30 Days',  days: 30,       amount: 0 },
      { range: '31-60 Days', days: 60,       amount: 0 },
      { range: '61-90 Days', days: 90,       amount: 0 },
      { range: '90+ Days',   days: Infinity, amount: 0 },
    ];

    const ledgerEntries = await DealerLedger.find({ dealer: dealer._id, transactionType: 'Invoice' });
    for (const entry of ledgerEntries) {
      const daysDiff = Math.floor((now - entry.entryDate) / (1000 * 60 * 60 * 24));
      if      (daysDiff <= 30) buckets[0].amount += entry.debitAmount || 0;
      else if (daysDiff <= 60) buckets[1].amount += entry.debitAmount || 0;
      else if (daysDiff <= 90) buckets[2].amount += entry.debitAmount || 0;
      else                     buckets[3].amount += entry.debitAmount || 0;
    }

    res.json({
      success: true,
      ageingBuckets: buckets,
      totalOutstanding: buckets.reduce((s, b) => s + b.amount, 0),
    });
  } catch (error) {
    console.error('getAgeingBuckets error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
