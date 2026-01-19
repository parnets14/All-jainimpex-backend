import mongoose from 'mongoose';
import Dealer from './models/Dealer.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkDealerPermissions = async () => {
  await connectDB();
  
  try {
    // Get all dealers and check their permissions
    const dealers = await Dealer.find().select('name allowedBrands allowedCategories allowedSubcategories allowedExtendedSubcategories');
    
    console.log(`📊 Found ${dealers.length} dealers in database`);
    
    dealers.forEach((dealer, index) => {
      console.log(`\n${index + 1}. Dealer: ${dealer.name}`);
      console.log(`   - Allowed Brands: ${dealer.allowedBrands?.length || 0}`);
      console.log(`   - Allowed Categories: ${dealer.allowedCategories?.length || 0}`);
      console.log(`   - Allowed Subcategories: ${dealer.allowedSubcategories?.length || 0}`);
      console.log(`   - Allowed Extended: ${dealer.allowedExtendedSubcategories?.length || 0}`);
      
      const hasPermissions = (dealer.allowedBrands?.length || 0) > 0 ||
                           (dealer.allowedCategories?.length || 0) > 0 ||
                           (dealer.allowedSubcategories?.length || 0) > 0 ||
                           (dealer.allowedExtendedSubcategories?.length || 0) > 0;
      
      console.log(`   - Has Permissions: ${hasPermissions ? '✅ YES' : '❌ NO'}`);
      
      if (hasPermissions) {
        console.log(`   - Brand IDs: ${dealer.allowedBrands?.join(', ') || 'None'}`);
        console.log(`   - Category IDs: ${dealer.allowedCategories?.join(', ') || 'None'}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Check error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');
  }
};

checkDealerPermissions();