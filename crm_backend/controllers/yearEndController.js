import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { financialYearClosingSchema } from '../models/FinancialYearClosing.js';
import { yearEndChecklistSchema } from '../models/YearEndChecklist.js';

const getModels = (dbConnection) => ({
  JournalVoucher:
    dbConnection.models.JournalVoucher ||
    dbConnection.model('JournalVoucher', journalVoucherSchema),
  FinancialYearClosing:
    dbConnection.models.FinancialYearClosing ||
    dbConnection.model('FinancialYearClosing', financialYearClosingSchema),
  YearEndChecklist:
    dbConnection.models.YearEndChecklist ||
    dbConnection.model('YearEndChecklist', yearEndChecklistSchema),
});

// India financial year helpers (Apr 1 → Mar 31)
const getFYStartDate = (fy) => {
  const startYear = parseInt(fy.split('-')[0], 10);
  return new Date(startYear, 3, 1); // April 1
};
const getFYEndDate = (fy) => {
  const startYear = parseInt(fy.split('-')[0], 10);
  return new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // March 31
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Build the current financial year string ("2025-26") from today
const currentFinancialYear = () => {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 3 ? y : y - 1; // Apr (month 3) onwards
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
};

// The manual (human-confirmed) checklist items, in display order
const MANUAL_ITEMS = [
  {
    key: 'bank-reconciled',
    title: 'Bank & cash reconciled',
    description: 'Match every bank account closing balance against its bank statement, and verify physical cash in hand matches the books.',
    link: '/reports-logs/books-health',
  },
  {
    key: 'stock-verified',
    title: 'Physical stock verified',
    description: 'Do a physical count of inventory and confirm it matches the closing stock in the system. Adjust differences before closing.',
    link: '/inventory/stock',
  },
  {
    key: 'receivables-payables-reviewed',
    title: 'Receivables & payables reviewed',
    description: 'Confirm dealer outstanding (money to receive) and supplier outstanding (money to pay) are correct. Clear or write off bad debts.',
    link: '/reports-logs/aging-report',
  },
  {
    key: 'gst-filed',
    title: 'GST returns filed',
    description: 'File GSTR-1 and GSTR-3B for all months of the year, and reconcile with GSTR-2B. Pay any GST due.',
    link: '/reports-logs/gst-reports',
  },
  {
    key: 'tds-filed',
    title: 'TDS deposited & filed',
    description: 'Deposit all TDS deducted to the government and file quarterly TDS returns.',
    link: '/reports-logs/tds',
  },
  {
    key: 'expenses-captured',
    title: 'All expenses captured',
    description: 'Make sure every expense bill for the year is entered, including pending/accrued expenses like rent, salaries and interest.',
    link: '/reports-logs/profit-loss',
  },
];

// @desc    Year-end checklist for a financial year (auto checks + saved manual ticks)
// @route   GET /api/year-end/checklist
// @access  Private
export const getYearEndChecklist = async (req, res) => {
  try {
    const { JournalVoucher, FinancialYearClosing, YearEndChecklist } = getModels(req.dbConnection);
    const financialYear =
      req.query.financialYear && /^\d{4}-\d{2}$/.test(req.query.financialYear)
        ? req.query.financialYear
        : currentFinancialYear();

    const fyStart = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);

    const autoItems = [];

    // AUTO 1) Books balanced — all posted JV debits == credits within the FY
    const jvAgg = await JournalVoucher.aggregate([
      { $match: { status: 'Posted', voucherDate: { $gte: fyStart, $lte: fyEnd } } },
      { $unwind: '$entries' },
      { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
    ]);
    const jvDebit = round2(jvAgg[0]?.debit || 0);
    const jvCredit = round2(jvAgg[0]?.credit || 0);
    const jvDiff = round2(jvDebit - jvCredit);
    const balanced = Math.abs(jvDiff) < 0.01;
    autoItems.push({
      key: 'books-balanced',
      type: 'auto',
      title: 'Books are balanced',
      description: 'Total debits equal total credits across all posted journal entries for the year.',
      status: balanced ? 'pass' : 'fail',
      detail: balanced
        ? `Debits ₹${jvDebit} = Credits ₹${jvCredit}.`
        : `Debits ₹${jvDebit} ≠ Credits ₹${jvCredit} (difference ₹${jvDiff}). Check the Books Health screen.`,
      link: '/reports-logs/books-health',
    });

    // AUTO 2) Depreciation posted — a DEP-{fy} depreciation voucher exists
    const depJV = await JournalVoucher.findOne({
      voucherType: 'Depreciation',
      referenceNumber: `DEP-${financialYear}`,
      status: 'Posted',
    }).lean();
    autoItems.push({
      key: 'depreciation-posted',
      type: 'auto',
      title: 'Depreciation posted',
      description: 'Yearly depreciation on fixed assets has been calculated and posted to the books.',
      status: depJV ? 'pass' : 'pending',
      detail: depJV
        ? `Depreciation voucher DEP-${financialYear} is posted.`
        : 'No depreciation has been posted for this year yet. Run it from the Fixed Assets screen.',
      link: '/master/fixed-assets',
    });

    // AUTO 3) Year closed / locked
    const closing = await FinancialYearClosing.findOne({ financialYear }).lean();
    const isClosed = closing && closing.status === 'Closed';
    autoItems.push({
      key: 'year-closed',
      type: 'auto',
      title: 'Financial year closed',
      description: 'The year has been closed and its closing balances carried forward as next year opening balances. This locks the period against further edits.',
      status: isClosed ? 'pass' : 'pending',
      detail: isClosed
        ? `Closed on ${new Date(closing.closedAt).toLocaleDateString('en-IN')}. Net profit ₹${round2(closing.netProfit || 0)}.`
        : closing && closing.status === 'Reopened'
          ? 'This year was reopened and is currently not closed.'
          : 'The year is still open. Complete the steps above, then use "Close Year".',
      link: '/reports-logs/year-end',
    });

    // Merge saved manual ticks
    const saved = await YearEndChecklist.findOne({ financialYear }).lean();
    const savedMap = saved?.manualItems || {};
    const manualItems = MANUAL_ITEMS.map((m) => {
      const s = savedMap[m.key];
      return {
        ...m,
        type: 'manual',
        status: s?.done ? 'done' : 'pending',
        note: s?.note || '',
        updatedAt: s?.updatedAt || null,
      };
    });

    const allItems = [...autoItems, ...manualItems];
    const summary = {
      total: allItems.length,
      complete: allItems.filter((i) => i.status === 'pass' || i.status === 'done').length,
      pending: allItems.filter((i) => i.status === 'pending').length,
      failed: allItems.filter((i) => i.status === 'fail').length,
    };
    // Year can be closed when no auto check is failing and all manual items are ticked
    const readyToClose =
      summary.failed === 0 &&
      manualItems.every((m) => m.status === 'done') &&
      balanced;

    res.json({
      success: true,
      data: {
        financialYear,
        fyStartDate: fyStart,
        fyEndDate: fyEnd,
        isClosed: !!isClosed,
        readyToClose,
        summary,
        autoItems,
        manualItems,
      },
    });
  } catch (error) {
    console.error('Year-end checklist error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle a manual checklist item done/undone
// @route   PATCH /api/year-end/checklist/:key
// @access  Private
export const toggleChecklistItem = async (req, res) => {
  try {
    const { YearEndChecklist } = getModels(req.dbConnection);
    const { key } = req.params;
    const { financialYear, done, note } = req.body;

    if (!financialYear || !/^\d{4}-\d{2}$/.test(financialYear)) {
      return res.status(400).json({ success: false, message: 'Valid financialYear (e.g. "2025-26") is required.' });
    }
    const validKeys = MANUAL_ITEMS.map((m) => m.key);
    if (!validKeys.includes(key)) {
      return res.status(400).json({ success: false, message: `Unknown checklist item "${key}".` });
    }

    let doc = await YearEndChecklist.findOne({ financialYear });
    if (!doc) doc = new YearEndChecklist({ financialYear, manualItems: {} });

    doc.manualItems.set(key, {
      done: !!done,
      note: note || '',
      updatedBy: req.user?._id,
      updatedAt: new Date(),
    });
    await doc.save();

    res.json({ success: true, message: 'Checklist updated.', data: { key, done: !!done } });
  } catch (error) {
    console.error('Toggle checklist item error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
