import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Category from './models/Category.js';

dotenv.config();

const testEnhancedDirectDiscounts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing ENHANCED Direct Discount Update...');

    // Get current state before update
    console.log('\n📊 BEFORE Update:');
    
    // Check "aa" category products (those with only rate slabs)
    const aaCategory = await Category.findOne({ name: 'aa' });
    if (aaCategory) {
      const aaProducts = await Product.find({ category: aaCategory._id });
      console.log(`📦 "aa" category products: ${aaProducts.length}`);
      
      for (const product of aaProducts) {
        const existingPricing = await DealerPricing.findOne({
          product: product._id,
          isActive: true
        });
        
        console.log(`   - ${product.itemName} (${product.productCode})`);
        console.log(`     Rate Slab: ₹${product.rateSlabs?.[0]?.rate || 0}`);
        console.log(`     Has DealerPricing: ${existingPricing ? 'Yes' : 'No'}`);
        if (existingPricing) {
          console.log(`     Direct Discount: ${existingPricing.hasDirectDiscount ? existingPricing.directDiscountPercentage + '%' : 'None'}`);
        }
      }
    }

    // Get total counts before
    const totalProductsBefore = await Product.countDocuments({});
    const totalPricingBefore = await DealerPricing.countDocuments({ isActive: true });
    
    console.log(`\n📊 Total products in database: ${totalProductsBefore}`);
    console.log(`📊 Total pricing records before: ${totalPricingBefore}`);

    // Test the ENHANCED updateAllDiscountInfo method
    console.log('\n🚀 Running ENHANCED updateAllDiscountInfo...');
    
    const updatedCount = await DealerPricing.updateAllDiscountInfo();
    
    console.log(`✅ Update completed! Updated ${updatedCount} records`);

    // Check state after update
    console.log('\n📊 AFTER Update:');
    
    const totalPricingAfter = await DealerPricing.countDocuments({ isActive: true });
    console.log(`📊 Total pricing records after: ${totalPricingAfter}`);
    console.log(`📊 New pricing records created: ${totalPricingAfter - totalPricingBefore}`);

    // Check "aa" category products again
    if (aaCategory) {
      const aaProducts = await Product.find({ category: aaCategory._id });
      console.log(`\n📦 "aa" category products after update:`);
      
      for (const product of aaProducts) {
        const pricingAfter = await DealerPricing.findOne({
          product: product._id,
          isActive: true
        });
        
        console.log(`   - ${product.itemName} (${product.productCode})`);
        console.log(`     Rate Slab: ₹${product.rateSlabs?.[0]?.rate || 0}`);
        console.log(`     Has DealerPricing: ${pricingAfter ? 'Yes' : 'No'}`);
        if (pricingAfter) {
          console.log(`     Selling Price: ₹${pricingAfter.sellingPrice}`);
          console.log(`     Direct Discount: ${pricingAfter.hasDirectDiscount ? pricingAfter.directDiscountPercentage + '%' : 'None'}`);
          console.log(`     Max Discount: ${pricingAfter.maxDiscountPercentage}%`);
        }
      }
    }

    // Check products with direct discounts
    const productsWithDirectDiscounts = await DealerPricing.find({
      isActive: true,
      hasDirectDiscount: true
    }).populate('product', 'itemName productCode');

    console.log(`\n💰 Products with direct discounts: ${productsWithDirectDiscounts.length}`);
    productsWithDirectDiscounts.forEach((pricing, index) => {
      console.log(`${index + 1}. ${pricing.product.itemName} - ${pricing.directDiscountPercentage}% direct discount`);
    });

    console.log('\n✅ ENHANCEMENT RESULTS:');
    console.log(`   - Products processed: ${updatedCount}`);
    console.log(`   - New pricing records: ${totalPricingAfter - totalPricingBefore}`);
    console.log(`   - Products with direct discounts: ${productsWithDirectDiscounts.length}`);
    console.log('\n🎯 Now ALL products (including Rate Slab only) will show direct discounts in the frontend!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testEnhancedDirectDiscounts();