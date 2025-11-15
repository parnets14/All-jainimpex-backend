import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClaimType from '../models/ClaimType.js';

dotenv.config();

const checkClaimTypes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Get all claim types
    const allTypes = await ClaimType.find()
      .select('name description maxAmount isActive')
      .sort({ name: 1 })
      .lean();

    console.log(`📋 Total claim types in database: ${allTypes.length}\n`);

    allTypes.forEach((type, index) => {
      const status = type.isActive ? '✅ Active' : '❌ Inactive';
      const maxAmount = type.maxAmount ? ` - Max: ₹${type.maxAmount}` : ' - No limit';
      console.log(`${index + 1}. ${type.name} ${status}${maxAmount}`);
      console.log(`   ID: ${type._id}`);
      if (type.description) {
        console.log(`   Description: ${type.description}`);
      }
      console.log('');
    });

    // Get only active types (what API returns)
    const activeTypes = await ClaimType.find({ isActive: true })
      .select('name description maxAmount')
      .sort({ name: 1 })
      .lean();

    console.log(`\n🔵 Active claim types (API returns ${activeTypes.length}):`);
    activeTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

checkClaimTypes();
