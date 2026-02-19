import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerLedger from './models/DealerLedger.js';
import DealerInvoice from './models/DealerInvoice.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const updateExistingLedgerEntries = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get all ledger entries with invoices that don't have salesType
    const ledgerEntries = await DealerLedger.find({
      invoiceNumber: { $exists: true, $ne: null },
      $or: [
        { salesType: null },
        { salesType: { $exists: false } },
        { creditDaysApplied: 0 },
        { creditDaysApplied: { $exists: false } }
      ]
    });

    console.log(`\n📊 Found ${ledgerEntries.length} ledger entries to update`);

    let updated = 0;
    let skipped = 0;

    for (const entry of ledgerEntries) {
      try {
        // Get the invoice
        const invoice = await DealerInvoice.findOne({ invoiceNumber: entry.invoiceNumber });
        
        if (!invoice) {
          console.log(`⚠️  Invoice not found for ${entry.invoiceNumber}`);
          skipped++;
          continue;
        }

        // Get the dealer
        const dealer = await Dealer.findById(entry.dealer);
        
        if (!dealer) {
          console.log(`⚠️  Dealer not found for ${entry.invoiceNumber}`);
          skipped++;
          continue;
        }

        // Determine sales type from invoice items
        let salesType = null;
        let creditDaysApplied = dealer.creditDaysRegular || dealer.creditDays || 0;

        if (invoice.items && invoice.items.length > 0) {
          const cdSalesItems = invoice.items.filter(item => item.salesType === 'CD Sales');
          const regularSalesItems = invoice.items.filter(item => item.salesType === 'Regular Sale' || !item.salesType);

          if (cdSalesItems.length > 0 && regularSalesItems.length === 0) {
            salesType = 'CD Sales';
            creditDaysApplied = dealer.creditDaysCD || 0;
          } else if (regularSalesItems.length > 0 && cdSalesItems.length === 0) {
            salesType = 'Regular Sale';
            creditDaysApplied = dealer.creditDaysRegular || dealer.creditDays || 0;
          } else if (cdSalesItems.length > 0 && regularSalesItems.length > 0) {
            salesType = 'Mixed';
            // For mixed, use the higher credit days
            creditDaysApplied = Math.max(
              dealer.creditDaysCD || 0,
              dealer.creditDaysRegular || dealer.creditDays || 0
            );
          }
        }

        // If still null, check if it's an old invoice without salesType field
        if (!salesType) {
          // Default to Regular Sale for old invoices
          salesType = 'Regular Sale';
          creditDaysApplied = dealer.creditDaysRegular || dealer.creditDays || 0;
        }

        // Update the ledger entry
        await DealerLedger.findByIdAndUpdate(entry._id, {
          salesType,
          creditDaysApplied
        });

        console.log(`✅ Updated ${entry.invoiceNumber}: ${salesType}, ${creditDaysApplied} days`);
        updated++;
      } catch (error) {
        console.error(`❌ Error updating ${entry.invoiceNumber}:`, error.message);
        skipped++;
      }
    }

    console.log(`\n📈 Summary:`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`📊 Total: ${ledgerEntries.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

updateExistingLedgerEntries();
