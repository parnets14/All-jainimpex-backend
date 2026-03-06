/**
 * CHECK PAYMENT ALLOCATIONS
 * Shows what payment allocations exist in the database
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import PaymentAllocation from './models/PaymentAllocation.js';
import Voucher from './models/Voucher.js';

async function checkPaymentAllocations() {
  try {
    console.log('🔍 Checking payment allocations...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    // Find dealer ID (from previous check)
    const dealerId = '697c631b88ce4a6086ffee8e';
    
    // Get all payment allocations for this dealer
    const allocations = await PaymentAllocation.find({ partyId: dealerId })
      .sort({ allocationDate: 1 })
      .lean();
    
    console.log(`📊 Total Payment Allocations: ${allocations.length}\n`);
    console.log('='.repeat(100));
    
    for (const allocation of allocations) {
      console.log(`Date: ${new Date(allocation.allocationDate).toLocaleDateString()}`);
      console.log(`  Allocation Number: ${allocation.allocationNumber}`);
      console.log(`  Voucher ID: ${allocation.voucherId}`);
      console.log(`  Voucher Number: ${allocation.voucherNumber || 'N/A'}`);
      console.log(`  Voucher Numbers (array): ${allocation.voucherNumbers?.join(', ') || 'N/A'}`);
      console.log(`  Total Allocated: ₹${allocation.totalAllocated || 0}`);
      console.log(`  Total Amount: ₹${allocation.totalAmount || 0}`);
      console.log(`  Voucher Type: ${allocation.voucherType || 'N/A'}`);
      console.log(`  Allocations:`);
      if (allocation.allocations && allocation.allocations.length > 0) {
        allocation.allocations.forEach(alloc => {
          console.log(`    - Invoice: ${alloc.invoiceNumber || alloc.invoiceId?.invoiceNumber || 'N/A'}`);
          console.log(`      Amount: ₹${alloc.allocatedAmount}`);
        });
      }
      console.log(`  Created: ${new Date(allocation.createdAt).toLocaleString()}`);
      console.log(`  ID: ${allocation._id}`);
      console.log('-'.repeat(100));
    }
    
    // Get all vouchers for comparison
    const vouchers = await Voucher.find({ 
      partyId: dealerId,
      partyType: 'Dealer'
    }).sort({ voucherDate: 1 }).lean();
    
    console.log(`\n📊 Total Vouchers: ${vouchers.length}\n`);
    
    // Summary
    const totalAllocated = allocations.reduce((sum, a) => sum + (a.totalAllocated || 0), 0);
    const totalVouchers = vouchers.reduce((sum, v) => sum + v.totalAmount, 0);
    
    console.log('\n📊 SUMMARY:');
    console.log(`Payment Allocations: ${allocations.length}`);
    console.log(`Total Allocated: ₹${totalAllocated}`);
    console.log(`Vouchers: ${vouchers.length}`);
    console.log(`Total Voucher Amount: ₹${totalVouchers}`);
    console.log(`Difference: ₹${totalVouchers - totalAllocated}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

checkPaymentAllocations();
