import { voucherSchema } from '../models/Voucher.js';
import { bankAccountSchema } from '../models/BankAccount.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import { paymentAllocationSchema } from '../models/PaymentAllocation.js';
import { generateVoucherNumber, getFinancialYear } from '../services/voucherNumberService.js';
import { 
  splitCashPayment, 
  requiresCashSplitting, 
  getSplitPreview,
  validateCashTransaction 
} from '../services/cashSplittingService.js';

// Helper function to get models for the current company database
const getModels = (dbConnection) => {
  return {
    Voucher: dbConnection.models.Voucher || 
             dbConnection.model('Voucher', voucherSchema),
    BankAccount: dbConnection.models.BankAccount || 
                 dbConnection.model('BankAccount', bankAccountSchema),
    CashAccount: dbConnection.models.CashAccount || 
                 dbConnection.model('CashAccount', cashAccountSchema),
    DealerInvoice: dbConnection.models.DealerInvoice || 
                   dbConnection.model('DealerInvoice', dealerInvoiceSchema),
    DealerLedger: dbConnection.models.DealerLedger || 
                  dbConnection.model('DealerLedger', dealerLedgerSchema),
    PaymentAllocation: dbConnection.models.PaymentAllocation || 
                       dbConnection.model('PaymentAllocation', paymentAllocationSchema)
  };
};

/**
 * Create Receipt Voucher
 * POST /api/vouchers/receipt
 */
export const createReceiptVoucher = async (req, res) => {
  try {
    const { Voucher, BankAccount, CashAccount, DealerInvoice, DealerLedger, PaymentAllocation } = getModels(req.dbConnection);
    
    console.log('=== CREATE RECEIPT VOUCHER ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user ? req.user._id : 'NO USER');
    
    const {
      voucherDate,
      partyType,
      partyId,
      partyName,
      transactionMode,
      bankAccount,
      chequeNumber,
      chequeDate,
      upiTransactionId,
      referenceNumber,
      totalAmount,
      allocationType,
      allocations,
      narration,
      notes,
      confirmSplit,
      splitFrequency,
      splitDirection,
      checkDuplicates
    } = req.body;
    
    // Validate authentication
    if (!req.user || !req.user._id) {
      console.error('Authentication error: req.user is missing');
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in again.'
      });
    }
    
    // Validate required fields
    if (!voucherDate || !partyType || !transactionMode || !totalAmount) {
      console.error('Validation error: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: voucherDate, partyType, transactionMode, totalAmount'
      });
    }
    
    // Validate amount
    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero'
      });
    }
    
    // Validate cash transaction
    const validation = validateCashTransaction(totalAmount, transactionMode);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }
    
    // Check if cash splitting is required
    const needsSplitting = requiresCashSplitting(transactionMode, totalAmount);
    
    if (needsSplitting && !confirmSplit) {
      // Return split preview for user confirmation
      const splitPreview = getSplitPreview(totalAmount, new Date(voucherDate), {
        frequency: splitFrequency || 1,
        direction: splitDirection || 'backward',
        skipWeekends: false
      });
      
      return res.status(200).json({
        success: true,
        requiresSplitting: true,
        splitPreview,
        message: validation.message,
        daysRequired: validation.daysRequired
      });
    }
    
    // Prepare voucher data
    const voucherData = {
      voucherType: 'Receipt',
      voucherDate: new Date(voucherDate),
      financialYear: getFinancialYear(new Date(voucherDate)),
      partyType,
      partyId: partyId || null, // Convert empty string to null
      partyName,
      transactionMode,
      bankAccount: bankAccount || null, // Convert empty string to null
      chequeNumber,
      chequeDate: chequeDate ? new Date(chequeDate) : null,
      chequeStatus: chequeNumber ? 'Pending' : null,
      upiTransactionId,
      referenceNumber,
      totalAmount,
      allocationType: allocationType || 'OnAccount',
      allocations: allocations || [],
      narration,
      notes,
      status: 'Posted',
      createdBy: req.user._id
    };
    
    // Get bank account name if bank account is provided
    if (bankAccount) {
      try {
        const bankAcc = await BankAccount.findById(bankAccount);
        voucherData.bankAccountName = bankAcc?.accountName || null;
      } catch (err) {
        console.error('Error fetching bank account:', err);
        voucherData.bankAccountName = null;
      }
    } else {
      voucherData.bankAccountName = null;
    }
    
    // Calculate allocated amount
    if (allocations && allocations.length > 0) {
      voucherData.allocatedAmount = allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    }
    
    let createdVouchers = [];
    
    // Handle cash splitting
    if (needsSplitting) {
      try {
        const splits = await splitCashPayment(voucherData, totalAmount, new Date(voucherDate), {
          frequency: splitFrequency || 1,
          direction: splitDirection || 'backward',
          checkDuplicates: checkDuplicates !== false
        });
        
        // Create all split vouchers
        for (const splitData of splits) {
          const voucher = new Voucher(splitData);
          await voucher.save();
          createdVouchers.push(voucher);
          
          // Update account balance for each split
          await updateAccountBalance('Receipt', splitData.transactionMode, splitData.bankAccount, splitData.totalAmount);
        }
        
        // Set parent voucher ID for child splits
        if (createdVouchers.length > 1) {
          const parentId = createdVouchers[0]._id;
          for (let i = 1; i < createdVouchers.length; i++) {
            createdVouchers[i].parentVoucherId = parentId;
            await createdVouchers[i].save();
          }
        }
      } catch (splitError) {
        console.error('Error in cash splitting:', splitError);
        throw new Error(`Cash splitting failed: ${splitError.message}`);
      }
    } else {
      // Create single voucher
      try {
        voucherData.voucherNumber = await generateVoucherNumber('Receipt', new Date(voucherDate));
        console.log('Generated voucher number:', voucherData.voucherNumber);
      } catch (genError) {
        console.error('Error generating voucher number:', genError);
        throw new Error(`Voucher number generation failed: ${genError.message}`);
      }
      
      try {
        const voucher = new Voucher(voucherData);
        await voucher.save();
        createdVouchers.push(voucher);
        console.log('Voucher saved successfully:', voucher.voucherNumber);
      } catch (saveError) {
        console.error('Error saving voucher:', saveError);
        throw new Error(`Voucher save failed: ${saveError.message}`);
      }
      
      // Update account balance
      try {
        await updateAccountBalance('Receipt', voucherData.transactionMode, voucherData.bankAccount, voucherData.totalAmount);
        console.log('Account balance updated successfully');
      } catch (balanceError) {
        console.error('Error updating account balance:', balanceError);
        throw new Error(`Account balance update failed: ${balanceError.message}`);
      }
    }
    
    // Create dealer ledger entries for all vouchers
    for (const voucher of createdVouchers) {
      await createDealerLedgerEntry(voucher, req.user._id);
    }
    
    // Update invoice status if allocated
    if (allocations && allocations.length > 0) {
      for (const allocation of allocations) {
        await updateInvoicePaymentStatus(allocation.invoiceId, allocation.allocatedAmount);
      }
    }
    
    res.status(201).json({
      success: true,
      message: needsSplitting 
        ? `Receipt voucher created with ${createdVouchers.length} splits for cash compliance`
        : 'Receipt voucher created successfully',
      vouchers: createdVouchers,
      splitInfo: needsSplitting ? {
        totalSplits: createdVouchers.length,
        splits: createdVouchers.map(v => ({
          voucherNumber: v.voucherNumber,
          date: v.voucherDate,
          amount: v.totalAmount
        }))
      } : null
    });
    
  } catch (error) {
    console.error('=== ERROR CREATING RECEIPT VOUCHER ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      success: false,
      message: 'Error creating receipt voucher',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Create Payment Voucher
 * POST /api/vouchers/payment
 */
export const createPaymentVoucher = async (req, res) => {
  try {
    const { Voucher, BankAccount, CashAccount, DealerInvoice, DealerLedger, PaymentAllocation } = getModels(req.dbConnection);
    const {
      voucherDate,
      partyType,
      partyId,
      partyName,
      transactionMode,
      bankAccount,
      chequeNumber,
      chequeDate,
      upiTransactionId,
      referenceNumber,
      totalAmount,
      allocationType,
      allocations,
      narration,
      notes,
      confirmSplit
    } = req.body;
    
    // Validate required fields
    if (!voucherDate || !partyType || !transactionMode || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Validate cash transaction
    const validation = validateCashTransaction(totalAmount, transactionMode);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }
    
    // Check if cash splitting is required
    const needsSplitting = requiresCashSplitting(transactionMode, totalAmount);
    
    if (needsSplitting && !confirmSplit) {
      const splitPreview = getSplitPreview(totalAmount, new Date(voucherDate));
      
      return res.status(200).json({
        success: true,
        requiresSplitting: true,
        splitPreview,
        message: validation.message
      });
    }
    
    // Prepare voucher data
    const voucherData = {
      voucherType: 'Payment',
      voucherDate: new Date(voucherDate),
      financialYear: getFinancialYear(new Date(voucherDate)),
      partyType,
      partyId,
      partyName,
      transactionMode,
      bankAccount,
      bankAccountName: bankAccount ? (await BankAccount.findById(bankAccount))?.accountName : null,
      chequeNumber,
      chequeDate: chequeDate ? new Date(chequeDate) : null,
      chequeStatus: chequeNumber ? 'Pending' : null,
      upiTransactionId,
      referenceNumber,
      totalAmount,
      allocationType: allocationType || 'OnAccount',
      allocations: allocations || [],
      narration,
      notes,
      status: 'Posted',
      createdBy: req.user._id
    };
    
    // Calculate allocated amount
    if (allocations && allocations.length > 0) {
      voucherData.allocatedAmount = allocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
    }
    
    let createdVouchers = [];
    
    // Handle cash splitting
    if (needsSplitting) {
      const splits = await splitCashPayment(voucherData, totalAmount, new Date(voucherDate));
      
      for (const splitData of splits) {
        const voucher = new Voucher(splitData);
        await voucher.save();
        createdVouchers.push(voucher);
        
        await updateAccountBalance('Payment', splitData.transactionMode, splitData.bankAccount, splitData.totalAmount);
      }
      
      if (createdVouchers.length > 1) {
        const parentId = createdVouchers[0]._id;
        for (let i = 1; i < createdVouchers.length; i++) {
          createdVouchers[i].parentVoucherId = parentId;
          await createdVouchers[i].save();
        }
      }
    } else {
      voucherData.voucherNumber = await generateVoucherNumber('Payment', new Date(voucherDate));
      const voucher = new Voucher(voucherData);
      await voucher.save();
      createdVouchers.push(voucher);
      
      await updateAccountBalance('Payment', voucherData.transactionMode, voucherData.bankAccount, voucherData.totalAmount);
    }
    
    // Create dealer ledger entries for all vouchers
    for (const voucher of createdVouchers) {
      await createDealerLedgerEntry(voucher, req.user._id);
    }
    
    res.status(201).json({
      success: true,
      message: needsSplitting 
        ? `Payment voucher created with ${createdVouchers.length} splits for cash compliance`
        : 'Payment voucher created successfully',
      vouchers: createdVouchers,
      splitInfo: needsSplitting ? {
        totalSplits: createdVouchers.length,
        splits: createdVouchers.map(v => ({
          voucherNumber: v.voucherNumber,
          date: v.voucherDate,
          amount: v.totalAmount
        }))
      } : null
    });
    
  } catch (error) {
    console.error('Error creating payment voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment voucher',
      error: error.message
    });
  }
};

/**
 * Create Contra Voucher (Internal Transfer)
 * POST /api/vouchers/contra
 */
export const createContraVoucher = async (req, res) => {
  try {
    const { Voucher, BankAccount, CashAccount } = getModels(req.dbConnection);
    const {
      voucherDate,
      fromAccountType,
      fromAccountId,
      toAccountType,
      toAccountId,
      totalAmount,
      narration,
      notes
    } = req.body;
    
    // Validate
    if (!voucherDate || !fromAccountType || !toAccountType || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    if (fromAccountType === toAccountType && fromAccountId === toAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to the same account'
      });
    }
    
    // Get account names
    let fromAccountName, toAccountName;
    
    if (fromAccountType === 'Cash') {
      const cashAccount = await CashAccount.getCashAccount();
      fromAccountName = cashAccount.accountName;
    } else {
      const bankAccount = await BankAccount.findById(fromAccountId);
      fromAccountName = bankAccount?.accountName;
    }
    
    if (toAccountType === 'Cash') {
      const cashAccount = await CashAccount.getCashAccount();
      toAccountName = cashAccount.accountName;
    } else {
      const bankAccount = await BankAccount.findById(toAccountId);
      toAccountName = bankAccount?.accountName;
    }
    
    // Create voucher
    const voucherNumber = await generateVoucherNumber('Contra', new Date(voucherDate));
    
    const voucher = new Voucher({
      voucherNumber,
      voucherType: 'Contra',
      voucherDate: new Date(voucherDate),
      financialYear: getFinancialYear(new Date(voucherDate)),
      partyType: 'Internal',
      transactionMode: 'Internal',
      totalAmount,
      contraDetails: {
        fromAccount: {
          accountType: fromAccountType,
          accountId: fromAccountId,
          accountName: fromAccountName
        },
        toAccount: {
          accountType: toAccountType,
          accountId: toAccountId,
          accountName: toAccountName
        }
      },
      narration,
      notes,
      status: 'Posted',
      createdBy: req.user._id
    });
    
    await voucher.save();
    
    // Update account balances
    // Deduct from source account
    if (fromAccountType === 'Cash') {
      const cashAccount = await CashAccount.getCashAccount();
      cashAccount.currentBalance -= totalAmount;
      cashAccount.lastUpdated = new Date();
      await cashAccount.save();
    } else {
      const bankAccount = await BankAccount.findById(fromAccountId);
      if (bankAccount) {
        bankAccount.currentBalance -= totalAmount;
        await bankAccount.save();
      }
    }
    
    // Add to destination account
    if (toAccountType === 'Cash') {
      const cashAccount = await CashAccount.getCashAccount();
      cashAccount.currentBalance += totalAmount;
      cashAccount.lastUpdated = new Date();
      await cashAccount.save();
    } else {
      const bankAccount = await BankAccount.findById(toAccountId);
      if (bankAccount) {
        bankAccount.currentBalance += totalAmount;
        await bankAccount.save();
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Contra voucher created successfully',
      voucher
    });
    
  } catch (error) {
    console.error('Error creating contra voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating contra voucher',
      error: error.message
    });
  }
};

/**
 * Get all vouchers with filters
 * GET /api/vouchers
 */
export const getVouchers = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const {
      voucherType,
      partyId,
      transactionMode,
      bankAccount,
      startDate,
      endDate,
      status,
      search,
      page = 1,
      limit = 50
    } = req.query;
    
    const query = {};
    
    if (voucherType) query.voucherType = voucherType;
    if (partyId) query.partyId = partyId;
    if (transactionMode) query.transactionMode = transactionMode;
    if (bankAccount) query.bankAccount = bankAccount;
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.voucherDate = {};
      if (startDate) query.voucherDate.$gte = new Date(startDate);
      if (endDate) query.voucherDate.$lte = new Date(endDate);
    }
    
    if (search) {
      query.$or = [
        { voucherNumber: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { narration: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const vouchers = await Voucher.find(query)
      .populate('bankAccount')
      .populate('createdBy', 'name email')
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Convert to plain objects for modification
    
    // Fetch payment allocations for each voucher
    for (const voucher of vouchers) {
      if (voucher.allocatedAmount > 0) {
        const allocations = await PaymentAllocation.find({ voucherId: voucher._id })
          .populate('allocations.invoiceId', 'invoiceNumber')
          .lean();
        
        voucher.allocationDetails = allocations.flatMap(pa => 
          pa.allocations.map(alloc => ({
            invoiceNumber: alloc.invoiceNumber,
            allocatedAmount: alloc.allocatedAmount,
            allocationDate: pa.allocationDate,
            allocationNumber: pa.allocationNumber
          }))
        );
      }
    }
    
    const total = await Voucher.countDocuments(query);
    
    res.status(200).json({
      success: true,
      vouchers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching vouchers',
      error: error.message
    });
  }
};

/**
 * Get voucher by ID
 * GET /api/vouchers/:id
 */
export const getVoucherById = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const voucher = await Voucher.findById(req.params.id)
      .populate('partyId')
      .populate('bankAccount')
      .populate('parentVoucherId')
      .populate('createdBy', 'name email')
      .populate('allocations.invoiceId');
    
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }
    
    // If this is a split voucher, get all related splits
    let relatedSplits = [];
    if (voucher.isCashSplit) {
      if (voucher.parentVoucherId) {
        // This is a child split, get parent and all siblings
        relatedSplits = await Voucher.find({
          $or: [
            { _id: voucher.parentVoucherId },
            { parentVoucherId: voucher.parentVoucherId }
          ]
        }).sort({ splitSequence: 1 });
      } else {
        // This is the parent, get all children
        relatedSplits = await Voucher.find({
          $or: [
            { _id: voucher._id },
            { parentVoucherId: voucher._id }
          ]
        }).sort({ splitSequence: 1 });
      }
    }
    
    res.status(200).json({
      success: true,
      voucher,
      relatedSplits: relatedSplits.length > 0 ? relatedSplits : null
    });
    
  } catch (error) {
    console.error('Error fetching voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching voucher',
      error: error.message
    });
  }
};

/**
 * Cancel voucher
 * DELETE /api/vouchers/:id
 */
export const cancelVoucher = async (req, res) => {
  try {
    const { Voucher, BankAccount, CashAccount, DealerLedger, PaymentAllocation } = getModels(req.dbConnection);
    const { cancelReason } = req.body;
    
    if (!cancelReason) {
      return res.status(400).json({
        success: false,
        message: 'Cancel reason is required'
      });
    }
    
    const voucher = await Voucher.findById(req.params.id);
    
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }
    
    if (voucher.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Voucher is already cancelled'
      });
    }
    
    // Update voucher status
    voucher.status = 'Cancelled';
    voucher.cancelledAt = new Date();
    voucher.cancelledBy = req.user._id;
    voucher.cancelReason = cancelReason;
    await voucher.save();
    
    // Reverse account balance
    const multiplier = voucher.voucherType === 'Receipt' ? -1 : 1;
    await updateAccountBalance(
      voucher.voucherType,
      voucher.transactionMode,
      voucher.bankAccount,
      voucher.totalAmount * multiplier
    );
    
    res.status(200).json({
      success: true,
      message: 'Voucher cancelled successfully',
      voucher
    });
    
  } catch (error) {
    console.error('Error cancelling voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling voucher',
      error: error.message
    });
  }
};

/**
 * Get cash split preview
 * GET /api/vouchers/cash-split-preview
 */
export const getCashSplitPreview = async (req, res) => {
  try {
    const { amount, startDate } = req.query;
    
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }
    
    const preview = getSplitPreview(
      parseFloat(amount),
      startDate ? new Date(startDate) : new Date()
    );
    
    res.status(200).json({
      success: true,
      preview,
      requiresSplitting: preview.length > 1
    });
    
  } catch (error) {
    console.error('Error generating split preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating split preview',
      error: error.message
    });
  }
};

/**
 * Get unadjusted vouchers (for payment allocation)
 * GET /api/vouchers/unadjusted
 */
export const getUnadjustedVouchers = async (req, res) => {
  try {
    const { Voucher } = getModels(req.dbConnection);
    const { partyId, voucherType = 'Receipt' } = req.query;
    
    const query = {
      voucherType,
      status: 'Posted',
      unallocatedAmount: { $gt: 0 }
    };
    
    if (partyId) {
      query.partyId = partyId;
    }
    
    const vouchers = await Voucher.find(query)
      .populate('partyId')
      .sort({ voucherDate: -1 });
    
    res.status(200).json({
      success: true,
      vouchers
    });
    
  } catch (error) {
    console.error('Error fetching unadjusted vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unadjusted vouchers',
      error: error.message
    });
  }
};

/**
 * Helper: Update account balance
/**
 * Get Current Balances (Cash and Bank)
 * GET /api/vouchers/balances
 */
export const getBalances = async (req, res) => {
  try {
    const { CashAccount, BankAccount } = getModels(req.dbConnection);
    // Get cash balance
    const cashAccount = await CashAccount.getCashAccount();
    const cashBalance = cashAccount ? cashAccount.currentBalance : 0;
    
    // Get all bank account balances
    const bankAccounts = await BankAccount.find({ isActive: true })
      .select('accountName accountNumber bankName currentBalance')
      .sort({ accountName: 1 });
    
    const bankBalances = bankAccounts.map(acc => ({
      _id: acc._id,
      accountName: acc.accountName,
      accountNumber: acc.accountNumber,
      bankName: acc.bankName,
      currentBalance: acc.currentBalance || 0
    }));
    
    res.json({
      success: true,
      cashBalance,
      bankBalances,
      totalBankBalance: bankBalances.reduce((sum, acc) => sum + acc.currentBalance, 0)
    });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching balances',
      error: error.message
    });
  }
};

/**
 * Helper: Update account balance
 */
const updateAccountBalance = async (voucherType, transactionMode, bankAccountId, amount) => {
  if (transactionMode === 'Cash') {
    const cashAccount = await CashAccount.getCashAccount();
    if (voucherType === 'Receipt') {
      cashAccount.currentBalance += amount;
    } else if (voucherType === 'Payment') {
      cashAccount.currentBalance -= amount;
    }
    cashAccount.lastUpdated = new Date();
    await cashAccount.save();
  } else if (transactionMode === 'Bank' && bankAccountId) {
    const bankAccount = await BankAccount.findById(bankAccountId);
    if (bankAccount) {
      if (voucherType === 'Receipt') {
        bankAccount.currentBalance += amount;
      } else if (voucherType === 'Payment') {
        bankAccount.currentBalance -= amount;
      }
      bankAccount.updatedAt = new Date();
      await bankAccount.save();
    }
  }
};

/**
 * Helper: Update invoice payment status
 */
const updateInvoicePaymentStatus = async (invoiceId, paidAmount) => {
  const invoice = await DealerInvoice.findById(invoiceId);
  if (invoice) {
    invoice.paidAmount = (invoice.paidAmount || 0) + paidAmount;
    invoice.pendingAmount = invoice.totalAmount - invoice.paidAmount;
    
    if (invoice.paidAmount >= invoice.totalAmount) {
      invoice.paymentStatus = 'Paid';
    } else if (invoice.paidAmount > 0) {
      invoice.paymentStatus = 'Partially Paid';
    }
    
    await invoice.save();
  }
};

/**
 * Helper: Create dealer ledger entry for voucher
 */
const createDealerLedgerEntry = async (voucher, userId) => {
  try {
    // Only create ledger entry if party is a Dealer
    if (voucher.partyType !== 'Dealer' || !voucher.partyId) {
      console.log('Skipping ledger entry - not a dealer transaction');
      return;
    }
    
    console.log(`📝 Creating dealer ledger entry for voucher: ${voucher.voucherNumber}`);
    
    // Get last ledger entry for running balance
    const lastEntry = await DealerLedger.findOne({ dealer: voucher.partyId })
      .sort({ entryDate: -1, createdAt: -1 });
    
    const previousBalance = lastEntry ? lastEntry.runningBalance : 0;
    
    // Determine transaction type and amounts based on voucher type
    let transactionType, debitAmount, creditAmount, runningBalance, description;
    
    if (voucher.voucherType === 'Receipt') {
      // Receipt = Payment received from dealer = Credit (reduces outstanding)
      transactionType = 'Payment'; // Fixed: DealerLedger uses "Payment" not "Receipt"
      debitAmount = 0;
      creditAmount = voucher.totalAmount;
      runningBalance = previousBalance - voucher.totalAmount; // Reduces dealer's debt
      description = `Payment Received - ${voucher.voucherNumber}`;
      if (voucher.transactionMode) {
        description += ` (${voucher.transactionMode})`;
      }
    } else if (voucher.voucherType === 'Payment') {
      // Payment = Payment made to dealer = Debit (increases outstanding - rare case)
      transactionType = 'Payment';
      debitAmount = voucher.totalAmount;
      creditAmount = 0;
      runningBalance = previousBalance + voucher.totalAmount;
      description = `Payment Made - ${voucher.voucherNumber}`;
      if (voucher.transactionMode) {
        description += ` (${voucher.transactionMode})`;
      }
    } else {
      console.log('Skipping ledger entry - unsupported voucher type:', voucher.voucherType);
      return;
    }
    
    // Map transaction mode to payment method enum
    let paymentMethod = voucher.transactionMode;
    if (paymentMethod === 'Bank' || paymentMethod === 'NEFT' || paymentMethod === 'RTGS') {
      paymentMethod = 'Bank Transfer';
    }
    // Valid values: "Cash", "Cheque", "UPI", "Bank Transfer", "Credit Note", "Adjustment"
    
    // Create ledger entry
    const ledgerEntry = new DealerLedger({
      dealer: voucher.partyId,
      dealerName: voucher.partyName,
      entryDate: voucher.voucherDate,
      transactionType,
      referenceType: 'Voucher',
      referenceId: voucher._id,
      referenceNumber: voucher.voucherNumber,
      debitAmount,
      creditAmount,
      paymentReceived: creditAmount, // For payment received
      runningBalance,
      description,
      remarks: voucher.narration || '',
      paymentMethod,
      chequeDetails: voucher.chequeNumber ? {
        chequeNo: voucher.chequeNumber,
        chequeDate: voucher.chequeDate,
        status: voucher.chequeStatus || 'Pending'
      } : undefined,
      upiDetails: voucher.upiTransactionId ? {
        transactionId: voucher.upiTransactionId
      } : undefined,
      createdBy: userId
    });
    
    await ledgerEntry.save();
    console.log(`✅ Dealer ledger entry created: ${ledgerEntry._id}`);
    
  } catch (error) {
    console.error('❌ Error creating dealer ledger entry:', error);
    // Don't throw error - ledger entry failure shouldn't block voucher creation
    // But log it for debugging
  }
};
