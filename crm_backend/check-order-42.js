// Check sales order 42 status
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function checkOrder42() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   CHECKING SALES ORDER SO-2026-0042                       ');
    console.log('═══════════════════════════════════════════════════════════\n');

    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0042' })
      .populate('dealer', 'name code creditLimit');

    if (!order) {
      console.log('❌ Order SO-2026-0042 not found');
      return;
    }

    console.log('📦 ORDER DETAILS:');
    console.log('─'.repeat(60));
    console.log(`Order Number: ${order.orderNumber}`);
    console.log(`Status: ${order.status}`);
    console.log(`Order Amount: ₹${order.totalAmount.toLocaleString()}`);
    console.log(`Dealer: ${order.dealerName} (${order.dealerCode})`);
    console.log(`Order Date: ${order.orderDate?.toISOString().split('T')[0] || 'N/A'}`);
    console.log(`Created At: ${order.createdAt?.toISOString().split('T')[0] || 'N/A'}`);

    if (order.dealer) {
      console.log(`\n💳 DEALER INFO:`);
      console.log(`Credit Limit: ₹${(order.dealer.creditLimit || 0).toLocaleString()}`);
      
      const lastLedger = await DealerLedger.findOne({ dealer: order.dealer._id })
        .sort({ createdAt: -1 });
      const currentOutstanding = lastLedger ? lastLedger.runningBalance : 0;
      console.log(`Current Outstanding: ₹${currentOutstanding.toLocaleString()}`);
      console.log(`Available Credit: ₹${((order.dealer.creditLimit || 0) - currentOutstanding).toLocaleString()}`);
    }

    console.log(`\n⚠️  CREDIT OVERLIMIT STATUS:`);
    console.log('─'.repeat(60));
    
    if (order.creditOverlimit) {
      console.log(`Is Overlimit: ${order.creditOverlimit.isOverlimit ? '✅ YES' : '❌ NO'}`);
      console.log(`Credit Limit: ₹${(order.creditOverlimit.creditLimit || 0).toLocaleString()}`);
      console.log(`Current Outstanding: ₹${(order.creditOverlimit.currentOutstanding || 0).toLocaleString()}`);
      console.log(`Order Amount: ₹${(order.creditOverlimit.orderAmount || 0).toLocaleString()}`);
      console.log(`New Outstanding: ₹${(order.creditOverlimit.newOutstanding || 0).toLocaleString()}`);
      console.log(`Overlimit Amount: ₹${(order.creditOverlimit.overlimitAmount || 0).toLocaleString()}`);
      console.log(`Requires Approval: ${order.creditOverlimit.requiresApproval ? '⏳ YES' : '✅ NO'}`);
      
      if (order.creditOverlimit.approvedBy) {
        console.log(`\n✅ APPROVAL STATUS:`);
        console.log(`Approved By: ${order.creditOverlimit.approvedBy}`);
        console.log(`Approved At: ${order.creditOverlimit.approvedAt?.toISOString() || 'N/A'}`);
        console.log(`Approval Notes: ${order.creditOverlimit.approvalNotes || 'None'}`);
      } else {
        console.log(`\n❌ NOT APPROVED YET`);
      }
    } else {
      console.log('No credit overlimit data found');
    }

    console.log(`\n🔍 LEDGER ENTRIES:`);
    console.log('─'.repeat(60));
    
    const ledgerEntries = await DealerLedger.find({
      dealer: order.dealer,
      description: { $regex: order.orderNumber }
    }).sort({ createdAt: 1 });

    if (ledgerEntries.length === 0) {
      console.log('No ledger entries found for this order');
    } else {
      console.log(`Found ${ledgerEntries.length} ledger entries:\n`);
      
      ledgerEntries.forEach((entry, idx) => {
        console.log(`${idx + 1}. ${entry.transactionType}`);
        console.log(`   Date: ${entry.entryDate.toISOString().split('T')[0]}`);
        console.log(`   Debit: ₹${entry.debitAmount.toLocaleString()}`);
        console.log(`   Credit: ₹${entry.creditAmount.toLocaleString()}`);
        console.log(`   Running Balance: ₹${entry.runningBalance.toLocaleString()}`);
        console.log(`   Description: ${entry.description}`);
        console.log('');
      });
    }

    console.log(`\n🔧 DIAGNOSIS:`);
    console.log('─'.repeat(60));
    
    if (order.status === 'Pending') {
      if (order.creditOverlimit && order.creditOverlimit.isOverlimit) {
        if (order.creditOverlimit.approvedBy) {
          console.log('✅ Order is approved by admin');
          console.log('✅ Order can now be confirmed');
          console.log('');
          console.log('📝 NEXT STEPS:');
          console.log('   1. Go to Sales Order Dashboard');
          console.log('   2. Find order SO-2026-0042');
          console.log('   3. Click "Confirm Order" button');
          console.log('   4. Order status will change to "Confirmed"');
          console.log('   5. Credit limit will be blocked');
        } else {
          console.log('❌ Order is NOT approved yet');
          console.log('⏳ Waiting for Super Admin approval');
          console.log('');
          console.log('📝 ACTION REQUIRED:');
          console.log('   Super Admin must approve via:');
          console.log(`   PATCH /api/sales-orders/${order._id}/approve-credit-overlimit`);
        }
      } else {
        console.log('ℹ️  Order is within credit limit');
        console.log('✅ Order can be confirmed without approval');
      }
    } else if (order.status === 'Confirmed') {
      console.log('✅ Order is already confirmed');
      if (ledgerEntries.length > 0) {
        console.log('✅ Credit limit is blocked');
      } else {
        console.log('⚠️  No ledger entry found - credit may not be blocked');
      }
    } else {
      console.log(`ℹ️  Order status is: ${order.status}`);
    }

    console.log(`\n📊 PRODUCTS IN ORDER:`);
    console.log('─'.repeat(60));
    
    if (order.products && order.products.length > 0) {
      console.log(`Total Products: ${order.products.length}\n`);
      order.products.forEach((product, idx) => {
        console.log(`${idx + 1}. ${product.productName || 'Unknown'}`);
        console.log(`   Quantity: ${product.quantity}`);
        console.log(`   Price: ₹${(product.price || 0).toLocaleString()}`);
        console.log(`   Total: ₹${(product.totalPrice || 0).toLocaleString()}`);
        console.log(`   Warehouse: ${product.warehouseName || 'Not assigned'}`);
        console.log('');
      });
    } else {
      console.log('No products found in order');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

checkOrder42();
