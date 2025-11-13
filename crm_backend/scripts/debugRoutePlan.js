import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import RoutePlan from '../SalesExecutiveAppBackend/models/RoutePlan.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const debugRoutePlan = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get the sales executive
    const se = await User.findOne({ email: 'sales@gmail.com' });
    console.log('👤 Sales Executive:');
    console.log('   ID:', se._id.toString());
    console.log('   Name:', se.name);
    console.log('   Email:', se.email);

    // Check today's date calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('\n📅 Date Range:');
    console.log('   Today (start):', today.toISOString());
    console.log('   Tomorrow (end):', tomorrow.toISOString());

    // Find route plans with different queries
    console.log('\n🔍 Query 1: All route plans for this SE');
    const allPlans = await RoutePlan.find({ salesExecutive: se._id }).lean();
    console.log(`   Found: ${allPlans.length} plans`);
    allPlans.forEach(plan => {
      console.log(`   - Date: ${new Date(plan.date).toISOString()}, Status: ${plan.status}`);
    });

    console.log('\n🔍 Query 2: Route plans for today (exact match)');
    const todayPlans = await RoutePlan.find({
      salesExecutive: se._id,
      date: { $gte: today, $lt: tomorrow }
    }).lean();
    console.log(`   Found: ${todayPlans.length} plans`);
    todayPlans.forEach(plan => {
      console.log(`   - Date: ${new Date(plan.date).toISOString()}, Status: ${plan.status}`);
    });

    console.log('\n🔍 Query 3: Check if date is within range');
    allPlans.forEach(plan => {
      const planDate = new Date(plan.date);
      const isInRange = planDate >= today && planDate < tomorrow;
      console.log(`   Plan date: ${planDate.toISOString()}`);
      console.log(`   Is >= today? ${planDate >= today}`);
      console.log(`   Is < tomorrow? ${planDate < tomorrow}`);
      console.log(`   In range? ${isInRange}`);
    });

    // Try to populate and see the full data
    console.log('\n📋 Full Route Plan Data:');
    const fullPlan = await RoutePlan.findOne({ salesExecutive: se._id })
      .populate('dealers.dealer', 'name code address phone')
      .lean();
    
    if (fullPlan) {
      console.log('   ID:', fullPlan._id);
      console.log('   Date:', new Date(fullPlan.date).toISOString());
      console.log('   Status:', fullPlan.status);
      console.log('   Dealers count:', fullPlan.dealers?.length);
      console.log('   Dealers:', JSON.stringify(fullPlan.dealers, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugRoutePlan();
