import mongoose from 'mongoose';
import DealerPerformance from '../models/DealerPerformance.js';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

async function checkSalesCalculation() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    
    console.log('\n=== CURRENT DEALER PERFORMANCE DATA ===');
    const performanceData = await DealerPerformance.find({}).sort({ rank: 1 });
    
    performanceData.forEach(dealer => {
      console.log(`${dealer.rank}. ${dealer.dealerName} (${dealer.dealerCode})`);
      console.log(`   Sales: ₹${dealer.sales.toLocaleString()}`);
      console.log(`   Paid: ₹${dealer.paid.toLocaleString()}`);
      console.log(`   Outstanding: ₹${dealer.outstanding.toLocaleString()}`);
      console.log(`   Quantity: ${dealer.quantity}`);
      console.log('---');
    });
    
    console.log('\n=== ACTUAL INVOICE DATA ===');
    const invoices = await DealerInvoice.find({}).select('invoiceNumber dealerName totalAmount');
    invoices.forEach(inv => {
      console.log(`${inv.invoiceNumber} - ${inv.dealerName}: ₹${inv.totalAmount.toLocaleString()}`);
    });
    
    console.log('\n=== ACTUAL CREDIT NOTE DATA ===');
    const creditNotes = await CreditNote.find({}).select('creditNoteNumber dealerName creditAmount');
    creditNotes.forEach(cn => {
      console.log(`${cn.creditNoteNumber} - ${cn.dealerName}: ₹${cn.creditAmount.toLocaleString()}`);
    });
    
    console.log('\n=== SALES CALCULATION VERIFICATION ===');
    const dealers = await mongoose.model('Dealer').find({ isActive: true }).select('name code');
    
    for (const dealer of dealers) {
      const dealerInvoices = await DealerInvoice.find({ dealer: dealer._id });
      const dealerCreditNotes = await CreditNote.find({ dealer: dealer._id });
      
      const totalSales = dealerInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const totalCredits = dealerCreditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);
      const netSales = totalSales - totalCredits;
      
      console.log(`\n${dealer.name} (${dealer.code}):`);
      console.log(`  Total Invoice Amount: ₹${totalSales.toLocaleString()}`);
      console.log(`  Total Credit Amount: ₹${totalCredits.toLocaleString()}`);
      console.log(`  Net Sales (Invoice - Credit): ₹${netSales.toLocaleString()}`);
      console.log(`  Invoice Count: ${dealerInvoices.length}`);
      console.log(`  Credit Note Count: ${dealerCreditNotes.length}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSalesCalculation();




















