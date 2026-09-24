import { getAccountBalances } from '../services/ledgerBalanceService.js';
import { isPnLGroup } from '../config/accountGroups.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Net balance per ledger group, split by primary group, as on a date.
 * `amount` is signed on the group's natural side (debit for assets/expenses,
 * credit for liabilities/income), so an increase always reads as a positive number.
 */
const groupBalances = (balances) => {
  const out = new Map();
  for (const b of balances) {
    const parent = b.parentGroup || 'Unclassified';
    const key = `${parent}||${b.accountGroup}`;
    if (!out.has(key)) {
      out.set(key, { parentGroup: parent, accountGroup: b.accountGroup, debit: 0, credit: 0, net: 0 });
    }
    const row = out.get(key);
    row.debit += b.debit;
    row.credit += b.credit;
    row.net += b.net;
  }
  return [...out.values()].map((r) => {
    const isDebitNatured = r.parentGroup === 'Assets' || r.parentGroup === 'Expenses';
    return { ...r, amount: round2(isDebitNatured ? r.net : -r.net) };
  });
};

const parentTotal = (groups, parent) =>
  round2(groups.filter((g) => g.parentGroup === parent).reduce((s, g) => s + g.amount, 0));

// @desc    Funds Flow statement (sources and applications of funds)
// @route   GET /api/funds-flow
// @access  Private
export const getFundsFlow = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const to = toDate ? new Date(toDate) : new Date();
    to.setHours(23, 59, 59, 999);

    if (!fromDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate is required for a funds flow statement',
      });
    }

    // Opening is the day BEFORE fromDate so the period includes fromDate itself
    const openingDate = new Date(fromDate);
    openingDate.setDate(openingDate.getDate() - 1);
    openingDate.setHours(23, 59, 59, 999);

    const [closingBalances, openingBalances] = await Promise.all([
      getAccountBalances(req.dbConnection, to),
      getAccountBalances(req.dbConnection, openingDate),
    ]);

    const closing = groupBalances(closingBalances);
    const opening = groupBalances(openingBalances);
    const openingMap = new Map(opening.map((r) => [`${r.parentGroup}||${r.accountGroup}`, r]));

    // Union of both sides so a group that appeared or vanished in the period is caught
    const keys = new Set([...closing.map((r) => `${r.parentGroup}||${r.accountGroup}`), ...openingMap.keys()]);

    const sources = [];
    const applications = [];

    for (const key of keys) {
      const [parentGroup, accountGroup] = key.split('||');
      if (isPnLGroup(accountGroup)) continue; // handled as net profit below

      const closeAmt = closing.find((r) => `${r.parentGroup}||${r.accountGroup}` === key)?.amount || 0;
      const openAmt = openingMap.get(key)?.amount || 0;
      const delta = round2(closeAmt - openAmt);
      if (Math.abs(delta) < 0.005) continue;

      const isAsset = parentGroup === 'Assets';
      const label = accountGroup;

      // Assets: an increase uses funds; a decrease releases funds.
      // Liabilities/equity: an increase provides funds; a decrease uses funds.
      if (isAsset) {
        if (delta > 0) applications.push({ label, amount: delta, kind: 'Increase in asset' });
        else sources.push({ label, amount: -delta, kind: 'Decrease in asset' });
      } else {
        if (delta > 0) sources.push({ label, amount: delta, kind: 'Increase in liability/equity' });
        else applications.push({ label, amount: -delta, kind: 'Decrease in liability/equity' });
      }
    }

    // Net profit for the period is itself a source (or a net loss, an application)
    const incomeMovement = round2(
      parentTotal(closing, 'Income') - parentTotal(opening, 'Income')
    );
    const expenseMovement = round2(
      parentTotal(closing, 'Expenses') - parentTotal(opening, 'Expenses')
    );
    const netProfit = round2(incomeMovement - expenseMovement);

    if (netProfit > 0) {
      sources.push({ label: 'Net Profit for the period', amount: netProfit, kind: 'Profit' });
    } else if (netProfit < 0) {
      applications.push({ label: 'Net Loss for the period', amount: -netProfit, kind: 'Loss' });
    }

    const sortDesc = (a, b) => b.amount - a.amount;
    sources.sort(sortDesc);
    applications.sort(sortDesc);

    const totalSources = round2(sources.reduce((s, r) => s + r.amount, 0));
    const totalApplications = round2(applications.reduce((s, r) => s + r.amount, 0));

    res.json({
      success: true,
      data: {
        fromDate: new Date(fromDate),
        toDate: to,
        openingAsOn: openingDate,
        sources,
        applications,
        totals: {
          sources: totalSources,
          applications: totalApplications,
          difference: round2(totalSources - totalApplications),
          isBalanced: Math.abs(totalSources - totalApplications) < 0.01,
        },
        netProfit,
        incomeMovement,
        expenseMovement,
        note: 'Sources and applications of funds between the two dates, derived from movements in balance-sheet ledger groups plus the period result.',
      },
    });
  } catch (error) {
    console.error('Funds flow error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default { getFundsFlow };
