import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Target from '../SalesExecutiveAppBackend/models/Target.js';
import { calculateTargetAchievement } from '../SalesExecutiveAppBackend/controllers/targetController.js';

dotenv.config();

const calculateAllTargets = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all active targets
    const activeTargets = await Target.find({ status: 'Active' });
    
    console.log(`📊 Found ${activeTargets.length} active targets\n`);

    if (activeTargets.length === 0) {
      console.log('ℹ️  No active targets to calculate');
      process.exit(0);
    }

    // Calculate achievement for each target
    for (const target of activeTargets) {
      console.log(`🔄 Calculating: ${target.targetNumber} (${target.salesExecutiveName})`);
      
      try {
        await calculateTargetAchievement(target._id);
        
        // Fetch updated target
        const updated = await Target.findById(target._id);
        const achievement = updated.achievement;
        
        console.log(`   ✅ Overall: ${achievement?.overallPercentage || 0}%`);
        console.log(`      Sales: ${achievement?.salesPercentage || 0}%`);
        console.log(`      Orders: ${achievement?.orderPercentage || 0}%`);
        console.log(`      Visits: ${achievement?.visitPercentage || 0}%`);
        console.log(`      Collections: ${achievement?.collectionPercentage || 0}%`);
        
        if (updated.incentive?.enabled && updated.incentive?.earned > 0) {
          console.log(`      💰 Incentive: ₹${updated.incentive.earned.toLocaleString()}`);
        }
        console.log('');
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`);
      }
    }

    console.log('✅ All calculations completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

calculateAllTargets();
