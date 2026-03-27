// Script to create missing ledger entries for orders 37 and 38
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function fixOrders3738() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   FIXING ORDERS SO-2026-0037 and SO-2026-0038             ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const orderNumbers = ['SO-2026-0037', 'SO-2026-0038'];
    
    for (const orderNumber of orderNumbers) {
      console.log(`\n📦 Processing Order: ${orderNumber}`);
      console.log('─'.repeat(60));
      
      const order = await SalesOrder.findOne({ orderNumber });
      
      if (!order) {
        console.log(`❌ Order ${orderNumber} not found\n`);
        continue;
      }
      
      console.log(`   Order Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Order Status: ${order.status}`);
      console.log(`   Dealer: ${order.dealerName} (${order.dealerCode})`);
      
      // Check if ledger entry already exists
      const existingEntry = await DealerLedger.findOne({
        dealer: order.dealer,
        transactionType: "Order Confirmed",
        description: { $regex: orderNumber }
      });
      
      if (existingEntry) {
        console.log(`   ✅ Ledger entry already exists - skipping`);
        continue;
      }
      
      // Get dealer details
      const dealer = await Dealer.findById(order.dealer);
      if (!dealer) {
        console.log(`   ❌ Dealer not found - cannot create ledger entry`);
        continue;
      }
      
      // Calculate due date
      let dueDate = null;
      if (order.orderDate && order.creditDays) {
        dueDate = new Date(order.orderDate);
        dueDate.setDate(dueDate.getDate() + order.creditDays);
      }
      
      // Get the last ledger entry for running balance
      const lastEntry = await DealerLedger.findOne(
        { dealer: order.dealer },
        {},
        { sort: { 'createdAt': -1 } }
      );
      
      let previousBalance = lastEntry ? lastEntry.runningBalance : 0;
      
      console.log(`   Previous Balance: ₹${previousBalance.toLocaleString()}`);
      
      // Create ledger entry to block credit limit
      const ledgerEntry = new DealerLedger({
        dealer: order.dealer,
        dealerName: dealer.name,
        dealerCode: dealer.code,
        entryDate: order.orderDate || new Date(),
        transactionType: "Order Confirmed",
        salesType: order.salesType || 'Regular Sale',
        creditDaysApplied: order.creditDays || 0,
        debitAmount: order.totalAmount,
        creditAmount: 0,
        runningBalance: previousBalance + order.totalAmount,
        description: `Order Confirmed - ${order.orderNumber}`,
        remarks: `[MANUAL FIX] Credit limit blocked for confirmed order ${order.orderNumber}. This entry was created retroactively because the order was confirmed before the credit locking feature was implemented. Amount: ₹${order.totalAmount.toLocaleString()}`,
        creditDays: order.creditDays || 0,
        dueDate: dueDate,
        status: "Active",
        createdBy: order.createdBy || order.dealer // Use order creator or dealer as fallback
      });
      
      await ledgerEntry.save();
      
      console.log(`   ✅ FIXED: Ledger entry created`);
      console.log(`   Blocked Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   New Running Balance: ₹${ledgerEntry.runningBalance.toLocaleString()}`);
      console.log(`   Due Date: ${dueDate ? dueDate.toISOString().split('T')[0] : 'N/A'}`);
    }
    
    // Show final summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log('   FINAL SUMMARY');
    console.log('═'.repeat(60));
    
    for (const orderNumber of orderNumbers) {
      const order = await SalesOrder.findOne({ orderNumber });
      if (!order) continue;
      
      const ledgerEntries = await DealerLedger.find({
        dealer: order.dealer,
        description: { $regex: orderNumber }
      });
      
      console.log(`\n${orderNumber}:`);
      console.log(`   Ledger Entries: ${ledgerEntries.length}`);
      
      if (ledgerEntries.length > 0) {
        const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debitAmount, 0);
        const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.creditAmount, 0);
        const netBlocked = totalDebit - totalCredit;
        
        console.log(`   Net Blocked: ₹${netBlocked.toLocaleString()}`);
        console.log(`   Expected: ₹${order.totalAmount.toLocaleString()}`);
        console.log(`   Status: ${Math.abs(netBlocked - order.totalAmount) < 1 ? '✅ CORRECT' : '❌ INCORRECT'}`);
      }
    }
    
    // Show dealer's updated credit status
    const order = await SalesOrder.findOne({ orderNumber: orderNumbers[0] });
    if (order) {
      const dealer = await Dealer.findById(order.dealer);
      const lastLedger = await DealerLedger.findOne({ dealer: order.dealer })
        .sort({ createdAt: -1 });
      
      console.log(`\n${'═'.repeat(60)}`);
      console.log('   DEALER CREDIT STATUS');
      console.log('═'.repeat(60));
      console.log(`\nDealer: ${dealer.name} (${dealer.code})`);
      console.log(`Credit Limit: ₹${(dealer.creditLimit || 0).toLocaleString()}`);
      console.log(`Current Outstanding: ₹${(lastLedger?.runningBalance || 0).toLocaleString()}`);
      console.log(`Available Credit: ₹${((dealer.creditLimit || 0) - (lastLedger?.runningBalance || 0)).toLocaleString()}`);
      
      const availableCredit = (dealer.creditLimit || 0) - (lastLedger?.runningBalance || 0);
      if (availableCredit < 0) {
        console.log(`\n⚠️  WARNING: Dealer is OVER LIMIT by ₹${Math.abs(availableCredit).toLocaleString()}`);
      }
    }
    
    console.log(`\n🎉 Fix completed successfully!`);

  } catch (error) {
    console.error('❌ Fix Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

console.log('⚠️  WARNING: This script will create ledger entries for orders 37 and 38');
console.log('⚠️  Make sure you have a database backup before proceeding\n');

fixOrders3738();
