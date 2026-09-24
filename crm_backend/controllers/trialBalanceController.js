import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { parentGroupFor, PRIMARY_GROUPS } from '../config/accountGroups.js';

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
        groups[r.accountGroup] = {
          accountGroup: r.accountGroup,
          accounts: [],
          groupDebit: 0,
          groupCredit: 0,
          groupMovementDebit: 0,
          groupMovementCredit: 0,
        };
      }
      const g = groups[r.accountGroup];
      g.accounts.push(r);
      g.groupDebit += r.closingDebit;
      g.groupCredit += r.closingCredit;
      g.groupMovementDebit += r.movementDebit;
      g.groupMovementCredit += r.movementCredit;
    }
    // Every subtotal the report displays is computed here, so the client never has
    // to re-derive a figure and the printed/exported numbers always agree.
    const grouped = Object.values(groups).map((g) => ({
      ...g,
      // Primary group this ledger group belongs to (Assets / Liabilities / Income / Expenses)
      parentGroup: parentGroupFor(g.accountGroup),
      groupDebit: round2(g.groupDebit),
      groupCredit: round2(g.groupCredit),
      groupMovementDebit: round2(g.groupMovementDebit),
      groupMovementCredit: round2(g.groupMovementCredit),
      // Positive = the group closes on the debit side, negative = credit side
      groupNetClosing: round2(g.groupDebit - g.groupCredit),
    }));

    // Roll the ledger groups up into their primary groups so the report can be
    // read at either level without the client doing the arithmetic.
    const buildParentRow = (parent, children) => ({
      parentGroup: parent,
      groupCount: children.length,
      accountCount: children.reduce((s, g) => s + g.accounts.length, 0),
      debit: round2(children.reduce((s, g) => s + g.groupDebit, 0)),
      credit: round2(children.reduce((s, g) => s + g.groupCredit, 0)),
      net: round2(children.reduce((s, g) => s + g.groupNetClosing, 0)),
    });

    const parentGrouped = PRIMARY_GROUPS
      .map((parent) => buildParentRow(parent, grouped.filter((g) => g.parentGroup === parent)))
      .filter((p) => p.groupCount > 0);

    const unclassifiedGroups = grouped.filter((g) => !g.parentGroup);
    if (unclassifiedGroups.length > 0) {
      parentGrouped.push(buildParentRow('Unclassified', unclassifiedGroups));
    }

    totalDebit = round2(totalDebit);
    totalCredit = round2(totalCredit);
    const difference = round2(totalDebit - totalCredit);
    const totalMovementDebit = round2(rows.reduce((s, r) => s + r.movementDebit, 0));
    const totalMovementCredit = round2(rows.reduce((s, r) => s + r.movementCredit, 0));

    res.json({
      success: true,
      data: {
        asOfDate: endDate,
        financialYear: financialYear || null,
        rows,
        grouped,
        parentGrouped,
        totals: {
          totalDebit,
          totalCredit,
          difference,
          isBalanced: Math.abs(difference) < 0.01,
          totalMovementDebit,
          totalMovementCredit,
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
