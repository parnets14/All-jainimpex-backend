import DealerLedger from '../../models/DealerLedger.js';
import Dealer from '../../models/Dealer.js';

// @desc    Get dealer's ledger
// @route   GET /api/app/ledger
// @access  Private (Dealer)
export const getMyLedger = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const { page = 1, limit = 50, startDate, endDate, type } = req.query;

    const query = { dealer: dealerId };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (type) {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ledgerEntries = await DealerLedger.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await DealerLedger.countDocuments(query);

    res.json({
      success: true,
      ledger: ledgerEntries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalEntries: total,
        hasNext: skip + ledgerEntries.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error getting dealer ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ledger',
      error: error.message
    });
  }
};

// @desc    Get ledger statement
// @route   GET /api/app/ledger/statement
// @access  Private (Dealer)
export const getLedgerStatement = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const query = {
      dealer: dealerId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const ledgerEntries = await DealerLedger.find(query)
      .sort({ date: 1, createdAt: 1 });

    // Calculate opening and closing balances
    const openingBalance = await DealerLedger.aggregate([
      {
        $match: {
          dealer: dealerId,
          date: { $lt: new Date(startDate) }
        }
      },
      {
        $group: {
          _id: null,
          balance: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', { $multiply: ['$amount', -1] }] } }
        }
      }
    ]);

    const closingBalance = await DealerLedger.aggregate([
      {
        $match: query
      },
      {
        $group: {
          _id: null,
          balance: { $sum: { $cond: [{ $eq: ['$type', 'Credit'] }, '$amount', { $multiply: ['$amount', -1] }] } }
        }
      }
    ]);

    res.json({
      success: true,
      statement: {
        openingBalance: openingBalance[0]?.balance || 0,
        closingBalance: (openingBalance[0]?.balance || 0) + (closingBalance[0]?.balance || 0),
        entries: ledgerEntries,
        period: {
          startDate,
          endDate
        }
      }
    });
  } catch (error) {
    console.error('Error getting ledger statement:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ledger statement',
      error: error.message
    });
  }
};

// @desc    Get outstanding amount
// @route   GET /api/app/ledger/outstanding
// @access  Private (Dealer)
export const getOutstandingAmount = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    const outstanding = await DealerLedger.aggregate([
      {
        $match: {
          dealer: dealerId,
          type: 'Debit'
        }
      },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$amount' }
        }
      }
    ]);

    const creditLimit = dealer?.creditLimit || 0;
    const availableBalance = creditLimit - (outstanding[0]?.totalOutstanding || 0);

    res.json({
      success: true,
      outstanding: {
        totalOutstanding: outstanding[0]?.totalOutstanding || 0,
        creditLimit,
        availableBalance: Math.max(0, availableBalance),
        creditDaysLeft: dealer?.creditDays || 0
      }
    });
  } catch (error) {
    console.error('Error getting outstanding amount:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching outstanding amount',
      error: error.message
    });
  }
};

// @desc    Get ageing buckets
// @route   GET /api/app/ledger/ageing
// @access  Private (Dealer)
export const getAgeingBuckets = async (req, res) => {
  try {
    // Get dealer by username (dealer code)
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    const now = new Date();

    const buckets = [
      { range: '0-30 Days', days: 30, amount: 0 },
      { range: '31-60 Days', days: 60, amount: 0 },
      { range: '61-90 Days', days: 90, amount: 0 },
      { range: '90+ Days', days: Infinity, amount: 0 }
    ];

    const ledgerEntries = await DealerLedger.find({
      dealer: dealerId,
      type: 'Debit'
    });

    for (const entry of ledgerEntries) {
      const daysDiff = Math.floor((now - entry.date) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 30) {
        buckets[0].amount += entry.amount;
      } else if (daysDiff <= 60) {
        buckets[1].amount += entry.amount;
      } else if (daysDiff <= 90) {
        buckets[2].amount += entry.amount;
      } else {
        buckets[3].amount += entry.amount;
      }
    }

    res.json({
      success: true,
      ageingBuckets: buckets,
      totalOutstanding: buckets.reduce((sum, bucket) => sum + bucket.amount, 0)
    });
  } catch (error) {
    console.error('Error getting ageing buckets:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ageing buckets',
      error: error.message
    });
  }
};

