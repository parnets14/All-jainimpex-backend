import mongoose from 'mongoose';
import Dealer from './models/Dealer.js';
import DealerInvoice from './models/DealerInvoice.js';
import CreditNote from './models/CreditNote.js';
import DealerPerformance from './models/DealerPerformance.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

async function debugDealerPerformanceGeneration() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check dealers
    console.log('\n👥 Checking dealers...');
    const dealers = await Dealer.find({ isActive: true });
    console.log(`Found ${dealers.length} active dealers:`);
    dealers.forEach((dealer, index) => {
      console.log(`${index + 1}. ${dealer.name} (${dealer.code}) - Type: ${dealer.dealerType}`);
    });

    if (dealers.length === 0) {
      console.log('❌ No active dealers found. This explains why no performance records were generated.');
      
      // Check if there are any dealers at all
      const allDealers = await Dealer.find({});
      console.log(`Total dealers in system: ${allDealers.length}`);
      
      if (allDealers.length > 0) {
        console.log('Inactive dealers:');
        allDealers.forEach((dealer, index) => {
          console.log(`${index + 1}. ${dealer.name} (${dealer.code}) - Active: ${dealer.isActive}`);
        });
      }
      
      return;
    }

    // Check dealer invoices
    console.log('\n📄 Checking dealer invoices...');
    const invoices = await DealerInvoice.find({});
    console.log(`Found ${invoices.length} total invoices`);

    if (invoices.length > 0) {
      console.log('Sample invoices:');
      invoices.slice(0, 3).forEach((invoice, index) => {
        console.log(`${index + 1}. Invoice ${invoice.invoiceNumber} - Dealer: ${invoice.dealer} - Amount: ₹${invoice.totalAmount} - Date: ${invoice.invoiceDate}`);
      });

      // Check invoices for current month
      const currentMonth = new Date();
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);

      const currentMonthInvoices = await DealerInvoice.find({
        invoiceDate: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      console.log(`\nCurrent month invoices (${startOfMonth.toDateString()} to ${endOfMonth.toDateString()}): ${currentMonthInvoices.length}`);
      
      if (currentMonthInvoices.length > 0) {
        console.log('Current month invoices:');
        currentMonthInvoices.forEach((invoice, index) => {
          console.log(`${index + 1}. ${invoice.invoiceNumber} - Amount: ₹${invoice.totalAmount} - Date: ${invoice.invoiceDate}`);
        });
      }
    }

    // Check credit notes
    console.log('\n💳 Checking credit notes...');
    const creditNotes = await CreditNote.find({});
    console.log(`Found ${creditNotes.length} total credit notes`);

    if (creditNotes.length > 0) {
      console.log('Sample credit notes:');
      creditNotes.slice(0, 3).forEach((cn, index) => {
        console.log(`${index + 1}. ${cn.creditNoteNumber} - Dealer: ${cn.dealer} - Amount: ₹${cn.creditAmount} - Date: ${cn.creditNoteDate}`);
      });
    }

    // Check existing performance records
    console.log('\n📊 Checking existing performance records...');
    const performanceRecords = await DealerPerformance.find({});
    console.log(`Found ${performanceRecords.length} existing performance records`);

    if (performanceRecords.length > 0) {
      console.log('Existing performance records:');
      performanceRecords.forEach((record, index) => {
        console.log(`${index + 1}. ${record.dealerName} - Sales: ₹${record.sales} - Period: ${record.period} - Date: ${record.performanceDate}`);
      });
    }

    // Test the date range logic
    console.log('\n📅 Testing date range logic...');
    const testFromDate = '2025-01-01';
    const testToDate = '2025-01-21';
    
    console.log(`Test date range: ${testFromDate} to ${testToDate}`);
    
    const testInvoices = await DealerInvoice.find({
      invoiceDate: {
        $gte: new Date(testFromDate),
        $lte: new Date(testToDate)
      }
    });
    
    console.log(`Invoices in test date range: ${testInvoices.length}`);

    // Check if dealers have invoices
    console.log('\n🔍 Checking dealer-invoice relationships...');
    for (const dealer of dealers.slice(0, 3)) { // Check first 3 dealers
      const dealerInvoices = await DealerInvoice.find({ dealer: dealer._id });
      console.log(`${dealer.name}: ${dealerInvoices.length} invoices`);
      
      if (dealerInvoices.length > 0) {
        const totalAmount = dealerInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        console.log(`  - Total amount: ₹${totalAmount}`);
        console.log(`  - Date range: ${dealerInvoices[0].invoiceDate} to ${dealerInvoices[dealerInvoices.length - 1].invoiceDate}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugDealerPerformanceGeneration();