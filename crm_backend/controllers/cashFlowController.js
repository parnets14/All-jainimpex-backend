import { voucherSchema } from '../models/Voucher.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { bankAccountSchema } from '../models/BankAccount.js';

const getModels = (dbConnection) => ({
  Voucher:
    dbConnection.models.Voucher ||
    dbConnection.model('Voucher', voucherSchema),
  CashAccount:
    dbConnection.models.CashAccount ||
    dbConnection.model('CashAccount', cashAccountSchema),
  BankAccount:
    dbConnection.models.BankAccount ||
    dbConnection.model('BankAccount', bankAccountSchema),
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

// Which activity does a voucher's party belong to?
//   Dealer / Supplier / Other  → Operating (day-to-day trade & expenses)
//   Family/Friends             → Financing (owner funds in / drawings out)
//   Internal                   → Operating (rare; standalone internal money moves)
const activityForParty = (partyType) => {
  if (partyType === 'Family/Friends') return 'financing';
  return 'operating';
};

const ACTIVITY_LABELS = {
  operating: 'Operating Activities',
  investing: 'Investing Activities',
  financing: 'Financing Activities',
};

// Human label for a party + direction
const lineLabel = (partyType, isInflow) => {
  switch (partyType) {
    case 'Dealer': return isInflow ? 'Collections from dealers' : 'Refunds paid to dealers';
    case 'Supplier': return isInflow ? 'Refunds from suppliers' : 'Payments to suppliers';
    case 'Family/Friends': return isInflow ? 'Funds introduced (family/friends)' : 'Drawings / paid to family/friends';
    case 'Internal': return isInflow ? 'Internal receipts' : 'Internal payments';
    default: return isInflow ? 'Other receipts' : 'Other payments / expenses';
  }
};

// @desc    Cash Flow Statement — built from the Voucher module (the actual
//          source of truth for cash & bank movement) so it ties out to the
//          real bank/cash balances and the balance sheet.
// @route   GET /api/cash-flow?financialYear= OR fromDate=&toDate=
// @access  Private
export const getCashFlow = async (req, res) => {
  try {
    const { Voucher, CashAccount, BankAccount } = getModels(req.dbConnection);
    const { from, to } = resolveWindow(req.query);

    // ── 1. Real cash & bank: opening balances + current balances (Box A) ──
    const cashAccount = await CashAccount.getCashAccount();
    const bankAccounts = await BankAccount.find({}).select('openingBalance currentBalance').lean();

    const staticOpening = round2(
      (cashAccount?.openingBalance || 0) +
      bankAccounts.reduce((s, b) => s + (b.openingBalance || 0), 0)
    );
    const realCurrentCash = round2(
      (cashAccount?.currentBalance || 0) +
      bankAccounts.reduce((s, b) => s + (b.currentBalance || 0), 0)
    );

    // ── 2. Opening cash AT `from` = static opening + net voucher movement before `from`.
    //       Only Receipt/Payment move cash; Contra is an internal transfer (net zero on
    //       total cash+bank) and is excluded. Cancelled/Draft are ignored. ──
    let openingCash = staticOpening;
    if (from) {
      const priorAgg = await Voucher.aggregate([
        { $match: { status: 'Posted', voucherType: { $in: ['Receipt', 'Payment'] }, voucherDate: { $lt: from } } },
        { $group: {
          _id: '$voucherType',
          amount: { $sum: '$totalAmount' },
        }},
      ]);
      let priorReceipts = 0, priorPayments = 0;
      for (const r of priorAgg) {
        if (r._id === 'Receipt') priorReceipts = r.amount || 0;
        else if (r._id === 'Payment') priorPayments = r.amount || 0;
      }
      openingCash = round2(staticOpening + priorReceipts - priorPayments);
    }

    // ── 3. Window movement: group Receipt/Payment by party type ──
    const dateMatch = {};
    if (from) dateMatch.$gte = from;
    if (to) dateMatch.$lte = to;

    const agg = await Voucher.aggregate([
      {
        $match: {
          status: 'Posted',
          voucherType: { $in: ['Receipt', 'Payment'] },
          ...(Object.keys(dateMatch).length ? { voucherDate: dateMatch } : {}),
        },
      },
      {
        $group: {
          _id: { voucherType: '$voucherType', partyType: '$partyType' },
          amount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // ── 4. Bucket into activities ──
    const buckets = {
      operating: { key: 'operating', label: ACTIVITY_LABELS.operating, inflows: [], outflows: [], total: 0 },
      investing: { key: 'investing', label: ACTIVITY_LABELS.investing, inflows: [], outflows: [], total: 0 },
      financing: { key: 'financing', label: ACTIVITY_LABELS.financing, inflows: [], outflows: [], total: 0 },
    };

    for (const row of agg) {
      const amount = round2(row.amount || 0);
      if (amount < 0.005) continue;
      const isInflow = row._id.voucherType === 'Receipt';
      const partyType = row._id.partyType || 'Other';
      const bucket = buckets[activityForParty(partyType)];
      const line = {
        accountName: lineLabel(partyType, isInflow),
        partyType,
        amount,
        count: row.count,
      };
      if (isInflow) {
        bucket.inflows.push(line);
        bucket.total = round2(bucket.total + amount);
      } else {
        bucket.outflows.push(line);
        bucket.total = round2(bucket.total - amount);
      }
    }

    for (const b of Object.values(buckets)) {
      b.inflows.sort((x, y) => y.amount - x.amount);
      b.outflows.sort((x, y) => y.amount - x.amount);
    }

    const operating = buckets.operating.total;
    const investing = buckets.investing.total;
    const financing = buckets.financing.total;
    const netCashFlow = round2(operating + investing + financing);
    const closingCash = round2(openingCash + netCashFlow);

    // Tie-out: when reporting up to today, closing should equal the real balance.
    const tiesOut = Math.abs(closingCash - realCurrentCash) < 1;

    res.json({
      success: true,
      data: {
        period: { from: from || null, to },
        financialYear: req.query.financialYear || null,
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
        realCurrentCash,
        tiesOut,
        note: 'Cash flow is built from posted Receipt and Payment vouchers — the actual record of money entering and leaving your bank and cash. Internal (Contra) transfers are excluded. Collections from dealers and payments to suppliers/expenses are Operating; owner funds are Financing. Pay expenses through a Payment voucher so they appear here.',
      },
    });
  } catch (error) {
    console.error('Cash flow error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
