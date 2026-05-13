import { collectionSchema } from '../SalesExecutiveAppBackend/models/Collection.js';
import { dealerSchema } from '../models/Dealer.js';
import { userSchema } from '../models/User.js';
import { seNotificationSchema } from '../SalesExecutiveAppBackend/models/SENotification.js';
import { voucherSchema } from '../models/Voucher.js';
import { bankAccountSchema } from '../models/BankAccount.js';
import { cashAccountSchema } from '../models/CashAccount.js';
import { dealerLedgerSchema } from '../models/DealerLedger.js';
import { generateVoucherNumber, getFinancialYear } from '../services/voucherNumberService.js';
import { requiresCashSplitting, validateCashTransaction } from '../services/cashSplittingService.js';

const getModels = (dbConnection) => {
  return {
    Collection:     dbConnection.models.Collection     || dbConnection.model('Collection',     collectionSchema),
    Dealer:         dbConnection.models.Dealer         || dbConnection.model('Dealer',         dealerSchema),
    User:           dbConnection.models.User           || dbConnection.model('User',           userSchema),
    SENotification: dbConnection.models.SENotification || dbConnection.model('SENotification', seNotificationSchema),
    Voucher:        dbConnection.models.Voucher        || dbConnection.model('Voucher',        voucherSchema),
    BankAccount:    dbConnection.models.BankAccount    || dbConnection.model('BankAccount',    bankAccountSchema),
    CashAccount:    dbConnection.models.CashAccount    || dbConnection.model('CashAccount',    cashAccountSchema),
    DealerLedger:   dbConnection.models.DealerLedger   || dbConnection.model('DealerLedger',   dealerLedgerSchema),
  };
};

// Helper: notify the SE who submitted the collection
const notifySE = async (db, seUserId, type, title, message, data = {}) => {
  try {
    const models = getModels(db);
    const notif = await models.SENotification.create({ user: seUserId, type, title, message, data, priority: 'high' });
    const seUser = await models.User.findById(seUserId).select('fcmToken').lean();
    if (seUser?.fcmToken) {
      const { sendPushNotification } = await import('../services/firebaseNotificationService.js');
      await sendPushNotification({
        token: seUser.fcmToken, title, body: message,
        data: { type, notificationId: notif._id.toString(), ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      });
    }
  } catch (e) {
    console.error('notifySE (collection) error (non-fatal):', e.message);
  }
};

// Get all collections (Admin)
export const getAllCollections = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const {
      status,
      salesExecutive,
      dealer,
      paymentMode,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    console.log('📋 Fetching all collections (Admin)');

    // Build query
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (salesExecutive) {
      query.collectedBy = salesExecutive;
    }
    
    if (dealer) {
      query.dealer = dealer;
    }
    
    if (paymentMode) {
      query.paymentMode = paymentMode;
    }
    
    if (startDate || endDate) {
      query.collectionDate = {};
      if (startDate) {
        query.collectionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.collectionDate.$lte = new Date(endDate);
      }
    }

    // Fetch collections with pagination
    const skip = (page - 1) * limit;
    const collections = await Collection.find(query)
      .populate('dealer', 'name code')
      .populate('collectedBy', 'name')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Collection.countDocuments(query);

    console.log(`✅ Found ${collections.length} collections`);

    res.json({
      success: true,
      collections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all collections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections',
      error: error.message
    });
  }
};

// Get collection by ID (Admin)
export const getCollectionByIdAdmin = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;

    console.log('📄 Fetching collection details (Admin):', id);

    const collection = await Collection.findById(id)
      .populate('dealer', 'name code contactPerson phone email')
      .populate('collectedBy', 'name email phone')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .lean();

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    console.log(`✅ Collection found: ${collection.collectionNumber}`);

    res.json({
      success: true,
      collection
    });
  } catch (error) {
    console.error('Get collection by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collection details',
      error: error.message
    });
  }
};

// Approve collection (Admin)
export const approveCollection = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;
    const user = req.user;

    console.log('✅ Approving collection:', id, 'by', user.name);

    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    if (collection.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Collection is already ${collection.status.toLowerCase()}`
      });
    }

    collection.status = 'Approved';
    collection.approvedBy = user._id;
    collection.approvedAt = new Date();

    await collection.save();

    console.log(`✅ Collection approved: ${collection.collectionNumber}`);

    // Notify the SE who submitted this collection
    if (collection.collectedBy) {
      notifySE(req.dbConnection, collection.collectedBy, 'collection_approved',
        '✅ Collection Approved',
        `Your collection ${collection.collectionNumber} of ₹${collection.amount?.toLocaleString('en-IN')} from ${collection.dealerName} has been approved.`,
        { collectionId: collection._id.toString(), collectionNumber: collection.collectionNumber }
      );
    }

    res.json({
      success: true,
      message: 'Collection approved successfully',
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        status: collection.status
      }
    });
  } catch (error) {
    console.error('Approve collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve collection',
      error: error.message
    });
  }
};

// Reject collection (Admin)
export const rejectCollection = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user;

    console.log('❌ Rejecting collection:', id, 'by', user.name);

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const collection = await Collection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    if (collection.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Collection is already ${collection.status.toLowerCase()}`
      });
    }

    collection.status = 'Rejected';
    collection.rejectedBy = user._id;
    collection.rejectedAt = new Date();
    collection.rejectionReason = reason;

    await collection.save();

    console.log(`❌ Collection rejected: ${collection.collectionNumber}`);

    // Notify the SE who submitted this collection
    if (collection.collectedBy) {
      notifySE(req.dbConnection, collection.collectedBy, 'collection_rejected',
        '❌ Collection Rejected',
        `Your collection ${collection.collectionNumber} of ₹${collection.amount?.toLocaleString('en-IN')} from ${collection.dealerName} was rejected. Reason: ${reason}`,
        { collectionId: collection._id.toString(), collectionNumber: collection.collectionNumber, reason }
      );
    }

    res.json({
      success: true,
      message: 'Collection rejected successfully',
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        status: collection.status
      }
    });
  } catch (error) {
    console.error('Reject collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject collection',
      error: error.message
    });
  }
};

// Get collection statistics (Admin)
export const getCollectionStats = async (req, res) => {
  try {
    const { Collection } = getModels(req.dbConnection);
    const { startDate, endDate } = req.query;

    console.log('📊 Fetching collection statistics');

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.collectionDate = {};
      if (startDate) dateFilter.collectionDate.$gte = new Date(startDate);
      if (endDate) dateFilter.collectionDate.$lte = new Date(endDate);
    }

    const stats = await Collection.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const formattedStats = {
      total: 0,
      totalAmount: 0,
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 }
    };

    stats.forEach(stat => {
      formattedStats.total += stat.count;
      formattedStats.totalAmount += stat.totalAmount;
      
      const status = stat._id.toLowerCase();
      formattedStats[status] = {
        count: stat.count,
        amount: stat.totalAmount
      };
    });

    console.log('✅ Collection stats calculated');

    res.json({
      success: true,
      stats: formattedStats
    });
  } catch (error) {
    console.error('Get collection stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collection statistics',
      error: error.message
    });
  }
};

/**
 * Create Receipt Voucher from an approved Collection
 * POST /api/collections/:id/create-voucher
 * 
 * Body (optional overrides):
 *   voucherDate, transactionMode, totalAmount, bankAccount, narration,
 *   splitFrequency, splitDirection
 */
export const createVoucherFromCollection = async (req, res) => {
  try {
    const { Collection, Dealer, Voucher, BankAccount, CashAccount, DealerLedger } = getModels(req.dbConnection);
    const { id } = req.params;
    const user = req.user;

    console.log('🧾 Creating voucher from collection:', id);

    const collection = await Collection.findById(id);
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }

    if (collection.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: `Collection must be approved first. Current status: ${collection.status}`
      });
    }

    // Check if voucher already created for this collection
    if (collection.voucherId) {
      return res.status(400).json({
        success: false,
        message: 'Voucher already created for this collection'
      });
    }

    // Get dealer info
    const dealer = await Dealer.findById(collection.dealer).select('name code').lean();
    if (!dealer) {
      return res.status(404).json({ success: false, message: 'Dealer not found' });
    }

    // Allow admin to override fields or use collection data
    const {
      voucherDate = collection.collectionDate || new Date(),
      transactionMode = mapPaymentMode(collection.paymentMode),
      totalAmount = collection.amount,
      bankAccount = null,
      narration = `Collection by ${collection.collectedByName} - ${collection.collectionNumber}`,
      splitFrequency = 1,
      splitDirection = 'backward',
    } = req.body;

    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
    }

    // Validate cash transaction
    const validation = validateCashTransaction(totalAmount, transactionMode);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    // Prepare voucher data
    const voucherData = {
      voucherType: 'Receipt',
      voucherDate: new Date(voucherDate),
      financialYear: getFinancialYear(new Date(voucherDate)),
      partyType: 'Dealer',
      partyId: collection.dealer,
      partyName: dealer.name,
      transactionMode,
      bankAccount: bankAccount || null,
      bankAccountName: null,
      chequeNumber: collection.chequeNumber || null,
      chequeDate: collection.chequeDate || null,
      chequeStatus: collection.chequeNumber ? 'Pending' : null,
      upiTransactionId: collection.transactionId || null,
      referenceNumber: collection.transactionId || collection.chequeNumber || null,
      totalAmount,
      allocatedAmount: 0,
      unallocatedAmount: totalAmount,
      allocationType: 'OnAccount',
      allocations: [],
      narration,
      notes: collection.notes || '',
      status: 'Posted',
      createdBy: user._id,
    };

    // Get bank account name if provided
    if (bankAccount) {
      try {
        const bankAcc = await BankAccount.findById(bankAccount);
        voucherData.bankAccountName = bankAcc?.accountName || null;
      } catch (err) {
        voucherData.bankAccountName = null;
      }
    }

    // Check if cash splitting is needed
    const needsSplitting = requiresCashSplitting(transactionMode, totalAmount);
    let createdVouchers = [];

    if (needsSplitting) {
      // Manual cash splitting (can't use splitCashPayment as it doesn't support dbConnection)
      const totalSplits = Math.ceil(totalAmount / 10000);
      let remainingAmount = totalAmount;
      const splitDates = [];
      let currentDate = new Date(voucherDate);

      // Generate split dates
      for (let i = 0; i < totalSplits; i++) {
        splitDates.push(new Date(currentDate));
        if (splitDirection === 'backward') {
          currentDate.setDate(currentDate.getDate() - splitFrequency);
        } else {
          currentDate.setDate(currentDate.getDate() + splitFrequency);
        }
      }
      splitDates.sort((a, b) => a - b);

      // Generate parent voucher number
      const parentVoucherNumber = await generateVoucherNumber('Receipt', new Date(voucherDate), req.dbConnection);

      for (let i = 0; i < splitDates.length && remainingAmount > 0; i++) {
        const splitAmount = Math.min(remainingAmount, 10000);
        const splitVoucherData = {
          ...voucherData,
          voucherNumber: i === 0 ? parentVoucherNumber : `${parentVoucherNumber}-${i + 1}`,
          voucherDate: splitDates[i],
          totalAmount: splitAmount,
          allocatedAmount: 0,
          unallocatedAmount: splitAmount,
          isCashSplit: true,
          splitSequence: i + 1,
          totalSplits,
          originalAmount: totalAmount,
          splitDirection,
          splitFrequency,
          splitReason: `Cash limit compliance (₹10,000/day) - Split ${i + 1} of ${totalSplits}`,
          narration: `${narration} [Split ${i + 1}/${totalSplits}]`,
        };

        const voucher = new Voucher(splitVoucherData);
        await voucher.save();
        createdVouchers.push(voucher);
        await updateAccountBalance('Receipt', splitVoucherData.transactionMode, splitVoucherData.bankAccount, splitAmount, req.dbConnection);
        remainingAmount -= splitAmount;
      }

      // Set parent voucher ID for child splits
      if (createdVouchers.length > 1) {
        const parentId = createdVouchers[0]._id;
        for (let i = 1; i < createdVouchers.length; i++) {
          createdVouchers[i].parentVoucherId = parentId;
          await createdVouchers[i].save();
        }
      }
    } else {
      // Single voucher
      voucherData.voucherNumber = await generateVoucherNumber('Receipt', new Date(voucherDate), req.dbConnection);
      const voucher = new Voucher(voucherData);
      await voucher.save();
      createdVouchers.push(voucher);
      await updateAccountBalance('Receipt', transactionMode, bankAccount, totalAmount, req.dbConnection);
    }

    // Create dealer ledger entries
    for (const voucher of createdVouchers) {
      await createDealerLedgerEntryFromVoucher(voucher, user._id, req.dbConnection);
    }

    // Update collection with voucher reference
    collection.voucherId = createdVouchers[0]._id;
    collection.voucherNumber = createdVouchers[0].voucherNumber;
    collection.voucherCreatedAt = new Date();
    collection.voucherCreatedBy = user._id;
    await collection.save();

    // Notify SE
    notifySE(req.dbConnection, collection.collectedBy, 'voucher_created',
      '🧾 Voucher Created',
      `Voucher ${createdVouchers[0].voucherNumber} created from your collection ${collection.collectionNumber} (${fmtCurrency(totalAmount)})`,
      { collectionId: collection._id.toString(), voucherNumber: createdVouchers[0].voucherNumber }
    );

    console.log(`✅ Voucher(s) created from collection: ${createdVouchers.map(v => v.voucherNumber).join(', ')}`);

    res.status(201).json({
      success: true,
      message: needsSplitting
        ? `Receipt voucher created with ${createdVouchers.length} splits for cash compliance`
        : 'Receipt voucher created successfully',
      vouchers: createdVouchers.map(v => ({
        _id: v._id,
        voucherNumber: v.voucherNumber,
        voucherDate: v.voucherDate,
        totalAmount: v.totalAmount,
      })),
      collection: {
        _id: collection._id,
        collectionNumber: collection.collectionNumber,
        voucherId: collection.voucherId,
        voucherNumber: collection.voucherNumber,
      },
    });
  } catch (error) {
    console.error('❌ Create voucher from collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create voucher from collection',
      error: error.message,
    });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Map SE payment modes to Voucher transaction modes
function mapPaymentMode(seMode) {
  const map = {
    'Cash': 'Cash',
    'Cheque': 'Cheque',
    'Online Transfer': 'Bank',
    'UPI': 'UPI',
    'NEFT': 'NEFT',
    'Bank Transfer': 'Bank',
  };
  return map[seMode] || 'Cash';
}

function fmtCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

// Update account balance (same logic as voucherController)
async function updateAccountBalance(voucherType, transactionMode, bankAccountId, amount, dbConnection) {
  const { BankAccount, CashAccount } = getModels(dbConnection);

  if (transactionMode === 'Cash') {
    const cashAccount = await CashAccount.getCashAccount();
    if (cashAccount) {
      if (voucherType === 'Receipt') cashAccount.currentBalance += amount;
      else if (voucherType === 'Payment') cashAccount.currentBalance -= amount;
      cashAccount.lastUpdated = new Date();
      await cashAccount.save();
    }
  } else if (bankAccountId) {
    const bankAcc = await BankAccount.findById(bankAccountId);
    if (bankAcc) {
      if (voucherType === 'Receipt') bankAcc.currentBalance += amount;
      else if (voucherType === 'Payment') bankAcc.currentBalance -= amount;
      bankAcc.updatedAt = new Date();
      await bankAcc.save();
    }
  }
}

// Create dealer ledger entry (same logic as voucherController)
async function createDealerLedgerEntryFromVoucher(voucher, userId, dbConnection) {
  const { DealerLedger } = getModels(dbConnection);

  if (voucher.partyType !== 'Dealer' || !voucher.partyId) return;

  const lastEntry = await DealerLedger.findOne({ dealer: voucher.partyId })
    .sort({ entryDate: -1, createdAt: -1 });

  const previousBalance = lastEntry ? lastEntry.runningBalance : 0;
  const creditAmount = voucher.totalAmount;
  const runningBalance = previousBalance - creditAmount;

  let paymentMethod = voucher.transactionMode;
  if (['Bank', 'NEFT', 'RTGS'].includes(paymentMethod)) paymentMethod = 'Bank Transfer';

  const ledgerEntry = new DealerLedger({
    dealer: voucher.partyId,
    dealerName: voucher.partyName,
    entryDate: voucher.voucherDate,
    transactionType: 'Payment',
    referenceType: 'Voucher',
    referenceId: voucher._id,
    referenceNumber: voucher.voucherNumber,
    debitAmount: 0,
    creditAmount,
    paymentReceived: creditAmount,
    runningBalance,
    description: `Payment Received - ${voucher.voucherNumber} (${voucher.transactionMode})`,
    remarks: voucher.narration || '',
    paymentMethod,
    chequeDetails: voucher.chequeNumber ? {
      chequeNo: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      status: voucher.chequeStatus || 'Pending',
    } : undefined,
    upiDetails: voucher.upiTransactionId ? {
      transactionId: voucher.upiTransactionId,
    } : undefined,
    createdBy: userId,
  });

  await ledgerEntry.save();
}
