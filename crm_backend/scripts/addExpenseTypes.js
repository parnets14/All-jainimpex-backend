import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExpenseType from '../models/ExpenseType.js';
import User from '../models/User.js';

dotenv.config();

const addExpenseTypes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ No admin user found. Please create an admin user first.');
      return;
    }

    const newTypes = [
      { name: 'Travel', description: 'Travel and transportation expenses' },
      { name: 'Food & Meals', description: 'Food and meal expenses' },
      { name: 'Accommodation', description: 'Hotel and lodging expenses' },
      { name: 'Fuel', description: 'Vehicle fuel expenses' },
      { name: 'Communication', description: 'Phone and internet expenses' },
      { name: 'Client Entertainment', description: 'Client entertainment expenses' },
      { name: 'Office Supplies', description: 'Office supplies and stationery' },
      { name: 'Vehicle Maintenance', description: 'Vehicle repair and maintenance' },
      { name: 'Parking & Tolls', description: 'Parking fees and toll charges' },
      { name: 'Other', description: 'Other miscellaneous expenses' },
    ];

    console.log('📝 Adding new expense types...\n');

    for (const typeData of newTypes) {
      // Check if type already exists
      const existing = await ExpenseType.findOne({ name: typeData.name });
      if (existing) {
        console.log(`⏭️  Skipped: ${typeData.name} (already exists)`);
        continue;
      }

      const expenseType = new ExpenseType({
        ...typeData,
        isActive: true,
        createdBy: adminUser._id,
      });
      await expenseType.save();
      console.log(`✅ Created: ${typeData.name}`);
    }

    // Show all expense types
    console.log('\n📋 All expense types:');
    const allTypes = await ExpenseType.find({ isActive: true })
      .select('name description')
      .sort({ name: 1 })
      .lean();
    
    allTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.name}`);
    });

    console.log(`\n✅ Total active expense types: ${allTypes.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

addExpenseTypes();
