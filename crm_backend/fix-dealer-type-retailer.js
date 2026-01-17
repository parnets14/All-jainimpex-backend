// Fix DealerType "Retailer" to "Retail" to match Dealer model enum
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DealerType from './models/Dealertype.js';

dotenv.config();

const fixDealerType = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('✅ Connected to MongoDB');

    // Find "Retailer" dealer type
    const retailerType = await DealerType.findOne({ name: 'Retailer' });
    
    if (retailerType) {
      console.log('📋 Found DealerType:', retailerType.name);
      
      // Update to "Retail"
      retailerType.name = 'Retail';
      await retailerType.save();
      
      console.log('✅ Updated DealerType from "Retailer" to "Retail"');
    } else {
      console.log('⚠️ No DealerType with name "Retailer" found');
      
      // Check what dealer types exist
      const allTypes = await DealerType.find({});
      console.log('📋 Existing DealerTypes:', allTypes.map(t => t.name));
    }

    // Verify the fix
    const allTypesAfter = await DealerType.find({});
    console.log('\n📊 Final DealerTypes:', allTypesAfter.map(t => t.name));
    
    // Check if we have the required types
    const requiredTypes = ['Wholesale', 'Retail', 'Distributor'];
    const existingTypeNames = allTypesAfter.map(t => t.name);
    
    console.log('\n🔍 Checking required types:');
    requiredTypes.forEach(type => {
      if (existingTypeNames.includes(type)) {
        console.log(`  ✅ ${type} - exists`);
      } else {
        console.log(`  ❌ ${type} - missing`);
      }
    });

    mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixDealerType();
