import SalesOrder from '../../models/SalesOrder.js';
import DealerInvoice from '../../models/DealerInvoice.js';
import DealerLedger from '../../models/DealerLedger.js';
import Dealer from '../../models/Dealer.js';
import Points from '../../models/Points.js';

// @desc    Get dashboard stats
// @route   GET /api/app/dashboard/stats
// @access  Private (Dealer)
export const getDashboardStats = async (req, res) => {
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

    // Get outstanding amount
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
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalOutstanding = outstanding[0]?.total || 0;
    const creditLimit = dealer.creditLimit || 0;
    const availableBalance = Math.max(0, creditLimit - totalOutstanding);

    // Get recent orders count
    const recentOrdersCount = await SalesOrder.countDocuments({
      dealer: dealerId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // Get pending orders count
    const pendingOrdersCount = await SalesOrder.countDocuments({
      dealer: dealerId,
      status: 'Pending'
    });

    // Get points
    const points = await Points.aggregate([
      {
        $match: { dealer: dealerId }
      },
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$points' }
        }
      }
    ]);

    const totalPoints = points[0]?.totalPoints || 0;

    // Get ageing buckets
    const now = new Date();
    const buckets = [
      { range: '0-30 Days', days: 30, amount: 0, color: '#4CAF50' },
      { range: '31-60 Days', days: 60, amount: 0, color: '#FF9800' },
      { range: '61-90 Days', days: 90, amount: 0, color: '#FF5722' },
      { range: '90+ Days', days: Infinity, amount: 0, color: '#F44336' }
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
      stats: {
        dealer: {
          name: dealer.name,
          code: dealer.code
        },
        financial: {
          outstanding: totalOutstanding,
          creditLimit,
          availableBalance,
          creditDaysLeft: dealer.creditDays || 0
        },
        orders: {
          recent: recentOrdersCount,
          pending: pendingOrdersCount
        },
        points: {
          total: totalPoints
        },
        ageingBuckets: buckets
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
};

// @desc    Get recent orders
// @route   GET /api/app/dashboard/recent-orders
// @access  Private (Dealer)
export const getRecentOrders = async (req, res) => {
  try {
    const dealerId = req.user.dealerId || req.user.id;
    const { limit = 5 } = req.query;

    const orders = await SalesOrder.find({
      dealer: dealerId
    })
      .sort({ orderDate: -1 })
      .limit(parseInt(limit))
      .select('orderNumber orderDate status totalAmount');

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Error getting recent orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent orders',
      error: error.message
    });
  }
};

// @desc    Get recent invoices
// @route   GET /api/app/dashboard/recent-invoices
// @access  Private (Dealer)
export const getRecentInvoices = async (req, res) => {
  try {
    const dealerId = req.user.dealerId || req.user.id;
    const { limit = 5 } = req.query;

    const invoices = await DealerInvoice.find({
      dealer: dealerId
    })
      .sort({ invoiceDate: -1 })
      .limit(parseInt(limit))
      .select('invoiceNumber invoiceDate paymentStatus totalAmount outstandingAmount');

    res.json({
      success: true,
      invoices
    });
  } catch (error) {
    console.error('Error getting recent invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent invoices',
      error: error.message
    });
  }
};

// @desc    Get notifications
// @route   GET /api/app/dashboard/notifications
// @access  Private (Dealer)
export const getNotifications = async (req, res) => {
  try {
    const dealerId = req.user.dealerId || req.user.id;
    
    // Get pending orders
    const pendingOrders = await SalesOrder.countDocuments({
      dealer: dealerId,
      status: 'Pending'
    });

    // Get overdue invoices
    const now = new Date();
    const overdueInvoices = await DealerInvoice.countDocuments({
      dealer: dealerId,
      paymentStatus: { $ne: 'Paid' },
      dueDate: { $lt: now }
    });

    // Get low credit balance
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
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalOutstanding = outstanding[0]?.total || 0;
    const creditLimit = dealer?.creditLimit || 0;
    const availableBalance = creditLimit - totalOutstanding;
    const creditUtilization = creditLimit > 0 ? (totalOutstanding / creditLimit) * 100 : 0;

    const notifications = [];

    if (pendingOrders > 0) {
      notifications.push({
        type: 'order',
        title: 'Pending Orders',
        message: `You have ${pendingOrders} pending order(s)`,
        priority: 'medium'
      });
    }

    if (overdueInvoices > 0) {
      notifications.push({
        type: 'payment',
        title: 'Overdue Invoices',
        message: `You have ${overdueInvoices} overdue invoice(s)`,
        priority: 'high'
      });
    }

    if (creditUtilization > 80) {
      notifications.push({
        type: 'credit',
        title: 'Credit Limit Warning',
        message: `Your credit utilization is ${creditUtilization.toFixed(0)}%`,
        priority: 'high'
      });
    }

    if (availableBalance < creditLimit * 0.2) {
      notifications.push({
        type: 'credit',
        title: 'Low Available Balance',
        message: `Available balance is ₹${availableBalance.toFixed(2)}`,
        priority: 'medium'
      });
    }

    res.json({
      success: true,
      notifications,
      unreadCount: notifications.length
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

