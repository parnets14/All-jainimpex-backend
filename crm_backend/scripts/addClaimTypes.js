import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClaimType from '../models/ClaimType.js';
import User from '../models/User.js';

dotenv.config();

const addClaimTypes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ No admin user found. Please create an admin user first.');
      return;
    }

    const claimTypes = [
      { name: 'Travel Allowance', description: 'Daily travel and transportation allowance', maxAmount: 5000 },
      { name: 'Food Allowance', description: 'Meal and food expenses', maxAmount: 1000 },
      { name: 'Accommodation', description: 'Hotel and lodging expenses', maxAmount: 3000 },
      { name: 'Fuel Reimbursement', description: 'Vehicle fuel expenses', maxAmount: 5000 },
      { name: 'Mobile & Internet', description: 'Communication expenses', maxAmount: 2000 },
      { name: 'Client Entertainment', description: 'Client meeting and entertainment', maxAmount: 3000 },
      { name: 'Conveyance', description: 'Local travel and conveyance', maxAmount: 2000 },
      { name: 'Medical Reimbursement', description: 'Medical and health expenses', maxAmount: 10000 },
      { name: 'Stationery', description: 'Office supplies and stationery', maxAmount: 1000 },
      { name: 'Vehicle Maintenance', description: 'Vehicle repair and maintenance', maxAmount: 5000 },
      { name: 'Parking & Tolls', description: 'Parking fees and toll charges', maxAmount: 500 },
      { name: 'Other Claims', description: 'Other miscellaneous claims', maxAmount: null },
    ];

    console.log('📝 Adding claim types...\n');

    for (const typeData of claimTypes) {
      // Check if type already exists
      const existing = await ClaimType.findOne({ name: typeData.name });
      if (existing) {
        console.log(`⏭️  Skipped: ${typeData.name} (already exists)`);
        continue;
      }

      const claimType = new ClaimType({
        ...typeData,
        isActive: true,
        createdBy: adminUser._id,
      });
      await claimType.save();
      console.log(`✅ Created: ${typeData.name}${typeData.maxAmount ? ` (Max: ₹${typeData.maxAmount})` : ''}`);
    }

    // Show all claim types
    console.log('\n📋 All claim types:');
    const allTypes = await ClaimType.find({ isActive: true })
      .select('name description maxAmount')
      .sort({ name: 1 })
      .lean();
    
    allTypes.forEach((type, index) => {
      const maxAmountText = type.maxAmount ? ` - Max: ₹${type.maxAmount}` : ' - No limit';
      console.log(`${index + 1}. ${type.name}${maxAmountText}`);
    });

    console.log(`\n✅ Total active claim types: ${allTypes.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

addClaimTypes();
