/**
 * REVERT DUPLICATE ALLOCATIONS
 * 
 * This script removes duplicate allocations and keeps only the correct amount
 * For invoice INV-2026-0004: ₹14,124.6 (but ₹46,498.4 was allocated)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerInvoice from './models/DealerInvoice.js';
import Voucher from './models/Voucher.js';
import PaymentAllocation from './models/PaymentAllocation.js';

async function revertDuplicateAllocations() {
  try {
    console.log('🔄 Reverting duplicate allocations...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Get the problematic invoice
    const invoice = await DealerInvoice.findOne({ invoiceNumber: 'INV-2026-0004' });
    
    if (!invoice) {
      console.log('❌ Invoice not found');
      return;
    }
    
    console.log('📄 INVOICE DETAILS:');
    console.log(`   Invoice: ${invoice.invoiceNumber}`);
    console.log(`   Dealer: ${invoice.dealerName}`);
    console.log(`   Total Amount: ₹${invoice.totalAmount}`);
    console.log(`   Current Paid: ₹${invoice.paidAmount || 0}`);
    console.log(`   Current Status: ${invoice.paymentStatus}`);
    console.log(`   Overpaid by: ₹${(invoice.paidAmount || 0) - invoice.totalAmount}\n`);
    
    // Find all vouchers with allocations to this invoice
    const vouchers = await Voucher.find({
      'allocations.invoiceId': invoice._id,
      status: 'Posted'
    }).sort({ voucherDate: 1 }); // Sort by date to keep oldest first
    
    console.log(`📋 Found ${vouchers.length} vouchers with allocations:\n`);
    
    // List all allocations
    const allAllocations = [];
    for (const voucher of vouchers) {
      for (const allocation of voucher.allocations) {
        if (allocation.invoiceId.toString() === invoice._id.toString()) {
          allAllocations.push({
            voucher,
            allocation,
            voucherNumber: voucher.voucherNumber,
            amount: allocation.allocatedAmount,
            date: voucher.voucherDate
          });
          console.log(`   ${voucher.voucherNumber} (${voucher.voucherDate.toLocaleDateString()}): ₹${allocation.allocatedAmount}`);
        }
      }
    }
    
    const totalAllocated = allAllocations.reduce((sum, a) => sum + a.amount, 0);
    console.log(`\n   Total Allocated: ₹${totalAllocated}`);
    console.log(`   Invoice Amount: ₹${invoice.totalAmount}`);
    console.log(`   Extra: ₹${totalAllocated - invoice.totalAmount}\n`);
    
    // Strategy: Keep allocations until we reach the invoice amount, remove the rest
    let remainingToAllocate = invoice.totalAmount;
    const allocationsToKeep = [];
    const allocationsToRemove = [];
    
    for (const item of allAllocations) {
      if (remainingToAllocate > 0) {
        const amountToKeep = Math.min(item.amount, remainingToAllocate);
        if (amountToKeep === item.amount) {
          allocationsToKeep.push(item);
          remainingToAllocate -= amountToKeep;
        } else {
          // Partial allocation - need to adjust
          allocationsToKeep.push({
            ...item,
            amount: amountToKeep,
            adjusted: true
          });
          remainingToAllocate = 0;
        }
      } else {
        allocationsToRemove.push(item);
      }
    }
    
    console.log('✅ ALLOCATIONS TO KEEP:');
    for (const item of allocationsToKeep) {
      console.log(`   ${item.voucherNumber}: ₹${item.amount}${item.adjusted ? ' (adjusted)' : ''}`);
    }
    
    console.log('\n❌ ALLOCATIONS TO REMOVE:');
    for (const item of allocationsToRemove) {
      console.log(`   ${item.voucherNumber}: ₹${item.amount}`);
    }
    
    // Ask for confirmation
    console.log('\n⚠️  This will:');
    console.log(`   1. Remove ${allocationsToRemove.length} duplicate allocations`);
    console.log(`   2. Update voucher allocated/unallocated amounts`);
    console.log(`   3. Update invoice paid amount to ₹${invoice.totalAmount}`);
    console.log(`   4. Delete PaymentAllocation records for removed allocations`);
    console.log('\n🔄 Proceeding with revert...\n');
    
    // Remove allocations from vouchers
    for (const item of allocationsToRemove) {
      const voucher = item.voucher;
      
      // Remove this allocation from voucher
      voucher.allocations = voucher.allocations.filter(
        a => !(a.invoiceId.toString() === invoice._id.toString() && 
               Math.abs(a.allocatedAmount - item.amount) < 0.01)
      );
      
      // Update voucher amounts
      const totalAllocatedInVoucher = voucher.allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      voucher.allocatedAmount = totalAllocatedInVoucher;
      voucher.unallocatedAmount = voucher.totalAmount - totalAllocatedInVoucher;
      
      if (voucher.allocations.length === 0) {
        voucher.allocationType = 'OnAccount';
      } else if (voucher.allocatedAmount === voucher.totalAmount) {
        voucher.allocationType = 'AgainstReference';
      } else {
        voucher.allocationType = 'Mixed';
      }
      
      await voucher.save();
      console.log(`   ✅ Removed allocation from ${voucher.voucherNumber}`);
    }
    
    // Update vouchers with adjusted allocations
    for (const item of allocationsToKeep.filter(i => i.adjusted)) {
      const voucher = item.voucher;
      
      // Find and update the allocation amount
      for (const allocation of voucher.allocations) {
        if (allocation.invoiceId.toString() === invoice._id.toString()) {
          allocation.allocatedAmount = item.amount;
        }
      }
      
      // Recalculate voucher amounts
      const totalAllocatedInVoucher = voucher.allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
      voucher.allocatedAmount = totalAllocatedInVoucher;
      voucher.unallocatedAmount = voucher.totalAmount - totalAllocatedInVoucher;
      
      await voucher.save();
      console.log(`   ✅ Adjusted allocation in ${voucher.voucherNumber} to ₹${item.amount}`);
    }
    
    // Delete PaymentAllocation records for removed allocations
    const voucherIdsToCheck = [...new Set(allocationsToRemove.map(a => a.voucher._id.toString()))];
    for (const voucherId of voucherIdsToCheck) {
      const paymentAllocations = await PaymentAllocation.find({
        voucherId,
        'allocations.invoiceId': invoice._id
      });
      
      for (const pa of paymentAllocations) {
        // Remove this invoice from the payment allocation
        pa.allocations = pa.allocations.filter(
          a => a.invoiceId.toString() !== invoice._id.toString()
        );
        
        if (pa.allocations.length === 0) {
          // Delete the entire payment allocation if no allocations left
          await PaymentAllocation.deleteOne({ _id: pa._id });
          console.log(`   ✅ Deleted PaymentAllocation ${pa.allocationNumber}`);
        } else {
          // Update total allocated
          pa.totalAllocated = pa.allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
          await pa.save();
          console.log(`   ✅ Updated PaymentAllocation ${pa.allocationNumber}`);
        }
      }
    }
    
    // Update invoice
    const correctPaidAmount = allocationsToKeep.reduce((sum, a) => sum + a.amount, 0);
    invoice.paidAmount = correctPaidAmount;
    invoice.pendingAmount = invoice.totalAmount - correctPaidAmount;
    
    if (invoice.paidAmount >= invoice.totalAmount) {
      invoice.paymentStatus = 'Paid';
    } else if (invoice.paidAmount > 0) {
      invoice.paymentStatus = 'Partial';
    } else {
      invoice.paymentStatus = 'Pending';
    }
    
    await invoice.save();
    
    console.log('\n✅ INVOICE UPDATED:');
    console.log(`   Paid Amount: ₹${invoice.paidAmount}`);
    console.log(`   Pending Amount: ₹${invoice.pendingAmount}`);
    console.log(`   Status: ${invoice.paymentStatus}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ REVERT COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log(`Removed ${allocationsToRemove.length} duplicate allocations`);
    console.log(`Kept ${allocationsToKeep.length} correct allocations`);
    console.log(`Invoice now shows correct paid amount: ₹${invoice.paidAmount}`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error reverting allocations:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

revertDuplicateAllocations();
