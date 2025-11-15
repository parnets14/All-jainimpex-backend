import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClaimType from '../models/ClaimType.js';

dotenv.config();

const cleanupClaimTypes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Types to keep (as shown in your web CRM)
    const typesToKeep = ['Tea', 'Travel'];

    console.log('🗑️  Removing claim types NOT in your web CRM...\n');

    // Get all claim types
    const allTypes = await ClaimType.find().lean();

    for (const type of allTypes) {
      if (!typesToKeep.includes(type.name)) {
        await ClaimType.deleteOne({ _id: type._id });
        console.log(`❌ Deleted: ${type.name}`);
      } else {
        console.log(`✅ Kept: ${type.name}`);
      }
    }

    // Show remaining types
    console.log('\n📋 Remaining claim types:');
    const remainingTypes = await ClaimType.find({ isActive: true })
      .select('name description maxAmount')
      .sort({ name: 1 })
      .lean();

    remainingTypes.forEach((type, index) => {
      const maxAmount = type.maxAmount ? ` (Max: ₹${type.maxAmount})` : ' (No limit)';
      console.log(`${index + 1}. ${type.name}${maxAmount}`);
    });

    console.log(`\n✅ Cleanup complete! Now have ${remainingTypes.length} claim types.`);
    console.log('   Mobile app will now show only these types.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

cleanupClaimTypes();
