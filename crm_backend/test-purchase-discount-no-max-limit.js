import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PurchaseDiscountMapping from './models/PurchaseDiscountMapping.js';
import User from './models/User.js';
import Brand from './models/Brand.js';

// Load environment variables
dotenv.config();

const testPurchaseDiscountNoMaxLimit = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get a user for creating discounts
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No users found');
      return;
    }

    console.log(`👤 Using user: ${user.name}`);

    // Get a brand for testing
    const brand = await Brand.findOne();

    console.log('\n🧪 Testing Purchase Discount System WITHOUT Max Limit...\n');

    // Test 1: Create purchase discount with high direct discount (should work without max limit)
    console.log('📝 Test 1: Creating purchase discount with 25% direct discount...');
    const highDirectDiscount = new PurchaseDiscountMapping({
      discountName: 'High Volume Purchase Discount',
      description: 'High direct discount for bulk purchases - no max limit',
      brand: brand?._id,
      directDiscountPercentage: 25, // High percentage - would be restricted in sales discounts
      floatingDiscountEnabled: false,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      createdBy: user._id
    });

    await highDirectDiscount.save();
    console.log('✅ High direct discount created successfully:', highDirectDiscount.discountName);
    console.log(`   Direct Discount: ${highDirectDiscount.directDiscountPercentage}%`);

    // Test 2: Create purchase discount with very high floating discount range
    console.log('\n📝 Test 2: Creating purchase discount with wide floating range...');
    const wideFloatingDiscount = new PurchaseDiscountMapping({
      discountName: 'Negotiable Purchase Discount - Wide Range',
      description: 'Wide floating discount range for supplier negotiations',
      brand: brand?._id,
      directDiscountPercentage: 5, // Base discount
      floatingDiscountEnabled: true,
      floatingDiscountMin: 5,
      floatingDiscountMax: 50, // Very high max - would be restricted in sales discounts
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      createdBy: user._id
    });

    await wideFloatingDiscount.save();
    console.log('✅ Wide floating discount created successfully:', wideFloatingDiscount.discountName);
    console.log(`   Direct Discount: ${wideFloatingDiscount.directDiscountPercentage}%`);
    console.log(`   Floating Range: ${wideFloatingDiscount.floatingDiscountMin}% - ${wideFloatingDiscount.floatingDiscountMax}%`);

    // Test 3: Verify no maxDiscountPercentage field exists
    console.log('\n📝 Test 3: Verifying no maxDiscountPercentage field...');
    const allPurchaseDiscounts = await PurchaseDiscountMapping.find({});
    
    console.log(`📊 Found ${allPurchaseDiscounts.length} purchase discounts:`);
    allPurchaseDiscounts.forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount.discountName}`);
      console.log(`     Has maxDiscountPercentage field: ${discount.maxDiscountPercentage !== undefined ? 'YES (❌ ERROR)' : 'NO (✅ CORRECT)'}`);
      console.log(`     Direct: ${discount.directDiscountPercentage}%`);
      if (discount.floatingDiscountEnabled) {
        console.log(`     Floating: ${discount.floatingDiscountMin}%-${discount.floatingDiscountMax}%`);
      }
    });

    // Test 4: Test discount summary virtual
    console.log('\n📝 Test 4: Testing discount summary virtual field...');
    allPurchaseDiscounts.forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount.discountName}`);
      console.log(`     Summary: ${discount.discountSummary}`);
    });

    console.log('\n✅ Purchase Discount No Max Limit Test Complete!');
    console.log('\n💡 Key Differences from Sales Discounts:');
    console.log('  ✅ No maxDiscountPercentage field');
    console.log('  ✅ Can have high direct discounts (25%+)');
    console.log('  ✅ Can have wide floating ranges (up to 50%+)');
    console.log('  ✅ No artificial limits on discount percentages');
    console.log('  ✅ Simplified for supplier negotiations');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPurchaseDiscountNoMaxLimit();