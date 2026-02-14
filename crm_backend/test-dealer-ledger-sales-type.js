import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';
import SalesOrder from './models/SalesOrder.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('✅ Connected to MongoDB\n');
  
  try {
    console.log('='.repeat(80));
    console.log('DEALER LEDGER - CD SALES VS REGULAR SALES TEST');
    console.log('='.repeat(80));
    console.log();
    
    // 1. Check Dealers with Dual Credit Days
    console.log('📊 STEP 1: Checking Dealers with Dual Credit Days');
    console.log('-'.repeat(80));
    
    const dealers = await Dealer.find({
      $or: [
        { creditDaysRegular: { $exists: true, $ne: null } },
        { creditDaysCD: { $exists: true, $ne: null } }
      ]
    }).limit(5);
    
    console.log(`Found ${dealers.length} dealers with dual credit days configuration:\n`);
    
    dealers.forEach((dealer, index) => {
      console.log(`${index + 1}. ${dealer.code} - ${dealer.name}`);
      console.log(`   Regular Credit Days: ${dealer.creditDaysRegular || dealer.creditDays || 0} days`);
      console.log(`   CD Sales Credit Days: ${dealer.creditDaysCD || 0} days`);
      console.log();
    });
    
    // 2. Check Sales Orders with Sales Type
    console.log('📦 STEP 2: Checking Sales Orders with Sales Type');
    console.log('-'.repeat(80));
    
    const salesOrders = await SalesOrder.find({
      salesType: { $exists: true, $ne: null }
    })
    .populate('dealer', 'code name')
    .limit(10)
    .sort({ createdAt: -1 });
    
    console.log(`Found ${salesOrders.length} sales orders with sales type:\n`);
    
    const cdSalesCount = salesOrders.filter(so => so.salesType === 'CD Sales').length;
    const regularSalesCount = salesOrders.filter(so => so.salesType === 'Regular Sale').length;
    
    console.log(`   CD Sales: ${cdSalesCount}`);
    console.log(`   Regular Sales: ${regularSalesCount}\n`);
    
    salesOrders.slice(0, 5).forEach((order, index) => {
      console.log(`${index + 1}. ${order.orderNumber} - ${order.dealer?.name || 'N/A'}`);
      console.log(`   Sales Type: ${order.salesType}`);
      console.log(`   Credit Days Applied: ${order.creditDaysApplied || order.creditDays || 0} days`);
      console.log(`   Total Amount: ₹${order.totalAmount.toLocaleString('en-IN')}`);
      console.log();
    });
    
    // 3. Check Ledger Entries with Sales Type
    console.log('📋 STEP 3: Checking Ledger Entries with Sales Type');
    console.log('-'.repeat(80));
    
    const ledgerEntries = await DealerLedger.find({
      salesType: { $exists: true, $ne: null }
    })
    .populate('dealer', 'code name')
    .limit(10)
    .sort({ entryDate: -1 });
    
    console.log(`Found ${ledgerEntries.length} ledger entries with sales type:\n`);
    
    const cdLedgerCount = ledgerEntries.filter(le => le.salesType === 'CD Sales').length;
    const regularLedgerCount = ledgerEntries.filter(le => le.salesType === 'Regular Sale').length;
    
    console.log(`   CD Sales Entries: ${cdLedgerCount}`);
    console.log(`   Regular Sales Entries: ${regularLedgerCount}\n`);
    
    ledgerEntries.slice(0, 5).forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.invoiceNumber || 'N/A'} - ${entry.dealer?.name || entry.dealerName || 'N/A'}`);
      console.log(`   Sales Type: ${entry.salesType}`);
      console.log(`   Credit Days Applied: ${entry.creditDaysApplied || entry.creditDays || 0} days`);
      console.log(`   Invoice Value: ₹${entry.invoiceValue?.toLocaleString('en-IN') || '0'}`);
      console.log(`   Entry Date: ${new Date(entry.entryDate).toLocaleDateString('en-IN')}`);
      console.log();
    });
    
    // 4. Sample Dealer Ledger Analysis
    if (dealers.length > 0) {
      console.log('🔍 STEP 4: Sample Dealer Ledger Analysis');
      console.log('-'.repeat(80));
      
      const sampleDealer = dealers[0];
      console.log(`Analyzing ledger for: ${sampleDealer.code} - ${sampleDealer.name}\n`);
      
      const dealerLedger = await DealerLedger.find({ dealer: sampleDealer._id })
        .sort({ entryDate: -1 })
        .limit(10);
      
      console.log(`Total Ledger Entries: ${dealerLedger.length}\n`);
      
      const cdSalesEntries = dealerLedger.filter(e => e.salesType === 'CD Sales');
      const regularSalesEntries = dealerLedger.filter(e => e.salesType === 'Regular Sale');
      const noTypeEntries = dealerLedger.filter(e => !e.salesType);
      
      console.log(`Breakdown by Sales Type:`);
      console.log(`   CD Sales: ${cdSalesEntries.length} entries`);
      console.log(`   Regular Sales: ${regularSalesEntries.length} entries`);
      console.log(`   No Type (Legacy): ${noTypeEntries.length} entries\n`);
      
      if (cdSalesEntries.length > 0) {
        const cdTotal = cdSalesEntries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
        console.log(`   CD Sales Total: ₹${cdTotal.toLocaleString('en-IN')}`);
      }
      
      if (regularSalesEntries.length > 0) {
        const regularTotal = regularSalesEntries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
        console.log(`   Regular Sales Total: ₹${regularTotal.toLocaleString('en-IN')}`);
      }
      
      console.log();
      
      // Show recent entries
      console.log('Recent Ledger Entries:');
      dealerLedger.slice(0, 5).forEach((entry, index) => {
        const salesTypeBadge = entry.salesType 
          ? `[${entry.salesType}]` 
          : '[No Type]';
        console.log(`   ${index + 1}. ${entry.invoiceNumber || 'N/A'} ${salesTypeBadge}`);
        console.log(`      Date: ${new Date(entry.entryDate).toLocaleDateString('en-IN')}`);
        console.log(`      Credit Days: ${entry.creditDaysApplied || entry.creditDays || 0} days`);
        console.log(`      Amount: ₹${(entry.debitAmount || 0).toLocaleString('en-IN')}`);
      });
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log(`- Dealers with dual credit days: ${dealers.length}`);
    console.log(`- Sales orders with sales type: ${salesOrders.length}`);
    console.log(`- Ledger entries with sales type: ${ledgerEntries.length}`);
    console.log();
    
    if (ledgerEntries.length === 0) {
      console.log('⚠️  No ledger entries found with sales type.');
      console.log('   Run the sync script to populate sales type information:');
      console.log('   node scripts/syncDealerLedger.js');
    } else {
      console.log('✅ Sales type information is properly populated in the ledger!');
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}).catch(error => {
  console.error('❌ MongoDB connection error:', error);
});
