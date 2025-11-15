import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ExpenseType from '../models/ExpenseType.js';
import User from '../models/User.js';

dotenv.config();

const testExpenseTypes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check existing expense types
    console.log('📋 Checking existing expense types...');
    const expenseTypes = await ExpenseType.find().lean();
    console.log(`Found ${expenseTypes.length} expense types:\n`);
    
    expenseTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.name}`);
      console.log(`   - Active: ${type.isActive}`);
      console.log(`   - Description: ${type.description || 'N/A'}`);
      console.log(`   - ID: ${type._id}\n`);
    });

    // Check active expense types (what the API returns)
    const activeTypes = await ExpenseType.find({ isActive: true })
      .select('name description')
      .sort({ name: 1 })
      .lean();
    
    console.log(`\n✅ Active expense types (API will return ${activeTypes.length}):`);
    activeTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.name} (${type._id})`);
    });

    // If no expense types exist, create sample ones
    if (expenseTypes.length === 0) {
      console.log('\n⚠️  No expense types found. Creating sample expense types...');
      
      const adminUser = await User.findOne({ role: 'admin' });
      if (!adminUser) {
        console.log('❌ No admin user found. Please create an admin user first.');
        return;
      }

      const sampleTypes = [
        { name: 'Travel', description: 'Travel and transportation expenses' },
        { name: 'Food', description: 'Food and meal expenses' },
        { name: 'Accommodation', description: 'Hotel and lodging expenses' },
        { name: 'Fuel', description: 'Vehicle fuel expenses' },
        { name: 'Communication', description: 'Phone and internet expenses' },
        { name: 'Entertainment', description: 'Client entertainment expenses' },
        { name: 'Office Supplies', description: 'Office supplies and stationery' },
        { name: 'Other', description: 'Other miscellaneous expenses' },
      ];

      for (const typeData of sampleTypes) {
        const expenseType = new ExpenseType({
          ...typeData,
          isActive: true,
          createdBy: adminUser._id,
        });
        await expenseType.save();
        console.log(`✅ Created: ${typeData.name}`);
      }

      console.log('\n✅ Sample expense types created successfully!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

testExpenseTypes();
