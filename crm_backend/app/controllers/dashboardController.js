import SalesOrder from '../../models/SalesOrder.js';
import DealerInvoice from '../../models/DealerInvoice.js';
import DealerLedger from '../../models/DealerLedger.js';
import Dealer from '../../models/Dealer.js';
import Points from '../../models/Points.js';
import Notification from '../../models/Notification.js';

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

    // Get total orders count
    const totalOrdersCount = await SalesOrder.countDocuments({
      dealer: dealerId
    });

    // Get ageing buckets (simplified for now)
    const ageingBuckets = [];

    // Get points
    const pointsData = await Points.findOne({ dealer: dealerId });
    const totalPoints = pointsData?.totalPoints || 0;

    res.json({
      success: true,
      stats: {
        financial: {
          outstanding: totalOutstanding,
          creditLimit: creditLimit,
          availableBalance: availableBalance
        },
        ageingBuckets: ageingBuckets,
        points: {
          total: totalPoints
        },
        orders: {
          recent: recentOrdersCount,
          pending: pendingOrdersCount,
          total: totalOrdersCount
        }
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
    // Get dealer by username (dealer code) - consistent with other app controllers
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    
    const limit = parseInt(req.query.limit) || 5;

    const orders = await SalesOrder.find({ dealer: dealerId })
      .sort({ orderDate: -1 })
      .limit(limit)
      .select('orderNumber orderDate status totalAmount')
      .lean();

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
    // Get dealer by username (dealer code) - consistent with other app controllers
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    
    const limit = parseInt(req.query.limit) || 5;

    const invoices = await DealerInvoice.find({ dealer: dealerId })
      .sort({ invoiceDate: -1 })
      .limit(limit)
      .select('invoiceNumber invoiceDate totalAmount paymentStatus')
      .lean();

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
    console.log('📬 Getting notifications for user:', req.user.username);
    
    // Get dealer by username (dealer code) - consistent with other app controllers
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      console.error('❌ Dealer not found for code:', req.user.username);
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    console.log('✅ Dealer found:', dealer.name, 'ID:', dealerId);
    
    const { limit = 50, unreadOnly = false } = req.query;
    
    // Build query
    const query = { dealer: dealerId };
    if (unreadOnly === 'true') {
      query.read = false;
    }

    console.log('🔍 Querying notifications with:', query);
    
    // Fetch notifications from database
    const dbNotifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    console.log(`✅ Found ${dbNotifications.length} notifications`);

    // Format notifications for response
    const notifications = dbNotifications.map(notif => ({
      id: notif._id.toString(),
      type: notif.type,
      title: notif.title,
      message: notif.message,
      orderId: notif.orderId ? notif.orderId.toString() : null,
      orderNumber: notif.orderNumber,
      status: notif.status,
      priority: notif.priority,
      read: notif.read,
      timestamp: notif.createdAt,
      createdAt: notif.createdAt
    }));

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      dealer: dealerId,
      read: false
    });

    console.log(`✅ Unread count: ${unreadCount}`);

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error('❌ Error getting notifications:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/app/dashboard/notifications/:id/read
// @access  Private (Dealer)
export const markNotificationAsRead = async (req, res) => {
  try {
    // Get dealer by username (dealer code) - consistent with other app controllers
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;
    
    const { id } = req.params;

    const notification = await Notification.findOne({
      _id: id,
      dealer: dealerId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.read = true;
    await notification.save();

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: {
        id: notification._id.toString(),
        read: notification.read
      }
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/app/dashboard/notifications/read-all
// @access  Private (Dealer)
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    // Get dealer by username (dealer code) - consistent with other app controllers
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    const dealerId = dealer._id;

    const result = await Notification.updateMany(
      { dealer: dealerId, read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read',
      error: error.message
    });
  }
};
