// Comprehensive test script to verify credit limit locking flow
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function testCreditLimitFlow() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   CREDIT LIMIT LOCKING FLOW - COMPREHENSIVE TEST          ');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test specific orders mentioned by user
    const orderNumbers = ['SO-2026-0037', 'SO-2026-0038'];
    
    for (const orderNumber of orderNumbers) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 TESTING ORDER: ${orderNumber}`);
      console.log('='.repeat(60));
      
      const order = await SalesOrder.findOne({ orderNumber })
        .populate('dealer', 'name code creditLimit');
      
      if (!order) {
        console.log(`❌ Order ${orderNumber} not found\n`);
        continue;
      }
      
      console.log(`\n📋 ORDER DETAILS:`);
      console.log(`   Order Number: ${order.orderNumber}`);
      console.log(`   Dealer: ${order.dealerName} (${order.dealerCode})`);
      console.log(`   Order Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Order Status: ${order.status}`);
      console.log(`   Order Date: ${order.orderDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`   Credit Days: ${order.creditDays || 0}`);
      
      // Check dealer credit limit
      if (order.dealer) {
        console.log(`\n💳 DEALER CREDIT INFO:`);
        console.log(`   Credit Limit: ₹${(order.dealer.creditLimit || 0).toLocaleString()}`);
        
        // Calculate current outstanding
        const lastLedger = await DealerLedger.findOne({ dealer: order.dealer._id })
          .sort({ createdAt: -1 });
        const currentOutstanding = lastLedger ? lastLedger.runningBalance : 0;
        console.log(`   Current Outstanding: ₹${currentOutstanding.toLocaleString()}`);
        console.log(`   Available Credit: ₹${((order.dealer.creditLimit || 0) - currentOutstanding).toLocaleString()}`);
      }
      
      // Check for invoice
      const invoice = await DealerInvoice.findOne({ salesOrder: order._id });
      
      if (invoice) {
        console.log(`\n📄 INVOICE DETAILS:`);
        console.log(`   Invoice Number: ${invoice.invoiceNumber || 'Draft'}`);
        console.log(`   Invoice Status: ${invoice.status}`);
        console.log(`   Invoice Amount: ₹${invoice.totalAmount.toLocaleString()}`);
        console.log(`   Invoice Date: ${invoice.invoiceDate?.toISOString().split('T')[0] || 'N/A'}`);
      } else {
        console.log(`\n📄 INVOICE: Not generated yet`);
      }
      
      // Get ALL ledger entries for this order
      console.log(`\n💰 LEDGER ENTRIES:`);
      
      const ledgerEntries = await DealerLedger.find({
        dealer: order.dealer,
        $or: [
          { description: { $regex: orderNumber } },
          { invoiceNumber: invoice?.invoiceNumber }
        ]
      }).sort({ createdAt: 1 });
      
      if (ledgerEntries.length === 0) {
        console.log(`   ⚠️  NO LEDGER ENTRIES FOUND!`);
        console.log(`   ❌ PROBLEM: Credit limit is NOT being locked for this order!`);
      } else {
        console.log(`   Found ${ledgerEntries.length} ledger entries:\n`);
        
        let totalDebit = 0;
        let totalCredit = 0;
        
        ledgerEntries.forEach((entry, idx) => {
          console.log(`   ${idx + 1}. ${entry.transactionType}`);
          console.log(`      Date: ${entry.entryDate.toISOString().split('T')[0]}`);
          console.log(`      Debit: ₹${entry.debitAmount.toLocaleString()}`);
          console.log(`      Credit: ₹${entry.creditAmount.toLocaleString()}`);
          console.log(`      Running Balance: ₹${entry.runningBalance.toLocaleString()}`);
          console.log(`      Description: ${entry.description}`);
          if (entry.remarks) {
            console.log(`      Remarks: ${entry.remarks}`);
          }
          console.log('');
          
          totalDebit += entry.debitAmount;
          totalCredit += entry.creditAmount;
        });
        
        const netBlocked = totalDebit - totalCredit;
        const expectedBlocked = invoice ? invoice.totalAmount : order.totalAmount;
        
        console.log(`   SUMMARY:`);
        console.log(`   Total Debit: ₹${totalDebit.toLocaleString()}`);
        console.log(`   Total Credit: ₹${totalCredit.toLocaleString()}`);
        console.log(`   Net Blocked: ₹${netBlocked.toLocaleString()}`);
        console.log(`   Expected: ₹${expectedBlocked.toLocaleString()}`);
        
        const difference = netBlocked - expectedBlocked;
        if (Math.abs(difference) < 1) {
          console.log(`   ✅ CORRECT - Credit limit properly locked`);
        } else if (difference > 0) {
          console.log(`   ❌ DOUBLE BLOCKED - Excess: ₹${difference.toLocaleString()}`);
        } else {
          console.log(`   ❌ UNDER BLOCKED - Short: ₹${Math.abs(difference).toLocaleString()}`);
        }
      }
      
      // Analysis and recommendations
      console.log(`\n🔍 ANALYSIS:`);
      
      if (order.status === 'Confirmed' && ledgerEntries.length === 0) {
        console.log(`   ❌ CRITICAL: Order is confirmed but NO ledger entry exists!`);
        console.log(`   📝 ACTION: The order confirmation did not create a ledger entry.`);
        console.log(`   💡 REASON: This could be because:`);
        console.log(`      1. The order was confirmed before the fix was deployed`);
        console.log(`      2. There was an error during ledger creation`);
        console.log(`      3. The dealer was not found during confirmation`);
      } else if (order.status === 'Confirmed' && !invoice) {
        console.log(`   ✅ Order confirmed - credit limit locked`);
        console.log(`   ⏳ Waiting for invoice generation`);
      } else if (invoice && invoice.status !== 'Draft') {
        const hasOrderEntry = ledgerEntries.some(e => e.transactionType === 'Order Confirmed');
        const hasReversal = ledgerEntries.some(e => e.transactionType === 'Order Confirmed - Reversed');
        const hasInvoiceEntry = ledgerEntries.some(e => e.transactionType === 'Invoice');
        
        if (hasOrderEntry && !hasReversal && hasInvoiceEntry) {
          console.log(`   ❌ DOUBLE BLOCKING DETECTED!`);
          console.log(`   📝 ACTION: Run migration script to fix`);
        } else if (hasOrderEntry && hasReversal && hasInvoiceEntry) {
          console.log(`   ✅ CORRECT FLOW: Order → Reversal → Invoice`);
        } else if (!hasOrderEntry && hasInvoiceEntry) {
          console.log(`   ✅ Direct invoice (no order confirmation ledger)`);
        }
      }
    }
    
    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('   OVERALL SUMMARY');
    console.log('='.repeat(60));
    
    const allOrders = await SalesOrder.find({
      orderNumber: { $in: orderNumbers }
    });
    
    let correctCount = 0;
    let issueCount = 0;
    
    for (const order of allOrders) {
      const ledgerEntries = await DealerLedger.find({
        dealer: order.dealer,
        description: { $regex: order.orderNumber }
      });
      
      if (order.status === 'Confirmed' && ledgerEntries.length === 0) {
        issueCount++;
      } else {
        correctCount++;
      }
    }
    
    console.log(`\nOrders Tested: ${allOrders.length}`);
    console.log(`✅ Correct: ${correctCount}`);
    console.log(`❌ Issues: ${issueCount}`);
    
    if (issueCount > 0) {
      console.log(`\n⚠️  RECOMMENDATION:`);
      console.log(`   These orders were confirmed before the fix was deployed.`);
      console.log(`   They need manual ledger entries to lock credit limit.`);
      console.log(`\n   OPTIONS:`);
      console.log(`   1. Create manual ledger entries for these orders`);
      console.log(`   2. Wait for invoice generation (fix will handle it)`);
      console.log(`   3. Re-confirm the orders (if possible)`);
    } else {
      console.log(`\n🎉 All orders are correctly configured!`);
    }

  } catch (error) {
    console.error('❌ Test Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testCreditLimitFlow();
