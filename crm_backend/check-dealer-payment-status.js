import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import DealerLedger from './models/DealerLedger.js';
import DealerInvoice from './models/DealerInvoice.js';
import PaymentAllocation from './models/PaymentAllocation.js';
import Voucher from './models/Voucher.js';

dotenv.config();

const checkDealerPaymentStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find dealer "Kiran Kumar" (DLR1001)
    const dealer = await Dealer.findOne({ 
      $or: [
        { name: /Kiran Kumar/i },
        { dealerCode: 'DLR1001' }
      ]
    });

    if (!dealer) {
      console.log('❌ Dealer "Kiran Kumar" not found');
      process.exit(1);
    }

    console.log('\n📋 DEALER INFORMATION:');
    console.log('='.repeat(80));
    console.log(`Name: ${dealer.name}`);
    console.log(`Code: ${dealer.dealerCode}`);
    console.log(`Credit Limit: ₹${dealer.creditLimit?.toLocaleString() || 0}`);
    console.log(`Credit Days: ${dealer.creditDays || 0}`);

    // Get all ledger entries
    console.log('\n📊 DEALER LEDGER ENTRIES:');
    console.log('='.repeat(80));
    const ledgerEntries = await DealerLedger.find({ dealer: dealer._id })
      .sort({ entryDate: 1 })
      .lean();

    console.log(`Total Ledger Entries: ${ledgerEntries.length}`);
    
    let runningBalance = 0;
    ledgerEntries.forEach((entry, index) => {
      runningBalance += (entry.debitAmount || 0) - (entry.creditAmount || 0);
      console.log(`\n${index + 1}. ${entry.transactionType} - ${new Date(entry.entryDate).toLocaleDateString()}`);
      console.log(`   Invoice: ${entry.invoiceNumber || 'N/A'}`);
      console.log(`   Debit: ₹${(entry.debitAmount || 0).toLocaleString()}`);
      console.log(`   Credit: ₹${(entry.creditAmount || 0).toLocaleString()}`);
      console.log(`   Calculated Running Balance: ₹${runningBalance.toLocaleString()}`);
      console.log(`   Stored Running Balance: ₹${(entry.runningBalance || 0).toLocaleString()}`);
      console.log(`   Due Date: ${entry.dueDate ? new Date(entry.dueDate).toLocaleDateString() : 'N/A'}`);
      
      if (Math.abs(runningBalance - (entry.runningBalance || 0)) > 0.01) {
        console.log(`   ⚠️  MISMATCH: Calculated vs Stored running balance!`);
      }
    });

    // Calculate current outstanding from ledger
    const currentOutstanding = ledgerEntries.reduce((sum, entry) => {
      return sum + (entry.debitAmount || 0) - (entry.creditAmount || 0);
    }, 0);

    console.log('\n💰 LEDGER-BASED CALCULATION:');
    console.log('='.repeat(80));
    console.log(`Current Outstanding: ₹${currentOutstanding.toLocaleString()}`);
    console.log(`Available Credit: ₹${Math.max(0, dealer.creditLimit - currentOutstanding).toLocaleString()}`);

    // Calculate overdue amount
    const today = new Date();
    let overdueAmount = 0;
    
    for (const entry of ledgerEntries) {
      if (entry.dueDate && entry.runningBalance > 0) {
        const dueDate = new Date(entry.dueDate);
        if (today > dueDate) {
          overdueAmount += entry.runningBalance;
        }
      }
    }

    console.log(`Overdue Amount: ₹${overdueAmount.toLocaleString()}`);

    // Get all invoices
    console.log('\n📄 DEALER INVOICES:');
    console.log('='.repeat(80));
    const invoices = await DealerInvoice.find({ 
      dealerId: dealer._id,
      isDeleted: false
    }).sort({ invoiceDate: 1 }).lean();

    console.log(`Total Invoices: ${invoices.length}`);
    
    let totalInvoiceAmount = 0;
    let totalPaidAmount = 0;
    let totalPendingAmount = 0;

    invoices.forEach((invoice, index) => {
      totalInvoiceAmount += invoice.totalAmount || 0;
      totalPaidAmount += invoice.paidAmount || 0;
      totalPendingAmount += invoice.pendingAmount || 0;

      console.log(`\n${index + 1}. ${invoice.invoiceNumber} - ${new Date(invoice.invoiceDate).toLocaleDateString()}`);
      console.log(`   Total: ₹${(invoice.totalAmount || 0).toLocaleString()}`);
      console.log(`   Paid: ₹${(invoice.paidAmount || 0).toLocaleString()}`);
      console.log(`   Pending: ₹${(invoice.pendingAmount || 0).toLocaleString()}`);
      console.log(`   Status: ${invoice.paymentStatus}`);
    });

    console.log('\n💰 INVOICE-BASED CALCULATION:');
    console.log('='.repeat(80));
    console.log(`Total Invoice Amount: ₹${totalInvoiceAmount.toLocaleString()}`);
    console.log(`Total Paid Amount: ₹${totalPaidAmount.toLocaleString()}`);
    console.log(`Total Pending Amount: ₹${totalPendingAmount.toLocaleString()}`);

    // Get all payment allocations
    console.log('\n💳 PAYMENT ALLOCATIONS:');
    console.log('='.repeat(80));
    const allocations = await PaymentAllocation.find({ 
      partyId: dealer._id 
    }).sort({ allocationDate: 1 }).lean();

    console.log(`Total Payment Allocations: ${allocations.length}`);
    
    let totalAllocated = 0;
    allocations.forEach((allocation, index) => {
      totalAllocated += allocation.totalAllocated || 0;
      console.log(`\n${index + 1}. ${allocation.allocationNumber} - ${new Date(allocation.allocationDate).toLocaleDateString()}`);
      console.log(`   Voucher: ${allocation.voucherNumber}`);
      console.log(`   Amount: ₹${(allocation.totalAllocated || 0).toLocaleString()}`);
      console.log(`   Allocations: ${allocation.allocations.length} invoices`);
      allocation.allocations.forEach(alloc => {
        console.log(`      - ${alloc.invoiceNumber}: ₹${alloc.allocatedAmount.toLocaleString()}`);
      });
    });

    console.log(`\nTotal Allocated: ₹${totalAllocated.toLocaleString()}`);

    // Get all vouchers
    console.log('\n🧾 VOUCHERS:');
    console.log('='.repeat(80));
    const vouchers = await Voucher.find({ 
      partyId: dealer._id 
    }).sort({ voucherDate: 1 }).lean();

    console.log(`Total Vouchers: ${vouchers.length}`);
    
    let totalVoucherAmount = 0;
    vouchers.forEach((voucher, index) => {
      totalVoucherAmount += voucher.amount || 0;
      console.log(`\n${index + 1}. ${voucher.voucherNumber} - ${new Date(voucher.voucherDate).toLocaleDateString()}`);
      console.log(`   Type: ${voucher.voucherType}`);
      console.log(`   Amount: ₹${(voucher.amount || 0).toLocaleString()}`);
      console.log(`   Payment Method: ${voucher.paymentMethod}`);
      console.log(`   Status: ${voucher.status}`);
    });

    console.log(`\nTotal Voucher Amount: ₹${totalVoucherAmount.toLocaleString()}`);

    // COMPARISON
    console.log('\n🔍 COMPARISON & ANALYSIS:');
    console.log('='.repeat(80));
    console.log(`Ledger Outstanding: ₹${currentOutstanding.toLocaleString()}`);
    console.log(`Invoice Pending: ₹${totalPendingAmount.toLocaleString()}`);
    console.log(`Difference: ₹${(currentOutstanding - totalPendingAmount).toLocaleString()}`);
    console.log('');
    console.log(`Total Invoices: ₹${totalInvoiceAmount.toLocaleString()}`);
    console.log(`Total Payments (Allocations): ₹${totalAllocated.toLocaleString()}`);
    console.log(`Total Payments (Vouchers): ₹${totalVoucherAmount.toLocaleString()}`);
    console.log(`Expected Outstanding: ₹${(totalInvoiceAmount - totalAllocated).toLocaleString()}`);

    // ISSUE DETECTION
    console.log('\n⚠️ ISSUE DETECTION:');
    console.log('='.repeat(80));
    
    if (Math.abs(currentOutstanding - totalPendingAmount) > 1) {
      console.log('❌ MISMATCH: Ledger outstanding does not match invoice pending amount');
      console.log('   This means ledger entries are not in sync with invoices/payments');
    }

    if (totalAllocated !== totalVoucherAmount) {
      console.log('❌ MISMATCH: Payment allocations do not match voucher amounts');
      console.log('   This means some payments are not properly allocated');
    }

    if (totalAllocated > 0 && currentOutstanding === totalInvoiceAmount) {
      console.log('❌ PROBLEM FOUND: Payments were made but ledger was not updated');
      console.log('   Ledger entries for payments are missing!');
    }

    // RECOMMENDATIONS
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('='.repeat(80));
    
    if (allocations.length > 0 && ledgerEntries.filter(e => e.transactionType === 'Payment').length === 0) {
      console.log('1. Create ledger entries for all payment allocations');
      console.log('2. Update dealer outstanding calculation to include payment allocations');
      console.log('3. Sync ledger with payment allocation system');
    }

    console.log('\n✅ Analysis Complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkDealerPaymentStatus();
