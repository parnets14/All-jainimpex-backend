/**
 * DEBUG PAYMENT ALLOCATION MISMATCH
 * 
 * This script checks why ledger shows "Paid" but payment allocation shows "No outstanding invoices"
 * Compares data between DealerLedger, Voucher, DealerInvoice, and PaymentAllocation
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Voucher from './models/Voucher.js';
import PaymentAllocation from './models/PaymentAllocation.js';
import Dealer from './models/Dealer.js';

async function debugMismatch() {
  try {
    console.log('🔍 DEBUGGING PAYMENT ALLOCATION MISMATCH\n');
    console.log('='.repeat(80));
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Find Kiran Kumar dealer
    const dealer = await Dealer.findOne({ name: /kiran/i });
    
    if (!dealer) {
      console.log('❌ Dealer not found');
      return;
    }
    
    console.log('👤 DEALER: ' + dealer.name);
    console.log('   ID: ' + dealer._id);
    console.log('='.repeat(80) + '\n');
    
    // ========================================================================
    // 1. CHECK INVOICES
    // ========================================================================
    console.log('📄 STEP 1: CHECKING INVOICES');
    console.log('-'.repeat(80));
    
    const allInvoices = await DealerInvoice.find({
      dealer: dealer._id,
      isDeleted: { $ne: true }
    }).sort({ invoiceDate: -1 });
    
    console.log(`Total Invoices: ${allInvoices.length}\n`);
    
    for (const inv of allInvoices) {
      console.log(`Invoice: ${inv.invoiceNumber}`);
      console.log(`  Status: ${inv.status}`);
      console.log(`  Draft: ${inv.isDraft}`);
      console.log(`  Total: ₹${inv.totalAmount}`);
      console.log(`  Paid: ₹${inv.paidAmount || 0}`);
      console.log(`  Pending: ₹${inv.pendingAmount || (inv.totalAmount - (inv.paidAmount || 0))}`);
      console.log(`  Payment Status: ${inv.paymentStatus}`);
      console.log('');
    }
    
    // Check outstanding invoices query
    const outstandingInvoices = await DealerInvoice.find({
      dealer: dealer._id,
      status: 'Approved',
      isDeleted: { $ne: true },
      paymentStatus: { $ne: 'Paid' },
      $or: [
        { pendingAmount: { $gt: 0 } },
        { $and: [{ pendingAmount: { $exists: false } }, { totalAmount: { $gt: 0 } }] }
      ]
    }).sort({ invoiceDate: 1 });
    
    console.log('🔍 OUTSTANDING INVOICES QUERY RESULT:');
    console.log(`   Found: ${outstandingInvoices.length} invoices`);
    if (outstandingInvoices.length > 0) {
      for (const inv of outstandingInvoices) {
        console.log(`   - ${inv.invoiceNumber}: ₹${inv.pendingAmount || inv.totalAmount}`);
      }
    } else {
      console.log('   ❌ No outstanding invoices found (this is why payment allocation shows empty!)');
    }
    console.log('');
    
    // ========================================================================
    // 2. CHECK VOUCHERS
    // ========================================================================
    console.log('🎫 STEP 2: CHECKING VOUCHERS');
    console.log('-'.repeat(80));
    
    const vouchers = await Voucher.find({
      partyId: dealer._id,
      status: 'Posted'
    }).sort({ voucherDate: -1 }).limit(10);
    
    console.log(`Total Vouchers (last 10): ${vouchers.length}\n`);
    
    for (const v of vouchers) {
      const allocatedAmt = v.allocatedAmount || 0;
      const unallocatedAmt = v.unallocatedAmount !== undefined 
        ? v.unallocatedAmount 
        : v.totalAmount - allocatedAmt;
      
      console.log(`Voucher: ${v.voucherNumber}`);
      console.log(`  Date: ${v.voucherDate.toLocaleDateString()}`);
      console.log(`  Mode: ${v.transactionMode}`);
      console.log(`  Total: ₹${v.totalAmount}`);
      console.log(`  Allocated: ₹${allocatedAmt}`);
      console.log(`  Unallocated: ₹${unallocatedAmt}`);
      console.log(`  Allocation Type: ${v.allocationType || 'OnAccount'}`);
      
      if (v.allocations && v.allocations.length > 0) {
        console.log(`  Allocations:`);
        for (const alloc of v.allocations) {
          console.log(`    - ${alloc.invoiceNumber}: ₹${alloc.allocatedAmount}`);
        }
      }
      console.log('');
    }
    
    // Check unadjusted payments query
    const unadjustedVouchers = vouchers
      .map(v => {
        const allocatedAmt = v.allocatedAmount || 0;
        const unallocatedAmt = v.unallocatedAmount !== undefined 
          ? v.unallocatedAmount 
          : v.totalAmount - allocatedAmt;
        return { voucher: v, unallocatedAmt };
      })
      .filter(v => v.unallocatedAmt > 0);
    
    console.log('🔍 UNADJUSTED PAYMENTS QUERY RESULT:');
    console.log(`   Found: ${unadjustedVouchers.length} vouchers with unallocated amount`);
    for (const { voucher, unallocatedAmt } of unadjustedVouchers) {
      console.log(`   - ${voucher.voucherNumber}: ₹${unallocatedAmt} unallocated`);
    }
    console.log('');
    
    // ========================================================================
    // 3. CHECK LEDGER ENTRIES
    // ========================================================================
    console.log('📒 STEP 3: CHECKING LEDGER ENTRIES');
    console.log('-'.repeat(80));
    
    const ledgerEntries = await DealerLedger.find({
      dealer: dealer._id
    }).sort({ entryDate: -1 }).limit(10);
    
    console.log(`Total Ledger Entries (last 10): ${ledgerEntries.length}\n`);
    
    for (const entry of ledgerEntries) {
      console.log(`Date: ${entry.entryDate.toLocaleDateString()}`);
      console.log(`  Type: ${entry.transactionType}`);
      console.log(`  Description: ${entry.description}`);
      console.log(`  Debit: ₹${entry.debitAmount || 0}`);
      console.log(`  Credit: ₹${entry.creditAmount || 0}`);
      console.log(`  Balance: ₹${entry.runningBalance || 0}`);
      console.log(`  Reference: ${entry.referenceType || 'N/A'} - ${entry.referenceNumber || 'N/A'}`);
      console.log('');
    }
    
    // ========================================================================
    // 4. CHECK PAYMENT ALLOCATIONS
    // ========================================================================
    console.log('💰 STEP 4: CHECKING PAYMENT ALLOCATIONS');
    console.log('-'.repeat(80));
    
    const paymentAllocations = await PaymentAllocation.find({
      partyId: dealer._id
    }).sort({ allocationDate: -1 }).limit(10);
    
    console.log(`Total Payment Allocations (last 10): ${paymentAllocations.length}\n`);
    
    for (const pa of paymentAllocations) {
      console.log(`Allocation: ${pa.allocationNumber}`);
      console.log(`  Date: ${pa.allocationDate.toLocaleDateString()}`);
      console.log(`  Voucher: ${pa.voucherNumber}`);
      console.log(`  Total Allocated: ₹${pa.totalAllocated}`);
      console.log(`  Allocations:`);
      for (const alloc of pa.allocations) {
        console.log(`    - ${alloc.invoiceNumber}: ₹${alloc.allocatedAmount} (${alloc.paymentStatus})`);
      }
      console.log('');
    }
    
    // ========================================================================
    // 5. ANALYSIS
    // ========================================================================
    console.log('='.repeat(80));
    console.log('📊 ANALYSIS');
    console.log('='.repeat(80) + '\n');
    
    // Calculate totals
    const totalInvoiceAmount = allInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaidAmount = allInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    const totalPendingAmount = allInvoices.reduce((sum, inv) => sum + (inv.pendingAmount || (inv.totalAmount - (inv.paidAmount || 0))), 0);
    
    const totalVoucherAmount = vouchers.reduce((sum, v) => sum + v.totalAmount, 0);
    const totalAllocatedInVouchers = vouchers.reduce((sum, v) => sum + (v.allocatedAmount || 0), 0);
    const totalUnallocatedInVouchers = vouchers.reduce((sum, v) => {
      const allocatedAmt = v.allocatedAmount || 0;
      const unallocatedAmt = v.unallocatedAmount !== undefined 
        ? v.unallocatedAmount 
        : v.totalAmount - allocatedAmt;
      return sum + unallocatedAmt;
    }, 0);
    
    const totalCreditInLedger = ledgerEntries.reduce((sum, e) => sum + (e.creditAmount || 0), 0);
    const totalDebitInLedger = ledgerEntries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
    
    console.log('INVOICES:');
    console.log(`  Total Invoice Amount: ₹${totalInvoiceAmount.toFixed(2)}`);
    console.log(`  Total Paid Amount: ₹${totalPaidAmount.toFixed(2)}`);
    console.log(`  Total Pending Amount: ₹${totalPendingAmount.toFixed(2)}`);
    console.log(`  Invoices with status "Paid": ${allInvoices.filter(i => i.paymentStatus === 'Paid').length}`);
    console.log(`  Invoices with status "Partial": ${allInvoices.filter(i => i.paymentStatus === 'Partial').length}`);
    console.log(`  Invoices with status "Pending": ${allInvoices.filter(i => i.paymentStatus === 'Pending').length}`);
    console.log('');
    
    console.log('VOUCHERS:');
    console.log(`  Total Voucher Amount: ₹${totalVoucherAmount.toFixed(2)}`);
    console.log(`  Total Allocated: ₹${totalAllocatedInVouchers.toFixed(2)}`);
    console.log(`  Total Unallocated: ₹${totalUnallocatedInVouchers.toFixed(2)}`);
    console.log('');
    
    console.log('LEDGER:');
    console.log(`  Total Credits (Payments): ₹${totalCreditInLedger.toFixed(2)}`);
    console.log(`  Total Debits (Sales): ₹${totalDebitInLedger.toFixed(2)}`);
    console.log(`  Net Balance: ₹${(totalDebitInLedger - totalCreditInLedger).toFixed(2)}`);
    console.log('');
    
    console.log('PAYMENT ALLOCATIONS:');
    console.log(`  Total Allocation Records: ${paymentAllocations.length}`);
    console.log('');
    
    // ========================================================================
    // 6. IDENTIFY ISSUES
    // ========================================================================
    console.log('='.repeat(80));
    console.log('⚠️  ISSUES IDENTIFIED');
    console.log('='.repeat(80) + '\n');
    
    let issueCount = 0;
    
    // Issue 1: Invoices marked as Paid but showing in ledger
    const paidInvoices = allInvoices.filter(i => i.paymentStatus === 'Paid');
    if (paidInvoices.length > 0 && outstandingInvoices.length === 0) {
      issueCount++;
      console.log(`${issueCount}. ✅ CORRECT: All invoices marked as Paid, no outstanding invoices`);
      console.log('   This is why payment allocation shows "No outstanding invoices"');
      console.log('');
    }
    
    // Issue 2: Vouchers with unallocated amount
    if (totalUnallocatedInVouchers > 0) {
      issueCount++;
      console.log(`${issueCount}. ℹ️  INFO: Vouchers have ₹${totalUnallocatedInVouchers.toFixed(2)} unallocated`);
      console.log('   This is advance payment that can be used for future invoices');
      console.log('');
    }
    
    // Issue 3: Mismatch between paid amount and allocated amount
    if (Math.abs(totalPaidAmount - totalAllocatedInVouchers) > 0.01) {
      issueCount++;
      console.log(`${issueCount}. ⚠️  MISMATCH: Invoice paid amount (₹${totalPaidAmount.toFixed(2)}) != Voucher allocated amount (₹${totalAllocatedInVouchers.toFixed(2)})`);
      console.log(`   Difference: ₹${Math.abs(totalPaidAmount - totalAllocatedInVouchers).toFixed(2)}`);
      console.log('');
    }
    
    // Issue 4: Ledger balance vs invoice pending
    const expectedBalance = totalDebitInLedger - totalCreditInLedger;
    if (Math.abs(expectedBalance - totalPendingAmount) > 0.01) {
      issueCount++;
      console.log(`${issueCount}. ⚠️  MISMATCH: Ledger balance (₹${expectedBalance.toFixed(2)}) != Invoice pending (₹${totalPendingAmount.toFixed(2)})`);
      console.log(`   Difference: ₹${Math.abs(expectedBalance - totalPendingAmount).toFixed(2)}`);
      console.log('');
    }
    
    if (issueCount === 0) {
      console.log('✅ No issues found! System is in sync.');
    }
    
    console.log('='.repeat(80));
    console.log('✅ DEBUG COMPLETED');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

debugMismatch();
