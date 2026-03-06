/**
 * CHECK SPECIFIC VOUCHER
 * Check voucher RV-2025-26-0002-16 details
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Voucher from './models/Voucher.js';
import PaymentAllocation from './models/PaymentAllocation.js';

async function checkSpecificVoucher() {
  try {
    console.log('🔍 Checking voucher RV-2025-26-0002-16...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    // Find the voucher
    const voucher = await Voucher.findOne({ voucherNumber: 'RV-2025-26-0002-16' }).lean();
    
    if (!voucher) {
      console.log('❌ Voucher not found');
      return;
    }
    
    console.log('📄 VOUCHER DETAILS:');
    console.log('='.repeat(80));
    console.log(`Voucher Number: ${voucher.voucherNumber}`);
    console.log(`Voucher Type: ${voucher.voucherType}`);
    console.log(`Date: ${new Date(voucher.voucherDate).toLocaleDateString()}`);
    console.log(`Party: ${voucher.partyName} (${voucher.partyType})`);
    console.log(`Transaction Mode: ${voucher.transactionMode}`);
    console.log(`Total Amount: ₹${voucher.totalAmount}`);
    console.log(`Allocated Amount: ₹${voucher.allocatedAmount || 0}`);
    console.log(`Unallocated Amount: ₹${voucher.unallocatedAmount !== undefined ? voucher.unallocatedAmount : (voucher.totalAmount - (voucher.allocatedAmount || 0))}`);
    console.log(`Allocation Type: ${voucher.allocationType}`);
    console.log(`Status: ${voucher.status}`);
    console.log(`\nAllocations in Voucher:`);
    if (voucher.allocations && voucher.allocations.length > 0) {
      voucher.allocations.forEach((alloc, idx) => {
        console.log(`  ${idx + 1}. Invoice: ${alloc.invoiceNumber || alloc.invoiceId}`);
        console.log(`     Amount: ₹${alloc.allocatedAmount}`);
      });
    } else {
      console.log('  No allocations in voucher');
    }
    console.log(`\nCreated: ${new Date(voucher.createdAt).toLocaleString()}`);
    console.log(`ID: ${voucher._id}`);
    console.log('='.repeat(80));
    
    // Find payment allocations using this voucher
    const allocations = await PaymentAllocation.find({ voucherId: voucher._id }).lean();
    
    console.log(`\n📊 PAYMENT ALLOCATIONS USING THIS VOUCHER: ${allocations.length}\n`);
    
    if (allocations.length > 0) {
      allocations.forEach((alloc, idx) => {
        console.log(`${idx + 1}. Allocation Number: ${alloc.allocationNumber}`);
        console.log(`   Date: ${new Date(alloc.allocationDate).toLocaleDateString()}`);
        console.log(`   Total Allocated: ₹${alloc.totalAllocated}`);
        console.log(`   Allocations:`);
        alloc.allocations.forEach(a => {
          console.log(`     - Invoice: ${a.invoiceNumber}`);
          console.log(`       Amount: ₹${a.allocatedAmount}`);
          console.log(`       Status: ${a.paymentStatus}`);
        });
        console.log('');
      });
    }
    
    console.log('\n💡 ANALYSIS:');
    console.log('='.repeat(80));
    console.log(`Voucher Total: ₹${voucher.totalAmount}`);
    const totalAllocatedInPaymentAllocations = allocations.reduce((sum, a) => sum + a.totalAllocated, 0);
    console.log(`Total in Payment Allocations: ₹${totalAllocatedInPaymentAllocations}`);
    console.log(`Difference: ₹${voucher.totalAmount - totalAllocatedInPaymentAllocations}`);
    
    if (totalAllocatedInPaymentAllocations > voucher.totalAmount) {
      console.log('\n⚠️  WARNING: Payment allocations exceed voucher amount!');
      console.log('   This voucher has been over-allocated.');
    } else if (totalAllocatedInPaymentAllocations < voucher.totalAmount) {
      console.log('\n✅ Voucher has unallocated amount remaining.');
    } else {
      console.log('\n✅ Voucher is fully allocated.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

checkSpecificVoucher();
