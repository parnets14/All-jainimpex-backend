import { accountMasterSchema } from '../models/AccountMaster.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { PRIMARY_GROUPS, parentGroupFor } from '../config/accountGroups.js';

const getModels = (dbConnection) => {
  return {
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema),
    JournalVoucher: dbConnection.models.JournalVoucher || dbConnection.model('JournalVoucher', journalVoucherSchema)
  };
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Default accounts to seed on first load
const DEFAULT_ACCOUNTS = [
  { accountName: 'Capital Account',    accountGroup: 'Capital',           accountType: 'Equity',    openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'Opening Stock',      accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'GST Payable',        accountGroup: 'GST Payable',       accountType: 'Liability', openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'GST Input Credit',   accountGroup: 'GST Input Credit',  accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Purchase Account',   accountGroup: 'Purchase',          accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sales Account',      accountGroup: 'Sales',             accountType: 'Income',    openingBalanceType: 'Cr', isSystem: true },
  // Looked up by name in accountingService when posting service charges on a
  // dealer invoice. Seeding it here means the auto-create fallback is not needed.
  { accountName: 'Service Income',     accountGroup: 'Indirect Income',   accountType: 'Income',    openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'Service Expense',    accountGroup: 'Direct Expenses',   accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Freight Charges',    accountGroup: 'Direct Expenses',   accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Salary',             accountGroup: 'Indirect Expenses', accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Cash Account',       accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Bank Account',       accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sundry Debtors',     accountGroup: 'Sundry Debtors',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sundry Creditors',   accountGroup: 'Sundry Creditors',  accountType: 'Liability', openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'Loan Account',       accountGroup: 'Loans & Liabilities', accountType: 'Liability', openingBalanceType: 'Cr', isSystem: true },
];

export const seedDefaultAccounts = async (dbConnection, userId) => {
  const { AccountMaster } = getModels(dbConnection);
  for (const acc of DEFAULT_ACCOUNTS) {
    const exists = await AccountMaster.findOne({ accountName: acc.accountName });
    if (!exists) {
      await AccountMaster.create({ ...acc, createdBy: userId });
    }
  }
};

export const getAccounts = async (req, res) => {
  try {
    const { AccountMaster } = getModels(req.dbConnection);
    
    // Seed defaults if none exist
    const count = await AccountMaster.countDocuments();
    if (count === 0) await seedDefaultAccounts(req.dbConnection, req.user._id);

    const { group, type, search, isActive } = req.query;
    const query = {};
    if (group) query.accountGroup = group;
    if (type) query.accountType = type;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.accountName = { $regex: search, $options: 'i' };

    const accounts = await AccountMaster.find(query)
      .populate('createdBy', 'name')
      .sort({ accountGroup: 1, accountName: 1 });

    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Chart of accounts as a Tally-style tree (primary group → ledger group → accounts)
// @route   GET /api/account-master/tree
// @access  Private
export const getAccountTree = async (req, res) => {
  try {
    const { AccountMaster, JournalVoucher } = getModels(req.dbConnection);

    const count = await AccountMaster.countDocuments();
    if (count === 0) await seedDefaultAccounts(req.dbConnection, req.user._id);

    const accounts = await AccountMaster.find({}).lean();

    const asOf = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
    asOf.setHours(23, 59, 59, 999);

    // Closing balance per account, from posted vouchers up to the as-on date
    const agg = await JournalVoucher.aggregate([
      { $match: { status: 'Posted', voucherDate: { $lte: asOf } } },
      { $unwind: '$entries' },
      {
        $group: {
          _id: '$entries.accountName',
          debit: { $sum: '$entries.debit' },
          credit: { $sum: '$entries.credit' },
        },
      },
    ]);
    const movement = new Map(agg.map((a) => [a._id, a]));

    const rows = accounts.map((a) => {
      const m = movement.get(a.accountName) || { debit: 0, credit: 0 };
      const opening = (a.openingBalance || 0) * ((a.openingBalanceType || 'Dr') === 'Dr' ? 1 : -1);
      const net = opening + (m.debit || 0) - (m.credit || 0);
      return {
        _id: a._id,
        accountName: a.accountName,
        accountGroup: a.accountGroup,
        parentGroup: a.parentGroup ?? parentGroupFor(a.accountGroup),
        accountType: a.accountType,
        isSystem: a.isSystem === true,
        isActive: a.isActive !== false,
        closingDebit: net >= 0 ? round2(net) : 0,
        closingCredit: net < 0 ? round2(-net) : 0,
      };
    });

    const buildNode = (parentGroup, groupRows) => {
      const ledgerGroupNames = [...new Set(groupRows.map((r) => r.accountGroup))].sort();
      const groups = ledgerGroupNames.map((lg) => {
        const accts = groupRows.filter((r) => r.accountGroup === lg);
        return {
          accountGroup: lg,
          accounts: accts,
          totalDebit: round2(accts.reduce((s, r) => s + r.closingDebit, 0)),
          totalCredit: round2(accts.reduce((s, r) => s + r.closingCredit, 0)),
        };
      });
      return {
        parentGroup,
        groups,
        totalDebit: round2(groups.reduce((s, g) => s + g.totalDebit, 0)),
        totalCredit: round2(groups.reduce((s, g) => s + g.totalCredit, 0)),
      };
    };

    const tree = PRIMARY_GROUPS.map((primary) =>
      buildNode(primary, rows.filter((r) => r.parentGroup === primary))
    );

    // Surface anything the mapping doesn't cover instead of hiding it
    const unclassified = rows.filter((r) => !r.parentGroup);
    if (unclassified.length > 0) tree.push(buildNode('Unclassified', unclassified));

    res.json({
      success: true,
      data: {
        asOfDate: asOf,
        tree,
        totals: {
          accounts: rows.length,
          totalDebit: round2(rows.reduce((s, r) => s + r.closingDebit, 0)),
          totalCredit: round2(rows.reduce((s, r) => s + r.closingCredit, 0)),
        },
        note: 'Ledger accounts arranged under primary groups (Assets / Liabilities / Income / Expenses).',
      },
    });
  } catch (error) {
    console.error('Account tree error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createAccount = async (req, res) => {
  try {
    const { AccountMaster } = getModels(req.dbConnection);
    const { accountName, accountGroup, accountType, openingBalance, openingBalanceType, description } = req.body;

    if (!accountName || !accountGroup || !accountType) {
      return res.status(400).json({ success: false, message: 'accountName, accountGroup and accountType are required' });
    }

    const account = await AccountMaster.create({
      accountName, accountGroup, accountType,
      openingBalance: openingBalance || 0,
      openingBalanceType: openingBalanceType || 'Dr',
      description,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, message: 'Account created successfully', account });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Account name already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAccount = async (req, res) => {
  try {
    const { AccountMaster } = getModels(req.dbConnection);
    const account = await AccountMaster.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

    const { accountName, accountGroup, accountType, openingBalance, openingBalanceType, description, isActive } = req.body;

    // System accounts: only allow opening balance and description edits
    if (account.isSystem) {
      account.openingBalance = openingBalance ?? account.openingBalance;
      account.openingBalanceType = openingBalanceType ?? account.openingBalanceType;
      account.description = description ?? account.description;
    } else {
      if (accountName) account.accountName = accountName;
      if (accountGroup) account.accountGroup = accountGroup;
      if (accountType) account.accountType = accountType;
      account.openingBalance = openingBalance ?? account.openingBalance;
      account.openingBalanceType = openingBalanceType ?? account.openingBalanceType;
      account.description = description ?? account.description;
      if (isActive !== undefined) account.isActive = isActive;
    }

    await account.save();
    res.json({ success: true, message: 'Account updated', account });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Account name already exists' });
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const { AccountMaster } = getModels(req.dbConnection);
    const account = await AccountMaster.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    if (account.isSystem) return res.status(400).json({ success: false, message: 'System accounts cannot be deleted' });

    await account.deleteOne();
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
