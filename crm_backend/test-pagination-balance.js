import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const testPaginationBalance = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a dealer with many entries
    const dealer = await Dealer.findOne({ name: /kiran/i });
    if (!dealer) {
      console.log('Dealer not found');
      return;
    }

    console.log(`\n=== Testing Pagination for: ${dealer.name} ===`);

    // Get all entries for this dealer
    const filter = {
      dealer: dealer._id,
      transactionType: { $in: ['Invoice', 'Payment', 'Advance Payment', 'Advance Adjustment'] }
    };

    const allEntries = await DealerLedger.find(filter)
      .sort({ entryDate: 1 });

    console.log(`\nTotal Entries: ${allEntries.length}`);

    // Test with different page sizes
    const pageSizes = [10, 20];
    
    for (const pageSize of pageSizes) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Testing with Page Size: ${pageSize}`);
      console.log('='.repeat(60));

      const totalPages = Math.ceil(allEntries.length / pageSize);
      console.log(`Total Pages: ${totalPages}`);

      let expectedOpeningBalance = 0;

      for (let page = 1; page <= Math.min(totalPages, 3); page++) {
        const skip = (page - 1) * pageSize;
        
        // Simulate backend calculation
        let calculatedOpeningBalance = 0;
        
        // Get entries from previous pages
        if (skip > 0) {
          const entriesBeforeCurrentPage = allEntries.slice(0, skip);
          entriesBeforeCurrentPage.forEach(entry => {
            calculatedOpeningBalance += (entry.debitAmount || 0);
            calculatedOpeningBalance -= (entry.creditAmount || 0);
          });
        }

        // Get entries for current page
        const pageEntries = allEntries.slice(skip, skip + pageSize);
        
        // Calculate closing balance for this page
        let closingBalance = calculatedOpeningBalance;
        pageEntries.forEach(entry => {
          closingBalance += (entry.debitAmount || 0);
          closingBalance -= (entry.creditAmount || 0);
        });

        console.log(`\nPage ${page}:`);
        console.log(`  Opening Balance: ₹${calculatedOpeningBalance.toFixed(2)}`);
        console.log(`  Entries: ${pageEntries.length}`);
        console.log(`  First Entry Date: ${pageEntries[0]?.entryDate.toLocaleDateString('en-IN')}`);
        console.log(`  Last Entry Date: ${pageEntries[pageEntries.length - 1]?.entryDate.toLocaleDateString('en-IN')}`);
        console.log(`  Closing Balance: ₹${closingBalance.toFixed(2)}`);

        // Verify continuity
        if (page > 1) {
          if (Math.abs(calculatedOpeningBalance - expectedOpeningBalance) > 0.01) {
            console.log(`  ⚠️  WARNING: Opening balance mismatch!`);
            console.log(`     Expected: ₹${expectedOpeningBalance.toFixed(2)}`);
            console.log(`     Got: ₹${calculatedOpeningBalance.toFixed(2)}`);
          } else {
            console.log(`  ✅ Opening balance matches previous page's closing`);
          }
        }

        expectedOpeningBalance = closingBalance;
      }
    }

    // Test the actual backend query logic
    console.log(`\n${'='.repeat(60)}`);
    console.log('Testing Actual Backend Query Logic');
    console.log('='.repeat(60));

    const pageSize = 20;
    const page = 2;
    const skip = (page - 1) * pageSize;

    // Simulate backend query
    const entriesBeforeCurrentPage = await DealerLedger.find(filter)
      .sort({ entryDate: 1 })
      .limit(skip);

    let openingBalance = 0;
    entriesBeforeCurrentPage.forEach(entry => {
      openingBalance += (entry.debitAmount || 0);
      openingBalance -= (entry.creditAmount || 0);
    });

    const pageEntries = await DealerLedger.find(filter)
      .sort({ entryDate: 1 })
      .skip(skip)
      .limit(pageSize);

    console.log(`\nPage ${page} (Backend Query):`);
    console.log(`  Opening Balance: ₹${openingBalance.toFixed(2)}`);
    console.log(`  Entries Retrieved: ${pageEntries.length}`);
    console.log(`  First Entry: ${pageEntries[0]?.invoiceNumber || pageEntries[0]?.description}`);
    console.log(`  Last Entry: ${pageEntries[pageEntries.length - 1]?.invoiceNumber || pageEntries[pageEntries.length - 1]?.description}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

testPaginationBalance();
