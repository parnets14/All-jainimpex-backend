import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

import Dealer from '../models/Dealer.js';
import User from '../models/User.js';

async function testDealersEndpoint() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find a sales executive user
    const user = await User.findOne({ role: 'Sales Executive' });
    if (!user) {
      console.log('❌ No Sales Executive found');
      return;
    }

    console.log('\n📋 User Info:');
    console.log('Name:', user.name);
    console.log('Region:', user.region);

    // Find dealers in user's region
    const dealers = await Dealer.find({
      region: { $in: user.region },
      isActive: true,
    })
      .select('name code city phone region')
      .sort({ name: 1 });

    console.log('\n👥 Dealers Found:', dealers.length);
    dealers.slice(0, 5).forEach(dealer => {
      console.log(`  - ${dealer.name} (${dealer.code}) - ${dealer.city || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testDealersEndpoint();
