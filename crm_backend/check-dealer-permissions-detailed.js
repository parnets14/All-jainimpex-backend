import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function checkDealerPermissions() {
  try {
    console.log('🔍 CHECKING DEALER PERMISSIONS IN DETAIL');
    console.log('=' .repeat(50));
    
    // Get all dealers with their full data
    const dealers = await Dealer.find({}).select('name dealerType allowedBrands allowedCategories allowedSubcategories allowedExtendedSubcategories');
    
    console.log('📊 Total dealers:', dealers.length);
    
    dealers.forEach(dealer => {
      console.log(`\n👤 ${dealer.name} (${dealer.dealerType})`);
      console.log('  ID:', dealer._id.toString());
      console.log('  Product Permissions:');
      console.log(`    - Brands: ${dealer.allowedBrands?.length || 0}`);
      console.log(`    - Categories: ${dealer.allowedCategories?.length || 0}`);
      console.log(`    - Subcategories: ${dealer.allowedSubcategories?.length || 0}`);
      console.log(`    - Extended: ${dealer.allowedExtendedSubcategories?.length || 0}`);
      
      const hasPermissions = (dealer.allowedBrands?.length > 0) || 
                           (dealer.allowedCategories?.length > 0) || 
                           (dealer.allowedSubcategories?.length > 0) || 
                           (dealer.allowedExtendedSubcategories?.length > 0);
      
      if (hasPermissions) {
        console.log('  ✅ Has product permissions');
        if (dealer.allowedBrands?.length > 0) {
          console.log(`    Brands: ${dealer.allowedBrands.join(', ')}`);
        }
        if (dealer.allowedCategories?.length > 0) {
          console.log(`    Categories: ${dealer.allowedCategories.join(', ')}`);
        }
        if (dealer.allowedSubcategories?.length > 0) {
          console.log(`    Subcategories: ${dealer.allowedSubcategories.join(', ')}`);
        }
        if (dealer.allowedExtendedSubcategories?.length > 0) {
          console.log(`    Extended: ${dealer.allowedExtendedSubcategories.join(', ')}`);
        }
      } else {
        console.log('  ⚠️ No product permissions set!');
      }
    });
    
    // Check if there are any dealers with permissions
    const dealersWithPermissions = dealers.filter(d => 
      (d.allowedBrands?.length > 0) || 
      (d.allowedCategories?.length > 0) || 
      (d.allowedSubcategories?.length > 0) || 
      (d.allowedExtendedSubcategories?.length > 0)
    );
    console.log(`\n📈 Dealers with permissions: ${dealersWithPermissions.length}/${dealers.length}`);
    
    if (dealersWithPermissions.length === 0) {
      console.log('\n❌ NO DEALERS HAVE PRODUCT PERMISSIONS SET!');
      console.log('🔧 This explains why no products are showing in Sales Order Dashboard');
      console.log('💡 Need to set product permissions for dealers in Dealer Master');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkDealerPermissions();