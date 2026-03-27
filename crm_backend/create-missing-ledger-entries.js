/**
 * CREATE MISSING LEDGER ENTRIES FOR EXISTING VOUCHERS
 * 
 * This script creates dealer ledger entries for vouchers that don't have them
 * Fixes the issue where vouchers exist but ledger shows no payments
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Voucher from './models/Voucher.js';
import DealerLedger from './models/DealerLedger.js';

async function createMissingLedgerEntries() {
  try {
    console.log('🔄 Creating missing ledger entries for existing vouchers...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Get all posted vouchers for dealers
    const vouchers = await Voucher.find({
      partyType: 'Dealer',
      status: 'Posted',
      partyId: { $exists: true, $ne: null }
    }).sort({ voucherDate: 1, createdAt: 1 }); // Sort by date to maintain chronological order
    
    console.log(`📊 Found ${vouchers.length} dealer vouchers to check\n`);
    
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const voucher of vouchers) {
      try {
        // Check if ledger entry already exists for this voucher
        const existingEntry = await DealerLedger.findOne({
          referenceType: 'Voucher',
          referenceId: voucher._id
        });
        
        if (existingEntry) {
          console.log(`⏭️  Skipped ${voucher.voucherNumber} - Ledger entry already exists`);
          skippedCount++;
          continue;
        }
        
        console.log(`\n📝 Creating ledger entry for ${voucher.voucherNumber}`);
        console.log(`   Date: ${voucher.voucherDate.toLocaleDateString()}`);
        console.log(`   Type: ${voucher.voucherType}`);
        console.log(`   Amount: ₹${voucher.totalAmount}`);
        console.log(`   Mode: ${voucher.transactionMode}`);
        
        // Get last ledger entry for running balance
        const lastEntry = await DealerLedger.findOne({ dealer: voucher.partyId })
          .sort({ entryDate: -1, createdAt: -1 });
        
        const previousBalance = lastEntry ? lastEntry.runningBalance : 0;
        
        // Determine transaction type and amounts
        let transactionType, debitAmount, creditAmount, runningBalance, description;
        
        if (voucher.voucherType === 'Receipt') {
          transactionType = 'Payment'; // Fixed: DealerLedger uses "Payment" not "Receipt"
          debitAmount = 0;
          creditAmount = voucher.totalAmount;
          runningBalance = previousBalance - voucher.totalAmount;
          description = `Payment Received - ${voucher.voucherNumber}`;
          if (voucher.transactionMode) {
            description += ` (${voucher.transactionMode})`;
          }
        } else if (voucher.voucherType === 'Payment') {
          transactionType = 'Payment'; // Payment made to dealer (rare)
          debitAmount = voucher.totalAmount;
          creditAmount = 0;
          runningBalance = previousBalance + voucher.totalAmount;
          description = `Payment Made - ${voucher.voucherNumber}`;
          if (voucher.transactionMode) {
            description += ` (${voucher.transactionMode})`;
          }
        } else {
          console.log(`   ⏭️  Skipped - Unsupported voucher type: ${voucher.voucherType}`);
          skippedCount++;
          continue;
        }
        
        // Map transaction mode to payment method enum
        let paymentMethod = voucher.transactionMode;
        if (paymentMethod === 'Bank' || paymentMethod === 'NEFT' || paymentMethod === 'RTGS') {
          paymentMethod = 'Bank Transfer';
        }
        // Valid values: "Cash", "Cheque", "UPI", "Bank Transfer", "Credit Note", "Adjustment"
        
        // Create ledger entry
        const ledgerEntry = new DealerLedger({
          dealer: voucher.partyId,
          dealerName: voucher.partyName,
          entryDate: voucher.voucherDate,
          transactionType,
          referenceType: 'Voucher',
          referenceId: voucher._id,
          referenceNumber: voucher.voucherNumber,
          debitAmount,
          creditAmount,
          paymentReceived: creditAmount, // For payment received
          runningBalance,
          description,
          remarks: voucher.narration || '',
          paymentMethod,
          chequeDetails: voucher.chequeNumber ? {
            chequeNo: voucher.chequeNumber,
            chequeDate: voucher.chequeDate,
            status: voucher.chequeStatus || 'Pending'
          } : undefined,
          upiDetails: voucher.upiTransactionId ? {
            transactionId: voucher.upiTransactionId
          } : undefined,
          createdBy: voucher.createdBy
        });
        
        await ledgerEntry.save();
        
        console.log(`   ✅ Created ledger entry`);
        console.log(`      Previous Balance: ₹${previousBalance}`);
        console.log(`      New Balance: ₹${runningBalance}`);
        
        createdCount++;
        
      } catch (error) {
        console.error(`   ❌ Error processing ${voucher.voucherNumber}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total vouchers checked: ${vouchers.length}`);
    console.log(`Ledger entries created: ${createdCount}`);
    console.log(`Already had entries: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('='.repeat(80));
    
    if (createdCount > 0) {
      console.log('\n✅ SUCCESS! Created missing ledger entries.');
      console.log('   Dealer ledger should now show all payments correctly.');
    } else {
      console.log('\n✅ All vouchers already have ledger entries.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

createMissingLedgerEntries();
