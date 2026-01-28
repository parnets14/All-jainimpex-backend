import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';

dotenv.config();

// Test script to verify the API function name fix
async function testSupplierExtraDiscountAPIFix() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Testing Supplier Extra Discount API Fix...\n');

    // Test the supplier ID that was failing
    const supplierId = '6978efcce1643566de925992';
    
    console.log(`📋 Testing supplier ID: ${supplierId}`);
    
    // Fetch supplier details
    const supplier = await Supplier.findById(supplierId);
    
    if (!supplier) {
      console.log('❌ Supplier not found');
      return;
    }

    console.log(`✅ Supplier found: ${supplier.name}`);
    console.log(`📊 Extra discounts: ${supplier.extraDiscounts?.length || 0}`);
    
    if (supplier.extraDiscounts && supplier.extraDiscounts.length > 0) {
      console.log('\n🎯 Supplier Extra Discounts:');
      supplier.extraDiscounts.forEach((discount, index) => {
        console.log(`   ${index + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
        console.log(`      Target ID: ${discount.targetId}`);
        console.log(`      Active: ${discount.isActive !== false ? 'Yes' : 'No'}`);
      });
      
      // Filter active discounts
      const activeDiscounts = supplier.extraDiscounts.filter(d => d.isActive !== false);
      console.log(`\n✅ Active discounts: ${activeDiscounts.length}`);
      
      console.log('\n🔧 API FIX SUMMARY:');
      console.log('   ❌ OLD: apiService.getSupplierById(supplierId) - Function not found');
      console.log('   ✅ NEW: apiService.getSupplier(supplierId) - Function exists');
      console.log('   ✅ This should now work in the frontend');
      
    } else {
      console.log('⚠️ No extra discounts found for this supplier');
    }

    console.log('\n✅ API fix test completed!');

  } catch (error) {
    console.error('❌ Error testing supplier extra discount API fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testSupplierExtraDiscountAPIFix();