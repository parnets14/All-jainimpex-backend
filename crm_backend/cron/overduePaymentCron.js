/**
 * Overdue Payment Reminder Cron
 * Runs daily at 9:00 AM — sends push notification to dealers with overdue invoices
 */
import cron from 'node-cron';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerInvoiceSchema }  from '../models/DealerInvoice.js';
import { dealerSchema }         from '../models/Dealer.js';
import { notificationSchema }   from '../models/Notification.js';
import { sendPushNotification } from '../services/firebaseNotificationService.js';

const COMPANIES = ['jain-impex', 'ridhi', 'shree-jain-impex'];

const runOverdueCheck = async () => {
  console.log('⏰ Running overdue payment reminder cron...');
  const now = new Date();

  for (const company of COMPANIES) {
    try {
      const db = getCompanyConnection(company);
      if (!db) continue;

      const DealerInvoice = db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema);
      const Dealer        = db.models.Dealer        || db.model('Dealer',        dealerSchema);
      const Notification  = db.models.Notification  || db.model('Notification',  notificationSchema);

      // Find all overdue unpaid/partial invoices
      const overdueInvoices = await DealerInvoice.find({
        isDeleted: false,
        isDraft: false,
        paymentStatus: { $in: ['Pending', 'Partial', 'Overdue'] },
        dueDate: { $lt: now },
      }).lean();

      if (overdueInvoices.length === 0) continue;

      // Group by dealer
      const byDealer = {};
      for (const inv of overdueInvoices) {
        const id = inv.dealer.toString();
        if (!byDealer[id]) byDealer[id] = [];
        byDealer[id].push(inv);
      }

      for (const [dealerId, invoices] of Object.entries(byDealer)) {
        try {
          const dealer = await Dealer.findById(dealerId).select('name fcmToken').lean();
          if (!dealer) continue;

          const totalOverdue = invoices.reduce((s, inv) => s + (inv.pendingAmount || inv.totalAmount || 0), 0);
          const invoiceCount = invoices.length;
          const oldestDue    = invoices.reduce((oldest, inv) => {
            return !oldest || new Date(inv.dueDate) < new Date(oldest.dueDate) ? inv : oldest;
          }, null);
          const daysOverdue  = oldestDue
            ? Math.floor((now - new Date(oldestDue.dueDate)) / (1000 * 60 * 60 * 24))
            : 0;

          const title   = 'Payment Overdue Reminder';
          const message = invoiceCount === 1
            ? `Invoice ${invoices[0].invoiceNumber} is overdue by ${daysOverdue} day(s). Amount due: Rs. ${totalOverdue.toLocaleString('en-IN')}. Please make payment to avoid further delays.`
            : `You have ${invoiceCount} overdue invoice(s) totalling Rs. ${totalOverdue.toLocaleString('en-IN')}. Oldest is ${daysOverdue} day(s) overdue. Please clear your dues.`;

          // Save DB notification
          await Notification.create({
            dealer: dealerId,
            type: 'payment_reminder',
            title,
            message,
            priority: daysOverdue > 30 ? 'high' : 'medium',
            metadata: {
              overdueCount: invoiceCount,
              totalOverdue,
              daysOverdue,
              invoiceNumbers: invoices.map(i => i.invoiceNumber),
            },
          });

          // Send push
          if (dealer.fcmToken) {
            await sendPushNotification({
              token: dealer.fcmToken,
              title,
              body: message,
              data: { type: 'payment_reminder', overdueCount: String(invoiceCount) },
            });
          }

          console.log(`📱 Overdue reminder sent to ${dealer.name} (${company}) — ${invoiceCount} invoice(s), Rs. ${totalOverdue}`);
        } catch (dealerErr) {
          console.error(`Error processing dealer ${dealerId}:`, dealerErr.message);
        }
      }
    } catch (companyErr) {
      console.error(`Error processing company ${company}:`, companyErr.message);
    }
  }

  console.log('✅ Overdue payment cron completed');
};

// Schedule: every day at 9:00 AM
export const startOverduePaymentCron = () => {
  cron.schedule('0 9 * * *', runOverdueCheck, { timezone: 'Asia/Kolkata' });
  console.log('⏰ Overdue payment reminder cron scheduled (daily 9:00 AM IST)');
};

export default startOverduePaymentCron;
