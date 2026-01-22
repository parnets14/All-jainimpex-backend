import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DiscountMapping from './models/DiscountMapping.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function debugDealerPricingDiscountIssue() {
  try {
    console.log('🔍 DEBUGGING DEALER PRICING DISCOUNT ISSUE');
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
    
    // 2. Check for discounts targeting this product's category
    console.log('\n💰 Step 2: Checking for category-level discounts...');
    
    const categoryDiscounts = await DiscountMapping.find({
      targetType: 'category',
      targetId: product.category._id,
      isActive: true
    });
    
    console.log(`📊 Category-level discounts found: ${categoryDiscounts.length}`);
    
    if (categoryDiscounts.length > 0) {
      categoryDiscounts.forEach((discount, index) => {
        console.log(`\n  ${index + 1}. Discount: ${discount.discountName}`);
        console.log(`     Type: ${discount.discountType}`);
        console.log(`     Target: ${discount.targetType} (${discount.targetId})`);
        console.log(`     Sales Type: ${discount.salesType}`);
        console.log(`     Dealer Type: ${discount.dealerType}`);
        console.log(`     Direct %: ${discount.directDiscountPercentage || 'N/A'}`);
        console.log(`     Levels: ${discount.levels?.length || 0}`);
        console.log(`     Active: ${discount.isActive}`);
      });
    }
    
    // 3. Check for other discount types
    console.log('\n💰 Step 3: Checking for other discount types...');
    
    // Brand-level discounts
    const brandDiscounts = await DiscountMapping.find({
      targetType: 'brand',
      targetId: product.brand._id,
      isActive: true
    });
    console.log(`📊 Brand-level discounts: ${brandDiscounts.length}`);
    
    // Subcategory-level discounts
    const subcategoryDiscounts = await DiscountMapping.find({
      targetType: 'subcategory',
      targetId: product.subcategory._id,
      isActive: true
    });
    console.log(`📊 Subcategory-level discounts: ${subcategoryDiscounts.length}`);
    
    // Product-level discounts
    const productDiscounts = await DiscountMapping.find({
      targetType: 'product',
      targetId: product._id,
      isActive: true
    });
    console.log(`📊 Product-level discounts: ${productDiscounts.length}`);
    
    // 4. Test the discount API call
    console.log('\n🧪 Step 4: Testing discount API logic...');
    
    // Simulate the getApplicableDiscounts API call
    const dealerType = 'Independent'; // Ravi's dealer type
    const salesType = 'sales';
    
    console.log(`🔍 Testing for dealerType: ${dealerType}, salesType: ${salesType}`);
    
    // Find applicable discounts (same logic as API)
    const applicableDiscounts = await DiscountMapping.find({
      $or: [
        { targetType: 'product', targetId: product._id },
        { targetType: 'brand', targetId: product.brand._id },
        { targetType: 'category', targetId: product.category._id },
        { targetType: 'subcategory', targetId: product.subcategory._id }
      ],
      salesType: salesType,
      dealerType: dealerType,
      isActive: true
    }).sort({ priority: 1 });
    
    console.log(`📊 Applicable discounts found: ${applicableDiscounts.length}`);
    
    if (applicableDiscounts.length > 0) {
      console.log('\n✅ Applicable discounts:');
      applicableDiscounts.forEach((discount, index) => {
        console.log(`  ${index + 1}. ${discount.discountName} (${discount.targetType})`);
        console.log(`     Priority: ${discount.priority}`);
        console.log(`     Type: ${discount.discountType}`);
        console.log(`     Direct %: ${discount.directDiscountPercentage || 'N/A'}`);
      });
      
      const highestPriorityDiscount = applicableDiscounts[0];
      console.log(`\n🎯 Highest priority discount: ${highestPriorityDiscount.discountName}`);
      console.log(`   Should show in Dealer Pricing: ${highestPriorityDiscount.discountType === 'direct' || highestPriorityDiscount.discountType === 'both' ? 'YES' : 'NO'}`);
    } else {
      console.log('❌ No applicable discounts found');
      console.log('💡 This explains why discount is not showing in Dealer Pricing');
    }
    
    // 5. Check if the issue is in the Dealer Pricing filtering
    console.log('\n🔍 Step 5: Checking Dealer Pricing filtering logic...');
    
    // Check if this product would be included in Dealer Pricing results
    // This simulates the filtering logic in dealerPricingController.js
    
    console.log('🔍 Checking if product appears in Dealer Pricing results...');
    console.log('💡 The issue might be that Dealer Pricing is using the same flawed filtering logic');
    console.log('💡 that was fixed for Sales Order Dashboard');
    
    console.log('\n📋 SUMMARY:');
    console.log(`✅ Product exists: ${product.productCode} - ${product.itemName}`);
    console.log(`✅ Has basic hierarchy: Brand → Category → Subcategory (no extended)`);
    console.log(`✅ Category discounts: ${categoryDiscounts.length}`);
    console.log(`✅ Applicable discounts: ${applicableDiscounts.length}`);
    
    if (applicableDiscounts.length > 0 && categoryDiscounts.length > 0) {
      console.log('\n🚨 ISSUE CONFIRMED:');
      console.log('   - Product HAS applicable discounts');
      console.log('   - But Dealer Pricing is NOT showing them');
      console.log('   - Likely cause: Same filtering logic issue as Sales Order Dashboard');
      console.log('   - Solution: Apply the same fix to Dealer Pricing backend');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugDealerPricingDiscountIssue();