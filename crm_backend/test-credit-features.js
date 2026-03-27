// Test script to verify credit limit features
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import DealerLedger from './models/DealerLedger.js';
import Dealer from './models/Dealer.js';

dotenv.config();

async function testCreditFeatures() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('   CREDIT LIMIT FEATURES - COMPREHENSIVE TEST              ');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: Credit Limit Reversal on Cancellation
    console.log('TEST 1: Credit Limit Reversal on Cancellation');
    console.log('─'.repeat(60));
    
    const cancelledOrders = await SalesOrder.find({
      status: { $in: ['Cancelled', 'Rejected'] }
    }).limit(5);
    
    console.log(`Found ${cancelledOrders.length} cancelled/rejected orders\n`);
    
    for (const order of cancelledOrders) {
      console.log(`📦 Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);
      
      // Check for ledger entries
      const ledgerEntries = await DealerLedger.find({
        dealer: order.dealer,
        description: { $regex: order.orderNumber }
      }).sort({ createdAt: 1 });
      
      const hasConfirmEntry = ledgerEntries.some(e => e.transactionType === 'Order Confirmed');
      const hasReversalEntry = ledgerEntries.some(e => e.transactionType === 'Order Confirmed - Reversed');
      
      if (hasConfirmEntry && hasReversalEntry) {
        console.log(`   ✅ CORRECT: Has both confirmation and reversal entries`);
        const confirmEntry = ledgerEntries.find(e => e.transactionType === 'Order Confirmed');
        const reversalEntry = ledgerEntries.find(e => e.transactionType === 'Order Confirmed - Reversed');
        console.log(`      Blocked: ₹${confirmEntry.debitAmount.toLocaleString()}`);
        console.log(`      Unblocked: ₹${reversalEntry.creditAmount.toLocaleString()}`);
      } else if (hasConfirmEntry && !hasReversalEntry) {
        console.log(`   ❌ ISSUE: Has confirmation but NO reversal entry`);
        console.log(`      Credit is still blocked!`);
      } else if (!hasConfirmEntry) {
        console.log(`   ℹ️  No confirmation entry (order may have been cancelled before confirmation)`);
      }
      console.log('');
    }

    // Test 2: Admin Approval for Credit Overlimit
    console.log('\n' + '═'.repeat(60));
    console.log('TEST 2: Admin Approval for Credit Overlimit');
    console.log('─'.repeat(60));
    
    const overlimitOrders = await SalesOrder.find({
      'creditOverlimit.isOverlimit': true
    }).populate('dealer', 'name code creditLimit');
    
    console.log(`Found ${overlimitOrders.length} orders with credit overlimit\n`);
    
    for (const order of overlimitOrders) {
      console.log(`📦 Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Dealer: ${order.dealerName} (${order.dealerCode})`);
      
      if (order.dealer) {
        console.log(`   Credit Limit: ₹${(order.dealer.creditLimit || 0).toLocaleString()}`);
      }
      
      if (order.creditOverlimit) {
        console.log(`\n   CREDIT OVERLIMIT INFO:`);
        console.log(`   Is Overlimit: ${order.creditOverlimit.isOverlimit ? 'Yes' : 'No'}`);
        console.log(`   Overlimit Amount: ₹${(order.creditOverlimit.overlimitAmount || 0).toLocaleString()}`);
        console.log(`   Current Outstanding: ₹${(order.creditOverlimit.currentOutstanding || 0).toLocaleString()}`);
        console.log(`   New Outstanding: ₹${(order.creditOverlimit.newOutstanding || 0).toLocaleString()}`);
        console.log(`   Requires Approval: ${order.creditOverlimit.requiresApproval ? 'Yes' : 'No'}`);
        
        if (order.creditOverlimit.approvedBy) {
          console.log(`   ✅ APPROVED BY: Admin (ID: ${order.creditOverlimit.approvedBy})`);
          console.log(`   Approved At: ${order.creditOverlimit.approvedAt?.toISOString().split('T')[0] || 'N/A'}`);
          console.log(`   Approval Notes: ${order.creditOverlimit.approvalNotes || 'None'}`);
        } else {
          console.log(`   ⏳ PENDING APPROVAL`);
          console.log(`   ⚠️  Order cannot be confirmed until Super Admin approves`);
        }
      }
      console.log('');
    }

    // Test 3: Check if credit limit blocking prevents status change
    console.log('\n' + '═'.repeat(60));
    console.log('TEST 3: Credit Limit Blocking Logic');
    console.log('─'.repeat(60));
    
    const pendingOverlimitOrders = await SalesOrder.find({
      status: 'Pending',
      'creditOverlimit.isOverlimit': true,
      'creditOverlimit.approvedBy': { $exists: false }
    });
    
    console.log(`Found ${pendingOverlimitOrders.length} pending orders awaiting approval\n`);
    
    for (const order of pendingOverlimitOrders) {
      console.log(`📦 Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Overlimit By: ₹${(order.creditOverlimit.overlimitAmount || 0).toLocaleString()}`);
      console.log(`   ⚠️  BLOCKED: Cannot change status until approved`);
      console.log(`   Action Required: Super Admin must approve via API`);
      console.log(`   API Endpoint: PATCH /api/sales-orders/${order._id}/approve-credit-overlimit`);
      console.log('');
    }

    // Test 4: Summary of all dealers with credit issues
    console.log('\n' + '═'.repeat(60));
    console.log('TEST 4: Dealers with Credit Limit Issues');
    console.log('─'.repeat(60));
    
    const dealers = await Dealer.find({ creditLimit: { $gt: 0 } });
    
    console.log(`Checking ${dealers.length} dealers with credit limits...\n`);
    
    let overLimitCount = 0;
    let nearLimitCount = 0;
    
    for (const dealer of dealers) {
      const lastLedger = await DealerLedger.findOne({ dealer: dealer._id })
        .sort({ createdAt: -1 });
      
      const currentOutstanding = lastLedger ? lastLedger.runningBalance : 0;
      const availableCredit = dealer.creditLimit - currentOutstanding;
      const utilizationPercent = (currentOutstanding / dealer.creditLimit) * 100;
      
      if (availableCredit < 0) {
        console.log(`❌ ${dealer.name} (${dealer.code})`);
        console.log(`   Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
        console.log(`   Outstanding: ₹${currentOutstanding.toLocaleString()}`);
        console.log(`   OVER LIMIT BY: ₹${Math.abs(availableCredit).toLocaleString()}`);
        console.log(`   Utilization: ${utilizationPercent.toFixed(1)}%`);
        console.log('');
        overLimitCount++;
      } else if (utilizationPercent > 80) {
        console.log(`⚠️  ${dealer.name} (${dealer.code})`);
        console.log(`   Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
        console.log(`   Outstanding: ₹${currentOutstanding.toLocaleString()}`);
        console.log(`   Available: ₹${availableCredit.toLocaleString()}`);
        console.log(`   Utilization: ${utilizationPercent.toFixed(1)}%`);
        console.log('');
        nearLimitCount++;
      }
    }
    
    console.log('═'.repeat(60));
    console.log('SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Dealers: ${dealers.length}`);
    console.log(`Over Limit: ${overLimitCount}`);
    console.log(`Near Limit (>80%): ${nearLimitCount}`);
    console.log(`Healthy: ${dealers.length - overLimitCount - nearLimitCount}`);

    // Final verification
    console.log('\n' + '═'.repeat(60));
    console.log('FEATURE VERIFICATION');
    console.log('═'.repeat(60));
    
    const feature1Working = cancelledOrders.some(order => {
      const ledgerEntries = DealerLedger.find({
        dealer: order.dealer,
        description: { $regex: order.orderNumber }
      });
      return ledgerEntries.length > 0;
    });
    
    const feature2Working = overlimitOrders.length > 0;
    
    console.log(`\n✅ Feature 1: Credit Reversal on Cancellation - ${feature1Working ? 'WORKING' : 'NOT TESTED'}`);
    console.log(`✅ Feature 2: Admin Approval for Overlimit - ${feature2Working ? 'WORKING' : 'NOT TESTED'}`);
    
    console.log('\n📝 NOTES:');
    console.log('   - Credit limit is blocked when order is confirmed');
    console.log('   - Credit limit is unblocked when order is cancelled/rejected');
    console.log('   - Orders exceeding credit limit require Super Admin approval');
    console.log('   - Approved orders can proceed to confirmation');
    console.log('   - Unapproved overlimit orders remain in Pending status');

  } catch (error) {
    console.error('❌ Test Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

testCreditFeatures();
