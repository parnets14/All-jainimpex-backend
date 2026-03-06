/**
 * SYNC INVOICE PAYMENTS FROM VOUCHER ALLOCATIONS
 * 
 * This script syncs invoice payment status based on voucher allocations
 * Fixes invoices where vouchers show allocations but invoice paidAmount is not updated
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerInvoice from './models/DealerInvoice.js';
import Voucher from './models/Voucher.js';

async function syncInvoicePayments() {
  try {
    console.log('🔄 Syncing invoice payments from voucher allocations...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    // Get all invoices
    const invoices = await DealerInvoice.find({
      isDeleted: { $ne: true },
      isDraft: false
    }).sort({ invoiceDate: 1 });
    
    console.log(`📊 Found ${invoices.length} invoices to check\n`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const invoice of invoices) {
      try {
        console.log(`\n🔍 Checking: ${invoice.invoiceNumber}`);
        console.log(`   Dealer: ${invoice.dealerName}`);
        console.log(`   Total: ₹${invoice.totalAmount}`);
        console.log(`   Current Paid: ₹${invoice.paidAmount || 0}`);
        console.log(`   Current Status: ${invoice.paymentStatus}`);
        
        // Find all vouchers with allocations to this invoice
        const vouchers = await Voucher.find({
          'allocations.invoiceId': invoice._id,
          status: 'Posted'
        });
        
        if (vouchers.length === 0) {
          console.log(`   ⏭️  No voucher allocations found`);
          skippedCount++;
          continue;
        }
        
        console.log(`   📋 Found ${vouchers.length} vouchers with allocations`);
        
        // Calculate total allocated from vouchers
        let totalAllocated = 0;
        const allocationDetails = [];
        
        for (const voucher of vouchers) {
          for (const allocation of voucher.allocations) {
            if (allocation.invoiceId.toString() === invoice._id.toString()) {
              totalAllocated += allocation.allocatedAmount;
              allocationDetails.push({
                voucherNumber: voucher.voucherNumber,
                amount: allocation.allocatedAmount,
                date: voucher.voucherDate
              });
              console.log(`      - ${voucher.voucherNumber}: ₹${allocation.allocatedAmount}`);
            }
          }
        }
        
        console.log(`   💰 Total Allocated: ₹${totalAllocated}`);
        
        // Check if update is needed
        const currentPaid = invoice.paidAmount || 0;
        if (Math.abs(currentPaid - totalAllocated) < 0.01) {
          console.log(`   ✅ Already in sync`);
          skippedCount++;
          continue;
        }
        
        // Update invoice
        const oldPaidAmount = invoice.paidAmount || 0;
        const oldStatus = invoice.paymentStatus;
        
        invoice.paidAmount = totalAllocated;
        invoice.pendingAmount = invoice.totalAmount - totalAllocated;
        
        if (invoice.paidAmount >= invoice.totalAmount) {
          invoice.paymentStatus = 'Paid';
        } else if (invoice.paidAmount > 0) {
          invoice.paymentStatus = 'Partial';
        } else {
          invoice.paymentStatus = 'Pending';
        }
        
        await invoice.save();
        
        console.log(`   ✅ FIXED!`);
        console.log(`      Old: Paid ₹${oldPaidAmount}, Status: ${oldStatus}`);
        console.log(`      New: Paid ₹${invoice.paidAmount}, Status: ${invoice.paymentStatus}`);
        console.log(`      Pending: ₹${invoice.pendingAmount}`);
        
        fixedCount++;
        
      } catch (error) {
        console.error(`   ❌ Error processing ${invoice.invoiceNumber}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total invoices checked: ${invoices.length}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Already in sync: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('='.repeat(80));
    
    console.log('\n✅ Sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Error syncing invoice payments:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

syncInvoicePayments();
