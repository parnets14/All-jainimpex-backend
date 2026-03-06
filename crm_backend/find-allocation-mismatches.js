/**
 * FIND ALLOCATION MISMATCHES
 * Compare voucher allocations with payment allocation records
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Voucher from './models/Voucher.js';
import PaymentAllocation from './models/PaymentAllocation.js';

async function findAllocationMismatches() {
  try {
    console.log('🔍 Finding allocation mismatches...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    const dealerId = '697c631b88ce4a6086ffee8e';
    
    // Get all vouchers
    const vouchers = await Voucher.find({ 
      partyId: dealerId,
      partyType: 'Dealer'
    }).sort({ voucherDate: 1 }).lean();
    
    console.log(`📊 Checking ${vouchers.length} vouchers...\n`);
    console.log('='.repeat(100));
    
    let mismatchCount = 0;
    let correctCount = 0;
    
    for (const voucher of vouchers) {
      // Get payment allocations for this voucher
      const allocations = await PaymentAllocation.find({ voucherId: voucher._id }).lean();
      
      const voucherAllocated = voucher.allocatedAmount || 0;
      const paymentAllocationTotal = allocations.reduce((sum, a) => sum + a.totalAllocated, 0);
      
      const hasMismatch = Math.abs(voucherAllocated - paymentAllocationTotal) > 0.01;
      
      if (hasMismatch || allocations.length > 0) {
        console.log(`\n${hasMismatch ? '❌ MISMATCH' : '✅ MATCH'}: ${voucher.voucherNumber}`);
        console.log(`Date: ${new Date(voucher.voucherDate).toLocaleDateString()}`);
        console.log(`Total Amount: ₹${voucher.totalAmount}`);
        console.log(`Voucher Allocated: ₹${voucherAllocated}`);
        console.log(`Payment Allocation Total: ₹${paymentAllocationTotal}`);
        console.log(`Difference: ₹${voucherAllocated - paymentAllocationTotal}`);
        
        if (voucher.allocations && voucher.allocations.length > 0) {
          console.log(`\nVoucher Allocations:`);
          voucher.allocations.forEach(alloc => {
            console.log(`  - ${alloc.invoiceNumber || alloc.invoiceId}: ₹${alloc.allocatedAmount}`);
          });
        }
        
        if (allocations.length > 0) {
          console.log(`\nPayment Allocations:`);
          allocations.forEach(alloc => {
            console.log(`  - ${alloc.allocationNumber}: ₹${alloc.totalAllocated}`);
            alloc.allocations.forEach(a => {
              console.log(`    * ${a.invoiceNumber}: ₹${a.allocatedAmount}`);
            });
          });
        }
        
        console.log('-'.repeat(100));
        
        if (hasMismatch) {
          mismatchCount++;
        } else {
          correctCount++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('📊 SUMMARY');
    console.log('='.repeat(100));
    console.log(`Total Vouchers: ${vouchers.length}`);
    console.log(`Mismatches Found: ${mismatchCount}`);
    console.log(`Correct Allocations: ${correctCount}`);
    console.log(`Vouchers with No Allocations: ${vouchers.length - mismatchCount - correctCount}`);
    console.log('='.repeat(100));
    
    if (mismatchCount > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('   Payment allocation records do not match voucher allocations.');
      console.log('   This causes incorrect ledger display.');
      console.log('   Options:');
      console.log('   1. Delete incorrect payment allocations');
      console.log('   2. Update payment allocations to match vouchers');
      console.log('   3. Update vouchers to match payment allocations');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

findAllocationMismatches();
