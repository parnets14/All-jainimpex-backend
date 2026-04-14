import { accountMasterSchema } from '../models/AccountMaster.js';

const getModels = (dbConnection) => {
  return {
    AccountMaster: dbConnection.models.AccountMaster || dbConnection.model('AccountMaster', accountMasterSchema)
  };
};

// Default accounts to seed on first load
const DEFAULT_ACCOUNTS = [
  { accountName: 'Capital Account',    accountGroup: 'Capital',           accountType: 'Equity',    openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'Opening Stock',      accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'GST Payable',        accountGroup: 'Duties & Taxes',    accountType: 'Liability', openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'GST Input Credit',   accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Purchase Account',   accountGroup: 'Purchase',          accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sales Account',      accountGroup: 'Sales',             accountType: 'Income',    openingBalanceType: 'Cr', isSystem: true },
  { accountName: 'Freight Charges',    accountGroup: 'Direct Expenses',   accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Salary',             accountGroup: 'Indirect Expenses', accountType: 'Expense',   openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Cash Account',       accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Bank Account',       accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sundry Debtors',     accountGroup: 'Current Assets',    accountType: 'Asset',     openingBalanceType: 'Dr', isSystem: true },
  { accountName: 'Sundry Creditors',   accountGroup: 'Current Liabilities', accountType: 'Liability', openingBalanceType: 'Cr', isSystem: true },
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
