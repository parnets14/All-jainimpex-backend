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

async function testDealerPricingDiscountFix() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // 1. Find the specific product mentioned by user
    console.log('\n🔍 Step 1: Finding the specific product...');
    const product = await Product.findOne({ 
      productCode: '165165618' 
    }).populate('brand category subcategory');

    if (!product) {
      console.log('❌ Product with code 165165618 not found');
      return;
    }

    console.log(`✅ Found product: ${product.itemName} (${product.productCode})`);
    console.log(`   Brand: ${product.brand?.name}`);
    console.log(`   Category: ${product.category?.name}`);
    console.log(`   Subcategory: ${product.subcategory?.name}`);
    console.log(`   Extended Level 1: ${product.subcategory1?.name || 'N/A'}`);
    console.log(`   Extended Level 2: ${product.subcategory2?.name || 'N/A'}`);

    // 2. Check existing DealerPricing record
    console.log('\n💰 Step 2: Checking existing DealerPricing record...');
    let pricingRecord = await DealerPricing.findOne({ 
      product: product._id,
      isActive: true 
    });

    if (pricingRecord) {
      console.log(`✅ Found existing pricing record:`);
      console.log(`   Selling Price: ₹${pricingRecord.sellingPrice}`);
      console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
      console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);
      console.log(`   Max Discount %: ${pricingRecord.maxDiscountPercentage}%`);
    } else {
      console.log('❌ No existing pricing record found');
      
      // Create one from rate slab if available
      if (product.rateSlabs && product.rateSlabs.length > 0) {
        console.log('🔄 Creating pricing record from rate slab...');
        pricingRecord = new DealerPricing({
          product: product._id,
          sellingPrice: product.rateSlabs[0].rate,
          purchasePrice: 0,
          isActive: true,
          createdBy: null
        });
        console.log(`✅ Created pricing record with selling price: ₹${pricingRecord.sellingPrice}`);
      } else {
        console.log('❌ No rate slab available to create pricing record');
        return;
      }
    }

    // 3. Check for applicable discounts without dealer type
    console.log('\n🔍 Step 3: Testing discount lookup without dealer type...');
    const discountsWithoutDealerType = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales'
    );

    console.log(`Found ${discountsWithoutDealerType.length} applicable discounts without dealer type:`);
    discountsWithoutDealerType.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.discountName || 'Unnamed'} (${discount.targetType})`);
      console.log(`      Target: ${discount.targetInfo?.targetName || 'N/A'}`);
      console.log(`      Type: ${discount.discountType}`);
      if (discount.discountType === 'direct' || discount.discountType === 'both') {
        console.log(`      Direct: ${discount.directDiscountPercentage}%`);
      }
      console.log(`      Max: ${discount.maxDiscountPercentage}%`);
    });

    // 4. Check for applicable discounts with Independent dealer type
    console.log('\n🔍 Step 4: Testing discount lookup with Independent dealer type...');
    const discountsWithDealerType = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales',
      'Independent'
    );

    console.log(`Found ${discountsWithDealerType.length} applicable discounts for Independent dealers:`);
    discountsWithDealerType.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.discountName || 'Unnamed'} (${discount.targetType})`);
      console.log(`      Target: ${discount.targetInfo?.targetName || 'N/A'}`);
      console.log(`      Type: ${discount.discountType}`);
      if (discount.discountType === 'direct' || discount.discountType === 'both') {
        console.log(`      Direct: ${discount.directDiscountPercentage}%`);
      }
      console.log(`      Max: ${discount.maxDiscountPercentage}%`);
    });

    // 5. Test updateDiscountInfo method without dealer type
    console.log('\n🔄 Step 5: Testing updateDiscountInfo without dealer type...');
    await pricingRecord.updateDiscountInfo();
    console.log(`After update without dealer type:`);
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);
    console.log(`   Max Discount %: ${pricingRecord.maxDiscountPercentage}%`);

    // 6. Test updateDiscountInfo method with Independent dealer type
    console.log('\n🔄 Step 6: Testing updateDiscountInfo with Independent dealer type...');
    await pricingRecord.updateDiscountInfo('Independent');
    console.log(`After update with Independent dealer type:`);
    console.log(`   Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
    console.log(`   Direct Discount %: ${pricingRecord.directDiscountPercentage}%`);
    console.log(`   Max Discount %: ${pricingRecord.maxDiscountPercentage}%`);

    // 7. Save the pricing record to see the final result
    console.log('\n💾 Step 7: Saving pricing record...');
    await pricingRecord.save();
    console.log('✅ Pricing record saved successfully');

    // 8. Verify by fetching fresh record
    console.log('\n🔍 Step 8: Verifying saved record...');
    const freshRecord = await DealerPricing.findOne({ 
      product: product._id,
      isActive: true 
    });

    if (freshRecord) {
      console.log(`✅ Fresh record verification:`);
      console.log(`   Has Direct Discount: ${freshRecord.hasDirectDiscount}`);
      console.log(`   Direct Discount %: ${freshRecord.directDiscountPercentage}%`);
      console.log(`   Max Discount %: ${freshRecord.maxDiscountPercentage}%`);
    }

    // 9. Test the static updateAllDiscountInfo method
    console.log('\n🔄 Step 9: Testing updateAllDiscountInfo with Independent dealer type...');
    const updatedCount = await DealerPricing.updateAllDiscountInfo('Independent');
    console.log(`✅ Updated ${updatedCount} pricing records with Independent dealer type`);

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testDealerPricingDiscountFix();