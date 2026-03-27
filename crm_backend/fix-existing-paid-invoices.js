/**
 * FIX EXISTING PAID INVOICES
 * 
 * This script fixes invoices that are marked as "Paid" in dealer ledger
 * but still show as "Pending" in the invoice collection
 * 
 * Usage: node fix-existing-paid-invoices.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Voucher from './models/Voucher.js';

async function fixPaidInvoices() {
  try {
    console.log('🚀 Starting fix for existing paid invoices...\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Get all invoices that are not marked as paid
    const pendingInvoices = await DealerInvoice.find({
      paymentStatus: { $ne: 'Paid' },
      isDeleted: { $ne: true },
      isDraft: false
    }).sort({ invoiceDate: 1 });
    
    console.log(`📊 Found ${pendingInvoices.length} invoices not marked as Paid\n`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const invoice of pendingInvoices) {
      console.log(`\n🔍 Checking invoice: ${invoice.invoiceNumber}`);
      console.log(`   Dealer: ${invoice.dealerName}`);
      console.log(`   Total Amount: ₹${invoice.totalAmount}`);
      console.log(`   Current Paid Amount: ₹${invoice.paidAmount || 0}`);
      console.log(`   Current Status: ${invoice.paymentStatus}`);
      
      // Check dealer ledger for this invoice
      const ledgerEntries = await DealerLedger.find({
        dealer: invoice.dealer,
        $or: [
          { 'invoice': invoice._id },
          { referenceNumber: invoice.invoiceNumber },
          { description: { $regex: invoice.invoiceNumber, $options: 'i' } }
        ]
      });
      
      if (ledgerEntries.length > 0) {
        console.log(`   📋 Found ${ledgerEntries.length} ledger entries for this invoice`);
        
        // Calculate total payments from ledger
        let totalPaid = 0;
        for (const entry of ledgerEntries) {
          if (entry.creditAmount > 0) {
            totalPaid += entry.creditAmount;
            console.log(`      - Credit: ₹${entry.creditAmount} (${entry.description})`);
          }
        }
        
        if (totalPaid > 0) {
          // Update invoice
          const oldPaidAmount = invoice.paidAmount || 0;
          const oldStatus = invoice.paymentStatus;
          
          invoice.paidAmount = totalPaid;
          invoice.pendingAmount = invoice.totalAmount - totalPaid;
          
          if (invoice.paidAmount >= invoice.totalAmount) {
            invoice.paymentStatus = 'Paid';
          } else if (invoice.paidAmount > 0) {
            invoice.paymentStatus = 'Partial';
          }
          
          await invoice.save();
          
          console.log(`   ✅ FIXED!`);
          console.log(`      Old: Paid ₹${oldPaidAmount}, Status: ${oldStatus}`);
          console.log(`      New: Paid ₹${invoice.paidAmount}, Status: ${invoice.paymentStatus}`);
          fixedCount++;
        } else {
          console.log(`   ⏭️  Skipped - No credit entries found`);
          skippedCount++;
        }
      } else {
        console.log(`   ⏭️  Skipped - No ledger entries found`);
        skippedCount++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total invoices checked: ${pendingInvoices.length}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log('='.repeat(80));
    
    console.log('\n✅ Fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing paid invoices:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the fix
fixPaidInvoices();
