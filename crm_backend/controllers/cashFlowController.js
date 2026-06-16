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

const resolveWindow = ({ fromDate, toDate, financialYear }) => {
  let from = fromDate ? new Date(fromDate) : null;
  let to = toDate ? new Date(toDate) : new Date();
  if (financialYear && /^\d{4}-\d{2}$/.test(financialYear)) {
    from = getFYStartDate(financialYear);
    const fyEnd = getFYEndDate(financialYear);
    if (!toDate || to > fyEnd) to = fyEnd;
  }
  if (to) to.setHours(23, 59, 59, 999);
  if (from) from.setHours(0, 0, 0, 0);
  return { from, to };
};

// Which activity does a counter-account group belong to?
const ACTIVITY_OF_GROUP = {
  // Operating — day-to-day trade
  Sales: 'operating',
  Purchase: 'operating',
  'Direct Expenses': 'operating',
  'Indirect Expenses': 'operating',
  'Sundry Debtors': 'operating',
  'Sundry Creditors': 'operating',
  'Current Liabilities': 'operating',
  'Current Assets': 'operating',
  'Duties & Taxes': 'operating',
  'GST Payable': 'operating',
  'GST Input Credit': 'operating',
  // Investing — buying/selling long-term assets
  'Fixed Assets': 'investing',
  // Financing — owners & lenders
  Capital: 'financing',
  'Reserves & Surplus': 'financing',
  'Loans & Liabilities': 'financing',
};
const activityFor = (group) => ACTIVITY_OF_GROUP[group] || 'operating';

const ACTIVITY_LABELS = {
  operating: 'Operating Activities',
  investing: 'Investing Activities',
  financing: 'Financing Activities',
};

// @desc    Cash Flow Statement (indirect-from-ledger; built from posted JVs)
// @route   GET /api/cash-flow?financialYear= OR fromDate=&toDate=
// @access  Private
export const getCashFlow = async (req, res) => {
  try {
    const { JournalVoucher, AccountMaster } = getModels(req.dbConnection);
    const { from, to } = resolveWindow(req.query);

    // 1) Identify cash & bank ledger accounts
    const cashAccounts = await AccountMaster.find({
      accountGroup: 'Current Assets',
      accountName: { $regex: /cash|bank/i },
    }).select('accountName openingBalance openingBalanceType').lean();

    const cashNameSet = new Set(cashAccounts.map((a) => a.accountName));
    cashNameSet.add('Cash Account');
    cashNameSet.add('Bank Account');
    const cashNames = Array.from(cashNameSet);

    // 2) Opening cash = chart opening balances + net cash movement before `from`
    let openingCash = 0;
    for (const a of cashAccounts) {
      openingCash += (a.openingBalanceType || 'Dr') === 'Dr' ? (a.openingBalance || 0) : -(a.openingBalance || 0);
    }
    if (from) {
      const priorAgg = await JournalVoucher.aggregate([
        { $match: { status: 'Posted', voucherDate: { $lt: from } } },
        { $unwind: '$entries' },
        { $match: { 'entries.accountName': { $in: cashNames } } },
        { $group: { _id: null, debit: { $sum: '$entries.debit' }, credit: { $sum: '$entries.credit' } } },
      ]);
      if (priorAgg[0]) openingCash += (priorAgg[0].debit - priorAgg[0].credit);
    }
    openingCash = round2(openingCash);

    // 3) Within the window: for every voucher that touches a cash account, the
    //    counter-entries (non-cash lines) explain why cash moved.
    //    cash inflow attributable to a counter line = credit − debit.
    const voucherDateMatch = {};
    if (from) voucherDateMatch.$gte = from;
    if (to) voucherDateMatch.$lte = to;

    const agg = await JournalVoucher.aggregate([
      {
        $match: {
          status: 'Posted',
          ...(Object.keys(voucherDateMatch).length ? { voucherDate: voucherDateMatch } : {}),
          'entries.accountName': { $in: cashNames },
        },
      },
      { $unwind: '$entries' },
      { $match: { 'entries.accountName': { $nin: cashNames } } },
      {
        $group: {
          _id: { group: '$entries.accountGroup', name: '$entries.accountName' },
          net: { $sum: { $subtract: ['$entries.credit', '$entries.debit'] } },
        },
      },
    ]);

    // 4) Bucket into activities
    const buckets = {
      operating: { key: 'operating', label: ACTIVITY_LABELS.operating, inflows: [], outflows: [], total: 0 },
      investing: { key: 'investing', label: ACTIVITY_LABELS.investing, inflows: [], outflows: [], total: 0 },
      financing: { key: 'financing', label: ACTIVITY_LABELS.financing, inflows: [], outflows: [], total: 0 },
    };

    for (const row of agg) {
      const group = row._id.group || 'Other';
      const name = row._id.name || 'Unspecified';
      const net = round2(row.net);
      if (Math.abs(net) < 0.005) continue;
      const bucket = buckets[activityFor(group)];
      const line = { accountName: name, accountGroup: group, amount: Math.abs(net) };
      if (net >= 0) bucket.inflows.push(line);
      else bucket.outflows.push(line);
      bucket.total = round2(bucket.total + net);
    }

    // sort each bucket's lines by amount desc
    for (const b of Object.values(buckets)) {
      b.inflows.sort((x, y) => y.amount - x.amount);
      b.outflows.sort((x, y) => y.amount - x.amount);
    }

    const operating = buckets.operating.total;
    const investing = buckets.investing.total;
    const financing = buckets.financing.total;
    const netCashFlow = round2(operating + investing + financing);
    const closingCash = round2(openingCash + netCashFlow);

    res.json({
      success: true,
      data: {
        period: { from: from || null, to },
        financialYear: req.query.financialYear || null,
        cashAccounts: cashNames,
        openingCash,
        activities: [buckets.operating, buckets.investing, buckets.financing],
        summary: {
          operating: round2(operating),
          investing: round2(investing),
          financing: round2(financing),
          netCashFlow,
          openingCash,
          closingCash,
        },
        note: 'Cash flow is derived from posted journal vouchers that move cash or bank. Each cash movement is classified by its counter-account into Operating, Investing or Financing activities.',
      },
    });
  } catch (error) {
    console.error('Cash flow error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
