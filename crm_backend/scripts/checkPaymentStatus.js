import mongoose from 'mongoose';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

async function checkPaymentStatus() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    
    console.log('\n=== INVOICE PAYMENT STATUS ===');
    const invoices = await DealerInvoice.find({}).select('invoiceNumber dealerName totalAmount paymentStatus');
    invoices.forEach(inv => {
      console.log(`${inv.invoiceNumber} - ${inv.dealerName}: ₹${inv.totalAmount} - Status: ${inv.paymentStatus}`);
    });
    
    console.log('\n=== CREDIT NOTES ===');
    const creditNotes = await CreditNote.find({}).select('creditNoteNumber dealerName creditAmount');
    creditNotes.forEach(cn => {
      console.log(`${cn.creditNoteNumber} - ${cn.dealerName}: ₹${cn.creditAmount}`);
    });
    
    console.log('\n=== PAYMENT ANALYSIS ===');
    const dealers = await mongoose.model('Dealer').find({ isActive: true }).select('name code');
    
    for (const dealer of dealers) {
      const dealerInvoices = await DealerInvoice.find({ dealer: dealer._id });
      const dealerCreditNotes = await CreditNote.find({ dealer: dealer._id });
      
      const totalSales = dealerInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const totalCredits = dealerCreditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
      const netSales = totalSales - totalCredits;
      
      // Check actual payment status
      const paidInvoices = dealerInvoices.filter(inv => inv.paymentStatus === 'Paid');
      const paidAmount = paidInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      
      console.log(`\n${dealer.name} (${dealer.code}):`);
      console.log(`  Total Sales: ₹${totalSales.toLocaleString()}`);
      console.log(`  Total Credits: ₹${totalCredits.toLocaleString()}`);
      console.log(`  Net Sales: ₹${netSales.toLocaleString()}`);
      console.log(`  Paid Amount: ₹${paidAmount.toLocaleString()}`);
      console.log(`  Outstanding: ₹${(netSales - paidAmount).toLocaleString()}`);
      console.log(`  Paid Invoices: ${paidInvoices.length}/${dealerInvoices.length}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPaymentStatus();






