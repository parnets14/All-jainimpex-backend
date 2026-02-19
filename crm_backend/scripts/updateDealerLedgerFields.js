import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import DealerInvoice from '../models/DealerInvoice.js';
import SalesOrder from '../models/SalesOrder.js';
import Product from '../models/Product.js'; // Import Product model

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  console.log('Starting to update existing ledger entries with salesType and creditDaysApplied...\n');
  
  try {
    // Get all ledger entries that are invoices
    const ledgerEntries = await DealerLedger.find({ 
      transactionType: 'Invoice',
      invoice: { $exists: true, $ne: null }
    });
    
    console.log(`Found ${ledgerEntries.length} invoice ledger entries to update\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const ledgerEntry of ledgerEntries) {
      try {
        // Get the related invoice (without populating to avoid Product model issues)
        const invoice = await DealerInvoice.findById(ledgerEntry.invoice);
        
        if (!invoice) {
          console.log(`⚠️  Invoice not found for ledger entry: ${ledgerEntry.invoiceNumber}`);
          skipped++;
          continue;
        }
        
        let salesType = ledgerEntry.salesType; // Keep existing if already set
        let creditDaysApplied = ledgerEntry.creditDaysApplied;
        let needsUpdate = false;
        
        // Update salesType if not set or null
        if (!salesType) {
          // Try to get from invoice items first
          if (invoice.items && invoice.items.length > 0 && invoice.items[0].salesType) {
            salesType = invoice.items[0].salesType;
            needsUpdate = true;
          } 
          // Try to get from sales order
          else if (invoice.salesOrder) {
            const salesOrder = await SalesOrder.findById(invoice.salesOrder);
            if (salesOrder && salesOrder.salesType) {
              salesType = salesOrder.salesType;
              needsUpdate = true;
            }
          }
          
          // Default to 'Regular Sale' if still not found
          if (!salesType) {
            salesType = 'Regular Sale';
            needsUpdate = true;
          }
        }
        
        // Update creditDaysApplied if not set or 0
        if (creditDaysApplied === undefined || creditDaysApplied === null || creditDaysApplied === 0) {
          if (invoice.creditDays) {
            creditDaysApplied = invoice.creditDays;
            needsUpdate = true;
          } else if (invoice.salesOrder) {
            const salesOrder = await SalesOrder.findById(invoice.salesOrder);
            if (salesOrder) {
              creditDaysApplied = salesOrder.creditDaysApplied || salesOrder.creditDays || 0;
              needsUpdate = true;
            }
          }
        }
        
        // Update the ledger entry if needed
        if (needsUpdate) {
          ledgerEntry.salesType = salesType;
          ledgerEntry.creditDaysApplied = creditDaysApplied;
          
          // Also update creditDays if it's 0
          if (!ledgerEntry.creditDays || ledgerEntry.creditDays === 0) {
            ledgerEntry.creditDays = creditDaysApplied;
          }
          
          await ledgerEntry.save();
          updated++;
          console.log(`✅ Updated: ${ledgerEntry.invoiceNumber} - ${salesType} (${creditDaysApplied} days)`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${ledgerEntry.invoiceNumber} - Already has correct data`);
        }
        
      } catch (error) {
        console.error(`❌ Error updating ledger entry ${ledgerEntry.invoiceNumber}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Update Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Updated: ${updated} entries`);
    console.log(`⏭️  Skipped: ${skipped} entries (already correct)`);
    console.log(`❌ Errors: ${errors} entries`);
    console.log(`📝 Total: ${ledgerEntries.length} entries processed`);
    console.log('='.repeat(60));
    
    if (updated > 0) {
      console.log('\n✨ Success! Ledger entries have been updated.');
      console.log('You can now view the updated data in the Dealer Ledger page.');
    } else {
      console.log('\n💡 All ledger entries already have the correct data.');
    }
    
  } catch (error) {
    console.error('❌ Error updating ledger entries:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
  }
}).catch(error => {
  console.error('❌ MongoDB connection error:', error);
});
