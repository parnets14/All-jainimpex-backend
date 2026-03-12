import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import Dealer from './models/Dealer.js';
import SalesOrder from './models/SalesOrder.js';

const debugCreditLimitIssue = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the dealer "shree distributors"
    const dealer = await Dealer.findOne({ 
      $or: [
        { name: /shree distributors/i },
        { code: 'DLR1002' }
      ]
    });

    if (!dealer) {
      console.log('❌ Dealer not found');
      return;
    }

    console.log('\n📊 DEALER INFORMATION:');
    console.log(`   Name: ${dealer.name}`);
    console.log(`   Code: ${dealer.code}`);
    console.log(`   Current Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
    console.log(`   Credit Days: ${dealer.creditDays}`);

    // Find recent orders for this dealer
    const recentOrders = await SalesOrder.find({ 
      dealer: dealer._id 
    })
    .sort({ createdAt: -1 })
    .limit(5);

    console.log(`\n📋 RECENT ORDERS (${recentOrders.length}):`);
    
    for (const order of recentOrders) {
      console.log(`\n   Order: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Amount: ₹${order.totalAmount.toLocaleString()}`);
      console.log(`   Created: ${order.createdAt.toLocaleDateString()}`);
      
      if (order.creditOverlimit) {
        console.log(`   📊 CREDIT OVERLIMIT INFO:`);
        console.log(`      Is Overlimit: ${order.creditOverlimit.isOverlimit ? '✅ YES' : '❌ NO'}`);
        console.log(`      Credit Limit: ₹${(order.creditOverlimit.creditLimit || 0).toLocaleString()}`);
        console.log(`      Current Outstanding: ₹${(order.creditOverlimit.currentOutstanding || 0).toLocaleString()}`);
        console.log(`      Order Amount: ₹${(order.creditOverlimit.orderAmount || 0).toLocaleString()}`);
        console.log(`      New Outstanding: ₹${(order.creditOverlimit.newOutstanding || 0).toLocaleString()}`);
        console.log(`      Overlimit Amount: ₹${(order.creditOverlimit.overlimitAmount || 0).toLocaleString()}`);
        console.log(`      Requires Approval: ${order.creditOverlimit.requiresApproval ? '⏳ YES' : '✅ NO'}`);
        console.log(`      Approved By: ${order.creditOverlimit.approvedBy ? '✅ APPROVED' : '❌ NOT APPROVED'}`);
        
        if (order.creditOverlimit.approvedBy) {
          console.log(`      Approved At: ${order.creditOverlimit.approvedAt}`);
          console.log(`      Approval Notes: ${order.creditOverlimit.approvalNotes || 'None'}`);
        }
      } else {
        console.log(`   📊 CREDIT OVERLIMIT INFO: None`);
      }
    }

    // Check if there are any approved overlimit orders
    const approvedOverlimitOrders = await SalesOrder.find({
      dealer: dealer._id,
      'creditOverlimit.isOverlimit': true,
      'creditOverlimit.approvedBy': { $exists: true }
    });

    console.log(`\n🔍 APPROVED OVERLIMIT ORDERS: ${approvedOverlimitOrders.length}`);
    
    let totalApprovedOverlimit = 0;
    for (const order of approvedOverlimitOrders) {
      const overlimitAmount = order.creditOverlimit.overlimitAmount || 0;
      totalApprovedOverlimit += overlimitAmount;
      console.log(`   Order ${order.orderNumber}: ₹${overlimitAmount.toLocaleString()} overlimit approved`);
    }

    console.log(`\n💡 ANALYSIS:`);
    console.log(`   Total Approved Overlimit: ₹${totalApprovedOverlimit.toLocaleString()}`);
    console.log(`   Expected Credit Limit: ₹${(300000 + totalApprovedOverlimit).toLocaleString()}`);
    console.log(`   Actual Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
    console.log(`   Difference: ₹${(dealer.creditLimit - (300000 + totalApprovedOverlimit)).toLocaleString()}`);

    if (dealer.creditLimit !== (300000 + totalApprovedOverlimit)) {
      console.log(`\n❌ ISSUE FOUND: Credit limit not updated correctly!`);
      console.log(`   Recommended Action: Update dealer credit limit to ₹${(300000 + totalApprovedOverlimit).toLocaleString()}`);
    } else {
      console.log(`\n✅ Credit limit appears correct`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugCreditLimitIssue();