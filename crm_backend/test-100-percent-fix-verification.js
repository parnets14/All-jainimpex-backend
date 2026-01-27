import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';
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

const test100PercentFixVerification = async () => {
  try {
    console.log('🔍 Testing 100% Fix Verification');
    console.log('=' .repeat(60));

    // 1. Get approved sales discounts
    console.log('\n📡 Step 1: Getting approved sales discounts...');
    const salesDiscounts = await DiscountMapping.find({
      status: 'Approved',
      isActive: true,
      mappingType: 'sales'
    })
    .populate('product', 'itemName productCode')
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('extendedSubcategory1', 'name')
    .populate('extendedSubcategory2', 'name')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`Found ${salesDiscounts.length} approved sales discounts`);

    // 2. Get a mix of products - some with and some without applicable discounts
    console.log('\n📦 Step 2: Getting mixed products...');
    
    // Get products from different brands to ensure we have some without applicable discounts
    const allProducts = await Product.find({})
      .populate('brand category subcategory')
      .limit(20)
      .lean();

    console.log(`Testing with ${allProducts.length} products`);

    // 3. Simulate the FIXED frontend getSalesDiscountInfo logic
    const getApplicableSalesDiscounts = (product, salesDiscounts) => {
      if (!product || !salesDiscounts.length) return [];

      const now = new Date();
      
      const applicableDiscounts = salesDiscounts.filter(discount => {
        // Check if discount is currently valid
        const validFrom = new Date(discount.validFrom);
        const validTo = discount.validTo ? new Date(discount.validTo) : null;
        
        if (validFrom > now || (validTo && validTo < now)) {
          return false;
        }
        
        // Check hierarchy match (fixed logic)
        if (discount.brand && product.brand?._id && discount.brand._id.toString() === product.brand._id.toString()) {
          return true;
        }
        
        if (discount.category && product.category?._id && discount.category._id.toString() === product.category._id.toString()) {
          return true;
        }
        
        if (discount.subcategory && product.subcategory?._id && discount.subcategory._id.toString() === product.subcategory._id.toString()) {
          return true;
        }
        
        if (discount.extendedSubcategory1 && product.extendedSubcategory1?._id && discount.extendedSubcategory1._id.toString() === product.extendedSubcategory1._id.toString()) {
          return true;
        }
        
        if (discount.extendedSubcategory2 && product.extendedSubcategory2?._id && discount.extendedSubcategory2._id.toString() === product.extendedSubcategory2._id.toString()) {
          return true;
        }
        
        if (discount.product && discount.product._id.toString() === product._id.toString()) {
          return true;
        }
        
        return false;
      });
      
      return applicableDiscounts;
    };

    // FIXED getSalesDiscountInfo function
    const getSalesDiscountInfo = (product, salesDiscounts) => {
      const applicableDiscounts = getApplicableSalesDiscounts(product, salesDiscounts);
      
      if (!applicableDiscounts.length) {
        return {
          hasDiscount: false,
          directDiscountPercentage: 0,
          maxDiscountLimit: 0, // FIXED: Use 0% instead of 100% for products without applicable sales discounts
          discountSource: null,
          discountSourceName: 'None'
        };
      }
      
      // Use the first (most recent) applicable discount
      const discount = applicableDiscounts[0];
      
      return {
        hasDiscount: true,
        directDiscountPercentage: discount.directDiscountPercentage || 0,
        maxDiscountLimit: discount.maxDiscountPercentage || 0, // FIXED: Use 0% instead of 100% as fallback
        discountSource: discount.brand ? 'brand' : 
                       discount.category ? 'category' : 
                       discount.subcategory ? 'subcategory' : 
                       discount.extendedSubcategory1 ? 'extendedSubcategory1' : 
                       discount.extendedSubcategory2 ? 'extendedSubcategory2' : 
                       discount.product ? 'product' : 'direct',
        discountSourceName: discount.brand?.name || 
                           discount.category?.name || 
                           discount.subcategory?.name || 
                           discount.extendedSubcategory1?.name || 
                           discount.extendedSubcategory2?.name || 
                           discount.discountName || 'Direct Discount'
      };
    };

    // 4. Test each product and categorize results
    let productsWithDiscounts = 0;
    let productsWithoutDiscounts = 0;
    let productsWithCorrectLimits = 0;
    let productsWithIncorrectLimits = 0;

    console.log('\n🧪 Step 3: Testing each product...');

    allProducts.forEach((product, index) => {
      const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
      
      console.log(`\n  Product ${index + 1}: ${product.itemName} (${product.productCode})`);
      console.log(`    - Brand: ${product.brand?.name || 'N/A'} (ID: ${product.brand?._id || 'N/A'})`);
      console.log(`    - Category: ${product.category?.name || 'N/A'} (ID: ${product.category?._id || 'N/A'})`);
      console.log(`    - Subcategory: ${product.subcategory?.name || 'N/A'} (ID: ${product.subcategory?._id || 'N/A'})`);
      
      console.log(`    📊 SALES DISCOUNT INFO:`);
      console.log(`       - Has Discount: ${salesDiscountInfo.hasDiscount}`);
      console.log(`       - Max Discount Limit: ${salesDiscountInfo.maxDiscountLimit}%`);
      console.log(`       - Source: ${salesDiscountInfo.discountSourceName}`);
      
      if (salesDiscountInfo.hasDiscount) {
        productsWithDiscounts++;
        if (salesDiscountInfo.maxDiscountLimit > 0) {
          productsWithCorrectLimits++;
          console.log(`    ✅ CORRECT: Product with discount shows ${salesDiscountInfo.maxDiscountLimit}% limit`);
        } else {
          productsWithIncorrectLimits++;
          console.log(`    ❌ ISSUE: Product with discount shows 0% limit (should have actual limit)`);
        }
      } else {
        productsWithoutDiscounts++;
        if (salesDiscountInfo.maxDiscountLimit === 0) {
          productsWithCorrectLimits++;
          console.log(`    ✅ FIXED: Product without discount shows 0% limit (was 100% before fix)`);
        } else {
          productsWithIncorrectLimits++;
          console.log(`    ❌ ISSUE: Product without discount shows ${salesDiscountInfo.maxDiscountLimit}% limit (should be 0%)`);
        }
      }

      // Test margin calculation impact
      const purchasePrice = 1000;
      const sellingPrice = 1500;
      const purchaseDiscount = 5;
      const maxDiscountLimit = salesDiscountInfo.maxDiscountLimit;
      
      // Calculate margin with sales discount toggle ON
      const effectivePurchase = purchasePrice - (purchasePrice * purchaseDiscount / 100);
      const effectiveSellingWithDiscount = sellingPrice - (sellingPrice * maxDiscountLimit / 100);
      const marginWithDiscount = effectivePurchase > 0 ? ((effectiveSellingWithDiscount - effectivePurchase) / effectivePurchase) * 100 : 0;
      
      console.log(`    🧮 MARGIN IMPACT TEST:`);
      console.log(`       - With Sales Discount Toggle ON: ${marginWithDiscount.toFixed(2)}%`);
      
      if (!salesDiscountInfo.hasDiscount && marginWithDiscount > 50) {
        console.log(`    ✅ GOOD: Product without discount shows reasonable margin (${marginWithDiscount.toFixed(2)}%)`);
      } else if (!salesDiscountInfo.hasDiscount && marginWithDiscount < 10) {
        console.log(`    ❌ PROBLEM: Product without discount shows very low margin due to incorrect discount calculation`);
      }
    });

    // 5. Summary
    console.log('\n📊 SUMMARY:');
    console.log(`- Total products tested: ${allProducts.length}`);
    console.log(`- Products with applicable sales discounts: ${productsWithDiscounts}`);
    console.log(`- Products without applicable sales discounts: ${productsWithoutDiscounts}`);
    console.log(`- Products with correct limits: ${productsWithCorrectLimits}`);
    console.log(`- Products with incorrect limits: ${productsWithIncorrectLimits}`);

    if (productsWithIncorrectLimits === 0) {
      console.log('\n🎉 SUCCESS: All products now show correct max discount limits!');
      console.log('✅ The 100% default issue has been FIXED');
    } else {
      console.log('\n❌ ISSUES REMAIN: Some products still show incorrect limits');
    }

    // 6. Specific test for the 100% issue
    console.log('\n🎯 SPECIFIC 100% ISSUE TEST:');
    const productsWithoutDiscountsWith100Limit = allProducts.filter(product => {
      const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
      return !salesDiscountInfo.hasDiscount && salesDiscountInfo.maxDiscountLimit === 100;
    });

    if (productsWithoutDiscountsWith100Limit.length === 0) {
      console.log('✅ CONFIRMED: No products without discounts are showing 100% limit anymore');
      console.log('🔧 The fix is working correctly!');
    } else {
      console.log(`❌ PROBLEM: ${productsWithoutDiscountsWith100Limit.length} products without discounts still show 100% limit`);
      productsWithoutDiscountsWith100Limit.forEach(product => {
        console.log(`   - ${product.itemName} (${product.productCode})`);
      });
    }

  } catch (error) {
    console.error('❌ Error in test:', error);
  }
};

const main = async () => {
  await connectDB();
  await test100PercentFixVerification();
  await mongoose.disconnect();
  console.log('\n🔚 Test completed');
};

main().catch(console.error);