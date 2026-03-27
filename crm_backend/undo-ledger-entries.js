/**
 * UNDO LEDGER ENTRIES CREATED BY SCRIPT
 * 
 * This script removes ledger entries that were created by the create-missing-ledger-entries script
 * Identifies entries by description pattern "Payment Received - RV-"
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerLedger from './models/DealerLedger.js';

async function undoLedgerEntries() {
  try {
    console.log('🔄 Undoing ledger entries created by script...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Find all ledger entries with description matching "Payment Received - RV-"
    // These are the entries created by our script
    const voucherLedgerEntries = await DealerLedger.find({
      description: { $regex: /^Payment Received - RV-/, $options: 'i' }
    }).sort({ entryDate: 1 });
    
    console.log(`📊 Found ${voucherLedgerEntries.length} ledger entries created by script\n`);
    
    if (voucherLedgerEntries.length === 0) {
      console.log('✅ No voucher ledger entries to remove');
      return;
    }
    
    // Show what will be deleted
    console.log('📋 LEDGER ENTRIES TO BE DELETED:');
    console.log('-'.repeat(80));
    for (const entry of voucherLedgerEntries) {
      console.log(`Date: ${entry.entryDate.toLocaleDateString()}`);
      console.log(`  Type: ${entry.transactionType}`);
      console.log(`  Description: ${entry.description}`);
      console.log(`  Dealer: ${entry.dealerName}`);
      console.log(`  Debit: ₹${entry.debitAmount || 0}`);
      console.log(`  Credit: ₹${entry.creditAmount || 0}`);
      console.log(`  Payment Received: ₹${entry.paymentReceived || 0}`);
      console.log(`  Balance: ₹${entry.runningBalance || 0}`);
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will delete all the above ledger entries!');
    console.log('='.repeat(80));
    console.log('\n🔄 Proceeding with deletion...\n');
    
    // Delete all voucher ledger entries
    const result = await DealerLedger.deleteMany({
      description: { $regex: /^Payment Received - RV-/, $options: 'i' }
    });
    
    console.log('='.repeat(80));
    console.log('📊 DELETION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total entries deleted: ${result.deletedCount}`);
    console.log('='.repeat(80));
    
    if (result.deletedCount > 0) {
      console.log('\n✅ SUCCESS! Ledger entries have been removed.');
      console.log('   Dealer ledger is now back to original state (only invoice entries).');
    } else {
      console.log('\n⚠️  No entries were deleted.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

undoLedgerEntries();
