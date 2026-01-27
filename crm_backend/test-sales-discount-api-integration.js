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

const testSalesDiscountAPIIntegration = async () => {
  try {
    console.log('🔍 Testing Sales Discount API Integration');
    console.log('=' .repeat(60));

    // 1. Test the API query that the frontend uses
    console.log('\n📊 Step 1: Testing Frontend API Query...');
    const salesDiscounts = await DiscountMapping.find({
      status: 'Approved',
      isActive: true
    }).populate('brand category subcategory extendedSubcategory1 extendedSubcategory2 product');

    console.log(`Found ${salesDiscounts.length} approved sales discount mappings`);
    
    if (salesDiscounts.length === 0) {
      console.log('❌ No approved sales discount mappings found!');
      return;
    }

    // 2. Test product matching logic (same as frontend)
    console.log('\n📦 Step 2: Testing Product Matching Logic...');
    const sampleProducts = await Product.find({}).limit(3).populate('brand category subcategory');
    
    console.log(`Testing with ${sampleProducts.length} sample products:`);
    
    sampleProducts.forEach((product, index) => {
      console.log(`\n  Product ${index + 1}: ${product.itemName} (${product.productCode})`);
      console.log(`    - Brand: ${product.brand?.name} (ID: ${product.brand?._id})`);
      console.log(`    - Category: ${product.category?.name} (ID: ${product.category?._id})`);
      console.log(`    - Subcategory: ${product.subcategory?.name} (ID: ${product.subcategory?._id})`);
      
      // Apply the same matching logic as frontend
      const now = new Date();
      const applicableDiscounts = salesDiscounts.filter(discount => {
        // Check if discount is currently valid
        const validFrom = new Date(discount.validFrom);
        const validTo = discount.validTo ? new Date(discount.validTo) : null;
        
        if (validFrom > now || (validTo && validTo < now)) {
          return false;
        }
        
        // Check hierarchy match (same logic as frontend)
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
      
      console.log(`    - Applicable Sales Discounts: ${applicableDiscounts.length}`);
      
      if (applicableDiscounts.length > 0) {
        const discount = applicableDiscounts[0];
        console.log(`    ✅ SALES DISCOUNT FOUND:`);
        console.log(`       - Discount Name: ${discount.discountName}`);
        console.log(`       - Direct Discount: ${discount.directDiscountPercentage}%`);
        console.log(`       - Max Discount Limit: ${discount.maxDiscountPercentage}%`);
        console.log(`       - Match Type: ${discount.brand ? 'Brand' : discount.category ? 'Category' : discount.subcategory ? 'Subcategory' : discount.extendedSubcategory1 ? 'Extended Level 1' : discount.extendedSubcategory2 ? 'Extended Level 2' : 'Product'}`);
        
        // Test the getSalesDiscountInfo logic
        const salesDiscountInfo = {
          hasDiscount: true,
          directDiscountPercentage: discount.directDiscountPercentage || 0,
          maxDiscountLimit: discount.maxDiscountPercentage || 100,
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
        
        console.log(`    📊 SALES DISCOUNT INFO:`);
        console.log(`       - Has Discount: ${salesDiscountInfo.hasDiscount}`);
        console.log(`       - Direct Discount %: ${salesDiscountInfo.directDiscountPercentage}%`);
        console.log(`       - Max Discount Limit: ${salesDiscountInfo.maxDiscountLimit}%`);
        console.log(`       - Discount Source: ${salesDiscountInfo.discountSource}`);
        console.log(`       - Source Name: ${salesDiscountInfo.discountSourceName}`);
        
        // Test margin calculation with toggle
        const purchasePrice = 1000;
        const sellingPrice = 1500;
        const purchaseDiscount = 5;
        const maxDiscountLimit = salesDiscountInfo.maxDiscountLimit;
        
        console.log(`    🧮 MARGIN CALCULATION TEST:`);
        console.log(`       - Purchase Price: ₹${purchasePrice}`);
        console.log(`       - Selling Price: ₹${sellingPrice}`);
        console.log(`       - Purchase Discount: ${purchaseDiscount}%`);
        console.log(`       - Max Sales Discount Limit: ${maxDiscountLimit}%`);
        
        // Calculate with sales discount (toggle ON)
        const effectivePurchase = purchasePrice - (purchasePrice * purchaseDiscount / 100);
        const effectiveSellingWithSalesDiscount = sellingPrice - (sellingPrice * maxDiscountLimit / 100);
        const marginWithSalesDiscount = ((effectiveSellingWithSalesDiscount - effectivePurchase) / effectivePurchase) * 100;
        
        // Calculate without sales discount (toggle OFF)
        const effectiveSellingWithoutSalesDiscount = sellingPrice;
        const marginWithoutSalesDiscount = ((effectiveSellingWithoutSalesDiscount - effectivePurchase) / effectivePurchase) * 100;
        
        console.log(`       - Effective Purchase Price: ₹${effectivePurchase.toFixed(2)}`);
        console.log(`       - Effective Selling (WITH max discount): ₹${effectiveSellingWithSalesDiscount.toFixed(2)}`);
        console.log(`       - Effective Selling (WITHOUT max discount): ₹${effectiveSellingWithoutSalesDiscount.toFixed(2)}`);
        console.log(`       - Margin WITH max sales discount: ${marginWithSalesDiscount.toFixed(2)}%`);
        console.log(`       - Margin WITHOUT max sales discount: ${marginWithoutSalesDiscount.toFixed(2)}%`);
        console.log(`       - Sales Discount Impact: -${(sellingPrice * maxDiscountLimit / 100).toFixed(2)} (${maxDiscountLimit}% of selling price)`);
        
      } else {
        console.log(`    ❌ NO SALES DISCOUNT FOUND`);
        console.log(`       - This product will show default 100% max limit`);
        console.log(`       - Check if product hierarchy matches any discount mappings`);
      }
    });

    // 3. Test the API response format
    console.log('\n📡 Step 3: Testing API Response Format...');
    const apiResponse = {
      success: true,
      data: salesDiscounts.map(discount => ({
        _id: discount._id,
        discountName: discount.discountName,
        discountType: discount.discountType,
        mappingType: discount.mappingType,
        targetType: discount.targetType,
        directDiscountPercentage: discount.directDiscountPercentage,
        maxDiscountPercentage: discount.maxDiscountPercentage,
        brand: discount.brand,
        category: discount.category,
        subcategory: discount.subcategory,
        extendedSubcategory1: discount.extendedSubcategory1,
        extendedSubcategory2: discount.extendedSubcategory2,
        product: discount.product,
        validFrom: discount.validFrom,
        validTo: discount.validTo,
        status: discount.status,
        isActive: discount.isActive
      }))
    };
    
    console.log(`API Response Format:`);
    console.log(`- Success: ${apiResponse.success}`);
    console.log(`- Data Count: ${apiResponse.data.length}`);
    console.log(`- Sample Discount:`, JSON.stringify(apiResponse.data[0], null, 2));

    console.log('\n🎯 SUMMARY:');
    console.log(`- Sales Discount Mappings Available: ${salesDiscounts.length}`);
    console.log(`- Products Tested: ${sampleProducts.length}`);
    
    const productsWithMatches = sampleProducts.filter(product => {
      const now = new Date();
      return salesDiscounts.some(discount => {
        const validFrom = new Date(discount.validFrom);
        const validTo = discount.validTo ? new Date(discount.validTo) : null;
        
        if (validFrom > now || (validTo && validTo < now)) return false;
        
        return (discount.brand && product.brand?._id && discount.brand._id.toString() === product.brand._id.toString()) ||
               (discount.category && product.category?._id && discount.category._id.toString() === product.category._id.toString()) ||
               (discount.subcategory && product.subcategory?._id && discount.subcategory._id.toString() === product.subcategory._id.toString()) ||
               (discount.extendedSubcategory1 && product.extendedSubcategory1?._id && discount.extendedSubcategory1._id.toString() === product.extendedSubcategory1._id.toString()) ||
               (discount.extendedSubcategory2 && product.extendedSubcategory2?._id && discount.extendedSubcategory2._id.toString() === product.extendedSubcategory2._id.toString()) ||
               (discount.product && discount.product._id.toString() === product._id.toString());
      });
    });
    
    console.log(`- Products with Sales Discount Matches: ${productsWithMatches.length}`);
    
    if (productsWithMatches.length > 0) {
      console.log(`\n✅ SUCCESS: Sales discount integration should work!`);
      console.log(`💡 Frontend should show max discount limits for ${productsWithMatches.length} products`);
      console.log(`💡 Toggle feature should show margin with/without max sales discount`);
    } else {
      console.log(`\n❌ ISSUE: No products match sales discount mappings!`);
      console.log(`💡 Check product hierarchy and discount mapping targets`);
    }

  } catch (error) {
    console.error('❌ Error in test:', error);
  }
};

const main = async () => {
  await connectDB();
  await testSalesDiscountAPIIntegration();
  await mongoose.disconnect();
  console.log('\n🔚 Test completed');
};

main().catch(console.error);