/**
 * FIX PAYMENT ALLOCATION MISMATCH
 * Update PA-2025-26-0006 to match voucher RV-2025-26-0002-16
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import PaymentAllocation from './models/PaymentAllocation.js';
import DealerInvoice from './models/DealerInvoice.js';

async function fixPaymentAllocationMismatch() {
  try {
    console.log('🔧 Fixing payment allocation mismatch...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    // Find the incorrect payment allocation
    const allocation = await PaymentAllocation.findOne({ allocationNumber: 'PA-2025-26-0006' });
    
    if (!allocation) {
      console.log('❌ Payment allocation PA-2025-26-0006 not found');
      return;
    }
    
    console.log('📄 CURRENT PAYMENT ALLOCATION:');
    console.log('='.repeat(80));
    console.log(`Allocation Number: ${allocation.allocationNumber}`);
    console.log(`Voucher Number: ${allocation.voucherNumber}`);
    console.log(`Total Allocated: ₹${allocation.totalAllocated}`);
    console.log(`Allocations:`);
    allocation.allocations.forEach(alloc => {
      console.log(`  - Invoice: ${alloc.invoiceNumber}`);
      console.log(`    Amount: ₹${alloc.allocatedAmount}`);
      console.log(`    Status: ${alloc.paymentStatus}`);
    });
    console.log('='.repeat(80));
    
    console.log('\n🔄 UPDATING TO CORRECT VALUES:');
    console.log('  Total Allocated: ₹10000 → ₹4124.6');
    console.log('  Invoice Allocation: ₹10000 → ₹4124.6');
    console.log('  Payment Status: Partial → Partial');
    
    // Get the invoice to calculate correct remaining amount
    const invoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0004' });
    
    if (!invoice) {
      console.log('❌ Invoice INV-2026-0004 not found');
      return;
    }
    
    console.log(`\n📄 Invoice INV-2026-0004:`);
    console.log(`  Total Amount: ₹${invoice.totalAmount}`);
    console.log(`  Paid Amount: ₹${invoice.paidAmount}`);
    console.log(`  Pending Amount: ₹${invoice.pendingAmount}`);
    
    // Calculate correct values
    // The voucher allocated ₹4124.6 to this invoice
    // But PA-2025-26-0006 says ₹10000
    // And PA-2025-26-0009 also says ₹10000
    // So the invoice thinks it received ₹20000 but actually received ₹14124.6
    
    const correctAllocatedAmount = 4124.6;
    const previouslyPaid = allocation.allocations[0].previouslyPaid || 0;
    const remainingAmount = invoice.totalAmount - previouslyPaid - correctAllocatedAmount;
    
    console.log(`\n💡 CALCULATION:`);
    console.log(`  Invoice Total: ₹${invoice.totalAmount}`);
    console.log(`  Previously Paid: ₹${previouslyPaid}`);
    console.log(`  This Allocation: ₹${correctAllocatedAmount}`);
    console.log(`  Remaining: ₹${remainingAmount}`);
    
    // Update the payment allocation
    allocation.totalAllocated = correctAllocatedAmount;
    allocation.allocations[0].allocatedAmount = correctAllocatedAmount;
    allocation.allocations[0].remainingAmount = remainingAmount;
    allocation.allocations[0].paymentStatus = remainingAmount > 0 ? 'Partial' : 'Full';
    
    await allocation.save();
    
    console.log('\n✅ Payment allocation updated successfully!');
    
    console.log('\n📄 UPDATED PAYMENT ALLOCATION:');
    console.log('='.repeat(80));
    console.log(`Allocation Number: ${allocation.allocationNumber}`);
    console.log(`Voucher Number: ${allocation.voucherNumber}`);
    console.log(`Total Allocated: ₹${allocation.totalAllocated}`);
    console.log(`Allocations:`);
    allocation.allocations.forEach(alloc => {
      console.log(`  - Invoice: ${alloc.invoiceNumber}`);
      console.log(`    Amount: ₹${alloc.allocatedAmount}`);
      console.log(`    Remaining: ₹${alloc.remainingAmount}`);
      console.log(`    Status: ${alloc.paymentStatus}`);
    });
    console.log('='.repeat(80));
    
    console.log('\n⚠️  NOTE: You may need to recalculate invoice payment status.');
    console.log('   Run sync-invoice-payments.js to update invoice payment status.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

fixPaymentAllocationMismatch();
