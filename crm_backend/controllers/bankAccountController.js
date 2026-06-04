import { bankAccountSchema } from '../models/BankAccount.js';
import { cashAccountSchema } from '../models/CashAccount.js';

const getModels = (dbConnection) => {
  return {
    BankAccount: dbConnection.models.BankAccount || dbConnection.model('BankAccount', bankAccountSchema),
    CashAccount: dbConnection.models.CashAccount || dbConnection.model('CashAccount', cashAccountSchema)
  };
};

/**
 * Get all bank accounts
 * GET /api/bank-accounts
 */
export const getBankAccounts = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const { isActive } = req.query;
    
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const bankAccounts = await BankAccount.find(query).sort({ isPrimary: -1, accountName: 1 });
    
    res.status(200).json({
      success: true,
      data: bankAccounts
    });
    
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank accounts',
      error: error.message
    });
  }
};

/**
 * Get bank account by ID
 * GET /api/bank-accounts/:id
 */
export const getBankAccountById = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const bankAccount = await BankAccount.findById(req.params.id);
    
    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: bankAccount
    });
    
  } catch (error) {
    console.error('Error fetching bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank account',
      error: error.message
    });
  }
};

/**
 * Create bank account
 * POST /api/bank-accounts
 */
export const createBankAccount = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const {
      accountName,
      accountNumber,
      bankName,
      branchName,
      ifscCode,
      accountType,
      openingBalance,
      isPrimary,
      notes
    } = req.body;
    
    // Validate required fields
    if (!accountName || !accountNumber || !bankName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: accountName, accountNumber, bankName'
      });
    }
    
    // Check if account number already exists
    const existingAccount = await BankAccount.findOne({ accountNumber });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'Bank account with this account number already exists'
      });
    }
    
    // Create bank account
    const bankAccount = new BankAccount({
      accountName,
      accountNumber,
      bankName,
      branchName,
      ifscCode,
      accountType: accountType || 'Current',
      openingBalance: openingBalance || 0,
      currentBalance: openingBalance || 0,
      isPrimary: isPrimary || false,
      notes
    });
    
    await bankAccount.save();
    
    res.status(201).json({
      success: true,
      message: 'Bank account created successfully',
      data: bankAccount
    });
    
  } catch (error) {
    console.error('Error creating bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bank account',
      error: error.message
    });
  }
};

/**
 * Update bank account
 * PUT /api/bank-accounts/:id
 */
export const updateBankAccount = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const {
      accountName,
      bankName,
      branchName,
      ifscCode,
      accountType,
      isPrimary,
      isActive,
      notes
    } = req.body;
    
    const bankAccount = await BankAccount.findById(req.params.id);
    
    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }
    
    // Update fields
    if (accountName) bankAccount.accountName = accountName;
    if (bankName) bankAccount.bankName = bankName;
    if (branchName !== undefined) bankAccount.branchName = branchName;
    if (ifscCode !== undefined) bankAccount.ifscCode = ifscCode;
    if (accountType) bankAccount.accountType = accountType;
    if (isPrimary !== undefined) bankAccount.isPrimary = isPrimary;
    if (isActive !== undefined) bankAccount.isActive = isActive;
    if (notes !== undefined) bankAccount.notes = notes;
    
    await bankAccount.save();
    
    res.status(200).json({
      success: true,
      message: 'Bank account updated successfully',
      data: bankAccount
    });
    
  } catch (error) {
    console.error('Error updating bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating bank account',
      error: error.message
    });
  }
};

/**
 * Delete bank account
 * DELETE /api/bank-accounts/:id
 */
export const deleteBankAccount = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const bankAccount = await BankAccount.findById(req.params.id);
    
    if (!bankAccount) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found'
      });
    }
    
    // Check if account has transactions
    const { voucherSchema } = await import('../models/Voucher.js');
    const Voucher = req.dbConnection.models.Voucher || req.dbConnection.model('Voucher', voucherSchema);
    const hasTransactions = await Voucher.findOne({ bankAccount: req.params.id });
    
    if (hasTransactions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete bank account with existing transactions. Please deactivate instead.'
      });
    }
    
    await bankAccount.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Bank account deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting bank account',
      error: error.message
    });
  }
};

/**
 * Get cash account
 * GET /api/cash-account
 */
export const getCashAccount = async (req, res) => {
  try {
    const { CashAccount } = getModels(req.dbConnection);
    
    // Find or create cash account for this company
    let cashAccount = await CashAccount.findOne({});
    if (!cashAccount) {
      cashAccount = await CashAccount.create({
        openingBalance: 0,
        currentBalance: 0
      });
    }
    
    res.status(200).json({
      success: true,
      data: cashAccount
    });
    
  } catch (error) {
    console.error('Error fetching cash account:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching cash account',
      error: error.message
    });
  }
};

/**
 * Update cash account opening balance
 * PUT /api/cash-account
 */
export const updateCashAccount = async (req, res) => {
  try {
    const { CashAccount } = getModels(req.dbConnection);
    const { openingBalance, notes } = req.body;
    
    // Find or create cash account for this company
    let cashAccount = await CashAccount.findOne({});
    if (!cashAccount) {
      cashAccount = await CashAccount.create({
        openingBalance: 0,
        currentBalance: 0
      });
    }
    
    if (openingBalance !== undefined) {
      const difference = openingBalance - cashAccount.openingBalance;
      cashAccount.openingBalance = openingBalance;
      cashAccount.currentBalance += difference;
    }
    
    if (notes !== undefined) {
      cashAccount.notes = notes;
    }
    
    cashAccount.lastUpdated = new Date();
    await cashAccount.save();
    
    res.status(200).json({
      success: true,
      message: 'Cash account updated successfully',
      data: cashAccount
    });
    
  } catch (error) {
    console.error('Error updating cash account:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating cash account',
      error: error.message
    });
  }
};

/**
 * Recalculate bank account balance from vouchers
 * POST /api/bank-accounts/:id/recalculate
 * 
 * Rebuilds currentBalance = openingBalance + sum(receipts) - sum(payments)
 * from all posted vouchers linked to this bank account.
 * Fixes stale balances caused by old bug where UPI/Cheque/NEFT/RTGS
 * vouchers didn't update currentBalance.
 */
export const recalculateBankBalance = async (req, res) => {
  try {
    const { BankAccount } = getModels(req.dbConnection);
    const { voucherSchema } = await import('../models/Voucher.js');
    const Voucher = req.dbConnection.models.Voucher || req.dbConnection.model('Voucher', voucherSchema);

    const bankAccount = await BankAccount.findById(req.params.id);
    if (!bankAccount) {
      return res.status(404).json({ success: false, message: 'Bank account not found' });
    }

    const NON_CASH_MODES = ['Bank', 'Cheque', 'UPI', 'NEFT', 'RTGS', 'Card', 'Internal'];

    // Sum all posted receipts to this bank account
    const receiptAgg = await Voucher.aggregate([
      {
        $match: {
          bankAccount: bankAccount._id,
          status: 'Posted',
          voucherType: 'Receipt',
          transactionMode: { $in: NON_CASH_MODES }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Sum all posted payments from this bank account
    const paymentAgg = await Voucher.aggregate([
      {
        $match: {
          bankAccount: bankAccount._id,
          status: 'Posted',
          voucherType: 'Payment',
          transactionMode: { $in: NON_CASH_MODES }
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    // Sum contra: if toAccountId == this bank, it's a credit; if fromAccountId == this bank, it's a debit
    const contraToAgg = await Voucher.aggregate([
      {
        $match: {
          status: 'Posted',
          voucherType: 'Contra',
          toAccountType: 'Bank',
          toAccountId: bankAccount._id
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const contraFromAgg = await Voucher.aggregate([
      {
        $match: {
          status: 'Posted',
          voucherType: 'Contra',
          fromAccountType: 'Bank',
          fromAccountId: bankAccount._id
        }
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalReceipts = (receiptAgg[0]?.total || 0) + (contraToAgg[0]?.total || 0);
    const totalPayments = (paymentAgg[0]?.total || 0) + (contraFromAgg[0]?.total || 0);
    const newBalance = (bankAccount.openingBalance || 0) + totalReceipts - totalPayments;

    const oldBalance = bankAccount.currentBalance;
    bankAccount.currentBalance = parseFloat(newBalance.toFixed(2));
    bankAccount.updatedAt = new Date();
    await bankAccount.save();

    console.log(`✅ Recalculated balance for ${bankAccount.accountName}: ₹${oldBalance} → ₹${newBalance.toFixed(2)}`);

    res.json({
      success: true,
      message: `Balance recalculated successfully`,
      data: {
        accountName: bankAccount.accountName,
        openingBalance: bankAccount.openingBalance,
        totalReceipts: parseFloat(totalReceipts.toFixed(2)),
        totalPayments: parseFloat(totalPayments.toFixed(2)),
        oldBalance: parseFloat(oldBalance.toFixed(2)),
        newBalance: parseFloat(newBalance.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Error recalculating bank balance:', error);
    res.status(500).json({ success: false, message: 'Error recalculating balance', error: error.message });
  }
};

/**
 * Recalculate cash account balance from vouchers
 * POST /api/bank-accounts/recalculate-cash
 */
export const recalculateCashBalance = async (req, res) => {
  try {
    const { CashAccount } = getModels(req.dbConnection);
    const { voucherSchema } = await import('../models/Voucher.js');
    const Voucher = req.dbConnection.models.Voucher || req.dbConnection.model('Voucher', voucherSchema);

    const cashAccount = await CashAccount.getCashAccount();

    const receiptAgg = await Voucher.aggregate([
      { $match: { status: 'Posted', voucherType: 'Receipt', transactionMode: 'Cash' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const paymentAgg = await Voucher.aggregate([
      { $match: { status: 'Posted', voucherType: 'Payment', transactionMode: 'Cash' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalReceipts = receiptAgg[0]?.total || 0;
    const totalPayments = paymentAgg[0]?.total || 0;
    const newBalance = (cashAccount.openingBalance || 0) + totalReceipts - totalPayments;

    const oldBalance = cashAccount.currentBalance;
    cashAccount.currentBalance = parseFloat(newBalance.toFixed(2));
    cashAccount.lastUpdated = new Date();
    await cashAccount.save();

    res.json({
      success: true,
      message: 'Cash balance recalculated successfully',
      data: {
        openingBalance: cashAccount.openingBalance || 0,
        totalReceipts: parseFloat(totalReceipts.toFixed(2)),
        totalPayments: parseFloat(totalPayments.toFixed(2)),
        oldBalance: parseFloat(oldBalance.toFixed(2)),
        newBalance: parseFloat(newBalance.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Error recalculating cash balance:', error);
    res.status(500).json({ success: false, message: 'Error recalculating cash balance', error: error.message });
  }
};
