/**
 * Admin Notification Service
 * Writes notifications to Firebase RTDB at /notifications/{company}
 * These are read by the CRM web NotificationBell component in real-time.
 * 
 * Notification types:
 *   order_request    - New dealer order from app
 *   sales_order      - Credit limit exceeded / needs approval
 *   leave_request    - Employee leave application
 *   payment          - New SE collection received
 *   new_dealer       - New dealer registered
 *   expense          - New expense claim submitted
 *   delivery_completed - Delivery completed
 *   delivery_failed    - Delivery failed
 *   no_punch          - Employee didn't punch in
 *   system            - General system notifications
 */
import admin from 'firebase-admin';

const ALL_COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];

/**
 * Send a notification to the admin panel (visible in the bell icon).
 * Writes to all company paths so any admin on any company sees it.
 * 
 * @param {object} opts
 * @param {string} opts.type - Notification type (matches NOTIFICATION_ROUTES in frontend)
 * @param {string} opts.title - Short title
 * @param {string} opts.message - Descriptive message
 * @param {string} [opts.priority='medium'] - low | medium | high
 * @param {string} [opts.company] - If set, only write to this company. Otherwise all.
 * @param {object} [opts.data] - Extra metadata (orderId, employeeName, etc.)
 */
export const sendAdminNotification = async ({ type, title, message, priority = 'medium', company = null, data = {} }) => {
  try {
    if (!admin.apps.length) {
      console.warn('⚠️ Firebase not initialized — admin notification skipped');
      return;
    }

    const db = admin.database();
    const notif = {
      type,
      title,
      message,
      priority,
      read: false,
      createdAt: Date.now(),
      ...data,
    };

    const companies = company ? [company] : ALL_COMPANIES;
    for (const c of companies) {
      try {
        await db.ref(`/notifications/${c}`).push(notif);
      } catch (e) { /* silent */ }
    }
  } catch (e) {
    console.error('adminNotification error:', e.message);
  }
};

// Convenience helpers for common notification types
export const notifyNewDealerOrder = (dealerName, orderNumber, company) =>
  sendAdminNotification({
    type: 'order_request',
    title: 'New Dealer Order',
    message: `${dealerName} placed order ${orderNumber} from the app`,
    priority: 'high',
    company,
    data: { dealerName, orderNumber },
  });

export const notifyCreditLimitExceeded = (dealerName, orderNumber, amount, company) =>
  sendAdminNotification({
    type: 'sales_order',
    title: 'Credit Limit Exceeded',
    message: `Order ${orderNumber} for ${dealerName} exceeds credit limit by ₹${Math.round(amount).toLocaleString()}. Approval required.`,
    priority: 'high',
    company,
    data: { dealerName, orderNumber, amount },
  });

export const notifyLeaveRequest = (employeeName, leaveType, startDate, endDate, company) =>
  sendAdminNotification({
    type: 'leave_request',
    title: 'Leave Application',
    message: `${employeeName} applied for ${leaveType} (${startDate} to ${endDate})`,
    priority: 'medium',
    company,
    data: { employeeName, leaveType },
  });

export const notifyNewCollection = (seName, amount, dealerName, company) =>
  sendAdminNotification({
    type: 'payment',
    title: 'Collection Received',
    message: `${seName} collected ₹${Math.round(amount).toLocaleString()} from ${dealerName}`,
    priority: 'medium',
    company,
    data: { seName, amount, dealerName },
  });

// Alias for backward compatibility
export const notifyPaymentCollected = (company, { salesExecutive, dealerName, amount, mode }) =>
  sendAdminNotification({
    type: 'payment',
    title: 'Payment Collected',
    message: `${salesExecutive} collected ₹${Math.round(amount).toLocaleString()} from ${dealerName} (${mode})`,
    priority: 'medium',
    company,
    data: { salesExecutive, dealerName, amount, mode },
  });

export const notifyNoPunchIn = (employeeName, company) =>
  sendAdminNotification({
    type: 'no_punch',
    title: 'No Punch-In Alert',
    message: `${employeeName} has not punched in today`,
    priority: 'high',
    company,
    data: { employeeName },
  });

export const notifyNewExpenseClaim = (employeeName, amount, company) =>
  sendAdminNotification({
    type: 'expense',
    title: 'New Expense Claim',
    message: `${employeeName} submitted expense claim of ₹${Math.round(amount).toLocaleString()}`,
    priority: 'medium',
    company,
    data: { employeeName, amount },
  });

export const notifyDeliveryCompleted = (executiveName, dealerName, company) =>
  sendAdminNotification({
    type: 'delivery_completed',
    title: 'Delivery Completed',
    message: `${executiveName} delivered to ${dealerName}`,
    priority: 'low',
    company,
    data: { executiveName, dealerName },
  });

export const notifyDeliveryFailed = (executiveName, dealerName, reason, company) =>
  sendAdminNotification({
    type: 'delivery_failed',
    title: 'Delivery Failed',
    message: `${executiveName} failed delivery to ${dealerName}${reason ? ': ' + reason : ''}`,
    priority: 'high',
    company,
    data: { executiveName, dealerName, reason },
  });

export const notifyDeliveryRescheduled = (executiveName, dealerName, newDate, company) =>
  sendAdminNotification({
    type: 'delivery_rescheduled',
    title: 'Delivery Rescheduled',
    message: `${executiveName} rescheduled delivery to ${dealerName}${newDate ? ' for ' + newDate : ''}`,
    priority: 'medium',
    company,
    data: { executiveName, dealerName, newDate },
  });

export const notifyNewSEOrder = (seName, dealerName, orderNumber, company) =>
  sendAdminNotification({
    type: 'sales_order',
    title: 'New SE Order',
    message: `${seName} placed order ${orderNumber} for ${dealerName}`,
    priority: 'medium',
    company,
    data: { seName, dealerName, orderNumber },
  });

export default sendAdminNotification;
