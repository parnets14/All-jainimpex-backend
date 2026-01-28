import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';

dotenv.config();

// Test script to add extra discount to a supplier
async function testSupplierExtraDiscountSave() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Testing Supplier Extra Discount Save...\n');

    // Find the most recent supplier
    const supplier = await Supplier.findOne({}).sort({ updatedAt: -1 });
    
    if (!supplier) {
      console.log('❌ No suppliers found in database');
      return;
    }

    console.log(`📋 Found supplier: ${supplier.name} (ID: ${supplier._id})`);
    console.log(`   Current extra discounts: ${supplier.extraDiscounts?.length || 0}`);

    // Add a test extra discount
    const testDiscount = {
      targetType: 'category',
      targetId: new mongoose.Types.ObjectId('6979b7b3be2f2eaac8767ba8'), // Use a real category ID
      targetName: 'first category',
      discountPercentage: 15,
      description: 'Test extra discount for category',
      isActive: true
    };

    // Update the supplier with extra discount
    supplier.extraDiscounts = supplier.extraDiscounts || [];
    supplier.extraDiscounts.push(testDiscount);

    console.log('💾 Saving supplier with extra discount...');
    await supplier.save();
    console.log('✅ Supplier saved successfully');

    // Verify the save
    const updatedSupplier = await Supplier.findById(supplier._id);
    console.log(`\n📊 Verification:`);
    console.log(`   Extra discounts count: ${updatedSupplier.extraDiscounts?.length || 0}`);
    
    if (updatedSupplier.extraDiscounts && updatedSupplier.extraDiscounts.length > 0) {
      console.log('   Extra discounts details:');
      updatedSupplier.extraDiscounts.forEach((discount, index) => {
        console.log(`   ${index + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
        console.log(`      Target ID: ${discount.targetId}`);
        console.log(`      Description: ${discount.description}`);
        console.log(`      Active: ${discount.isActive}`);
        console.log(`      Created: ${discount.createdAt}`);
      });
    }

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Error testing supplier extra discount save:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testSupplierExtraDiscountSave();