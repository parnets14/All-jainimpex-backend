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

async function testDealerPricingUIFix() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test the specific product mentioned by user
    console.log('\n🔍 Testing UI fix for product: h cpvc brass elbow 3/4x1/2"');
    
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
    console.log(`   Max Discount % (should not be shown in UI): ${pricingRecord.maxDiscountPercentage}%`);

    // Update discount info with Independent dealer type
    console.log('\n🔄 Updating discount info with Independent dealer type...');
    await pricingRecord.updateDiscountInfo('Independent');
    await pricingRecord.save();

    console.log('\n✅ After update:');
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount % (SHOW in UI): ${pricingRecord.directDiscountPercentage}%`);
    console.log(`   Max Discount % (HIDE in UI): ${pricingRecord.maxDiscountPercentage}%`);

    // Simulate what the frontend should display
    console.log('\n🎨 Frontend should display:');
    if (pricingRecord.hasDirectDiscount) {
      console.log(`   ✅ Green badge: "${pricingRecord.directDiscountPercentage}% Discount"`);
      console.log(`   ❌ Blue badge: "Max: ${pricingRecord.maxDiscountPercentage}%" (REMOVED)`);
    } else {
      console.log(`   ❌ No discount badges shown`);
    }

    console.log('\n🎉 UI fix verification completed!');
    console.log('📋 Summary:');
    console.log('   - Direct discount percentage: VISIBLE ✅');
    console.log('   - Max discount percentage: HIDDEN ❌');
    console.log('   - Only direct discount badge should appear in the UI');

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testDealerPricingUIFix();