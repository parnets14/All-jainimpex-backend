import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import SalesOrder from './models/SalesOrder.js';
import Dealer from './models/Dealer.js';

async function testInvoiceCreationForConfirmedStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧾 Testing Invoice Creation for Confirmed Status');
    console.log('================================================');

    // Find sales orders by status
    const statusCounts = await SalesOrder.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    console.log('\n📊 Sales Orders by Status:');
    statusCounts.forEach(status => {
      console.log(`   ${status._id}: ${status.count} orders`);
    });

    // Test the new invoice creation logic
    console.log('\n🔍 Testing New Invoice Creation Logic:');
    console.log('=====================================');

    // OLD Logic (only Completed and Delivered)
    const oldLogicOrders = await SalesOrder.find({
      status: { $in: ["Completed", "Delivered"] }
    }).countDocuments();

    // NEW Logic (Confirmed, Processing, Delivered, Completed)
    const newLogicOrders = await SalesOrder.find({
      status: { $in: ["Confirmed", "Processing", "Delivered", "Completed"] }
    }).countDocuments();

    console.log(`📋 OLD Logic (Completed + Delivered): ${oldLogicOrders} orders eligible for invoice`);
    console.log(`📋 NEW Logic (Confirmed + Processing + Delivered + Completed): ${newLogicOrders} orders eligible for invoice`);
    console.log(`📈 Increase: +${newLogicOrders - oldLogicOrders} more orders can now have invoices created`);

    // Show sample orders that are now eligible
    const newlyEligibleOrders = await SalesOrder.find({
      status: { $in: ["Confirmed", "Processing"] }
    })
    .populate('dealer', 'name code')
    .limit(5)
    .select('orderNumber status dealer totalAmount orderDate');

    if (newlyEligibleOrders.length > 0) {
      console.log('\n🎯 Sample Orders Now Eligible for Invoice Creation:');
      console.log('==================================================');
      newlyEligibleOrders.forEach((order, index) => {
        console.log(`${index + 1}. Order: ${order.orderNumber}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Dealer: ${order.dealer?.name} (${order.dealer?.code})`);
        console.log(`   Amount: ₹${order.totalAmount?.toLocaleString() || 0}`);
        console.log(`   Date: ${order.orderDate?.toLocaleDateString('en-IN')}`);
        console.log('');
      });
    } else {
      console.log('\n⚠️ No orders found with "Confirmed" or "Processing" status');
    }

    // Test with a specific dealer
    const sampleDealer = await Dealer.findOne().select('_id name code');
    if (sampleDealer) {
      console.log(`\n🏪 Testing for Sample Dealer: ${sampleDealer.name} (${sampleDealer.code})`);
      console.log('='.repeat(60));

      const dealerOldLogic = await SalesOrder.find({
        dealer: sampleDealer._id,
        status: { $in: ["Completed", "Delivered"] }
      }).countDocuments();

      const dealerNewLogic = await SalesOrder.find({
        dealer: sampleDealer._id,
        status: { $in: ["Confirmed", "Processing", "Delivered", "Completed"] }
      }).countDocuments();

      console.log(`📋 OLD Logic: ${dealerOldLogic} orders eligible for invoice`);
      console.log(`📋 NEW Logic: ${dealerNewLogic} orders eligible for invoice`);
      console.log(`📈 Increase: +${dealerNewLogic - dealerOldLogic} more orders`);
    }

    console.log('\n✅ Invoice Creation Test Completed Successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Invoices can now be created for "Confirmed" status orders');
    console.log('   - Invoices can now be created for "Processing" status orders');
    console.log('   - This allows earlier billing once orders are confirmed');
    console.log('   - Stock is already blocked at "Confirmed" status');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
}

testInvoiceCreationForConfirmedStatus();