import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Target from '../SalesExecutiveAppBackend/models/Target.js';
import User from '../models/User.js';

dotenv.config();

const testTargets = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find a sales executive
    const salesExecutive = await User.findOne({ role: 'Sales Executive' });
    
    if (!salesExecutive) {
      console.log('❌ No sales executive found. Please create one first.');
      process.exit(1);
    }

    console.log('👤 Found Sales Executive:', salesExecutive.name);
    console.log('📍 Region:', salesExecutive.region);

    // Create a test target
    console.log('\n📊 Creating test target...');
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 days from now

    const testTarget = new Target({
      salesExecutive: salesExecutive._id,
      salesExecutiveName: salesExecutive.name,
      region: salesExecutive.region,
      targetType: 'Monthly',
      startDate,
      endDate,
      targets: {
        salesAmount: 500000,
        orderCount: 50,
        visitCount: 100,
        collectionAmount: 300000
      },
      incentive: {
        enabled: true,
        type: 'Fixed',
        fixedAmount: 10000,
        percentage: 0,
        minAchievement: 80,
        slabs: []
      },
      notes: 'Test target created by script',
      status: 'Active'
    });

    await testTarget.save();
    console.log('✅ Target created:', testTarget.targetNumber);
    console.log('   Type:', testTarget.targetType);
    console.log('   Period:', startDate.toLocaleDateString(), '-', endDate.toLocaleDateString());
    console.log('   Sales Target: ₹', testTarget.targets.salesAmount.toLocaleString());
    console.log('   Order Target:', testTarget.targets.orderCount);
    console.log('   Visit Target:', testTarget.targets.visitCount);
    console.log('   Collection Target: ₹', testTarget.targets.collectionAmount.toLocaleString());

    // Fetch all targets
    console.log('\n📋 Fetching all targets...');
    const allTargets = await Target.find()
      .populate('salesExecutive', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(`✅ Found ${allTargets.length} targets:`);
    allTargets.forEach((target, index) => {
      console.log(`\n${index + 1}. ${target.targetNumber}`);
      console.log('   SE:', target.salesExecutiveName);
      console.log('   Type:', target.targetType);
      console.log('   Status:', target.status);
      console.log('   Achievement:', target.achievement?.overallPercentage || 0, '%');
      if (target.incentive?.enabled && target.incentive?.earned > 0) {
        console.log('   Incentive Earned: ₹', target.incentive.earned.toLocaleString());
      }
    });

    // Test statistics
    console.log('\n📊 Target Statistics:');
    const stats = await Target.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgAchievement: { $avg: '$achievement.overallPercentage' }
        }
      }
    ]);

    stats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} targets, Avg: ${stat.avgAchievement?.toFixed(1) || 0}%`);
    });

    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

testTargets();
