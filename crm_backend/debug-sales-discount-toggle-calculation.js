import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const debugSalesDiscountCalculation = async () => {
  try {
    console.log('🔍 Debug: Sales Discount Toggle Calculation');
    console.log('=' .repeat(60));

    // 1. Check if we have any approved sales discount mappings
    console.log('\n📊 Step 1: Checking Sales Discount Mappings...');
    const salesDiscounts = await DiscountMapping.find({
      status: 'Approved',
      isActive: true
    }).populate('brand category subcategory extendedSubcategory1 extendedSubcategory2 product');

    console.log(`Found ${salesDiscounts.length} approved sales discount mappings`);
    
    if (salesDiscounts.length === 0) {
      console.log('❌ No approved sales discount mappings found!');
      console.log('💡 This explains why no maximum discount limits are showing.');
      return;
    }

    // Show first few sales discounts
    console.log('\n📋 Sample Sales Discount Mappings:');
    salesDiscounts.slice(0, 3).forEach((discount, index) => {
      console.log(`  ${index + 1}. ${discount.discountName}`);
      console.log(`     - Type: ${discount.discountType}`);
      console.log(`     - Direct Discount: ${discount.directDiscountPercentage}%`);
      console.log(`     - Max Discount Limit: ${discount.maxDiscountPercentage}%`);
      console.log(`     - Target: ${discount.targetType}`);
      if (discount.brand) console.log(`     - Brand: ${discount.brand.name}`);
      if (discount.category) console.log(`     - Category: ${discount.category.name}`);
      if (discount.subcategory) console.log(`     - Subcategory: ${discount.subcategory.name}`);
      console.log(`     - Valid From: ${discount.validFrom}`);
      console.log(`     - Valid To: ${discount.validTo || 'No expiry'}`);
      console.log('');
    });

    // 2. Get a sample product and check if it matches any sales discounts
    console.log('\n📦 Step 2: Testing Product Matching...');
    const sampleProducts = await Product.find({}).limit(5).populate('brand category subcategory');
    
    if (sampleProducts.length === 0) {
      console.log('❌ No products found!');
      return;
    }

    console.log(`Testing with ${sampleProducts.length} sample products:`);
    
    sampleProducts.forEach((product, index) => {
      console.log(`\n  Product ${index + 1}: ${product.itemName} (${product.productCode})`);
      console.log(`    - Brand: ${product.brand?.name || 'None'} (ID: ${product.brand?._id})`);
      console.log(`    - Category: ${product.category?.name || 'None'} (ID: ${product.category?._id})`);
      console.log(`    - Subcategory: ${product.subcategory?.name || 'None'} (ID: ${product.subcategory?._id})`);
      
      // Find applicable sales discounts for this product
      const now = new Date();
      const applicableDiscounts = salesDiscounts.filter(discount => {
        // Check if discount is currently valid
        const validFrom = new Date(discount.validFrom);
        const validTo = discount.validTo ? new Date(discount.validTo) : null;
        
        if (validFrom > now || (validTo && validTo < now)) {
          return false;
        }
        
        // Check hierarchy match
        if (discount.brand && product.brand?._id && discount.brand._id.toString() === product.brand._id.toString()) {
          return true;
        }
        
        if (discount.category && product.category?._id && discount.category._id.toString() === product.category._id.toString()) {
          return true;
        }
        
        if (discount.subcategory && product.subcategory?._id && discount.subcategory._id.toString() === product.subcategory._id.toString()) {
          return true;
        }
        
        if (discount.product && discount.product._id.toString() === product._id.toString()) {
          return true;
        }
        
        return false;
      });
      
      console.log(`    - Applicable Sales Discounts: ${applicableDiscounts.length}`);
      
      if (applicableDiscounts.length > 0) {
        const discount = applicableDiscounts[0];
        console.log(`    ✅ MATCH FOUND:`);
        console.log(`       - Discount Name: ${discount.discountName}`);
        console.log(`       - Direct Discount: ${discount.directDiscountPercentage}%`);
        console.log(`       - Max Discount Limit: ${discount.maxDiscountPercentage}%`);
        console.log(`       - Match Type: ${discount.brand ? 'Brand' : discount.category ? 'Category' : discount.subcategory ? 'Subcategory' : 'Product'}`);
        
        // Test the calculation
        const purchasePrice = 1000; // Example
        const sellingPrice = 1500;   // Example
        const purchaseDiscount = 5;  // Example
        const maxDiscountLimit = discount.maxDiscountPercentage || 100;
        
        console.log(`    🧮 CALCULATION TEST:`);
        console.log(`       - Purchase Price: ₹${purchasePrice}`);
        console.log(`       - Selling Price: ₹${sellingPrice}`);
        console.log(`       - Purchase Discount: ${purchaseDiscount}%`);
        console.log(`       - Max Sales Discount Limit: ${maxDiscountLimit}%`);
        
        // Calculate with sales discount (toggle ON)
        const effectivePurchaseWithDiscount = purchasePrice - (purchasePrice * purchaseDiscount / 100);
        const effectiveSellingWithSalesDiscount = sellingPrice - (sellingPrice * maxDiscountLimit / 100);
        const marginWithSalesDiscount = ((effectiveSellingWithSalesDiscount - effectivePurchaseWithDiscount) / effectivePurchaseWithDiscount) * 100;
        
        // Calculate without sales discount (toggle OFF)
        const effectiveSellingWithoutSalesDiscount = sellingPrice;
        const marginWithoutSalesDiscount = ((effectiveSellingWithoutSalesDiscount - effectivePurchaseWithDiscount) / effectivePurchaseWithDiscount) * 100;
        
        console.log(`       - Effective Purchase Price: ₹${effectivePurchaseWithDiscount.toFixed(2)}`);
        console.log(`       - Effective Selling (WITH max discount): ₹${effectiveSellingWithSalesDiscount.toFixed(2)}`);
        console.log(`       - Effective Selling (WITHOUT max discount): ₹${effectiveSellingWithoutSalesDiscount.toFixed(2)}`);
        console.log(`       - Margin WITH max sales discount: ${marginWithSalesDiscount.toFixed(2)}%`);
        console.log(`       - Margin WITHOUT max sales discount: ${marginWithoutSalesDiscount.toFixed(2)}%`);
        
      } else {
        console.log(`    ❌ NO MATCH - No applicable sales discounts found`);
        console.log(`       - This product will show default 100% max limit`);
      }
    });

    // 3. Check if there are any dealer pricing records
    console.log('\n💰 Step 3: Checking Dealer Pricing Records...');
    const dealerPricingCount = await DealerPricing.countDocuments();
    console.log(`Found ${dealerPricingCount} dealer pricing records`);
    
    if (dealerPricingCount > 0) {
      const samplePricing = await DealerPricing.find({}).limit(3).populate('product');
      console.log('\nSample Dealer Pricing Records:');
      samplePricing.forEach((pricing, index) => {
        console.log(`  ${index + 1}. Product: ${pricing.product?.itemName || 'Unknown'}`);
        console.log(`     - Purchase Price: ₹${pricing.purchasePrice || 0}`);
        console.log(`     - Selling Price: ₹${pricing.sellingPrice || 0}`);
        console.log(`     - Has Direct Discount: ${pricing.hasDirectDiscount}`);
        console.log(`     - Direct Discount %: ${pricing.directDiscountPercentage || 0}%`);
        console.log(`     - Max Discount %: ${pricing.maxDiscountPercentage || 100}%`);
        console.log('');
      });
    }

    console.log('\n🎯 SUMMARY:');
    console.log(`- Sales Discount Mappings: ${salesDiscounts.length}`);
    console.log(`- Products Tested: ${sampleProducts.length}`);
    console.log(`- Dealer Pricing Records: ${dealerPricingCount}`);
    
    const productsWithMatches = sampleProducts.filter(product => {
      const now = new Date();
      return salesDiscounts.some(discount => {
        const validFrom = new Date(discount.validFrom);
        const validTo = discount.validTo ? new Date(discount.validTo) : null;
        
        if (validFrom > now || (validTo && validTo < now)) return false;
        
        return (discount.brand && product.brand?._id && discount.brand._id.toString() === product.brand._id.toString()) ||
               (discount.category && product.category?._id && discount.category._id.toString() === product.category._id.toString()) ||
               (discount.subcategory && product.subcategory?._id && discount.subcategory._id.toString() === product.subcategory._id.toString()) ||
               (discount.product && discount.product._id.toString() === product._id.toString());
      });
    });
    
    console.log(`- Products with Sales Discount Matches: ${productsWithMatches.length}`);
    
    if (productsWithMatches.length === 0) {
      console.log('\n❌ ISSUE IDENTIFIED: No products match any sales discount mappings!');
      console.log('💡 Possible causes:');
      console.log('   1. Sales discount mappings target different brands/categories than existing products');
      console.log('   2. Sales discount mappings have expired or not yet valid');
      console.log('   3. Product hierarchy (brand/category/subcategory) is not properly populated');
      console.log('   4. ID matching is failing due to ObjectId vs string comparison');
    } else {
      console.log(`\n✅ SUCCESS: ${productsWithMatches.length} products have applicable sales discounts`);
      console.log('💡 The toggle feature should work for these products');
    }

  } catch (error) {
    console.error('❌ Error in debug:', error);
  }
};

const main = async () => {
  await connectDB();
  await debugSalesDiscountCalculation();
  await mongoose.disconnect();
  console.log('\n🔚 Debug completed');
};

main().catch(console.error);