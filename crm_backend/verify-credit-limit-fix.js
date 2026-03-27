// Verification script to check if credit limit double blocking is fixed
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function verifyCreditLimitFix() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════');
    console.log('   CREDIT LIMIT FIX VERIFICATION        ');
    console.log('═══════════════════════════════════════\n');

    // Find orders with invoices
    const orders = await SalesOrder.find({
      status: { $in: ["Confirmed", "Processing", "Delivered"] }
    }).limit(20); // Check first 20 orders

    console.log(`📋 Checking ${orders.length} orders...\n`);

    let correctCount = 0;
    let doubleBlockedCount = 0;
    let noInvoiceCount = 0;

    for (const order of orders) {
      const invoice = await DealerInvoice.findOne({ 
        salesOrder: order._id,
        status: { $ne: 'Draft' }
      });

      if (!invoice) {
        noInvoiceCount++;
        continue;
      }

      // Get all ledger entries for this order/invoice
      const orderLedger = await DealerLedger.findOne({
        dealer: order.dealer,
        transactionType: "Order Confirmed",
        description: { $regex: order.orderNumber }
      });

      const reversalLedger = await DealerLedger.findOne({
        dealer: order.dealer,
        transactionType: "Order Confirmed - Reversed",
        description: { $regex: order.orderNumber }
      });

      const invoiceLedger = await DealerLedger.findOne({
        dealer: order.dealer,
        transactionType: "Invoice",
        invoiceNumber: invoice.invoiceNumber
      });

      // Calculate net blocking
      let netBlocked = 0;
      if (orderLedger) netBlocked += orderLedger.debitAmount;
      if (reversalLedger) netBlocked -= reversalLedger.creditAmount;
      if (invoiceLedger) netBlocked += invoiceLedger.debitAmount;

      const expectedBlocked = invoice.totalAmount;
      const isCorrect = Math.abs(netBlocked - expectedBlocked) < 1;

      if (isCorrect) {
        console.log(`✅ ${order.orderNumber} → ${invoice.invoiceNumber}`);
        console.log(`   Net Blocked: ₹${netBlocked.toLocaleString()} (Expected: ₹${expectedBlocked.toLocaleString()})`);
        if (reversalLedger) {
          console.log(`   ✓ Has reversal entry`);
        }
        correctCount++;
      } else {
        console.log(`❌ ${order.orderNumber} → ${invoice.invoiceNumber}`);
        console.log(`   Net Blocked: ₹${netBlocked.toLocaleString()} (Expected: ₹${expectedBlocked.toLocaleString()})`);
        console.log(`   Difference: ₹${(netBlocked - expectedBlocked).toLocaleString()}`);
        if (!reversalLedger && orderLedger) {
          console.log(`   ⚠️  Missing reversal entry - DOUBLE BLOCKED!`);
        }
        doubleBlockedCount++;
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════');
    console.log('              RESULTS                   ');
    console.log('═══════════════════════════════════════');
    console.log(`Total Orders Checked: ${orders.length}`);
    console.log(`✅ Correct: ${correctCount}`);
    console.log(`❌ Double Blocked: ${doubleBlockedCount}`);
    console.log(`ℹ️  No Invoice: ${noInvoiceCount}`);
    console.log('═══════════════════════════════════════\n');

    if (doubleBlockedCount > 0) {
      console.log('⚠️  WARNING: Found double-blocked orders!');
      console.log('📝 Action Required: Run fix-double-credit-blocking.js\n');
    } else if (correctCount > 0) {
      console.log('🎉 All checked orders are correct!');
      console.log('✅ Credit limit fix is working properly\n');
    }

    // Check specific orders mentioned in the issue
    console.log('═══════════════════════════════════════');
    console.log('   CHECKING SPECIFIC ORDERS (37, 38)   ');
    console.log('═══════════════════════════════════════\n');

    const specificOrders = await SalesOrder.find({
      orderNumber: { $in: ['SO-2026-0037', 'SO-2026-0038'] }
    });

    for (const order of specificOrders) {
      console.log(`\n🔍 Order: ${order.orderNumber}`);
      console.log(`   Dealer: ${order.dealerName}`);
      console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Status: ${order.status}`);

      const invoice = await DealerInvoice.findOne({ salesOrder: order._id });
      if (invoice) {
        console.log(`   Invoice: ${invoice.invoiceNumber || 'Draft'}`);
        console.log(`   Invoice Status: ${invoice.status}`);
      } else {
        console.log(`   Invoice: Not found`);
      }

      // Get ledger entries
      const ledgerEntries = await DealerLedger.find({
        dealer: order.dealer,
        $or: [
          { description: { $regex: order.orderNumber } },
          { invoiceNumber: invoice?.invoiceNumber }
        ]
      }).sort({ createdAt: 1 });

      console.log(`\n   Ledger Entries:`);
      let totalDebit = 0;
      let totalCredit = 0;
      
      ledgerEntries.forEach((entry, idx) => {
        console.log(`   ${idx + 1}. ${entry.transactionType}`);
        console.log(`      Date: ${entry.entryDate.toISOString().split('T')[0]}`);
        console.log(`      Debit: ₹${entry.debitAmount.toLocaleString()}`);
        console.log(`      Credit: ₹${entry.creditAmount.toLocaleString()}`);
        console.log(`      Description: ${entry.description}`);
        totalDebit += entry.debitAmount;
        totalCredit += entry.creditAmount;
      });

      const netAmount = totalDebit - totalCredit;
      console.log(`\n   Net Amount Blocked: ₹${netAmount.toLocaleString()}`);
      console.log(`   Expected: ₹${invoice?.totalAmount.toLocaleString() || order.totalAmount.toLocaleString()}`);
      
      if (Math.abs(netAmount - (invoice?.totalAmount || order.totalAmount)) < 1) {
        console.log(`   ✅ CORRECT`);
      } else {
        console.log(`   ❌ INCORRECT - Difference: ₹${(netAmount - (invoice?.totalAmount || order.totalAmount)).toLocaleString()}`);
      }
    }

  } catch (error) {
    console.error('❌ Verification Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

verifyCreditLimitFix();
