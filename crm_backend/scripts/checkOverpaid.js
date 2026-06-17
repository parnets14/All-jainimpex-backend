import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { dealerPaymentSchema } from '../models/DealerPayment.js';

dotenv.config();

const db = getCompanyConnection('jain-impex');
await db.asPromise();

const DealerInvoice = db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema);
const DealerPayment = db.models.DealerPayment || db.model('DealerPayment', dealerPaymentSchema);

const overpaid = await DealerInvoice.find({
  isDeleted: { $ne: true },
  $expr: { $gt: ['$paidAmount', { $add: ['$totalAmount', 0.01] }] },
}).select('invoiceNumber totalAmount paidAmount status paymentStatus').lean();

console.log('\n=== OVERPAID INVOICES IN jain-impex ===');
console.log('Count:', overpaid.length);
for (const inv of overpaid) {
  const excess = (inv.paidAmount - inv.totalAmount).toFixed(2);
  console.log('');
  console.log(`  ${inv.invoiceNumber}: total=${inv.totalAmount} paid=${inv.paidAmount} excess=${excess} status=${inv.status} payStatus=${inv.paymentStatus}`);

  const payments = await DealerPayment.find({
    'invoiceAllocations.invoiceId': inv._id,
    status: 'Approved'
  }).select('paymentNumber paymentAmount paymentDate invoiceAllocations').lean();

  let allocatedTotal = 0;
  for (const p of payments) {
    const alloc = p.invoiceAllocations?.find(a => String(a.invoiceId) === String(inv._id));
    const amt = alloc?.allocatedAmount || p.paymentAmount;
    allocatedTotal += amt;
    console.log(`    -> ${p.paymentNumber}: paymentAmt=${p.paymentAmount} allocated=${amt}`);
  }
  console.log(`  Sum of allocations: ${allocatedTotal.toFixed(2)}`);
}

process.exit(0);
