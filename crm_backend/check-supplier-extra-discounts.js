import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';

dotenv.config();

// Test script to check supplier extra discounts in database
async function checkSupplierExtraDiscounts() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Checking Supplier Extra Discounts...\n');

    // Find all suppliers with extra discounts
    const suppliersWithDiscounts = await Supplier.find({ 
      extraDiscounts: { $exists: true, $ne: [] } 
    });

    console.log(`📊 Found ${suppliersWithDiscounts.length} suppliers with extra discounts`);

    if (suppliersWithDiscounts.length > 0) {
      suppliersWithDiscounts.forEach((supplier, index) => {
        console.log(`\n${index + 1}. Supplier: ${supplier.name} (ID: ${supplier._id})`);
        console.log(`   Extra Discounts: ${supplier.extraDiscounts?.length || 0}`);
        
        if (supplier.extraDiscounts && supplier.extraDiscounts.length > 0) {
          supplier.extraDiscounts.forEach((discount, discountIndex) => {
            console.log(`   ${discountIndex + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
            console.log(`      Target ID: ${discount.targetId}`);
            console.log(`      Description: ${discount.description || 'N/A'}`);
            console.log(`      Active: ${discount.isActive !== false ? 'Yes' : 'No'}`);
            console.log(`      Created: ${discount.createdAt || 'N/A'}`);
          });
        }
      });
    } else {
      console.log('⚠️ No suppliers found with extra discounts');
      
      // Check if there are any suppliers at all
      const allSuppliers = await Supplier.find({});
      console.log(`📊 Total suppliers in database: ${allSuppliers.length}`);
      
      if (allSuppliers.length > 0) {
        console.log('\n📋 Recent suppliers:');
        allSuppliers.slice(-5).forEach((supplier, index) => {
          console.log(`${index + 1}. ${supplier.name} (ID: ${supplier._id})`);
          console.log(`   Has extraDiscounts field: ${supplier.extraDiscounts ? 'Yes' : 'No'}`);
          console.log(`   ExtraDiscounts length: ${supplier.extraDiscounts?.length || 0}`);
        });
      }
    }

    // Check the most recently updated supplier
    const recentSupplier = await Supplier.findOne({}).sort({ updatedAt: -1 });
    if (recentSupplier) {
      console.log(`\n🕒 Most recently updated supplier: ${recentSupplier.name}`);
      console.log(`   Updated at: ${recentSupplier.updatedAt}`);
      console.log(`   Has extraDiscounts: ${recentSupplier.extraDiscounts ? 'Yes' : 'No'}`);
      console.log(`   ExtraDiscounts count: ${recentSupplier.extraDiscounts?.length || 0}`);
      
      if (recentSupplier.extraDiscounts && recentSupplier.extraDiscounts.length > 0) {
        console.log('   Extra Discounts Details:');
        recentSupplier.extraDiscounts.forEach((discount, index) => {
          console.log(`   ${index + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error checking supplier extra discounts:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the check
checkSupplierExtraDiscounts();