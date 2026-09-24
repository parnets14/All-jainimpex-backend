import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { parentGroupFor, PRIMARY_GROUPS } from '../config/accountGroups.js';

/**
 * Shared ledger-balance computation for the financial statements.
 *
 * Balances are derived from posted journal vouchers plus each account's opening
 * balance, then netted per account and rolled up to ledger group and primary group.
 * Keeping this in one place means Ratio Analysis, Funds Flow and Trial Balance can
 * never disagree about what an account's balance is.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const getModels = (dbConnection) => ({
  JournalVoucher:
    dbConnection.models.JournalVoucher ||
    dbConnection.model('JournalVoucher', journalVoucherSchema),
  AccountMaster:
    dbConnection.models.AccountMaster ||
    dbConnection.model('AccountMaster', accountMasterSchema),
});

/**
 * Net balance of every account as on `asOf`.
 *
 * @returns {Promise<Array<{
 *   accountName: string, accountGroup: string, parentGroup: string|null,
 *   openingDebit: number, openingCredit: number,
 *   movementDebit: number, movementCredit: number,
 *   debit: number, credit: number, net: number
 * }>>} `net` is positive for a debit balance, negative for a credit balance.
 */
export const getAccountBalances = async (dbConnection, asOf) => {
  const { JournalVoucher, AccountMaster } = getModels(dbConnection);

  const endDate = asOf ? new Date(asOf) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const accounts = await AccountMaster.find({}).lean();

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
    const ob = acc.openingBalance || 0;
    if ((acc.openingBalanceType || 'Dr') === 'Dr') row.openingDebit += ob;
    else row.openingCredit += ob;
  }

  const agg = await JournalVoucher.aggregate([
    { $match: { status: 'Posted', voucherDate: { $lte: endDate } } },
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

  const out = [];
  for (const row of ledger.values()) {
    const net =
      (row.openingDebit - row.openingCredit) + (row.movementDebit - row.movementCredit);

    const hasActivity =
      row.openingDebit || row.openingCredit || row.movementDebit || row.movementCredit;
    if (!hasActivity && Math.abs(net) < 0.005) continue;

    out.push({
      accountName: row.accountName,
      accountGroup: row.accountGroup,
      parentGroup: parentGroupFor(row.accountGroup),
      openingDebit: round2(row.openingDebit),
      openingCredit: round2(row.openingCredit),
      movementDebit: round2(row.movementDebit),
      movementCredit: round2(row.movementCredit),
      debit: net >= 0 ? round2(net) : 0,
      credit: net < 0 ? round2(-net) : 0,
      net: round2(net),
    });
  }

  return out;
};

/**
 * Roll account balances up to primary group (Assets / Liabilities / Income / Expenses).
 *
 * `net` is signed from the group's natural side: positive means a debit balance for
 * assets/expenses, positive means a credit balance for liabilities/income. That makes
 * "how much is in this group" read naturally on both sides of the statements.
 */
export const getParentGroupBalances = (balances) => {
  const bucket = {};
  for (const b of balances) {
    const key = b.parentGroup || 'Unclassified';
    if (!bucket[key]) {
      bucket[key] = { parentGroup: key, accounts: 0, debit: 0, credit: 0, natural: 0 };
    }
    bucket[key].accounts += 1;
    bucket[key].debit += b.debit;
    bucket[key].credit += b.credit;
    bucket[key].natural += b.net;
  }

  const ordered = [...PRIMARY_GROUPS, 'Unclassified'];
  return ordered
    .filter((p) => bucket[p])
    .map((p) => {
      const b = bucket[p];
      // Assets and Expenses are naturally debit; Liabilities and Income are credit.
      const isDebitNatured = p === 'Assets' || p === 'Expenses';
      return {
        parentGroup: p,
        accounts: b.accounts,
        debit: round2(b.debit),
        credit: round2(b.credit),
        // Magnitude on the group's own natural side
        amount: round2(isDebitNatured ? b.natural : -b.natural),
      };
    });
};

/** Convenience: look up one primary group's amount (0 when absent). */
export const amountOf = (parentGroups, name) =>
  parentGroups.find((p) => p.parentGroup === name)?.amount || 0;

/**
 * Sum of balances for a set of ledger groups, on the group's natural side.
 * Used for the current / non-current splits.
 */
export const sumLedgerGroups = (balances, ledgerGroups, { creditNatured = false } = {}) => {
  const total = balances
    .filter((b) => ledgerGroups.includes(b.accountGroup))
    .reduce((s, b) => s + b.net, 0);
  return round2(creditNatured ? -total : total);
};

export default {
  getAccountBalances,
  getParentGroupBalances,
  amountOf,
  sumLedgerGroups,
};
