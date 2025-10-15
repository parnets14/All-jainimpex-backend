import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import DealerLedger from '../models/DealerLedger.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL).then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Check current ledger entries for MICHAEL CHEN
    const michaelDealerId = '68e4fbcf35d05ba7404d565e'; // MICHAEL CHEN's dealer ID
    
    console.log('\n=== Current Ledger Entries for MICHAEL CHEN ===');
    const ledgerEntries = await DealerLedger.find({ dealer: michaelDealerId })
      .sort({ entryDate: 1 });
    
    console.log(`Found ${ledgerEntries.length} ledger entries:`);
    ledgerEntries.forEach(entry => {
      console.log(`  - ${entry.transactionType}: ${entry.invoiceNumber || entry.creditNoteNumber} - ₹${entry.debitAmount || entry.creditAmount} (Balance: ₹${entry.runningBalance})`);
    });
    
    // Calculate summary
    const totalDebit = ledgerEntries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0);
    const totalCredit = ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0);
    const currentBalance = totalDebit - totalCredit;
    
    console.log(`\n=== Summary ===`);
    console.log(`Total Invoices: ₹${totalDebit.toLocaleString()}`);
    console.log(`Total Payments: ₹${totalCredit.toLocaleString()}`);
    console.log(`Current Balance: ₹${currentBalance.toLocaleString()}`);
    
  } catch (error) {
    console.error('Error checking ledger entries:', error);
  } finally {
    mongoose.connection.close();
  }
}).catch(error => {
  console.error('MongoDB connection error:', error);
});

