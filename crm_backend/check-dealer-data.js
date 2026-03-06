/**
 * CHECK DEALER DATA
 * 
 * This script checks what data exists for a specific dealer
 * to understand the payment situation
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Voucher from './models/Voucher.js';
import Dealer from './models/Dealer.js';

async function checkDealerData() {
  try {
    console.log('🔍 Checking dealer data...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    // Find dealer "Kiran Kumar"
    const dealer = await Dealer.findOne({ name: /kiran/i });
    
    if (!dealer) {
      console.log('❌ Dealer not found');
      return;
    }
    
    console.log('👤 DEALER INFO:');
    console.log(`   Name: ${dealer.name}`);
    console.log(`   Code: ${dealer.code}`);
    console.log(`   ID: ${dealer._id}\n`);
    
    // Get invoices
    const invoices = await DealerInvoice.find({
      dealer: dealer._id,
      isDeleted: { $ne: true }
    }).sort({ invoiceDate: -1 });
    
    console.log('📄 INVOICES:');
    for (const inv of invoices) {
      console.log(`   ${inv.invoiceNumber}: ₹${inv.totalAmount} - ${inv.paymentStatus}`);
      console.log(`      Paid: ₹${inv.paidAmount || 0}, Pending: ₹${inv.pendingAmount || inv.totalAmount}`);
    }
    console.log('');
    
    // Get vouchers
    const vouchers = await Voucher.find({
      partyId: dealer._id,
      status: 'Posted'
    }).sort({ voucherDate: -1 }).limit(10);
    
    console.log('🎫 VOUCHERS (Last 10):');
    for (const v of vouchers) {
      console.log(`   ${v.voucherNumber}: ₹${v.totalAmount} (${v.voucherType})`);
      console.log(`      Date: ${v.voucherDate.toLocaleDateString()}`);
      console.log(`      Allocated: ₹${v.allocatedAmount || 0}, Unallocated: ₹${v.unallocatedAmount || v.totalAmount}`);
      console.log(`      Allocation Type: ${v.allocationType || 'OnAccount'}`);
      if (v.allocations && v.allocations.length > 0) {
        console.log(`      Allocations:`);
        for (const alloc of v.allocations) {
          console.log(`         - ${alloc.invoiceNumber}: ₹${alloc.allocatedAmount}`);
        }
      }
    }
    console.log('');
    
    // Get ledger entries
    const ledgerEntries = await DealerLedger.find({
      dealer: dealer._id
    }).sort({ entryDate: -1 }).limit(15);
    
    console.log('📒 LEDGER ENTRIES (Last 15):');
    let balance = 0;
    for (const entry of ledgerEntries.reverse()) {
      console.log(`   ${entry.entryDate.toLocaleDateString()} - ${entry.transactionType}`);
      console.log(`      ${entry.description}`);
      console.log(`      Debit: ₹${entry.debitAmount || 0}, Credit: ₹${entry.creditAmount || 0}`);
      console.log(`      Balance: ₹${entry.runningBalance || 0}`);
      console.log(`      Reference: ${entry.referenceType || 'N/A'} - ${entry.referenceNumber || 'N/A'}`);
    }
    console.log('');
    
    // Summary
    const totalInvoices = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const totalVouchers = vouchers.reduce((sum, v) => sum + v.totalAmount, 0);
    const totalAllocated = vouchers.reduce((sum, v) => sum + (v.allocatedAmount || 0), 0);
    
    console.log('📊 SUMMARY:');
    console.log(`   Total Invoices: ₹${totalInvoices}`);
    console.log(`   Total Paid (in invoices): ₹${totalPaid}`);
    console.log(`   Total Vouchers: ₹${totalVouchers}`);
    console.log(`   Total Allocated (in vouchers): ₹${totalAllocated}`);
    console.log(`   Unallocated Vouchers: ₹${totalVouchers - totalAllocated}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

checkDealerData();
