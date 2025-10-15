import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';
import DealerInvoice from '../models/DealerInvoice.js';
import CreditNote from '../models/CreditNote.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Check current ledger entries for sagar
    const sagarDealerId = '68e8f1ccb63d66c39bd7cd1e'; // sagar's dealer ID
    
    console.log('\n=== Current Ledger Entries for sagar ===');
    const ledgerEntries = await DealerLedger.find({ dealer: sagarDealerId })
      .sort({ entryDate: 1 });
    
    console.log(`Found ${ledgerEntries.length} ledger entries:`);
    ledgerEntries.forEach(entry => {
      console.log(`  - ${entry.transactionType}: ${entry.invoiceNumber || entry.creditNoteNumber} - ₹${entry.debitAmount || entry.creditAmount} (Balance: ₹${entry.runningBalance})`);
    });
    
    // Check recent credit notes
    console.log('\n=== Recent Credit Notes ===');
    const recentCreditNotes = await CreditNote.find({ dealer: sagarDealerId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log(`Found ${recentCreditNotes.length} recent credit notes:`);
    recentCreditNotes.forEach(cn => {
      console.log(`  - ${cn.creditNoteNumber}: ₹${cn.creditAmount} (${cn.creditReason})`);
    });
    
    // Check if ledger entries exist for recent credit notes
    console.log('\n=== Ledger Entry Status for Recent Credit Notes ===');
    for (const cn of recentCreditNotes) {
      const ledgerEntry = await DealerLedger.findOne({ creditNote: cn._id });
      console.log(`  - ${cn.creditNoteNumber}: ${ledgerEntry ? '✅ Has ledger entry' : '❌ Missing ledger entry'}`);
    }
    
  } catch (error) {
    console.error('Error checking ledger entries:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});

