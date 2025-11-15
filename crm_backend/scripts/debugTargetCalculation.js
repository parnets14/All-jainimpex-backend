import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Target from '../SalesExecutiveAppBackend/models/Target.js';
import SalesOrder from '../models/SalesOrder.js';
import User from '../models/User.js';

dotenv.config();

const debugTargetCalculation = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get the latest target
    const target = await Target.findOne().sort({ createdAt: -1 });
    
    if (!target) {
      console.log('❌ No targets found');
      process.exit(1);
    }

    console.log('📊 Target Details:');
    console.log('   Target Number:', target.targetNumber);
    console.log('   Sales Executive:', target.salesExecutiveName);
    console.log('   Period:', target.startDate.toLocaleDateString(), '-', target.endDate.toLocaleDateString());
    console.log('   Status:', target.status);
    console.log('\n📈 Target Goals:');
    console.log('   Sales Amount:', target.targets.salesAmount);
    console.log('   Order Count:', target.targets.orderCount);
    console.log('   Visit Count:', target.targets.visitCount);
    console.log('   Collection Amount:', target.targets.collectionAmount);

    // Get sales executive
    const seUser = await User.findById(target.salesExecutive);
    console.log('\n👤 Sales Executive:');
    console.log('   ID:', seUser._id);
    console.log('   Name:', seUser.name);
    console.log('   Role:', seUser.role);

    // Check for sales orders
    console.log('\n🔍 Checking Sales Orders...');
    console.log('   Looking for orders:');
    console.log('   - Sales Executive ID:', target.salesExecutive);
    console.log('   - Created between:', target.startDate.toISOString(), 'and', target.endDate.toISOString());
    console.log('   - Status in: Confirmed, Processing, Shipped, Delivered, Completed');

    const allOrders = await SalesOrder.find({ salesExecutive: target.salesExecutive });
    console.log('\n   Total orders by this SE:', allOrders.length);
    
    if (allOrders.length > 0) {
      console.log('\n   All Orders:');
      allOrders.forEach((order, i) => {
        console.log(`   ${i + 1}. Order #${order.orderNumber}`);
        console.log(`      Status: ${order.status}`);
        console.log(`      Amount: ₹${order.totalAmount}`);
        console.log(`      Created: ${order.createdAt}`);
        console.log(`      In Range: ${order.createdAt >= target.startDate && order.createdAt <= target.endDate ? 'YES' : 'NO'}`);
      });
    }

    const matchingOrders = await SalesOrder.find({
      salesExecutive: target.salesExecutive,
      createdAt: { $gte: target.startDate, $lte: target.endDate },
      status: { $in: ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Completed'] }
    });

    console.log('\n   ✅ Matching Orders:', matchingOrders.length);
    if (matchingOrders.length > 0) {
      let totalAmount = 0;
      matchingOrders.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order.orderNumber} - ₹${order.totalAmount} - ${order.status}`);
        totalAmount += order.totalAmount;
      });
      console.log(`   Total Amount: ₹${totalAmount}`);
    }

    console.log('\n💡 To update the target achievement, run:');
    console.log(`   node scripts/calculateAllTargets.js`);
    console.log('\n   Or click the Recalculate button in Web CRM');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
};

debugTargetCalculation();
