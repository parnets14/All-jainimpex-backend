import {
  getAccountBalances,
  getParentGroupBalances,
  amountOf,
  sumLedgerGroups,
} from '../services/ledgerBalanceService.js';
import {
  CURRENT_ASSET_GROUPS,
  NON_CURRENT_ASSET_GROUPS,
  CURRENT_LIABILITY_GROUPS,
  NON_CURRENT_LIABILITY_GROUPS,
  EQUITY_GROUPS,
  DIRECT_COST_GROUPS,
} from '../config/accountGroups.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Division guarded against a zero denominator. Returns null rather than 0 or
 * Infinity so the UI can show "N/A" instead of a meaningless number.
 */
const ratio = (numerator, denominator, decimals = 2) =>
  denominator ? Number((numerator / denominator).toFixed(decimals)) : null;

// @desc    Ratio Analysis — key financial ratios computed from the books
// @route   GET /api/ratio-analysis
// @access  Private
export const getRatioAnalysis = async (req, res) => {
  try {
    const asOf = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
    const balances = await getAccountBalances(req.dbConnection, asOf);
    const parentGroups = getParentGroupBalances(balances);

    // ── Position ────────────────────────────────────────────────────────────
    const totalAssets = amountOf(parentGroups, 'Assets');
    const totalLiabilities = amountOf(parentGroups, 'Liabilities');
    const totalIncome = amountOf(parentGroups, 'Income');
    const totalExpenses = amountOf(parentGroups, 'Expenses');

    const currentAssets = sumLedgerGroups(balances, CURRENT_ASSET_GROUPS);
    const nonCurrentAssets = sumLedgerGroups(balances, NON_CURRENT_ASSET_GROUPS);
    const currentLiabilities = sumLedgerGroups(balances, CURRENT_LIABILITY_GROUPS, { creditNatured: true });
    const nonCurrentLiabilities = sumLedgerGroups(balances, NON_CURRENT_LIABILITY_GROUPS, { creditNatured: true });
    const capital = sumLedgerGroups(balances, EQUITY_GROUPS, { creditNatured: true });

    // ── Performance ─────────────────────────────────────────────────────────
    // Income and Expenses are credit/debit natured respectively; the parent-group
    // helper already returns them as positive magnitudes.
    const netProfit = round2(totalIncome - totalExpenses);
    const directCosts = sumLedgerGroups(balances, DIRECT_COST_GROUPS);
    const grossProfit = round2(totalIncome - directCosts);

    const equity = round2(capital + netProfit);
    const workingCapital = round2(currentAssets - currentLiabilities);

    const ratios = {
      // Liquidity
      currentRatio: ratio(currentAssets, currentLiabilities),
      workingCapital,
      // Solvency
      debtEquityRatio: ratio(totalLiabilities, equity),
      equityRatioPct: ratio(equity, totalAssets, 2),
      // Profitability
      grossMarginPct: ratio(grossProfit, totalIncome, 2),
      netMarginPct: ratio(netProfit, totalIncome, 2),
      returnOnAssetsPct: ratio(netProfit, totalAssets, 2),
      returnOnEquityPct: ratio(netProfit, equity, 2),
      expenseRatioPct: ratio(totalExpenses, totalIncome, 2),
    };

    res.json({
      success: true,
      data: {
        asOfDate: asOf,
        position: {
          totalAssets,
          totalLiabilities,
          equity,
          capital,
          netProfit,
          currentAssets,
          nonCurrentAssets,
          currentLiabilities,
          nonCurrentLiabilities,
          workingCapital,
          totalIncome,
          totalExpenses,
          grossProfit,
          directCosts,
        },
        ratios,
        parentGroups,
        note: 'Computed from posted journal vouchers and account opening balances. Ratios show N/A when the denominator is zero.',
      },
    });
  } catch (error) {
    console.error('Ratio analysis error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default { getRatioAnalysis };
