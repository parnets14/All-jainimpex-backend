import { getModels } from '../utils/getModels.js';

// ── GET /api/se/notifications ─────────────────────────────────────────────────
export const getMyNotifications = async (req, res) => {
  try {
    const { SENotification } = getModels(req);
    const { page = 1, limit = 20, unreadOnly } = req.query;

    const query = { user: req.user._id };
    if (unreadOnly === 'true') query.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      SENotification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      SENotification.countDocuments(query),
      SENotification.countDocuments({ user: req.user._id, isRead: false }),
    ]);

    res.json({ success: true, notifications, total, unreadCount, page: Number(page) });
  } catch (err) {
    console.error('getMyNotifications error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/se/notifications/unread-count ────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    const { SENotification } = getModels(req);
    const count = await SENotification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/se/notifications/:id/read ───────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const { SENotification } = getModels(req);
    await SENotification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/se/notifications/mark-all-read ───────────────────────────────────
export const markAllRead = async (req, res) => {
  try {
    const { SENotification } = getModels(req);
    await SENotification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /api/se/notifications/:id ─────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  try {
    const { SENotification } = getModels(req);
    await SENotification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/se/notifications/register-token ─────────────────────────────────
// SE app calls this on login to save FCM token against the user
export const registerFcmToken = async (req, res) => {
  try {
    const { User } = getModels(req);
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'fcmToken required' });

    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    console.log(`✅ FCM token registered for SE: ${req.user.name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helper: create notification + send push (used by other controllers) ───────
export const createSENotification = async ({ req, userId, type, title, message, data = {}, priority = 'medium' }) => {
  try {
    const { SENotification, User } = getModels(req);

    // 1. Save to DB
    const notif = await SENotification.create({ user: userId, type, title, message, data, priority });

    // 2. Send push if user has FCM token
    const user = await User.findById(userId).select('fcmToken').lean();
    if (user?.fcmToken) {
      const { sendPushNotification } = await import('../../services/firebaseNotificationService.js');
      const result = await sendPushNotification({
        token: user.fcmToken,
        title,
        body: message,
        data: { type, notificationId: notif._id.toString(), ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
      });
      // Clear invalid token
      if (!result.success && result.reason === 'invalid_token') {
        await User.findByIdAndUpdate(userId, { fcmToken: null });
      }
    }

    return notif;
  } catch (err) {
    console.error('createSENotification error:', err.message);
    return null;
  }
};

// ── POST /api/se/notifications/test ──────────────────────────────────────────
// Sends a test notification to the currently logged-in SE user.
// Useful for verifying FCM token, push delivery, and in-app display.
// Body: { title?, message?, type? }  — all optional, defaults provided.
export const sendTestNotification = async (req, res) => {
  try {
    const { SENotification, User } = getModels(req);
    const {
      title   = '🔔 Test Notification',
      message = 'This is a test notification from Jain Impex. Push & in-app are working!',
      type    = 'general',
    } = req.body;

    // 1. Save to DB
    const notif = await SENotification.create({
      user:     req.user._id,
      type,
      title,
      message,
      data:     { test: 'true' },
      priority: 'high',
    });

    // 2. Try push
    const user = await User.findById(req.user._id).select('fcmToken name').lean();
    let pushResult = { success: false, reason: 'no_token' };

    if (user?.fcmToken) {
      const { sendPushNotification } = await import('../../services/firebaseNotificationService.js');
      pushResult = await sendPushNotification({
        token: user.fcmToken,
        title,
        body:  message,
        data:  { type, notificationId: notif._id.toString(), test: 'true' },
      });
      if (!pushResult.success && pushResult.reason === 'invalid_token') {
        await User.findByIdAndUpdate(req.user._id, { fcmToken: null });
      }
    }

    console.log(`🔔 Test notification sent to ${user?.name}:`, pushResult);

    res.json({
      success: true,
      message: 'Test notification sent',
      notificationId: notif._id,
      push: pushResult,
      fcmToken: user?.fcmToken ? `${user.fcmToken.substring(0, 20)}...` : null,
    });
  } catch (err) {
    console.error('sendTestNotification error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
