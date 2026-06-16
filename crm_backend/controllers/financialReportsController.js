import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';

const getModels = (dbConnection) => ({
  JournalVoucher:
    dbConnection.models.JournalVoucher ||
    dbConnection.model('JournalVoucher', journalVoucherSchema),
  AccountMaster:
    dbConnection.models.AccountMaster ||
    dbConnection.model('AccountMaster', accountMasterSchema),
});

const getFYStartDate = (fy) => new Date(parseInt(fy.split('-')[0], 10), 3, 1);
const getFYEndDate = (fy) => new Date(parseInt(fy.split('-')[0], 10) + 1, 2, 31, 23, 59, 59, 999);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Resolve a [from, to] window from query (financialYear takes precedence for bounds)
const resolveWindow = ({ fromDate, toDate, financialYear }) => {
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : new Date();
  if (financialYear && /^\d{4}-\d{2}$/.test(financialYear)) {
    from = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);
    if (!toDate || to > fyEnd) to = fyEnd;
  }
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
};

// @desc    Profit & Loss statement (from posted journal vouchers)
// @route   GET /api/financial-reports/profit-loss
// @access  Private
export const getProfitLoss = async (req, res) => {
  try {
    const { JournalVoucher } = getModels(req.dbConnection);
    const { from, to } = resolveWindow(req.query);

    const match = { status: 'Posted', voucherDate: {} };
    if (from) match.voucherDate.$gte = from;
    if (to) match.voucherDate.$lte = to;
    if (!from) delete match.voucherDate.$gte;

    const agg = await JournalVoucher.aggregate([
      { $match: match },
      { $unwind: '$entries' },
      {
        $group: {
          _id: { group: '$entries.accountGroup', name: '$entries.accountName' },
          debit: { $sum: '$entries.debit' },
          credit: { $sum: '$entries.credit' },
        },
      },
    ]);

    // Section builders
    const sections = {
      income: { label: 'Revenue (Sales)', groups: ['Sales'], creditPositive: true, accounts: [], total: 0 },
      directCosts: { label: 'Direct Costs (Purchases & Direct Expenses)', groups: ['Purchase', 'Direct Expenses'], creditPositive: false, accounts: [], total: 0 },
      indirectExpenses: { label: 'Indirect Expenses', groups: ['Indirect Expenses'], creditPositive: false, accounts: [], total: 0 },
    };

    for (const row of agg) {
      const group = row._id.group || 'Other';
      const name = row._id.name || 'Unspecified';
      for (const key of Object.keys(sections)) {
        const sec = sections[key];
        if (sec.groups.includes(group)) {
          const amount = sec.creditPositive
            ? (row.credit - row.debit)
            : (row.debit - row.credit);
          if (Math.abs(amount) < 0.005) break;
          sec.accounts.push({ accountName: name, accountGroup: group, amount: round2(amount) });
          sec.total = round2(sec.total + amount);
          break;
        }
      }
    }

    const income = sections.income.total;
    const directCosts = sections.directCosts.total;
    const indirectExpenses = sections.indirectExpenses.total;
    const grossProfit = round2(income - directCosts);
    const netProfit = round2(grossProfit - indirectExpenses);

    res.json({
      success: true,
      data: {
        period: { from: from || null, to },
        financialYear: req.query.financialYear || null,
        sections,
        summary: {
          income: round2(income),
          directCosts: round2(directCosts),
          grossProfit,
          indirectExpenses: round2(indirectExpenses),
          netProfit,
        },
        note: 'P&L is built from posted journal vouchers. Sales/purchases (from invoices) and expenses post automatically.',
      },
    });
  } catch (error) {
    console.error('Profit & Loss error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    General Ledger — a single account's transactions with running balance
// @route   GET /api/financial-reports/general-ledger
// @access  Private
export const getGeneralLedger = async (req, res) => {
  try {
    const { JournalVoucher, AccountMaster } = getModels(req.dbConnection);
    const { accountName, fromDate, toDate } = req.query;

    if (!accountName) {
      return res.status(400).json({ success: false, message: 'accountName is required' });
    }

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : new Date();
    if (to) to.setHours(23, 59, 59, 999);

    const account = await AccountMaster.findOne({ accountName }).lean();

    // Opening balance (debit-positive): account opening + movements strictly before `from`
    let openingDebit = 0;
    if (account) {
      openingDebit += (account.openingBalanceType || 'Dr') === 'Dr'
        ? (account.openingBalance || 0)
        : -(account.openingBalance || 0);
    }

    if (from) {
      const priorAgg = await JournalVoucher.aggregate([
        { $match: { status: 'Posted', voucherDate: { $lt: from } } },
        { $unwind: '$entries' },
        { $match: { 'entries.accountName': accountName } },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
      ]);
      if (priorAgg[0]) openingDebit += (priorAgg[0].debit - priorAgg[0].credit);
    }
    openingDebit = round2(openingDebit);

    // Transactions within the window
    const txMatch = { status: 'Posted', voucherDate: {} };
    if (from) txMatch.voucherDate.$gte = from;
    if (to) txMatch.voucherDate.$lte = to;
    if (!from) delete txMatch.voucherDate.$gte;

    const txAgg = await JournalVoucher.aggregate([
      { $match: txMatch },
      { $unwind: '$entries' },
      { $match: { 'entries.accountName': accountName } },
      {
        $project: {
          voucherNumber: 1,
          voucherDate: 1,
          voucherType: 1,
          referenceNumber: 1,
          debit: '$entries.debit',
          credit: '$entries.credit',
          narration: '$entries.narration',
        },
      },
      { $sort: { voucherDate: 1, createdAt: 1 } },
    ]);

    let running = openingDebit;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = txAgg.map((t) => {
      running = round2(running + (t.debit || 0) - (t.credit || 0));
      totalDebit += t.debit || 0;
      totalCredit += t.credit || 0;
      return {
        date: t.voucherDate,
        voucherNumber: t.voucherNumber,
        voucherType: t.voucherType,
        referenceNumber: t.referenceNumber,
        narration: t.narration || '',
        debit: round2(t.debit || 0),
        credit: round2(t.credit || 0),
        balance: running,
        balanceType: running >= 0 ? 'Dr' : 'Cr',
      };
    });

    res.json({
      success: true,
      data: {
        accountName,
        accountGroup: account?.accountGroup || null,
        period: { from: from || null, to },
        opening: { amount: Math.abs(openingDebit), type: openingDebit >= 0 ? 'Dr' : 'Cr' },
        rows,
        totals: {
          totalDebit: round2(totalDebit),
          totalCredit: round2(totalCredit),
        },
        closing: { amount: Math.abs(running), type: running >= 0 ? 'Dr' : 'Cr' },
      },
    });
  } catch (error) {
    console.error('General ledger error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List ledger account names (for the General Ledger picker)
// @route   GET /api/financial-reports/ledger-accounts
// @access  Private
export const getLedgerAccounts = async (req, res) => {
  try {
    const { AccountMaster } = getModels(req.dbConnection);
    const accounts = await AccountMaster.find({})
      .select('accountName accountGroup accountType')
      .sort({ accountGroup: 1, accountName: 1 })
      .lean();
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Get ledger accounts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
