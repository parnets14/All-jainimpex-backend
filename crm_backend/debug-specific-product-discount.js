import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import DealerPricing from './models/DealerPricing.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function debugSpecificProductDiscount() {
  try {
    console.log('🔍 DEBUGGING SPECIFIC PRODUCT DISCOUNT ISSUE');
    console.log('=' .repeat(70));
    
    // 1. Find the specific product
    console.log('\n📦 Step 1: Finding the specific product...');
    const product = await Product.findOne({ productCode: '165165618' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    if (!product) {
      console.log('❌ Product not found with code: 165165618');
      return;
    }
    
    console.log('✅ Product found:');
    console.log(`  Code: ${product.productCode}`);
    console.log(`  Name: ${product.itemName}`);
    console.log(`  Brand: ${product.brand?.name} (${product.brand?._id})`);
    console.log(`  Category: ${product.category?.name} (${product.category?._id})`);
    console.log(`  Subcategory: ${product.subcategory?.name} (${product.subcategory?._id})`);
    console.log(`  Extended L1: ${product.subcategory1 || 'null (basic hierarchy only)'}`);
    console.log(`  Status: ${product.status}`);
    
    // 2. Check for category-level discounts
    console.log('\n💰 Step 2: Checking for category-level discounts...');
    
    const categoryDiscounts = await DiscountMapping.find({
      targetType: 'category',
      category: product.category._id,
      isActive: true,
      status: 'Approved'
    });
    
    console.log(`📊 Category-level discounts found: ${categoryDiscounts.length}`);
    
    if (categoryDiscounts.length > 0) {
      categoryDiscounts.forEach((discount, index) => {
        console.log(`\n  ${index + 1}. Discount: ${discount.discountName}`);
        console.log(`     Type: ${discount.discountType}`);
        console.log(`     Target: ${discount.targetType}`);
        console.log(`     Sales Type: ${discount.salesType}`);
        console.log(`     Dealer Type: ${discount.dealerType}`);
        console.log(`     Direct %: ${discount.directDiscountPercentage || 'N/A'}`);
        console.log(`     Status: ${discount.status}`);
        console.log(`     Active: ${discount.isActive}`);
        console.log(`     Valid From: ${discount.validFrom}`);
        console.log(`     Valid To: ${discount.validTo}`);
      });
    }
    
    // 3. Test the findApplicableDiscounts method
    console.log('\n🧪 Step 3: Testing findApplicableDiscounts method...');
    
    // Test without dealer type
    console.log('\n🔍 Testing without dealer type...');
    const discountsWithoutDealerType = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales'
    );
    console.log(`📊 Discounts found (no dealer type): ${discountsWithoutDealerType.length}`);
    
    // Test with Independent dealer type
    console.log('\n🔍 Testing with Independent dealer type...');
    const discountsWithDealerType = await DiscountMapping.findApplicableDiscounts(
      product._id,
      'sales',
      'Independent'
    );
    console.log(`📊 Discounts found (Independent): ${discountsWithDealerType.length}`);
    
    if (discountsWithDealerType.length > 0) {
      console.log('\n✅ Applicable discounts for Independent dealers:');
      discountsWithDealerType.forEach((discount, index) => {
        console.log(`  ${index + 1}. ${discount.discountName}`);
        console.log(`     Target: ${discount.targetType}`);
        console.log(`     Type: ${discount.discountType}`);
        console.log(`     Direct %: ${discount.directDiscountPercentage || 'N/A'}`);
        console.log(`     Priority: ${discount.priority}`);
      });
    }
    
    // 4. Check current DealerPricing record
    console.log('\n💰 Step 4: Checking current DealerPricing record...');
    
    const pricingRecord = await DealerPricing.findOne({ 
      product: product._id, 
      isActive: true 
    });
    
    if (pricingRecord) {
      console.log('✅ DealerPricing record found:');
      console.log(`  Selling Price: ₹${pricingRecord.sellingPrice}`);
      console.log(`  Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
      console.log(`  Direct Discount %: ${pricingRecord.directDiscountPercentage}`);
      console.log(`  Max Discount %: ${pricingRecord.maxDiscountPercentage}`);
      console.log(`  Last Updated: ${pricingRecord.updatedAt}`);
    } else {
      console.log('❌ No DealerPricing record found');
      console.log('💡 This might be why discount is not showing');
    }
    
    // 5. Test updating discount info
    console.log('\n🔄 Step 5: Testing discount info update...');
    
    if (pricingRecord) {
      console.log('🔄 Updating discount info for existing record...');
      await pricingRecord.updateDiscountInfo('Independent');
      await pricingRecord.save();
      
      console.log('✅ Updated DealerPricing record:');
      console.log(`  Has Direct Discount: ${pricingRecord.hasDirectDiscount}`);
      console.log(`  Direct Discount %: ${pricingRecord.directDiscountPercentage}`);
      console.log(`  Max Discount %: ${pricingRecord.maxDiscountPercentage}`);
    } else {
      console.log('🔄 Creating new DealerPricing record...');
      const newPricing = new DealerPricing({
        product: product._id,
        sellingPrice: product.rateSlabs?.[0]?.rate || 0,
        purchasePrice: 0,
        isActive: true
      });
      
      await newPricing.updateDiscountInfo('Independent');
      await newPricing.save();
      
      console.log('✅ Created new DealerPricing record:');
      console.log(`  Selling Price: ₹${newPricing.sellingPrice}`);
      console.log(`  Has Direct Discount: ${newPricing.hasDirectDiscount}`);
      console.log(`  Direct Discount %: ${newPricing.directDiscountPercentage}`);
      console.log(`  Max Discount %: ${newPricing.maxDiscountPercentage}`);
    }
    
    console.log('\n📋 SUMMARY:');
    console.log(`✅ Product: ${product.productCode} - ${product.itemName}`);
    console.log(`✅ Category: ${product.category?.name}`);
    console.log(`✅ Category discounts: ${categoryDiscounts.length}`);
    console.log(`✅ Applicable discounts (Independent): ${discountsWithDealerType.length}`);
    
    if (discountsWithDealerType.length > 0) {
      console.log('\n🎯 EXPECTED RESULT:');
      console.log('   - Product SHOULD show direct discount in Dealer Pricing');
      console.log('   - Discount should be applied from category-level discount');
      console.log('   - After running "Update Discounts" button, it should appear');
    } else {
      console.log('\n🚨 ISSUE IDENTIFIED:');
      console.log('   - No applicable discounts found for this product');
      console.log('   - Check if discount is properly configured for Independent dealers');
      console.log('   - Check if discount is active and approved');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugSpecificProductDiscount();