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

const testFrontendSalesDiscountIntegration = async () => {
  try {
    console.log('🔍 Testing Frontend Sales Discount Integration');
    console.log('=' .repeat(60));

    // 1. Simulate the API call that frontend makes
    console.log('\n📡 Step 1: Simulating Frontend API Call...');
    const apiResponse = await DiscountMapping.find({
      status: 'Approved',
      isActive: true
    })
    .populate('product', 'itemName productCode')
    .populate('brand', 'name')
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('extendedSubcategory1', 'name')
    .populate('extendedSubcategory2', 'name')
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

    console.log(`Found ${apiResponse.length} approved discount mappings`);
    
    // Filter for sales discounts only (as frontend should do)
    const salesDiscounts = apiResponse.filter(d => d.mappingType === 'sales');
    console.log(`Sales discounts: ${salesDiscounts.length} out of ${apiResponse.length} total`);

    if (salesDiscounts.length === 0) {
      console.log('❌ No sales discounts found! This explains the 100% issue.');
      return;
    }

    // 2. Test the frontend getSalesDiscountInfo logic
    console.log('\n📦 Step 2: Testing Frontend getSalesDiscountInfo Logic...');
    
    // Get sample products
    const sampleProducts = await Product.find({}).limit(5).populate('brand category subcategory');
    console.log(`Testing with ${sampleProducts.length} sample products:`);

    // Simulate frontend getApplicableSalesDiscounts function
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

    // Simulate frontend getSalesDiscountInfo function
    const getSalesDiscountInfo = (product, salesDiscounts) => {
      const applicableDiscounts = getApplicableSalesDiscounts(product, salesDiscounts);
      
      if (!applicableDiscounts.length) {
        return {
          hasDiscount: false,
          directDiscountPercentage: 0,
          maxDiscountLimit: 100, // Default max limit - THIS IS THE ISSUE!
          discountSource: null,
          discountSourceName: 'None'
        };
      }
      
      // Use the first (most recent) applicable discount
      const discount = applicableDiscounts[0];
      
      return {
        hasDiscount: true,
        directDiscountPercentage: discount.directDiscountPercentage || 0,
        maxDiscountLimit: discount.maxDiscountPercentage || 100, // This should be the actual limit!
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

    // Test each product
    sampleProducts.forEach((product, index) => {
      console.log(`\n  Product ${index + 1}: ${product.itemName} (${product.productCode})`);
      console.log(`    - Brand: ${product.brand?.name} (ID: ${product.brand?._id})`);
      console.log(`    - Category: ${product.category?.name} (ID: ${product.category?._id})`);
      console.log(`    - Subcategory: ${product.subcategory?.name} (ID: ${product.subcategory?._id})`);
      
      // Test the frontend logic
      const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
      
      console.log(`    📊 FRONTEND SALES DISCOUNT INFO:`);
      console.log(`       - Has Discount: ${salesDiscountInfo.hasDiscount}`);
      console.log(`       - Direct Discount %: ${salesDiscountInfo.directDiscountPercentage}%`);
      console.log(`       - Max Discount Limit: ${salesDiscountInfo.maxDiscountLimit}%`);
      console.log(`       - Discount Source: ${salesDiscountInfo.discountSource}`);
      console.log(`       - Source Name: ${salesDiscountInfo.discountSourceName}`);
      
      if (salesDiscountInfo.maxDiscountLimit === 100) {
        console.log(`    ❌ ISSUE: Showing default 100% max limit instead of actual limit!`);
      } else {
        console.log(`    ✅ SUCCESS: Showing actual max discount limit: ${salesDiscountInfo.maxDiscountLimit}%`);
      }
      
      // Test margin calculation with toggle
      const purchasePrice = 1000;
      const sellingPrice = 1500;
      const purchaseDiscount = 5;
      const maxDiscountLimit = salesDiscountInfo.maxDiscountLimit;
      
      // Simulate frontend calculateActualMargin function
      const calculateActualMargin = (purchasePrice, sellingPrice, purchaseDiscount, salesDiscount, includeSalesDiscount = true) => {
        if (!purchasePrice || !sellingPrice) return { margin: 0, effectivePurchase: 0, effectiveSelling: 0, profit: 0 };
        
        // Calculate effective purchase price (after purchase discount from suppliers)
        const effectivePurchase = purchasePrice - (purchasePrice * (purchaseDiscount || 0) / 100);
        
        // Calculate effective selling price (conditionally include sales discount to dealers)
        const effectiveSelling = includeSalesDiscount 
          ? sellingPrice - (sellingPrice * (salesDiscount || 0) / 100)
          : sellingPrice;
        
        // Calculate actual margin and profit
        const margin = effectivePurchase > 0 ? ((effectiveSelling - effectivePurchase) / effectivePurchase) * 100 : 0;
        const profit = effectiveSelling - effectivePurchase;
        
        return { 
          margin: margin.toFixed(2), 
          effectivePurchase: effectivePurchase.toFixed(2), 
          effectiveSelling: effectiveSelling.toFixed(2),
          profit: profit.toFixed(2)
        };
      };
      
      console.log(`    🧮 MARGIN CALCULATION TEST:`);
      console.log(`       - Purchase Price: ₹${purchasePrice}`);
      console.log(`       - Selling Price: ₹${sellingPrice}`);
      console.log(`       - Purchase Discount: ${purchaseDiscount}%`);
      console.log(`       - Max Sales Discount Limit: ${maxDiscountLimit}%`);
      
      // Calculate with sales discount (toggle ON)
      const marginWithSalesDiscount = calculateActualMargin(purchasePrice, sellingPrice, purchaseDiscount, maxDiscountLimit, true);
      
      // Calculate without sales discount (toggle OFF)
      const marginWithoutSalesDiscount = calculateActualMargin(purchasePrice, sellingPrice, purchaseDiscount, maxDiscountLimit, false);
      
      console.log(`       - Margin WITH max sales discount: ${marginWithSalesDiscount.margin}%`);
      console.log(`       - Margin WITHOUT max sales discount: ${marginWithoutSalesDiscount.margin}%`);
      console.log(`       - Sales Discount Impact: -₹${(sellingPrice * maxDiscountLimit / 100).toFixed(2)} (${maxDiscountLimit}% of selling price)`);
      
      if (maxDiscountLimit === 100) {
        console.log(`       ❌ PROBLEM: With 100% max discount, margin becomes: ${marginWithSalesDiscount.margin}%`);
      }
    });

    // 3. Test the issue with 100% default values
    console.log('\n🎯 Step 3: Analyzing the 100% Issue...');
    
    const productsWithMatches = sampleProducts.filter(product => {
      const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
      return salesDiscountInfo.hasDiscount;
    });
    
    const productsWithDefaultLimit = sampleProducts.filter(product => {
      const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
      return salesDiscountInfo.maxDiscountLimit === 100;
    });
    
    console.log(`- Products with sales discount matches: ${productsWithMatches.length}`);
    console.log(`- Products showing default 100% limit: ${productsWithDefaultLimit.length}`);
    
    if (productsWithDefaultLimit.length > 0) {
      console.log('\n❌ ROOT CAUSE IDENTIFIED:');
      console.log('   Products without matching sales discounts are showing default 100% max limit');
      console.log('   This causes the margin calculation to show 100% margin after sales discount');
      console.log('   Frontend should either:');
      console.log('   1. Not show sales discount section for products without applicable discounts');
      console.log('   2. Use a more reasonable default like 0% or hide the toggle');
    }
    
    if (productsWithMatches.length > 0) {
      console.log('\n✅ PRODUCTS WITH CORRECT LIMITS:');
      productsWithMatches.forEach(product => {
        const salesDiscountInfo = getSalesDiscountInfo(product, salesDiscounts);
        console.log(`   - ${product.itemName}: ${salesDiscountInfo.maxDiscountLimit}% max limit`);
      });
    }

    console.log('\n🔧 RECOMMENDED FIXES:');
    console.log('1. Change default maxDiscountLimit from 100 to 0 for products without applicable discounts');
    console.log('2. Only show sales discount toggle for products that have applicable sales discounts');
    console.log('3. Add better visual indicators when no sales discount is applicable');

  } catch (error) {
    console.error('❌ Error in test:', error);
  }
};

const main = async () => {
  await connectDB();
  await testFrontendSalesDiscountIntegration();
  await mongoose.disconnect();
  console.log('\n🔚 Test completed');
};

main().catch(console.error);