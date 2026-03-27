// Migration script to fix double credit blocking issue
// Run this ONCE after deploying the fix to clean up existing data

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function fixDoubleBlockedOrders() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════');
    console.log('   FIXING DOUBLE CREDIT BLOCKING ISSUE  ');
    console.log('═══════════════════════════════════════\n');

    // Find all confirmed/processed/delivered orders
    const orders = await SalesOrder.find({
      status: { $in: ["Confirmed", "Processing", "Delivered"] }
    }).populate('dealer', 'name code');

    console.log(`📋 Found ${orders.length} confirmed/processed/delivered orders\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const order of orders) {
      try {
        console.log(`\n🔍 Checking Order: ${order.orderNumber}`);
        console.log(`   Dealer: ${order.dealerName} (${order.dealerCode})`);
        console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);

        // Check if invoice exists for this order
        const invoice = await DealerInvoice.findOne({ 
          salesOrder: order._id,
          status: { $ne: 'Draft' }
        });

        if (!invoice) {
          console.log(`   ⏭️ No approved invoice found - skipping`);
          skippedCount++;
          continue;
        }

        console.log(`   📄 Invoice found: ${invoice.invoiceNumber}`);

        // Find the "Order Confirmed" ledger entry
        const orderLedgerEntry = await DealerLedger.findOne({
          dealer: order.dealer,
          transactionType: "Order Confirmed",
          description: { $regex: order.orderNumber }
        });

        if (!orderLedgerEntry) {
          console.log(`   ℹ️ No order ledger entry found - may have been already fixed or never created`);
          skippedCount++;
          continue;
        }

        console.log(`   💳 Found order ledger entry: ₹${orderLedgerEntry.debitAmount.toLocaleString()} blocked`);

        // Check if already reversed
        const existingReversal = await DealerLedger.findOne({
          dealer: order.dealer,
          transactionType: "Order Confirmed - Reversed",
          description: { $regex: order.orderNumber }
        });

        if (existingReversal) {
          console.log(`   ✅ Already reversed - skipping`);
          skippedCount++;
          continue;
        }

        // Get the last entry for running balance calculation
        const lastEntry = await DealerLedger.findOne(
          { dealer: order.dealer },
          {},
          { sort: { 'createdAt': -1 } }
        );

        let previousBalance = lastEntry ? lastEntry.runningBalance : 0;

        // Create REVERSE entry to unblock the order amount
        const reverseLedgerEntry = new DealerLedger({
          dealer: order.dealer,
          dealerName: order.dealerName,
          dealerCode: order.dealerCode,
          entryDate: new Date(),
          transactionType: "Order Confirmed - Reversed",
          description: `Migration: Reversed Order ${order.orderNumber} (Invoice ${invoice.invoiceNumber})`,
          remarks: `Data migration - removing double credit blocking. Order ${order.orderNumber} was converted to invoice ${invoice.invoiceNumber}. This reverses the credit block from order confirmation to prevent double blocking.`,
          debitAmount: 0,
          creditAmount: orderLedgerEntry.debitAmount, // Unblock the order amount
          runningBalance: previousBalance - orderLedgerEntry.debitAmount,
          status: "Active"
        });

        await reverseLedgerEntry.save();

        console.log(`   ✅ FIXED: Created reversal entry`);
        console.log(`      Unblocked: ₹${orderLedgerEntry.debitAmount.toLocaleString()}`);
        console.log(`      New balance: ₹${reverseLedgerEntry.runningBalance.toLocaleString()}`);

        fixedCount++;

      } catch (orderError) {
        console.error(`   ❌ Error processing order ${order.orderNumber}:`, orderError.message);
        errorCount++;
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('              SUMMARY                   ');
    console.log('═══════════════════════════════════════');
    console.log(`Total Orders Checked: ${orders.length}`);
    console.log(`✅ Fixed: ${fixedCount}`);
    console.log(`⏭️ Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('═══════════════════════════════════════\n');

    if (fixedCount > 0) {
      console.log('🎉 Migration completed successfully!');
      console.log('📊 Recommendation: Run balance sheet verification to confirm accuracy\n');
    } else {
      console.log('ℹ️ No orders needed fixing. All good!\n');
    }

  } catch (error) {
    console.error('❌ Migration Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
console.log('⚠️  WARNING: This script will modify dealer ledger entries');
console.log('⚠️  Make sure you have a database backup before proceeding\n');

fixDoubleBlockedOrders();
