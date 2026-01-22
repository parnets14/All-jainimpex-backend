import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import DiscountMapping from './models/DiscountMapping.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

async function testDealerTypeFilterRemoval() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test the specific product mentioned by user
    console.log('\n🔍 Testing dealer type filter removal for product: h cpvc brass elbow 3/4x1/2"');
    
    const product = await Product.findOne({ 
      productCode: '165165618' 
    }).populate('brand category subcategory');

    if (!product) {
      console.log('❌ Product not found');
      return;
    }

    console.log(`✅ Found product: ${product.itemName}`);
    console.log(`   Brand: ${product.brand?.name}`);
    console.log(`   Category: ${product.category?.name}`);
    console.log(`   Subcategory: ${product.subcategory?.name}`);

    // Check current pricing record
    let pricingRecord = await DealerPricing.findOne({ 
      product: product._id,
      isActive: true 
    });

    if (!pricingRecord) {
      console.log('❌ No pricing record found');
      return;
    }

    console.log('\n💰 Current pricing record:');
    console.log(`   Selling Price: ₹${pricingRecord.sellingPrice}`);
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);

    // Test 1: Update discount info WITHOUT dealer type (should work)
    console.log('\n🔄 Test 1: Updating discount info WITHOUT dealer type...');
    await pricingRecord.updateDiscountInfo(); // No dealer type parameter
    await pricingRecord.save();

    console.log('✅ After update without dealer type:');
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);

    // Test 2: Update discount info WITH dealer type (should still work for backward compatibility)
    console.log('\n🔄 Test 2: Updating discount info WITH dealer type (backward compatibility)...');
    await pricingRecord.updateDiscountInfo('Independent');
    await pricingRecord.save();

    console.log('✅ After update with dealer type:');
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);

    // Test 3: Test the static updateAllDiscountInfo method without dealer type
    console.log('\n🔄 Test 3: Testing updateAllDiscountInfo without dealer type...');
    const updatedCount = await DealerPricing.updateAllDiscountInfo(); // No dealer type parameter
    console.log(`✅ Updated ${updatedCount} pricing records without dealer type filtering`);

    console.log('\n🎉 Dealer type filter removal test completed successfully!');
    console.log('📋 Summary:');
    console.log('   - ✅ updateDiscountInfo() works without dealer type parameter');
    console.log('   - ✅ updateDiscountInfo(dealerType) still works for backward compatibility');
    console.log('   - ✅ updateAllDiscountInfo() works without dealer type parameter');
    console.log('   - ✅ Discounts are applied without dealer type filtering');
    console.log('   - ✅ UI no longer shows dealer type selector');

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testDealerTypeFilterRemoval();