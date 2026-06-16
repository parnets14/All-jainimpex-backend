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

// India financial year helpers (Apr 1 → Mar 31)
const getFYStartDate = (fy) => {
  // fy like "2025-26"
  const startYear = parseInt(fy.split('-')[0], 10);
  return new Date(startYear, 3, 1); // April 1
};
const getFYEndDate = (fy) => {
  const startYear = parseInt(fy.split('-')[0], 10);
  return new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // March 31
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Profit & Loss account groups reset each financial year; everything else
// (assets/liabilities/equity) carries its balance forward as opening.
const PL_GROUPS = new Set(['Sales', 'Purchase', 'Direct Expenses', 'Indirect Expenses']);

// @desc    Trial Balance — closing Dr/Cr per ledger account
// @route   GET /api/trial-balance
// @access  Private
export const getTrialBalance = async (req, res) => {
  try {
    const { JournalVoucher, AccountMaster } = getModels(req.dbConnection);
    const { asOfDate, financialYear } = req.query;

    // Date window
    const endDate = asOfDate ? new Date(asOfDate) : new Date();
    endDate.setHours(23, 59, 59, 999);
    let fyStart = null;
    if (financialYear && /^\d{4}-\d{2}$/.test(financialYear)) {
      fyStart = getFYStartDate(financialYear);
      const fyEnd = getFYEndDate(financialYear);
      // Clamp the end date to the FY end if it's later
      if (endDate > fyEnd) endDate.setTime(fyEnd.getTime());
    }

    // 1) Opening balances from the chart of accounts
    const accounts = await AccountMaster.find({}).lean();
    // accountName -> aggregated figures
    const ledger = new Map();
    const ensure = (name, group) => {
      if (!ledger.has(name)) {
        ledger.set(name, {
          accountName: name,
          accountGroup: group || 'Other',
          openingDebit: 0,
          openingCredit: 0,
          movementDebit: 0,
          movementCredit: 0,
        });
      }
      return ledger.get(name);
    };

    for (const acc of accounts) {
      const row = ensure(acc.accountName, acc.accountGroup);
      // P&L accounts do not carry a chart opening balance into an FY view
      if (fyStart && PL_GROUPS.has(acc.accountGroup)) continue;
      const ob = acc.openingBalance || 0;
      if ((acc.openingBalanceType || 'Dr') === 'Dr') row.openingDebit += ob;
      else row.openingCredit += ob;
    }

    // 1b) When scoped to a financial year, carry forward the closing balance of
    //     balance-sheet accounts from ALL prior periods as this year's opening.
    if (fyStart) {
      const priorAgg = await JournalVoucher.aggregate([
        { $match: { status: 'Posted', voucherDate: { $lt: fyStart } } },
        { $unwind: '$entries' },
        {
          $group: {
            _id: '$entries.accountName',
            accountGroup: { $first: '$entries.accountGroup' },
            totalDebit: { $sum: '$entries.debit' },
            totalCredit: { $sum: '$entries.credit' },
          },
        },
      ]);
      for (const p of priorAgg) {
        // Skip P&L accounts — they reset every financial year
        if (PL_GROUPS.has(p.accountGroup)) continue;
        const row = ensure(p._id || 'Unspecified', p.accountGroup);
        const net = (p.totalDebit || 0) - (p.totalCredit || 0);
        if (net >= 0) row.openingDebit += net;
        else row.openingCredit += -net;
      }
    }

    // 2) Posted journal voucher movements within the period
    const match = { status: 'Posted', voucherDate: { $lte: endDate } };
    if (fyStart) match.voucherDate.$gte = fyStart;

    const agg = await JournalVoucher.aggregate([
      { $match: match },
      { $unwind: '$entries' },
      {
        $group: {
          _id: '$entries.accountName',
          accountGroup: { $first: '$entries.accountGroup' },
          totalDebit: { $sum: '$entries.debit' },
          totalCredit: { $sum: '$entries.credit' },
        },
      },
    ]);

    for (const g of agg) {
      const name = g._id || 'Unspecified';
      const row = ensure(name, g.accountGroup);
      if (!row.accountGroup || row.accountGroup === 'Other') {
        row.accountGroup = g.accountGroup || row.accountGroup;
      }
      row.movementDebit += g.totalDebit || 0;
      row.movementCredit += g.totalCredit || 0;
    }

    // 3) Net each account to a single closing Dr/Cr
    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const row of ledger.values()) {
      const netDebit =
        (row.openingDebit - row.openingCredit) +
        (row.movementDebit - row.movementCredit);
      const closingDebit = netDebit >= 0 ? round2(netDebit) : 0;
      const closingCredit = netDebit < 0 ? round2(-netDebit) : 0;

      // Skip accounts with zero opening, zero movement and zero balance
      const hasActivity =
        row.openingDebit || row.openingCredit ||
        row.movementDebit || row.movementCredit;
      if (!hasActivity && closingDebit === 0 && closingCredit === 0) continue;

      totalDebit += closingDebit;
      totalCredit += closingCredit;

      rows.push({
        accountName: row.accountName,
        accountGroup: row.accountGroup,
        openingDebit: round2(row.openingDebit),
        openingCredit: round2(row.openingCredit),
        movementDebit: round2(row.movementDebit),
        movementCredit: round2(row.movementCredit),
        closingDebit,
        closingCredit,
      });
    }

    // 4) Group by accountGroup for display
    rows.sort((a, b) =>
      a.accountGroup === b.accountGroup
        ? a.accountName.localeCompare(b.accountName)
        : a.accountGroup.localeCompare(b.accountGroup)
    );

    const groups = {};
    for (const r of rows) {
      if (!groups[r.accountGroup]) {
        groups[r.accountGroup] = { accountGroup: r.accountGroup, accounts: [], groupDebit: 0, groupCredit: 0 };
      }
      groups[r.accountGroup].accounts.push(r);
      groups[r.accountGroup].groupDebit += r.closingDebit;
      groups[r.accountGroup].groupCredit += r.closingCredit;
    }
    const grouped = Object.values(groups).map((g) => ({
      ...g,
      groupDebit: round2(g.groupDebit),
      groupCredit: round2(g.groupCredit),
    }));

    totalDebit = round2(totalDebit);
    totalCredit = round2(totalCredit);
    const difference = round2(totalDebit - totalCredit);

    res.json({
      success: true,
      data: {
        asOfDate: endDate,
        financialYear: financialYear || null,
        rows,
        grouped,
        totals: {
          totalDebit,
          totalCredit,
          difference,
          isBalanced: Math.abs(difference) < 0.01,
        },
        note: financialYear
          ? `Financial-year view (${financialYear}): opening balances are carried forward from prior years for balance-sheet accounts; income/expense accounts reset each year. Built from posted journal vouchers.`
          : 'Cumulative trial balance up to the selected date, from posted journal vouchers plus account opening balances.',
      },
    });
  } catch (error) {
    console.error('Trial balance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
