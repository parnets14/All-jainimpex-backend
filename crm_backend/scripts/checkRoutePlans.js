import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import RoutePlan from '../SalesExecutiveAppBackend/models/RoutePlan.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const checkRoutePlans = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get all route plans
    const routePlans = await RoutePlan.find({})
      .populate('salesExecutive', 'name email phone')
      .lean();

    console.log(`📋 Found ${routePlans.length} route plans:\n`);

    for (const plan of routePlans) {
      console.log('-----------------------------------');
      console.log('Route Plan ID:', plan._id);
      console.log('Sales Executive:', plan.salesExecutive?.name, `(${plan.salesExecutive?.email})`);
      console.log('Sales Executive ID:', plan.salesExecutive?._id);
      console.log('Date:', new Date(plan.date).toLocaleDateString());
      console.log('Status:', plan.status);
      console.log('Dealers:', plan.dealers?.length || 0);
      console.log('Created:', new Date(plan.createdAt).toLocaleString());
      console.log('');
    }

    // Get all sales executives
    console.log('\n📋 Sales Executives:\n');
    const salesExecs = await User.find({ role: 'sales_executive' }).lean();
    
    for (const se of salesExecs) {
      console.log('-----------------------------------');
      console.log('Name:', se.name);
      console.log('Email:', se.email);
      console.log('ID:', se._id);
      console.log('');
    }

    // Check today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('\n📅 Today\'s date range:');
    console.log('From:', today);
    console.log('To:', tomorrow);

    const todayPlans = await RoutePlan.find({
      date: { $gte: today, $lt: tomorrow }
    }).populate('salesExecutive', 'name email').lean();

    console.log(`\n📋 Route plans for today: ${todayPlans.length}`);
    todayPlans.forEach(plan => {
      console.log(`  - ${plan.salesExecutive?.name} (${plan.salesExecutive?.email})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkRoutePlans();
