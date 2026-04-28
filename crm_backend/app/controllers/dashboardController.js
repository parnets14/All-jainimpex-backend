import { salesOrderSchema }   from '../../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../../models/DealerInvoice.js';
import { dealerLedgerSchema }  from '../../models/DealerLedger.js';
import { dealerSchema }        from '../../models/Dealer.js';
import { notificationSchema }  from '../../models/Notification.js';

const getModels = (db) => ({
  SalesOrder:    db.models.SalesOrder    || db.model('SalesOrder',    salesOrderSchema),
  DealerInvoice: db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema),
  DealerLedger:  db.models.DealerLedger  || db.model('DealerLedger',  dealerLedgerSchema),
  Dealer:        db.models.Dealer        || db.model('Dealer',        dealerSchema),
  Notification:  db.models.Notification  || db.model('Notification',  notificationSchema),
});

// @desc    Get dashboard stats
// @route   GET /api/app/dashboard/stats
export const getDashboardStats = async (req, res) => {
  try {
    const { SalesOrder, DealerInvoice, DealerLedger, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });
    const dealerId = dealer._id;

    const totals = await DealerLedger.aggregate([
      { $match: { dealer: dealerId } },
      { $group: { _id: null, totalDebit: { $sum: '$debitAmount' }, totalCredit: { $sum: '$creditAmount' } } }
    ]);

    const totalDebit       = totals[0]?.totalDebit  || 0;
    const totalCredit      = totals[0]?.totalCredit || 0;
    const totalOutstanding = Math.max(0, totalDebit - totalCredit);
    const creditLimit      = dealer.creditLimit || 0;
    const availableBalance = Math.max(0, creditLimit - totalOutstanding);

    const [recentOrdersCount, pendingOrdersCount, totalOrdersCount] = await Promise.all([
      SalesOrder.countDocuments({ dealer: dealerId, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      SalesOrder.countDocuments({ dealer: dealerId, status: 'Pending' }),
      SalesOrder.countDocuments({ dealer: dealerId }),
    ]);

    const pointsAgg = await DealerInvoice.aggregate([
      { $match: { dealer: dealerId, totalPoints: { $gt: 0 } } },
      { $group: { _id: null, totalPoints: { $sum: '$totalPoints' } } }
    ]);
    const totalPoints = pointsAgg[0]?.totalPoints || 0;

    res.json({
      success: true,
      stats: {
        financial: { outstanding: totalOutstanding, creditLimit, availableBalance },
        ageingBuckets: [],
        points: { total: totalPoints },
        orders: { recent: recentOrdersCount, pending: pendingOrdersCount, total: totalOrdersCount },
      },
    });
  } catch (error) {
    console.error('getDashboardStats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recent orders
// @route   GET /api/app/dashboard/recent-orders
export const getRecentOrders = async (req, res) => {
  try {
    const { SalesOrder, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const limit = parseInt(req.query.limit) || 5;
    const orders = await SalesOrder.find({ dealer: dealer._id })
      .sort({ orderDate: -1 })
      .limit(limit)
      .select('orderNumber orderDate status totalAmount')
      .lean();

    res.json({ success: true, orders });
  } catch (error) {
    console.error('getRecentOrders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get recent invoices
// @route   GET /api/app/dashboard/recent-invoices
export const getRecentInvoices = async (req, res) => {
  try {
    const { DealerInvoice, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const limit = parseInt(req.query.limit) || 5;
    const invoices = await DealerInvoice.find({ dealer: dealer._id })
      .sort({ invoiceDate: -1 })
      .limit(limit)
      .select('invoiceNumber invoiceDate totalAmount paymentStatus')
      .lean();

    res.json({ success: true, invoices });
  } catch (error) {
    console.error('getRecentInvoices error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get notifications
// @route   GET /api/app/dashboard/notifications
export const getNotifications = async (req, res) => {
  try {
    const { Notification, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { limit = 50, unreadOnly = false } = req.query;
    const query = { dealer: dealer._id };
    if (unreadOnly === 'true') query.read = false;

    const [dbNotifications, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).limit(parseInt(limit)).lean(),
      Notification.countDocuments({ dealer: dealer._id, read: false }),
    ]);

    const notifications = dbNotifications.map(n => ({
      id: n._id.toString(), type: n.type, title: n.title, message: n.message,
      orderId: n.orderId?.toString() || null, orderNumber: n.orderNumber,
      status: n.status, priority: n.priority, read: n.read,
      timestamp: n.createdAt, createdAt: n.createdAt,
      metadata: n.metadata || {},
    }));

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/app/dashboard/notifications/:id/read
export const markNotificationAsRead = async (req, res) => {
  try {
    const { Notification, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const notification = await Notification.findOne({ _id: req.params.id, dealer: dealer._id });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    notification.read = true;
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read', notification: { id: notification._id.toString(), read: true } });
  } catch (error) {
    console.error('markNotificationAsRead error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/app/dashboard/notifications/read-all
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const { Notification, Dealer } = getModels(req.dbConnection);

    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const result = await Notification.updateMany({ dealer: dealer._id, read: false }, { read: true });

    res.json({ success: true, message: 'All notifications marked as read', updatedCount: result.modifiedCount });
  } catch (error) {
    console.error('markAllNotificationsAsRead error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send test push notification (dev only)
// @route   POST /api/app/dashboard/test-notification
export const sendTestNotification = async (req, res) => {
  try {
    const { Dealer } = getModels(req.dbConnection);
    const dealer = await Dealer.findOne({ code: req.user.username });
    if (!dealer) return res.status(404).json({ success: false, message: 'Dealer not found' });

    const { fcmToken } = req.body;
    const tokenToUse = fcmToken || dealer.fcmToken;

    if (!tokenToUse) {
      return res.status(400).json({
        success: false,
        message: 'No FCM token available. Provide fcmToken in body or rebuild app with Firebase.',
        dealerFcmToken: dealer.fcmToken || null,
      });
    }

    const { sendPushNotification } = await import('../../services/firebaseNotificationService.js');
    const result = await sendPushNotification({
      token: tokenToUse,
      title: 'Test Notification',
      body: `Hello ${dealer.name}! Push notifications are working.`,
      data: { type: 'system', test: 'true' },
    });

    res.json({ success: true, result, tokenUsed: tokenToUse.substring(0, 20) + '...' });
  } catch (error) {
    console.error('sendTestNotification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
