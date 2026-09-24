/**
 * Chart-of-accounts hierarchy.
 *
 * The ledger groups stored on AccountMaster are the "natural" groups a business
 * thinks in (Sales, Sundry Debtors, GST Payable ...). Tally arranges those under a
 * small set of primary groups so statements can be grouped consistently. This file
 * is the single source of truth for that arrangement.
 *
 * `PARENT_GROUP_MAP` is used by the backfill script and by the chart-of-accounts
 * tree endpoint. Keep it in step with the `accountGroup` enum in
 * models/AccountMaster.js — a group that is missing here is reported as
 * "Unclassified" rather than being silently dropped.
 */

/** Primary (root) groups, in the order statements should present them. */
export const PRIMARY_GROUPS = ['Assets', 'Liabilities', 'Income', 'Expenses'];

/**
 * Which primary group each ledger group rolls up into.
 * `null` means deliberately unclassified (the catch-all "Other" group).
 */
export const PARENT_GROUP_MAP = {
  // Assets
  'Fixed Assets': 'Assets',
  'Current Assets': 'Assets',
  'Sundry Debtors': 'Assets',
  'GST Input Credit': 'Assets',

  // Liabilities
  Capital: 'Liabilities',
  'Reserves & Surplus': 'Liabilities',
  'Loans & Liabilities': 'Liabilities',
  'Current Liabilities': 'Liabilities',
  'Duties & Taxes': 'Liabilities',
  'Sundry Creditors': 'Liabilities',
  'GST Payable': 'Liabilities',

  // Income
  Sales: 'Income',
  'Indirect Income': 'Income',

  // Expenses
  Purchase: 'Expenses',
  'Direct Expenses': 'Expenses',
  'Indirect Expenses': 'Expenses',

  // Explicitly unclassified
  Other: null,
};

/**
 * Resolve the primary group for a ledger group.
 * @returns {string|null} one of PRIMARY_GROUPS, or null when unclassified
 */
export const parentGroupFor = (accountGroup) =>
  Object.prototype.hasOwnProperty.call(PARENT_GROUP_MAP, accountGroup)
    ? PARENT_GROUP_MAP[accountGroup]
    : null;

/** Every ledger group we know about. */
export const LEDGER_GROUPS = Object.keys(PARENT_GROUP_MAP);

/**
 * Groups that belong on the Balance Sheet (everything except income/expense).
 * Used to decide whether a group is a balance-sheet or P&L group.
 */
export const PNL_LEDGER_GROUPS = ['Sales', 'Purchase', 'Direct Expenses', 'Indirect Expenses'];

export const isPnLGroup = (accountGroup) => PNL_LEDGER_GROUPS.includes(accountGroup);

/**
 * Current / non-current split, used by the ratio analysis and funds flow reports.
 * A ledger group not listed in either set is treated as non-current.
 */
export const CURRENT_ASSET_GROUPS = ['Current Assets', 'Sundry Debtors', 'GST Input Credit'];
export const NON_CURRENT_ASSET_GROUPS = ['Fixed Assets'];

export const CURRENT_LIABILITY_GROUPS = [
  'Current Liabilities',
  'Sundry Creditors',
  'GST Payable',
  'Duties & Taxes',
];
export const NON_CURRENT_LIABILITY_GROUPS = ['Loans & Liabilities'];

/** Groups that make up owners' capital. */
export const EQUITY_GROUPS = ['Capital', 'Reserves & Surplus'];

/** Groups counted as cost of goods sold (direct cost). */
export const DIRECT_COST_GROUPS = ['Purchase', 'Direct Expenses'];

export default {
  PRIMARY_GROUPS,
  PARENT_GROUP_MAP,
  parentGroupFor,
  LEDGER_GROUPS,
  PNL_LEDGER_GROUPS,
  isPnLGroup,
  CURRENT_ASSET_GROUPS,
  NON_CURRENT_ASSET_GROUPS,
  CURRENT_LIABILITY_GROUPS,
  NON_CURRENT_LIABILITY_GROUPS,
  EQUITY_GROUPS,
  DIRECT_COST_GROUPS,
};
