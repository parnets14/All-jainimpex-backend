import DealerInvoice from '../../models/DealerInvoice.js';
import Dealer from '../../models/Dealer.js';

// @desc    Get dealer's points summary
// @route   GET /api/app/points/summary
// @access  Private (Dealer)
export const getPointsSummary = async (req, res) => {
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

    // Get total points from all invoices
    const pointsAggregation = await DealerInvoice.aggregate([
      {
        $match: {
          dealer: dealerId,
          totalPoints: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$totalPoints' }
        }
      }
    ]);
    const totalPoints = pointsAggregation[0]?.totalPoints || 0;

    // Get points earned this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthlyPointsAggregation = await DealerInvoice.aggregate([
      {
        $match: {
          dealer: dealerId,
          totalPoints: { $gt: 0 },
          invoiceDate: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$totalPoints' }
        }
      }
    ]);
    const monthlyPoints = monthlyPointsAggregation[0]?.totalPoints || 0;

    res.json({
      success: true,
      summary: {
        totalPoints,
        monthlyPoints,
        lifetimePoints: totalPoints
      }
    });
  } catch (error) {
    console.error('Error getting points summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching points summary',
      error: error.message
    });
  }
};

// @desc    Get dealer's points history
// @route   GET /api/app/points/history
// @access  Private (Dealer)
export const getPointsHistory = async (req, res) => {
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

    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = {
      dealer: dealerId,
      totalPoints: { $gt: 0 }
    };

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    // Get invoices with points
    const invoices = await DealerInvoice.find(query)
      .select('invoiceNumber invoiceDate totalPoints totalAmount salesOrderNumber')
      .populate('salesOrder', 'orderNumber')
      .sort({ invoiceDate: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await DealerInvoice.countDocuments(query);

    // Format response
    const pointsHistory = invoices.map(invoice => ({
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      pointsEarned: invoice.totalPoints,
      invoiceAmount: invoice.totalAmount,
      salesOrderNumber: invoice.salesOrder?.orderNumber || invoice.salesOrderNumber || null
    }));

    res.json({
      success: true,
      pointsHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: skip + invoices.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error getting points history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching points history',
      error: error.message
    });
  }
};

