/**
 * CHECK CURRENT LEDGER STATE
 * Shows what's actually in the dealer ledger right now
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

async function checkLedgerNow() {
  try {
    console.log('🔍 Checking current ledger state...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Find Kiran Kumar dealer - try different fields
    let dealer = await Dealer.findOne({ dealerName: /Kiran Kumar/i });
    
    if (!dealer) {
      dealer = await Dealer.findOne({ name: /Kiran Kumar/i });
    }
    
    if (!dealer) {
      // List all dealers
      const allDealers = await Dealer.find().limit(10);
      console.log('Available dealers:');
      allDealers.forEach(d => {
        console.log(`  - ${d.dealerName || d.name} (${d.dealerCode || d.code})`);
      });
      console.log('\n❌ Kiran Kumar dealer not found');
      return;
    }
    
    console.log(`👤 Dealer: ${dealer.dealerName} (${dealer.dealerCode})`);
    console.log(`   ID: ${dealer._id}\n`);
    
    // Get all ledger entries
    const entries = await DealerLedger.find({ dealer: dealer._id })
      .sort({ entryDate: 1, createdAt: 1 });
    
    console.log(`📊 Total Ledger Entries: ${entries.length}\n`);
    console.log('='.repeat(100));
    
    for (const entry of entries) {
      console.log(`Date: ${entry.entryDate.toLocaleDateString()}`);
      console.log(`  Type: ${entry.transactionType}`);
      console.log(`  Reference: ${entry.referenceType} - ${entry.referenceNumber}`);
      console.log(`  Description: ${entry.description}`);
      console.log(`  Debit: ₹${entry.debitAmount || 0}`);
      console.log(`  Credit: ₹${entry.creditAmount || 0}`);
      console.log(`  Payment Received: ₹${entry.paymentReceived || 0}`);
      console.log(`  Balance: ₹${entry.runningBalance || 0}`);
      console.log(`  Payment Method: ${entry.paymentMethod || 'N/A'}`);
      console.log(`  Created: ${entry.createdAt.toLocaleString()}`);
      console.log(`  ID: ${entry._id}`);
      console.log('-'.repeat(100));
    }
    
    // Summary
    const invoiceEntries = entries.filter(e => e.referenceType === 'Invoice');
    const voucherEntries = entries.filter(e => e.referenceType === 'Voucher');
    const paymentVoucherEntries = entries.filter(e => e.description && e.description.includes('Payment Voucher'));
    
    console.log('\n📊 SUMMARY:');
    console.log(`Total Entries: ${entries.length}`);
    console.log(`Invoice Entries: ${invoiceEntries.length}`);
    console.log(`Voucher Entries: ${voucherEntries.length}`);
    console.log(`Payment Voucher Entries (by description): ${paymentVoucherEntries.length}`);
    
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      console.log(`\nFinal Balance: ₹${lastEntry.runningBalance || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

checkLedgerNow();
