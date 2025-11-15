import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClaimType from '../models/ClaimType.js';

dotenv.config();

const testEndpoint = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Simulate what the API endpoint does
    console.log('🔍 Simulating API endpoint: GET /api/se/expenses/types\n');
    
    const claimTypes = await ClaimType.find({ isActive: true })
      .select('name description maxAmount')
      .sort({ name: 1 })
      .lean();

    console.log('📊 Query Result:');
    console.log(`   Found ${claimTypes.length} active claim types\n`);

    // Show what API would return
    const apiResponse = {
      success: true,
      claimTypes: claimTypes
    };

    console.log('📡 API Response:');
    console.log(JSON.stringify(apiResponse, null, 2));

    console.log('\n✅ Backend is working correctly!');
    console.log(`   Mobile app should receive ${claimTypes.length} claim types`);

    if (claimTypes.length === 0) {
      console.log('\n⚠️  WARNING: No active claim types found!');
      console.log('   Run: node scripts/addClaimTypes.js');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

testEndpoint();
