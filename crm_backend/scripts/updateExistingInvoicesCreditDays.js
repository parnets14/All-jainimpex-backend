import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import DealerInvoice from '../models/DealerInvoice.js';
import Dealer from '../models/Dealer.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  console.log('\n' + '='.repeat(80));
  console.log('UPDATING EXISTING INVOICES WITH CORRECT CREDIT DAYS');
  console.log('='.repeat(80) + '\n');
  
  try {
    // Get all ledger entries that are invoices
    const ledgerEntries = await DealerLedger.find({ 
      transactionType: 'Invoice',
      invoice: { $exists: true, $ne: null }
    }).populate('dealer');
    
    console.log(`Found ${ledgerEntries.length} invoice ledger entries\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const ledgerEntry of ledgerEntries) {
      try {
        if (!ledgerEntry.dealer) {
          console.log(`⚠️  Dealer not found for ledger entry: ${ledgerEntry.invoiceNumber}`);
          skipped++;
          continue;
        }
        
        const dealer = ledgerEntry.dealer;
        const invoice = await DealerInvoice.findById(ledgerEntry.invoice);
        
        if (!invoice) {
          console.log(`⚠️  Invoice not found for ledger entry: ${ledgerEntry.invoiceNumber}`);
          skipped++;
          continue;
        }
        
        // Determine correct credit days based on sales type
        let correctCreditDays = ledgerEntry.creditDaysApplied;
        let needsUpdate = false;
        
        if (ledgerEntry.salesType === 'CD Sales') {
          correctCreditDays = dealer.creditDaysCD || dealer.creditDays || 30;
          if (ledgerEntry.creditDaysApplied !== correctCreditDays) {
            needsUpdate = true;
          }
        } else if (ledgerEntry.salesType === 'Regular Sale') {
          correctCreditDays = dealer.creditDaysRegular || dealer.creditDays || 30;
          if (ledgerEntry.creditDaysApplied !== correctCreditDays) {
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          // Update ledger entry
          ledgerEntry.creditDaysApplied = correctCreditDays;
          ledgerEntry.creditDays = correctCreditDays;
          
          // Recalculate due date
          const invoiceDate = new Date(ledgerEntry.entryDate);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + correctCreditDays);
          ledgerEntry.dueDate = dueDate;
          
          await ledgerEntry.save();
          
          // Also update the invoice
          invoice.creditDays = correctCreditDays;
          const invoiceDueDate = new Date(invoice.invoiceDate);
          invoiceDueDate.setDate(invoiceDueDate.getDate() + correctCreditDays);
          invoice.dueDate = invoiceDueDate;
          await invoice.save();
          
          updated++;
          console.log(`✅ Updated: ${ledgerEntry.invoiceNumber} (${ledgerEntry.salesType})`);
          console.log(`   Old: ${ledgerEntry.creditDaysApplied} days → New: ${correctCreditDays} days`);
          console.log(`   Dealer: ${dealer.name} (Regular: ${dealer.creditDaysRegular}, CD: ${dealer.creditDaysCD})`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${ledgerEntry.invoiceNumber} - Already correct (${correctCreditDays} days)`);
        }
        
      } catch (error) {
        console.error(`❌ Error updating ${ledgerEntry.invoiceNumber}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 Update Summary:');
    console.log('='.repeat(80));
    console.log(`✅ Updated: ${updated} entries`);
    console.log(`⏭️  Skipped: ${skipped} entries`);
    console.log(`❌ Errors: ${errors} entries`);
    console.log(`📝 Total: ${ledgerEntries.length} entries processed`);
    console.log('='.repeat(80));
    
    if (updated > 0) {
      console.log('\n✨ Success! Credit days have been updated.');
      console.log('Refresh the Dealer Ledger page to see the changes.');
    } else {
      console.log('\n💡 All entries already have correct credit days.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
  }
}).catch(error => {
  console.error('❌ MongoDB connection error:', error);
});
