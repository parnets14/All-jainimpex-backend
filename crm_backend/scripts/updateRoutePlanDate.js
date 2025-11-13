import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import RoutePlan from '../SalesExecutiveAppBackend/models/RoutePlan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const updateRoutePlanDate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get the route plan
    const routePlanId = '691591ab2c65424f634e8b92';
    const routePlan = await RoutePlan.findById(routePlanId);

    if (!routePlan) {
      console.log('❌ Route plan not found');
      process.exit(1);
    }

    console.log('📋 Current Route Plan:');
    console.log('Date:', new Date(routePlan.date).toLocaleDateString());
    console.log('Status:', routePlan.status);
    console.log('Dealers:', routePlan.dealers.length);

    // Update to today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    routePlan.date = today;
    await routePlan.save();

    console.log('\n✅ Updated Route Plan:');
    console.log('New Date:', new Date(routePlan.date).toLocaleDateString());

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

updateRoutePlanDate();
