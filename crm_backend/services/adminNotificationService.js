/**
 * Admin Notification Service
 * Writes notifications to Firebase RTDB for real-time web CRM alerts.
 * Web frontend listens to /notifications/{company}/ for instant updates.
 */
import admin from 'firebase-admin';

// Get the Firebase RTDB instance (already initialized in firebaseNotificationService.js)
const getDb = () => {
  try {
    const app = admin.app();
    return app.database('https://jain-impex-default-rtdb.asia-southeast1.firebasedatabase.app');
  } catch (e) {
    console.warn('⚠️ Firebase not initialized for admin notifications:', e.message);
    return null;
  }
};

/**
 * Send a notification to the web admin CRM via Firebase RTDB
 * @param {string} company - Company slug (jain-impex, ridhi, shree-jain-impex)
 * @param {object} notification - { type, title, message, data, priority }
 */
export const sendAdminNotification = async (company, { type, title, message, data = {}, priority = 'normal' }) => {
  const db = getDb();
  if (!db) return null;

  try {
    const notifRef = db.ref(`/notifications/${company}`).push();
    const notification = {
      id: notifRef.key,
      type,
      title,
      message,
      data,
      priority, // 'high', 'normal', 'low'
      read: false,
      createdAt: Date.now(),
    };

    await notifRef.set(notification);
    console.log(`🔔 Admin notification [${type}]: ${title}`);
    return notification;
  } catch (error) {
    console.error('❌ Failed to send admin notification:', error.message);
    return null;
  }
};

// ─── Convenience methods for common notification types ───────────

export const notifyNewOrderRequest = (company, { dealerName, orderNumber, amount }) => {
  return sendAdminNotification(company, {
    type: 'order_request',
    title: '🛒 New Order Request',
    message: `${dealerName} placed order request #${orderNumber} — ₹${amount?.toLocaleString() || '0'}`,
    data: { orderNumber, dealerName, amount },
    priority: 'high',
  });
};

export const notifyNewSalesOrder = (company, { salesExecutive, dealerName, orderNumber, amount }) => {
  return sendAdminNotification(company, {
    type: 'sales_order',
    title: '📋 New Sales Order',
    message: `${salesExecutive} placed order #${orderNumber} for ${dealerName} — ₹${amount?.toLocaleString() || '0'}`,
    data: { orderNumber, dealerName, salesExecutive, amount },
    priority: 'normal',
  });
};

export const notifyPaymentCollected = (company, { salesExecutive, dealerName, amount, mode }) => {
  return sendAdminNotification(company, {
    type: 'payment',
    title: '💰 Payment Collected',
    message: `₹${amount?.toLocaleString() || '0'} collected from ${dealerName} by ${salesExecutive} (${mode || 'cash'})`,
    data: { dealerName, salesExecutive, amount, mode },
    priority: 'normal',
  });
};

export const notifyDeliveryCompleted = (company, { executiveName, orderNumber, dealerName }) => {
  return sendAdminNotification(company, {
    type: 'delivery_completed',
    title: '✅ Delivery Completed',
    message: `Order #${orderNumber} delivered to ${dealerName} by ${executiveName} — awaiting confirmation`,
    data: { orderNumber, dealerName, executiveName },
    priority: 'high',
  });
};

export const notifyDeliveryFailed = (company, { executiveName, orderNumber, dealerName, reason }) => {
  return sendAdminNotification(company, {
    type: 'delivery_failed',
    title: '❌ Delivery Failed',
    message: `Order #${orderNumber} to ${dealerName} failed — ${reason}`,
    data: { orderNumber, dealerName, executiveName, reason },
    priority: 'high',
  });
};

export const notifyDeliveryRescheduled = (company, { executiveName, orderNumber, dealerName, newDate, reason }) => {
  return sendAdminNotification(company, {
    type: 'delivery_rescheduled',
    title: '🔄 Delivery Rescheduled',
    message: `Order #${orderNumber} to ${dealerName} rescheduled to ${newDate} — ${reason}`,
    data: { orderNumber, dealerName, executiveName, newDate, reason },
    priority: 'normal',
  });
};

export const notifyNewDealerRegistered = (company, { dealerName, phone }) => {
  return sendAdminNotification(company, {
    type: 'new_dealer',
    title: '👤 New Dealer Registered',
    message: `${dealerName} (${phone}) registered on the Dealer App`,
    data: { dealerName, phone },
    priority: 'low',
  });
};

export const notifyExpenseSubmitted = (company, { salesExecutive, amount, category }) => {
  return sendAdminNotification(company, {
    type: 'expense',
    title: '🧾 Expense Submitted',
    message: `${salesExecutive} submitted ₹${amount?.toLocaleString() || '0'} expense (${category})`,
    data: { salesExecutive, amount, category },
    priority: 'low',
  });
};

export default {
  sendAdminNotification,
  notifyNewOrderRequest,
  notifyNewSalesOrder,
  notifyPaymentCollected,
  notifyDeliveryCompleted,
  notifyDeliveryFailed,
  notifyDeliveryRescheduled,
  notifyNewDealerRegistered,
  notifyExpenseSubmitted,
};
