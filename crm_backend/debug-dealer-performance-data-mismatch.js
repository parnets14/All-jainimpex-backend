import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Models
import Dealer from './models/Dealer.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import DealerPayment from './models/DealerPayment.js';
import DealerPerformance from './models/DealerPerformance.js';
import CreditNote from './models/CreditNote.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

async function debugDealerPerformanceDataMismatch() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    console.log('\n🔍 DEALER PERFORMANCE DATA MISMATCH ANALYSIS');
    console.log('='.repeat(60));

    // Get all dealers
    const dealers = await Dealer.find({ isActive: true }).limit(5); // Limit to first 5 for detailed analysis
    console.log(`\n📊 Analyzing ${dealers.length} dealers for data consistency...\n`);

    for (const dealer of dealers) {
      console.log(`\n🏪 DEALER: ${dealer.name} (${dealer.code})`);
      console.log('-'.repeat(50));

      // 1. Get dealer performance data
      const performanceData = await DealerPerformance.findOne({ 
        dealer: dealer._id,
        period: 'Monthly'
      }).sort({ performanceDate: -1 });

      console.log('\n📈 PERFORMANCE DATA:');
      if (performanceData) {
        console.log(`  Sales: ₹${performanceData.sales?.toLocaleString() || 0}`);
        console.log(`  Paid: ₹${performanceData.paid?.toLocaleString() || 0}`);
        console.log(`  Outstanding: ₹${performanceData.outstanding?.toLocaleString() || 0}`);
        console.log(`  Growth: ${performanceData.growthPercentage || 0}%`);
        console.log(`  Products Count: ${performanceData.products?.length || 0}`);
        console.log(`  Total Profit: ₹${performanceData.totalProfit?.toLocaleString() || 0}`);
        console.log(`  Avg Discount: ${performanceData.averageDiscountAvailed || 0}%`);
      } else {
        console.log('  ❌ No performance data found');
      }

      // 2. Get actual invoice data
      const invoices = await DealerInvoice.find({ 
        dealer: dealer._id,
        invoiceDate: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          $lte: new Date()
        }
      });

      const actualSales = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const actualDiscount = invoices.reduce((sum, inv) => sum + (inv.totalDiscount || 0), 0);
      const actualDiscountPercentage = actualSales > 0 ? (actualDiscount / actualSales) * 100 : 0;

      console.log('\n💰 ACTUAL INVOICE DATA (Current Month):');
      console.log(`  Total Invoices: ${invoices.length}`);
      console.log(`  Actual Sales: ₹${actualSales.toLocaleString()}`);
      console.log(`  Actual Discount: ₹${actualDiscount.toLocaleString()}`);
      console.log(`  Actual Discount %: ${actualDiscountPercentage.toFixed(2)}%`);

      // 3. Get ledger data
      const ledgerEntries = await DealerLedger.find({ 
        dealer: dealer._id 
      }).sort({ entryDate: 1 });

      const ledgerSummary = {
        totalDebit: ledgerEntries.reduce((sum, entry) => sum + (entry.debitAmount || 0), 0),
        totalCredit: ledgerEntries.reduce((sum, entry) => sum + (entry.creditAmount || 0), 0),
        currentBalance: ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : 0,
        invoiceEntries: ledgerEntries.filter(e => e.transactionType === 'Invoice').length,
        paymentEntries: ledgerEntries.filter(e => e.transactionType === 'Payment').length
      };

      console.log('\n📚 LEDGER DATA:');
      console.log(`  Total Debit: ₹${ledgerSummary.totalDebit.toLocaleString()}`);
      console.log(`  Total Credit: ₹${ledgerSummary.totalCredit.toLocaleString()}`);
      console.log(`  Current Balance: ₹${ledgerSummary.currentBalance.toLocaleString()}`);
      console.log(`  Invoice Entries: ${ledgerSummary.invoiceEntries}`);
      console.log(`  Payment Entries: ${ledgerSummary.paymentEntries}`);

      // 4. Get payment data
      const payments = await DealerPayment.find({ dealer: dealer._id });
      const totalPayments = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

      console.log('\n💳 PAYMENT DATA:');
      console.log(`  Total Payments: ${payments.length}`);
      console.log(`  Total Payment Amount: ₹${totalPayments.toLocaleString()}`);

      // 5. Get credit notes
      const creditNotes = await CreditNote.find({ dealer: dealer._id });
      const totalCreditAmount = creditNotes.reduce((sum, cn) => sum + (cn.creditAmount || 0), 0);

      console.log('\n📝 CREDIT NOTES:');
      console.log(`  Total Credit Notes: ${creditNotes.length}`);
      console.log(`  Total Credit Amount: ₹${totalCreditAmount.toLocaleString()}`);

      // 6. Data consistency analysis
      console.log('\n🔍 DATA CONSISTENCY ANALYSIS:');
      
      // Sales comparison
      const salesMismatch = performanceData ? Math.abs(performanceData.sales - actualSales) : actualSales;
      console.log(`  Sales Mismatch: ₹${salesMismatch.toLocaleString()} ${salesMismatch > 1000 ? '❌' : '✅'}`);
      
      // Outstanding calculation comparison
      const calculatedOutstanding = ledgerSummary.currentBalance;
      const performanceOutstanding = performanceData?.outstanding || 0;
      const outstandingMismatch = Math.abs(calculatedOutstanding - performanceOutstanding);
      console.log(`  Outstanding Mismatch: ₹${outstandingMismatch.toLocaleString()} ${outstandingMismatch > 1000 ? '❌' : '✅'}`);
      
      // Paid amount comparison
      const calculatedPaid = ledgerSummary.totalCredit;
      const performancePaid = performanceData?.paid || 0;
      const paidMismatch = Math.abs(calculatedPaid - performancePaid);
      console.log(`  Paid Amount Mismatch: ₹${paidMismatch.toLocaleString()} ${paidMismatch > 1000 ? '❌' : '✅'}`);

      // Discount percentage comparison
      const discountMismatch = Math.abs(actualDiscountPercentage - (performanceData?.averageDiscountAvailed || 0));
      console.log(`  Discount % Mismatch: ${discountMismatch.toFixed(2)}% ${discountMismatch > 5 ? '❌' : '✅'}`);

      // 7. Identify potential issues
      console.log('\n⚠️  POTENTIAL ISSUES:');
      const issues = [];

      if (salesMismatch > 1000) {
        issues.push(`Sales data mismatch: Performance shows ₹${performanceData?.sales?.toLocaleString() || 0}, but actual invoices total ₹${actualSales.toLocaleString()}`);
      }

      if (outstandingMismatch > 1000) {
        issues.push(`Outstanding calculation mismatch: Ledger shows ₹${calculatedOutstanding.toLocaleString()}, but performance shows ₹${performanceOutstanding.toLocaleString()}`);
      }

      if (paidMismatch > 1000) {
        issues.push(`Paid amount mismatch: Ledger credits total ₹${calculatedPaid.toLocaleString()}, but performance shows ₹${performancePaid.toLocaleString()}`);
      }

      if (discountMismatch > 5) {
        issues.push(`Discount percentage mismatch: Actual is ${actualDiscountPercentage.toFixed(2)}%, but performance shows ${performanceData?.averageDiscountAvailed || 0}%`);
      }

      if (invoices.length !== ledgerSummary.invoiceEntries) {
        issues.push(`Invoice count mismatch: ${invoices.length} invoices but ${ledgerSummary.invoiceEntries} ledger entries`);
      }

      if (issues.length === 0) {
        console.log('  ✅ No major data inconsistencies found');
      } else {
        issues.forEach((issue, index) => {
          console.log(`  ${index + 1}. ${issue}`);
        });
      }

      // 8. Recommendations
      if (issues.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('  1. Regenerate dealer performance data from actual invoices and payments');
        console.log('  2. Sync ledger entries with invoices and credit notes');
        console.log('  3. Verify payment recording in both payment and ledger systems');
        console.log('  4. Check date ranges used in performance calculations');
        console.log('  5. Ensure all invoice statuses are properly updated');
      }
    }

    // Summary of system-wide issues
    console.log('\n\n🔍 SYSTEM-WIDE ANALYSIS');
    console.log('='.repeat(60));

    const totalPerformanceRecords = await DealerPerformance.countDocuments();
    const totalDealers = await Dealer.countDocuments({ isActive: true });
    const totalInvoices = await DealerInvoice.countDocuments();
    const totalLedgerEntries = await DealerLedger.countDocuments();
    const totalPayments = await DealerPayment.countDocuments();

    console.log(`\n📊 SYSTEM OVERVIEW:`);
    console.log(`  Total Active Dealers: ${totalDealers}`);
    console.log(`  Performance Records: ${totalPerformanceRecords}`);
    console.log(`  Total Invoices: ${totalInvoices}`);
    console.log(`  Total Ledger Entries: ${totalLedgerEntries}`);
    console.log(`  Total Payments: ${totalPayments}`);

    // Check for missing performance data
    const dealersWithoutPerformance = totalDealers - totalPerformanceRecords;
    if (dealersWithoutPerformance > 0) {
      console.log(`\n⚠️  ${dealersWithoutPerformance} dealers missing performance data`);
    }

    // Check for orphaned records
    const invoicesWithoutLedger = await DealerInvoice.aggregate([
      {
        $lookup: {
          from: 'dealerledgers',
          localField: '_id',
          foreignField: 'invoice',
          as: 'ledgerEntry'
        }
      },
      {
        $match: {
          ledgerEntry: { $size: 0 }
        }
      },
      {
        $count: 'count'
      }
    ]);

    const orphanedInvoices = invoicesWithoutLedger[0]?.count || 0;
    if (orphanedInvoices > 0) {
      console.log(`\n⚠️  ${orphanedInvoices} invoices without ledger entries`);
    }

    console.log('\n✅ Analysis complete!');
    console.log('\nNext steps:');
    console.log('1. Run the dealer performance regeneration script');
    console.log('2. Sync ledger entries for missing invoices');
    console.log('3. Verify payment recording consistency');
    console.log('4. Update frontend to use consistent data sources');

  } catch (error) {
    console.error('Error in dealer performance analysis:', error);
  } finally {
    await mongoose.disconnect();
  }
}

debugDealerPerformanceDataMismatch();